import { NextResponse, type NextRequest } from "next/server";
import { getInvite } from "@/lib/firebase/invites";
import { getClientIp, truncateIp } from "@/lib/audit/ip";
import {
  RATE_LIMITS,
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";

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
 * and is a guessing-attack vector). Rate limiting blocks scanning attempts.
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const ip = truncateIp(getClientIp(req.headers));
  const rl = checkRateLimit(
    `invite-verify:${ip}`,
    RATE_LIMITS.tokenVerify.limit,
    RATE_LIMITS.tokenVerify.windowMs,
  );
  const limited = rateLimitResponse(rl);
  if (limited) return limited;

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
