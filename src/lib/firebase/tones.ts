import "server-only";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import {
  db,
  TONES_COLLECTION,
  TONE_SAMPLES_SUB,
} from "./firestore-admin";
import type {
  ToneStyle,
  ToneSample,
  StyleProfile,
  ToneStatus,
  SampleSource,
} from "@/lib/types";

/**
 * Firestore data layer for the tone library.
 *
 * Schema:
 *   tones/{toneId}                  → ToneStyle (metadata + cached profile)
 *   tones/{toneId}/samples/{sId}    → ToneSample (text + Qdrant point refs)
 *
 * Permissions are NOT enforced here — call sites in /api/tones/* must
 * gate first via tone-access helpers. These functions assume the caller
 * has already been authorised.
 */

const DEFAULT_QDRANT_COLLECTION = "writing_styles";

/* ─────────────────── ToneStyle CRUD ─────────────────── */

export type CreateToneInput = {
  ownerUid: string;
  ownerEmail: string;
  name: string;
  description: string;
  createdBy: string; // usually === ownerUid
};

export async function createTone(input: CreateToneInput): Promise<ToneStyle> {
  const now = Timestamp.now();
  const ref = db.collection(TONES_COLLECTION).doc(); // auto id
  const data: ToneStyle = {
    id: ref.id,
    ownerUid: input.ownerUid,
    ownerEmail: input.ownerEmail,
    name: input.name,
    description: input.description,
    qdrantCollection: DEFAULT_QDRANT_COLLECTION,
    sampleCount: 0,
    totalChunks: 0,
    status: "active",
    styleProfile: null,
    systemPrompt: null,
    lastAnalyzedAt: null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(data);
  return data;
}

export async function getTone(toneId: string): Promise<ToneStyle | null> {
  const snap = await db.collection(TONES_COLLECTION).doc(toneId).get();
  if (!snap.exists) return null;
  return docToTone(toneId, snap.data() ?? {});
}

/** List tones owned by a specific user. Status filter defaults to
 *  "active" (archived hidden) — callers can pass null to see all. */
export async function listTonesByOwner(
  ownerUid: string,
  options: { status?: ToneStatus | null } = {},
): Promise<ToneStyle[]> {
  const status = options.status === undefined ? "active" : options.status;
  let query = db
    .collection(TONES_COLLECTION)
    .where("ownerUid", "==", ownerUid)
    .orderBy("updatedAt", "desc");
  if (status !== null) {
    query = query.where("status", "==", status);
  }
  const snap = await query.get();
  return snap.docs.map((d) => docToTone(d.id, d.data() ?? {}));
}

/** Admin-only: list every tone across all users. Use sparingly — no
 *  pagination yet; fine for the scale we expect (≤ a few hundred). */
export async function listAllTones(
  options: { status?: ToneStatus | null } = {},
): Promise<ToneStyle[]> {
  const status = options.status === undefined ? "active" : options.status;
  let query = db
    .collection(TONES_COLLECTION)
    .orderBy("updatedAt", "desc") as FirebaseFirestore.Query;
  if (status !== null) {
    query = query.where("status", "==", status);
  }
  const snap = await query.get();
  return snap.docs.map((d) => docToTone(d.id, d.data() ?? {}));
}

export type UpdateToneInput = Partial<{
  name: string;
  description: string;
  status: ToneStatus;
  styleProfile: StyleProfile | null;
  systemPrompt: string | null;
  lastAnalyzedAt: Timestamp | null;
}>;

export async function updateTone(
  toneId: string,
  patch: UpdateToneInput,
): Promise<ToneStyle> {
  const ref = db.collection(TONES_COLLECTION).doc(toneId);
  const now = Timestamp.now();
  await ref.update({ ...patch, updatedAt: now });
  const snap = await ref.get();
  return docToTone(toneId, snap.data() ?? {});
}

/** Admin-only ownership transfer. ownerEmail + ownerUid update together
 *  so listTonesByOwner still works for the new owner. */
export async function transferToneOwnership(
  toneId: string,
  newOwnerUid: string,
  newOwnerEmail: string,
): Promise<ToneStyle> {
  return updateTone(toneId, {
    // Cast — updateTone's type only accepts the public-edit fields,
    // but ownership change is the same Firestore update.
  } as UpdateToneInput).then(async () => {
    const ref = db.collection(TONES_COLLECTION).doc(toneId);
    await ref.update({
      ownerUid: newOwnerUid,
      ownerEmail: newOwnerEmail,
      updatedAt: Timestamp.now(),
    });
    const snap = await ref.get();
    return docToTone(toneId, snap.data() ?? {});
  });
}

/** Hard delete — removes tone doc + all sub-collection samples.
 *  Caller is responsible for issuing Qdrant point deletes via the n8n
 *  adapter BEFORE calling this (so we don't end up with orphan vectors). */
export async function deleteTone(toneId: string): Promise<void> {
  const ref = db.collection(TONES_COLLECTION).doc(toneId);
  // Delete all samples first
  const samplesSnap = await ref.collection(TONE_SAMPLES_SUB).get();
  const batch = db.batch();
  for (const s of samplesSnap.docs) batch.delete(s.ref);
  batch.delete(ref);
  await batch.commit();
}

/** Used by the user-deletion guard. Returns count of NON-archived
 *  tones — archived ones are considered safe to leave around. */
export async function countTonesByOwner(ownerUid: string): Promise<number> {
  const snap = await db
    .collection(TONES_COLLECTION)
    .where("ownerUid", "==", ownerUid)
    .where("status", "==", "active")
    .count()
    .get();
  return snap.data().count;
}

/* ─────────────────── ToneSample CRUD ─────────────────── */

export type AddSampleInput = {
  toneId: string;
  text: string;
  qdrantPointIds: string[];
  source: SampleSource;
  fileName: string | null;
  uploadedBy: string;
};

export async function addSampleRecord(
  input: AddSampleInput,
): Promise<ToneSample> {
  const toneRef = db.collection(TONES_COLLECTION).doc(input.toneId);
  const sampleRef = toneRef.collection(TONE_SAMPLES_SUB).doc();
  const now = Timestamp.now();
  const sample: ToneSample = {
    id: sampleRef.id,
    text: input.text,
    textPreview: input.text.slice(0, 200),
    textLength: input.text.length,
    qdrantPointIds: input.qdrantPointIds,
    source: input.source,
    fileName: input.fileName,
    uploadedBy: input.uploadedBy,
    uploadedAt: now,
  };
  // Two writes in a batch: sample + counter increments on parent.
  const batch = db.batch();
  batch.set(sampleRef, sample);
  batch.update(toneRef, {
    sampleCount: FieldValue.increment(1),
    totalChunks: FieldValue.increment(input.qdrantPointIds.length),
    updatedAt: now,
  });
  await batch.commit();
  return sample;
}

export async function listSamples(toneId: string): Promise<ToneSample[]> {
  const snap = await db
    .collection(TONES_COLLECTION)
    .doc(toneId)
    .collection(TONE_SAMPLES_SUB)
    .orderBy("uploadedAt", "desc")
    .get();
  return snap.docs.map((d) => docToSample(d.id, d.data() ?? {}));
}

export async function getSample(
  toneId: string,
  sampleId: string,
): Promise<ToneSample | null> {
  const snap = await db
    .collection(TONES_COLLECTION)
    .doc(toneId)
    .collection(TONE_SAMPLES_SUB)
    .doc(sampleId)
    .get();
  if (!snap.exists) return null;
  return docToSample(sampleId, snap.data() ?? {});
}

export async function deleteSampleRecord(
  toneId: string,
  sampleId: string,
): Promise<void> {
  const toneRef = db.collection(TONES_COLLECTION).doc(toneId);
  const sampleRef = toneRef.collection(TONE_SAMPLES_SUB).doc(sampleId);
  const sampleSnap = await sampleRef.get();
  if (!sampleSnap.exists) return;
  const sample = sampleSnap.data() as ToneSample;
  const batch = db.batch();
  batch.delete(sampleRef);
  batch.update(toneRef, {
    sampleCount: FieldValue.increment(-1),
    totalChunks: FieldValue.increment(-(sample.qdrantPointIds?.length ?? 0)),
    updatedAt: Timestamp.now(),
  });
  await batch.commit();
}

/* ─────────────────── helpers ─────────────────── */

function docToTone(id: string, data: Record<string, unknown>): ToneStyle {
  return {
    id,
    ownerUid: stringField(data.ownerUid),
    ownerEmail: stringField(data.ownerEmail),
    name: stringField(data.name),
    description: stringField(data.description),
    qdrantCollection: stringField(data.qdrantCollection, DEFAULT_QDRANT_COLLECTION),
    sampleCount: numberField(data.sampleCount),
    totalChunks: numberField(data.totalChunks),
    status: statusField(data.status),
    styleProfile: (data.styleProfile ?? null) as StyleProfile | null,
    systemPrompt: data.systemPrompt
      ? String(data.systemPrompt)
      : null,
    lastAnalyzedAt:
      data.lastAnalyzedAt instanceof Timestamp ? data.lastAnalyzedAt : null,
    createdBy: stringField(data.createdBy),
    createdAt: timestampField(data.createdAt),
    updatedAt: timestampField(data.updatedAt),
  };
}

function docToSample(id: string, data: Record<string, unknown>): ToneSample {
  return {
    id,
    text: stringField(data.text),
    textPreview: stringField(data.textPreview),
    textLength: numberField(data.textLength),
    qdrantPointIds: Array.isArray(data.qdrantPointIds)
      ? (data.qdrantPointIds as unknown[]).map(String)
      : [],
    source: data.source === "file" ? "file" : "paste",
    fileName: data.fileName ? String(data.fileName) : null,
    uploadedBy: stringField(data.uploadedBy),
    uploadedAt: timestampField(data.uploadedAt),
  };
}

function stringField(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function numberField(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function timestampField(v: unknown): Timestamp {
  return v instanceof Timestamp ? v : Timestamp.now();
}
function statusField(v: unknown): ToneStatus {
  return v === "archived" ? "archived" : "active";
}
