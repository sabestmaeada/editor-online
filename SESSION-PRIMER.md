# Session Primer

**Last updated:** 2026-05-24

Paste this (or its key sections) at the start of a new chat to skip
ramp-up time. Reading this file once gives an incoming agent enough
context to keep working without re-asking design questions.

---

## 1. Project at a glance

- **Repo:** `/Users/thinkbeyond/cowork_workspace/dev/online-editor`
- **Stack:** Next.js 16.2.6 (App Router) + React 19 + TypeScript +
  Tailwind v4 + Firebase Admin SDK (Firestore + Auth) + Cloudflare R2
  (S3 SDK) + n8n Cloud (webhooks) + Qdrant Cloud (vector DB) + Gemini
  (embeddings + chat)
- **Deploy:** Vercel (production from `main`)
- **Language:** UI is Thai; code + comments are English with Thai
  user-facing strings inline
- **Auth model:** Firebase email/password + session cookies; system
  roles `admin / editor / writer / reviewer / proofreader / viewer`;
  per-project roles `project_owner / project_editor /
  project_proofreader / project_viewer`

## 2. Phase status (as of 2026-05-24)

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Outline generation (form → n8n → tree editor → Firestore) | ✅ **Production** |
| **Phase 1.5** | Tone library (writing-style samples + RAG via Qdrant) | ✅ **Production** (both add + delete webhooks live) |
| **Phase 2** | Content generation (outline → multi-chapter HTML, async callbacks) | 📐 **Spec locked**, not yet implemented |

Other features in repo (not part of recent phases):
- Project CRUD + members + R2 file storage
- Book Editor (`/editor` → iframe → `public/book-editor/`) — extensive
  table feature, dnd-kit tree, drag/drop, Track Changes
- Credits Form tool (`/tools/credits`)
- Admin console + audit log + IP truncation

## 3. Key design docs

Read these BEFORE starting non-trivial work:

| File | Purpose |
|---|---|
| `AGENTS.md` → `CLAUDE.md` | Project conventions. Says Next.js 16 has breaking changes — consult `node_modules/next/dist/docs/01-app/` before writing code |
| `SECURITY-TODO.md` | Security audit findings + CSP / Firestore rules history. M1-M3 done; L1-L5 are low-priority follow-ups |
| `TONE-LIBRARY-DESIGN.md` | Phase 1.5 spec — every locked decision (Q-Tone-1..7 + sub-Qs), n8n contract, Firestore schema, permission matrix, quotas |

When in doubt about a decision, search these docs first.

## 4. External services + env vars

| Service | Purpose | Required env var |
|---|---|---|
| Firebase Admin | Firestore + Auth | (from `FIREBASE_*` — already set) |
| Cloudflare R2 | Source / cover file storage | `R2_*` (set) |
| n8n Cloud | Outline + tone webhooks | `N8N_OUTLINE_WEBHOOK_URL`, `N8N_OUTLINE_SECRET`, `N8N_TONE_ADD_WEBHOOK_URL`, `N8N_TONE_DELETE_WEBHOOK_URL`, `N8N_TONE_SECRET` |
| Qdrant Cloud | Vector store for tone samples | (n8n side has credentials — Vercel doesn't talk to Qdrant directly) |
| Gemini | LLM (in n8n) | (n8n side) |

CSP includes `https://fonts.googleapis.com` + `https://fonts.gstatic.com`
+ `https:` for img-src — see `next.config.ts`.

## 5. Important MOCK / TODO paths

### Phase 1.5 — fully production
Both `/tone-add-sample` + `/tone-delete-sample` n8n workflows are live.
`src/lib/n8n/tones.ts` has real `addSample` + `deleteSample` adapters.
**Note:** there may be orphan Qdrant points from the period when
`deleteSample` was MOCKED — a periodic cleanup script can sweep them
by querying Qdrant `writing_styles` collection for `(ownerUid, toneId)`
combos that don't exist in Firestore. Not urgent.

### Phase 2 (`Outline.contentJob`) — not implemented
Outline `status` can be `'finalized'` per spec but no code path sets it
yet. When Phase 2 lands, generate-content endpoint will lock outline +
create job + dispatch n8n + handle async callbacks.

## 6. Routes index

User-facing pages (`src/app/`):
- `/dashboard` — landing
- `/projects` + `/projects/[id]` + `/projects/[id]/edit` + `/projects/new`
- `/projects/[id]/outline` + `/projects/[id]/outline/new` ← Phase 1
- `/tones` + `/tones/new` + `/tones/[id]` + `/tones/[id]/samples/new` ← Phase 1.5
- `/editor` — Book Editor iframe shell
- `/tools/credits` — Credits form
- `/admin` + `/admin/users` + `/admin/audit`
- `/login` + `/register/[token]` + `/reset-password/[token]`

API endpoints follow REST under `src/app/api/`:
- `/api/projects/[id]/outline/{generate,...}`
- `/api/tones/{[id]/{transfer,samples/[sampleId]}}`
- `/api/admin/users/{[uid]/{approve,reject},invite}`
- Plus auth, files, cover, etc.

## 7. Working with this codebase — agent tips

1. **Read AGENTS.md first** — it warns that Next.js 16 has breaking
   changes vs training data. `params` and `searchParams` are now
   Promises. Check `node_modules/next/dist/docs/01-app/` for current
   API.
2. **Server vs client component boundary** — Firestore `Timestamp`,
   `Date`, and class instances DON'T cross from Server Components to
   Client Components. Serialize to plain objects (strings / numbers)
   before passing as props. Pattern: format timestamps server-side
   with `formatRelative` / `formatTimestamp` from `@/lib/format`.
3. **Firestore + undefined** — `db.settings({ ignoreUndefinedProperties: true })`
   is already set in `firestore-admin.ts`. You can include optional
   undefined fields in write payloads without errors.
4. **n8n integration pattern** — every external webhook lives in
   `src/lib/n8n/<feature>.ts`. Returns plain objects + throws typed
   errors (`N8nError`, `N8nToneError`). API routes catch + map to
   HTTP status. Never expose the webhook URL or secret to the client.
5. **Audit events** — all sensitive ops log via `logAuthEvent` from
   `src/lib/firebase/auth-events.ts`. New event types must be added
   to `ALL_AUTH_EVENT_TYPES` AND `RETENTION_DAYS` AND the colour
   maps in `src/app/admin/audit/page.tsx` + `src/app/admin/users/[uid]/page.tsx`
   (TypeScript will catch any missing entry).
6. **Firestore indexes** — when adding a query with `where` + `where` +
   `orderBy`, add the composite index to `firestore.indexes.json`
   and run `npm run firestore:indexes:deploy`. Single-field auto
   indexes are not enough for compound queries.
7. **Build verification** — always run `npx tsc --noEmit && npx eslint
   <changed paths>` before reporting work complete. Project gates on
   both during CI.

## 8. How to resume work — template message

Paste this verbatim (filling in `[task]`) to get back to productive
work in 1–2 turns:

> สวัสดีครับ ขอ continue งาน online-editor
>
> โปรเจกต์: Next.js 16 + Firebase + R2 + n8n + Qdrant — อยู่ที่
> `/Users/thinkbeyond/cowork_workspace/dev/online-editor`
>
> Status: Phase 1 + 1.5 production แล้ว (Phase 1.5 = tone library, mock
> delete). Phase 2 spec locked, ยังไม่ implement.
>
> อ่าน `SESSION-PRIMER.md` + `TONE-LIBRARY-DESIGN.md` ก่อนเริ่มทำอะไร
> ใหญ่ ๆ
>
> วันนี้อยากให้ช่วย: **[task here]**

## 9. Common next-steps (ranked by likely priority)

1. **Test Phase 1.5 with real users for 1–2 weeks** — collect feedback
   on LLM output quality, sample upload UX, etc.
2. **Phase 2 implementation** — outline → multi-chapter HTML via n8n
   loop + callback pattern. Spec locked in earlier chat (search for
   `Q-P2-1` through `Q-P2-4` answers in TONE-LIBRARY-DESIGN.md or
   earlier session transcripts).
3. **Tone dropdown in outline form** — Phase 1.5 + Phase 1 integration
   (Q-Tone-4 = (a): admin doesn't see dropdown)
4. **Polish:** signature_phrases display, profile preview before submit,
   admin "all tones" filter UX, etc.
5. **Orphan Qdrant points cleanup** — one-off script to sweep points
   from the period when `deleteSample` was MOCKED. Not urgent.

## 10. Files NOT to touch without specific reason

- `src/lib/firebase/admin.ts` — Firebase initialisation, sensitive
- `src/lib/r2/client.ts` — R2 client, presigned URL logic
- `public/book-editor/editor.js` — 3000-line legacy editor; major
  refactor was rejected, only targeted fixes
- `next.config.ts` — CSP rules are precisely tuned; changes need to be
  validated against `SECURITY-TODO.md`
- `firestore.rules` — security rules, only edit with explicit need
- `firestore.indexes.json` — only ADD indexes, don't reorder or
  delete existing

---

End of primer. Token budget for this file: ~1.5K — small enough to
share in chat verbatim.
