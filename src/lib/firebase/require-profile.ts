import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, SESSION_COOKIE_NAME } from "./admin";
import { getUserProfile, upsertUserProfile } from "./users";
import type { UserProfile } from "@/lib/types";

export async function requireUserProfile(
  redirectPath: string,
): Promise<UserProfile> {
  const store = await cookies();
  const sessionCookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) redirect(`/login?next=${encodeURIComponent(redirectPath)}`);

  let claims;
  try {
    claims = await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch {
    redirect(`/login?next=${encodeURIComponent(redirectPath)}`);
  }

  let profile = await getUserProfile(claims.uid);
  if (!profile) {
    // Session valid but profile missing — migrate old session by creating profile now
    const result = await upsertUserProfile({
      uid: claims.uid,
      email: claims.email ?? "unknown",
      displayName:
        (typeof claims.name === "string" && claims.name) ||
        claims.email ||
        "ผู้ใช้",
      photoURL: typeof claims.picture === "string" ? claims.picture : null,
      lastLoginIp: null,
    });
    profile = result.profile;
  }

  // Gate: only "active" users may proceed. Non-active sessions are
  // forcibly logged out — we clear the cookie and bounce to /login with a
  // user-friendly error code. Pending users normally never get a session
  // cookie (the session API blocks them) but this is defense-in-depth
  // for accounts that became non-active *after* getting a cookie.
  if (profile.status !== "active") {
    store.delete(SESSION_COOKIE_NAME);
    redirect(`/login?error=status-${profile.status}`);
  }

  return profile;
}
