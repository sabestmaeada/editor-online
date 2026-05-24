import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveToneAccess } from "@/lib/firebase/tone-access";
import {
  deleteSampleRecord,
  getSample,
  updateTone,
} from "@/lib/firebase/tones";
import { deleteSample as deleteSampleN8n } from "@/lib/n8n/tones";
import { logAuthEvent } from "@/lib/firebase/auth-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; sampleId: string }> };

// ────────────────────────────────────────────────────────────
// DELETE /api/tones/[id]/samples/[sampleId]
//
// Removes both:
//   1. Sample record from Firestore (Firestore CRUD)
//   2. Qdrant points referenced by the sample (n8n /tone-delete-sample)
//
// On the spec (Q-Tone-2 = auto-analyze), if any samples remain after
// deletion the tone's styleProfile is re-analysed by n8n and we cache
// the fresh profile + systemPrompt on the tone doc.
//
// n8n failures (timeout / 5xx) are logged but do NOT block Firestore
// cleanup — orphan Qdrant points may remain and need a periodic sweep.
// ────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, sampleId } = await ctx.params;

  const access = await resolveToneAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sample = await getSample(id, sampleId);
  if (!sample) {
    return NextResponse.json(
      { error: "Sample not found" },
      { status: 404 },
    );
  }

  // 1. Delete Qdrant points + re-analyze via n8n
  let n8nResult;
  try {
    n8nResult = await deleteSampleN8n({
      ownerUid: access.tone.ownerUid,
      toneId: id,
      pointIds: sample.qdrantPointIds,
    });
  } catch (e) {
    // n8n failure should NOT block Firestore cleanup — but log it so
    // ops knows there might be orphan Qdrant points.
    console.warn(
      "[tone-sample-delete] n8n adapter failed:",
      e instanceof Error ? e.message : e,
    );
    n8nResult = {
      deleted: 0,
      remainingChunks: 0,
      styleProfile: null,
      systemPrompt: null,
    };
  }

  // 2. Delete sample record (atomically updates tone counters)
  await deleteSampleRecord(id, sampleId);

  // 3. Cache the re-analyzed profile on the tone doc.
  //    If n8nResult.remainingChunks === 0, both are null → clear cache.
  //    If n8n call failed, both stay null → don't touch cache (keep
  //    previously cached profile so UI doesn't lose context).
  if (n8nResult.styleProfile !== null || n8nResult.systemPrompt !== null) {
    await updateTone(id, {
      styleProfile: n8nResult.styleProfile,
      systemPrompt: n8nResult.systemPrompt,
      lastAnalyzedAt: Timestamp.now(),
    });
  } else if (n8nResult.remainingChunks === 0 && n8nResult.deleted > 0) {
    // Last sample deleted — clear the cached profile.
    await updateTone(id, {
      styleProfile: null,
      systemPrompt: null,
      lastAnalyzedAt: Timestamp.now(),
    });
  }

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "tone-sample-delete",
    provider: "system",
    success: true,
    targetUid: access.tone.ownerUid,
    targetEmail: access.tone.ownerEmail,
  });

  return NextResponse.json({
    ok: true,
    deleted: n8nResult.deleted,
    styleProfile: n8nResult.styleProfile,
    systemPrompt: n8nResult.systemPrompt,
  });
}
