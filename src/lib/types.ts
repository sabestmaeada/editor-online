import type { Timestamp } from "firebase-admin/firestore";

// ─── Global user roles ──────────────────────────────────────
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

// ─── Account lifecycle status ───────────────────────────────
// "pending"  — registered via invite, รออนุมัติจาก admin
// "active"   — ใช้งานปกติ
// "rejected" — admin ปฏิเสธ (เก็บไว้เป็น audit trail, ลบถาวรได้)
// "disabled" — ระงับภายหลัง (reserved for future)
export const USER_STATUSES = [
  "pending",
  "active",
  "rejected",
  "disabled",
] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export const DEFAULT_USER_STATUS: UserStatus = "active";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  trackColor: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt: Timestamp | null;
  lastLoginIp: string | null;
};

// ─── Invites (admin → new user) ─────────────────────────────
export const INVITE_STATUSES = [
  "active",   // ยังใช้ได้
  "used",     // user register แล้ว
  "expired",  // เลย expiresAt
  "revoked",  // admin ยกเลิก
] as const;

export type InviteStatus = (typeof INVITE_STATUSES)[number];

export const INVITE_TTL_DAYS = 7;

export type Invite = {
  token: string;
  email: string;
  createdBy: string;
  createdByEmail: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  status: InviteStatus;
  usedAt?: Timestamp | null;
  usedByUid?: string | null;
  revokedAt?: Timestamp | null;
  revokedBy?: string | null;
};

// ─── Password resets (admin → existing user) ────────────────
// Shorter TTL than invites because resets are more sensitive.
// Same lifecycle states as invites.
export type PasswordResetStatus = InviteStatus;

export const PASSWORD_RESET_TTL_HOURS = 24;

export type PasswordReset = {
  token: string;
  uid: string;
  email: string;
  issuedBy: string;
  issuedByEmail: string;
  issuedAt: Timestamp;
  expiresAt: Timestamp;
  status: PasswordResetStatus;
  usedAt?: Timestamp | null;
  revokedAt?: Timestamp | null;
  // "system" when auto-revoked by issuing a new token for the same uid
  revokedBy?: string | null;
};

// ─── Auth events (audit log) ────────────────────────────────
export type AuthProvider = "password" | "google" | "system";

export const ALL_AUTH_EVENT_TYPES = [
  // Auth
  "login",
  "logout",
  "failed-login",
  // User account
  // NOTE: "password-reset" is legacy — kept so existing audit log entries
  // still resolve to a known event type. New code should use either
  // "password-self-change" (user changes their own password from /dashboard)
  // or "password-reset-link-issued" / "password-reset-link-used"
  // (admin-initiated flow). Do not emit "password-reset" for new events.
  "password-reset",
  "password-self-change",
  "password-reset-link-issued",
  "password-reset-link-used",
  "email-change",
  "role-change",
  // Account lifecycle (admin-managed)
  "user-invite",
  "user-invite-revoke",
  "user-register",
  "user-approve",
  "user-reject",
  "user-delete",
  // Project
  "project-create",
  "project-metadata-update",
  "project-delete",
  "project-download",
  "project-files-replace",
  // Project member
  "project-member-invite",
  "project-member-remove",
  "project-member-role-change",
] as const;

export type AuthEventType = (typeof ALL_AUTH_EVENT_TYPES)[number];

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
  // Role-change extras
  oldRole?: UserRole;
  newRole?: UserRole;
  changedBy?: string;
  // Email-change extras
  oldEmail?: string;
  newEmail?: string;
  // Project event extras
  projectId?: string;
  projectTitle?: string;
  targetUid?: string;
  targetEmail?: string;
  oldProjectRole?: ProjectMemberRole;
  newProjectRole?: ProjectMemberRole;
  // Account lifecycle extras
  inviteToken?: string;   // shortened/truncated for log readability
  assignedRole?: UserRole; // role admin chose on approve
  rejectReason?: string;   // optional reason on reject
  timestamp: Timestamp;
  expiresAt: Timestamp;
};

export const RETENTION_DAYS: Record<AuthEventType, number> = {
  login: 90,
  logout: 90,
  "failed-login": 180,
  "password-reset": 730,
  "password-self-change": 730,
  "password-reset-link-issued": 730,
  "password-reset-link-used": 730,
  "email-change": 730,
  "role-change": 730,
  // Account lifecycle — sensitive, keep 2 years
  "user-invite": 730,
  "user-invite-revoke": 730,
  "user-register": 730,
  "user-approve": 730,
  "user-reject": 730,
  "user-delete": 730,
  "project-create": 730,
  "project-metadata-update": 730,
  "project-delete": 730,
  "project-download": 90,
  "project-files-replace": 730,
  "project-member-invite": 730,
  "project-member-remove": 730,
  "project-member-role-change": 730,
};

// ─── Projects ──────────────────────────────────────────────
export const PROJECT_STATUSES = [
  "draft",
  "in-progress",
  "review",
  "completed",
  "archived",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_MEMBER_ROLES = [
  "project_owner",
  "project_editor",
  "project_proofreader",
  "project_viewer",
] as const;

export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

export const INVITABLE_PROJECT_ROLES: ProjectMemberRole[] = [
  "project_editor",
  "project_proofreader",
  "project_viewer",
];

export const PROJECT_ROLE_LABELS: Record<ProjectMemberRole, string> = {
  project_owner: "Owner",
  project_editor: "Editor",
  project_proofreader: "Proofreader",
  project_viewer: "Viewer",
};

export function formatProjectRole(role: ProjectMemberRole): string {
  return PROJECT_ROLE_LABELS[role] ?? role;
}

export type Project = {
  id: string;
  // Form fields
  title: string;
  customer: string;
  pages: number;
  description: string | null;
  isbn: string | null;
  language: string | null;
  author: string | null;
  edition: string | null;
  // System fields
  ownerUid: string;
  ownerEmail: string;
  status: ProjectStatus;
  r2Prefix: string;
  fileCount: number;
  totalSize: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Cover image (optional — existing docs may have undefined)
  coverKey?: string | null;          // R2 object key, e.g. "projects/abc/meta/cover.jpg"
  coverContentType?: string | null;  // MIME type for response Content-Type
  coverUpdatedAt?: Timestamp | null; // for cache busting in <img src=...?v=>
};

export type ProjectMember = {
  projectId: string;
  uid: string;
  email: string;
  displayName: string;
  role: ProjectMemberRole;
  addedAt: Timestamp;
  addedBy: string;
  lastAccessedAt: Timestamp | null;
};

/** Project + role (for member views). `myRole` is null when access is via
 *  admin (system role) without explicit project membership. */
export type ProjectWithMembership = Project & {
  myRole: ProjectMemberRole | null;
};
