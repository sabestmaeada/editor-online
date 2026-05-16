import { NextResponse, type NextRequest } from "next/server";
import { getPasswordReset } from "@/lib/firebase/password-resets";
import { getUserProfile } from "@/lib/firebase/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * GET /api/auth/password-reset/[token]
 *
 * Public endpoint — verifies that the reset token is valid AND that the
 * target user is still in "active" status (admin may have rejected/disabled
 * the user between issuing and using the token).
 *
 * Returns minimal info: ok + email (for display on the reset form).
 *
 * Same security stance as the invite-verify endpoint: no audit log for
 * unauthenticated lookups (would be very noisy + token-guessing vector).
 * Rate-limit later if it becomes a problem.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { token } = await ctx.params;

  const reset = await getPasswordReset(token, { persistExpiry: true });
  if (!reset) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  if (reset.status !== "active") {
    return NextResponse.json(
      { error: "Link is not active", status: reset.status },
      { status: 410 },
    );
  }

  // The user may have been rejected/disabled after the token was issued.
  const target = await getUserProfile(reset.uid);
  if (!target || target.status !== "active") {
    return NextResponse.json(
      { error: "Link is no longer valid", status: "user-not-active" },
      { status: 410 },
    );
  }

  return NextResponse.json({
    ok: true,
    email: reset.email,
    expiresAt: reset.expiresAt.toMillis(),
  });
}
