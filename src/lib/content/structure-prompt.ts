/**
 * Layer 2 system prompt — strict output STRUCTURE rules.
 *
 * This layer is hard-coded + immutable per job (admin edits via PR +
 * redeploy). It contains ONLY rules that the downstream sanitize
 * pipeline + book template depend on for correctness:
 *
 *   - language of output
 *   - heading hierarchy syntax
 *   - image placeholder syntax
 *   - table syntax constraints
 *   - emoji + ASCII art bans
 *
 * Content style preferences (code block formatting, note frequency,
 * vocabulary conventions, step-by-step format, chapter length) live in
 * Layer 3 (customInstructions) and are curated as shared "Default"
 * prompt templates by admin — editors apply them by clicking chips in
 * the content-gen form. The previous hard-coded fallback was retired
 * in P2-S32 in favour of admin control.
 *
 * Edit this file via PR — changes deploy with the next Vercel build.
 * Existing ContentJob docs are NOT affected (they snapshot the composed
 * prompt at submit time).
 */

export const STRUCTURE_PROMPT = `## ภาษาเอาต์พุต
- เขียนเนื้อหาเป็นภาษาไทยทั้งหมด (ยกเว้นคำศัพท์เทคนิคและตัวอย่าง code)

## โครงสร้างหัวข้อ (Heading Hierarchy)
- หัวบท (Chapter Title) ใช้ # นำหน้า → จะแปลงเป็น <h1> ในภายหลัง
- หัวข้อหลัก (Section) ใช้ ## นำหน้า → จะแปลงเป็น <h2> ในภายหลัง
- หัวข้อรอง (Subsection) ใช้ ### นำหน้า → จะแปลงเป็น <h3> ในภายหลัง
- หัวข้อย่อย (Sub-subsection) ใช้ #### นำหน้า → จะแปลงเป็น <h4> ในภายหลัง
- ห้ามข้ามลำดับชั้น เช่น ห้ามใช้ #### โดยไม่มี ### อยู่ก่อน
- ห้ามใช้ **ตัวหนา** แทนหัวข้อ ให้ใช้ # ตามลำดับชั้นเสมอ
- ห้ามใส่ตัวเลข / ลำดับนำหน้าข้อความหัวข้อ h2, h3, h4 — ระบบจะใส่หมายเลขให้อัตโนมัติผ่าน CSS counter
  - ถูก: \`## การติดตั้ง\` · \`### ตั้งค่าเริ่มต้น\` · \`#### กรณีพิเศษ\`
  - ผิด: \`## 1. การติดตั้ง\` · \`### 1.1 ตั้งค่าเริ่มต้น\` · \`### หัวข้อที่ 2: การติดตั้ง\` · \`#### 1.1.1 กรณีพิเศษ\`
- ใช้ตัวเลข/หมายเลขในข้อความหัวข้อได้เฉพาะเมื่อเป็นส่วนหนึ่งของชื่อจริง เช่น \`## HTTP/2 และการใช้งาน\` (เลข 2 เป็นชื่อโปรโตคอล ไม่ใช่ลำดับหัวข้อ)

## รูปแบบภาพประกอบ (Image Placeholder) — ใช้เมื่อช่วยอธิบาย ไม่ต้องบังคับมี
- หนังสือเชิงเล่าเรื่อง / ตลก / เรียงความ / นิยาย / ปรัชญา **ไม่จำเป็นต้องมีภาพประกอบ**
- ใส่ image placeholder เฉพาะเมื่อภาพช่วยอธิบายได้ชัดกว่าข้อความเท่านั้น
- ถ้าจะใช้ ต้องใช้ syntax นี้เท่านั้น: \`[[IMAGE: คำอธิบายภาษาไทย | prompt_en: English description for AI generator]]\`
- ห้ามเปลี่ยน syntax นี้
- ห้ามวาง placeholder ติดกัน — ต้องมีข้อความอธิบายคั่นเสมอ
- ห้ามวาง placeholder ในย่อหน้าเดียวกับ heading ให้แยกบรรทัด

## รูปแบบตาราง (Table) — ใช้เมื่อเหมาะกับเนื้อหา ไม่ต้องบังคับมี
- ใช้ตารางเฉพาะเมื่อข้อมูลเป็น "เปรียบเทียบ / คุณสมบัติเป็นชุด / ตัวเลข / รายการที่มีหลายคอลัมน์" จริงๆ เท่านั้น
- หนังสือเล่าเรื่อง / ตลก / นิยาย / เรียงความ **ไม่จำเป็นต้องมีตาราง**
- ถ้าจะใช้ ต้องใช้ Markdown table syntax — header row + data rows อยู่ในตารางเดียวกัน
- ห้ามแยก header กับ data rows เป็น 2 ตาราง
- ห้ามสร้างตารางที่มี header แต่ไม่มี data row (empty body)
- ทุก \`|---|---|\` ต้องตามด้วย data rows ทันทีในตารางเดียวกัน

## ข้อจำกัด
- ห้ามใช้ emoji ในเนื้อหาทั้งหมด
- ห้ามใช้ ASCII art / box drawing characters`;

/**
 * Separator joined between the 3 layers when composing the final
 * system prompt. Markdown horizontal rule — helps the LLM recognise
 * section boundaries.
 */
export const PROMPT_LAYER_SEPARATOR = "\n\n---\n\n";
