import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, SESSION_COOKIE_NAME } from "@/lib/firebase/admin";
import { db, USERS_COLLECTION } from "@/lib/firebase/firestore-admin";
import { isValidTrackColor } from "@/lib/colors";

export const runtime = "nodejs";

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

  const body = (await req.json().catch(() => ({}))) as { color?: unknown };
  if (!isValidTrackColor(body.color)) {
    return NextResponse.json(
      { error: "Invalid color — must be #RRGGBB hex" },
      { status: 400 },
    );
  }

  await db
    .collection(USERS_COLLECTION)
    .doc(uid)
    .update({
      trackColor: body.color,
      updatedAt: FieldValue.serverTimestamp(),
    });

  return NextResponse.json({ ok: true, color: body.color });
}
