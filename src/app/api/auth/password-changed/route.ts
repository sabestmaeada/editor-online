import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, SESSION_COOKIE_NAME } from "@/lib/firebase/admin";
import { logAuthEvent } from "@/lib/firebase/auth-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/password-changed
 *
 * Called by the client after a successful password change via Firebase Auth.
 * This endpoint only logs an audit event — the actual password change happens
 * client-side via Firebase Auth SDK (reauthenticate + updatePassword).
 *
 * Emits `password-self-change` — distinct from `password-reset-link-issued`
 * (admin issues link) and `password-reset-link-used` (user consumes link).
 * Older audit entries may still have `password-reset`; that name is now
 * deprecated and reserved for legacy data.
 *
 * Best-effort: if logging fails, returns ok anyway — UI shouldn't block on this.
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const sessionCookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  await logAuthEvent({
    headers: req.headers,
    uid: decoded.uid,
    email: decoded.email ?? "unknown",
    eventType: "password-self-change",
    provider: "password",
    success: true,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
