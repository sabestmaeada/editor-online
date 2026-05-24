import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveToneAccess } from "@/lib/firebase/tone-access";
import { transferToneOwnership, countTonesByOwner } from "@/lib/firebase/tones";
import { getUserProfile } from "@/lib/firebase/users";
import { logAuthEvent } from "@/lib/firebase/auth-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_TONES_PER_OWNER = 10;

// ────────────────────────────────────────────────────────────
// POST /api/tones/[id]/transfer — admin-only ownership change
//   body: { newOwnerUid: string }
// ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const access = await resolveToneAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canTransfer) {
    return NextResponse.json(
      { error: "Only admin can transfer tone ownership" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const newOwnerUid =
    body && typeof body === "object" && "newOwnerUid" in body
      ? String((body as { newOwnerUid: unknown }).newOwnerUid)
      : "";
  if (!newOwnerUid) {
    return NextResponse.json(
      { error: "newOwnerUid is required" },
      { status: 400 },
    );
  }
  if (newOwnerUid === access.tone.ownerUid) {
    return NextResponse.json(
      { error: "New owner is the same as current owner" },
      { status: 400 },
    );
  }

  const newOwner = await getUserProfile(newOwnerUid);
  if (!newOwner) {
    return NextResponse.json(
      { error: "New owner user not found" },
      { status: 404 },
    );
  }

  // Block transfer if it would push the new owner over quota
  const newOwnerCurrent = await countTonesByOwner(newOwnerUid);
  if (newOwnerCurrent >= MAX_TONES_PER_OWNER) {
    return NextResponse.json(
      {
        error: `Recipient already owns ${newOwnerCurrent} tones (max ${MAX_TONES_PER_OWNER}). Archive one first.`,
      },
      { status: 409 },
    );
  }

  const updated = await transferToneOwnership(
    id,
    newOwnerUid,
    newOwner.email,
  );

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "tone-transfer-ownership",
    provider: "system",
    success: true,
    targetUid: newOwnerUid,
    targetEmail: newOwner.email,
  });

  return NextResponse.json({ tone: updated });
}
