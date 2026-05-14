import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  adminAuth,
  SESSION_COOKIE_MAX_AGE_SEC,
  SESSION_COOKIE_NAME,
} from "@/lib/firebase/admin";
import { upsertUserProfile } from "@/lib/firebase/users";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { getClientIp, truncateIp } from "@/lib/audit/ip";
import type { AuthProvider } from "@/lib/types";

export const runtime = "nodejs";

function mapProvider(signInProvider: string | undefined): AuthProvider {
  if (signInProvider === "google.com") return "google";
  if (signInProvider === "password") return "password";
  return "system";
}

export async function POST(req: NextRequest) {
  const { idToken } = (await req.json().catch(() => ({}))) as {
    idToken?: string;
  };
  if (!idToken) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken, true);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "verify-failed";
    await logAuthEvent({
      headers: req.headers,
      uid: "unknown",
      email: "unknown",
      eventType: "failed-login",
      provider: "system",
      success: false,
      errorCode: code,
    }).catch(() => {});
    return NextResponse.json({ error: "Invalid idToken" }, { status: 401 });
  }

  const provider = mapProvider(decoded.firebase?.sign_in_provider);
  const email = decoded.email ?? "unknown";
  const displayName =
    (typeof decoded.name === "string" && decoded.name) ||
    decoded.email ||
    "ผู้ใช้";
  const photoURL =
    typeof decoded.picture === "string" ? decoded.picture : null;

  const rawIp = getClientIp(req.headers);
  const truncatedIp = truncateIp(rawIp);

  await upsertUserProfile({
    uid: decoded.uid,
    email,
    displayName,
    photoURL,
    lastLoginIp: truncatedIp,
  });

  const expiresIn = SESSION_COOKIE_MAX_AGE_SEC * 1000;
  let sessionCookie: string;
  try {
    sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });
  } catch {
    await logAuthEvent({
      headers: req.headers,
      uid: decoded.uid,
      email,
      eventType: "failed-login",
      provider,
      success: false,
      errorCode: "session-cookie-failed",
    }).catch(() => {});
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 401 },
    );
  }

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_COOKIE_MAX_AGE_SEC,
    path: "/",
  });

  await logAuthEvent({
    headers: req.headers,
    uid: decoded.uid,
    email,
    eventType: "login",
    provider,
    success: true,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE_NAME)?.value;

  if (existing) {
    try {
      const decoded = await adminAuth.verifySessionCookie(existing, false);
      await logAuthEvent({
        headers: req.headers,
        uid: decoded.uid,
        email: decoded.email ?? "unknown",
        eventType: "logout",
        provider: mapProvider(decoded.firebase?.sign_in_provider),
        success: true,
      }).catch(() => {});
    } catch {
      // session cookie ไม่ valid → ไม่ log
    }
  }

  store.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
