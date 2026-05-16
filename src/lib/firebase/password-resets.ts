import "server-only";
import { randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db, PASSWORD_RESETS_COLLECTION } from "./firestore-admin";
import {
  PASSWORD_RESET_TTL_HOURS,
  type PasswordReset,
  type PasswordResetStatus,
} from "@/lib/types";

function generateToken(): string {
  // 32 random bytes → 64 hex chars. Same length as invite tokens.
  return randomBytes(32).toString("hex");
}

/**
 * Revoke all currently-active reset tokens for a uid. Returns the count
 * of tokens we revoked. Used as a precondition when issuing a new token
 * (prevent multiple active links existing simultaneously).
 *
 * `revokedBy` can be a user uid OR the string "system" when auto-revoke
 * happens during a new issuance.
 */
export async function revokeActiveResetsForUid(
  uid: string,
  revokedBy: string,
): Promise<number> {
  const snap = await db
    .collection(PASSWORD_RESETS_COLLECTION)
    .where("uid", "==", uid)
    .where("status", "==", "active")
    .get();
  if (snap.empty) return 0;

  const now = Timestamp.now();
  const batch = db.batch();
  snap.docs.forEach((doc) => {
    batch.update(doc.ref, {
      status: "revoked",
      revokedAt: now,
      revokedBy,
    });
  });
  await batch.commit();
  return snap.size;
}

/**
 * Issue a new password reset token. Automatically revokes any existing
 * active tokens for the same uid first (one active token per user).
 *
 * Caller is responsible for verifying the target user exists and is
 * `status="active"` before calling this.
 */
export async function createPasswordReset(input: {
  uid: string;
  email: string;
  issuedBy: string;
  issuedByEmail: string;
}): Promise<{ reset: PasswordReset; revokedCount: number }> {
  const revokedCount = await revokeActiveResetsForUid(input.uid, "system");

  const token = generateToken();
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000,
  );

  const reset: PasswordReset = {
    token,
    uid: input.uid,
    email: input.email,
    issuedBy: input.issuedBy,
    issuedByEmail: input.issuedByEmail,
    issuedAt: now,
    expiresAt,
    status: "active",
    usedAt: null,
    revokedAt: null,
    revokedBy: null,
  };
  await db.collection(PASSWORD_RESETS_COLLECTION).doc(token).set(reset);
  return { reset, revokedCount };
}

/**
 * Fetch a reset token. Lazy-marks expired tokens with `status="expired"`
 * on read (persists if `opts.persistExpiry`).
 */
export async function getPasswordReset(
  token: string,
  opts?: { persistExpiry?: boolean },
): Promise<PasswordReset | null> {
  if (!token || typeof token !== "string" || token.length < 16) return null;

  const snap = await db.collection(PASSWORD_RESETS_COLLECTION).doc(token).get();
  if (!snap.exists) return null;

  const data = snap.data() as PasswordReset;
  if (data.status === "active" && data.expiresAt.toMillis() < Date.now()) {
    if (opts?.persistExpiry) {
      await snap.ref.update({ status: "expired" });
    }
    return { ...data, status: "expired" };
  }
  return data;
}

/**
 * Atomically mark a reset token as used. Returns false if the token is
 * not active or has expired (caller should report a generic "link invalid"
 * error in that case).
 */
export async function markResetUsed(token: string): Promise<boolean> {
  const ref = db.collection(PASSWORD_RESETS_COLLECTION).doc(token);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() as PasswordReset;
    if (data.status !== "active") return false;
    if (data.expiresAt.toMillis() < Date.now()) {
      tx.update(ref, { status: "expired" });
      return false;
    }
    tx.update(ref, {
      status: "used",
      usedAt: Timestamp.now(),
    });
    return true;
  });
}

/**
 * List reset tokens for one user — used on the admin user-detail page so
 * admins can see past resets / current active token.
 */
export async function listPasswordResetsForUid(
  uid: string,
  opts?: { status?: PasswordResetStatus; limit?: number },
): Promise<PasswordReset[]> {
  let q = db
    .collection(PASSWORD_RESETS_COLLECTION)
    .where("uid", "==", uid)
    .orderBy("issuedAt", "desc") as FirebaseFirestore.Query;
  if (opts?.status) q = q.where("status", "==", opts.status);
  q = q.limit(opts?.limit ?? 10);
  const snap = await q.get();
  return snap.docs.map((d) => d.data() as PasswordReset);
}
