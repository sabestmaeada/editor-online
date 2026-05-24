import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, CONTENT_JOBS_COLLECTION } from "./firestore-admin";
import type {
  ContentJob,
  ContentJobStatus,
  ChapterJobItem,
  ChapterJobStatus,
} from "@/lib/types";

/**
 * Content-generation job CRUD — Phase 2.
 *
 * All callers go through `/api/projects/[id]/content/*` or
 * `/api/content/callback`. Firestore rules deny direct client access to
 * the `contentJobs` collection — security gates live in the API routes.
 */

export type CreateContentJobInput = {
  projectId: string;
  outlineId: string;
  toneId: string | null;
  toneName: string | null;
  createdBy: string;
  customInstructions: string | null;
  composedSystemPrompt: string;
  n8nRequestId: string;
  /** Initial chapter list — copied verbatim into ContentJob.chapters
   *  with status="pending". Index field on each item must match the
   *  array position (0-based). */
  chapters: Array<{
    index: number;
    chapter: string;
    title: string;
  }>;
};

/** Create a new ContentJob doc with status="pending".
 *  Caller flips it to "generating" after n8n acknowledges receipt. */
export async function createContentJob(
  input: CreateContentJobInput,
): Promise<ContentJob> {
  const now = Timestamp.now();
  const ref = db.collection(CONTENT_JOBS_COLLECTION).doc();

  const chapters: ChapterJobItem[] = input.chapters.map((c) => ({
    index: c.index,
    chapter: c.chapter,
    title: c.title,
    status: "pending",
    htmlR2Key: null,
    htmlBytes: null,
    wordCount: null,
    imageCount: null,
    error: null,
    updatedAt: now,
  }));

  const doc: ContentJob = {
    id: ref.id,
    projectId: input.projectId,
    outlineId: input.outlineId,
    toneId: input.toneId,
    toneName: input.toneName,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    customInstructions: input.customInstructions,
    composedSystemPrompt: input.composedSystemPrompt,
    status: "pending",
    totalChapters: chapters.length,
    completedChapters: 0,
    failedChapters: 0,
    n8nRequestId: input.n8nRequestId,
    chapters,
  };

  await ref.set(doc);
  return doc;
}

export async function getContentJob(jobId: string): Promise<ContentJob | null> {
  const snap = await db.collection(CONTENT_JOBS_COLLECTION).doc(jobId).get();
  if (!snap.exists) return null;
  return docToContentJob(snap.id, snap.data() ?? {});
}

/** List jobs for a project, newest first.
 *  Uses composite index (projectId + createdAt DESC + __name__). */
export async function listContentJobsByProject(
  projectId: string,
  options: { limit?: number } = {},
): Promise<ContentJob[]> {
  const limit = options.limit ?? 20;
  const snap = await db
    .collection(CONTENT_JOBS_COLLECTION)
    .where("projectId", "==", projectId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => docToContentJob(d.id, d.data() ?? {}));
}

/** Update overall job status (and bump updatedAt). Used when:
 *   - Vercel POST to n8n succeeded → "generating"
 *   - Vercel POST to n8n failed → "failed"
 *   - All chapters done (final callback) → "done" / "partial"
 */
export async function setContentJobStatus(
  jobId: string,
  status: ContentJobStatus,
): Promise<void> {
  await db.collection(CONTENT_JOBS_COLLECTION).doc(jobId).update({
    status,
    updatedAt: Timestamp.now(),
  });
}

/** Delete a single ContentJob doc. R2 cleanup is the caller's
 *  responsibility (project-level deleteProjectFiles already covers
 *  all chapter HTML under projects/{id}/content/, but manual job
 *  delete needs to call the per-job prefix cleanup itself). */
export async function deleteContentJob(jobId: string): Promise<void> {
  await db.collection(CONTENT_JOBS_COLLECTION).doc(jobId).delete();
}

/** Delete every ContentJob doc for a given project. Used by the
 *  project-delete cascade. R2 objects under `projects/{id}/content/`
 *  are wiped by `deleteProjectFiles(projectId)` since it removes the
 *  whole `projects/{id}/` prefix — we don't repeat that work here. */
export async function deleteContentJobsByProject(
  projectId: string,
): Promise<number> {
  const snap = await db
    .collection(CONTENT_JOBS_COLLECTION)
    .where("projectId", "==", projectId)
    .get();
  if (snap.empty) return 0;

  // Firestore batch limit is 500 ops; split if we ever go over.
  const docs = snap.docs;
  let deleted = 0;
  for (let i = 0; i < docs.length; i += 500) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 500)) batch.delete(d.ref);
    await batch.commit();
    deleted += Math.min(500, docs.length - i);
  }
  return deleted;
}

export type UpdateChapterInput = {
  jobId: string;
  chapterIndex: number;
  status: ChapterJobStatus;
  htmlR2Key?: string | null;
  htmlBytes?: number | null;
  wordCount?: number | null;
  imageCount?: number | null;
  error?: string | null;
};

/**
 * Atomically update one chapter in a job + increment counters.
 *
 * Counter logic (we only ever increment, never recompute):
 *   status:done   →  completedChapters += 1
 *   status:failed →  failedChapters += 1
 *   status:pending / generating → no counter change
 *
 * If `completedChapters + failedChapters === totalChapters` after this
 * update, the overall job status flips:
 *   - all done       → "done"
 *   - mixed          → "partial"
 *   - all failed     → "failed"
 *
 * Run in a transaction so concurrent callbacks (n8n might POST several
 * at once if the workflow loops in parallel) don't race.
 *
 * Returns the resulting job after the update so the caller can audit
 * the new status.
 */
export async function updateChapterAndCounters(
  input: UpdateChapterInput,
): Promise<ContentJob | null> {
  const ref = db.collection(CONTENT_JOBS_COLLECTION).doc(input.jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const job = docToContentJob(snap.id, snap.data() ?? {});

    const idx = input.chapterIndex;
    if (idx < 0 || idx >= job.chapters.length) {
      throw new Error(
        `chapterIndex ${idx} out of range (0..${job.chapters.length - 1})`,
      );
    }
    const prev = job.chapters[idx];
    const now = Timestamp.now();

    // Apply chapter-level update. We replace the whole row to keep
    // shape consistent (and so undefined→null normalisation is clear).
    const next: ChapterJobItem = {
      ...prev,
      status: input.status,
      htmlR2Key:
        input.htmlR2Key !== undefined ? input.htmlR2Key : prev.htmlR2Key,
      htmlBytes:
        input.htmlBytes !== undefined ? input.htmlBytes : prev.htmlBytes,
      wordCount:
        input.wordCount !== undefined ? input.wordCount : prev.wordCount,
      imageCount:
        input.imageCount !== undefined ? input.imageCount : prev.imageCount,
      error: input.error !== undefined ? input.error : prev.error,
      updatedAt: now,
    };
    const chapters = job.chapters.slice();
    chapters[idx] = next;

    // Counter deltas. Only transitions INTO a terminal state count;
    // if the chapter was already done/failed and now toggles, we adjust
    // both counters (rare but possible from a retry callback).
    const wasDone = prev.status === "done";
    const wasFailed = prev.status === "failed";
    const nowDone = next.status === "done";
    const nowFailed = next.status === "failed";

    const completedDelta = (nowDone ? 1 : 0) - (wasDone ? 1 : 0);
    const failedDelta = (nowFailed ? 1 : 0) - (wasFailed ? 1 : 0);

    const completedChapters = job.completedChapters + completedDelta;
    const failedChapters = job.failedChapters + failedDelta;

    // Decide overall status. We only flip OUT of "generating" once
    // every chapter is in a terminal state.
    let overall: ContentJobStatus = job.status;
    if (
      completedChapters + failedChapters >= job.totalChapters &&
      (job.status === "generating" || job.status === "pending")
    ) {
      if (failedChapters === 0) overall = "done";
      else if (completedChapters === 0) overall = "failed";
      else overall = "partial";
    }

    tx.update(ref, {
      chapters,
      completedChapters,
      failedChapters,
      status: overall,
      updatedAt: now,
    });

    return {
      ...job,
      chapters,
      completedChapters,
      failedChapters,
      status: overall,
      updatedAt: now,
    } satisfies ContentJob;
  });
}

/** Convenience helper for the callback handler — used to compute the
 *  audit "content-job-complete" trigger condition. */
export function isJobTerminal(status: ContentJobStatus): boolean {
  return status === "done" || status === "partial" || status === "failed";
}

/* ─────────────────────── helpers ─────────────────────── */

function docToContentJob(
  id: string,
  data: FirebaseFirestore.DocumentData,
): ContentJob {
  return {
    id,
    projectId: String(data.projectId ?? ""),
    outlineId: String(data.outlineId ?? ""),
    toneId: (data.toneId ?? null) as string | null,
    toneName: (data.toneName ?? null) as string | null,
    createdBy: String(data.createdBy ?? ""),
    createdAt: (data.createdAt ?? Timestamp.now()) as Timestamp,
    updatedAt: (data.updatedAt ?? Timestamp.now()) as Timestamp,
    customInstructions: (data.customInstructions ?? null) as string | null,
    composedSystemPrompt: String(data.composedSystemPrompt ?? ""),
    status: (data.status ?? "pending") as ContentJobStatus,
    totalChapters: Number(data.totalChapters ?? 0),
    completedChapters: Number(data.completedChapters ?? 0),
    failedChapters: Number(data.failedChapters ?? 0),
    n8nRequestId: String(data.n8nRequestId ?? ""),
    chapters: Array.isArray(data.chapters)
      ? (data.chapters as ChapterJobItem[])
      : [],
  };
}

// Re-export FieldValue at the bottom only if needed by callers — we
// don't use it in this module (counter logic runs inside transactions
// with explicit math), so leave it out.
void FieldValue;
