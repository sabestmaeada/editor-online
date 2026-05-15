import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { updateProject } from "@/lib/firebase/projects";
import { uploadZipToProject } from "@/lib/r2/upload";
import { deleteProjectSourceFiles } from "@/lib/r2/download";
import { logAuthEvent } from "@/lib/firebase/auth-events";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/projects/[id]/files
 *
 * Replace ALL source files of a project with the contents of an uploaded ZIP.
 * Owner / admin only.
 *
 * Steps:
 *   1. Auth + canManage check
 *   2. Delete all objects under projects/{id}/source/
 *   3. Unzip + upload new files
 *   4. Update project metadata (fileCount, totalSize)
 *   5. Log audit event (project-files-replace)
 */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart body" },
      { status: 400 },
    );
  }

  const zipFile = formData.get("zip");
  if (!(zipFile instanceof File)) {
    return NextResponse.json({ error: "Missing 'zip' file" }, { status: 400 });
  }

  // Snapshot previous counts before delete (for audit)
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

  // 2. Upload new zip
  let uploadResult;
  try {
    const webStream = zipFile.stream();
    const nodeStream = Readable.fromWeb(
      webStream as unknown as Parameters<typeof Readable.fromWeb>[0],
    );
    uploadResult = await uploadZipToProject(id, nodeStream);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    // Note: previous files already deleted; project is now in inconsistent state.
    // Set fileCount=0 so UI reflects empty state.
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
