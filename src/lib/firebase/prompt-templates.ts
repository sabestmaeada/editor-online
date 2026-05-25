import "server-only";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { db, PROMPT_TEMPLATES_COLLECTION } from "./firestore-admin";
import type {
  PromptTemplate,
  PromptTemplateCategory,
  PromptTemplateScope,
  PromptTemplateStatus,
} from "@/lib/types";

/**
 * Firestore data layer for prompt templates.
 *
 * Schema:
 *   promptTemplates/{id}  → PromptTemplate
 *
 * Two scopes: "personal" (owner-only) and "shared" (admin-curated,
 * visible to all editors). Permissions enforced in API layer via
 * canManagePromptTemplate / canCreateSharedTemplate from
 * `prompt-template-access.ts` — this file assumes the caller is
 * already authorised.
 */

/* ─────────────────── CRUD ─────────────────── */

export type CreatePromptTemplateInput = {
  scope: PromptTemplateScope;
  ownerUid: string;
  ownerEmail: string;
  label: string;
  category: PromptTemplateCategory;
  snippet: string;
};

export async function createPromptTemplate(
  input: CreatePromptTemplateInput,
): Promise<PromptTemplate> {
  const now = Timestamp.now();
  const ref = db.collection(PROMPT_TEMPLATES_COLLECTION).doc();
  const data: PromptTemplate = {
    id: ref.id,
    scope: input.scope,
    ownerUid: input.ownerUid,
    ownerEmail: input.ownerEmail,
    label: input.label,
    category: input.category,
    snippet: input.snippet,
    status: "active",
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(data);
  return data;
}

export async function getPromptTemplate(
  id: string,
): Promise<PromptTemplate | null> {
  const snap = await db
    .collection(PROMPT_TEMPLATES_COLLECTION)
    .doc(id)
    .get();
  if (!snap.exists) return null;
  return docToTemplate(id, snap.data() ?? {});
}

/**
 * List templates visible to an editor: their own personal templates +
 * all shared templates. Sorted by category then by usage frequency
 * (most-used first) so the most relevant chips bubble up.
 *
 * Active-only by default — archived hidden. Callers can pass status=null
 * to see all (admin-only).
 */
export async function listTemplatesForEditor(
  ownerUid: string,
  options: { status?: PromptTemplateStatus | null } = {},
): Promise<PromptTemplate[]> {
  const status = options.status === undefined ? "active" : options.status;

  // Two queries — Firestore doesn't support OR across different fields
  // without a special composite index. Two parallel reads are simpler
  // and cheap for the expected document count (≤ 50 personal + shared).
  const [personalSnap, sharedSnap] = await Promise.all([
    statusFilter(
      db
        .collection(PROMPT_TEMPLATES_COLLECTION)
        .where("scope", "==", "personal")
        .where("ownerUid", "==", ownerUid),
      status,
    ).get(),
    statusFilter(
      db
        .collection(PROMPT_TEMPLATES_COLLECTION)
        .where("scope", "==", "shared"),
      status,
    ).get(),
  ]);

  const combined: PromptTemplate[] = [];
  for (const d of personalSnap.docs) {
    combined.push(docToTemplate(d.id, d.data()));
  }
  for (const d of sharedSnap.docs) {
    combined.push(docToTemplate(d.id, d.data()));
  }

  // Sort: category alphabetical, then usageCount desc, then label asc.
  // Stable sort so the order is reproducible across reads.
  combined.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
    return a.label.localeCompare(b.label, "th");
  });
  return combined;
}

/** Admin-only — see every template in the system (across all users).
 *  Used by the /templates list page when caller has admin role. */
export async function listAllTemplates(
  options: { status?: PromptTemplateStatus | null } = {},
): Promise<PromptTemplate[]> {
  const status = options.status === undefined ? "active" : options.status;
  const snap = await statusFilter(
    db.collection(PROMPT_TEMPLATES_COLLECTION),
    status,
  )
    .orderBy("updatedAt", "desc")
    .get();
  return snap.docs.map((d) => docToTemplate(d.id, d.data()));
}

/** Count of personal templates owned by a user — used by the API to
 *  enforce the per-editor quota (50). */
export async function countPersonalTemplates(
  ownerUid: string,
): Promise<number> {
  const snap = await db
    .collection(PROMPT_TEMPLATES_COLLECTION)
    .where("scope", "==", "personal")
    .where("ownerUid", "==", ownerUid)
    .where("status", "==", "active")
    .count()
    .get();
  return snap.data().count;
}

export type UpdatePromptTemplateInput = {
  label?: string;
  category?: PromptTemplateCategory;
  snippet?: string;
  status?: PromptTemplateStatus;
  /** Admin only — re-classify a personal template as shared (or vice
   *  versa). Editor calls cannot pass this; enforce in API layer. */
  scope?: PromptTemplateScope;
};

export async function updatePromptTemplate(
  id: string,
  input: UpdatePromptTemplateInput,
): Promise<void> {
  const patch: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (input.label !== undefined) patch.label = input.label;
  if (input.category !== undefined) patch.category = input.category;
  if (input.snippet !== undefined) patch.snippet = input.snippet;
  if (input.status !== undefined) patch.status = input.status;
  if (input.scope !== undefined) patch.scope = input.scope;
  await db.collection(PROMPT_TEMPLATES_COLLECTION).doc(id).update(patch);
}

export async function deletePromptTemplate(id: string): Promise<void> {
  await db.collection(PROMPT_TEMPLATES_COLLECTION).doc(id).delete();
}

/**
 * Fire-and-forget usage tracking. Called when a user toggles a chip ON
 * in the content form — atomically increments the counter and updates
 * lastUsedAt. We don't await this in the form submit path; errors are
 * swallowed so a Firestore hiccup doesn't break the form interaction.
 */
export async function incrementTemplateUsage(id: string): Promise<void> {
  await db.collection(PROMPT_TEMPLATES_COLLECTION).doc(id).update({
    usageCount: FieldValue.increment(1),
    lastUsedAt: Timestamp.now(),
  });
}

/* ─────────────────── helpers ─────────────────── */

function statusFilter(
  q: FirebaseFirestore.Query,
  status: PromptTemplateStatus | null,
): FirebaseFirestore.Query {
  return status === null ? q : q.where("status", "==", status);
}

function docToTemplate(
  id: string,
  raw: FirebaseFirestore.DocumentData,
): PromptTemplate {
  return {
    id,
    scope: (raw.scope ?? "personal") as PromptTemplateScope,
    ownerUid: typeof raw.ownerUid === "string" ? raw.ownerUid : "",
    ownerEmail: typeof raw.ownerEmail === "string" ? raw.ownerEmail : "",
    label: typeof raw.label === "string" ? raw.label : "",
    category: (raw.category ?? "custom") as PromptTemplateCategory,
    snippet: typeof raw.snippet === "string" ? raw.snippet : "",
    status: (raw.status ?? "active") as PromptTemplateStatus,
    usageCount: typeof raw.usageCount === "number" ? raw.usageCount : 0,
    lastUsedAt:
      raw.lastUsedAt instanceof Timestamp ? raw.lastUsedAt : null,
    createdAt:
      raw.createdAt instanceof Timestamp ? raw.createdAt : Timestamp.now(),
    updatedAt:
      raw.updatedAt instanceof Timestamp ? raw.updatedAt : Timestamp.now(),
  };
}
