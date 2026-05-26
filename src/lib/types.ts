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
  // Outline / content generation (Phase 1 + Phase 2)
  "outline-generate-start",
  "outline-generate-success",
  "outline-generate-failed",
  "outline-edit",
  "outline-finalize",
  "content-generate-start",
  "content-generate-success",
  "content-generate-failed",
  "content-chapter-done",
  "content-chapter-failed",
  "content-chapter-retry",
  "content-job-complete",
  // Tone library (Phase 1.5 — writing-style samples + analyzed profiles)
  "tone-create",
  "tone-edit",
  "tone-archive",
  "tone-delete",
  "tone-transfer-ownership",
  "tone-sample-add",
  "tone-sample-delete",
  // Prompt templates (Phase 2 — per-editor reusable snippets for
  // customInstructions chips in content-generation form)
  "prompt-template-create",
  "prompt-template-edit",
  "prompt-template-delete",
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
  // Content generation extras (Phase 2)
  jobId?: string;
  chapterIndex?: number;
  totalChapters?: number;
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
  // Outline / content generation — keep 2y for cost / accountability
  // (LLM tokens cost money; we want a long paper trail of who triggered what)
  "outline-generate-start": 730,
  "outline-generate-success": 730,
  "outline-generate-failed": 730,
  "outline-edit": 90,
  "outline-finalize": 730,
  "content-generate-start": 730,
  "content-generate-success": 730,
  "content-generate-failed": 730,
  "content-chapter-done": 730,
  "content-chapter-failed": 730,
  "content-chapter-retry": 730,
  "content-job-complete": 730,
  // Tone library — cost/accountability trail (LLM embeddings cost money)
  "tone-create": 730,
  "tone-edit": 90,
  "tone-archive": 730,
  "tone-delete": 730,
  "tone-transfer-ownership": 730,
  "tone-sample-add": 730,
  "tone-sample-delete": 730,
  // Prompt templates — low-stakes config data, 90 days is plenty for
  // debugging "who deleted X?" questions.
  "prompt-template-create": 90,
  "prompt-template-edit": 90,
  "prompt-template-delete": 90,
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
  // Preface / คำนำ (Markdown). Used by the book assembler (Phase 2)
  // to render a preface section before the TOC. Optional.
  preface?: string | null;
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

// ─── Outline (Phase 1 of AI content generation) ─────────────
// One outline per project (Q1=A). Stored as a single doc at
// `projects/{projectId}/outline/current` so we never have to think
// about which outline a project "currently uses" — there's only one.

export const OUTLINE_NODE_TYPES = ["chapter", "h2", "h3", "h4", "p"] as const;
export type OutlineNodeType = (typeof OUTLINE_NODE_TYPES)[number];

export type OutlineNode = {
  /** Local UUID, generated client-side. Stable across reorders + saves
   *  so the dnd-kit tree can use it as a React key + drag identifier. */
  id: string;
  type: OutlineNodeType;
  text: string;
  children: OutlineNode[];
};

export const OUTLINE_STATUSES = [
  "generating", // request sent to n8n, waiting for response
  "ready",      // outline returned, user editing
  "failed",     // n8n error or invalid response
  "finalized",  // user clicked "generate content" — locked from edits
] as const;
export type OutlineStatus = (typeof OUTLINE_STATUSES)[number];

/** Form data that the user fills in to seed outline generation.
 *  Field names are intentionally English (decoupled from the n8n
 *  workflow's Thai field labels — the API layer does the mapping). */
export type OutlineFormInput = {
  bookTitle: string;
  chapterCount: number;
  pageCount: number;
  bookPurpose: string;
  bookHighlights: string;
  targetAudience: string;
  /** Optional tone library reference. When set, the server resolves it
   *  to a `systemPrompt` (cached on the tone doc) and forwards that to
   *  n8n so the LLM picks up the editor's writing-style. */
  toneId?: string | null;
  /** Snapshot of the tone name at submit time — useful for audit / UI
   *  even if the tone is later renamed or deleted. */
  toneName?: string | null;
};

export type Outline = {
  projectId: string;
  createdBy: string;     // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;

  status: OutlineStatus;

  /** Snapshot of the form the user submitted to trigger generation.
   *  Persisted alongside the outline so a reviewer can see what context
   *  the LLM was given. */
  formInput: OutlineFormInput;

  /** The actual outline tree. Empty array while status=generating. */
  nodes: OutlineNode[];

  /** Metadata returned by n8n — optional, depends on what the workflow
   *  bothers to include. Useful for cost / abuse tracking. */
  n8nMeta?: {
    requestId?: string;
    durationMs?: number;
    model?: string;
    tokensUsed?: number;
    /** Error message from n8n when status="failed" (callback path).
     *  Truncated to 500 chars before storage. */
    error?: string;
  };

  /** Pointer to the most recent content-generation job for this
   *  outline. Updated when content generation starts. Full job state
   *  lives in the top-level `contentJobs` collection — this is just a
   *  navigation breadcrumb so the outline editor can deep-link. */
  contentJob?: {
    jobId: string;
    startedAt: Timestamp;
  };
};

// ─── Content generation jobs (Phase 2) ──────────────────────
// Each "generate content" submission creates a ContentJob document.
// n8n drives the actual generation, calling back per chapter — see
// CONTENT-GENERATION-DESIGN.md for the full contract.

export const CONTENT_JOB_STATUSES = [
  "pending",     // doc created, not yet POSTed to n8n
  "generating", // n8n accepted, per-chapter callbacks expected
  "done",        // every chapter callback returned success
  "partial",     // every chapter callback returned, ≥1 failed
  "failed",      // upfront failure (n8n unreachable, no chapters, etc.)
] as const;
export type ContentJobStatus = (typeof CONTENT_JOB_STATUSES)[number];

export const CHAPTER_JOB_STATUSES = [
  "pending",
  "generating",
  "done",
  "failed",
] as const;
export type ChapterJobStatus = (typeof CHAPTER_JOB_STATUSES)[number];

/** One row in ContentJob.chapters — represents the n8n generation
 *  state of a single chapter. */
export type ChapterJobItem = {
  /** 0-based index matching the original `chapters[]` order sent to n8n. */
  index: number;
  /** Chapter number padded to 2 digits ("01", "02", ...) — snapshot. */
  chapter: string;
  /** Chapter title — snapshot at submit time. */
  title: string;
  /** Chapter intro/summary paragraph — snapshot of the outline data
   *  shipped to n8n. Used by retry-single-chapter so we don't have to
   *  re-derive from the (possibly mutated) outline tree.
   *
   *  Optional for backwards-compat with old job docs created before
   *  this field was added; retry falls back to refetching the outline
   *  when missing. */
  content?: string;
  /** Subsection titles — snapshot, same reasoning as `content`. */
  topics?: string[];
  status: ChapterJobStatus;
  /** R2 key where the generated HTML is stored. View/download go
   *  through Vercel API endpoints (server fetches from R2). Only set
   *  when status="done". */
  htmlR2Key: string | null;
  /** HTML file size in bytes (sanity check + UI display). */
  htmlBytes: number | null;
  /** Word count reported by n8n (optional metadata). */
  wordCount: number | null;
  /** Image count reported by n8n (generated by Gemini image model). */
  imageCount: number | null;
  /** Short error message (only set when failed). */
  error: string | null;
  updatedAt: Timestamp;
};

export type ContentJob = {
  id: string;                      // doc id = jobId
  projectId: string;
  outlineId: string;               // snapshot — outline used at submit time
  /** Snapshot: which tone was selected (if any). Survives later
   *  rename/delete of the tone. */
  toneId: string | null;
  toneName: string | null;
  createdBy: string;               // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;

  /** Layer 3 of the systemPrompt composition (per-job free-form text
   *  from the submit form). Null if user didn't add anything. */
  customInstructions: string | null;
  /** Snapshot of the FULL composed systemPrompt sent to n8n (tone +
   *  default + custom). Lets us replay/audit what the LLM actually
   *  saw, independent of tone changes / default updates later. */
  composedSystemPrompt: string;

  status: ContentJobStatus;
  totalChapters: number;
  completedChapters: number;       // status: "done"
  failedChapters: number;          // status: "failed"

  /** Request id Vercel generated when POSTing to n8n — useful for
   *  correlating logs across systems. */
  n8nRequestId: string;

  chapters: ChapterJobItem[];
};

// ─── Tone library (Phase 1.5) ───────────────────────────────
// Per-editor writing-style samples → embedded in Qdrant + analysed by
// LLM → produces a "system prompt" and "style profile" used to seed
// Phase 1 outline generation and Phase 2 content generation so output
// matches that editor's voice.

export const TONE_STATUSES = ["active", "archived"] as const;
export type ToneStatus = (typeof TONE_STATUSES)[number];

export const SAMPLE_SOURCES = ["paste", "file"] as const;
export type SampleSource = (typeof SAMPLE_SOURCES)[number];

/** Analysed voice profile — populated by n8n after each sample embed.
 *  All fields are LLM-generated strings; we keep the shape loose so a
 *  future workflow can return richer values without a migration. */
export type StyleProfile = {
  /** Overall mood/register, e.g. "casual-friendly" / "academic-clear". */
  tone: string;
  /** ที่เรียกผู้อ่าน — "คุณ" / "เธอ" / "ผู้อ่าน" / "เรา" / "none". */
  reader_address: string;
  /** Point of view — "second-person" / "first-person" / "mixed" / ... */
  pov: string;
  /** Vocabulary level descriptor. */
  vocabulary_level: string;
  /** Sentence rhythm — "short-punchy" / "medium-flowing" / etc. */
  sentence_style: string;
  /** How often examples appear. */
  uses_examples: string;
  /** How often metaphors appear. */
  uses_metaphors: string;
  /** Humour register. */
  humor_level: string;
  /** Repeated phrases / signature words — the editor's voice fingerprint. */
  signature_phrases: string[];
};

export type ToneStyle = {
  id: string;
  /** Editor who owns this tone — used for RAG scoping in Qdrant. */
  ownerUid: string;
  ownerEmail: string; // denormalised for list display
  name: string;
  description: string;
  /** Qdrant collection — currently always "writing_styles". */
  qdrantCollection: string;
  /** Convenience counters maintained server-side; saves listing samples. */
  sampleCount: number;
  totalChunks: number;
  status: ToneStatus;
  /** Set by /tone-add-sample + /tone-delete-sample responses. null when
   *  the tone has no samples (or last sample was just deleted). */
  styleProfile: StyleProfile | null;
  systemPrompt: string | null;
  lastAnalyzedAt: Timestamp | null;
  /** May differ from ownerUid when admin transfers ownership. */
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type ToneSample = {
  id: string;
  /** Full sample text (≤ 50KB per Q-Tone-7). */
  text: string;
  /** First ~200 chars for list rendering without loading full text. */
  textPreview: string;
  textLength: number;
  /** Qdrant point IDs created from this sample (may be multiple chunks). */
  qdrantPointIds: string[];
  source: SampleSource;
  /** Original filename if uploaded; null for paste. */
  fileName: string | null;
  /** May be admin acting on behalf of the editor. */
  uploadedBy: string;
  uploadedAt: Timestamp;
};

// ─── Prompt templates (Phase 2 — reusable customInstructions snippets) ──
// Editors save short prompt snippets they reuse across content-gen jobs
// (e.g. "เน้นผู้อ่าน beginner", "+ Case study", "+ คำถามทบทวน"). Rendered
// as toggleable chips below the customInstructions textarea — click =
// append, click again = remove.
//
// Two scopes:
//   - "personal" — owner-only; created by any editor for their own use
//   - "shared"   — admin-curated; visible to all editors (e.g. "default",
//                  "computer book", "cartoon book" genre baselines)
//
// Permission summary:
//   - Editor: can CRUD their own personal templates; READ shared
//   - Admin:  can CRUD any template (personal of any user, or shared)

export const PROMPT_TEMPLATE_SCOPES = ["personal", "shared"] as const;
export type PromptTemplateScope = (typeof PROMPT_TEMPLATE_SCOPES)[number];

export const PROMPT_TEMPLATE_CATEGORIES = [
  "audience",
  "style",
  "structure",
  "content",
  "custom",
] as const;
export type PromptTemplateCategory =
  (typeof PROMPT_TEMPLATE_CATEGORIES)[number];

/** Display labels for each category — used in form UI section headers. */
export const PROMPT_TEMPLATE_CATEGORY_LABELS: Record<
  PromptTemplateCategory,
  string
> = {
  audience: "ผู้อ่าน",
  style: "สไตล์",
  structure: "โครงสร้าง",
  content: "เนื้อหา",
  custom: "อื่นๆ",
};

export const PROMPT_TEMPLATE_STATUSES = ["active", "archived"] as const;
export type PromptTemplateStatus = (typeof PROMPT_TEMPLATE_STATUSES)[number];

/** A reusable prompt snippet — personal (owner-scoped) or shared
 *  (admin-curated, visible to everyone). */
export type PromptTemplate = {
  id: string;
  /** "personal" → only ownerUid sees it; "shared" → everyone sees it.
   *  Editor can only create scope="personal" via API; scope="shared"
   *  requires admin role. */
  scope: PromptTemplateScope;
  /** Creator — for personal: the editor; for shared: the admin who
   *  curated it. Used by canManagePromptTemplate permission helper. */
  ownerUid: string;
  ownerEmail: string; // denormalised for /templates list view
  /** Chip display text — short (max 40 chars). */
  label: string;
  category: PromptTemplateCategory;
  /** Text appended to customInstructions when chip is clicked.
   *  Max 2000 chars — keeps a job's composed prompt manageable even
   *  when many chips are applied. */
  snippet: string;
  status: PromptTemplateStatus;
  /** Increment each time the user toggles this chip ON in a form.
   *  Used to sort chips by frequency in a future iteration. */
  usageCount: number;
  /** Last time the chip was toggled ON. Null until first use. */
  lastUsedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
