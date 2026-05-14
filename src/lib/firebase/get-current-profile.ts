import "server-only";
import { cookies } from "next/headers";
import { adminAuth, SESSION_COOKIE_NAME } from "./admin";
import { getUserProfile, upsertUserProfile } from "./users";
import type { UserProfile } from "@/lib/types";

/**
 * Read current user profile without redirecting.
 * Returns null when there is no valid session — safe to use on public pages.
 */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const store = await cookies();
  const sessionCookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  let claims;
  try {
    claims = await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }

  let profile = await getUserProfile(claims.uid);
  if (!profile) {
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

  return profile;
}
