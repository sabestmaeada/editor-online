import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import {
  addProjectMember,
  findUserByEmail,
  listMembersOfProject,
} from "@/lib/firebase/project-members";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import {
  INVITABLE_PROJECT_ROLES,
  type ProjectMemberRole,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function isInvitableRole(v: unknown): v is ProjectMemberRole {
  return (
    typeof v === "string" &&
    (INVITABLE_PROJECT_ROLES as readonly string[]).includes(v)
  );
}

// ────────────────────────────────────────────────────────────
// GET /api/projects/[id]/members
// ────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const members = await listMembersOfProject(id);
  return NextResponse.json({ members });
}

// ────────────────────────────────────────────────────────────
// POST /api/projects/[id]/members — invite by email
// Body: { email: string, role: "project_editor"|"project_proofreader"|"project_viewer" }
// ────────────────────────────────────────────────────────────
type InvitePayload = {
  email?: unknown;
  role?: unknown;
};

export async function POST(req: NextRequest, ctx: RouteContext) {
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

  const body = (await req.json().catch(() => ({}))) as InvitePayload;
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role = body.role;
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }
  if (!isInvitableRole(role)) {
    return NextResponse.json(
      {
        error:
          "Invalid role (must be project_editor / project_proofreader / project_viewer)",
      },
      { status: 400 },
    );
  }

  // Can't invite the owner
  if (email.toLowerCase() === access.project.ownerEmail.toLowerCase()) {
    return NextResponse.json(
      { error: "User is already the project owner" },
      { status: 400 },
    );
  }

  // Lookup user
  const target = await findUserByEmail(email);
  if (!target) {
    return NextResponse.json(
      { error: "User not found — they must register first" },
      { status: 404 },
    );
  }

  const result = await addProjectMember({
    project: access.project,
    user: target,
    role,
    addedBy: profile.uid,
  });

  if (!result.created) {
    return NextResponse.json(
      { error: "User is already a member" },
      { status: 409 },
    );
  }

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "project-member-invite",
    provider: "system",
    success: true,
    projectId: id,
    projectTitle: access.project.title,
    targetUid: target.uid,
    targetEmail: target.email,
    newProjectRole: role,
  }).catch(() => {});

  return NextResponse.json({ member: result.member });
}
