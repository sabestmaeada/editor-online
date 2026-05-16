import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { getUserProfile } from "@/lib/firebase/users";
import { createPasswordReset } from "@/lib/firebase/password-resets";
import { logAuthEvent } from "@/lib/firebase/auth-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ uid: string }> };

/**
 * POST /api/admin/users/[uid]/reset-link
 *
 * Admin-only. Issues a one-time password reset token for the target user.
 * Returns the full token so the admin can copy & send the URL manually
 * (LINE/email).
 *
 * Auto-revokes any prior active token for the same user (one active token
 * per user — keeps the audit trail clean).
 *
 * Only allowed for users with status="active". For pending/rejected users
 * there's no password to reset (or no access to grant).
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
  const target = await getUserProfile(uid);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.status !== "active") {
    return NextResponse.json(
      {
        error: `Cannot reset password for user with status "${target.status}"`,
      },
      { status: 409 },
    );
  }

  const { reset, revokedCount } = await createPasswordReset({
    uid: target.uid,
    email: target.email,
    issuedBy: caller.uid,
    issuedByEmail: caller.email,
  });

  await logAuthEvent({
    headers: req.headers,
    uid: caller.uid,
    email: caller.email,
    eventType: "password-reset-link-issued",
    provider: "system",
    success: true,
    targetUid: target.uid,
    targetEmail: target.email,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    reset: {
      token: reset.token,
      expiresAt: reset.expiresAt.toMillis(),
    },
    autoRevokedPrior: revokedCount,
  });
}
