# Online Editor — Project Status

> **Handoff document for continuing development across sessions.**  
> Last updated: 2026-05-15

---

## 📌 Overview

**What it is:** Web app for managing and editing HTML book projects, with team review workflow.

**Stack:**
- **Frontend:** Next.js 16.2 (App Router, Turbopack) + React 19 + Tailwind v4 + TypeScript
- **Auth:** Firebase Auth (Email/Password — Google disabled)
- **DB:** Firestore (server access via firebase-admin)
- **Storage:** Cloudflare R2 (bucket `game`, shared)
- **Editor:** Vanilla JS book editor served from `public/book-editor/` (iframe inside Next.js)
- **Deploy:** Vercel

**Communication language:** ภาษาไทย (per `~/.claude/CLAUDE.md`)

**Repo:** `/Users/thinkbeyond/cowork_workspace/dev/online-editor`  
**Git remote:** `https://github.com/sabestmaeada/editor-online.git` (HTTPS + osxkeychain credential helper)

---

## ✅ Features Implemented (v1)

### Authentication & Sessions
- Email/Password login (Google sign-in code present but UI commented out + provider disabled in Firebase)
- SSR-aware session via `__session` httpOnly cookie (createSessionCookie + verifySessionCookie)
- Session API: `POST /api/auth/session` (login), `DELETE /api/auth/session` (logout)
- Auto-migrate: users with old sessions get profile created on first dashboard hit (`requireUserProfile`)

### User Profiles & Roles
- `users/{uid}` Firestore docs with displayName, email, photoURL, trackColor, role, timestamps
- Global roles: `admin | editor | writer | reviewer | proofreader | viewer` (default: `viewer`)
- Color: auto-picked from `pickColorForUid()` hash, user-editable via dashboard + editor

### Audit Log
- `authEvents/{auto-id}` collection — append-only, server-only writes
- 13 event types in `ALL_AUTH_EVENT_TYPES` (`src/lib/types.ts`):
  - Auth: `login`, `logout`, `failed-login`
  - User: `password-reset`, `email-change`, `role-change`
  - Project: `project-create`, `project-metadata-update`, `project-delete`, `project-download`, `project-files-replace`
  - Member: `project-member-invite`, `project-member-remove`, `project-member-role-change`
- IP storage: **truncated /24** (`ip`) + **SHA-256 hash** (`ipHash`) — PDPA-friendly, no full IP stored
- Retention: 90d / 180d / 730d per event type (TTL on `expiresAt` field)
- TTL policy configured in Google Cloud Console (Firestore → TTL → `authEvents.expiresAt`)

### Admin Console (`/admin`)
- `/admin/users` — list users + change role via inline dropdown
- `/admin/users/[uid]` — single user profile + login history
- `/admin/audit` — global audit log with filter (email + date range + event type) + Export CSV
- Real-time admin stats on dashboard (countUsers, countProjects, eventsToday)

### Projects (v1 — Cloud-stored)
- Two-tier role model:
  - Creating: global role = `editor` or `admin`
  - Per-project: `project_owner` (auto, on create) + invitable `project_editor / project_proofreader / project_viewer`
- Project schema in `src/lib/types.ts`:
  ```
  Project: id, title, customer, pages, description?, isbn?, language?, author?, edition?,
           ownerUid, ownerEmail, status, r2Prefix, fileCount, totalSize, createdAt, updatedAt,
           coverKey?, coverContentType?, coverUpdatedAt?
  ProjectMember: projectId, uid, email, displayName, role, addedAt, addedBy, lastAccessedAt
  ```
- Status workflow: `draft → in-progress → review → completed → archived`
- Inline status selector + edit page (`/projects/[id]/edit`)
- Cover image upload (JPEG/PNG/WebP, max 5MB) — proxied through `/api/projects/[id]/cover`
- File list (read-only display) + Replace all files action
- Member management (invite by email, change role, remove) — owner/admin only
- Filter UI on `/projects` (search + status + role)
- Recent projects + workload counters on dashboard
- Admin sees ALL projects with "Admin access" badge for non-member ones

### File Upload — R2 Presigned URLs ⭐
- **Vercel body limit bypass** — browser PUTs ZIP directly to R2 (no 4.5MB limit)
- Flow:
  1. `POST /api/projects/upload-url` → returns `{uploadKey, uploadUrl}` (15-min expiry)
  2. Browser PUT zip → `uploadUrl` (direct to R2)
  3. `POST /api/projects` or `PUT /api/projects/[id]/files` with `{uploadKey}`
  4. Server downloads ZIP from R2 staging → stream-unzips → uploads to `projects/{id}/source/`
- Staging path: `projects/_staging/{uuid}.zip` — auto-cleaned after process
- **Requires R2 CORS config** (see Setup section)

### Book Editor (`/editor`)
- **Iframe** wrapper around `public/book-editor/editor.html` (2720-line vanilla JS)
- Identity passed via URL hash: `#uid=...&name=...&color=...`
- 2-way color sync: editor postMessage → `PUT /api/users/me/color` → Firestore
- "Back to Dashboard" button (← arrow in topbar)
- **Track Changes lock** ⭐ — `handleBeforeInput` blocks edits inside other users' `<ins>/<del>` (any input type incl. paste/Enter); CSS `cursor: not-allowed` on others' TC via `rebuildColorStyleSheet`
- Save back to LOCAL DISK (File System Access API) — Chromium browsers only
- **NOT yet connected to R2 projects** — users must Download ZIP → edit local → Replace ZIP

### Dashboard (`/dashboard`)
- Sections: Header + quick actions, Recent projects (3), Workload overview, Admin stats (admin only), Personal settings (color picker + change password + privacy note)
- Change Password form — reauthenticate + updatePassword via Firebase Auth client SDK
- Privacy info inline (IP truncation, retention)

---

## 🗂️ File Structure (key files)

```
src/
├── proxy.ts                                # middleware (renamed from middleware.ts for Next 16)
├── components/
│   ├── nav.tsx, nav-link.tsx, logout-button.tsx
├── lib/
│   ├── types.ts                            # ALL types: UserRole, ProjectStatus, ProjectMemberRole, AuthEventType, etc.
│   ├── colors.ts                           # TRACK_COLORS + pickColorForUid
│   ├── format.ts                           # Thai date/relative time helpers
│   ├── csv.ts                              # CSV cell escaping (RFC 4180)
│   ├── upload-via-presigned.ts             # CLIENT helper: 3-step upload to R2
│   ├── audit/ip.ts                         # IP truncate/hash + geo headers
│   ├── firebase/
│   │   ├── admin.ts                        # firebase-admin init
│   │   ├── client.ts                       # firebase client SDK
│   │   ├── firestore-admin.ts              # admin Firestore + collection names
│   │   ├── auth-context.tsx                # AuthProvider + useAuth
│   │   ├── auth-events.ts                  # logAuthEvent (server)
│   │   ├── users.ts                        # upsertUserProfile, getUserProfile
│   │   ├── require-profile.ts              # requireUserProfile (redirect if missing) + auto-migrate
│   │   ├── require-role.ts                 # requireAdmin
│   │   ├── get-current-profile.ts          # non-redirect variant
│   │   ├── projects.ts                     # CRUD + setProjectCover, clearProjectCover
│   │   ├── project-members.ts              # invite/remove/role + findUserByEmail
│   │   ├── project-access.ts               # resolveProjectAccess (canManage, canEdit, canDownload)
│   │   ├── list-my-projects.ts             # listProjectsForUser (admin sees all)
│   │   ├── admin-users.ts                  # listAllUsers, countAdmins, updateUserRole
│   │   ├── admin-events.ts                 # listAuthEventsForUser, listRecentAuthEvents (paginated + filter)
│   │   └── dashboard-queries.ts            # getAdminStats, countByStatus, getRecentAdminEvents
│   └── r2/
│       ├── client.ts                       # S3Client init + projectPrefix/projectSourceKey/projectMetaPrefix helpers
│       ├── presigned.ts                    # presignZipUpload + isValidStagingKey + STAGING_PREFIX
│       ├── upload.ts                       # uploadZipToProject + processStagedUpload
│       ├── download.ts                     # listProjectFiles + streamProjectZip + deleteProjectFiles + deleteProjectSourceFiles
│       └── cover.ts                        # uploadProjectCover + getProjectCoverStream + ALLOWED_COVER_MIME
└── app/
    ├── page.tsx                            # homepage (logged-in: nav + greeting; logged-out: landing)
    ├── layout.tsx                          # wraps with AuthProvider
    ├── login/page.tsx                      # email/password form (Google block commented out)
    ├── dashboard/                          # header + recent + workload + admin-stats + personal-settings + change-password
    ├── editor/                             # iframe wrapper
    ├── projects/
    │   ├── page.tsx                        # list with filter
    │   ├── projects-filter.tsx
    │   ├── new/                            # create form (uses upload-via-presigned)
    │   └── [id]/                           # detail + member-controls + replace-files-form + edit/
    ├── admin/
    │   ├── page.tsx                        # overview
    │   ├── users/                          # list + [uid] detail
    │   └── audit/                          # filter + paginate + export/route.ts
    └── api/
        ├── auth/
        │   ├── session/route.ts            # POST/DELETE
        │   └── password-changed/route.ts   # POST (audit log only)
        ├── users/me/color/route.ts         # PUT
        └── projects/
            ├── route.ts                    # GET (list), POST (create, JSON {metadata, uploadKey})
            ├── upload-url/route.ts         # POST (generate presigned URL)
            └── [id]/
                ├── route.ts                # GET/PATCH/DELETE
                ├── download/route.ts       # GET (stream ZIP)
                ├── files/route.ts          # PUT (replace via uploadKey)
                ├── cover/route.ts          # GET/PUT/DELETE
                └── members/
                    ├── route.ts            # GET/POST
                    └── [uid]/route.ts      # PATCH/DELETE

public/
├── book-editor/
│   ├── editor.html, editor.js, editor.css  # 2720-line vanilla JS book editor
│   └── css/                                # default styles for user content
├── cover-placeholder.svg                   # default project cover

firestore.rules                             # Firestore security rules (deployed)
firestore.indexes.json                      # composite indexes (projects: ownerUid+updatedAt)
firebase.json + .firebaserc                 # firebase-tools config

scripts/
└── test-r2.mjs                             # R2 connection smoke test (node --env-file=.env.local)
```

---

## 🔧 Setup / Required Env Vars

`.env.local` (NOT committed — `.env.local.example` is the template):

```bash
# Firebase Client (NEXT_PUBLIC_ — exposed to browser)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=editor-online-888
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (server-only, secret)
FIREBASE_PROJECT_ID=editor-online-888
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=""  # wrap in quotes, keep \n literal

# IP hash pepper (server-only) — stable across deploys
IP_HASH_PEPPER=  # openssl rand -hex 32

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=game
R2_ENDPOINT=https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com
```

### Manual Setup Done
- ✅ Firebase Auth: Email/Password enabled (Google disabled by user)
- ✅ Firestore Database: created in Production mode
- ✅ Firestore rules: deployed (`firestore.rules` content, manual paste)
- ✅ Firestore index: `projects (ownerUid ASC, updatedAt DESC)` — composite index built
- ✅ Firestore TTL: `authEvents.expiresAt` policy = Serving (Google Cloud Console)
- ✅ R2 bucket `game` created (shared with other content under `games/` prefix)
- ✅ User is admin: manually set `users/{their-uid}.role = "admin"` in Firestore Console

### Manual Setup Pending (for full v1 functionality)
- ⚠️ **R2 CORS policy** — required for presigned URL uploads. See "R2 CORS" section below.
- ⚠️ **R2 Object Lifecycle** (optional) — auto-delete `projects/_staging/*` older than 1 day
- ⚠️ All env vars must be set in Vercel project settings before deploy

### R2 CORS (required)
Cloudflare Dashboard → R2 → bucket `game` → Settings → CORS Policy:
```json
[{
  "AllowedOrigins": ["http://localhost:3000", "https://YOUR-VERCEL-DOMAIN.vercel.app"],
  "AllowedMethods": ["PUT", "GET"],
  "AllowedHeaders": ["Content-Type", "Content-Length"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

---

## 🏗️ Key Architecture Decisions

### Two-tier RBAC
- **Global role** (`users.role`) — capabilities at system level (create projects, view audit log)
- **Project role** (`projectMembers.role`, prefixed `project_*`) — per-project access
- Why `project_` prefix: prevents value collision with global role names in audit events / data dumps
- Helper: `formatProjectRole()` converts to display label ("Editor", "Proofreader", etc.)
- Permission resolution: `resolveProjectAccess(profile, projectId)` returns `{isAdmin, isOwner, canManage, canEdit, canDownload}`

### Audit log naming convention
- All event types listed in `ALL_AUTH_EVENT_TYPES` (const tuple → type derived via `(typeof ALL_AUTH_EVENT_TYPES)[number]`)
- Single source of truth — adding new event type → update one place → validator/filters/badges all sync
- Lesson learned: had bug where `filters.ts` duplicated event list → refactored to single source

### File upload pattern
- Direct R2 upload via presigned URL (browser → R2, not through Vercel)
- Vercel function only processes after upload (download from R2 → unzip → store)
- Bypasses Hobby tier 4.5MB body limit
- Staging files in `projects/_staging/{uuid}.zip` — temp area

### Track Changes lock (editor)
- `handleBeforeInput` checks if range touches `<ins>/<del>` with different `data-uid`
- Block on ALL input types (typing, paste, delete, Enter) — not just typing
- Applies even when Track Changes is OFF — protects existing TC from accidental destruction
- Visual hint: `cursor: not-allowed` via dynamic CSS (`rebuildColorStyleSheet`)

### Book editor integration
- **Currently iframe-based** — book editor is standalone HTML/JS/CSS in `public/book-editor/`
- Identity passed via URL hash (`#uid=...&name=...&color=...`)
- 2-way color sync: editor → postMessage → parent → API → Firestore
- **NOT integrated with R2 projects** — opens local folder via File System Access API
- v2 plan: load project files from R2 into editor (deferred)

---

## ⚠️ Known Limitations / Gotchas

1. **Editor doesn't load from R2 projects** — users must Download ZIP → edit local → Replace ZIP (workflow ลำบาก แต่ใช้ได้)
2. **Browser support for editor**: Chromium-based only (Chrome/Edge/Brave/Opera). Safari/Firefox not supported (File System Access API).
3. **archiver v8 quirk**: ESM module with named class exports (`ZipArchive`), not the old vending function. Use `new ZipArchive({zlib: {level: 6}})` not `archiver("zip", ...)`. See `src/lib/r2/download.ts` for `@ts-expect-error` workaround.
4. **archiver-jszip-unzipper distinction**:
   - `archiver` v8 ESM — used for creating ZIP (download)
   - `unzipper` — used for streaming unzip (upload)
5. **CJS modules in Turbopack**: Turbopack rewrites CommonJS named exports differently. Don't rely on `createRequire` or `new Function("return require")`; use proper ESM import where possible.
6. **Stale session after password change**: Firebase auto-revokes session tokens. Old `__session` cookie becomes invalid → proxy.ts bounces to /login → /dashboard → loop. Fixed: proxy.ts skips auto-redirect /login→/dashboard if `?next=` param exists.
7. **Server Component → Client Component**: must pass JSON-serializable props only. Firestore `Timestamp` class is NOT serializable — pass `.toMillis()` or pre-formatted strings.
8. **useSearchParams in client component**: requires Suspense boundary or build fails on Vercel. See `src/app/login/page.tsx` for pattern.
9. **Firebase Storage NOT used** — we use Cloudflare R2 for project files, not Firebase Storage.
10. **Bucket `game` shared with other content** — other prefixes (`games/`) exist from user's other project. Stay under `projects/` namespace.

---

## 📋 Roadmap / Deferred Features

### v2 (next big feature)
- **Editor + R2 integration**: load project files from R2 directly into book editor; role-based save mode (editor=save, proofreader=suggest-only, viewer=readonly); save back to R2
- Required: refactor `editor.js` ~2720 lines to use HTTP API instead of File System Access API

### Smaller enhancements
- **Custom Claims**: sync `role` into Firebase Auth session token → enables Edge-level role checks in `proxy.ts` (no Firestore round-trip)
- **Email invitation**: invite by email to non-existing users (send signup link)
- **Display name editing**: dashboard form for changing displayName
- **Soft delete projects**: archived status instead of hard delete (current behavior: hard delete)
- **Multi-device collab**: real-time presence indicator
- **Activity feed**: per-project event timeline
- **Notifications**: in-app bell icon (requires notification model)
- **Tag/label system** on projects
- **Bulk operations**: select multiple projects for status change / delete

### Maintenance
- Old audit events with pre-rename event types (`member-invite`, `project-update`) may exist in Firestore — let TTL clean up, or manually purge
- Stale `_staging/*.zip` files in R2 if upload fails mid-flight — set R2 lifecycle policy (1 day expire)

---

## 🧪 Testing the App

```bash
# Dev
npm run dev

# TypeScript
npx tsc --noEmit

# Production build (test for Vercel issues)
npm run build

# R2 connection test
node --env-file=.env.local scripts/test-r2.mjs

# Firestore rules deploy (if firebase-tools logged in)
npm run firestore:rules:deploy
npm run firestore:indexes:deploy
```

### Quick smoke test workflow
1. Login (email/password) → /dashboard
2. /projects → New project → upload small ZIP (.zip with index.html)
3. Project detail → upload cover image
4. Invite member (must exist in users collection)
5. Logout → login as member → see invited project → Download ZIP
6. Login as admin → /admin/audit → see events flowing

---

## 📝 Recent Conversation Decisions

1. **Project member roles renamed** from `owner/editor/proofreader/viewer` → `project_owner/project_editor/project_proofreader/project_viewer` to avoid collision with global roles
2. **`project-update` renamed** to `project-metadata-update` for clarity (vs `project-files-replace`)
3. **`member-*` events renamed** to `project-member-*` for naming consistency
4. **Dashboard structure**: 5 sections (header, recent, workload, admin-stats, personal-settings)
5. **Cover image**: thumbnail-sized in list (48×64) and detail header (96-128); was banner-sized but user said "too big"
6. **Google login**: UI hidden (commented), provider disabled in Firebase Console
7. **Password change**: integrated into Personal Settings on dashboard (re-auth → update → log event)
8. **Track Changes lock**: block edits in others' TC across all input types, even when TC mode is OFF
9. **R2 presigned upload**: implemented to bypass Vercel 4.5MB body limit on Hobby tier

---

## 🔑 Important Files to Read on New Session

When starting a new conversation, ask Claude to read in this order:

1. `STATUS.md` (this file) — overall state
2. `src/lib/types.ts` — types are the spine of the data model
3. `firestore.rules` — current security rules
4. `src/lib/firebase/project-access.ts` — permission logic
5. `src/proxy.ts` — middleware
6. `public/book-editor/editor.js` (if touching editor) — has its own conventions

---

## 🆘 If something breaks

- **Build fails on Vercel** with `useSearchParams` error → wrap in `<Suspense>`
- **Infinite redirect /login ↔ /dashboard** → session cookie is stale; check `proxy.ts` `?next=` guard, or clear cookie manually
- **413 on upload** → R2 presigned flow not active OR R2 CORS not set
- **"archiver is not a function"** → archiver v8 changed API; use `new ZipArchive(...)` not `archiver("zip")`
- **Firestore "missing index"** → click the link in error to create, or `npm run firestore:indexes:deploy`
- **Editor opens but can't pick folder** → browser permission for File System API was denied previously; check site settings
- **Admin can't access projects** → check admin's `users.role === "admin"` in Firestore; `listProjectsForUser` should return all projects for admin

---

## 🎯 Workflow guidelines for next session

- User communicates in Thai — respond in Thai
- Ask before installing global npm packages (user got concerned once when `docx` was installed globally without permission)
- Don't read `.env*` or `*credentials*` files without explicit permission (per global CLAUDE.md)
- TodoWrite for any multi-step task
- Run tsc check after every significant change
- Don't refactor proactively — user values predictable scope
