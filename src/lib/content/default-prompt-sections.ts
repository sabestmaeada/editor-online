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
- ห้ามใช้ **ตัวหนา** แทนหัวข้อ ให้ใช้ # ตามลำดับชั้นเสมอ`;

/**
 * Convenience export: separator used by the composer between layers.
 * Exposed here so tests + UI preview can match the exact composed
 * output without duplicating the constant.
 */
export const PROMPT_LAYER_SEPARATOR = "\n\n---\n\n";
