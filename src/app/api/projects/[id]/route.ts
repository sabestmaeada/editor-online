import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import {
  updateProject,
  deleteProjectDoc,
} from "@/lib/firebase/projects";
import {
  listMembersOfProject,
  removeProjectMember,
} from "@/lib/firebase/project-members";
import { deleteProjectFiles, listProjectFiles } from "@/lib/r2/download";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function isValidStatus(v: unknown): v is ProjectStatus {
  return typeof v === "string" && (PROJECT_STATUSES as readonly string[]).includes(v);
}

// ────────────────────────────────────────────────────────────
// GET /api/projects/[id] — details (project + files + members)
// ────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const access = await resolveProjectAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [files, members] = await Promise.all([
    listProjectFiles(id),
    listMembersOfProject(id),
  ]);

  return NextResponse.json({
    project: access.project,
    files,
    members,
    permissions: {
      isAdmin: access.isAdmin,
      isOwner: access.isOwner,
      canManage: access.canManage,
      canEdit: access.canEdit,
      canDownload: access.canDownload,
      myRole:
        access.membership?.role ?? (access.isOwner ? "project_owner" : null),
    },
  });
}

// ────────────────────────────────────────────────────────────
// PATCH /api/projects/[id] — update metadata (owner/admin only)
// ────────────────────────────────────────────────────────────
type UpdatePayload = {
  title?: unknown;
  customer?: unknown;
  pages?: unknown;
  description?: unknown;
  isbn?: unknown;
  language?: unknown;
  author?: unknown;
  edition?: unknown;
  status?: unknown;
};

function asStr(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as UpdatePayload;
  const update: Record<string, unknown> = {};

  const fields: (keyof UpdatePayload)[] = [
    "title",
    "customer",
    "description",
    "isbn",
    "language",
    "author",
    "edition",
  ];
  for (const f of fields) {
    const v = asStr(body[f]);
    if (v !== undefined) update[f] = v;
  }

  if (body.pages !== undefined) {
    const n =
      typeof body.pages === "string"
        ? Number(body.pages)
        : typeof body.pages === "number"
          ? body.pages
          : NaN;
    if (Number.isFinite(n) && n >= 0 && n < 999999) {
      update.pages = Math.floor(n);
    }
  }

  if (body.status !== undefined) {
    if (!isValidStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  // title required (can't blank it out)
  if (update.title === null) {
    return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  }
  if (update.customer === null) {
    return NextResponse.json({ error: "customer cannot be empty" }, { status: 400 });
  }

  await updateProject(id, update);

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "project-update",
    provider: "system",
    success: true,
    projectId: id,
    projectTitle: access.project.title,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

// ────────────────────────────────────────────────────────────
// DELETE /api/projects/[id] — owner/admin only, hard delete in v1
// ────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Delete R2 objects (best effort)
  const deletedCount = await deleteProjectFiles(id).catch(() => 0);

  // 2. Delete project members
  const members = await listMembersOfProject(id);
  await Promise.all(
    members.map((m) =>
      removeProjectMember(id, m.uid).catch(() => undefined),
    ),
  );

  // 3. Delete project doc
  await deleteProjectDoc(id);

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "project-delete",
    provider: "system",
    success: true,
    projectId: id,
    projectTitle: access.project.title,
  }).catch(() => {});

  return NextResponse.json({ ok: true, deletedFiles: deletedCount });
}
