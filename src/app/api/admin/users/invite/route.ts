import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminApp } from "@/lib/firebase/admin";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import {
  createInvite,
  findActiveInviteForEmail,
  normalizeEmail,
} from "@/lib/firebase/invites";
import { logAuthEvent } from "@/lib/firebase/auth-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/invite
 * Body: { email: string }
 *
 * Admin-only. Creates a fresh invite and returns it (caller renders the
 * full invite URL for the admin to copy & send manually).
 *
 * Rejects if:
 * - Email already has a registered Firebase Auth account
 * - Email already has an active invite (must revoke first)
 */
export async function POST(req: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const emailRaw = typeof body.email === "string" ? body.email : "";
  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 },
    );
  }
  const email = normalizeEmail(emailRaw);

  // Already registered? — same email exists in Firebase Auth
  try {
    await getAuth(adminApp).getUserByEmail(email);
    return NextResponse.json(
      { error: "User with this email already exists" },
      { status: 409 },
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") {
      return NextResponse.json(
        { error: "Failed to check email availability" },
        { status: 500 },
      );
    }
    // user-not-found = OK to invite
  }

  // Already invited and pending?
  const existing = await findActiveInviteForEmail(email);
  if (existing) {
    return NextResponse.json(
      {
        error: "Active invite already exists for this email",
        existingToken: existing.token,
        expiresAt: existing.expiresAt.toMillis(),
      },
      { status: 409 },
    );
  }

  const invite = await createInvite({
    email,
    createdBy: profile.uid,
    createdByEmail: profile.email,
  });

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "user-invite",
    provider: "system",
    success: true,
    targetEmail: email,
    inviteToken: invite.token.slice(0, 8) + "…", // truncated for log
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    invite: {
      token: invite.token,
      email: invite.email,
      expiresAt: invite.expiresAt.toMillis(),
    },
  });
}
