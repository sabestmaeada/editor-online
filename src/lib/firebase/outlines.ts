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

export async function deleteOutline(projectId: string): Promise<void> {
  await outlineRef(projectId).delete();
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
