import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import {
  deleteContentJob,
  getContentJob,
} from "@/lib/firebase/content-jobs";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { r2, R2_BUCKET, contentChapterKey } from "@/lib/r2/client";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; jobId: string }>;
};

// ────────────────────────────────────────────────────────────
// GET /api/projects/[id]/content/jobs/[jobId]
//
// Returns the full ContentJob doc for UI polling. Any project member
// can read (read-only) — write paths are /content/generate (auth:
// canEdit) and /content/callback (auth: shared secret).
// ────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: projectId, jobId } = await ctx.params;

  // Project access — any member can view jobs of their project.
  const access = await resolveProjectAccess(profile, projectId);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const job = await getContentJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Guard: job must belong to the project in the URL — prevents one
  // project's members from reading another project's job by guessing
  // the jobId.
  if (job.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}

// ────────────────────────────────────────────────────────────
// DELETE /api/projects/[id]/content/jobs/[jobId]
//
// Remove a content job + every chapter's HTML from R2. Auth:
// project member with canEdit (same gate as "trigger generate").
//
// We don't restrict by job status — even an "in-progress" job can be
// cancelled this way (any subsequent n8n callback will 404 silently).
// ────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: projectId, jobId } = await ctx.params;

  const access = await resolveProjectAccess(profile, projectId);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const job = await getContentJob(jobId);
  if (!job || job.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 1. Delete R2 objects for every chapter that has one. We don't
  //    use a prefix scan — we know exact keys from the job doc, which
  //    is cheaper + safer (no risk of accidentally touching unrelated
  //    objects).
  const keysToDelete = job.chapters
    .filter((c) => c.htmlR2Key)
    .map((c) => ({ Key: c.htmlR2Key as string }));
  // ChapterJobItem might also live at the predictable path even if
  // htmlR2Key is null (e.g. partial upload mid-callback). Belt-and-
  // braces: include the deterministic key as a fallback.
  for (const c of job.chapters) {
    if (!c.htmlR2Key) {
      keysToDelete.push({
        Key: contentChapterKey(projectId, jobId, c.index),
      });
    }
  }

  let r2Deleted = 0;
  if (keysToDelete.length > 0) {
    try {
      const out = await r2().send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: { Objects: keysToDelete, Quiet: true },
        }),
      );
      r2Deleted =
        (out.Deleted?.length ?? 0) + (keysToDelete.length - (out.Errors?.length ?? 0));
    } catch (e) {
      // R2 failure should not block Firestore cleanup — log and
      // continue. Orphan blobs will be picked up by a future sweep.
      console.warn("[content-job-delete] R2 delete failed:", e);
    }
  }

  // 2. Delete Firestore doc
  await deleteContentJob(jobId);

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "content-generate-failed",
    provider: "system",
    success: true,
    errorCode: "JOB_DELETED",
    projectId,
    projectTitle: access.project.title,
    jobId,
  }).catch(() => {});

  return NextResponse.json({ ok: true, r2Deleted });
}
