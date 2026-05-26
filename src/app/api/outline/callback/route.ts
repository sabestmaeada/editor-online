import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  markOutlineReady,
  markOutlineFailedFromCallback,
  getOutline,
} from "@/lib/firebase/outlines";
import {
  parseOutlineNodes,
  extractMeta,
  N8nError,
} from "@/lib/n8n/outline";
import { Timestamp } from "firebase-admin/firestore";
import {
  AUTH_EVENTS_COLLECTION,
  PROJECTS_COLLECTION,
  USERS_COLLECTION,
  db,
} from "@/lib/firebase/firestore-admin";
import { RETENTION_DAYS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Outline trees can be sizeable for big books (30+ chapters w/ topics
// each) but stay well within Vercel's default 1MB body limit. Set a
// modest extended duration for the Firestore transaction + audit.
export const maxDuration = 60;

// ────────────────────────────────────────────────────────────
// POST /api/outline/callback (P2-S42)
//
// Server-to-server endpoint hit by n8n once the outline tree is ready
// (or generation has failed). No user session — auth is the shared
// secret `N8N_OUTLINE_SECRET`.
//
// Request body (clean contract):
//   {
//     "projectId":  "<projectId>",
//     "requestId":  "<uuid set by Vercel when starting the job>",
//     "status":     "done" | "failed",
//     // For status="done", one of (both shapes accepted, see
//     // src/lib/n8n/outline.ts):
//     "outline":    { "nodes": [...] }      // Format A
//     "output":     { "content": [...] }    // Format B
//     // Optional metadata:
//     "meta":       { "model": "...", "tokensUsed": 1234 }
//     // For status="failed":
//     "error":      "free-text reason"
//   }
//
// Race-safety: the outline doc carries a `n8nMeta.requestId` we set
// before firing the webhook. If the requestId in the callback doesn't
// match (user retried before original came back), we ignore the
// callback so the newer "generating" doc isn't clobbered.
// ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Verify shared secret (constant-time)
  const secretHeader =
    req.headers.get("x-outline-secret") ?? req.headers.get("X-Outline-Secret") ?? "";
  const expected = process.env.N8N_OUTLINE_SECRET ?? "";
  if (!expected) {
    console.error("[outline-callback] N8N_OUTLINE_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }
  if (!constantTimeEqual(secretHeader, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseCallbackBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { projectId, requestId, status, error } = parsed.data;

  // 3. Load the outline (for audit context + early sanity check). The
  //    actual race check happens inside the transaction in
  //    markOutlineReady / markOutlineFailedFromCallback.
  const existing = await getOutline(projectId);
  if (!existing) {
    return NextResponse.json(
      { error: "Outline not found for projectId" },
      { status: 404 },
    );
  }

  if (status === "failed") {
    const result = await markOutlineFailedFromCallback(projectId, {
      requestId,
      error,
    });
    if (result === "missing") {
      return NextResponse.json({ error: "Outline missing" }, { status: 404 });
    }
    if (result === "stale") {
      // Stale callback for a request that's been superseded — quietly
      // accept (don't 4xx the n8n retry) so it stops calling back.
      return NextResponse.json({ ok: true, applied: false, stale: true });
    }
    await logCallbackAudit({
      uid: existing.createdBy,
      eventType: "outline-generate-failed",
      projectId,
      success: false,
      errorCode: "N8N_FAILED",
    });
    return NextResponse.json({ ok: true, applied: true, status: "failed" });
  }

  // status === "done" — parse the outline tree.
  let nodes;
  try {
    // Pass the whole body so the parser can find either `outline.nodes`
    // (Format A) or `output.content` (Format B). Top-level fields like
    // projectId / requestId / status are simply ignored by the parser.
    nodes = parseOutlineNodes(body);
  } catch (e) {
    const message =
      e instanceof N8nError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    // Treat as a failed outline — same race-safe write path.
    await markOutlineFailedFromCallback(projectId, {
      requestId,
      error: `Parse error: ${message}`,
    });
    await logCallbackAudit({
      uid: existing.createdBy,
      eventType: "outline-generate-failed",
      projectId,
      success: false,
      errorCode: "PARSE_ERROR",
    });
    return NextResponse.json(
      { error: "Invalid outline payload", detail: message },
      { status: 400 },
    );
  }

  const meta = extractMeta(body);
  const result = await markOutlineReady(projectId, {
    requestId,
    nodes,
    meta,
  });

  if (result === "missing") {
    return NextResponse.json({ error: "Outline missing" }, { status: 404 });
  }
  if (result === "stale") {
    return NextResponse.json({ ok: true, applied: false, stale: true });
  }

  await logCallbackAudit({
    uid: existing.createdBy,
    eventType: "outline-generate-success",
    projectId,
    success: true,
  });

  return NextResponse.json({ ok: true, applied: true, status: "ready" });
}

/* ───────────────────── parsing ───────────────────── */

type ParsedCallback = {
  projectId: string;
  requestId: string;
  status: "done" | "failed";
  error: string | null;
};

type ParseResult =
  | { ok: true; data: ParsedCallback }
  | { ok: false; error: string };

function parseCallbackBody(raw: unknown): ParseResult {
  // n8n's "Respond to Webhook" sometimes wraps the body in an array.
  // For the callback path we expect a clean object; accept the wrapped
  // form too as a forgiveness measure.
  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Body must be an object" };
  }
  const r = data as Record<string, unknown>;

  if (typeof r.projectId !== "string" || r.projectId.length === 0) {
    return { ok: false, error: "projectId is required" };
  }
  if (typeof r.requestId !== "string" || r.requestId.length === 0) {
    return { ok: false, error: "requestId is required" };
  }
  if (r.status !== "done" && r.status !== "failed") {
    return { ok: false, error: "status must be 'done' or 'failed'" };
  }

  return {
    ok: true,
    data: {
      projectId: r.projectId,
      requestId: r.requestId,
      status: r.status,
      error: typeof r.error === "string" ? r.error.slice(0, 500) : null,
    },
  };
}

/* ───────────────────── helpers ───────────────────── */

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Lightweight audit log writer for the outline callback. Mirrors the
 * content-callback helper — we can't use `logAuthEvent` because
 * callbacks don't carry real client IP/UA (they originate from n8n).
 */
async function logCallbackAudit(input: {
  uid: string;
  eventType: "outline-generate-success" | "outline-generate-failed";
  projectId: string;
  success: boolean;
  errorCode?: string | null;
}) {
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + RETENTION_DAYS[input.eventType] * 24 * 60 * 60 * 1000,
  );

  // Best-effort enrichment — never block the callback on these reads.
  let email = "";
  let projectTitle = "";
  try {
    const userSnap = await db
      .collection(USERS_COLLECTION)
      .doc(input.uid)
      .get();
    email = String(userSnap.data()?.email ?? "");
    const projSnap = await db
      .collection(PROJECTS_COLLECTION)
      .doc(input.projectId)
      .get();
    projectTitle = String(projSnap.data()?.title ?? "");
  } catch {
    /* swallow */
  }

  await db.collection(AUTH_EVENTS_COLLECTION).add({
    uid: input.uid,
    email,
    eventType: input.eventType,
    provider: "system",
    ip: "0.0.0.0",
    ipHash: "n8n-callback",
    userAgent: "n8n-callback",
    country: null,
    region: null,
    city: null,
    success: input.success,
    errorCode: input.errorCode ?? null,
    projectId: input.projectId,
    projectTitle,
    timestamp: now,
    expiresAt,
  });
}
