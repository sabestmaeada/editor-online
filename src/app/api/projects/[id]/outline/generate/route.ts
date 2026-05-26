import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import {
  markOutlineGenerating,
  markOutlineFailedFromCallback,
} from "@/lib/firebase/outlines";
import { getTone } from "@/lib/firebase/tones";
import { startOutlineJob, N8nError } from "@/lib/n8n/outline";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import type { OutlineFormInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// Form field limits — UI also validates, but server is the source of truth.
const MAX_TITLE = 500;
const MAX_TEXT = 5000;
const MAX_CHAPTERS = 100;
const MAX_PAGES = 2000;

// Outline generation is expensive (LLM tokens cost real money) — cap
// per-user attempts so a runaway script can't burn through a quota.
// 5 / hour is generous for normal authoring; abuse looks very different.
const RATE_LIMIT_PER_HOUR = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

// ────────────────────────────────────────────────────────────
// POST /api/projects/[id]/outline/generate (ASYNC, P2-S41)
//
// Submits the seed form to n8n + returns immediately once n8n acks.
// The actual outline tree arrives later via /api/outline/callback,
// which flips the outline doc from "generating" → "ready" (or
// "failed"). The client UI polls the outline page until the status
// flips.
//
// Why async? Outline generation can exceed Vercel's 60s function
// timeout, especially with many chapters or a heavy tone prompt. The
// sync model previously timed out for those users.
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

  // Rate limit per user (uid), not per IP — a user generating from
  // multiple devices shouldn't get a separate budget per device.
  const limit = checkRateLimit(
    `outline-generate:${profile.uid}`,
    RATE_LIMIT_PER_HOUR,
    RATE_WINDOW_MS,
  );
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parse = parseFormInput((body as { formInput?: unknown }).formInput);
  if ("error" in parse) {
    return NextResponse.json({ error: parse.error }, { status: 400 });
  }
  let formInput = parse.formInput;

  // Resolve the tone (if user picked one). We re-fetch from Firestore
  // rather than trusting the client-sent name — and verify ownership so
  // a malicious caller can't tag their outline with someone else's tone.
  let toneSystemPrompt: string | null = null;
  if (formInput.toneId) {
    const tone = await getTone(formInput.toneId);
    if (!tone) {
      return NextResponse.json(
        { error: "Selected tone does not exist" },
        { status: 400 },
      );
    }
    if (tone.ownerUid !== profile.uid) {
      // Don't leak whether the tone exists vs. is not yours.
      return NextResponse.json(
        { error: "Selected tone does not exist" },
        { status: 400 },
      );
    }
    if (tone.status !== "active") {
      return NextResponse.json(
        { error: "Selected tone is archived" },
        { status: 400 },
      );
    }
    if (!tone.systemPrompt) {
      return NextResponse.json(
        {
          error:
            "Selected tone has no samples yet — please add at least one sample first",
        },
        { status: 400 },
      );
    }
    toneSystemPrompt = tone.systemPrompt;
    // Snapshot the name into the formInput so future viewers see what
    // tone was used even if it's renamed/deleted later.
    formInput = { ...formInput, toneName: tone.name };
  } else {
    // Clear any stale toneName from the client.
    formInput = { ...formInput, toneId: null, toneName: null };
  }

  // Build callback URL — n8n needs an absolute URL.
  const callbackUrl = absoluteCallbackUrl(req);
  const callbackSecret = process.env.N8N_OUTLINE_SECRET ?? "";
  if (!callbackSecret) {
    return NextResponse.json(
      { error: "Server is not configured for outline generation" },
      { status: 500 },
    );
  }

  // Generate the requestId used to correlate this submit with the
  // eventual callback. The id is persisted into the outline doc's
  // n8nMeta.requestId so the callback handler can reject stale
  // callbacks (user retried before original came back).
  const requestId = randomUUID();

  // Create outline doc with status="generating" BEFORE firing n8n.
  // Doing it first means callbacks can't arrive at an empty doc, and
  // the user's redirect to /outline lands on a real (in-progress) row.
  try {
    await markOutlineGenerating(projectId, {
      createdBy: profile.uid,
      formInput,
      requestId,
    });
  } catch (e) {
    console.error("[outline-generate] failed to create outline doc:", e);
    return NextResponse.json(
      { error: "Failed to persist outline state — please retry" },
      { status: 500 },
    );
  }

  // Audit start — log AFTER we have a doc so we don't leave audit
  // entries pointing at non-existent outlines.
  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "outline-generate-start",
    provider: "system",
    success: true,
    projectId,
    projectTitle: access.project.title,
  });

  // Fire the n8n webhook. We only wait for the ack — the result comes
  // back later via /api/outline/callback.
  try {
    await startOutlineJob({
      projectId,
      requestId,
      formInput,
      toneSystemPrompt,
      callbackUrl,
      callbackSecret,
    });
  } catch (e) {
    const code = e instanceof N8nError ? e.code : ("UNKNOWN" as const);
    const message = e instanceof Error ? e.message : "Unknown error";

    // Flip outline → failed so the UI surfaces what happened. We pass
    // the same requestId so this mirrors the callback path's logic.
    try {
      await markOutlineFailedFromCallback(projectId, {
        requestId,
        error: `n8n ack failed (${code}): ${message}`,
      });
    } catch {
      /* swallow — already in error path */
    }

    await logAuthEvent({
      headers: req.headers,
      uid: profile.uid,
      email: profile.email,
      eventType: "outline-generate-failed",
      provider: "system",
      success: false,
      errorCode: code,
      projectId,
      projectTitle: access.project.title,
    });

    const status =
      code === "MISSING_ENV"
        ? 500
        : code === "TIMEOUT" || code === "NETWORK"
          ? 504
          : 502;
    const userMessage =
      code === "MISSING_ENV"
        ? "Server is not configured for outline generation"
        : code === "TIMEOUT"
          ? "n8n took too long to acknowledge — please retry"
          : "Outline generation service failed — please retry";
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

  // n8n acknowledged. The actual outline-tree result will arrive at
  // /api/outline/callback and flip status → ready (or failed). Return
  // immediately — client redirects to the outline page, which polls
  // for completion.
  return NextResponse.json({
    requestId,
    status: "generating",
  });
}

/**
 * Build the absolute callback URL n8n will POST to. Prefer the
 * deployed NEXT_PUBLIC_APP_URL env (production) over inferring from
 * the request headers (dev / preview deploys). Forge-proof since this
 * only runs server-side.
 */
function absoluteCallbackUrl(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) {
    return new URL("/api/outline/callback", fromEnv).toString();
  }
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}/api/outline/callback`;
}

// ────────────────────────────────────────────────────────────
// Form input validation
// ────────────────────────────────────────────────────────────
function parseFormInput(
  raw: unknown,
): { formInput: OutlineFormInput } | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "Missing or invalid `formInput`" };
  }
  const r = raw as Record<string, unknown>;

  const bookTitle = asString(r.bookTitle);
  if (!bookTitle || bookTitle.length > MAX_TITLE) {
    return { error: "bookTitle must be 1-" + MAX_TITLE + " chars" };
  }
  const chapterCount = asInt(r.chapterCount);
  if (chapterCount === null || chapterCount < 1 || chapterCount > MAX_CHAPTERS) {
    return { error: `chapterCount must be 1-${MAX_CHAPTERS}` };
  }
  const pageCount = asInt(r.pageCount);
  if (pageCount === null || pageCount < 1 || pageCount > MAX_PAGES) {
    return { error: `pageCount must be 1-${MAX_PAGES}` };
  }
  const bookPurpose = asString(r.bookPurpose);
  if (!bookPurpose || bookPurpose.length > MAX_TEXT) {
    return { error: "bookPurpose must be 1-" + MAX_TEXT + " chars" };
  }
  const bookHighlights = asString(r.bookHighlights);
  if (!bookHighlights || bookHighlights.length > MAX_TEXT) {
    return { error: "bookHighlights must be 1-" + MAX_TEXT + " chars" };
  }
  const targetAudience = asString(r.targetAudience);
  if (!targetAudience || targetAudience.length > MAX_TEXT) {
    return { error: "targetAudience must be 1-" + MAX_TEXT + " chars" };
  }

  // toneId is optional — null / undefined / "" all mean "no tone".
  // We accept only a sane-looking string; deeper validation (ownership,
  // status, has-samples) happens after Firestore lookup in the caller.
  let toneId: string | null = null;
  if (
    typeof r.toneId === "string" &&
    r.toneId.trim().length > 0 &&
    r.toneId.length <= 100
  ) {
    toneId = r.toneId.trim();
  }

  return {
    formInput: {
      bookTitle,
      chapterCount,
      pageCount,
      bookPurpose,
      bookHighlights,
      targetAudience,
      toneId,
      toneName: null, // server fills this in after resolving the tone
    },
  };
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.floor(n);
  }
  return null;
}
