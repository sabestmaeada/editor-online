import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, USERS_COLLECTION } from "./firestore-admin";
import { pickColorForUid } from "@/lib/colors";
import {
  DEFAULT_USER_ROLE,
  DEFAULT_USER_STATUS,
  type UserProfile,
} from "@/lib/types";

export type UpsertUserInput = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  lastLoginIp: string | null;
};

/**
 * Hydrate a raw Firestore document with defaults for fields that may be
 * missing on legacy docs (e.g. `status` was added after launch).
 * This is the canonical place where "missing status = active" is enforced.
 */
function withDefaults(raw: Record<string, unknown>): UserProfile {
  const status =
    typeof raw.status === "string" ? raw.status : DEFAULT_USER_STATUS;
  return {
    ...raw,
    status,
  } as UserProfile;
}

export async function upsertUserProfile(
  input: UpsertUserInput,
): Promise<{ profile: UserProfile; created: boolean }> {
  const ref = db.collection(USERS_COLLECTION).doc(input.uid);
  const snap = await ref.get();

  if (!snap.exists) {
    // NOTE: this path is for the *legacy* auto-create flow (user that
    // existed in Firebase Auth before Firestore was wired up). New users
    // now come through /register which calls `createPendingProfile`.
    // Default to "active" here so existing users aren't locked out.
    const now = Timestamp.now();
    const created: UserProfile = {
      uid: input.uid,
      email: input.email,
      displayName: input.displayName,
      photoURL: input.photoURL,
      trackColor: pickColorForUid(input.uid),
      role: DEFAULT_USER_ROLE,
      status: DEFAULT_USER_STATUS,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      lastLoginIp: input.lastLoginIp,
    };
    await ref.set(created);
    return { profile: created, created: true };
  }

  // Existing user. Backfill `status` if it's missing on the doc (legacy).
  const existing = snap.data() as Record<string, unknown>;
  const patch: Record<string, unknown> = {
    email: input.email,
    displayName: input.displayName,
    photoURL: input.photoURL,
    lastLoginAt: FieldValue.serverTimestamp(),
    lastLoginIp: input.lastLoginIp,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (typeof existing.status !== "string") {
    patch.status = DEFAULT_USER_STATUS;
  }
  await ref.update(patch);

  const refreshed = await ref.get();
  return {
    profile: withDefaults(refreshed.data() as Record<string, unknown>),
    created: false,
  };
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!snap.exists) return null;
  return withDefaults(snap.data() as Record<string, unknown>);
}

/**
 * Create a *pending* profile for a user that just registered via invite.
 *
 * - role defaults to "viewer" but is irrelevant while status=pending
 *   (admin picks the real role on approve).
 * - lastLoginAt is set to now even though we'll force a fresh login —
 *   this records when the account was first activated.
 *
 * Throws if a profile already exists for this uid (defensive — caller
 * should have checked).
 */
export async function createPendingProfile(input: {
  uid: string;
  email: string;
  displayName: string;
}): Promise<UserProfile> {
  const ref = db.collection(USERS_COLLECTION).doc(input.uid);
  const snap = await ref.get();
  if (snap.exists) {
    throw new Error(`Profile already exists for uid=${input.uid}`);
  }

  const now = Timestamp.now();
  const profile: UserProfile = {
    uid: input.uid,
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName.trim(),
    photoURL: null,
    trackColor: pickColorForUid(input.uid),
    role: DEFAULT_USER_ROLE,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    lastLoginIp: null,
  };
  await ref.set(profile);
  return profile;
}
