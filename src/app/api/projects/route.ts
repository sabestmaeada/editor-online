import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import {
  createProject,
  listProjectsOwnedBy,
  updateProject,
  deleteProjectDoc,
  getProject,
} from "@/lib/firebase/projects";
import {
  addProjectMember,
  listProjectsForMember,
} from "@/lib/firebase/project-members";
import { uploadZipToProject } from "@/lib/r2/upload";
import { deleteProjectFiles } from "@/lib/r2/download";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import type {
  Project,
  ProjectMemberRole,
  ProjectWithMembership,
  UserRole,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60; // seconds — for ZIP upload
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

  const [owned, memberships] = await Promise.all([
    listProjectsOwnedBy(profile.uid),
    listProjectsForMember(profile.uid),
  ]);

  // Build map: projectId -> Project (own or invited)
  const seen = new Set<string>();
  const result: ProjectWithMembership[] = [];

  for (const p of owned) {
    seen.add(p.id);
    result.push({ ...p, myRole: "owner" });
  }

  for (const m of memberships) {
    if (seen.has(m.projectId)) continue;
    const proj = await getProject(m.projectId);
    if (!proj) continue;
    result.push({ ...proj, myRole: m.role });
    seen.add(m.projectId);
  }

  result.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis());
  return NextResponse.json({ projects: result });
}

// ────────────────────────────────────────────────────────────
// POST /api/projects — create project (multipart: metadata + zip)
// ────────────────────────────────────────────────────────────
type CreatePayload = {
  title?: unknown;
  customer?: unknown;
  pages?: unknown;
  description?: unknown;
  isbn?: unknown;
  language?: unknown;
  author?: unknown;
  edition?: unknown;
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

  // Parse multipart
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart body" },
      { status: 400 },
    );
  }

  const metadataRaw = formData.get("metadata");
  const zipFile = formData.get("zip");

  if (typeof metadataRaw !== "string") {
    return NextResponse.json(
      { error: "Missing 'metadata' field" },
      { status: 400 },
    );
  }
  if (!(zipFile instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'zip' file" },
      { status: 400 },
    );
  }

  let payload: CreatePayload;
  try {
    payload = JSON.parse(metadataRaw);
  } catch {
    return NextResponse.json({ error: "Invalid metadata JSON" }, { status: 400 });
  }

  const title = asStr(payload.title);
  const customer = asStr(payload.customer);
  const pages = asInt(payload.pages);
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!customer) return NextResponse.json({ error: "customer required" }, { status: 400 });
  if (pages === null) return NextResponse.json({ error: "pages required" }, { status: 400 });

  // Create project doc + owner membership FIRST so R2 prefix is known
  const project = await createProject({
    ownerUid: profile.uid,
    ownerEmail: profile.email,
    title,
    customer,
    pages,
    description: asStr(payload.description),
    isbn: asStr(payload.isbn),
    language: asStr(payload.language),
    author: asStr(payload.author),
    edition: asStr(payload.edition),
  });

  const ownerMembershipRole: ProjectMemberRole = "owner";
  await addProjectMember({
    project,
    user: profile,
    role: ownerMembershipRole,
    addedBy: profile.uid,
  });

  // Now upload the ZIP to R2 — convert Web stream to Node stream
  let uploadResult;
  try {
    const webStream = zipFile.stream();
    const nodeStream = Readable.fromWeb(
      webStream as unknown as Parameters<typeof Readable.fromWeb>[0],
    );
    uploadResult = await uploadZipToProject(project.id, nodeStream);
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
    project: { ...project, fileCount: uploadResult.fileCount, totalSize: uploadResult.totalSize },
    upload: uploadResult,
  });
}
