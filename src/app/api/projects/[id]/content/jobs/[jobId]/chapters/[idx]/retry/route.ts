import { NextResponse, type NextRequest } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import {
  getContentJob,
  resetChapterForRetry,
} from "@/lib/firebase/content-jobs";
import { getOutline } from "@/lib/firebase/outlines";
import { flattenOutlineToChapters } from "@/lib/content/flatten-outline";
import { startContentJob, N8nContentError } from "@/lib/n8n/content";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { r2, R2_BUCKET } from "@/lib/r2/client";
import type { FlatChapter } from "@/lib/content/flatten-outline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; jobId: string; idx: string }>;
};

// Retry is cheap relative to whole-job submit (1 chapter, not N) so we
// allow more attempts per hour. Still capped to discourage spamming
// against a deterministically-broken upstream.
const RATE_LIMIT_PER_HOUR = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

// ────────────────────────────────────────────────────────────
// POST /api/projects/[id]/content/jobs/[jobId]/chapters/[idx]/retry
//
// Re-fire n8n for a single failed chapter. Reuses the existing job's
// systemPrompt + tone + callback config — only the chapters[] payload
// shrinks to one item.
//
// Pre-conditions:
//   - chapter status must be "failed" (silently no-ops otherwise)
//   - user must have canEdit on the project
//   - rate limit not exceeded
//
// Post-conditions:
//   - chapter status → "pending"
//   - job.failedChapters → -1
//   - job.status → "generating" (back from partial/failed/done)
//   - old R2 HTML object cleaned up (best-effort, fire-and-forget)
//   - n8n re-fired with chapters: [singleChapter]
//
// Audit:
//   - content-chapter-retry on success/failure
// ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: projectId, jobId, idx } = await ctx.params;

  const access = await resolveProjectAccess(profile, projectId);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse chapter index
  const chapterIndex = Number.parseInt(idx, 10);
  if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
    return NextResponse.json(
      { error: "Invalid chapter index" },
      { status: 400 },
    );
  }

  // Rate limit
  const limit = checkRateLimit(
    `content-chapter-retry:${profile.uid}`,
    RATE_LIMIT_PER_HOUR,
    RATE_WINDOW_MS,
  );
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  // Load job — verify projectId match + ownership.
  const existing = await getContentJob(jobId);
  if (!existing || existing.projectId !== projectId) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  // Allow project editors to retry (same surface as generate) — don't
  // tie to createdBy strictly. If you want stricter ownership, swap to:
  // `if (existing.createdBy !== profile.uid)`.

  // Validate the chapter is in a retryable state BEFORE we touch n8n.
  // The reset helper double-checks inside the transaction (race-safe),
  // but pre-checking gives nicer error messages.
  const targetBefore = existing.chapters[chapterIndex];
  if (!targetBefore) {
    return NextResponse.json(
      { error: `Chapter ${chapterIndex} does not exist on this job` },
      { status: 404 },
    );
  }
  if (targetBefore.status !== "failed") {
    return NextResponse.json(
      {
        error: `Chapter is in '${targetBefore.status}' state — only failed chapters can be retried`,
      },
      { status: 400 },
    );
  }

  // Resolve content + topics. Prefer the job-level snapshot (frozen at
  // submit time, consistent with sibling chapters). Fall back to the
  // outline only when the snapshot is missing (old jobs created before
  // P2-S47 added these fields).
  let chapterContent = targetBefore.content;
  let chapterTopics = targetBefore.topics;
  if (chapterContent === undefined || chapterTopics === undefined) {
    const outline = await getOutline(projectId);
    if (!outline) {
      return NextResponse.json(
        {
          error:
            "This job pre-dates the retry feature and the outline is no longer available — please create a new content job instead",
        },
        { status: 400 },
      );
    }
    const flat = flattenOutlineToChapters(outline.nodes);
    const match = flat.find((c) => c.index === chapterIndex);
    if (!match) {
      return NextResponse.json(
        {
          error:
            "Outline has changed since this job was created — chapter index no longer matches; please create a new job",
        },
        { status: 400 },
      );
    }
    chapterContent = match.content;
    chapterTopics = match.topics;
  }

  // Build callback URL — same as initial generate.
  const callbackUrl = absoluteCallbackUrl(req);
  const callbackSecret = process.env.N8N_CONTENT_SECRET ?? "";
  if (!callbackSecret) {
    return NextResponse.json(
      { error: "Server is not configured for content generation" },
      { status: 500 },
    );
  }

  // Project title for n8n's prompt assembly — same source as initial
  // submit (project doc).
  const bookTitle = access.project.title;

  // Atomically reset the chapter state. Race-safe inside transaction:
  // a concurrent callback flipping the same chapter would either land
  // before this reset (we then move forward and retry as planned) or
  // after (the late callback would target our newly-pending chapter
  // and the counter math still works out).
  const reset = await resetChapterForRetry({ jobId, chapterIndex });
  if (!reset.ok) {
    const status =
      reset.reason === "not-found" || reset.reason === "out-of-range"
        ? 404
        : 400;
    const message =
      reset.reason === "not-found"
        ? "Job disappeared mid-request"
        : reset.reason === "out-of-range"
          ? "Chapter index out of range"
          : "Chapter is no longer in 'failed' state — refresh and try again";
    return NextResponse.json({ error: message }, { status });
  }

  // Build single-chapter payload. Mirrors `flattenOutlineToChapters`
  // shape — n8n's "เตรียม chapters สำหรับ Loop" Code node treats this
  // as a normal one-item job.
  const flatChapter: FlatChapter = {
    index: chapterIndex,
    chapter: targetBefore.chapter,
    title: targetBefore.title,
    content: chapterContent,
    topics: chapterTopics,
  };

  // Audit start — log BEFORE n8n so failed n8n calls leave a trail.
  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "content-chapter-retry",
    provider: "system",
    success: true,
    projectId,
    projectTitle: access.project.title,
    jobId,
    chapterIndex,
  });

  // POST to n8n.
  try {
    await startContentJob({
      jobId,
      callbackUrl,
      callbackSecret,
      bookTitle,
      systemPrompt: existing.composedSystemPrompt,
      ownerUid: existing.createdBy,
      toneId: existing.toneId,
      chapters: [flatChapter],
      // Re-fire with images off by default — if the original job had
      // image-gen on and you want it for retry, we'd need to snapshot
      // that flag on the job doc. For now, keep retry fast + cheap.
      generateImages: false,
    });
  } catch (e) {
    // Re-fire failed — flip chapter BACK to failed so the UI doesn't
    // show a stuck "pending" forever. We mark it failed via the same
    // helper used by callback (status=failed + error). Easiest: do it
    // directly via setContentJobStatus + chapter patch.
    const code =
      e instanceof N8nContentError ? e.code : ("UNKNOWN" as const);
    const message = e instanceof Error ? e.message : "Unknown error";

    // Best-effort: re-mark chapter as failed so UI surfaces the retry
    // failure. We use the same updateChapterAndCounters path the
    // callback uses, which handles the pending → failed transition.
    try {
      const { updateChapterAndCounters } = await import(
        "@/lib/firebase/content-jobs"
      );
      await updateChapterAndCounters({
        jobId,
        chapterIndex,
        status: "failed",
        error: `Retry failed (${code}): ${message}`.slice(0, 500),
      });
    } catch {
      /* swallow */
    }

    await logAuthEvent({
      headers: req.headers,
      uid: profile.uid,
      email: profile.email,
      eventType: "content-chapter-retry",
      provider: "system",
      success: false,
      errorCode: code,
      projectId,
      projectTitle: access.project.title,
      jobId,
      chapterIndex,
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

  // n8n accepted — clean up the stale R2 HTML (fire-and-forget). We
  // do this AFTER the ack so if n8n call fails we still have the old
  // HTML for the user to download. New HTML will overwrite the same
  // key when the callback lands.
  if (reset.previousR2Key) {
    const oldKey = reset.previousR2Key;
    void (async () => {
      try {
        await r2().send(
          new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: oldKey }),
        );
      } catch (e) {
        // Non-fatal — the callback will overwrite the same key anyway
        // if it lands. Worst case: a tiny orphan if retry never
        // succeeds.
        console.warn(
          "[content-retry] stale R2 cleanup failed (non-fatal):",
          oldKey,
          e,
        );
      }
    })();
  }

  return NextResponse.json({
    ok: true,
    jobId,
    chapterIndex,
    status: "pending",
  });
}

/** Same as content/generate route — keep them in sync. */
function absoluteCallbackUrl(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) {
    return new URL("/api/content/callback", fromEnv).toString();
  }
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}/api/content/callback`;
}
