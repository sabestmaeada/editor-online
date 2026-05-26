# Token Usage Tracking — Implementation Notes

**Status:** 📌 ค้างไว้ — เดี๋ยวค่อยทำ (deferred)
**Date drafted:** 2026-05-26
**Use case:** เก็บข้อมูลการใช้ AI tokens จาก n8n → Firestore เพื่อวิเคราะห์ cost + ดูสรุปรายโปรเจกต์

---

## 📊 ภาพรวม — 3 ส่วน

| ส่วน | ทำอะไร | ที่ไหน |
|---|---|---|
| **1. n8n** | ดึง `tokenUsage` จาก AI Agent output → ส่งกลับ Vercel | Code node หลัง AI Agent |
| **2. Vercel API** | รับ payload → เขียน Firestore | `/api/content/callback` (ขยายของเดิม) |
| **3. Firestore** | เก็บแยกตาม `jobId` + chapter + node | subcollection ของ `contentJobs` |

### ตัวอย่าง output ที่ได้จาก Gemini ใน n8n

```json
[
  {
    "response": { },
    "tokenUsage": {
      "completionTokens": 3405,
      "promptTokens": 1090,
      "totalTokens": 4495
    }
  }
]
```

---

## 1️⃣ n8n — ดึง tokenUsage จาก AI Agent

AI Agent V3 ของ n8n แนบ `tokenUsage` มาใน output อยู่แล้ว — แค่ต้องดึงออกพร้อม tag metadata

### A. ในโหนด Code หลัง AI Agent (เช่น "นักเขียน", "บรรณาธิการ")

```javascript
// $input.first() = ผลจาก AI Agent V3
const item = $input.first().json;

// AI Agent V3 vs V2 รูปแบบต่างกัน — เช็คทั้งสอง
const tokenUsage =
  item.tokenUsage ??                    // V3 format
  item.usage ??                          // OpenAI format
  item.response?.usageMetadata ??        // Gemini raw
  null;

// metadata ที่จะ tag กับ usage record
return [{
  json: {
    ...item,
    _tokenUsage: tokenUsage ? {
      promptTokens: tokenUsage.promptTokens ?? tokenUsage.input_tokens ?? 0,
      completionTokens: tokenUsage.completionTokens ?? tokenUsage.output_tokens ?? 0,
      totalTokens: tokenUsage.totalTokens ?? 0,
      // Metadata สำคัญสำหรับ analytics
      node: 'writer',              // หรือ 'editor', 'html-gen', 'image-prompt'
      chapter: $('Webhook').first().json.chapters?.[0]?.index ?? null,
      model: 'gemini-2.5-flash',   // hardcode หรือดึงจาก node config
      jobId: $('Webhook').first().json.jobId,
      timestamp: new Date().toISOString(),
    } : null,
  },
}];
```

### B. รวบรวม + ส่งกลับ (Option A — แนะนำ)

ใน Code node สุดท้าย (ก่อน HTTP Request callback) — รวบรวมทุก `_tokenUsage` ที่สะสมมา:

```javascript
// ในโหนด "เตรียม callback payload"
const allUsages = [];

// ดึง tokenUsage จากทุก node ที่ผ่านมา
const writerUsage = $('นักเขียน').first().json._tokenUsage;
const editorUsage = $('บรรณาธิการ').first().json._tokenUsage;
const htmlUsage = $('สร้าง HTML').first()?.json?._tokenUsage;  // อาจไม่มี

if (writerUsage) allUsages.push(writerUsage);
if (editorUsage) allUsages.push(editorUsage);
if (htmlUsage) allUsages.push(htmlUsage);

return [{
  json: {
    // ...payload เดิม
    chapterMarkdown,
    chapterIndex,
    // ...
    tokenUsage: allUsages,  // ส่งทั้ง array
  },
}];
```

### Option B (ไม่แนะนำ)

แต่ละโหนด AI → HTTP Request แยกไปยัง `/api/usage/track` — เพิ่ม nodes เยอะ + network call เพิ่ม

---

## 2️⃣ Vercel — รับ + เขียน Firestore

### A. ขยาย `/api/content/callback`

```typescript
// src/app/api/content/callback/route.ts (เดิม)
const body = await req.json();
const { jobId, chapterIndex, content, tokenUsage } = body;
// ... validation เดิม

// เพิ่มหลังจาก save chapter
if (Array.isArray(tokenUsage) && tokenUsage.length > 0) {
  await recordTokenUsage(jobId, chapterIndex, tokenUsage);
}
```

### B. สร้าง `src/lib/firebase/token-usage.ts`

```typescript
import { db } from "./admin";
import { FieldValue } from "firebase-admin/firestore";

export interface TokenUsageEvent {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  node: "writer" | "editor" | "html" | "image-prompt" | "outline";
  chapter: number | null;
  model: string;
  timestamp: string;
}

export async function recordTokenUsage(
  jobId: string,
  chapterIndex: number | null,
  events: TokenUsageEvent[],
) {
  const batch = db.batch();
  const jobRef = db.collection("contentJobs").doc(jobId);

  // 1. เก็บแบบ event-level (subcollection — query ละเอียดได้)
  for (const ev of events) {
    const ref = jobRef.collection("tokenUsage").doc();
    batch.set(ref, {
      ...ev,
      chapter: chapterIndex,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  // 2. อัปเดต aggregate ใน job doc (สำหรับแสดงสรุปเร็ว)
  const totals = events.reduce(
    (acc, ev) => ({
      promptTokens: acc.promptTokens + ev.promptTokens,
      completionTokens: acc.completionTokens + ev.completionTokens,
      totalTokens: acc.totalTokens + ev.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );

  batch.update(jobRef, {
    "tokenUsage.promptTokens": FieldValue.increment(totals.promptTokens),
    "tokenUsage.completionTokens": FieldValue.increment(totals.completionTokens),
    "tokenUsage.totalTokens": FieldValue.increment(totals.totalTokens),
  });

  await batch.commit();
}
```

---

## 3️⃣ Firestore Schema

```
contentJobs/{jobId}
  tokenUsage: {                       ← aggregated (อ่านเร็ว ดูสรุป)
    promptTokens: 45000,
    completionTokens: 120000,
    totalTokens: 165000,
  }

  tokenUsage/{eventId}                ← subcollection (อ่านละเอียด)
    node: "writer",
    chapter: 1,
    model: "gemini-2.5-flash",
    promptTokens: 1090,
    completionTokens: 3405,
    totalTokens: 4495,
    createdAt: <timestamp>,
```

### ทำไม 2 ระดับ?

- **Job doc aggregate** → แสดงในหน้า detail "ใช้ไปทั้งหมด 165k tokens" ไม่ต้อง scan subcollection
- **Subcollection** → ทำ analytics เช่น "บทไหนใช้โทเคนเยอะสุด", "writer vs editor กินสัดส่วนเท่าไร"

---

## 4️⃣ (Optional) Project-level Rollup

ถ้าต้องการดู total per project (หลายๆ jobs รวมกัน):

```
projects/{projectId}
  totalTokenUsage: {              ← incremental sum
    promptTokens: ...,
    completionTokens: ...,
    totalTokens: ...,
    estimatedCostUsd: 0.42,      ← คำนวณจาก rate × tokens
  }
```

อัปเดตตอน job complete:
```typescript
await projectRef.update({
  "totalTokenUsage.totalTokens": FieldValue.increment(jobTotal),
  "totalTokenUsage.estimatedCostUsd": FieldValue.increment(jobCostUsd),
});
```

### Cost calculation (Gemini 2.5 Flash pricing)
```typescript
// rates per 1M tokens (ตรวจ pricing ล่าสุดที่ ai.google.dev/pricing)
const GEMINI_2_5_FLASH = {
  inputPer1M: 0.075,   // USD
  outputPer1M: 0.30,
};

const cost =
  (promptTokens / 1_000_000) * GEMINI_2_5_FLASH.inputPer1M +
  (completionTokens / 1_000_000) * GEMINI_2_5_FLASH.outputPer1M;
```

---

## 5️⃣ UI แสดงผล

### A. ในหน้า Job detail (`/projects/[id]/content/jobs/[jobId]`)

```tsx
{job.tokenUsage && (
  <div className="rounded-md border bg-zinc-50 p-4">
    <h3>การใช้ Token</h3>
    <div className="grid grid-cols-3 gap-4">
      <Stat label="Prompt" value={job.tokenUsage.promptTokens} />
      <Stat label="Completion" value={job.tokenUsage.completionTokens} />
      <Stat label="รวม" value={job.tokenUsage.totalTokens} />
    </div>
    {estimatedCost && (
      <p className="text-xs text-zinc-500">
        ≈ ${estimatedCost.toFixed(4)} USD
      </p>
    )}
  </div>
)}
```

### B. (Future) Dashboard `/admin/usage` — สรุปรายเดือน per editor/project

---

## ⚠️ จุดต้องระวัง

### 1. AI Agent V3 / V2 รูปแบบต่างกัน
- **V3**: `item.tokenUsage` (camelCase, ใน root)
- **V2**: `item.usage` หรือ `item.llmOutput.tokenUsage`
- **Gemini raw**: `item.response.usageMetadata.promptTokenCount`

→ Code node ต้องลอง 3-4 path เผื่อ

### 2. Tool calls ไม่เห็น tokenUsage แยก
ถ้า AI Agent ใช้ tool (เช่น query Qdrant) — token ของ tool prompt มัก **รวม** อยู่ใน `promptTokens` แล้ว ไม่แยก

→ ถ้าอยาก track tool cost แยก ต้องดักที่ระดับ LLM node ไม่ใช่ Agent node

### 3. Failed AI call ก็กิน token
ถ้า Agent เรียก LLM แล้ว fail (เช่น content filter) → ยังคิดเงิน

→ Code node ควร capture tokenUsage ก่อน throw error

### 4. Batch write limit
Firestore batch จำกัด 500 ops → ถ้าหนังสือ 30 บท × 4 node = 120 events → OK

แต่ถ้า rollup ทุก job เข้า project รวมกัน — ใช้ transaction หรือแยก batch

### 5. ราคา rates เปลี่ยน
Google เปลี่ยนราคาเรื่อยๆ — เก็บ `model` + `tokens` ใน DB ไว้ คำนวณ cost on-the-fly จะ flexible กว่าเก็บ `cost` ตายตัว

### 6. Security — ไม่ต้องตรวจสอบ secret ซ้ำ
ใช้ callback secret เดียวกับ `/api/content/callback` อยู่แล้ว (constant-time compare) — แค่เพิ่ม field

---

## 📋 Implementation Checklist (เมื่อพร้อมทำ)

- [ ] **n8n**: ใน Code node หลังทุก AI Agent → ดึง `_tokenUsage` พร้อม metadata
- [ ] **n8n**: ในโหนดสุดท้ายก่อน callback → รวบรวม `tokenUsage[]` แนบ payload
- [ ] **Vercel**: สร้าง `src/lib/firebase/token-usage.ts` (`recordTokenUsage`)
- [ ] **Vercel**: ขยาย `/api/content/callback` — รับ + เรียก `recordTokenUsage`
- [ ] **Vercel**: types — เพิ่ม `tokenUsage` field ใน `ContentJob` type
- [ ] **UI**: หน้า job detail — แสดง stat การใช้ token
- [ ] **(Optional)** Project rollup
- [ ] **(Optional)** Admin dashboard `/admin/usage`
- [ ] **ทดสอบ**:
  - [ ] สร้างหนังสือ 1 เล่ม → ดู subcollection มี events ครบทุก node ทุกบท
  - [ ] เช็ค aggregate ตรงกับผลรวม subcollection
  - [ ] (ถ้าทำ rollup) project total ตรงกับผลรวมของทุก job

---

## 🤔 คำถามที่ควรตัดสินใจก่อนเริ่ม

### 1. เก็บแค่ aggregate หรือเก็บ event-level ด้วย?
- **Aggregate อย่างเดียว** → เร็ว ประหยัด storage แต่วิเคราะห์ลึกไม่ได้
- **มี subcollection ด้วย** (แนะนำ) → flexible แต่ doc reads เพิ่ม

### 2. คำนวณ cost ตอนเขียน หรือ on-the-fly?
- **ตอนเขียน** → คงที่ แต่ rate เปลี่ยนแล้วเก่า
- **On-the-fly** (แนะนำ) → reflect ราคาปัจจุบัน แต่ต้อง maintain rate table

### 3. แสดงให้ editor เห็นหรือเฉพาะ admin?
- **Editor เห็น** → transparent, รู้ว่าหนังสือของตัวเองกินเท่าไร
- **Admin only** → ป้องกัน confuse editor (เห็นเลขแล้วกังวล)

→ ค่าเริ่มต้นแนะนำ: **Editor เห็นเฉพาะ tokens ของ job ตัวเอง / Admin เห็น dashboard รวม**

---

## 🔗 References

- Gemini pricing: https://ai.google.dev/pricing
- n8n AI Agent V3 docs: https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/
- Firestore batch writes limit: 500 ops/batch
- FieldValue.increment(): https://firebase.google.com/docs/firestore/manage-data/add-data#increment_a_numeric_value
