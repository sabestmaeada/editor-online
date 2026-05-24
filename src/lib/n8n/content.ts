import "server-only";
import { randomUUID } from "crypto";
import type { FlatChapter } from "@/lib/content/flatten-outline";

/**
 * n8n content-generation adapter — Phase 2.
 *
 * Wraps the single HTTP round-trip to the `/create-book-content`
 * webhook. n8n responds 202 immediately and processes the chapters in
 * the background, calling our `/api/content/callback` endpoint per
 * chapter (see CONTENT-GENERATION-DESIGN.md §4 for the contract).
 *
 * This file is the ONLY place that knows the webhook URL + secret —
 * everywhere else throws N8nContentError so the API layer can map
 * cleanly to user-facing 4xx/5xx.
 */

const SECRET_HEADER = "X-Content-Secret";

/** Soft timeout for the initial POST to n8n. The webhook just queues
 *  the work + returns 202; long delays here mean n8n is unhealthy. */
const TIMEOUT_MS = 30_000;

export class N8nContentError extends Error {
  readonly code:
    | "MISSING_ENV"
    | "TIMEOUT"
    | "NETWORK"
    | "HTTP"
    | "INVALID_RESPONSE";
  readonly httpStatus?: number;
  readonly detail?: unknown;

  constructor(
    code: N8nContentError["code"],
    message: string,
    extra?: { httpStatus?: number; detail?: unknown },
  ) {
    super(message);
    this.code = code;
    this.httpStatus = extra?.httpStatus;
    this.detail = extra?.detail;
  }
}

export type StartContentJobInput = {
  jobId: string;
  callbackUrl: string;
  callbackSecret: string;
  bookTitle: string;
  systemPrompt: string;
  ownerUid: string;
  toneId: string | null;
  chapters: FlatChapter[];
};

export type StartContentJobResult = {
  /** Echo of the requestId we generated client-side and forwarded as
   *  an X-Request-Id header. Useful for log correlation. */
  requestId: string;
  durationMs: number;
};

/**
 * POST the job to n8n. Returns once n8n acknowledges (HTTP 2xx) —
 * actual generation runs asynchronously, with progress reported via
 * `/api/content/callback`.
 *
 * The body shape matches CONTENT-GENERATION-DESIGN.md §4.2 exactly.
 */
export async function startContentJob(
  input: StartContentJobInput,
): Promise<StartContentJobResult> {
  const url = process.env.N8N_CONTENT_WEBHOOK_URL;
  const secret = process.env.N8N_CONTENT_SECRET;
  if (!url || !secret) {
    throw new N8nContentError(
      "MISSING_ENV",
      "N8N_CONTENT_WEBHOOK_URL or N8N_CONTENT_SECRET is not configured",
    );
  }

  const requestId = randomUUID();
  const startedAt = Date.now();

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Body — strictly the fields n8n needs. We do NOT include the
  // composed systemPrompt's individual layers (tone, default, custom)
  // — only the already-composed string. n8n shouldn't need to think
  // about composition.
  const body = JSON.stringify({
    jobId: input.jobId,
    callbackUrl: input.callbackUrl,
    callbackSecret: input.callbackSecret,
    bookTitle: input.bookTitle,
    systemPrompt: input.systemPrompt,
    ownerUid: input.ownerUid,
    toneId: input.toneId,
    chapters: input.chapters,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SECRET_HEADER]: secret,
        "X-Request-Id": requestId,
      },
      body,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutHandle);
    if (e instanceof Error && e.name === "AbortError") {
      throw new N8nContentError(
        "TIMEOUT",
        `n8n content webhook timed out after ${TIMEOUT_MS}ms`,
      );
    }
    throw new N8nContentError(
      "NETWORK",
      e instanceof Error ? e.message : String(e),
    );
  }
  clearTimeout(timeoutHandle);

  if (!res.ok) {
    const text = await safeText(res);
    throw new N8nContentError(
      "HTTP",
      `n8n content webhook returned HTTP ${res.status}`,
      { httpStatus: res.status, detail: text.slice(0, 500) },
    );
  }

  // n8n responds with 202 (or 200) — we don't care about the body
  // contents. Try to parse but tolerate empty.
  try {
    await res.text();
  } catch {
    /* ignore */
  }

  return {
    requestId,
    durationMs: Date.now() - startedAt,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
