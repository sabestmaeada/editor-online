import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  getContentJob,
  updateChapterAndCounters,
  isJobTerminal,
} from "@/lib/firebase/content-jobs";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { db, USERS_COLLECTION } from "@/lib/firebase/firestore-admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  AUTH_EVENTS_COLLECTION,
  PROJECTS_COLLECTION,
} from "@/lib/firebase/firestore-admin";
import { RETENTION_DAYS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────
// POST /api/content/callback
//
// Server-to-server endpoint hit by n8n once per chapter (success or
// failure). No user session — auth is the shared secret.
//
// See CONTENT-GENERATION-DESIGN.md §4.4 for the request shape.
// ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Verify shared secret (constant-time)
  const secretHeader = req.headers.get("x-content-secret") ?? "";
  const expected = process.env.N8N_CONTENT_SECRET ?? "";
  if (!expected) {
    console.error("[content-callback] N8N_CONTENT_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }
  if (!constantTimeEqual(secretHeader, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = parseCallbackBody(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const parsed = result.data;

  // 3. Load job + sanity check
  const existing = await getContentJob(parsed.jobId);
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // 4. Apply update transactionally
  let updated;
  try {
    updated = await updateChapterAndCounters({
      jobId: parsed.jobId,
      chapterIndex: parsed.chapterIndex,
      status: parsed.status,
      htmlDriveId: parsed.htmlDriveId,
      htmlDriveUrl: parsed.htmlDriveUrl,
      wordCount: parsed.wordCount,
      imageCount: parsed.imageCount,
      error: parsed.error,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Failed to update chapter",
      },
      { status: 400 },
    );
  }
  if (!updated) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // 5. Audit — fire after Firestore commit
  await logCallbackAudit({
    uid: existing.createdBy,
    eventType:
      parsed.status === "done"
        ? "content-chapter-done"
        : "content-chapter-failed",
    projectId: existing.projectId,
    jobId: parsed.jobId,
    chapterIndex: parsed.chapterIndex,
    success: parsed.status === "done",
    errorCode: parsed.status === "failed" ? "CHAPTER_FAILED" : null,
  });

  if (
    isJobTerminal(updated.status) &&
    !isJobTerminal(existing.status) // only fire ONCE on transition
  ) {
    await logCallbackAudit({
      uid: existing.createdBy,
      eventType: "content-job-complete",
      projectId: existing.projectId,
      jobId: parsed.jobId,
      success: updated.status === "done",
      totalChapters: updated.totalChapters,
    });
  }

  return NextResponse.json({ ok: true, jobStatus: updated.status });
}

/* ───────────────────── parsing ───────────────────── */

type ParsedCallback = {
  jobId: string;
  chapterIndex: number;
  status: "done" | "failed";
  htmlDriveId: string | null;
  htmlDriveUrl: string | null;
  wordCount: number | null;
  imageCount: number | null;
  error: string | null;
};

type ParseResult =
  | { ok: true; data: ParsedCallback }
  | { ok: false; error: string };

function parseCallbackBody(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Body must be an object" };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.jobId !== "string" || r.jobId.length === 0) {
    return { ok: false, error: "jobId is required" };
  }
  const chapterIndex =
    typeof r.chapterIndex === "number" ? r.chapterIndex : -1;
  if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
    return {
      ok: false,
      error: "chapterIndex must be a non-negative integer",
    };
  }
  if (r.status !== "done" && r.status !== "failed") {
    return { ok: false, error: "status must be 'done' or 'failed'" };
  }

  return {
    ok: true,
    data: {
      jobId: r.jobId,
      chapterIndex,
      status: r.status,
      htmlDriveId: typeof r.htmlDriveId === "string" ? r.htmlDriveId : null,
      htmlDriveUrl:
        typeof r.htmlDriveUrl === "string" ? r.htmlDriveUrl : null,
      wordCount:
        typeof r.wordCount === "number" && Number.isFinite(r.wordCount)
          ? r.wordCount
          : null,
      imageCount:
        typeof r.imageCount === "number" && Number.isFinite(r.imageCount)
          ? r.imageCount
          : null,
      error: typeof r.error === "string" ? r.error.slice(0, 500) : null,
    },
  };
}

/* ───────────────────── helpers ───────────────────── */

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Lightweight audit log writer for the callback flow.
 *
 * `logAuthEvent` requires a `headers` reader to extract IP / UA — but
 * n8n callbacks don't carry real client info (they come from n8n's
 * cloud IP). We synthesise an event directly so the audit log shows
 * who OWNED the job, not who made the HTTP request.
 */
async function logCallbackAudit(input: {
  uid: string;
  eventType:
    | "content-chapter-done"
    | "content-chapter-failed"
    | "content-job-complete";
  projectId: string;
  jobId: string;
  chapterIndex?: number;
  totalChapters?: number;
  success: boolean;
  errorCode?: string | null;
}) {
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + RETENTION_DAYS[input.eventType] * 24 * 60 * 60 * 1000,
  );

  // Fetch user email + project title for nicer audit display. These
  // are best-effort — if they fail, we still log the event with empty
  // strings rather than blocking the callback.
  let email = "";
  let projectTitle = "";
  try {
    const userSnap = await db
      .collection(USERS_COLLECTION)
      .doc(input.uid)
      .get();
    email = String(userSnap.data()?.email ?? "");
    const projSnap = await db
      .collection(PROJECTS_COLLECTION)
      .doc(input.projectId)
      .get();
    projectTitle = String(projSnap.data()?.title ?? "");
  } catch {
    /* swallow — audit is best-effort */
  }

  await db.collection(AUTH_EVENTS_COLLECTION).add({
    uid: input.uid,
    email,
    eventType: input.eventType,
    provider: "system",
    ip: "0.0.0.0",
    ipHash: "n8n-callback",
    userAgent: "n8n-callback",
    country: null,
    region: null,
    city: null,
    success: input.success,
    errorCode: input.errorCode ?? null,
    projectId: input.projectId,
    projectTitle,
    jobId: input.jobId,
    ...(input.chapterIndex !== undefined
      ? { chapterIndex: input.chapterIndex }
      : {}),
    ...(input.totalChapters !== undefined
      ? { totalChapters: input.totalChapters }
      : {}),
    timestamp: now,
    expiresAt,
  });
}

// Silence linter — we re-exported these via the audit log helper above
// rather than calling logAuthEvent (which requires HTTP request headers
// we don't have here).
void logAuthEvent;
