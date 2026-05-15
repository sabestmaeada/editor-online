import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { getUserProfile } from "@/lib/firebase/users";
import { rejectUser } from "@/lib/firebase/admin-users";
import { logAuthEvent } from "@/lib/firebase/auth-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ uid: string }> };

/**
 * POST /api/admin/users/[uid]/reject
 * Body: { reason?: string }
 *
 * Admin-only. Marks a pending user as rejected. Keeps the Firestore doc
 * and the Firebase Auth account intact for audit purposes — use
 * DELETE /api/admin/users/[uid] to permanently delete.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const caller = await getCurrentUserProfile();
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { uid } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";
  const reason = reasonRaw.slice(0, 280) || undefined;

  const target = await getUserProfile(uid);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    await rejectUser({ uid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Rejection failed";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  await logAuthEvent({
    headers: req.headers,
    uid: caller.uid,
    email: caller.email,
    eventType: "user-reject",
    provider: "system",
    success: true,
    targetUid: uid,
    targetEmail: target.email,
    ...(reason !== undefined ? { rejectReason: reason } : {}),
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
