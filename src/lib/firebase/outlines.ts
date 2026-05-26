import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { db, PROJECTS_COLLECTION } from "./firestore-admin";
import {
  OUTLINE_NODE_TYPES,
  type Outline,
  type OutlineFormInput,
  type OutlineNode,
  type OutlineStatus,
} from "@/lib/types";

/**
 * Firestore data layer for outlines.
 *
 * Path: projects/{projectId}/outline/current
 *
 * We use the literal id "current" so the path is deterministic — there's
 * always at most one outline per project (Q1=A), and we never need a
 * "which outline is active?" lookup. Future versioning could move to
 * projects/{id}/outline/{outlineId} without breaking call sites that
 * just always pass "current".
 */

const OUTLINE_SUB = "outline";
const CURRENT_ID = "current";

function outlineRef(projectId: string) {
  return db
    .collection(PROJECTS_COLLECTION)
    .doc(projectId)
    .collection(OUTLINE_SUB)
    .doc(CURRENT_ID);
}

/** Fetch the project's outline, or null if no outline has been
 *  generated yet. */
export async function getOutline(projectId: string): Promise<Outline | null> {
  const snap = await outlineRef(projectId).get();
  if (!snap.exists) return null;
  return docToOutline(projectId, snap.data() ?? {});
}

/** Create or overwrite the outline. Since Q1=A we only ever store one
 *  outline per project, so "create new" === "overwrite existing". */
export async function upsertOutline(
  projectId: string,
  input: {
    createdBy: string;
    status: OutlineStatus;
    formInput: OutlineFormInput;
    nodes: OutlineNode[];
    n8nMeta?: Outline["n8nMeta"];
  },
): Promise<Outline> {
  const now = Timestamp.now();

  // Preserve createdAt if doc already exists (so reruns don't reset
  // the original generation time — useful for the audit trail).
  const existing = await outlineRef(projectId).get();
  const createdAt =
    existing.exists && existing.data()?.createdAt instanceof Timestamp
      ? (existing.data()?.createdAt as Timestamp)
      : now;

  const data: Outline = {
    projectId,
    createdBy: input.createdBy,
    createdAt,
    updatedAt: now,
    status: input.status,
    formInput: input.formInput,
    nodes: input.nodes,
    ...(input.n8nMeta ? { n8nMeta: input.n8nMeta } : {}),
  };

  await outlineRef(projectId).set(data);
  return data;
}

/** Patch the outline tree only (used by the editor's Save button).
 *  Refuses to update if the outline has been finalised — once Phase 2
 *  content generation kicks off, the outline is locked. */
export async function updateOutlineNodes(
  projectId: string,
  nodes: OutlineNode[],
): Promise<Outline> {
  const ref = outlineRef(projectId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new Error("Outline not found");
    }
    const data = snap.data() ?? {};
    if (data.status === "finalized") {
      throw new Error(
        "Outline is finalised (Phase 2 already started); editing is locked",
      );
    }
    const now = Timestamp.now();
    tx.update(ref, {
      nodes,
      // Once user edits a "ready" outline, it stays "ready" — only
      // generate-content moves it to "finalized".
      status: "ready",
      updatedAt: now,
    });
    return docToOutline(projectId, { ...data, nodes, status: "ready", updatedAt: now });
  });
}

/** Mark outline as failed (after n8n returned an error). Preserves the
 *  formInput snapshot so the user can retry without re-typing. */
export async function markOutlineFailed(
  projectId: string,
  createdBy: string,
  formInput: OutlineFormInput,
): Promise<void> {
  const now = Timestamp.now();
  await outlineRef(projectId).set({
    projectId,
    createdBy,
    createdAt: now,
    updatedAt: now,
    status: "failed",
    formInput,
    nodes: [],
  } satisfies Outline);
}

/**
 * Create / overwrite the outline doc in "generating" state. Called by the
 * outline-generate API BEFORE firing the n8n webhook, so the callback
 * handler has something to update when n8n eventually calls back.
 *
 * The `requestId` is stored in `n8nMeta.requestId` and used by the
 * callback handler to reject stale callbacks: if the user retries
 * outline generation while the first one is still in flight, the first
 * callback must NOT clobber the second request's "generating" doc.
 */
export async function markOutlineGenerating(
  projectId: string,
  input: {
    createdBy: string;
    formInput: OutlineFormInput;
    requestId: string;
  },
): Promise<void> {
  const now = Timestamp.now();
  const ref = outlineRef(projectId);
  const existing = await ref.get();
  const createdAt =
    existing.exists && existing.data()?.createdAt instanceof Timestamp
      ? (existing.data()?.createdAt as Timestamp)
      : now;

  // Use set() not update() — retrying after a previous "failed" outline
  // should fully replace the doc. We also intentionally drop any prior
  // contentJob breadcrumb (this is a brand-new outline generation —
  // the old content job no longer corresponds to it).
  await ref.set({
    projectId,
    createdBy: input.createdBy,
    createdAt,
    updatedAt: now,
    status: "generating",
    formInput: input.formInput,
    nodes: [],
    n8nMeta: { requestId: input.requestId },
  } satisfies Outline);
}

/**
 * Apply the n8n callback result for a successful outline generation.
 *
 * Race-safety: caller passes the `requestId` from the callback payload;
 * we only update if it matches the requestId we stored when starting
 * the generation. This stops a stale callback (user retried while
 * original was still in flight) from clobbering the newer attempt.
 *
 * Returns:
 *   - "applied"  — update committed
 *   - "stale"    — requestId mismatch, callback ignored (no-op)
 *   - "missing"  — outline doc doesn't exist (deleted, malformed callback)
 */
export async function markOutlineReady(
  projectId: string,
  input: {
    requestId: string;
    nodes: OutlineNode[];
    meta?: Outline["n8nMeta"];
  },
): Promise<"applied" | "stale" | "missing"> {
  const ref = outlineRef(projectId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "missing" as const;
    const data = snap.data() ?? {};
    const storedRequestId =
      typeof (data.n8nMeta as { requestId?: unknown })?.requestId === "string"
        ? ((data.n8nMeta as { requestId: string }).requestId)
        : null;
    if (storedRequestId !== input.requestId) {
      return "stale" as const;
    }
    // Don't downgrade a "finalized" outline either — if the user somehow
    // started content gen before the callback arrived (shouldn't happen
    // since finalize requires status="ready", but be defensive).
    if (data.status === "finalized") {
      return "stale" as const;
    }
    const now = Timestamp.now();
    tx.update(ref, {
      status: "ready",
      nodes: input.nodes,
      updatedAt: now,
      ...(input.meta
        ? {
            n8nMeta: {
              // keep requestId so future stale-check still works
              requestId: input.requestId,
              ...input.meta,
            },
          }
        : {}),
    });
    return "applied" as const;
  });
}

/**
 * Apply the n8n callback result for a FAILED outline generation. Same
 * requestId guard as `markOutlineReady`. Preserves the formInput
 * snapshot from the generating doc so the user can retry.
 */
export async function markOutlineFailedFromCallback(
  projectId: string,
  input: {
    requestId: string;
    error?: string | null;
  },
): Promise<"applied" | "stale" | "missing"> {
  const ref = outlineRef(projectId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "missing" as const;
    const data = snap.data() ?? {};
    const storedRequestId =
      typeof (data.n8nMeta as { requestId?: unknown })?.requestId === "string"
        ? ((data.n8nMeta as { requestId: string }).requestId)
        : null;
    if (storedRequestId !== input.requestId) {
      return "stale" as const;
    }
    if (data.status === "finalized") {
      return "stale" as const;
    }
    const now = Timestamp.now();
    tx.update(ref, {
      status: "failed",
      updatedAt: now,
      // keep nodes=[] (we never populated them) — don't touch existing nodes
      // in case some race left them set.
      nodes: [],
      n8nMeta: {
        requestId: input.requestId,
        ...(input.error ? { error: input.error.slice(0, 500) } : {}),
      },
    });
    return "applied" as const;
  });
}

export async function deleteOutline(projectId: string): Promise<void> {
  await outlineRef(projectId).delete();
}

/**
 * Repair the `contentJob` pointer + outline status after a content
 * job has been deleted. Callers should pass:
 *
 *   - `deletedJobId` — the id that was just removed.
 *   - `replacementJobId` — the id of the next-most-recent surviving
 *     job for this project, or `null` if none remain.
 *
 * Behaviour:
 *   - If the outline's pointer wasn't aimed at the deleted job → no-op.
 *   - If `replacementJobId` is set → swap the pointer + bump
 *     `updatedAt`; outline stays "finalized".
 *   - If `replacementJobId` is null → clear the pointer entirely AND
 *     revert status from "finalized" back to "ready" so the user can
 *     edit the outline again and start a fresh content job.
 *
 * Idempotent: safe to call multiple times. Best-effort: catches and
 * swallows errors so a failed repair doesn't block the surrounding
 * delete flow.
 */
export async function unlinkOutlineFromDeletedJob(
  projectId: string,
  deletedJobId: string,
  replacementJobId: string | null,
): Promise<void> {
  try {
    const ref = outlineRef(projectId);
    const snap = await ref.get();
    if (!snap.exists) return;
    const data = snap.data() ?? {};
    const currentJobId = (
      data.contentJob as { jobId?: string } | undefined
    )?.jobId;
    if (currentJobId !== deletedJobId) return; // pointing elsewhere — nothing to repair

    const now = Timestamp.now();
    if (replacementJobId) {
      await ref.update({
        contentJob: {
          jobId: replacementJobId,
          startedAt: now,
        },
        updatedAt: now,
      });
    } else {
      // No surviving jobs → clear pointer + revert lock so user can
      // edit outline again.
      const { FieldValue } = await import("firebase-admin/firestore");
      await ref.update({
        contentJob: FieldValue.delete(),
        status: "ready",
        updatedAt: now,
      });
    }
  } catch (e) {
    console.warn(
      `[outlines] unlinkOutlineFromDeletedJob failed (project=${projectId} deletedJob=${deletedJobId}):`,
      e,
    );
  }
}

/** Phase 2 entry: lock outline to `finalized` + leave a breadcrumb to
 *  the contentJob. Caller is responsible for creating the ContentJob
 *  doc first so the jobId is real.
 *
 *  Once finalized, the outline is read-only in the editor (see
 *  `updateOutlineNodes`, which rejects writes when status is
 *  "finalized"). A future "unlock" endpoint would need to revert it. */
export async function finalizeOutlineWithJob(
  projectId: string,
  jobId: string,
): Promise<void> {
  const ref = outlineRef(projectId);
  await ref.update({
    status: "finalized",
    updatedAt: Timestamp.now(),
    contentJob: {
      jobId,
      startedAt: Timestamp.now(),
    },
  });
}

/* ─────────────────── helpers ─────────────────── */

function docToOutline(
  projectId: string,
  data: Record<string, unknown>,
): Outline {
  return {
    projectId,
    createdBy: stringField(data.createdBy, ""),
    createdAt: timestampField(data.createdAt),
    updatedAt: timestampField(data.updatedAt),
    status: statusField(data.status),
    formInput: formInputField(data.formInput),
    nodes: Array.isArray(data.nodes)
      ? (data.nodes as OutlineNode[]).map(coerceNode)
      : [],
    ...(data.n8nMeta ? { n8nMeta: data.n8nMeta as Outline["n8nMeta"] } : {}),
    ...(data.contentJob
      ? { contentJob: data.contentJob as Outline["contentJob"] }
      : {}),
  };
}

function statusField(v: unknown): OutlineStatus {
  if (
    v === "generating" ||
    v === "ready" ||
    v === "failed" ||
    v === "finalized"
  ) {
    return v;
  }
  // Defensive default — old docs without a status get treated as ready
  return "ready";
}

function stringField(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function timestampField(v: unknown): Timestamp {
  return v instanceof Timestamp ? v : Timestamp.now();
}

function formInputField(v: unknown): OutlineFormInput {
  const r = (v ?? {}) as Partial<OutlineFormInput>;
  return {
    bookTitle: typeof r.bookTitle === "string" ? r.bookTitle : "",
    chapterCount: typeof r.chapterCount === "number" ? r.chapterCount : 0,
    pageCount: typeof r.pageCount === "number" ? r.pageCount : 0,
    bookPurpose: typeof r.bookPurpose === "string" ? r.bookPurpose : "",
    bookHighlights: typeof r.bookHighlights === "string" ? r.bookHighlights : "",
    targetAudience:
      typeof r.targetAudience === "string" ? r.targetAudience : "",
    // Tone library snapshot (Phase 1.5) — optional; null when user
    // didn't pick a tone in the outline form.
    toneId:
      typeof r.toneId === "string" && r.toneId.length > 0 ? r.toneId : null,
    toneName:
      typeof r.toneName === "string" && r.toneName.length > 0
        ? r.toneName
        : null,
  };
}

function coerceNode(raw: unknown): OutlineNode {
  const r = (raw ?? {}) as Partial<OutlineNode>;
  const type = (OUTLINE_NODE_TYPES as readonly string[]).includes(
    String(r.type),
  )
    ? (r.type as OutlineNode["type"])
    : "p";
  return {
    id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
    type,
    text: typeof r.text === "string" ? r.text : "",
    children: Array.isArray(r.children) ? r.children.map(coerceNode) : [],
  };
}
