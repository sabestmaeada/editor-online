import "server-only";
import type {
  OutlineFormInput,
  OutlineNode,
  OutlineNodeType,
} from "@/lib/types";
import { OUTLINE_NODE_TYPES } from "@/lib/types";
import { randomUUID } from "crypto";

/**
 * n8n outline-generation adapter.
 *
 * Wraps a single HTTP round-trip to the n8n webhook:
 *   - Sends form data + an internal requestId so we can correlate logs
 *   - Adds the static secret token (X-Outline-Secret) so the webhook can
 *     reject unauthenticated callers
 *   - Validates the response shape strictly before we trust it
 *
 * All errors are normalised into N8nError so the API layer can map them
 * to user-facing 4xx/5xx without leaking n8n internals.
 */

/** Header that the n8n Webhook node must require via "Header Auth". */
const SECRET_HEADER = "X-Outline-Secret";

/** Soft client-side timeout for the outline webhook. n8n + LLM should
 *  return within ~30s; longer than this and something is wrong. We cap
 *  below Vercel's 60s function timeout to leave room for the rest of
 *  the request (auth, audit, Firestore writes). */
const TIMEOUT_MS = 45_000;

export class N8nError extends Error {
  readonly code:
    | "MISSING_ENV"
    | "TIMEOUT"
    | "NETWORK"
    | "HTTP"
    | "INVALID_RESPONSE";
  readonly httpStatus?: number;
  readonly detail?: unknown;

  constructor(
    code: N8nError["code"],
    message: string,
    extra?: { httpStatus?: number; detail?: unknown },
  ) {
    super(message);
    this.code = code;
    this.httpStatus = extra?.httpStatus;
    this.detail = extra?.detail;
  }
}

/**
 * The adapter accepts TWO response formats for forward compatibility:
 *
 * Format A (proposed clean contract):
 *   { outline: { nodes: [...] }, meta?: {...} }
 *
 * Format B (n8n native — what the current workflow actually returns):
 *   [{ output: { title, pages, content: [{ chapter, title, content, topics }] } }]
 *
 * Format B is wrapped in an array because n8n's "Respond to Webhook" node
 * passes through each execution result. Inside `output.content`, each
 * chapter has a flat shape with `topics: string[]`; we transform those into
 * our nested OutlineNode tree (chapter → [p summary, h2 per topic]).
 *
 * If the workflow is later cleaned up to return Format A directly, no
 * code change is needed.
 */
type N8nFormatAResponse = {
  outline: { nodes: OutlineNode[] };
  meta?: { requestId?: string; model?: string; tokensUsed?: number };
};

type N8nChapter = {
  chapter?: string | number;
  title?: string;
  content?: string; // chapter summary
  topics?: string[];
};

type N8nFormatBItem = {
  output?: {
    title?: string;
    pages?: string;
    content?: N8nChapter[];
    meta?: { requestId?: string; model?: string; tokensUsed?: number };
  };
};

export type GenerateOutlineResult = {
  nodes: OutlineNode[];
  meta: {
    requestId: string;
    durationMs: number;
    model?: string;
    tokensUsed?: number;
  };
};

/**
 * Call the n8n outline webhook and return a validated outline tree.
 *
 * The request body uses English keys (matching `OutlineFormInput`)
 * because Q-confirm-1 settled on a Webhook node (not formTrigger) — so
 * we can serialise our internal type 1:1 without translating to the
 * Thai field labels of the old formTrigger.
 */
export async function generateOutline(
  input: OutlineFormInput,
): Promise<GenerateOutlineResult> {
  const url = process.env.N8N_OUTLINE_WEBHOOK_URL;
  const secret = process.env.N8N_OUTLINE_SECRET;
  if (!url || !secret) {
    throw new N8nError(
      "MISSING_ENV",
      "N8N_OUTLINE_WEBHOOK_URL or N8N_OUTLINE_SECRET is not configured",
    );
  }

  const requestId = randomUUID();
  const startedAt = Date.now();

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SECRET_HEADER]: secret,
        "X-Request-Id": requestId,
      },
      body: JSON.stringify({ requestId, ...input }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutHandle);
    if (e instanceof Error && e.name === "AbortError") {
      throw new N8nError("TIMEOUT", `n8n webhook timed out after ${TIMEOUT_MS}ms`);
    }
    throw new N8nError(
      "NETWORK",
      e instanceof Error ? e.message : String(e),
    );
  }
  clearTimeout(timeoutHandle);

  if (!res.ok) {
    const text = await safeText(res);
    throw new N8nError(
      "HTTP",
      `n8n webhook returned HTTP ${res.status}`,
      { httpStatus: res.status, detail: text.slice(0, 500) },
    );
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new N8nError("INVALID_RESPONSE", "n8n response is not valid JSON");
  }

  const nodes = parseOutlineNodes(parsed);
  const meta = extractMeta(parsed);

  return {
    nodes,
    meta: {
      requestId,
      durationMs: Date.now() - startedAt,
      model: meta?.model,
      tokensUsed: meta?.tokensUsed,
    },
  };
}

/** Strict parser for the n8n response. Walks the tree recursively and
 *  rejects unknown node types / wrong shapes. We DON'T sanitize HTML
 *  here — `text` is plain text, and at render time React escapes it.
 *
 *  Accepts both Format A and Format B (see type comments above). */
function parseOutlineNodes(raw: unknown): OutlineNode[] {
  // Unwrap array (Format B is `[{ output: ... }]`)
  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!data || typeof data !== "object") {
    throw new N8nError(
      "INVALID_RESPONSE",
      "Expected object or array at top level",
    );
  }
  const r = data as Record<string, unknown>;

  // Format A: { outline: { nodes: [...] } }
  if (r.outline && typeof r.outline === "object") {
    const o = r.outline as Partial<N8nFormatAResponse["outline"]>;
    if (Array.isArray(o.nodes)) {
      return o.nodes.map((n, i) => normaliseNode(n, `outline.nodes[${i}]`));
    }
  }

  // Format B: { output: { content: [{ chapter, title, content, topics }] } }
  if (r.output && typeof r.output === "object") {
    const o = r.output as N8nFormatBItem["output"];
    if (o && Array.isArray(o.content)) {
      return o.content.map((ch, i) =>
        parseN8nChapter(ch, `output.content[${i}]`),
      );
    }
  }

  throw new N8nError(
    "INVALID_RESPONSE",
    "Response must contain either `outline.nodes` (Format A) or `output.content` (Format B)",
  );
}

/** Transform one n8n "chapter" object into an OutlineNode subtree:
 *
 *    { chapter: "01", title: "X", content: "summary…", topics: ["A","B"] }
 *
 *      becomes
 *
 *    chapter  "บทที่ 01: X"
 *      ├─ p   "summary…"        (chapter intro — Phase-1 spec calls this "p")
 *      ├─ h2  "A"
 *      └─ h2  "B"
 *
 *  Topics map to h2 because the user's outline-spec named the levels
 *  chapter → h2 → h3 → h4 → p, and "topics" sit one level below
 *  chapter. They can be promoted/demoted in the editor afterwards.
 */
function parseN8nChapter(raw: unknown, path: string): OutlineNode {
  if (!raw || typeof raw !== "object") {
    throw new N8nError("INVALID_RESPONSE", `${path}: expected object`);
  }
  const ch = raw as N8nChapter;

  const chapterNum =
    typeof ch.chapter === "string"
      ? ch.chapter
      : typeof ch.chapter === "number"
        ? String(ch.chapter).padStart(2, "0")
        : "";
  const title = typeof ch.title === "string" ? ch.title : "";
  const summary = typeof ch.content === "string" ? ch.content : "";
  const topics = Array.isArray(ch.topics) ? ch.topics : [];

  // Default chapter heading text: "บทที่ 01: ชื่อบท". User can edit this
  // in the outline editor — we just supply a sensible starting label.
  const chapterText = chapterNum
    ? `บทที่ ${chapterNum}: ${title || ""}`.trim()
    : title || "บทใหม่";

  const children: OutlineNode[] = [];

  // Summary as first child (chapter intro p)
  if (summary.trim().length > 0) {
    children.push({
      id: randomUUID(),
      type: "p",
      text: summary,
      children: [],
    });
  }

  // Each topic becomes an h2 sibling. Non-string entries are skipped
  // rather than failing the whole parse — the LLM occasionally emits
  // a stray object / number; better to lose one topic than the entire
  // outline.
  for (const t of topics) {
    if (typeof t !== "string" || t.trim().length === 0) continue;
    children.push({
      id: randomUUID(),
      type: "h2",
      text: t,
      children: [],
    });
  }

  return {
    id: randomUUID(),
    type: "chapter",
    text: chapterText,
    children,
  };
}

function normaliseNode(raw: unknown, path: string): OutlineNode {
  if (!raw || typeof raw !== "object") {
    throw new N8nError("INVALID_RESPONSE", `${path}: expected object`);
  }
  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== "string" || !isOutlineNodeType(type)) {
    throw new N8nError(
      "INVALID_RESPONSE",
      `${path}.type: must be one of ${OUTLINE_NODE_TYPES.join(", ")}`,
    );
  }
  const text = obj.text;
  if (typeof text !== "string") {
    throw new N8nError("INVALID_RESPONSE", `${path}.text: must be a string`);
  }
  const children = Array.isArray(obj.children) ? obj.children : [];
  return {
    // n8n's IDs (if any) aren't useful to us — generate fresh client-side
    // friendly UUIDs so the React tree has stable React keys + drag IDs.
    id: randomUUID(),
    type,
    text,
    children: children.map((c, i) => normaliseNode(c, `${path}.children[${i}]`)),
  };
}

function isOutlineNodeType(v: string): v is OutlineNodeType {
  return (OUTLINE_NODE_TYPES as readonly string[]).includes(v);
}

/** Look for a `meta` field either at the top level (Format A) or inside
 *  `output` (Format B). Returns undefined if neither has it. */
function extractMeta(raw: unknown): N8nFormatAResponse["meta"] {
  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!data || typeof data !== "object") return undefined;
  const r = data as Record<string, unknown>;
  const metaRaw =
    (r.meta && typeof r.meta === "object" ? r.meta : undefined) ??
    (r.output && typeof r.output === "object"
      ? (r.output as Record<string, unknown>).meta
      : undefined);
  if (!metaRaw || typeof metaRaw !== "object") return undefined;
  const m = metaRaw as Record<string, unknown>;
  return {
    requestId: typeof m.requestId === "string" ? m.requestId : undefined,
    model: typeof m.model === "string" ? m.model : undefined,
    tokensUsed:
      typeof m.tokensUsed === "number" ? m.tokensUsed : undefined,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
