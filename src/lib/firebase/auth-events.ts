import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { db, AUTH_EVENTS_COLLECTION } from "./firestore-admin";
import {
  getClientIp,
  getGeoFromHeaders,
  getUserAgent,
  hashIp,
  truncateIp,
  type HeaderReader,
} from "@/lib/audit/ip";
import {
  RETENTION_DAYS,
  type AuthEvent,
  type AuthEventType,
  type AuthProvider,
  type ProjectMemberRole,
  type UserRole,
} from "@/lib/types";

export type LogAuthEventInput = {
  headers: HeaderReader;
  uid: string;
  email: string;
  eventType: AuthEventType;
  provider: AuthProvider;
  success: boolean;
  errorCode?: string | null;
  // Role-change
  oldRole?: UserRole;
  newRole?: UserRole;
  changedBy?: string;
  // Email-change
  oldEmail?: string;
  newEmail?: string;
  // Project events
  projectId?: string;
  projectTitle?: string;
  targetUid?: string;
  targetEmail?: string;
  oldProjectRole?: ProjectMemberRole;
  newProjectRole?: ProjectMemberRole;
  // Account lifecycle extras
  inviteToken?: string;
  assignedRole?: UserRole;
  rejectReason?: string;
  // Content generation extras (Phase 2)
  jobId?: string;
  chapterIndex?: number;
  totalChapters?: number;
};

export async function logAuthEvent(input: LogAuthEventInput): Promise<void> {
  const rawIp = getClientIp(input.headers);
  const geo = getGeoFromHeaders(input.headers);
  const now = Timestamp.now();
  const retentionDays = RETENTION_DAYS[input.eventType];
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + retentionDays * 24 * 60 * 60 * 1000,
  );

  const event: AuthEvent = {
    uid: input.uid,
    email: input.email,
    eventType: input.eventType,
    provider: input.provider,
    ip: truncateIp(rawIp),
    ipHash: hashIp(rawIp),
    userAgent: getUserAgent(input.headers),
    country: geo.country,
    region: geo.region,
    city: geo.city,
    success: input.success,
    errorCode: input.errorCode ?? null,
    ...(input.oldRole !== undefined ? { oldRole: input.oldRole } : {}),
    ...(input.newRole !== undefined ? { newRole: input.newRole } : {}),
    ...(input.changedBy !== undefined ? { changedBy: input.changedBy } : {}),
    ...(input.oldEmail !== undefined ? { oldEmail: input.oldEmail } : {}),
    ...(input.newEmail !== undefined ? { newEmail: input.newEmail } : {}),
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.projectTitle !== undefined
      ? { projectTitle: input.projectTitle }
      : {}),
    ...(input.targetUid !== undefined ? { targetUid: input.targetUid } : {}),
    ...(input.targetEmail !== undefined
      ? { targetEmail: input.targetEmail }
      : {}),
    ...(input.oldProjectRole !== undefined
      ? { oldProjectRole: input.oldProjectRole }
      : {}),
    ...(input.newProjectRole !== undefined
      ? { newProjectRole: input.newProjectRole }
      : {}),
    ...(input.inviteToken !== undefined
      ? { inviteToken: input.inviteToken }
      : {}),
    ...(input.assignedRole !== undefined
      ? { assignedRole: input.assignedRole }
      : {}),
    ...(input.rejectReason !== undefined
      ? { rejectReason: input.rejectReason }
      : {}),
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.chapterIndex !== undefined
      ? { chapterIndex: input.chapterIndex }
      : {}),
    ...(input.totalChapters !== undefined
      ? { totalChapters: input.totalChapters }
      : {}),
    timestamp: now,
    expiresAt,
  };

  await db.collection(AUTH_EVENTS_COLLECTION).add(event);
}
