import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { getInvite, revokeInvite } from "@/lib/firebase/invites";
import { logAuthEvent } from "@/lib/firebase/auth-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * DELETE /api/admin/users/invite/[token]
 *
 * Admin-only. Revokes an active invite. Used inviteтоkens cannot be revoked
 * (idempotent — returns 200 with status info regardless).
 */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { token } = await ctx.params;
  const existing = await getInvite(token);
  if (!existing) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  const ok = await revokeInvite(token, profile.uid);
  if (!ok) {
    return NextResponse.json(
      {
        error: `Invite cannot be revoked (current status: ${existing.status})`,
        status: existing.status,
      },
      { status: 409 },
    );
  }

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "user-invite-revoke",
    provider: "system",
    success: true,
    targetEmail: existing.email,
    inviteToken: token.slice(0, 8) + "…",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
