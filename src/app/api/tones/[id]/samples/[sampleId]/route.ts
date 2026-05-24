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
//   2. Qdrant points referenced by the sample (n8n adapter — MOCK)
//
// On the spec (Q-Tone-2 = auto-analyze), if any samples remain after
// deletion the tone's styleProfile should be re-analysed. The mock
// adapter doesn't currently re-analyse; once the real /tone-delete-sample
// webhook is wired we'll get the fresh profile back here.
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

  // 1. Delete Qdrant points via n8n (MOCK for now)
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

  // 3. If n8n returned a fresh profile (real adapter), cache it.
  //    For mock — n8nResult.styleProfile is null, so this no-ops.
  if (n8nResult.styleProfile !== null || n8nResult.systemPrompt !== null) {
    await updateTone(id, {
      styleProfile: n8nResult.styleProfile,
      systemPrompt: n8nResult.systemPrompt,
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
