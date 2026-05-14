import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { db, USERS_COLLECTION } from "./firestore-admin";
import type { UserProfile, UserRole } from "@/lib/types";

export async function listAllUsers(): Promise<UserProfile[]> {
  const snap = await db
    .collection(USERS_COLLECTION)
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map((d) => d.data() as UserProfile);
}

export async function countAdmins(): Promise<number> {
  const snap = await db
    .collection(USERS_COLLECTION)
    .where("role", "==", "admin")
    .count()
    .get();
  return snap.data().count;
}

/**
 * Update a user's role. Returns the previous role for audit logging.
 * Throws if target user doesn't exist.
 */
export async function updateUserRole(
  uid: string,
  newRole: UserRole,
): Promise<{ oldRole: UserRole; newRole: UserRole }> {
  const ref = db.collection(USERS_COLLECTION).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`User ${uid} not found`);

  const oldRole = (snap.data() as UserProfile).role;
  if (oldRole === newRole) return { oldRole, newRole };

  await ref.update({
    role: newRole,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { oldRole, newRole };
}
