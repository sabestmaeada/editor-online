import "server-only";
import { db, AUTH_EVENTS_COLLECTION } from "./firestore-admin";
import type { AuthEvent } from "@/lib/types";

/**
 * List auth events for a specific user.
 *
 * Uses single-field `where` (no composite index needed) and sorts in memory.
 * Limit is set high enough to cover ~90 days of normal activity; for heavier
 * traffic, switch to composite index (uid asc, timestamp desc) + server-side
 * orderBy + paginate.
 */
export async function listAuthEventsForUser(
  uid: string,
  limit = 200,
): Promise<AuthEvent[]> {
  const snap = await db
    .collection(AUTH_EVENTS_COLLECTION)
    .where("uid", "==", uid)
    .limit(limit)
    .get();

  return snap.docs
    .map((d) => d.data() as AuthEvent)
    .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
}
