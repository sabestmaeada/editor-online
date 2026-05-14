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
  oldRole?: UserRole;
  newRole?: UserRole;
  changedBy?: string;
  oldEmail?: string;
  newEmail?: string;
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
    timestamp: now,
    expiresAt,
  };

  await db.collection(AUTH_EVENTS_COLLECTION).add(event);
}
