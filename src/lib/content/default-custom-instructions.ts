/**
 * Layer 3 default — pre-fill value for the `customInstructions` field
 * on the content submit form.
 *
 * Unlike STRUCTURE_PROMPT (Layer 2), this is user-editable per job —
 * the user can adjust length, code block conventions, note frequency,
 * etc. based on the type of book they're writing (textbook vs novel
 * vs reference).
 *
 * What lives here:
 *   - chapter length target
 *   - code block formatting conventions
 *   - note + workshop frequency
 *   - vocabulary / Thai-English glossing rules
 *   - step-by-step format
 *   - image placeholder frequency guidance
 *
 * Edit this file via PR to change the default — existing users who
 * already typed into the textarea won't be affected (they see their
 * own value, not this default).
 */

export const DEFAULT_CUSTOM_INSTRUCTIONS = `## ความยาว
- ความยาวประมาณ 3-4 หน้า A4 ต่อบท

## Code Block
- ใช้ triple backtick พร้อมระบุภาษา เช่น \`\`\`python หรือ \`\`\`javascript
- ถ้ามีชื่อไฟล์ ให้ใส่เป็น comment บรรทัดแรกตามภาษา (\`# filename.py\`, \`// filename.js\`)
- ห้ามใส่ตัวเลขบรรทัดเอง — ระบบจะใส่ให้อัตโนมัติตอนแปลงเป็น HTML
- เนื้อหา code ต้องสามารถ copy ไปรันได้จริง ไม่ใช่ pseudo code

## Note และ Workshop
- Note ใช้รูปแบบ blockquote: \`> **Note:** เนื้อหา note\` — อย่างน้อย 2 จุดต่อบท
- ท้ายบทใส่หัวข้อ \`## Workshop\` พร้อมโจทย์เป็นรายการเลข ≥ 3 ข้อ

## คำศัพท์
- ศัพท์เทคนิคต้องมีภาษาอังกฤษกำกับในวงเล็บครั้งแรกที่ปรากฏ เช่น "อัลกอริทึม (Algorithm)"
- ใช้ "ฯลฯ" หรือ "เป็นต้น" ปิดท้ายรายการที่ยังมีต่อได้
- หลีกเลี่ยงประโยคยาวเกินไป — แบ่งย่อหน้าให้อ่านง่าย

## Step-by-Step
- ทุกหัวข้อย่อยที่อธิบายการปฏิบัติ ใช้รูปแบบ: \`**ขั้นตอนที่ N: [ชื่อขั้นตอน]**\` ตามด้วยคำอธิบาย
- ห้ามรวมหลายขั้นตอนใน paragraph เดียว
- ถ้ามีปุ่ม / เมนู ให้ระบุชื่อตามที่ปรากฏใน UI เช่น "คลิกปุ่ม Save ที่มุมขวาบน"

## ภาพประกอบ
- ใส่ image placeholder ตามความเหมาะสมของเนื้อหา — จุดที่ต้องการ visual aid หรือขั้นตอนสำคัญที่อธิบายเป็นภาพได้ชัดเจนกว่าข้อความ`;
