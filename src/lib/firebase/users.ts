import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, USERS_COLLECTION } from "./firestore-admin";
import { pickColorForUid } from "@/lib/colors";
import { DEFAULT_USER_ROLE, type UserProfile } from "@/lib/types";

export type UpsertUserInput = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  lastLoginIp: string | null;
};

export async function upsertUserProfile(
  input: UpsertUserInput,
): Promise<{ profile: UserProfile; created: boolean }> {
  const ref = db.collection(USERS_COLLECTION).doc(input.uid);
  const snap = await ref.get();

  if (!snap.exists) {
    const now = Timestamp.now();
    const created: UserProfile = {
      uid: input.uid,
      email: input.email,
      displayName: input.displayName,
      photoURL: input.photoURL,
      trackColor: pickColorForUid(input.uid),
      role: DEFAULT_USER_ROLE,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      lastLoginIp: input.lastLoginIp,
    };
    await ref.set(created);
    return { profile: created, created: true };
  }

  await ref.update({
    email: input.email,
    displayName: input.displayName,
    photoURL: input.photoURL,
    lastLoginAt: FieldValue.serverTimestamp(),
    lastLoginIp: input.lastLoginIp,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const refreshed = await ref.get();
  return { profile: refreshed.data() as UserProfile, created: false };
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await db.collection(USERS_COLLECTION).doc(uid).get();
  return snap.exists ? (snap.data() as UserProfile) : null;
}
