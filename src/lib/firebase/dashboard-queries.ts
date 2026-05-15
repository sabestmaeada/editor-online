import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import {
  db,
  USERS_COLLECTION,
  PROJECTS_COLLECTION,
  AUTH_EVENTS_COLLECTION,
} from "./firestore-admin";
import type {
  AuthEvent,
  ProjectStatus,
  ProjectWithMembership,
} from "@/lib/types";

// ─── Workload (per-user) ────────────────────────────────────
export type StatusCounts = Record<ProjectStatus, number>;

export function countByStatus(
  projects: ProjectWithMembership[],
): StatusCounts {
  const counts: StatusCounts = {
    draft: 0,
    "in-progress": 0,
    review: 0,
    completed: 0,
    archived: 0,
  };
  for (const p of projects) {
    counts[p.status]++;
  }
  return counts;
}

// ─── Admin stats (real-time queries) ────────────────────────
export type AdminStats = {
  totalUsers: number;
  totalProjects: number;
  eventsToday: number;
};

function startOfTodayUTC(): Timestamp {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0),
  );
  return Timestamp.fromDate(midnight);
}

export async function getAdminStats(): Promise<AdminStats> {
  const [usersSnap, projectsSnap, eventsSnap] = await Promise.all([
    db.collection(USERS_COLLECTION).count().get(),
    db.collection(PROJECTS_COLLECTION).count().get(),
    db
      .collection(AUTH_EVENTS_COLLECTION)
      .where("timestamp", ">=", startOfTodayUTC())
      .count()
      .get(),
  ]);

  return {
    totalUsers: usersSnap.data().count,
    totalProjects: projectsSnap.data().count,
    eventsToday: eventsSnap.data().count,
  };
}

/**
 * Recent admin-relevant events (last N).
 * Returns events sorted by timestamp desc.
 */
export async function getRecentAdminEvents(
  limit = 5,
): Promise<AuthEvent[]> {
  const snap = await db
    .collection(AUTH_EVENTS_COLLECTION)
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as AuthEvent);
}
