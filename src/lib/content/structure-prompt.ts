/**
 * Layer 2 system prompt — minimal universal STRUCTURE rules.
 *
 * Only contains rules that are TRULY universal across every book
 * genre and that the sanitize pipeline / book template depend on:
 *
 *   - language of output (Thai)
 *   - heading hierarchy syntax (# ## ### ####)
 *   - emoji + ASCII art bans
 *
 * Genre-specific structural patterns (image placeholders, tables,
 * code blocks, step-by-step, workshops, etc.) are OPT-IN templates
 * that admin curates and editors apply via chips in the content-gen
 * form. Keeping them out of Layer 2 means a novel/comedy book won't
 * have the LLM hallucinate tables and screenshots just because the
 * system prompt mentioned them.
 *
 * Defense-in-depth: even if the LLM emits a table or image without
 * the user opting in, the assemble pipeline still cleans up split
 * tables (`mergeAdjacentTables`) and the chapter renderer ignores
 * unknown image syntax silently.
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

## ข้อจำกัด
- ห้ามใช้ emoji ในเนื้อหาทั้งหมด
- ห้ามใช้ ASCII art / box drawing characters`;

/**
 * Separator joined between the 3 layers when composing the final
 * system prompt. Markdown horizontal rule — helps the LLM recognise
 * section boundaries.
 */
export const PROMPT_LAYER_SEPARATOR = "\n\n---\n\n";
