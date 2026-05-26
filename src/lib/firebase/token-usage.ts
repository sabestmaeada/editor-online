import "server-only";
import {
  AggregateField,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import { db, USERS_COLLECTION } from "./firestore-admin";
import {
  calculateCostUsd,
  normaliseModelName,
} from "@/lib/content/token-pricing";
import type { TokenUsageEvent } from "@/lib/types";

/**
 * Per-user token usage tracking.
 *
 * Data model — see CONTENT-GENERATION-DESIGN / TOKEN-USAGE-TRACKING.md:
 *
 *   users/{uid}
 *     totalTokenUsage: { promptTokens, completionTokens, totalTokens,
 *                       estimatedCostUsd, eventCount, updatedAt }
 *
 *   users/{uid}/tokenUsage/{eventId}
 *     source: "content" | "outline" | "tone"
 *     node, jobId, projectId, chapter, model
 *     promptTokens, completionTokens, totalTokens
 *     estimatedCostUsd
 *     createdAt
 *
 * The aggregate on the user doc is updated atomically with
 * FieldValue.increment so concurrent callbacks (e.g. 5 chapter
 * callbacks in flight) don't lose updates. We don't try to keep the
 * aggregate transactionally consistent with the subcollection — a
 * mid-write crash could leave them out of sync by a single event,
 * which is acceptable for a "rough cost" view.
 *
 * Callers must verify the uid is authoritative before calling — there
 * are no permission checks here. In practice that means:
 *   - content callback: reads job.createdBy after the secret check
 *   - outline callback: reads outline.createdBy after the secret check
 *   - tone analysis: tone.ownerUid resolved from the API request
 */

/** Input shape from a callback handler. `estimatedCostUsd` is computed
 *  inside `recordTokenUsage`, and `createdAt` is stamped server-side
 *  — callers supply only the raw counts + metadata. */
export type TokenUsageInput = Omit<
  TokenUsageEvent,
  "createdAt" | "model" | "estimatedCostUsd"
> & {
  /** Raw model name from n8n — may include "models/" prefix. The
   *  helper strips it before persisting. */
  model: string;
};

/**
 * Record one or more LLM-call usage events for a user.
 *
 * Per-event docs go into `users/{uid}/tokenUsage`. The user-doc
 * aggregate is updated with `FieldValue.increment` in the same batch.
 *
 * Best-effort: errors are caught + logged. Callers shouldn't surface
 * usage-tracking failures to end users (it's billing telemetry, not
 * core flow). Returns the number of events successfully queued in the
 * batch — `0` means the call failed and nothing was persisted.
 */
export async function recordTokenUsage(
  uid: string,
  events: TokenUsageInput[],
): Promise<number> {
  if (!uid || events.length === 0) return 0;

  try {
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const subcol = userRef.collection("tokenUsage");
    const now = Timestamp.now();

    // Tally for the aggregate increment (one update, not per-event,
    // to halve the write count).
    let aggPrompt = 0;
    let aggCompletion = 0;
    let aggTotal = 0;
    let aggCost = 0;
    let costsWereKnown = 0;

    const batch = db.batch();

    for (const ev of events) {
      const model = normaliseModelName(ev.model);
      const cost = calculateCostUsd(
        model,
        ev.promptTokens,
        ev.completionTokens,
      );
      if (cost === null) {
        // Log once per unknown model — surfaces missing pricing
        // entries without spamming on every event.
        console.warn(
          `[token-usage] unknown model "${model}" — cost not computed (uid=${uid})`,
        );
      } else {
        aggCost += cost;
        costsWereKnown += 1;
      }

      aggPrompt += ev.promptTokens;
      aggCompletion += ev.completionTokens;
      aggTotal += ev.totalTokens;

      const doc: TokenUsageEvent = {
        source: ev.source,
        node: ev.node,
        jobId: ev.jobId,
        projectId: ev.projectId,
        chapter: ev.chapter,
        model,
        promptTokens: ev.promptTokens,
        completionTokens: ev.completionTokens,
        totalTokens: ev.totalTokens,
        estimatedCostUsd: cost,
        createdAt: now,
      };
      batch.set(subcol.doc(), doc);
    }

    // Single aggregate update — atomic increment so concurrent
    // callbacks safely sum into the same field.
    batch.set(
      userRef,
      {
        totalTokenUsage: {
          promptTokens: FieldValue.increment(aggPrompt),
          completionTokens: FieldValue.increment(aggCompletion),
          totalTokens: FieldValue.increment(aggTotal),
          estimatedCostUsd: FieldValue.increment(aggCost),
          eventCount: FieldValue.increment(events.length),
          updatedAt: now,
        },
      },
      { merge: true },
    );

    await batch.commit();

    // Log a one-liner for observability (cost watchers can grep logs).
    if (costsWereKnown > 0) {
      console.log(
        `[token-usage] uid=${uid} +${events.length} events ` +
          `(${aggTotal} tokens, ~$${aggCost.toFixed(4)})`,
      );
    } else {
      console.log(
        `[token-usage] uid=${uid} +${events.length} events ` +
          `(${aggTotal} tokens, cost unknown)`,
      );
    }

    return events.length;
  } catch (e) {
    console.error("[token-usage] recordTokenUsage failed:", e);
    return 0;
  }
}

/**
 * Parse a raw `tokenUsage[]` array from an n8n callback payload into
 * the shape `recordTokenUsage` expects.
 *
 * n8n sends items like:
 *   {
 *     promptTokens, completionTokens, totalTokens,
 *     node: "writer", chapter: 1, model: "models/gemini-3.5-flash",
 *     timestamp: "..."
 *   }
 *
 * We're tolerant to:
 *   - Missing fields (default to 0 / null)
 *   - Non-array (returns empty)
 *   - Items with bad types (skipped, not throwing)
 *
 * The caller supplies `source`, `jobId`, `projectId` since those come
 * from the route's context, not the n8n payload.
 */
export function parseTokenUsageArray(
  raw: unknown,
  context: {
    source: TokenUsageEvent["source"];
    jobId: string | null;
    projectId: string | null;
    chapterFallback?: number | null;
  },
): TokenUsageInput[] {
  if (!Array.isArray(raw)) return [];
  const out: TokenUsageInput[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;

    const promptTokens = numberOrZero(r.promptTokens);
    const completionTokens = numberOrZero(r.completionTokens);
    const totalTokens =
      numberOrZero(r.totalTokens) || promptTokens + completionTokens;
    if (totalTokens === 0) continue; // skip zero-token entries

    const node =
      typeof r.node === "string" && r.node.length > 0 ? r.node : "unknown";
    const model = typeof r.model === "string" ? r.model : "unknown";

    let chapter: number | null = null;
    if (typeof r.chapter === "number" && Number.isFinite(r.chapter)) {
      chapter = r.chapter;
    } else if (
      context.chapterFallback !== undefined &&
      context.chapterFallback !== null
    ) {
      chapter = context.chapterFallback;
    }

    out.push({
      source: context.source,
      node,
      jobId: context.jobId,
      projectId: context.projectId,
      chapter,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
    });
  }

  return out;
}

function numberOrZero(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
    return Math.floor(v);
  }
  return 0;
}

/**
 * Aggregate one user's token usage scoped to a single project.
 *
 * Used by the project detail page to show the viewer their own
 * spend on this project. Multi-user projects need per-user roll-up
 * across members; that's a separate query for the owner view.
 *
 * Implementation: Firestore aggregation query (sum + count) runs
 * server-side — counts as ONE read in billing, no matter how many
 * events. Falls back to zero if the user has no usage on this
 * project yet (empty subcollection or no matching projectId).
 */
export type ProjectTokenSummary = {
  /** Sum of `promptTokens` across all matching events. */
  promptTokens: number;
  /** Sum of `completionTokens`. */
  completionTokens: number;
  /** Sum of `totalTokens`. */
  totalTokens: number;
  /** Sum of `estimatedCostUsd`. Events with unknown model contribute 0. */
  estimatedCostUsd: number;
  /** Number of LLM calls counted. */
  eventCount: number;
};

export async function getProjectTokenSummary(
  uid: string,
  projectId: string,
): Promise<ProjectTokenSummary> {
  const empty: ProjectTokenSummary = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    eventCount: 0,
  };
  if (!uid || !projectId) return empty;

  const subcol = db
    .collection(USERS_COLLECTION)
    .doc(uid)
    .collection("tokenUsage");

  // Path 1 — server-side aggregation (cheap: 1 read regardless of
  // matching event count). Some firebase-admin versions / runtimes
  // sometimes return zero from `.sum()` even when matching docs
  // exist, so we treat this as the FAST path and fall through to a
  // manual sum if it comes back suspiciously empty.
  try {
    const filteredSnap = await subcol
      .where("projectId", "==", projectId)
      .aggregate({
        promptTokens: AggregateField.sum("promptTokens"),
        completionTokens: AggregateField.sum("completionTokens"),
        totalTokens: AggregateField.sum("totalTokens"),
        estimatedCostUsd: AggregateField.sum("estimatedCostUsd"),
        eventCount: AggregateField.count(),
      })
      .get();
    const data = filteredSnap.data();
    const eventCount = numberOrZero(data.eventCount);
    if (eventCount > 0) {
      return {
        promptTokens: numberOrZero(data.promptTokens),
        completionTokens: numberOrZero(data.completionTokens),
        totalTokens: numberOrZero(data.totalTokens),
        estimatedCostUsd: nonNegativeFloat(data.estimatedCostUsd),
        eventCount,
      };
    }
  } catch (e) {
    // Aggregate query failed (could be SDK / runtime quirk) — fall
    // through to the manual path rather than returning zero.
    console.warn(
      `[token-usage] aggregate failed for uid=${uid} projectId=${projectId}, falling back to manual:`,
      e,
    );
  }

  // Path 2 — manual sum via a plain query. Slower (N reads) but
  // bulletproof: if there's a doc with matching projectId, this WILL
  // find it. We cap at 1000 docs as a safety guard.
  try {
    const docsSnap = await subcol
      .where("projectId", "==", projectId)
      .limit(1000)
      .get();

    if (docsSnap.empty) {
      // Genuine empty — sniff the subcollection so logs distinguish
      // "no usage yet" from "wrong projectId on events".
      try {
        const totalSnap = await subcol
          .aggregate({ total: AggregateField.count() })
          .get();
        const totalAll = numberOrZero(totalSnap.data().total);
        if (totalAll > 0) {
          console.warn(
            `[token-usage] manual query also empty — uid=${uid} ` +
              `projectId="${projectId}" subcollectionTotal=${totalAll} ` +
              `(events exist but none match this projectId)`,
          );
        }
      } catch {
        /* swallow */
      }
      return empty;
    }

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let estimatedCostUsd = 0;
    for (const doc of docsSnap.docs) {
      const d = doc.data();
      promptTokens += numberOrZero(d.promptTokens);
      completionTokens += numberOrZero(d.completionTokens);
      totalTokens += numberOrZero(d.totalTokens);
      const c = nonNegativeFloat(d.estimatedCostUsd);
      estimatedCostUsd += c;
    }

    console.log(
      `[token-usage] manual sum uid=${uid} projectId="${projectId}" ` +
        `events=${docsSnap.size} totalTokens=${totalTokens} ` +
        `cost=$${estimatedCostUsd.toFixed(4)}`,
    );

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
      eventCount: docsSnap.size,
    };
  } catch (e) {
    console.warn(
      `[token-usage] manual query failed for uid=${uid} projectId=${projectId}:`,
      e,
    );
    return empty;
  }
}

/** Lenient numeric parser for fractional cost (USD). */
function nonNegativeFloat(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

/**
 * Delete every event in `users/{uid}/tokenUsage` plus the
 * `totalTokenUsage` field on the user doc. Used by the
 * delete-account flow (Firestore doesn't cascade subcollections).
 *
 * Batched in chunks of 500 (Firestore batch limit). Returns the
 * number of event docs deleted.
 */
export async function deleteAllTokenUsageForUser(
  uid: string,
): Promise<number> {
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const subcol = userRef.collection("tokenUsage");

  // Stream in pages — usage subcollections can be very large for
  // heavy users.
  let totalDeleted = 0;
  while (true) {
    const snap = await subcol.limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    totalDeleted += snap.size;
    if (snap.size < 500) break;
  }

  // Clear the aggregate field. We use FieldValue.delete() so the
  // user doc itself isn't disturbed (other fields stay intact).
  await userRef
    .update({
      totalTokenUsage: FieldValue.delete(),
    })
    .catch(() => {
      // ignore — user doc might already be gone if this is part of
      // a delete-account cascade.
    });

  return totalDeleted;
}
