import "server-only";
import {
  DEFAULT_PROMPT_SECTIONS,
  PROMPT_LAYER_SEPARATOR,
} from "./default-prompt-sections";

/**
 * Compose the final systemPrompt sent to the n8n content-generation
 * webhook. The three layers are joined in this order:
 *
 *   1. tonePrompt           (from the tone library — optional)
 *   2. DEFAULT_PROMPT_SECTIONS  (from code constant — always)
 *   3. customInstructions   (per-job user input — optional)
 *
 * Each layer is trimmed and the separator `PROMPT_LAYER_SEPARATOR`
 * (markdown horizontal rule) sits between layers to help the LLM
 * recognise section boundaries.
 *
 * See CONTENT-GENERATION-DESIGN.md §4.3 for the locked spec. The
 * composed result is snapshotted on the ContentJob doc, so changes
 * to DEFAULT_PROMPT_SECTIONS won't affect existing jobs.
 */
export function composeSystemPrompt(parts: {
  tonePrompt: string | null;
  customInstructions: string | null;
}): string {
  const sections: string[] = [];

  if (parts.tonePrompt && parts.tonePrompt.trim().length > 0) {
    sections.push(parts.tonePrompt.trim());
  }

  // Default layer is always present.
  sections.push(DEFAULT_PROMPT_SECTIONS.trim());

  if (parts.customInstructions && parts.customInstructions.trim().length > 0) {
    sections.push(parts.customInstructions.trim());
  }

  return sections.join(PROMPT_LAYER_SEPARATOR);
}

/**
 * Build the same composed string but with each layer wrapped in a
 * markdown header so the UI preview can show clearly-labeled sections.
 * NOT what gets sent to n8n — that uses `composeSystemPrompt` above.
 *
 * Used by:
 *   - Submit form preview ("ตัวอย่าง prompt สุดท้าย")
 *   - Job status page (show what was actually sent — uses snapshot
 *     from ContentJob.composedSystemPrompt instead)
 */
export function composeSystemPromptForPreview(parts: {
  tonePrompt: string | null;
  customInstructions: string | null;
}): string {
  const blocks: string[] = [];

  blocks.push(
    parts.tonePrompt && parts.tonePrompt.trim().length > 0
      ? `## ① สำนวน (Tone)\n${parts.tonePrompt.trim()}`
      : "## ① สำนวน (Tone)\n_(ไม่ได้เลือกสำนวน — ข้ามชั้นนี้)_",
  );

  blocks.push(`## ② ข้อกำหนดพื้นฐาน (Defaults)\n${DEFAULT_PROMPT_SECTIONS.trim()}`);

  blocks.push(
    parts.customInstructions && parts.customInstructions.trim().length > 0
      ? `## ③ คำสั่งเพิ่มเติม (Custom)\n${parts.customInstructions.trim()}`
      : "## ③ คำสั่งเพิ่มเติม (Custom)\n_(ไม่มี)_",
  );

  return blocks.join("\n\n");
}
