import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminApp } from "@/lib/firebase/admin";
import {
  getInvite,
  markInviteUsed,
  normalizeEmail,
} from "@/lib/firebase/invites";
import { createPendingProfile } from "@/lib/firebase/users";
import { logAuthEvent } from "@/lib/firebase/auth-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/register
 * Body: { token: string, displayName: string, password: string }
 *
 * Public endpoint. Consumes an invite token to register a new user.
 *
 * Server-side flow (no Firebase Client SDK auth needed):
 *  1. Verify token is active + not expired
 *  2. Validate displayName + password
 *  3. Re-check that no Firebase Auth account exists for the email
 *     (defense vs. race condition between invite creation and use)
 *  4. Admin SDK creates the Firebase Auth user
 *  5. Create Firestore profile with status="pending"
 *  6. Mark invite as used (transactional)
 *  7. Audit log
 *
 * If step 6 fails because invite was already used (race), we delete the
 * Firebase Auth user we just created to keep the state consistent.
 */
export async function POST(req: NextRequest) {
  type Payload = {
    token?: unknown;
    displayName?: unknown;
    password?: unknown;
  };
  const body = (await req.json().catch(() => ({}))) as Payload;

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  if (!displayName || displayName.length < 2 || displayName.length > 60) {
    return NextResponse.json(
      { error: "Display name must be 2-60 characters" },
      { status: 400 },
    );
  }
  // Firebase Auth requires >= 6 chars; we enforce 8 for some defense in depth.
  if (password.length < 8 || password.length > 4096) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  // 1. Verify invite
  const invite = await getInvite(token, { persistExpiry: true });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.status !== "active") {
    return NextResponse.json(
      { error: `Invite is not active (status: ${invite.status})` },
      { status: 410 },
    );
  }
  const email = normalizeEmail(invite.email);

  // 2. Defense against race: another user could have signed up
  // (or admin created the auth account manually) since the invite was issued.
  try {
    await getAuth(adminApp).getUserByEmail(email);
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") {
      return NextResponse.json(
        { error: "Failed to verify email availability" },
        { status: 500 },
      );
    }
  }

  // 3. Create Firebase Auth user
  let uid: string;
  try {
    const created = await getAuth(adminApp).createUser({
      email,
      password,
      displayName,
      emailVerified: false,
      disabled: false,
    });
    uid = created.uid;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const message =
      code === "auth/invalid-password"
        ? "Password is too weak"
        : "Failed to create account";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // 4. Create pending Firestore profile
  try {
    await createPendingProfile({ uid, email, displayName });
  } catch (err) {
    // Roll back the auth user so the invite can be retried
    await getAuth(adminApp)
      .deleteUser(uid)
      .catch(() => {});
    const msg = err instanceof Error ? err.message : "Failed to create profile";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 5. Mark invite consumed (transactional re-check guards against double-use)
  const consumed = await markInviteUsed(token, uid);
  if (!consumed) {
    // Race: invite was used/revoked/expired between steps 1 and 5.
    // Roll back everything we created.
    await getAuth(adminApp)
      .deleteUser(uid)
      .catch(() => {});
    // Firestore profile cleanup
    const { db, USERS_COLLECTION } = await import(
      "@/lib/firebase/firestore-admin"
    );
    await db
      .collection(USERS_COLLECTION)
      .doc(uid)
      .delete()
      .catch(() => {});
    return NextResponse.json(
      { error: "Invite is no longer valid" },
      { status: 410 },
    );
  }

  // 6. Audit log
  await logAuthEvent({
    headers: req.headers,
    uid,
    email,
    eventType: "user-register",
    provider: "password",
    success: true,
    inviteToken: token.slice(0, 8) + "…",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
