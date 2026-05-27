import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { updateProject } from "@/lib/firebase/projects";
import { processStagedUpload } from "@/lib/r2/upload";
import { deleteProjectSourceFiles } from "@/lib/r2/download";
import { isValidStagingKey } from "@/lib/r2/presigned";
import { logAuthEvent } from "@/lib/firebase/auth-events";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/projects/[id]/files
 *
 * Replace ALL source files of a project with a previously-uploaded ZIP.
 * Owner / project_editor member only.
 *
 * Body: { uploadKey: "projects/_staging/uuid.zip" }
 * The uploadKey must come from POST /api/projects/upload-url
 *
 * Steps:
 *   1. Auth + canEdit check (content-level — admin excluded; admin
 *      must invite themselves as editor to upload)
 *   2. Validate uploadKey is a staging key (defense-in-depth)
 *   3. Delete all objects under projects/{id}/source/
 *   4. Stream-unzip staged ZIP from R2 → upload files to source/
 *   5. Delete staging ZIP
 *   6. Update project metadata (fileCount, totalSize)
 *   7. Log audit event (project-files-replace)
 */
type PutPayload = {
  uploadKey?: unknown;
};

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // canEdit (not canManage) — replacing files mutates project content,
  // not metadata. Admin viewing another user's project shouldn't be
  // able to overwrite their book source. See project-access.ts comment
  // for the full rationale.
  if (!access.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as PutPayload;
  const uploadKey = typeof body.uploadKey === "string" ? body.uploadKey : "";

  if (!isValidStagingKey(uploadKey)) {
    return NextResponse.json(
      { error: "Invalid uploadKey — must be from /api/projects/upload-url" },
      { status: 400 },
    );
  }

  // Snapshot previous counts before delete
  const prevFileCount = access.project.fileCount;
  const prevTotalSize = access.project.totalSize;

  // 1. Delete existing source files
  let deletedCount = 0;
  try {
    deletedCount = await deleteProjectSourceFiles(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json(
      { error: `Failed to delete old files: ${msg}` },
      { status: 500 },
    );
  }

  // 2. Process the staged upload
  let uploadResult;
  try {
    uploadResult = await processStagedUpload(id, uploadKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    await updateProject(id, { fileCount: 0, totalSize: 0 }).catch(() => {});
    return NextResponse.json(
      { error: `Upload failed after deleting old files: ${msg}` },
      { status: 500 },
    );
  }

  // 3. Update project metadata
  await updateProject(id, {
    fileCount: uploadResult.fileCount,
    totalSize: uploadResult.totalSize,
  });

  // 4. Audit log
  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "project-files-replace",
    provider: "system",
    success: true,
    projectId: id,
    projectTitle: access.project.title,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    deleted: deletedCount,
    uploaded: uploadResult,
    previous: { fileCount: prevFileCount, totalSize: prevTotalSize },
  });
}
