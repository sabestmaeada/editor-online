# Tone Library — Design Spec

**Status:** Spec locked 2026-05-24 — รอ implement
**Phase:** Phase 1.5 (between outline + content generation)
**Owner:** Editor-scoped (per-user), admin manages

---

## 1. Goal

ให้ editor แต่ละคนสามารถสร้าง "สำนวนการเขียน" (tone styles) ของตัวเอง
เก็บตัวอย่างข้อความ → ระบบ embed + analyze → ได้ style profile + system prompt
ที่จะนำไปใช้ตอน generate outline/content ใน Phase 1 + 2 เพื่อให้เนื้อหาที่
สร้างมีสำนวนตรงกับ "ภาษาของ editor คนนั้น"

---

## 2. Decisions (locked)

| # | Q | A |
|---|---|---|
| 1 | Qdrant collection structure | One shared collection (`writing_styles`) + payload tagging |
| 2 | Tone ownership | Per-editor (ownerUid required) |
| 3 | Admin operation logging | บันทึก `targetUid` (เจ้าของ tone) + `changedBy` (admin) |
| 4 | Editor ลาออก → tone | บังคับ admin transfer ก่อนลบ user |
| 5 | Editor เห็น tone คนอื่น | ไม่เห็น — privacy เต็มที่ |
| 6 | Admin generate outline | Admin ไม่มี dropdown tone (ไม่ได้สร้าง tone) |
| 7 | Sample editing | Immutable — แก้ไม่ได้ ลบ + เพิ่มใหม่เท่านั้น |
| 8 | Sample input methods | Paste + file (.txt, .md, .docx, .pdf) |
| 9 | Quota | 10 tones/editor, 50 samples/tone, 50KB/sample |
| 10 | Auto-analyze | ใช่ — ทุกครั้งที่ add/delete sample (รวม embed + analyze ใน webhook) |
| 11 | Analyze threshold | ตั้งแต่ sample แรก (UX ง่ายสุด) |
| 12 | Style profile destination | Firestore (primary); user export to Sheets via script ทีหลัง |
| 13 | n8n setup timing | Spec-first — setup n8n หลังจากอ่าน doc นี้ |

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ Vercel UI (Next.js)                                            │
│  /tones — list editor's own tones                              │
│  /tones/new — create tone                                       │
│  /tones/[id] — view/edit + manage samples                       │
└──────┬──────────────────────────────────────▲──────────────────┘
       │ HTTPS (X-Tone-Secret header)         │
       ▼                                      │
┌──────────────────────────────────────────────────────────────┐
│ n8n workflows                                                │
│  /tone-add-sample  — embed + auto-analyze                    │
│  /tone-delete-sample — delete points + re-analyze            │
└──────┬────────────────────────────────────────▲──────────────┘
       │                                        │
       ▼                                        │
┌─────────────────────┐         ┌────────────────────────────┐
│ Qdrant              │         │ Gemini API                 │
│ collection:         │         │  - text-embedding model    │
│  "writing_styles"   │         │  - chat model (analysis)   │
└─────────────────────┘         └────────────────────────────┘

Firestore (Vercel side):
  tones/{toneId}                   — metadata + cached profile
  tones/{toneId}/samples/{sId}     — sample text + point ID refs
```

---

## 4. Data model

### 4.1 Firestore — `tones/{toneId}`

```typescript
type ToneStyle = {
  id: string;
  ownerUid: string;                // editor who owns this tone
  ownerEmail: string;              // denormalized for list display
  name: string;                    // "สำนวนนิยายแฟนตาซีของผม"
  description: string;             // free text — purpose / character

  qdrantCollection: string;        // always "writing_styles" v1
  sampleCount: number;             // for UI display
  totalChunks: number;             // total Qdrant points across samples

  status: "active" | "archived";

  // Updated by n8n /tone-add-sample or /tone-delete-sample response.
  // null until first sample is added.
  styleProfile: StyleProfile | null;
  systemPrompt: string | null;
  lastAnalyzedAt: Timestamp | null;

  createdBy: string;               // may differ from ownerUid if admin transferred
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### 4.2 Firestore — `tones/{toneId}/samples/{sampleId}`

```typescript
type ToneSample = {
  id: string;
  text: string;                    // full text (up to 50KB)
  textPreview: string;             // first ~200 chars for list display
  textLength: number;
  qdrantPointIds: string[];        // chunks created from this sample
  source: "paste" | "file";
  fileName: string | null;         // if uploaded
  uploadedBy: string;              // may be admin acting on editor's behalf
  uploadedAt: Timestamp;
};
```

### 4.3 StyleProfile (returned by n8n, cached in Firestore)

```typescript
type StyleProfile = {
  // ── Voice & relationship with reader ──
  tone: string;
  // e.g. "casual-friendly" | "professional-warm" | "academic-clear" |
  //      "inspirational" | "no-nonsense-practical"

  reader_address: string;
  // ที่เรียกผู้อ่าน e.g. "คุณ" | "เธอ/คุณ" | "ผู้อ่าน" | "เรา" | "none"

  pov: string;
  // มุมมอง e.g. "second-person (talk to reader)" | "first-person (I/we)" |
  //               "third-person (neutral)" | "mixed"

  // ── Language characteristics ──
  vocabulary_level: string;
  // e.g. "everyday/casual" | "professional" |
  //      "technical-with-explanation" | "academic-formal" |
  //      "mixed-bilingual-with-english-loanwords"

  sentence_style: string;
  // e.g. "short-punchy" | "medium-flowing" | "long-explanatory" |
  //      "varied-with-rhythm"

  // ── Rhetorical patterns ──
  uses_examples: string;
  // e.g. "frequent (almost every concept)" | "occasional (key points only)" |
  //      "rare (theory-first)" | "anecdotal (personal stories)"

  uses_metaphors: string;
  // e.g. "heavy-everyday-analogies" | "occasional" | "rare-direct-explanation" |
  //      "domain-specific"

  humor_level: string;
  // e.g. "playful-frequent" | "occasional-light" | "neutral-serious" | "dry-wit"

  // ── Voice fingerprint ──
  signature_phrases: string[];
  // วลี / คำที่เจอซ้ำในตัวอย่าง — เป็น voice fingerprint
  // e.g. ["จริง ๆ แล้ว", "ลองคิดดู", "AI Agent", "พูดง่าย ๆ คือ"]
};
```

### 4.4 Qdrant — `writing_styles` collection

| Field | Description |
|---|---|
| `id` | Qdrant-generated point ID |
| `vector` | Gemini embedding of chunk (dimension ตามรุ่น embedding) |
| `payload.ownerUid` | editor's uid — scope for retrieval |
| `payload.toneId` | tone document ID |
| `payload.sampleId` | which sample this chunk came from |
| `payload.chunkIndex` | 0-based chunk order within sample |
| `payload.text` | original chunk text (for retrieval debugging + LLM context) |

**Query filters used:**
- Add sample: insert with full payload above
- Analyze tone: `must: [{key:"ownerUid",match:{value:uid}}, {key:"toneId",match:{value:tid}}]`
- Delete: by `pointIds` list
- (Phase 2) Generate content: same filter as analyze + vector search by chapter title

---

## 5. n8n contract (2 webhooks)

### 5.1 Authentication

- Method: **Header Auth**
- Header name: `X-Tone-Secret`
- Secret value: generated via `openssl rand -hex 32`, stored in both
  - n8n credential (Header Auth)
  - Vercel env var `N8N_TONE_SECRET`

### 5.2 Webhook 1: `POST /tone-add-sample`

**Request:**
```http
POST <n8n url>/webhook/tone-add-sample
X-Tone-Secret: <secret>
Content-Type: application/json

{
  "ownerUid":  "editor_a_uid",
  "toneId":    "abc123",
  "sampleId":  "sample_001",
  "text":      "<full sample text, up to 50KB>"
}
```

**Response (200):**
```json
{
  "pointIds":      ["pt_001", "pt_002", "pt_003"],
  "chunkCount":    3,
  "totalChars":    12500,
  "styleProfile": {
    "tone": "casual-friendly",
    "reader_address": "คุณ",
    "pov": "second-person (talk to reader)",
    "vocabulary_level": "everyday-with-english-loanwords",
    "sentence_style": "short-punchy",
    "uses_examples": "frequent",
    "uses_metaphors": "occasional",
    "humor_level": "occasional-light",
    "signature_phrases": ["จริง ๆ แล้ว", "ลองคิดดู", "AI Agent"]
  },
  "systemPrompt": "คุณคือผู้แต่งหนังสือไทย เขียนเนื้อหาตามสไตล์ต่อไปนี้:\n\n[TONE & VOICE]\n- โทน: casual-friendly\n..."
}
```

**Workflow steps (n8n side):**
1. Webhook receives JSON
2. **Text Splitter** (reuse existing JS code) — chunk to ~700 chars, 100 overlap
3. **Default Data Loader** — adapt chunks with payload `{ownerUid, toneId, sampleId, chunkIndex}`
4. **Embeddings Gemini** (reuse)
5. **Qdrant Insert** — collection `writing_styles`
6. **Code: query all chunks** for `(ownerUid, toneId)` — Qdrant filter
7. **Style Analysis Prompt** (reuse existing JS) — feed up to 20 chunks
8. **Gemini Chat** — analyze, output JSON
9. **Parse Style Profile** (reuse) — extract JSON from LLM output, fallback default
10. **Build System Prompt** (reuse) — template StyleProfile → prompt string
11. **Respond to Webhook** — return shape above

**Error handling:**
- If embedding fails → return 500, Vercel rolls back sample creation
- If analysis fails (LLM error) → return 200 with `styleProfile: null, systemPrompt: null`
  + warning in response — Vercel keeps sample but flags tone as "needs re-analysis"

### 5.3 Webhook 2: `POST /tone-delete-sample`

**Request:**
```http
POST <n8n url>/webhook/tone-delete-sample
X-Tone-Secret: <secret>
Content-Type: application/json

{
  "ownerUid":  "editor_a_uid",
  "toneId":    "abc123",
  "pointIds":  ["pt_001", "pt_002", "pt_003"]
}
```

**Response (200) — when samples remain:**
```json
{
  "deleted":         3,
  "remainingChunks": 47,
  "styleProfile": { /* re-analyzed */ },
  "systemPrompt":    "..."
}
```

**Response (200) — when last sample deleted:**
```json
{
  "deleted":         3,
  "remainingChunks": 0,
  "styleProfile":    null,
  "systemPrompt":    null
}
```

**Workflow steps (n8n side):**
1. Webhook receives JSON
2. **HTTP Request: DELETE Qdrant points** by IDs
3. **Code: query remaining chunks** for `(ownerUid, toneId)`
4. **If remainingChunks > 0:** run analysis flow (same as webhook 1 steps 7-10)
5. **If remainingChunks === 0:** return null for profile + prompt
6. **Respond to Webhook**

### 5.4 Setup checklist (n8n side)

- [ ] สร้าง Qdrant collection `writing_styles`
  - vector size: ตามรุ่น Gemini embedding ที่ใช้ (768 หรือ 1536, etc.)
  - distance: `Cosine`
- [ ] สร้าง Header Auth credential ชื่อ `Tone Library Secret`
  - Header: `X-Tone-Secret`
  - Value: `<openssl rand -hex 32>`
- [ ] Duplicate existing "Google Drive → Qdrant + Style Analysis" workflow ×2
- [ ] **Workflow A: "Tone — Add Sample"**
  - แทน Manual Trigger ด้วย Webhook (POST, Header Auth)
  - ลบ Google Drive + Loop nodes
  - แก้ Text Splitter code: เพิ่ม `ownerUid`/`toneId`/`sampleId` ใน payload
  - เปลี่ยน Qdrant collection: `web` → `writing_styles`
  - เพิ่ม node "Code: query all chunks (ownerUid+toneId)" หลัง Qdrant insert
  - ลบ Save to Google Sheets (ไม่ต้องเก็บฝั่ง n8n อีก)
  - เพิ่ม Respond to Webhook node ที่ปลายทาง
  - Respond setting: `When Last Node Finishes`, `Response Data = First Entry JSON`
- [ ] **Workflow B: "Tone — Delete Sample"**
  - Webhook trigger เช่นเดียวกัน
  - HTTP node: DELETE `https://<qdrant-url>/collections/writing_styles/points` (body: `{points: pointIds}`)
  - Code node: query remaining → conditional analyze (reuse Workflow A's analysis nodes)
  - Respond to Webhook
- [ ] Activate ทั้ง 2 workflows
- [ ] เก็บ Production URLs ทั้ง 2 ตัว → ใส่ใน Vercel env vars

---

## 6. Vercel env vars (เพิ่มเติม)

```bash
# .env.local + Vercel project settings
N8N_TONE_ADD_WEBHOOK_URL=https://<n8n>/webhook/<workflow-A-id>
N8N_TONE_DELETE_WEBHOOK_URL=https://<n8n>/webhook/<workflow-B-id>
N8N_TONE_SECRET=<openssl rand -hex 32>
```

---

## 7. Permission matrix

| Operation | Owner (editor) | Other editor | Admin |
|---|---|---|---|
| List own tones | ✓ | ✗ | ✓ (filter to self) |
| List all tones (cross-user) | ✗ | ✗ | ✓ |
| View own tone | ✓ | ✗ | ✓ |
| View other's tone | ✗ | ✗ | ✓ |
| Create tone | ✓ (own) | ✓ (own) | ✗ |
| Edit own metadata | ✓ | ✗ | ✓ |
| Add sample to own | ✓ | ✗ | ✓ (on behalf) |
| Delete sample | ✓ | ✗ | ✓ |
| Archive tone | ✓ | ✗ | ✓ |
| Transfer ownership | ✗ | ✗ | ✓ (admin only) |

**Implementation:** all gates server-side in API routes; Firestore rules deny
all client direct access (`allow read, write: if false`) — same pattern as outline.

---

## 8. Audit events (new types)

เพิ่มใน `ALL_AUTH_EVENT_TYPES`:
- `tone-create`
- `tone-edit`
- `tone-archive`
- `tone-delete`
- `tone-transfer-ownership`
- `tone-sample-add`
- `tone-sample-delete`

Retention: 730 days (matching project-related events — accountability + cost trail)

Extra fields for tone events:
- `toneId`
- `toneName`
- `targetUid` (when admin acts on behalf of editor)

---

## 9. Quotas + rate limits

| Limit | Value | Enforcement |
|---|---|---|
| Tones per editor | 10 | server-side count check |
| Samples per tone | 50 | server-side count check |
| Sample text size | 50KB | request body size check |
| Tone CRUD rate limit | 30/hour/user | `checkRateLimit` |
| Sample add rate limit | 20/hour/user | `checkRateLimit` (LLM cost guard) |

---

## 10. Routes + UI

### 10.1 Routes

| Route | Page | Access |
|---|---|---|
| `/tones` | List own tones | editor, admin |
| `/tones?user=<uid>` | (admin) filter to specific user | admin only |
| `/tones?user=all` | (admin) view all tones | admin only |
| `/tones/new` | Create tone (auto owner=me) | editor |
| `/tones/[id]` | View/edit + sample list | owner, admin |
| `/tones/[id]/samples/new` | Add sample | owner, admin |
| `/tones/[id]/transfer` | (admin) transfer ownership | admin only |

### 10.2 Nav menu

เพิ่มใน Tools dropdown (component `NavDropdown`):
- "สำนวนการเขียน" → `/tones` (visible to editor + admin)

### 10.3 Sample upload UX

Form fields:
- ChooseInput method: Paste / Upload file
- Paste mode: large textarea, char counter, 50KB limit
- File mode: file input (.txt, .md, .docx, .pdf), parsed server-side
- Submit → loading spinner ~10-30s ("กำลังบันทึก + วิเคราะห์สไตล์...")
- On success: show updated StyleProfile card + sample count

---

## 11. File parsing (Q-Tone-6 = C)

Server-side parsing of uploaded files:

| Format | Library | Notes |
|---|---|---|
| .txt | native (TextDecoder) | UTF-8 |
| .md | native | Strip markdown? Or keep raw? — **Keep raw** (LLM อ่านได้) |
| .docx | `mammoth` (npm) | Extract text; preserves paragraph breaks |
| .pdf | `pdf-parse` (npm) | Extract text; warn if scanned image (OCR not in scope) |

Max file size: 1MB (sample text after parse limited to 50KB)

**Security:**
- Validate MIME type AND magic bytes (don't trust extension alone)
- Parse in try/catch; reject on parser error
- Strip control chars / null bytes before sending to n8n

---

## 12. API endpoints

```
GET    /api/tones                       List (own + admin filter via ?user=)
POST   /api/tones                       Create
GET    /api/tones/[id]                  View
PUT    /api/tones/[id]                  Edit metadata (name, description)
DELETE /api/tones/[id]                  Archive
POST   /api/tones/[id]/transfer         Admin: change ownerUid
                                        body: { newOwnerUid }

GET    /api/tones/[id]/samples          List samples for tone
POST   /api/tones/[id]/samples          Add sample
                                        body (paste): { text: "..." }
                                        body (file): multipart/form-data
                                        - server parses + calls /tone-add-sample
                                        - saves response (pointIds, profile) to Firestore
DELETE /api/tones/[id]/samples/[sId]    Delete sample
                                        - calls /tone-delete-sample
                                        - updates Firestore (sample removed, profile updated)
```

---

## 13. Account deletion impact (Q-Tone-2 = D)

When admin deletes a user account, check for tones owned by them:
1. If user has any tones → block deletion, show error "User has N tones — transfer or archive first"
2. Admin manually transfers OR archives each tone
3. Then deletion proceeds

Implementation hook: `src/app/api/admin/users/[uid]/route.ts` (DELETE) — add pre-check
that calls `countTonesByOwner(uid)`.

---

## 14. Phase 2 integration (preview)

When Phase 2 (content generation) ships, the outline form will gain:

```
[Outline form]
  ...existing fields...
  
  Style tone (optional):
    [Dropdown: Editor's own tones]   ← filter: ownerUid = me
    └── if no tones → "Create tone first at /tones"
  
  [Generate]
```

When tone is selected:
- Vercel reads `tones/{toneId}` from Firestore
- Sends to n8n outline-gen webhook: `{ ..., systemPrompt, styleProfile }`
- n8n uses `systemPrompt` in LLM call + filters Qdrant by `(ownerUid, toneId)` for RAG
- Result: outline + (later) content match the editor's voice

---

## 15. Implementation roadmap

### Sprint 1: Foundation (Vercel side)
1. Types (`ToneStyle`, `ToneSample`, `StyleProfile`) in `src/lib/types.ts`
2. Audit event types + retention
3. Firestore rules (server-only access)
4. `src/lib/firebase/tones.ts` — CRUD
5. `src/lib/n8n/tones.ts` — adapter (2 webhooks)
6. Permission helper (`canManageTone`)

### Sprint 2: API
7. Tones CRUD + ownership transfer + samples CRUD
8. File parsing utilities
9. Rate limit + size validation
10. Audit logging

### Sprint 3: UI
11. `/tones` list (with admin filter)
12. `/tones/new` create form
13. `/tones/[id]` view/edit + samples
14. `/tones/[id]/samples/new` upload form (paste + file)
15. Admin transfer dialog
16. Nav menu integration

### Sprint 4: Integration
17. Account deletion pre-check
18. Phase 2 outline form integration (tone dropdown)
19. Testing + integration with real n8n

**Total estimate: ~1,700-2,000 lines TypeScript/React**

---

## 16. Open questions for later phases

| Question | Defer to |
|---|---|
| Cross-tone analytics (similarity between editors' tones) | Phase 3+ |
| Tone "sharing" between editors (read-only invite) | Future |
| Tone templates / starter library | Future |
| Tone versioning (track profile changes over time) | Future |
| Bulk re-analyze (admin trigger for old tones) | Future |
| Style profile fine-tuning UI (manual edit fields) | Future if needed |

---

## 17. References

- Outline generation pattern (sister feature): see existing
  `src/lib/n8n/outline.ts` + `src/app/api/projects/[id]/outline/*`
- Existing Google Drive ingestion workflow (basis for n8n refactor):
  see chat history 2026-05-24
- Vector DB primer (Qdrant 101): see chat history 2026-05-24

---

## 18. Implementation status — 2026-05-24 (updated end of day)

### ✅ Shipped (Vercel side + both n8n webhooks)

| Component | File(s) | Notes |
|---|---|---|
| Types (`ToneStyle`, `ToneSample`, `StyleProfile`) + 7 audit events | `src/lib/types.ts` | All optional fields use `\| null`, no undefined leaks |
| Firestore rules (server-only access) | `firestore.rules` | `match /tones/{id}` + sub-collection blocked from clients |
| Firestore CRUD | `src/lib/firebase/tones.ts` | `createTone`, `listTonesByOwner`, `listAllTones`, `updateTone`, `transferToneOwnership`, `deleteTone`, `countTonesByOwner`, sample sub-collection helpers |
| Permission helpers | `src/lib/firebase/tone-access.ts` | `resolveToneAccess`, `canCreateTone`, `canSeeOtherUsersTones` |
| n8n adapter | `src/lib/n8n/tones.ts` | `addSample` + `deleteSample` both real fetch with timeout + structured errors |
| File parsing | `src/lib/file-parse/tones.ts` | `.txt`, `.md`, `.docx` (mammoth), `.pdf` (pdf-parse with v1/v2 shape detection) |
| API endpoints | `src/app/api/tones/**` | GET/POST list, GET/PUT/DELETE item, POST transfer, GET/POST/DELETE samples |
| UI — list | `src/app/tones/page.tsx` | Owner-scoped; admin filter via `?user=` |
| UI — create | `src/app/tones/new/{page,create-tone-form}.tsx` | Simple form, redirects to detail on save |
| UI — detail | `src/app/tones/[id]/{page,tone-detail-view}.tsx` | Edit metadata, view profile, list samples, archive / delete |
| UI — sample upload | `src/app/tones/[id]/samples/new/{page,add-sample-form}.tsx` | Paste + file modes, size validation client-side + server-side |
| Nav integration | `src/components/nav.tsx` | "สำนวนการเขียน" in Tools dropdown |
| Account deletion guard | `src/app/api/admin/users/[uid]/route.ts` | Blocks user-delete if `countTonesByOwner > 0` |
| Audit log + colours | `src/app/admin/{audit,users/[uid]}/page.tsx` | 7 new event types with colour badges |
| Firestore indexes | `firestore.indexes.json` | 3 composite indexes for `tones` collection — deployed 2026-05-24 |

### ⏳ Follow-ups (non-blocking)

**Orphan Qdrant points cleanup** — during the period when `deleteSample`
was MOCKED (2026-05-24 morning), Firestore sample records were deleted
but Qdrant points remained. Write a one-off Node script that:

1. Queries Qdrant `writing_styles` scroll API for all points
2. For each point, reads `payload.metadata.sampleId`
3. Looks up `tones/{toneId}/samples/{sampleId}` in Firestore
4. If sample doc doesn't exist → POST to Qdrant `/points/delete`

Not urgent — orphan points don't break anything (RAG by `(ownerUid,
toneId)` filter naturally ignores deleted-sample points if their toneId
is gone too; only stale signal if the tone itself is alive).

### 🛠 n8n workflow B — gotchas resolved during build

- **DELETE method on Qdrant**: use `POST /points/delete` (not HTTP
  DELETE) — Qdrant doesn't expose DELETE verb for points
- **Edit Fields type for array**: `pointIds` must be **Array** type in
  the Edit Fields node, otherwise it's stringified and breaks downstream
- **`=` prefix inside JSON body strings**: write `"value": "{{ expr }}"`
  NOT `"value": "={{ expr }}"` — the `=` prefix is for expression-mode
  fields, but inside a JSON-body string it becomes a literal `=` char
  that breaks Qdrant exact-match filters
- **Code Extract Chunks text field**: workflow A stores chunk text at
  `payload.content` (NOT `payload.metadata.text`). Filter+map on
  `p.payload?.content` and filter out empty strings
- **IF node type validation**: use `number` operation with `gt` and
  `Number()` cast on remainingChunks to avoid string-comparison bugs
- **Edit Fields can't hold `null` for Object type**: use a Code node to
  return `{ ..., styleProfile: null, systemPrompt: null }` for the
  empty-profile branch
- **camelCase vs snake_case across nodes**: workflow A's Code nodes
  return `style_profile` / `system_prompt` (snake) but the response
  contract uses `styleProfile` / `systemPrompt` (camel). Edit Fields1
  (final formatter) must read snake and emit camel

### 🐛 Known gotchas resolved during implementation

- **Firestore `undefined` values** — fixed by `db.settings({ ignoreUndefinedProperties: true })` in `firestore-admin.ts`
- **Server → Client serialization of `Timestamp`** — never pass full
  Firestore types across boundary; format to strings server-side
- **Qdrant collection missing on first insert** — created
  `writing_styles` manually via Qdrant UI
- **Qdrant filter "Index required"** — created 3 payload indexes:
  `metadata.ownerUid`, `metadata.toneId`, `metadata.sampleId` (all
  `keyword`). Case-sensitive: `toneId` (camelCase) NOT `toneid`
- **n8n Webhook returning empty 200** — set Respond mode to
  `Using 'Respond to Webhook' Node` + add a Respond to Webhook node
  at the end of the workflow
- **n8n JSON Body field with expressions** — embed `={{ ... }}` INSIDE
  string values of valid JSON; do NOT wrap the whole body in an
  expression (causes "Unexpected token '='" parse error)
- **`pointIds: []` in response** — Qdrant Vector Store node doesn't
  return point IDs after insert. Extract them from a follow-up
  `points/scroll` query filtered by current `sampleId`

### 📊 Final shape — sample webhook response

A successful `POST /api/tones/[id]/samples` returns:

```json
{
  "sample": {
    "id": "<firestore doc id>",
    "textPreview": "AI Agent คือเครื่องมือสำคัญ...",
    "textLength": 103,
    "qdrantPointIds": ["bdb18c12-..."],
    "source": "paste",
    "fileName": null,
    "uploadedBy": "<uid>",
    "uploadedAt": "<Timestamp>"
  },
  "styleProfile": {
    "tone": "casual-friendly",
    "reader_address": "คุณ",
    "pov": "mixed",
    "vocabulary_level": "everyday",
    "sentence_style": "short-punchy",
    "uses_examples": "occasional",
    "uses_metaphors": "rare",
    "humor_level": "occasional-light",
    "signature_phrases": ["ทดสอบสั้น ๆ", "ลองคิดดูครับ", "..."]
  },
  "systemPrompt": "คุณคือผู้แต่งหนังสือ... น้ำเสียง: casual-friendly..."
}
```

The tone document is updated with the latest `styleProfile` +
`systemPrompt` so subsequent reads don't need to re-fetch from n8n.

---

**Last updated:** 2026-05-24
**Status:** ✅ Vercel side + n8n add-sample shipped to production. ⏳
n8n delete-sample webhook pending (mock active).
