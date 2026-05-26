import "server-only";
import type { StyleProfile } from "@/lib/types";

/**
 * n8n tone-library adapter — Phase 1.5.
 *
 * Wraps the two n8n webhooks defined in TONE-LIBRARY-DESIGN.md §5:
 *   - POST /tone-add-sample    (chunk → embed → Qdrant insert → analyse)
 *   - POST /tone-delete-sample (delete Qdrant points → re-analyse)
 *
 * Both require X-Tone-Secret header auth. Errors are normalised into
 * N8nToneError so the API layer can map them to user-facing 4xx/5xx
 * without leaking n8n internals.
 */

const SECRET_HEADER = "X-Tone-Secret";
const TIMEOUT_MS = 60_000; // tone analysis can take ~30s; leave headroom

export class N8nToneError extends Error {
  readonly code:
    | "MISSING_ENV"
    | "TIMEOUT"
    | "NETWORK"
    | "HTTP"
    | "INVALID_RESPONSE";
  readonly httpStatus?: number;
  readonly detail?: unknown;

  constructor(
    code: N8nToneError["code"],
    message: string,
    extra?: { httpStatus?: number; detail?: unknown },
  ) {
    super(message);
    this.code = code;
    this.httpStatus = extra?.httpStatus;
    this.detail = extra?.detail;
  }
}

/* ────────────────── /tone-add-sample ────────────────── */

export type AddSampleRequest = {
  ownerUid: string;
  toneId: string;
  sampleId: string;
  text: string;
};

export type AddSampleResult = {
  pointIds: string[];
  chunkCount: number;
  totalChars: number;
  styleProfile: StyleProfile | null;
  systemPrompt: string | null;
  /** Optional per-AI-call token usage from n8n. Each entry has the
   *  same shape as the content/outline callback's `tokenUsage[]`.
   *  The API route forwards this to `recordTokenUsage` for the tone
   *  owner. Empty array if n8n didn't include it. */
  tokenUsage: Array<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    node: string;
    model: string;
  }>;
};

/** Send a sample to n8n for embed + Qdrant insert + style analysis.
 *  Returns the Qdrant point IDs (so the caller can persist them on the
 *  sample doc) plus the updated style profile + system prompt for the
 *  tone (so the caller can cache them on the tone doc). */
export async function addSample(
  req: AddSampleRequest,
): Promise<AddSampleResult> {
  const url = process.env.N8N_TONE_ADD_WEBHOOK_URL;
  const secret = process.env.N8N_TONE_SECRET;
  if (!url || !secret) {
    throw new N8nToneError(
      "MISSING_ENV",
      "N8N_TONE_ADD_WEBHOOK_URL or N8N_TONE_SECRET not configured",
    );
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SECRET_HEADER]: secret,
      },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutHandle);
    if (e instanceof Error && e.name === "AbortError") {
      throw new N8nToneError(
        "TIMEOUT",
        `n8n tone-add-sample timed out after ${TIMEOUT_MS}ms`,
      );
    }
    throw new N8nToneError(
      "NETWORK",
      e instanceof Error ? e.message : String(e),
    );
  }
  clearTimeout(timeoutHandle);

  if (!res.ok) {
    const text = await safeText(res);
    throw new N8nToneError(
      "HTTP",
      `n8n tone-add-sample returned HTTP ${res.status}`,
      { httpStatus: res.status, detail: text.slice(0, 500) },
    );
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new N8nToneError(
      "INVALID_RESPONSE",
      "n8n tone-add-sample response is not valid JSON",
    );
  }

  return parseAddSampleResponse(raw);
}

function parseAddSampleResponse(raw: unknown): AddSampleResult {
  // n8n may wrap response in an array (depending on Respond mode).
  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!data || typeof data !== "object") {
    throw new N8nToneError(
      "INVALID_RESPONSE",
      "Expected object in tone-add-sample response",
    );
  }
  const r = data as Record<string, unknown>;

  const pointIds = Array.isArray(r.pointIds)
    ? (r.pointIds as unknown[]).map(String)
    : [];
  const chunkCount =
    typeof r.chunkCount === "number" ? r.chunkCount : pointIds.length;
  const totalChars = typeof r.totalChars === "number" ? r.totalChars : 0;

  const styleProfile = isStyleProfile(r.styleProfile) ? r.styleProfile : null;
  const systemPrompt =
    typeof r.systemPrompt === "string" ? r.systemPrompt : null;

  // Tolerant token usage parsing — n8n may or may not include it
  // depending on whether the per-node capture is wired up yet.
  const tokenUsage: AddSampleResult["tokenUsage"] = [];
  if (Array.isArray(r.tokenUsage)) {
    for (const item of r.tokenUsage as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const t = item as Record<string, unknown>;
      const promptTokens =
        typeof t.promptTokens === "number" ? t.promptTokens : 0;
      const completionTokens =
        typeof t.completionTokens === "number" ? t.completionTokens : 0;
      const totalTokens =
        typeof t.totalTokens === "number"
          ? t.totalTokens
          : promptTokens + completionTokens;
      if (totalTokens === 0) continue;
      tokenUsage.push({
        promptTokens,
        completionTokens,
        totalTokens,
        node: typeof t.node === "string" ? t.node : "unknown",
        model: typeof t.model === "string" ? t.model : "unknown",
      });
    }
  }

  return {
    pointIds,
    chunkCount,
    totalChars,
    styleProfile,
    systemPrompt,
    tokenUsage,
  };
}

function isStyleProfile(v: unknown): v is StyleProfile {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  // Loose check — we accept whatever the LLM returned and let the
  // caller decide if it's good enough to display.
  return (
    typeof p.tone === "string" || typeof p.reader_address === "string"
  );
}

/* ────────────────── /tone-delete-sample ────────────────── */

export type DeleteSampleRequest = {
  ownerUid: string;
  toneId: string;
  pointIds: string[];
};

export type DeleteSampleResult = {
  deleted: number;
  remainingChunks: number;
  styleProfile: StyleProfile | null;
  systemPrompt: string | null;
};

/** Send pointIds to n8n for Qdrant deletion + re-analysis of remaining
 *  chunks. Returns the count deleted + the recalculated style profile
 *  (or null if the tone now has zero chunks left). */
export async function deleteSample(
  req: DeleteSampleRequest,
): Promise<DeleteSampleResult> {
  const url = process.env.N8N_TONE_DELETE_WEBHOOK_URL;
  const secret = process.env.N8N_TONE_SECRET;
  if (!url || !secret) {
    throw new N8nToneError(
      "MISSING_ENV",
      "N8N_TONE_DELETE_WEBHOOK_URL or N8N_TONE_SECRET not configured",
    );
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SECRET_HEADER]: secret,
      },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutHandle);
    if (e instanceof Error && e.name === "AbortError") {
      throw new N8nToneError(
        "TIMEOUT",
        `n8n tone-delete-sample timed out after ${TIMEOUT_MS}ms`,
      );
    }
    throw new N8nToneError(
      "NETWORK",
      e instanceof Error ? e.message : String(e),
    );
  }
  clearTimeout(timeoutHandle);

  if (!res.ok) {
    const text = await safeText(res);
    throw new N8nToneError(
      "HTTP",
      `n8n tone-delete-sample returned HTTP ${res.status}`,
      { httpStatus: res.status, detail: text.slice(0, 500) },
    );
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new N8nToneError(
      "INVALID_RESPONSE",
      "n8n tone-delete-sample response is not valid JSON",
    );
  }

  return parseDeleteSampleResponse(raw);
}

function parseDeleteSampleResponse(raw: unknown): DeleteSampleResult {
  // n8n may wrap response in an array (depending on Respond mode).
  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!data || typeof data !== "object") {
    throw new N8nToneError(
      "INVALID_RESPONSE",
      "Expected object in tone-delete-sample response",
    );
  }
  const r = data as Record<string, unknown>;

  const deleted = typeof r.deleted === "number" ? r.deleted : 0;
  const remainingChunks =
    typeof r.remainingChunks === "number" ? r.remainingChunks : 0;
  const styleProfile = isStyleProfile(r.styleProfile) ? r.styleProfile : null;
  const systemPrompt =
    typeof r.systemPrompt === "string" ? r.systemPrompt : null;

  return {
    deleted,
    remainingChunks,
    styleProfile,
    systemPrompt,
  };
}

/* ────────────────── helpers ────────────────── */

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
