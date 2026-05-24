# Content Generation Design (Phase 2)

**Status:** 📐 Spec locked — not yet implemented
**Last updated:** 2026-05-24

This document is the contract between Vercel (online-editor) and the
n8n `/create-book-content` workflow. It supersedes the legacy
Google-Sheets-driven flow.

> **Pre-reads:** `TONE-LIBRARY-DESIGN.md` (Phase 1.5), the existing
> `src/lib/n8n/outline.ts` adapter (Phase 1), and the legacy n8n
> workflow JSON the user shared on 2026-05-24.

---

## 1. Goals & non-goals

**Goals**
- Generate per-chapter HTML from a finalized outline, optionally using
  the editor's tone-library style as RAG context
- Async + resilient — surviving Vercel's 60s function timeout
- Per-chapter visibility (UI can show "5/12 chapters done")
- Reuse Phase 1.5 Qdrant infrastructure (`writing_styles` collection)

**Non-goals (out of scope for this phase)**
- Live regeneration of single chapters (will be a separate endpoint)
- Multi-LLM ensemble / human review queue
- PDF / EPUB export — HTML files in Drive are the deliverable

---

## 2. Locked decisions (2026-05-24)

| # | Question | Decision |
|---|---|---|
| Q-P2-1 | Outline → n8n payload format | **Vercel flatten tree → flat chapters[]** before sending |
| Q-P2-2 | Response pattern | **Async + per-chapter callback** (POST from n8n to Vercel) |
| Q-P2-3 | RAG source | **`writing_styles`** + filter `(metadata.ownerUid, metadata.toneId)` |
| Q-P2-4 | Tone source | Reuse Phase 1.5 cached `systemPrompt` (resolved server-side from `outline.formInput.toneId`) |
| Q-P2-5 | systemPrompt composition | **3 layers**: tone (from library) + default (code constant) + custom (per-job, optional). See §4.3 |
| Q-P2-6 | Default layer storage | **Code constant** at `src/lib/content/default-prompt-sections.ts` — version controlled, edited via PR |
| Q-P2-7 | Per-job custom layer | **Supported** — captured in submit form, saved as `customInstructions` snapshot on ContentJob |
| Q-P2-8 | Final prompt preview | **Read-only collapsible** in submit form — show composed result but don't allow free-form edit |

---

## 3. End-to-end flow

```
┌────────────────────────────────────────────────────────────┐
│  USER clicks "สร้างเนื้อหา" in outline editor              │
└────────────────────────┬───────────────────────────────────┘
                         │ POST /api/projects/[id]/content/generate
                         │ { outlineId? } (defaults to current outline)
                         ▼
       ┌──────────────────────────────────────────────────┐
       │  Vercel handler:                                  │
       │  1. AuthZ — caller has canEdit on project         │
       │  2. Load outline (must be status: ready)          │
       │  3. Flatten outline.nodes → flat chapters[]       │
       │  4. Resolve tone (outline.formInput.toneId) →     │
       │     load tone doc → extract systemPrompt          │
       │  5. Create contentJob doc (status: pending)       │
       │  6. Set outline.status = "finalized"              │
       │  7. POST → n8n with full payload (see §4)         │
       │  8. Update contentJob.status = "generating"       │
       │  9. Return { jobId } to client                    │
       └──────────────────────┬───────────────────────────┘
                              │ POST /webhook/create-book-content
                              ▼
       ┌──────────────────────────────────────────────────┐
       │  n8n workflow:                                    │
       │  - Webhook responds 202 immediately               │
       │  - Loop over chapters (Split In Batches)          │
       │    For each chapter:                              │
       │      a. Build writing prompt                      │
       │      b. นักเขียน (Gemini Chat)                    │
       │      c. RAG query Qdrant (writing_styles, filtered)│
       │      d. บรรณาธิการ (Gemini Chat)                  │
       │      e. Extract image placeholders → generate     │
       │         images → upload Drive → replace in MD     │
       │      f. Markdown → HTML conversion                │
       │      g. Upload HTML to Drive                      │
       │      h. POST callback → Vercel                    │
       └──────────────────────┬───────────────────────────┘
                              │ POST /api/content/callback (×N chapters)
                              ▼
       ┌──────────────────────────────────────────────────┐
       │  Vercel callback handler:                         │
       │  - Verify X-Content-Secret                        │
       │  - Validate jobId + chapterIndex                  │
       │  - Update contentJob.chapters[i] + counters       │
       │  - If completedChapters === totalChapters →       │
       │      status = "done" (or "partial" if any failed) │
       └──────────────────────────────────────────────────┘

       ┌──────────────────────────────────────────────────┐
       │  CLIENT polls GET /api/projects/[id]/             │
       │                content/jobs/[jobId] every 5s      │
       │  Shows progress until status === "done"           │
       └──────────────────────────────────────────────────┘
```

---

## 4. Vercel ↔ n8n contract

### 4.1 Auth

- Header: `X-Content-Secret`
- Both directions (Vercel → n8n webhook, n8n → Vercel callback)
- Stored in env: `N8N_CONTENT_SECRET`

### 4.2 Vercel → n8n: `POST /webhook/create-book-content`

```http
POST <n8n url>/webhook/create-book-content
X-Content-Secret: <secret>
Content-Type: application/json

{
  "jobId": "<contentJob doc id>",
  "callbackUrl": "https://<app>/api/content/callback",
  "callbackSecret": "<secret>",        // n8n echoes this back

  "bookTitle":   "<from outline.formInput.bookTitle>",
  "systemPrompt": "<from tone.systemPrompt | null>",
  "ownerUid":     "<outline createdBy uid>",
  "toneId":       "<from outline.formInput.toneId | null>",

  "chapters": [
    {
      "index":   0,
      "chapter": "01",
      "title":   "ชื่อบท",
      "content": "คำอธิบาย — ใช้เป็น chapter summary",
      "topics":  ["หัวข้อย่อย 1", "หัวข้อย่อย 2", "..."]
    },
    ...
  ]
}
```

**n8n response:** `202 Accepted` (no body required — Vercel doesn't
parse it). Webhook node configured `responseMode: lastNode` is OK as
long as the last node is reached before any LLM call (we'll add a
"respond 202" node right after Edit Fields).

### 4.3 systemPrompt composition (3 layers)

Sent to n8n as the single `systemPrompt` field (§4.2). Composed server-
side at submit time; the composed result is snapshotted to
`ContentJob.composedSystemPrompt` for audit / reproducibility.

```
┌────────────────────────────────────────────────────────────┐
│ Final systemPrompt (concatenated, in this order)            │
│                                                              │
│ ┌─ Layer 1: TONE (optional) ─────────────────────┐         │
│ │ Source: tone.systemPrompt from Phase 1.5       │         │
│ │ Skipped if outline.formInput.toneId is null    │         │
│ └────────────────────────────────────────────────┘         │
│                                                              │
│ ─────────────────────                                       │
│                                                              │
│ ┌─ Layer 2: DEFAULTS (always) ───────────────────┐         │
│ │ Source: src/lib/content/default-prompt-        │         │
│ │         sections.ts (code constant)            │         │
│ │ Contains: heading hierarchy rules, code-block  │         │
│ │ format, image placeholder syntax, etc.         │         │
│ └────────────────────────────────────────────────┘         │
│                                                              │
│ ─────────────────────                                       │
│                                                              │
│ ┌─ Layer 3: CUSTOM (optional, per-job) ──────────┐         │
│ │ Source: form `customInstructions` textarea     │         │
│ │ Up to 5,000 chars. Free-form.                  │         │
│ └────────────────────────────────────────────────┘         │
└────────────────────────────────────────────────────────────┘
```

**Composer function** — `src/lib/content/compose-system-prompt.ts`:
```ts
export function composeSystemPrompt(parts: {
  tonePrompt: string | null;
  customInstructions: string | null;
}): string {
  const sections: string[] = [];
  if (parts.tonePrompt) sections.push(parts.tonePrompt.trim());
  sections.push(DEFAULT_PROMPT_SECTIONS.trim());
  if (parts.customInstructions) sections.push(parts.customInstructions.trim());
  return sections.join("\n\n---\n\n");
}
```

The separator `\n\n---\n\n` is a visual divider in the composed prompt
to help the LLM recognise section boundaries (markdown horizontal rule).

### 4.4 n8n → Vercel: `POST /api/content/callback`

Called once per chapter (success OR failure):

```http
POST https://<app>/api/content/callback
X-Content-Secret: <same secret echoed back>
Content-Type: application/json

{
  "jobId":        "<from request>",
  "chapterIndex": 0,
  "status":       "done" | "failed",

  // when status: done
  "htmlDriveId":  "<google drive file id>",
  "htmlDriveUrl": "https://drive.google.com/...",
  "wordCount":    2847,
  "imageCount":   5,

  // when status: failed
  "error":        "<short reason>"
}
```

**Vercel response:** `200 OK` (or 4xx if secret invalid / jobId not
found). n8n ignores the body.

**Retry policy (n8n side):** if callback returns 5xx, retry up to 3×
with 30s backoff. After that — give up silently (chapter remains
`pending` in Firestore; user can manually retry via UI later).

---

## 5. Firestore schema

### 5.1 `contentJobs` (top-level collection)

```ts
type ContentJob = {
  id: string;                  // doc id = jobId
  projectId: string;
  outlineId: string;           // snapshot — outline at submit time
  toneId: string | null;       // snapshot
  toneName: string | null;     // snapshot — survives tone rename/delete
  createdBy: string;           // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;

  /** Layer 3: free-form per-job instructions typed in the submit form.
   *  Null if user didn't add anything. */
  customInstructions: string | null;

  /** Snapshot of the FULL composed systemPrompt sent to n8n (tone +
   *  default + custom). Lets us replay/audit what the LLM actually
   *  saw, independent of tone changes / default updates later. */
  composedSystemPrompt: string;

  status: ContentJobStatus;
  totalChapters: number;
  completedChapters: number;   // status: "done"
  failedChapters: number;      // status: "failed"

  n8nRequestId: string;        // for log correlation
  chapters: ChapterJobItem[];
};

type ContentJobStatus =
  | "pending"     // created but not yet POSTed to n8n
  | "generating"  // n8n confirmed receipt, callbacks expected
  | "done"        // all chapters complete (success)
  | "partial"     // all chapters complete (some failed)
  | "failed";     // upfront error (n8n unreachable, no chapters);

type ChapterJobItem = {
  index: number;               // 0-based, matches chapters[] order
  chapter: string;             // "01", "02", ...
  title: string;               // snapshot at submit
  status: "pending" | "generating" | "done" | "failed";
  htmlDriveId: string | null;
  htmlDriveUrl: string | null;
  wordCount: number | null;
  imageCount: number | null;
  error: string | null;
  updatedAt: Timestamp;
};
```

### 5.2 Outline status transition

Add a new transition: `ready` → `finalized` when content gen starts.

```ts
type OutlineStatus =
  | "generating"   // Phase 1
  | "ready"        // Phase 1 — outline ready, can edit
  | "finalized"    // Phase 2 — outline locked, content gen in progress
  | "failed";      // Phase 1 — outline gen failed
```

Finalized outlines are read-only in the outline editor (UI shows a
banner + disables edit controls).

### 5.3 Firestore indexes (composite)

| Collection | Fields | Use case |
|---|---|---|
| `contentJobs` | `projectId + createdAt DESC + __name__` | List jobs for a project (job history page) |
| `contentJobs` | `createdBy + status + createdAt DESC + __name__` | Admin/user filter |

Add to `firestore.indexes.json` and deploy before merging Phase 2 code.

---

## 6. API endpoints

### 6.1 `POST /api/projects/[id]/content/generate`

**Authz:** project member with `canEdit`.

**Rate limit:** 3/hour/user (content gen is expensive — strict cap).

**Request body:**
```json
{
  "outlineId": "<optional, defaults to latest finalized/ready outline>",
  "customInstructions": "<optional Layer 3 string, up to 5000 chars>"
}
```

**Validation:**
- Outline exists for project
- Outline `status` in `["ready", "finalized"]`
- Outline has ≥ 1 chapter node
- `outline.formInput.toneId` (if set) → resolves to tone owned by caller, status `active`, has `systemPrompt`
- `customInstructions` (if set): string, ≤ 5,000 chars, after trim

**Logic:**
1. Resolve tone (if outline.formInput.toneId set) → extract `tone.systemPrompt`
2. Compose final systemPrompt via `composeSystemPrompt({ tonePrompt, customInstructions })` (§4.3)
3. Create `contentJob` doc with `status: "pending"`, save `customInstructions` + `composedSystemPrompt` snapshots
4. Flatten outline tree → `chapters[]` using `flattenOutlineToChapters()` util
5. Build n8n payload (§4.2) — `systemPrompt` field = composed result
6. POST n8n with 30s timeout
7. Update outline `status: "finalized"` + contentJob `status: "generating"`
8. Audit `content-generate-start`
9. Return `{ jobId, totalChapters }`

**Errors:**
- 400 outline missing/invalid
- 403 not authorized
- 429 rate limited
- 502 n8n unreachable / bad gateway
- 504 n8n timeout

### 6.2 `POST /api/content/callback`

**Authz:** header `X-Content-Secret` matches `N8N_CONTENT_SECRET`.
No user session required (server-to-server).

**Logic:**
1. Verify secret (constant-time compare)
2. Load contentJob — 404 if not exist
3. Validate `chapterIndex` in range
4. Update `chapters[i]` + counters + overall `status` atomically
5. Audit `content-chapter-done` or `content-chapter-failed`
6. Return 200

### 6.3 `GET /api/projects/[id]/content/jobs/[jobId]`

**Authz:** project member (any role can view).

**Returns:** full `ContentJob` document with caller-friendly timestamps.

### 6.4 `GET /api/projects/[id]/content/jobs`

**Authz:** project member.

**Returns:** list of jobs for project, paginated, newest first.

---

## 7. n8n workflow refactor

### 7.1 Remove

- ❌ `รวมสารบัญ + system prompt` (Code) — references `ดึงสารบัญจาก Sheets` which no longer exists
- ❌ `Finish` (Code) — replaced by callback per chapter
- ❌ Any leftover Google Sheets nodes

### 7.2 Replace / add

**Edit Fields (after Webhook)** — map from webhook body:
```
jobId          ={{ $json.body.jobId }}
callbackUrl    ={{ $json.body.callbackUrl }}
callbackSecret ={{ $json.body.callbackSecret }}
bookTitle      ={{ $json.body.bookTitle }}
systemPrompt   ={{ $json.body.systemPrompt }}
ownerUid       ={{ $json.body.ownerUid }}
toneId         ={{ $json.body.toneId }}
chapters       ={{ $json.body.chapters }}  // array
```

**Respond to Webhook (NEW)** — right after Edit Fields:
- Status: 202
- Body: `{ "accepted": true, "jobId": "{{ $json.jobId }}" }`

**Loop Over Items** — input: `chapters` array.

**Qdrant Vector Store (RAG)** — change:
- Collection: `jeerawuth` → **`writing_styles`**
- Add filter:
  ```json
  {
    "must": [
      { "key": "metadata.ownerUid", "match": { "value": "{{ $('Edit Fields').first().json.ownerUid }}" } },
      { "key": "metadata.toneId",   "match": { "value": "{{ $('Edit Fields').first().json.toneId }}" } }
    ]
  }
  ```
- If `toneId` is null → skip the RAG step entirely (IF node guard)

**POST callback (NEW)** — at the end of each loop iteration:
- Method: POST
- URL: `={{ $('Edit Fields').first().json.callbackUrl }}`
- Header: `X-Content-Secret: ={{ $('Edit Fields').first().json.callbackSecret }}`
- Body: per §4.3
- Retry: 3× with 30s wait

### 7.3 Keep as-is

- All Gemini Chain nodes (นักเขียน, บรรณาธิการ)
- Image generation pipeline (Generate image → Upload Drive → Share)
- Markdown → HTML conversion node (`สร้าง HTML`)
- Upload HTML to Drive

---

## 8. UI surfaces

### 8.1 Outline editor — new button

```
[ Outline tree view ]
[ ............... ]

[ บันทึก ] [ สร้างเนื้อหา → ]   ← new button
```

Click → navigate to **content submit form page** (not just a modal — too
much content for a modal):
`/projects/[id]/content/new?outlineId=<id>`

### 8.2 Content submit form page

Full page (similar layout to outline new form):

```
สร้างเนื้อหาหนังสือ [project title]

┌─ สำนวนการเขียน (Tone) ─────────────────────────────┐
│ ● ใช้ tone "ผู้แต่ง A"                              │
│   ↳ น้ำเสียง: casual-friendly                       │
│   ↳ เรียกผู้อ่าน: คุณ                                │
│ ○ ไม่ใช้สำนวน                                       │
│ (Read-only — เลือก tone ตอน outline. แก้ต้องไปแก้  │
│  outline แล้วกลับมา)                                │
└──────────────────────────────────────────────────────┘

┌─ ข้อกำหนดพื้นฐาน (Default) [▼ ดู] ─────────────────┐
│ Read-only preview ของ Layer 2 — collapsible        │
│ (open by default? — closed; show first 3 lines as  │
│ teaser to indicate something is there)             │
└──────────────────────────────────────────────────────┘

┌─ คำสั่งเพิ่มเติม (optional) ─────────────────────────┐
│ ┌────────────────────────────────────────────────┐ │
│ │ <textarea, rows=6, maxlength=5000>            │ │
│ │                                                │ │
│ └────────────────────────────────────────────────┘ │
│ Hint: เช่น "หนังสือนี้เน้น beginner ใช้ตัวอย่างจริง" │
│ Char counter: 0 / 5000                              │
└──────────────────────────────────────────────────────┘

┌─ ตัวอย่าง prompt สุดท้าย [▼ ดู] ─────────────────────┐
│ Composed result of (tone + default + custom)        │
│ Read-only. Updates live as user types in Layer 3.   │
│ Closed by default — opens on click.                 │
└──────────────────────────────────────────────────────┘

┌─ ข้อมูลการ generate ────────────────────────────────┐
│ จำนวนบท:    N บท                                    │
│ ประมาณการ:  ~N × 30s = X นาที                       │
│ Tokens คาดการณ์: ~ X (ถ้าคำนวณได้)                  │
└──────────────────────────────────────────────────────┘

[ ยกเลิก ]              [ เริ่มสร้างเนื้อหา → ]
```

Submit → POST `/api/projects/[id]/content/generate` with
`{ outlineId, customInstructions }` → redirect to job status page.

### 8.3 Job status page

### 8.3 Job status page (`/projects/[id]/content/jobs/[jobId]`)

Header:
- Project title
- Outline title snapshot
- Tone used (or "ไม่ใช้สำนวน")
- Created by, created at
- Overall status badge + progress bar (`completedChapters / totalChapters`)

Chapter list (table):
| # | บท | สถานะ | คำ | ภาพ | ดู |
|---|---|---|---|---|---|
| 01 | ชื่อบท | ✅ done | 2,847 | 5 | [Drive link] |
| 02 | ชื่อบท | ⏳ generating | — | — | — |
| 03 | ชื่อบท | ❌ failed | — | — | [retry] |

Poll every 5s until `status` ∈ `["done", "partial", "failed"]`.

Bottom: "ดาวน์โหลดทั้งหมด" → opens Drive folder containing all HTMLs.

### 8.3 Project page — recent jobs list

Show last 3 content jobs for the project with status badges + links.

---

## 9. Env vars (new)

```bash
# .env.local + Vercel project settings
N8N_CONTENT_WEBHOOK_URL=https://<n8n>/webhook/create-book-content
N8N_CONTENT_SECRET=<openssl rand -hex 32>
```

Reuse pattern from Phase 1 / 1.5 — both Vercel and n8n verify this
shared secret in headers.

---

## 10. Permission matrix

| Operation | Project member | Other user | Admin |
|---|---|---|---|
| Trigger content gen | ✓ if canEdit | ✗ | ✓ |
| View job status | ✓ | ✗ | ✓ |
| View chapter HTML | ✓ | ✗ | ✓ |
| Retry failed chapter | ✓ if canEdit | ✗ | ✓ |

**Server-side gates** mirror outline gates (`resolveProjectAccess`).
Firestore `contentJobs` rules deny all client direct access — server-only.

---

## 11. Audit events (new)

Add to `ALL_AUTH_EVENT_TYPES`:
- `content-generate-start`
- `content-generate-failed` (upfront failure, before n8n)
- `content-chapter-done` (per chapter callback success)
- `content-chapter-failed` (per chapter callback fail)
- `content-job-complete` (all chapters done/failed)

Retention: 730 days (matching outline events).

---

## 12. Quotas & rate limits

| Limit | Value | Reason |
|---|---|---|
| Content gen per user per hour | 3 | LLM tokens are expensive |
| Total chapters per job | 30 | Avoid pathological inputs |
| Max parallel jobs per project | 1 | Prevent overlapping callbacks updating same outline |
| Callback retries | 3, 30s backoff | n8n side |

---

## 13. Failure modes & recovery

### 13.1 n8n unreachable during initial POST
- Vercel: contentJob.status → `failed`, outline reverts to `ready`
- User sees error → can retry

### 13.2 n8n receives 202 but crashes mid-loop
- Some chapters callback as `done`, others never callback
- `status` stays `generating` indefinitely
- Mitigation: timeout watcher (cron or on-read) — if `updatedAt` > 1hr old and not all chapters done → mark `partial`
- **Future:** add resume endpoint to retry only missing chapters

### 13.3 Single chapter fails (LLM error, image gen error)
- n8n callbacks with `status: "failed"` + `error`
- Vercel marks chapter `failed`, increments `failedChapters`
- Once all done → overall `status: "partial"` (not full failure)
- User can retry single chapter via future endpoint

### 13.4 Callback signature mismatch
- Vercel returns 401
- n8n logs error, retries 3×
- After 3× → log to ops, chapter stays `generating` (effectively orphaned)

---

## 14. Out of scope (Phase 2.1 follow-ups)

- **Single chapter retry endpoint** — `POST /api/.../chapters/[i]/retry`
- **Diff view** — show what changed between draft + edited HTML
- **Inline editor** — edit HTML directly without re-generating
- **PDF export** — Puppeteer + Vercel cron
- **Multi-LLM ensemble** — vote across Claude + Gemini + OpenAI
- **Content versioning** — keep history of edits

---

## 15. Implementation order (for the next session)

1. Types (`ContentJob`, `ChapterJobItem`, `ContentJobStatus`) + 5 audit events
2. `src/lib/content/default-prompt-sections.ts` (Layer 2 constant — already shipped this session as a stub for review; expand before impl)
3. `src/lib/content/compose-system-prompt.ts` (composer util) + simple unit tests
4. `src/lib/content/flatten-outline.ts` (tree → flat chapters) + tests
5. Firestore rules + composite indexes deploy
6. `src/lib/firebase/content-jobs.ts` (CRUD: create, get, listByProject, updateChapter)
7. `src/lib/n8n/content.ts` (n8n adapter — POST webhook with timeout, structured errors)
8. `POST /api/projects/[id]/content/generate` endpoint
9. `POST /api/content/callback` endpoint + constant-time secret verify
10. `GET /api/projects/[id]/content/jobs/[jobId]` endpoint
11. `/projects/[id]/content/new` submit form page (tone display + Layer 3 textarea + collapsible preview)
12. Outline editor → "สร้างเนื้อหา" button → links to submit form
13. `/projects/[id]/content/jobs/[jobId]` status page with 5s polling
14. ⏳ n8n workflow refactor (per §7) — can be done in parallel by user
15. End-to-end test with real tone + outline + custom instructions

Est. total: **~9-11 hours** (was 7-9; +2h for prompt form). Split across
2 sessions recommended — sessions 1 covers steps 1-10, session 2 covers
11-15 + n8n side.

---

## 16. Open questions (to settle before starting impl)

- Q-P2-5: Tone resolution timing — at submit (snapshot) or at each chapter gen (live)? **Default: snapshot** (lock at submit so renaming tones mid-gen doesn't shift style)
- Q-P2-6: What about chapters with no `topics`? n8n's writing prompt has a fallback ("ให้ออกแบบหัวข้อย่อยที่เหมาะสม 5-7 หัวข้อ"). Keep that — works.
- Q-P2-7: Image generation cost — disable by default + opt-in flag? Or always on? **Default: always on** (image quality is a feature, can add opt-out later)
- Q-P2-8: Job retention — keep contentJob docs forever? Or delete after N days? **Default: keep** (audit trail). Cleanup script can come later.

---

End of spec. Treat this as the source of truth when implementing
Phase 2. Update §2 / §15 if decisions change.
