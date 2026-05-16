import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  adminApp,
  adminAuth,
  SESSION_COOKIE_NAME,
} from "@/lib/firebase/admin";
import {
  db,
  PROJECT_MEMBERS_COLLECTION,
  USERS_COLLECTION,
} from "@/lib/firebase/firestore-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_LEN = 2;
const MAX_LEN = 60;

/**
 * PUT /api/users/me/display-name
 * Body: { displayName: string }
 *
 * Self-service rename. Updates:
 *  1. Firestore `users/{uid}.displayName`
 *  2. Firebase Auth `displayName` (so next session token sees new value)
 *  3. All `projectMembers` docs for this uid (denormalized snapshot kept in
 *     sync — best effort, doesn't roll back the primary write if it fails)
 *
 * No audit log — display name is cosmetic, not security-relevant.
 */
export async function PUT(req: NextRequest) {
  const store = await cookies();
  const sessionCookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let uid: string;
  try {
    const claims = await adminAuth.verifySessionCookie(sessionCookie, true);
    uid = claims.uid;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    displayName?: unknown;
  };
  const raw =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (raw.length < MIN_LEN || raw.length > MAX_LEN) {
    return NextResponse.json(
      { error: `Display name must be ${MIN_LEN}-${MAX_LEN} characters` },
      { status: 400 },
    );
  }
  // Disallow control chars and pure whitespace runs from showing as
  // weird names in members lists. (Don't be too restrictive — Thai/CJK
  // characters and most symbols are fine.)
  if (/[\x00-\x1f\x7f]/.test(raw)) {
    return NextResponse.json(
      { error: "Display name contains invalid characters" },
      { status: 400 },
    );
  }

  // 1. Primary write — Firestore
  await db.collection(USERS_COLLECTION).doc(uid).update({
    displayName: raw,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 2. Sync Firebase Auth (best-effort — won't break anything if fails)
  await getAuth(adminApp)
    .updateUser(uid, { displayName: raw })
    .catch(() => {});

  // 3. Cascade to denormalized project memberships (best-effort)
  let cascadeCount = 0;
  try {
    const snap = await db
      .collection(PROJECT_MEMBERS_COLLECTION)
      .where("uid", "==", uid)
      .get();
    if (!snap.empty) {
      // Firestore batch limit is 500. Members count per user is small in
      // this app (<<500) so a single batch is fine.
      const batch = db.batch();
      snap.docs.forEach((doc) => {
        batch.update(doc.ref, { displayName: raw });
      });
      await batch.commit();
      cascadeCount = snap.size;
    }
  } catch {
    // Cascade failures don't roll back the primary rename — the user's
    // own profile is what matters most, and members docs will get the
    // new name the next time they're updated.
  }

  return NextResponse.json({
    ok: true,
    displayName: raw,
    cascadeMembershipUpdates: cascadeCount,
  });
}
