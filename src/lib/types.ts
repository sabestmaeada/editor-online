import type { Timestamp } from "firebase-admin/firestore";

export const USER_ROLES = [
  "admin",
  "editor",
  "writer",
  "reviewer",
  "proofreader",
  "viewer",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_USER_ROLE: UserRole = "viewer";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  trackColor: string;
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt: Timestamp | null;
  lastLoginIp: string | null;
};

export type AuthProvider = "password" | "google" | "system";

export type AuthEventType =
  | "login"
  | "logout"
  | "failed-login"
  | "password-reset"
  | "email-change"
  | "role-change";

export type AuthEvent = {
  uid: string;
  email: string;
  eventType: AuthEventType;
  provider: AuthProvider;
  ip: string;
  ipHash: string;
  userAgent: string;
  country: string | null;
  region: string | null;
  city: string | null;
  success: boolean;
  errorCode: string | null;
  oldRole?: UserRole;
  newRole?: UserRole;
  changedBy?: string;
  oldEmail?: string;
  newEmail?: string;
  timestamp: Timestamp;
  expiresAt: Timestamp;
};

export const RETENTION_DAYS: Record<AuthEventType, number> = {
  login: 90,
  logout: 90,
  "failed-login": 180,
  "password-reset": 730,
  "email-change": 730,
  "role-change": 730,
};
