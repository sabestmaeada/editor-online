import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { adminApp } from "./admin";
import {
  db,
  PROJECTS_COLLECTION,
  PROJECT_MEMBERS_COLLECTION,
  USERS_COLLECTION,
} from "./firestore-admin";
import { DEFAULT_USER_STATUS } from "@/lib/types";
import type { UserProfile, UserRole, UserStatus } from "@/lib/types";

/**
 * Same hydration as users.getUserProfile — exported here so admin code
 * doesn't depend on the order of users.ts/admin-users.ts.
 */
function withDefaults(raw: Record<string, unknown>): UserProfile {
  const status =
    typeof raw.status === "string" ? raw.status : DEFAULT_USER_STATUS;
  return { ...raw, status } as UserProfile;
}

export async function listAllUsers(opts?: {
  status?: UserStatus;
}): Promise<UserProfile[]> {
  // We don't filter by status in Firestore because docs missing the field
  // (legacy) should be treated as "active". Do the filter in memory.
  const snap = await db
    .collection(USERS_COLLECTION)
    .orderBy("createdAt", "desc")
    .get();
  const all = snap.docs.map((d) =>
    withDefaults(d.data() as Record<string, unknown>),
  );
  if (!opts?.status) return all;
  return all.filter((u) => u.status === opts.status);
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
 * Count users awaiting approval — surfaced on dashboard / admin landing
 * so admins know to act without polling the users page.
 */
export async function countPendingUsers(): Promise<number> {
  const snap = await db
    .collection(USERS_COLLECTION)
    .where("status", "==", "pending")
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

/**
 * Approve a pending user with the role admin selected.
 * Sets status → "active" and role → assignedRole atomically.
 *
 * Throws if user doesn't exist or isn't currently pending.
 */
export async function approveUser(input: {
  uid: string;
  assignedRole: UserRole;
}): Promise<{ assignedRole: UserRole; previousStatus: UserStatus }> {
  const ref = db.collection(USERS_COLLECTION).doc(input.uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`User ${input.uid} not found`);
    const data = withDefaults(snap.data() as Record<string, unknown>);
    if (data.status !== "pending") {
      throw new Error(
        `User is not pending (current status: ${data.status})`,
      );
    }
    tx.update(ref, {
      status: "active",
      role: input.assignedRole,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { assignedRole: input.assignedRole, previousStatus: data.status };
  });
}

/**
 * Reject a pending user. Sets status → "rejected" but keeps the doc and
 * Firebase Auth account intact (audit trail). Permanent deletion is a
 * separate action (`hardDeleteUser`).
 */
export async function rejectUser(input: {
  uid: string;
}): Promise<{ previousStatus: UserStatus }> {
  const ref = db.collection(USERS_COLLECTION).doc(input.uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`User ${input.uid} not found`);
    const data = withDefaults(snap.data() as Record<string, unknown>);
    if (data.status !== "pending") {
      throw new Error(
        `Only pending users can be rejected (current status: ${data.status})`,
      );
    }
    tx.update(ref, {
      status: "rejected",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { previousStatus: data.status };
  });
}

/**
 * Count projects the user owns. Used before `hardDeleteUser` — we block
 * deletion if the user owns any projects (admin must reassign first).
 */
export async function countProjectsOwnedBy(uid: string): Promise<number> {
  const snap = await db
    .collection(PROJECTS_COLLECTION)
    .where("ownerUid", "==", uid)
    .count()
    .get();
  return snap.data().count;
}

/**
 * Permanently delete a user — both Firestore profile AND Firebase Auth.
 * Cleans up project memberships too (so the user disappears from member lists).
 *
 * Caller MUST verify `countProjectsOwnedBy(uid) === 0` first. This function
 * throws if it finds any owned projects (defense-in-depth).
 *
 * Idempotent for the Firebase Auth side: if the auth account is already
 * gone, we still delete the Firestore doc.
 */
export async function hardDeleteUser(uid: string): Promise<{
  removedMemberships: number;
}> {
  const ownedCount = await countProjectsOwnedBy(uid);
  if (ownedCount > 0) {
    throw new Error(
      `User owns ${ownedCount} project(s) — reassign ownership before deleting`,
    );
  }

  // Best-effort: remove the user from all project memberships
  const membershipsSnap = await db
    .collection(PROJECT_MEMBERS_COLLECTION)
    .where("uid", "==", uid)
    .get();
  if (!membershipsSnap.empty) {
    const batch = db.batch();
    membershipsSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // Wipe token usage subcollection BEFORE deleting the user doc —
  // Firestore doesn't cascade subcollection deletion, and once the
  // parent doc is gone we lose the natural query path. Done as a
  // dynamic import to keep this module free of recordTokenUsage's
  // wider dependency surface (pricing tables, etc.).
  try {
    const { deleteAllTokenUsageForUser } = await import("./token-usage");
    await deleteAllTokenUsageForUser(uid);
  } catch (e) {
    // Non-fatal — at worst we leak a subcollection that the next
    // admin sweep can clean up. We still want the user gone.
    console.warn(
      `[admin-users] tokenUsage cleanup failed for ${uid}:`,
      e,
    );
  }

  // Delete Firestore profile
  await db.collection(USERS_COLLECTION).doc(uid).delete();

  // Delete Firebase Auth account (idempotent — ignore "user-not-found")
  try {
    await getAuth(adminApp).deleteUser(uid);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") throw err;
  }

  return { removedMemberships: membershipsSnap.size };
}
