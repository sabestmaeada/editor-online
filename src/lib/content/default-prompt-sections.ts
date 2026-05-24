/**
 * Default prompt sections (Layer 2) for Phase 2 content generation.
 *
 * This is the "always-on" instructions appended to every content-gen
 * job, between the tone-library prompt (Layer 1) and the per-job
 * custom instructions (Layer 3). See CONTENT-GENERATION-DESIGN.md §4.3
 * for the composition order.
 *
 * Edit this file via PR — changes deploy with the next Vercel build.
 * Existing ContentJob docs are NOT affected (they snapshot the composed
 * prompt at submit time).
 *
 * Keep instructions concise + concrete. Each section uses `##` so the
 * LLM treats it as a structured rule block. Don't reference variable
 * project / chapter context here — those go into the user prompt or
 * Layer 3.
 */

export const DEFAULT_PROMPT_SECTIONS = `## โครงสร้างหัวข้อ (Heading Hierarchy)
- หัวบท (Chapter Title) ใช้ # นำหน้า → จะแปลงเป็น <h1> ในภายหลัง
- หัวข้อหลัก (Section) ใช้ ## นำหน้า → จะแปลงเป็น <h2> ในภายหลัง
- หัวข้อรอง (Subsection) ใช้ ### นำหน้า → จะแปลงเป็น <h3> ในภายหลัง
- หัวข้อย่อย (Sub-subsection) ใช้ #### นำหน้า → จะแปลงเป็น <h4> ในภายหลัง
- ห้ามข้ามลำดับชั้น เช่น ห้ามใช้ #### โดยไม่มี ### อยู่ก่อน
- ห้ามใช้ **ตัวหนา** แทนหัวข้อ ให้ใช้ # ตามลำดับชั้นเสมอ

## ข้อกำหนด Code Block
- ใช้ triple backtick พร้อมระบุภาษา เช่น \`\`\`python หรือ \`\`\`javascript
- ถ้ามีชื่อไฟล์ ให้ใส่เป็น comment บรรทัดแรกตามภาษา (\`# filename.py\`, \`// filename.js\`)
- ห้ามใส่ตัวเลขบรรทัดเอง — ระบบจะใส่ให้อัตโนมัติตอนแปลงเป็น HTML
- เนื้อหา code ต้องสามารถ copy ไปรันได้จริง ไม่ใช่ pseudo code

## ข้อกำหนดภาพประกอบ (Image Placeholder)
- ใช้รูปแบบ: \`[[IMAGE: คำอธิบายภาษาไทย | prompt_en: คำอธิบายภาษาอังกฤษสำหรับ AI generator]]\`
- ตัวอย่าง: \`[[IMAGE: หน้าจอแสดงการตั้งค่าเริ่มต้น | prompt_en: Screenshot of initial setup screen with highlighted options]]\`
- ใช้ placeholder อย่างน้อย 5 จุดต่อบท สำหรับขั้นตอนสำคัญ
- ห้ามใส่ placeholder ติดกัน — ต้องมีข้อความอธิบายคั่นเสมอ
- ห้ามใส่ภาพประกอบในย่อหน้าเดียวกับ heading ให้แยกบรรทัด

## ข้อกำหนด Note และ Workshop
- Note ใช้รูปแบบ blockquote: \`> **Note:** เนื้อหา note\`
- Workshop (แบบฝึกหัด) ใช้หัวข้อ \`## Workshop\` ท้ายบท พร้อมโจทย์เป็นรายการเลข
- ใส่ Note อย่างน้อย 2 จุดต่อบท
- Workshop อย่างน้อย 3 ข้อต่อบท

## ข้อกำหนดทั่วไปด้านเนื้อหา
- ทุกศัพท์เทคนิคต้องมีภาษาอังกฤษกำกับในวงเล็บครั้งแรกที่ปรากฏ เช่น "อัลกอริทึม (Algorithm)"
- ใช้ "ฯลฯ" หรือ "เป็นต้น" ปิดท้ายรายการที่ยังมีต่อได้
- หลีกเลี่ยงประโยคยาวเกินไป — แบ่งย่อหน้าให้อ่านง่าย
- หลีกเลี่ยง emoji ภายในเนื้อหา (ใช้ได้เฉพาะใน Note label เช่น 📌)
- ห้ามใช้ ASCII art / box drawing characters

## ข้อกำหนด Step-by-Step
- ทุกหัวข้อย่อยที่อธิบายการปฏิบัติ ต้องใช้รูปแบบ Step:
  \`**ขั้นตอนที่ N: [ชื่อขั้นตอน]**\` ตามด้วยคำอธิบาย
- ห้ามรวมหลายขั้นตอนใน paragraph เดียว
- ถ้ามีปุ่ม / เมนู ให้ระบุชื่อตามที่ปรากฏใน UI เช่น "คลิกปุ่ม Save ที่มุมขวาบน"
- แต่ละ Step สำคัญควรมี image placeholder ประกอบ`;

/**
 * Convenience export: separator used by the composer between layers.
 * Exposed here so tests + UI preview can match the exact composed
 * output without duplicating the constant.
 */
export const PROMPT_LAYER_SEPARATOR = "\n\n---\n\n";
