import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import {
  getOutline,
  finalizeOutlineWithJob,
} from "@/lib/firebase/outlines";
import { getTone } from "@/lib/firebase/tones";
import {
  createContentJob,
  setContentJobStatus,
} from "@/lib/firebase/content-jobs";
import { composeSystemPrompt } from "@/lib/content/compose-system-prompt";
import { flattenOutlineToChapters } from "@/lib/content/flatten-outline";
import { startContentJob, N8nContentError } from "@/lib/n8n/content";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import {
  incrementTemplateUsage,
  listTemplatesForEditor,
} from "@/lib/firebase/prompt-templates";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { validateUserText } from "@/lib/security/sanitize-user-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_CUSTOM_INSTRUCTIONS = 5_000;
const MAX_CHAPTERS = 30;
const RATE_LIMIT_PER_HOUR = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000;

// ────────────────────────────────────────────────────────────
// POST /api/projects/[id]/content/generate
//
// Phase 2 entry point. See CONTENT-GENERATION-DESIGN.md §6.1 for the
// full spec.
//
// Flow:
//   1. AuthZ — canEdit on project
//   2. Load outline (must be "ready" or "finalized" — retry allowed)
//   3. Resolve tone if outline carries a toneId
//   4. Compose systemPrompt (tone + default + custom)
//   5. Flatten outline tree → flat chapters[]
//   6. Create contentJob (status: pending)
//   7. POST to n8n
//   8. On success: flip outline → "finalized", job → "generating"
//   9. On failure: flip job → "failed", outline stays "ready"
//   10. Return { jobId, totalChapters }
// ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: projectId } = await ctx.params;

  const access = await resolveProjectAccess(profile, projectId);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit per user — content gen burns real LLM tokens.
  const limit = checkRateLimit(
    `content-generate:${profile.uid}`,
    RATE_LIMIT_PER_HOUR,
    RATE_WINDOW_MS,
  );
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  // Parse body — outlineId is optional (we ignore it for now since the
  // outline is 1-per-project under "current"); customInstructions optional;
  // generateImages defaults to false.
  let body: {
    customInstructions?: unknown;
    generateImages?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Empty body is fine — treat as no custom instructions.
    body = {};
  }
  let customInstructions: string | null = null;
  if (typeof body.customInstructions === "string") {
    // Sanitise + injection check — customInstructions is the most
    // direct path from user input → LLM as Layer 3 of the composed
    // system prompt. P2-S37.
    const v = validateUserText(body.customInstructions);
    if (!v.ok) {
      return NextResponse.json(
        { error: v.reason, code: v.code, field: "customInstructions" },
        { status: 400 },
      );
    }
    const trimmed = v.text.trim();
    if (trimmed.length > MAX_CUSTOM_INSTRUCTIONS) {
      return NextResponse.json(
        {
          error: `customInstructions must be ≤ ${MAX_CUSTOM_INSTRUCTIONS} chars`,
        },
        { status: 400 },
      );
    }
    if (trimmed.length > 0) customInstructions = trimmed;
  }
  // Image generation toggle — defaults to false (off) to keep gen
  // fast + cheap. n8n side reads this flag and conditionally runs the
  // image-gen sub-pipeline.
  const generateImages = body.generateImages === true;

  // Load outline — must exist + be in a valid state.
  const outline = await getOutline(projectId);
  if (!outline) {
    return NextResponse.json(
      { error: "Project has no outline — please generate the outline first" },
      { status: 400 },
    );
  }
  if (outline.status !== "ready" && outline.status !== "finalized") {
    return NextResponse.json(
      {
        error: `Outline is in state '${outline.status}' — must be ready or finalized`,
      },
      { status: 400 },
    );
  }

  // Flatten outline → flat chapters
  const chapters = flattenOutlineToChapters(outline.nodes);
  if (chapters.length === 0) {
    return NextResponse.json(
      { error: "Outline has no chapters to generate" },
      { status: 400 },
    );
  }
  if (chapters.length > MAX_CHAPTERS) {
    return NextResponse.json(
      {
        error: `Outline has ${chapters.length} chapters; max allowed is ${MAX_CHAPTERS}`,
      },
      { status: 400 },
    );
  }

  // Resolve tone (if outline carries a toneId)
  let tonePrompt: string | null = null;
  let toneName: string | null = null;
  const toneId = outline.formInput.toneId ?? null;
  if (toneId) {
    const tone = await getTone(toneId);
    if (!tone) {
      return NextResponse.json(
        { error: "Outline's tone no longer exists" },
        { status: 400 },
      );
    }
    if (tone.ownerUid !== profile.uid) {
      // The dropdown only lets editors pick their own tones, but a
      // different user might be triggering content gen on a project
      // whose outline was generated by someone else. Reject —
      // they should generate without tone, or transfer ownership.
      return NextResponse.json(
        {
          error:
            "Outline's tone belongs to another user — re-generate the outline without it",
        },
        { status: 400 },
      );
    }
    if (tone.status !== "active") {
      return NextResponse.json(
        {
          error:
            "Outline's tone has been archived — please choose another tone in outline",
        },
        { status: 400 },
      );
    }
    if (!tone.systemPrompt) {
      return NextResponse.json(
        { error: "Outline's tone has no samples — add at least one first" },
        { status: 400 },
      );
    }
    tonePrompt = tone.systemPrompt;
    toneName = tone.name;
  }

  // Compose final systemPrompt (3 layers) — snapshot to job doc.
  const composedSystemPrompt = composeSystemPrompt({
    tonePrompt,
    customInstructions,
  });

  // Build callback URL — n8n needs an absolute URL.
  const callbackUrl = absoluteCallbackUrl(req);
  const callbackSecret = process.env.N8N_CONTENT_SECRET ?? "";
  if (!callbackSecret) {
    return NextResponse.json(
      { error: "Server is not configured for content generation" },
      { status: 500 },
    );
  }

  // Create job (status: pending). We MUST persist the doc before
  // calling n8n so the callbacks have something to update.
  const job = await createContentJob({
    projectId,
    outlineId: "current",
    toneId,
    toneName,
    createdBy: profile.uid,
    customInstructions,
    composedSystemPrompt,
    n8nRequestId: "", // filled in after we know it
    chapters: chapters.map((c) => ({
      index: c.index,
      chapter: c.chapter,
      title: c.title,
    })),
  });

  // Audit start — fire BEFORE n8n so failed attempts leave a trail.
  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "content-generate-start",
    provider: "system",
    success: true,
    projectId,
    projectTitle: access.project.title,
    jobId: job.id,
    totalChapters: chapters.length,
  });

  // POST to n8n
  let n8nResult;
  try {
    n8nResult = await startContentJob({
      jobId: job.id,
      callbackUrl,
      callbackSecret,
      bookTitle: outline.formInput.bookTitle,
      systemPrompt: composedSystemPrompt,
      ownerUid: outline.createdBy,
      toneId,
      chapters,
      generateImages,
    });
  } catch (e) {
    // n8n failed upfront — mark job + audit. Outline stays "ready"
    // so user can retry.
    const code = e instanceof N8nContentError ? e.code : ("UNKNOWN" as const);
    const message = e instanceof Error ? e.message : "Unknown error";
    await setContentJobStatus(job.id, "failed");
    await logAuthEvent({
      headers: req.headers,
      uid: profile.uid,
      email: profile.email,
      eventType: "content-generate-failed",
      provider: "system",
      success: false,
      errorCode: code,
      projectId,
      projectTitle: access.project.title,
      jobId: job.id,
    });
    const status =
      code === "MISSING_ENV"
        ? 500
        : code === "TIMEOUT" || code === "NETWORK"
          ? 504
          : 502;
    const userMessage =
      code === "MISSING_ENV"
        ? "Server is not configured for content generation"
        : code === "TIMEOUT"
          ? "n8n took too long to respond — please retry"
          : "Content generation service failed — please retry";
    return NextResponse.json(
      {
        error: userMessage,
        code,
        detail:
          process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status },
    );
  }

  // n8n accepted — flip job to "generating" + lock outline.
  await setContentJobStatus(job.id, "generating");
  await finalizeOutlineWithJob(projectId, job.id);

  // Audit success (n8n accepted the work). content-job-complete fires
  // separately from the callback handler when all chapters finish.
  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "content-generate-success",
    provider: "system",
    success: true,
    projectId,
    projectTitle: access.project.title,
    jobId: job.id,
    totalChapters: chapters.length,
  });

  // Fire-and-forget: bump usageCount on every template whose snippet
  // appears verbatim in customInstructions. Counts "actually used in a
  // submitted job", not "clicked the chip then removed". A user-edited
  // snippet won't match — that's intentional (the template's words
  // didn't survive into the final job, so it didn't really "drive" it).
  if (customInstructions) {
    const customSnapshot = customInstructions;
    void (async () => {
      try {
        const all = await listTemplatesForEditor(profile.uid);
        const applied = all.filter(
          (t) => t.snippet && customSnapshot.includes(t.snippet),
        );
        await Promise.allSettled(
          applied.map((t) => incrementTemplateUsage(t.id)),
        );
      } catch (e) {
        // Best-effort only — never fail the submit because of usage tracking.
        console.warn("[content-generate] usageCount update failed:", e);
      }
    })();
  }

  void n8nResult; // requestId — could persist later if needed
  return NextResponse.json({
    jobId: job.id,
    totalChapters: chapters.length,
  });
}

/**
 * Build the absolute callback URL n8n will POST to. We prefer the
 * deployed VERCEL_URL env (production) over inferring from the request
 * headers (dev / preview deploys). Forge-proof since this only runs
 * server-side.
 */
function absoluteCallbackUrl(req: NextRequest): string {
  // Production: explicit env var (set in Vercel dashboard).
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) {
    return new URL("/api/content/callback", fromEnv).toString();
  }
  // Fallback: synthesise from request. Useful in local dev.
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}/api/content/callback`;
}
