import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import {
  canCreateTone,
  canSeeOtherUsersTones,
} from "@/lib/firebase/tone-access";
import {
  createTone,
  listAllTones,
  listTonesByOwner,
  countTonesByOwner,
} from "@/lib/firebase/tones";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { validateUserText } from "@/lib/security/sanitize-user-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME = 100;
const MAX_DESCRIPTION = 1000;
const MAX_TONES_PER_OWNER = 10; // per spec Q-Tone-7

// ────────────────────────────────────────────────────────────
// GET /api/tones — list tones
//   ?user=<uid>  (admin only) — filter to specific owner
//   ?user=all    (admin only) — list across all users
//   default: list caller's own tones
// ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userParam = req.nextUrl.searchParams.get("user");

  // Admin-only filters
  if (userParam && userParam !== profile.uid && !canSeeOtherUsersTones(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let tones;
  if (userParam === "all" && canSeeOtherUsersTones(profile)) {
    tones = await listAllTones();
  } else {
    const ownerUid = userParam || profile.uid;
    tones = await listTonesByOwner(ownerUid);
  }

  return NextResponse.json({ tones });
}

// ────────────────────────────────────────────────────────────
// POST /api/tones — create a new tone (owner=caller)
// ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canCreateTone(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit — tone creation is cheap but a runaway script
  // could fill the quota cap (10) instantly otherwise.
  const limit = checkRateLimit(
    `tone-create:${profile.uid}`,
    30,
    60 * 60 * 1000,
  );
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  // Quota check
  const owned = await countTonesByOwner(profile.uid);
  if (owned >= MAX_TONES_PER_OWNER) {
    return NextResponse.json(
      {
        error: `เกินจำนวน tone สูงสุด (${MAX_TONES_PER_OWNER}). archive อันที่ไม่ใช้แล้วก่อนสร้างใหม่`,
      },
      { status: 409 },
    );
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
  const { name, description } = body as {
    name?: unknown;
    description?: unknown;
  };

  // Sanitise + injection check for name + description (P2-S37). Both
  // strings reach the LLM downstream (description as side context),
  // so block prompt-injection at the gate.
  const nameRaw = typeof name === "string" ? name : "";
  const descRaw = typeof description === "string" ? description : "";
  const nameV = validateUserText(nameRaw);
  if (!nameV.ok) {
    return NextResponse.json(
      { error: nameV.reason, code: nameV.code, field: "name" },
      { status: 400 },
    );
  }
  const descV = validateUserText(descRaw);
  if (!descV.ok) {
    return NextResponse.json(
      { error: descV.reason, code: descV.code, field: "description" },
      { status: 400 },
    );
  }
  const nameStr = nameV.text.trim();
  const descStr = descV.text.trim();
  if (!nameStr || nameStr.length > MAX_NAME) {
    return NextResponse.json(
      { error: `name must be 1-${MAX_NAME} chars` },
      { status: 400 },
    );
  }
  if (descStr.length > MAX_DESCRIPTION) {
    return NextResponse.json(
      { error: `description must be ≤ ${MAX_DESCRIPTION} chars` },
      { status: 400 },
    );
  }

  const tone = await createTone({
    ownerUid: profile.uid,
    ownerEmail: profile.email,
    name: nameStr,
    description: descStr,
    createdBy: profile.uid,
  });

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "tone-create",
    provider: "system",
    success: true,
  });

  return NextResponse.json({ tone });
}
