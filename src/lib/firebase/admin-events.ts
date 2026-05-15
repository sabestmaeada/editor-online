import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { db, AUTH_EVENTS_COLLECTION } from "./firestore-admin";
import type { AuthEvent, AuthEventType } from "@/lib/types";

/**
 * List auth events for a specific user.
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

export type RecentEventsOptions = {
  limit?: number;
  before?: Timestamp; // cursor — load events older than this
  eventType?: AuthEventType; // exact match (in-memory filter)
  email?: string; // exact match (in-memory filter)
  from?: Timestamp; // date range start (Firestore-level)
  to?: Timestamp; // date range end (Firestore-level)
};

export type RecentEventsResult = {
  events: AuthEvent[];
  nextCursor: Timestamp | null;
  totalShown: number;
};

/**
 * Build the base Firestore query — applies filters that don't need composite indexes:
 * - orderBy timestamp desc (single-field)
 * - timestamp range (same field as orderBy → allowed)
 * - cursor (startAfter)
 *
 * `eventType` and `email` are intentionally filtered IN MEMORY to avoid requiring
 * composite indexes. Cost: when these filters are active, we fetch more rows.
 */
function buildBaseQuery(options: RecentEventsOptions, fetchSize: number) {
  let q = db
    .collection(AUTH_EVENTS_COLLECTION)
    .orderBy("timestamp", "desc")
    .limit(fetchSize);

  if (options.from) q = q.where("timestamp", ">=", options.from);
  if (options.to) q = q.where("timestamp", "<=", options.to);
  if (options.before) q = q.startAfter(options.before);

  return q;
}

export async function listRecentAuthEvents(
  options: RecentEventsOptions = {},
): Promise<RecentEventsResult> {
  const limit = options.limit ?? 100;
  const hasInMemoryFilter = Boolean(options.eventType || options.email);
  const fetchSize = hasInMemoryFilter ? (limit + 1) * 5 : limit + 1;

  const snap = await buildBaseQuery(options, fetchSize).get();
  let docs = snap.docs.map((d) => d.data() as AuthEvent);

  if (options.eventType) {
    docs = docs.filter((e) => e.eventType === options.eventType);
  }
  if (options.email) {
    const needle = options.email.toLowerCase();
    docs = docs.filter((e) => e.email.toLowerCase() === needle);
  }

  const hasMore = docs.length > limit;
  const events = docs.slice(0, limit);
  const nextCursor =
    hasMore && events.length > 0
      ? events[events.length - 1].timestamp
      : null;

  return { events, nextCursor, totalShown: events.length };
}

/**
 * Iterate over events for export — yields events in batches to avoid loading
 * everything into memory. Used by CSV export.
 */
export async function* streamRecentAuthEvents(
  options: Omit<RecentEventsOptions, "limit" | "before">,
  maxTotal = 10000,
): AsyncGenerator<AuthEvent> {
  const BATCH = 500;
  let cursor: Timestamp | undefined = undefined;
  let yielded = 0;

  while (yielded < maxTotal) {
    const { events, nextCursor } = await listRecentAuthEvents({
      ...options,
      limit: BATCH,
      before: cursor,
    });

    for (const e of events) {
      if (yielded >= maxTotal) return;
      yield e;
      yielded++;
    }

    if (!nextCursor) return;
    cursor = nextCursor;
  }
}
