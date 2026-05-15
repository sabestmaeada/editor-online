import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { getUserProfile } from "@/lib/firebase/users";
import { approveUser } from "@/lib/firebase/admin-users";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { USER_ROLES, type UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ uid: string }> };

/**
 * POST /api/admin/users/[uid]/approve
 * Body: { assignedRole: UserRole }
 *
 * Admin-only. Moves a pending user → active with the chosen role.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const caller = await getCurrentUserProfile();
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { uid } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    assignedRole?: unknown;
  };
  const assignedRole = body.assignedRole;
  if (
    typeof assignedRole !== "string" ||
    !(USER_ROLES as readonly string[]).includes(assignedRole)
  ) {
    return NextResponse.json(
      { error: "Invalid assignedRole" },
      { status: 400 },
    );
  }

  const target = await getUserProfile(uid);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    await approveUser({ uid, assignedRole: assignedRole as UserRole });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Approval failed";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  await logAuthEvent({
    headers: req.headers,
    uid: caller.uid,
    email: caller.email,
    eventType: "user-approve",
    provider: "system",
    success: true,
    targetUid: uid,
    targetEmail: target.email,
    assignedRole: assignedRole as UserRole,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
