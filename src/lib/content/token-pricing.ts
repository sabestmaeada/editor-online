/**
 * Per-model token pricing — used to compute USD cost at write time
 * when a token-usage event is recorded. We snapshot the price into
 * the event doc so historical events keep their original cost even if
 * the rates change later.
 *
 * Source: https://ai.google.dev/pricing (last checked 2026-05-26).
 * Rates below are in USD per 1,000,000 tokens.
 *
 * When adding a new model: keep the key matching exactly what n8n
 * sends in `tokenUsage[].model`. Unknown models still record the
 * token counts but cost is null + a console warning is emitted.
 */

export type ModelPricing = {
  /** USD per 1M input (prompt) tokens. */
  inputPer1M: number;
  /** USD per 1M output (completion) tokens. */
  outputPer1M: number;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini 3.5 Flash — released May 2026, GA. Default model for the
  // content + outline workflows after the previous compat fix.
  "gemini-3.5-flash": { inputPer1M: 1.5, outputPer1M: 9.0 },

  // Gemini 2.5 Flash — older / cheaper. Used as fallback while 3.5
  // had n8n LangChain compat issues.
  "gemini-2.5-flash": { inputPer1M: 0.075, outputPer1M: 0.3 },

  // Gemini 2.5 Pro — higher-tier text model (e.g. outline fallback).
  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10.0 },

  // Embeddings model used by tone analysis + Qdrant chunking.
  // Embedding pricing is input-only (no completion).
  "gemini-embedding-2-preview": { inputPer1M: 0.025, outputPer1M: 0 },
};

/**
 * Resolve a model id from n8n (which may include the "models/" prefix)
 * down to the bare model name used as the pricing key.
 */
export function normaliseModelName(raw: string): string {
  if (!raw) return raw;
  const stripped = raw.startsWith("models/") ? raw.slice("models/".length) : raw;
  return stripped.trim();
}

/**
 * Calculate cost in USD. Returns `null` for unknown models — caller
 * can decide whether to warn / use a default rate / persist the
 * event with cost=null.
 */
export function calculateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const key = normaliseModelName(model);
  const rates = MODEL_PRICING[key];
  if (!rates) return null;
  const cost =
    (promptTokens / 1_000_000) * rates.inputPer1M +
    (completionTokens / 1_000_000) * rates.outputPer1M;
  // Round to 6 decimals — fractional cents matter for cost tracking
  // but anything beyond 6 places is noise from floating-point math.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
