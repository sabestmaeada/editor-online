import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { presignZipUpload } from "@/lib/r2/presigned";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREATABLE_ROLES: UserRole[] = ["admin", "editor"];

/**
 * POST /api/projects/upload-url
 *
 * Generates a presigned PUT URL so the browser can upload a ZIP directly to R2,
 * bypassing Vercel's request body size limit.
 *
 * Body: { purpose: "create" | "replace", projectId?: string }
 *
 * - purpose=create   → caller must have global role editor/admin
 * - purpose=replace  → caller must be admin/owner of the given projectId
 *
 * Returns: { uploadKey, uploadUrl, expiresAt }
 */
type Payload = {
  purpose?: unknown;
  projectId?: unknown;
};

export async function POST(req: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Payload;
  const purpose = body.purpose;

  if (purpose === "create") {
    if (!CREATABLE_ROLES.includes(profile.role)) {
      return NextResponse.json(
        { error: "Only editor or admin can create projects" },
        { status: 403 },
      );
    }
  } else if (purpose === "replace") {
    const pid = typeof body.projectId === "string" ? body.projectId : "";
    if (!pid) {
      return NextResponse.json(
        { error: "projectId required for replace" },
        { status: 400 },
      );
    }
    const access = await resolveProjectAccess(profile, pid);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    return NextResponse.json(
      { error: "Invalid purpose (must be 'create' or 'replace')" },
      { status: 400 },
    );
  }

  const { uploadKey, uploadUrl, expiresAt } = await presignZipUpload();

  return NextResponse.json({ uploadKey, uploadUrl, expiresAt });
}
