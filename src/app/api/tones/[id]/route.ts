import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveToneAccess } from "@/lib/firebase/tone-access";
import {
  updateTone,
  deleteTone,
  listSamples,
} from "@/lib/firebase/tones";
import { deleteSample as deleteSampleN8n } from "@/lib/n8n/tones";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { validateUserText } from "@/lib/security/sanitize-user-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_NAME = 100;
const MAX_DESCRIPTION = 1000;

// ────────────────────────────────────────────────────────────
// GET /api/tones/[id] — view tone + samples
// ────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const access = await resolveToneAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const samples = await listSamples(id);

  return NextResponse.json({
    tone: access.tone,
    samples,
    permissions: {
      isAdmin: access.isAdmin,
      isOwner: access.isOwner,
      canEdit: access.canEdit,
      canAddSample: access.canAddSample,
      canDelete: access.canDelete,
      canTransfer: access.canTransfer,
    },
  });
}

// ────────────────────────────────────────────────────────────
// PUT /api/tones/[id] — edit metadata (name, description) +
//                       archive/unarchive via status
// ────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const access = await resolveToneAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { name, description, status } = body as {
    name?: unknown;
    description?: unknown;
    status?: unknown;
  };

  const patch: Parameters<typeof updateTone>[1] = {};

  if (name !== undefined) {
    const v = validateUserText(typeof name === "string" ? name : "");
    if (!v.ok) {
      return NextResponse.json(
        { error: v.reason, code: v.code, field: "name" },
        { status: 400 },
      );
    }
    const s = v.text.trim();
    if (!s || s.length > MAX_NAME) {
      return NextResponse.json(
        { error: `name must be 1-${MAX_NAME} chars` },
        { status: 400 },
      );
    }
    patch.name = s;
  }
  if (description !== undefined) {
    const v = validateUserText(
      typeof description === "string" ? description : "",
    );
    if (!v.ok) {
      return NextResponse.json(
        { error: v.reason, code: v.code, field: "description" },
        { status: 400 },
      );
    }
    const s = v.text.trim();
    if (s.length > MAX_DESCRIPTION) {
      return NextResponse.json(
        { error: `description must be ≤ ${MAX_DESCRIPTION} chars` },
        { status: 400 },
      );
    }
    patch.description = s;
  }
  if (status !== undefined) {
    if (status !== "active" && status !== "archived") {
      return NextResponse.json(
        { error: "status must be 'active' or 'archived'" },
        { status: 400 },
      );
    }
    patch.status = status;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await updateTone(id, patch);

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: patch.status === "archived" ? "tone-archive" : "tone-edit",
    provider: "system",
    success: true,
    targetUid: access.tone.ownerUid,
    targetEmail: access.tone.ownerEmail,
  });

  return NextResponse.json({ tone: updated });
}

// ────────────────────────────────────────────────────────────
// DELETE /api/tones/[id] — hard delete tone + all samples
//   - Owner can delete their own
//   - Admin can delete any
//
// Flow:
//   1. Aggregate every qdrantPointId from every sample of this tone
//   2. Call n8n /tone-delete-sample once with the full pointIds list
//      → n8n removes all Qdrant points + re-analyze runs but yields
//        null (no chunks remain) which we simply ignore here
//   3. Delete Firestore docs (samples + tone)
//
// n8n failure does NOT block Firestore cleanup — we log a warning so
// ops can sweep any orphan Qdrant points later.
// ────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const access = await resolveToneAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Collect every Qdrant point ID across all samples
  const samples = await listSamples(id);
  const allPointIds = samples.flatMap((s) => s.qdrantPointIds ?? []);

  // 2. Tell n8n to delete those Qdrant points (skip if none)
  if (allPointIds.length > 0) {
    try {
      await deleteSampleN8n({
        ownerUid: access.tone.ownerUid,
        toneId: id,
        pointIds: allPointIds,
      });
    } catch (e) {
      console.warn(
        "[tone-delete] n8n Qdrant cleanup failed (continuing with Firestore delete):",
        e instanceof Error ? e.message : e,
      );
    }
  }

  // 3. Delete Firestore docs (samples sub-collection + tone doc)
  await deleteTone(id);

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "tone-delete",
    provider: "system",
    success: true,
    targetUid: access.tone.ownerUid,
    targetEmail: access.tone.ownerEmail,
  });

  return NextResponse.json({ ok: true });
}
