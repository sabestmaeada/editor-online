import { NextResponse, type NextRequest } from "next/server";
import { getInvite } from "@/lib/firebase/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * GET /api/auth/invite/[token]
 *
 * Public endpoint — verifies that the invite token is valid and returns
 * the associated email (so the /register page can pre-fill it).
 *
 * Returns 404 for non-existent / used / expired / revoked tokens.
 * Does NOT log audit events for unauthenticated lookups (would be noisy
 * and is a guessing-attack vector). Rate limiting is the right tool here;
 * left as a v2 todo.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { token } = await ctx.params;

  const invite = await getInvite(token, { persistExpiry: true });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.status !== "active") {
    return NextResponse.json(
      { error: "Invite is not active", status: invite.status },
      { status: 410 }, // 410 Gone — semantic match for "this resource is no longer available"
    );
  }

  return NextResponse.json({
    ok: true,
    email: invite.email,
    expiresAt: invite.expiresAt.toMillis(),
  });
}
