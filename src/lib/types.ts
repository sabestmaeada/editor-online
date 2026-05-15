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

// ─── Auth events (audit log) ────────────────────────────────
export type AuthProvider = "password" | "google" | "system";

export const ALL_AUTH_EVENT_TYPES = [
  // Auth
  "login",
  "logout",
  "failed-login",
  // User account
  "password-reset",
  "email-change",
  "role-change",
  // Project
  "project-create",
  "project-update",
  "project-delete",
  "project-download",
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
  "project-create": 730,
  "project-update": 730,
  "project-delete": 730,
  "project-download": 90,
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
