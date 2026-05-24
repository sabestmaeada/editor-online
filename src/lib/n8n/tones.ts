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
 *
 * Delete is currently MOCKED (returns success without calling n8n) —
 * see the comment in deleteSample below. Swap to real fetch when the
 * /tone-delete-sample workflow is wired up in n8n.
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

  return {
    pointIds,
    chunkCount,
    totalChars,
    styleProfile,
    systemPrompt,
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

/* ────────────────── /tone-delete-sample (MOCK) ────────────────── */

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

/**
 * MOCK implementation — does NOT call n8n yet.
 *
 * Workflow 2 (/tone-delete-sample) hasn't been built in n8n yet. The
 * spec is locked (TONE-LIBRARY-DESIGN.md §5.3) but we ship the Vercel
 * side first so the user can wire n8n side at their pace.
 *
 * Side-effects when this mock is in place:
 *   - Qdrant points are NOT actually deleted (they remain in the
 *     collection until n8n side is built and ran)
 *   - Style profile is NOT re-analysed (stays at last value)
 *   - sampleCount / totalChunks in Firestore still get decremented
 *     by the caller — so UI counts are correct
 *
 * To swap to real adapter when webhook is ready:
 *   1. Set env vars N8N_TONE_DELETE_WEBHOOK_URL + (reuse N8N_TONE_SECRET)
 *   2. Replace the body of deleteSample() with a real fetch — see
 *      addSample() for the pattern
 *   3. Remove the "MOCK" comments and this header
 *   4. (Optional) Run a one-off Qdrant cleanup for points that were
 *      "deleted" in Firestore while the mock was in place
 */
export async function deleteSample(
  req: DeleteSampleRequest,
): Promise<DeleteSampleResult> {
  // MOCK: pretend the delete succeeded immediately. Returns deleted
  // count = pointIds.length so the caller's UI count is consistent.
  // styleProfile + systemPrompt stay null — the caller is expected to
  // keep the previously cached values on the tone doc (we just don't
  // refresh them on this mock path).
  return {
    deleted: req.pointIds.length,
    remainingChunks: 0,
    styleProfile: null,
    systemPrompt: null,
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
