import "server-only";

/**
 * Security utilities for user-submitted free-form text that will
 * either (a) be displayed back, (b) be forwarded to an external LLM
 * via the n8n webhook, or (c) be cached and reused as a future LLM
 * system prompt.
 *
 * Two layers of defence:
 *   1. `sanitizeUserText` — strip characters that we never want to
 *      see in any of the above pipelines (control chars, zero-width
 *      Unicode, bidi overrides, inline `<script>`/`<iframe>`/etc.)
 *   2. `detectPromptInjection` — heuristic scan for phrases that
 *      look like a deliberate attempt to subvert the LLM (e.g.
 *      "ignore previous instructions"). Designed for narrow recall
 *      to keep false positives low — legitimate writing samples
 *      won't trigger.
 *
 * Use `validateUserText` to run both passes + get a normalised
 * `{ ok, text }` or `{ ok: false, reason }` discriminated union
 * suitable for direct return from an API route.
 */

/* ─────────────────── sanitiser ─────────────────── */

/**
 * Strip characters that have no legitimate place in a user-submitted
 * text body for our pipelines.
 *
 * What we remove:
 *   - ASCII control chars (0x00-0x08, 0x0B-0x0C, 0x0E-0x1F, 0x7F)
 *     — keep tab (0x09) + newline (0x0A) + CR (0x0D) so paragraph
 *     structure survives
 *   - Zero-width / invisible Unicode:
 *       U+200B  ZERO WIDTH SPACE
 *       U+200C  ZERO WIDTH NON-JOINER
 *       U+200D  ZERO WIDTH JOINER (kept for emoji/Thai? -> stripped
 *               because we ban emoji in content already and ZWJ in
 *               plain text is almost always an attack)
 *       U+2060  WORD JOINER
 *       U+FEFF  ZERO WIDTH NO-BREAK SPACE / BOM
 *   - Bidirectional override controls (these can flip rendering
 *     to disguise malicious content visually):
 *       U+202A-U+202E, U+2066-U+2069
 *   - `<script>`, `<iframe>`, `<object>`, `<embed>`, `<style>` tags
 *     AND their content — even though React escapes on render, we
 *     don't want this stored. Defence-in-depth against future
 *     `dangerouslySetInnerHTML` uses.
 *   - Inline event handler attributes (`onclick=`, `onerror=`, …)
 *     — same rationale.
 *
 * What we keep:
 *   - All other Unicode (Thai, emoji, math symbols, etc.)
 *   - Markdown / plain HTML structure that isn't dangerous
 *     (e.g. `<b>`, `<i>`, `<a href="">` — render in React as text;
 *      n8n side will treat as prose)
 *   - Whitespace formatting (newlines, indentation)
 */
export function sanitizeUserText(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw
    // 1. ASCII control chars (preserve \t \n \r)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    // 2. Zero-width / invisible
    .replace(/[​-‍⁠﻿]/g, "")
    // 3. Bidi override controls
    .replace(/[‪-‮⁦-⁩]/g, "")
    // 4. Dangerous tag pairs (case-insensitive, multiline)
    .replace(
      /<(script|iframe|object|embed|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      "",
    )
    // Self-closing variants of the same
    .replace(/<(script|iframe|object|embed|style)\b[^>]*\/?>/gi, "")
    // 5. Inline event handler attributes (on{anything}="...")
    .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, "")
    // Normalise weird CR/LF combos
    .replace(/\r\n?/g, "\n");
}

/* ─────────────────── injection detector ─────────────────── */

/**
 * Patterns that look like a deliberate attempt to subvert the
 * downstream LLM. Kept narrow — each one needs to be specific enough
 * that a normal writing sample (Thai or English) wouldn't trip it.
 *
 * Sources for these patterns: well-known jailbreak corpora + actual
 * payloads seen in OWASP LLM Top-10 docs. Phrases here are NOT
 * sensitive in themselves — they're flags that the surrounding text
 * is trying to address the model directly.
 */
const INJECTION_PATTERNS: ReadonlyArray<{ rx: RegExp; label: string }> = [
  // ── English jailbreak phrases ──
  {
    rx: /ignore (the |all |any )?(previous|prior|above|preceding) (instructions|prompts?|rules?|directions?)/i,
    label: "ignore-previous (en)",
  },
  {
    rx: /disregard (the |all )?(previous|prior|above) (instructions|prompt|context)/i,
    label: "disregard-previous (en)",
  },
  {
    rx: /you are (now |actually )?(a |an )?(new |different |unrestricted )?(ai|assistant|model|chatbot|persona)/i,
    label: "persona-override (en)",
  },
  {
    rx: /\b(act|behave|pretend|roleplay) (as|like) (a |an )?(jailbroken|uncensored|unrestricted|dan|developer mode)/i,
    label: "jailbreak-persona (en)",
  },
  // ── Special tokens from major LLMs ──
  {
    rx: /<\|im_(start|end)\|>/,
    label: "openai-chatml-token",
  },
  {
    rx: /\[INST\]|\[\/INST\]/,
    label: "llama-inst-token",
  },
  {
    rx: /<\|system\|>|<\|user\|>|<\|assistant\|>/i,
    label: "chat-role-token",
  },
  // ── Thai jailbreak phrases (less common but worth catching) ──
  {
    rx: /(เพิกเฉย|ละเลย|ละเว้น|ลืม).{0,10}(คำสั่ง|คำแนะนำ|ข้อกำหนด).{0,10}(ก่อน|ข้างต้น|ที่แล้ว)/,
    label: "ignore-previous (th)",
  },
  {
    rx: /ตอนนี้คุณคือ.{0,30}(AI|ผู้ช่วย|โมเดล|chatbot)/i,
    label: "persona-override (th)",
  },
];

export type PromptInjectionScan =
  | { found: false }
  | { found: true; pattern: string };

/** Scan the text for prompt-injection patterns. Returns the first
 *  match (so callers can show ONE specific reason rather than a list
 *  that might confuse an honest user). */
export function detectPromptInjection(text: string): PromptInjectionScan {
  for (const { rx, label } of INJECTION_PATTERNS) {
    if (rx.test(text)) return { found: true, pattern: label };
  }
  return { found: false };
}

/* ─────────────────── combined helper ─────────────────── */

export type ValidateResult =
  | { ok: true; text: string }
  | { ok: false; reason: string; code: "INJECTION_DETECTED" };

/**
 * Sanitise → detect injection → return either cleaned text or an
 * error object suitable for direct `NextResponse.json({...}, {status: 400})`.
 *
 * Usage in API route:
 *   const v = validateUserText(input);
 *   if (!v.ok) {
 *     return NextResponse.json({ error: v.reason, code: v.code }, { status: 400 });
 *   }
 *   const cleanText = v.text;
 */
export function validateUserText(raw: string): ValidateResult {
  const cleaned = sanitizeUserText(raw);
  const scan = detectPromptInjection(cleaned);
  if (scan.found) {
    return {
      ok: false,
      code: "INJECTION_DETECTED",
      reason:
        "ตรวจพบรูปแบบข้อความที่ดูเหมือนพยายามแทรกคำสั่งให้ AI " +
        "(prompt injection). กรุณาแก้ไขข้อความก่อนส่งใหม่. " +
        `[pattern: ${scan.pattern}]`,
    };
  }
  return { ok: true, text: cleaned };
}
