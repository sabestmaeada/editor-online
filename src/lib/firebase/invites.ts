import "server-only";
import { randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db, INVITES_COLLECTION } from "./firestore-admin";
import {
  INVITE_TTL_DAYS,
  type Invite,
  type InviteStatus,
} from "@/lib/types";

/**
 * Generate a URL-safe random token (64 hex chars from 32 bytes).
 * Used as the Firestore doc ID under `invites/`.
 */
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Normalize email for comparison (lowercase + trim).
 * Stored in this form to make uniqueness/lookup queries deterministic.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Create a new invite document. Returns the full Invite (with the token).
 *
 * Caller responsibility: check that an active invite for the same email
 * doesn't already exist (use `findActiveInviteForEmail` first).
 */
export async function createInvite(input: {
  email: string;
  createdBy: string;
  createdByEmail: string;
}): Promise<Invite> {
  const token = generateToken();
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const invite: Invite = {
    token,
    email: normalizeEmail(input.email),
    createdBy: input.createdBy,
    createdByEmail: input.createdByEmail,
    createdAt: now,
    expiresAt,
    status: "active",
    usedAt: null,
    usedByUid: null,
    revokedAt: null,
    revokedBy: null,
  };

  await db.collection(INVITES_COLLECTION).doc(token).set(invite);
  return invite;
}

/**
 * Fetch invite by token. Auto-marks expired invites with status="expired"
 * on read (lazy migration) but doesn't persist the change unless caller
 * passes `persistExpiry`.
 */
export async function getInvite(
  token: string,
  opts?: { persistExpiry?: boolean },
): Promise<Invite | null> {
  if (!token || typeof token !== "string" || token.length < 16) return null;

  const snap = await db.collection(INVITES_COLLECTION).doc(token).get();
  if (!snap.exists) return null;

  const data = snap.data() as Invite;
  // Auto-expire stale active invites
  if (data.status === "active" && data.expiresAt.toMillis() < Date.now()) {
    if (opts?.persistExpiry) {
      await snap.ref.update({ status: "expired" });
    }
    return { ...data, status: "expired" };
  }
  return data;
}

/**
 * Find an active (not used/revoked/expired) invite for the given email.
 * Returns null if none exists or if all matching invites are inactive.
 */
export async function findActiveInviteForEmail(
  email: string,
): Promise<Invite | null> {
  const normalized = normalizeEmail(email);
  const q = await db
    .collection(INVITES_COLLECTION)
    .where("email", "==", normalized)
    .where("status", "==", "active")
    .limit(5)
    .get();

  for (const doc of q.docs) {
    const data = doc.data() as Invite;
    if (data.expiresAt.toMillis() >= Date.now()) {
      return data;
    }
  }
  return null;
}

/**
 * Mark an invite as used by a specific user. Idempotent: returns false
 * if invite is already used/revoked/expired.
 */
export async function markInviteUsed(
  token: string,
  usedByUid: string,
): Promise<boolean> {
  const ref = db.collection(INVITES_COLLECTION).doc(token);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() as Invite;
    if (data.status !== "active") return false;
    if (data.expiresAt.toMillis() < Date.now()) {
      tx.update(ref, { status: "expired" });
      return false;
    }
    tx.update(ref, {
      status: "used",
      usedAt: Timestamp.now(),
      usedByUid,
    });
    return true;
  });
}

/**
 * Revoke an active invite. Returns false if invite doesn't exist or
 * is already in a terminal state.
 */
export async function revokeInvite(
  token: string,
  revokedBy: string,
): Promise<boolean> {
  const ref = db.collection(INVITES_COLLECTION).doc(token);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() as Invite;
    if (data.status !== "active") return false;
    tx.update(ref, {
      status: "revoked",
      revokedAt: Timestamp.now(),
      revokedBy,
    });
    return true;
  });
}

/**
 * List invites — for admin UI. Optionally filter by status.
 * Returns most-recently-created first.
 */
export async function listInvites(opts?: {
  status?: InviteStatus;
  limit?: number;
}): Promise<Invite[]> {
  let q = db
    .collection(INVITES_COLLECTION)
    .orderBy("createdAt", "desc") as FirebaseFirestore.Query;
  if (opts?.status) q = q.where("status", "==", opts.status);
  q = q.limit(opts?.limit ?? 50);
  const snap = await q.get();
  return snap.docs.map((d) => d.data() as Invite);
}
