# Security TODO

สรุป security audit findings จาก session 2026-05-16
**Scope:** internal-team tool (admin invite-only) บน Vercel + Cloudflare R2

ปัจจุบันถือว่า "ปลอดภัยพอใช้งานใน org ได้" — รายการนี้คือสิ่งที่ควรแก้ก่อน
deploy public หรือมีผู้ใช้หลายสิบคน

---

## Status legend
- 🔴 medium — ควรแก้ก่อน scale ขึ้น
- 🟢 low / info — รู้ไว้ ไม่ต้องเร่ง
- ✅ done

---

## ✅ M1 — เพิ่ม Rate Limiting (DONE 2026-05-16)

**Status:** เสร็จแล้ว — ใช้ in-memory limiter (per-instance, fixed-window)

**Files:**
- `src/lib/rate-limit.ts` — `checkRateLimit()` + `rateLimitResponse()` + `RATE_LIMITS` presets
- Applied at 5 public endpoints:
  - `POST /api/auth/session` — 10 req/min/IP
  - `POST /api/auth/register` — 5 req/min/IP
  - `GET /api/auth/invite/[token]` — 30 req/min/IP
  - `GET /api/auth/password-reset/[token]` — 30 req/min/IP
  - `POST /api/auth/password-reset` — 5 req/min/IP

**Limitations (เป็น trade-off ที่ยอมรับสำหรับ internal tool):**
- Counter รีเซ็ตเมื่อ Vercel cold start
- Counter แยกตาม instance ถ้า Vercel scale ออกหลาย instance (เพิ่ม
  effective limit เป็น `limit × instanceCount`) — สำหรับทีมเล็กยังโอเค

**Upgrade path เมื่อ scale ขึ้น:**
- Swap implementation ของ `checkRateLimit` ใน `src/lib/rate-limit.ts` ไปใช้
  `@upstash/ratelimit` + Upstash Redis (distributed, persists across cold starts)
- Interface signature เดิมไม่เปลี่ยน → ไม่ต้องแก้ call sites
- Cost: Upstash free tier 10k req/day พอใช้สำหรับ org เล็ก-กลาง

---

## ✅ M2 — เพิ่ม Security Headers (DONE 2026-05-16)

**Status:** เสร็จแล้ว — `next.config.ts` มี `headers()` function ครอบทุก path

**Headers ที่ตั้ง:**
- `Content-Security-Policy` (รวม script-src, style-src, img-src, font-src,
  connect-src, frame-src, frame-ancestors, object-src, form-action, base-uri)
- `X-Frame-Options: SAMEORIGIN` (legacy clickjacking, frame-ancestors 'self' มี CSP)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-DNS-Prefetch-Control: on`

**CSP allowlist (current):**
- Firebase (connect-src + frame-src): `https://*.googleapis.com`,
  `https://*.firebaseapp.com`, `identitytoolkit`, `securetoken`, `firestore`
- R2 (connect-src): `https://*.r2.cloudflarestorage.com` (presigned uploads
  from browser)
- **Google Fonts** (added 2026-05-19):
  - `style-src`: `https://fonts.googleapis.com` (CSS @font-face declarations)
  - `font-src`: `https://fonts.gstatic.com` (actual .woff2 files)
  - Used by both editor.html shell and book HTML loaded in the iframe
- **External images** (`img-src`, added 2026-05-19): `https:` (any HTTPS
  origin) — Book Editor allows authors to embed images from Google Drive
  proxy (`lh*.googleusercontent.com`), Imgur, etc. via `<img src="https://...">`.
  Blocks `http:` to prevent mixed-content. `Referrer-Policy:
  strict-origin-when-cross-origin` limits referer leakage.
- `'self'` everywhere else

**Trade-offs ที่ยังเหลือ (รู้ไว้):**
- `script-src` ยังมี `'unsafe-inline'` + `'unsafe-eval'` (จำเป็นสำหรับ
  Next.js hydration + Book Editor inline handlers + Firebase Web SDK)
- `style-src` ยังมี `'unsafe-inline'` (track color inline style + Next.js
  critical CSS)
- `img-src https:` กว้างกว่า allowlist เฉพาะ origin — trade-off เพื่อให้
  author ใส่รูปจากเว็บไหนก็ได้โดยไม่ต้องกลับมาแก้ CSP ทุกครั้ง
- **Upgrade path:** ย้าย headers จาก next.config ไปไว้ใน middleware (proxy.ts)
  เพื่อใช้ per-request nonce ตามแบบ strict-CSP — งานใหญ่กว่า

**Custom domain users:** ถ้าใช้ R2 custom domain (ไม่ใช่ default
`*.r2.cloudflarestorage.com`) → เพิ่ม origin ใน `R2_ORIGINS` array ใน next.config.ts

**Self-hosted fonts:** ถ้าวันหลังเปลี่ยนไปใช้ font provider อื่น (เช่น
Bunny Fonts) หรือ self-host ผ่าน next/font → แก้ค่า `GOOGLE_FONTS_*_ORIGIN`
constants ใน next.config.ts

---

## ✅ M3 — Validate Field Size/Format ใน Firestore Rules (DONE 2026-05-16)

**Status:** เสร็จแล้ว — `firestore.rules` มี validators 6 ตัว ครอบทุก field
ที่ allow update ผ่าน client SDK

**Validators ที่เพิ่ม:**

| Helper | Field | Rule |
|---|---|---|
| `isDisplayNameValid()` | `displayName` | string + 2-60 chars |
| `isTrackColorValid()` | `trackColor` | `^#[0-9a-fA-F]{6}$` |
| `isPhotoURLValid()` | `photoURL` | null OR string ≤ 2048 chars |
| `isUpdatedAtValid()` | `updatedAt` | timestamp type |
| `isRoleValid()` | `role` | in `[admin, editor, writer, reviewer, proofreader, viewer]` |
| `isStatusValid()` | `status` | in `[pending, active, rejected, disabled]` |

**Pattern ที่ใช้:**
```
field is either NOT being changed,
OR new value matches the allowed shape
```
→ allow update ที่ไม่แตะ field นั้นได้ตามปกติ, แต่ถ้าเปลี่ยนต้อง valid

**Applied at:**
- `match /users/{uid}` — both self-update (4 fields) และ admin-update (6 fields)

**Other collections:** `invites`, `passwordResets`, `authEvents`, `projects`,
`projectMembers` — server-only writes (admin SDK bypass) ไม่ต้องเพิ่ม validator

**ต้อง deploy ก่อนใช้:**
```bash
npm run firestore:rules:deploy
```
(หรือไป Firebase Console → Firestore → Rules → Publish ก็ได้)

**ทดสอบยังไง:**
1. Deploy rules
2. ไป /dashboard → เปลี่ยน displayName เป็น "ab" (2 chars) → ผ่าน
3. เปลี่ยน trackColor → ผ่าน
4. (จาก console / Firestore SDK) → ลองเขียน displayName เกิน 60 chars →
   ควรถูก reject ด้วย "Missing or insufficient permissions"

---

## 🟢 L1 — MIME Spoofing บน Cover Upload

**Where:** `src/app/api/projects/[id]/cover/route.ts` line ~90

**Issue:** trust `file.type` จาก client (FormData) ไม่ verify magic bytes

**Risk:** ต่ำมาก — server response ใช้ stored `coverContentType`, allowlist
ไม่มี SVG → XSS ผ่าน cover แทบทำไม่ได้

**Fix (ถ้าจะทำ):** ใช้ library อย่าง `file-type` ตรวจ magic bytes ก่อน upload
```ts
import { fileTypeFromBuffer } from 'file-type';
const type = await fileTypeFromBuffer(buffer);
if (!type || !isAllowedCoverMime(type.mime)) { /* reject */ }
```

---

## 🟢 L2 — ZIP-slip Defense Hardening

**Where:** `src/lib/r2/client.ts` line 39 — `projectSourceKey()`

**Issue:** strip leading `/` และ convert `\` → `/` แต่ไม่ filter `..`

**Risk:** ใน S3/R2 context ไม่ใช่ traversal จริง (key เป็น string) แต่ทำให้มี
key แปลก ๆ ในระบบ

**Fix:** reject entries ที่มี `..` ใน path
```ts
export function projectSourceKey(projectId: string, relPath: string): string {
  const normalized = relPath.replace(/^\/+/, "").replace(/\\/g, "/");
  if (normalized.split("/").some(seg => seg === "..")) {
    throw new Error(`Invalid path: ${relPath}`);
  }
  return `${projectSourcePrefix(projectId)}${normalized}`;
}
```

หรือ skip entry ใน `uploadZipToProject` (graceful):
```ts
if (path.split("/").some(seg => seg === "..")) {
  entry.autodrain();
  skipped++;
  continue;
}
```

---

## 🟢 L3 — ตรวจสอบ x-forwarded-for source

**Where:** `src/lib/audit/ip.ts` → `getClientIp()`

**Issue:** อ่าน IP จาก `x-forwarded-for` โดย trust ทันที — ถ้ารันหลัง proxy
ที่ไม่ใช่ Vercel/Cloudflare → attacker forge IP ใน audit log ได้

**Risk:** ต่ำ — บน Vercel production proxy strip header ที่ user forge แล้ว set ใหม่
(เป็นพฤติกรรม default ของ Vercel)

**Fix:** ถ้าจะ deploy นอก Vercel — ใช้ Vercel-only header `x-real-ip` หรือ
Cloudflare `cf-connecting-ip` แทน (ปัจจุบัน code อ่าน 3 header นี้แล้ว)

---

## 🟢 L4 — ไม่มี CAPTCHA on /register

**Status:** mitigated by design — invite-only flow ต้องมี token ก่อน

**Fix needed?** ไม่จำเป็น เว้นแต่จะเปลี่ยนเป็น self-signup ในอนาคต

---

## 🟢 L5 — JSON body size limit

**Issue:** endpoints ที่รับ JSON ไม่มี explicit body size limit
(R2 presigned upload ไม่ผ่าน Vercel — ส่วนนี้ OK)

**Risk:** authenticated DoS ผ่าน huge JSON

**Fix:** ใช้ pattern `req.text()` + check length ก่อน `JSON.parse` ใน
endpoint ที่รับ body ใหญ่ ๆ — หรือใช้ Vercel `maxDuration` คุม timeout

---

## 📦 Dependency vulnerabilities

```
10 vulnerabilities (8 low, 2 moderate)
```

**Moderate:**
1. **postcss XSS** (CVE-2023-44270) — มาผ่าน nested dependency ของ Next.js
   - Fix: รอ Next.js minor update หรือ `npm update postcss`
   - **DO NOT** `npm audit fix --force` → จะ downgrade next เป็น v9

2. **firebase-admin transitive** (`@google-cloud/storage` → `teeny-request`
   → `http-proxy-agent` → `@tootallnate/once`)
   - Fix: รอ Google ปล่อย firebase-admin v14+ ที่ใช้ deps ใหม่
   - ระหว่างรอ: ติดตามผ่าน `npm audit` รายสัปดาห์

**Action:** subscribe `npm audit` แจ้งเตือนใน CI หลัง deploy

---

## ✅ Strong points (ไม่ต้องแก้ — ทำดีอยู่แล้ว)

- httpOnly + secure + sameSite=lax session cookies
- 3-layer status check (session API + require-profile + get-current-profile)
- Token security: random 32-byte hex, single-use, transactional, auto-expire
- Auto-revoke prior reset tokens
- Firebase `revokeRefreshTokens` หลัง password reset
- Firestore rules: defense-in-depth (server-only writes)
- Audit log ครอบคลุม 24 event types + retention 90d-2y
- IP truncation /24 + SHA-256 + pepper (PDPA)
- Presigned URL time-limited (15 min) + single-use
- Staging key validation (block `..` และ `//`)
- Cover upload: size limit (5MB) + MIME allowlist (3 types)
- ZIP upload: size limit (500MB)
- Admin safety: self-delete blocked, last-admin demote blocked, owner-of-projects delete blocked
- .gitignore ครอบคลุม secrets/credentials/SSH keys

---

## เมื่อกลับมาทำ

แนะนำลำดับ:
1. ~~**M1** (rate limit)~~ — ✅ done 2026-05-16
2. ~~**M2** (security headers)~~ — ✅ done 2026-05-16
3. ~~**M3** (Firestore rules)~~ — ✅ done 2026-05-16
4. **L1-L5** — ทำเป็น low-priority background tasks ตามมีเวลา

🎉 Medium-priority issues ทั้งหมดเคลียร์แล้ว — พร้อม deploy public
เมื่อ environment พร้อม (env vars, R2 CORS, etc.)
