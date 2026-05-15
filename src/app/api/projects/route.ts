import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import {
  createProject,
  updateProject,
  deleteProjectDoc,
} from "@/lib/firebase/projects";
import { addProjectMember } from "@/lib/firebase/project-members";
import { listProjectsForUser } from "@/lib/firebase/list-my-projects";
import { processStagedUpload } from "@/lib/r2/upload";
import { deleteProjectFiles } from "@/lib/r2/download";
import { isValidStagingKey } from "@/lib/r2/presigned";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import type { ProjectMemberRole, UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CREATABLE_ROLES: UserRole[] = ["admin", "editor"];

// ────────────────────────────────────────────────────────────
// GET /api/projects — list user's projects (owned + invited)
// ────────────────────────────────────────────────────────────
export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await listProjectsForUser(profile);
  return NextResponse.json({ projects });
}

// ────────────────────────────────────────────────────────────
// POST /api/projects — create project from staged upload
// Body: { metadata: {...}, uploadKey: "projects/_staging/uuid.zip" }
// ────────────────────────────────────────────────────────────
type CreatePayload = {
  metadata?: {
    title?: unknown;
    customer?: unknown;
    pages?: unknown;
    description?: unknown;
    isbn?: unknown;
    language?: unknown;
    author?: unknown;
    edition?: unknown;
  };
  uploadKey?: unknown;
};

function asStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asInt(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 999999) return null;
  return Math.floor(n);
}

export async function POST(req: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!CREATABLE_ROLES.includes(profile.role)) {
    return NextResponse.json(
      { error: "Only editor or admin can create projects" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as CreatePayload;
  const metadata = body.metadata ?? {};
  const uploadKey = typeof body.uploadKey === "string" ? body.uploadKey : "";

  if (!isValidStagingKey(uploadKey)) {
    return NextResponse.json(
      { error: "Invalid uploadKey — must be from /api/projects/upload-url" },
      { status: 400 },
    );
  }

  const title = asStr(metadata.title);
  const customer = asStr(metadata.customer);
  const pages = asInt(metadata.pages);
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!customer) return NextResponse.json({ error: "customer required" }, { status: 400 });
  if (pages === null) return NextResponse.json({ error: "pages required" }, { status: 400 });

  // Create project + owner membership FIRST
  const project = await createProject({
    ownerUid: profile.uid,
    ownerEmail: profile.email,
    title,
    customer,
    pages,
    description: asStr(metadata.description),
    isbn: asStr(metadata.isbn),
    language: asStr(metadata.language),
    author: asStr(metadata.author),
    edition: asStr(metadata.edition),
  });

  const ownerMembershipRole: ProjectMemberRole = "project_owner";
  await addProjectMember({
    project,
    user: profile,
    role: ownerMembershipRole,
    addedBy: profile.uid,
  });

  // Process the staged upload (download from R2 → unzip → upload to source/)
  let uploadResult;
  try {
    uploadResult = await processStagedUpload(project.id, uploadKey);
  } catch (err) {
    // Roll back: delete project doc + any R2 objects already written
    await Promise.allSettled([
      deleteProjectFiles(project.id),
      deleteProjectDoc(project.id),
    ]);
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await updateProject(project.id, {
    fileCount: uploadResult.fileCount,
    totalSize: uploadResult.totalSize,
    status: "draft",
  });

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "project-create",
    provider: "system",
    success: true,
    projectId: project.id,
    projectTitle: project.title,
  }).catch(() => {});

  return NextResponse.json({
    project: {
      ...project,
      fileCount: uploadResult.fileCount,
      totalSize: uploadResult.totalSize,
    },
    upload: uploadResult,
  });
}
