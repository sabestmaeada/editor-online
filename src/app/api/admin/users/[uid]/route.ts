import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { getUserProfile } from "@/lib/firebase/users";
import {
  countProjectsOwnedBy,
  hardDeleteUser,
} from "@/lib/firebase/admin-users";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { countTonesByOwner } from "@/lib/firebase/tones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ uid: string }> };

/**
 * DELETE /api/admin/users/[uid]
 *
 * Admin-only. PERMANENT delete:
 *  - Removes the Firestore profile
 *  - Removes the Firebase Auth account
 *  - Removes all of the user's project memberships
 *
 * Blocks if the user owns any projects — admin must reassign ownership
 * first. Returns 409 with the count so the UI can show "X projects to
 * reassign".
 *
 * Admins cannot delete themselves.
 */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const caller = await getCurrentUserProfile();
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { uid } = await ctx.params;
  if (uid === caller.uid) {
    return NextResponse.json(
      { error: "Cannot delete your own account" },
      { status: 400 },
    );
  }

  const target = await getUserProfile(uid);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Block if user owns projects — admin must reassign first
  const ownedCount = await countProjectsOwnedBy(uid);
  if (ownedCount > 0) {
    return NextResponse.json(
      {
        error: `User owns ${ownedCount} project(s) — reassign ownership before deleting`,
        ownedProjects: ownedCount,
      },
      { status: 409 },
    );
  }

  // Block if user owns tones — admin must transfer or archive first
  // (Phase 1.5 / Q-Tone-2 = D). Tones contain LLM-analysed style
  // profiles + Qdrant points that are expensive to recreate; we'd
  // rather force an explicit decision than orphan the data.
  const ownedTones = await countTonesByOwner(uid);
  if (ownedTones > 0) {
    return NextResponse.json(
      {
        error: `User owns ${ownedTones} tone(s) — transfer or archive at /tones?user=${uid} before deleting`,
        ownedTones,
      },
      { status: 409 },
    );
  }

  let result;
  try {
    result = await hardDeleteUser(uid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await logAuthEvent({
    headers: req.headers,
    uid: caller.uid,
    email: caller.email,
    eventType: "user-delete",
    provider: "system",
    success: true,
    targetUid: uid,
    targetEmail: target.email,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    removedMemberships: result.removedMemberships,
  });
}
