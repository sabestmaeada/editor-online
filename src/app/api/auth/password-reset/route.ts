import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminApp, SESSION_COOKIE_NAME } from "@/lib/firebase/admin";
import {
  getPasswordReset,
  markResetUsed,
} from "@/lib/firebase/password-resets";
import { getUserProfile } from "@/lib/firebase/users";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { getClientIp, truncateIp } from "@/lib/audit/ip";
import {
  RATE_LIMITS,
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/password-reset
 * Body: { token: string, password: string }
 *
 * Public endpoint. Consumes a reset token and sets a new password on the
 * Firebase Auth account.
 *
 * Flow:
 *  1. Verify token active + not expired
 *  2. Verify target user still has status="active"
 *  3. Validate password length
 *  4. Admin SDK: updateUser(uid, { password })
 *     → this also revokes all of the user's Firebase refresh tokens
 *  5. Mark reset token "used" (transactional)
 *  6. Clear our own session cookie if the caller has one (defense in depth)
 *  7. Audit log
 *
 * NOTE: We deliberately do NOT log the user in after reset. They go back
 * to /login with a success banner — same UX as other "we changed your
 * password" flows.
 */
export async function POST(req: NextRequest) {
  // Rate limit at the door — protects against token-guessing combined with
  // password setting (the "if you guess a token you own the account" attack).
  const ip = truncateIp(getClientIp(req.headers));
  const rl = checkRateLimit(
    `reset-consume:${ip}`,
    RATE_LIMITS.passwordReset.limit,
    RATE_LIMITS.passwordReset.windowMs,
  );
  const limited = rateLimitResponse(rl);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
    password?: unknown;
  };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  if (password.length < 8 || password.length > 4096) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  // 1. Verify token
  const reset = await getPasswordReset(token, { persistExpiry: true });
  if (!reset) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  if (reset.status !== "active") {
    return NextResponse.json(
      { error: `Link is not active (${reset.status})` },
      { status: 410 },
    );
  }

  // 2. Verify user still active
  const target = await getUserProfile(reset.uid);
  if (!target || target.status !== "active") {
    return NextResponse.json(
      { error: "User account is no longer active" },
      { status: 410 },
    );
  }

  // 3. Update Firebase Auth password
  try {
    await getAuth(adminApp).updateUser(reset.uid, { password });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const message =
      code === "auth/invalid-password"
        ? "Password is too weak"
        : "Failed to update password";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // 4. Consume token (transactional — protects against double-submit race)
  const consumed = await markResetUsed(token);
  if (!consumed) {
    // Extremely rare: someone else consumed the token between steps 1 and 4.
    // The Firebase password update has already happened, which is fine —
    // but log this so we know.
    await logAuthEvent({
      headers: req.headers,
      uid: reset.uid,
      email: reset.email,
      eventType: "password-reset-link-used",
      provider: "system",
      success: false,
      errorCode: "token-consumed-mid-flight",
    }).catch(() => {});
    // Still return success to the user — their password DID change.
  }

  // 5. Clear our session cookie if the caller has one (the reset page is
  // usually opened on a fresh device, so this is rare — but defense in depth).
  const store = await cookies();
  if (store.get(SESSION_COOKIE_NAME)?.value) {
    store.delete(SESSION_COOKIE_NAME);
  }

  // 6. Revoke all Firebase refresh tokens for this user. Firebase already
  // does this on password update for sessions issued before the change,
  // but call it explicitly so any subsequent verifySessionCookie() with
  // checkRevoked=true will reject any stale session cookies our server
  // issued before the reset.
  await getAuth(adminApp)
    .revokeRefreshTokens(reset.uid)
    .catch(() => {});

  // 7. Audit log
  await logAuthEvent({
    headers: req.headers,
    uid: reset.uid,
    email: reset.email,
    eventType: "password-reset-link-used",
    provider: "password",
    success: true,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
