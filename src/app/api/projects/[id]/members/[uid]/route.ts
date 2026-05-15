import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import {
  getProjectMember,
  removeProjectMember,
  updateMemberRole,
} from "@/lib/firebase/project-members";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import {
  INVITABLE_PROJECT_ROLES,
  type ProjectMemberRole,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; uid: string }> };

function isInvitableRole(v: unknown): v is ProjectMemberRole {
  return (
    typeof v === "string" &&
    (INVITABLE_PROJECT_ROLES as readonly string[]).includes(v)
  );
}

// ────────────────────────────────────────────────────────────
// DELETE /api/projects/[id]/members/[uid] — remove member
// ────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, uid } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (uid === access.project.ownerUid) {
    return NextResponse.json(
      { error: "Cannot remove the project owner" },
      { status: 400 },
    );
  }

  const target = await getProjectMember(id, uid);
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  await removeProjectMember(id, uid);

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "project-member-remove",
    provider: "system",
    success: true,
    projectId: id,
    projectTitle: access.project.title,
    targetUid: uid,
    targetEmail: target.email,
    oldProjectRole: target.role,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

// ────────────────────────────────────────────────────────────
// PATCH /api/projects/[id]/members/[uid] — change role
// Body: { role: "project_editor"|"project_proofreader"|"project_viewer" }
// ────────────────────────────────────────────────────────────
type PatchPayload = { role?: unknown };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, uid } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (uid === access.project.ownerUid) {
    return NextResponse.json(
      { error: "Cannot change owner role" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as PatchPayload;
  if (!isInvitableRole(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const target = await getProjectMember(id, uid);
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const { oldRole, newRole } = await updateMemberRole(id, uid, body.role);

  if (oldRole !== newRole) {
    await logAuthEvent({
      headers: req.headers,
      uid: profile.uid,
      email: profile.email,
      eventType: "project-member-role-change",
      provider: "system",
      success: true,
      projectId: id,
      projectTitle: access.project.title,
      targetUid: uid,
      targetEmail: target.email,
      oldProjectRole: oldRole,
      newProjectRole: newRole,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, oldRole, newRole });
}
