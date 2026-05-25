import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import {
  canCreatePersonalTemplate,
  canCreateSharedTemplate,
  canUseTemplates,
} from "@/lib/firebase/prompt-template-access";
import {
  countPersonalTemplates,
  createPromptTemplate,
  listAllTemplates,
  listTemplatesForEditor,
} from "@/lib/firebase/prompt-templates";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { validateUserText } from "@/lib/security/sanitize-user-text";
import {
  PROMPT_TEMPLATE_CATEGORIES,
  PROMPT_TEMPLATE_SCOPES,
  type PromptTemplateCategory,
  type PromptTemplateScope,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LABEL = 40;
const MAX_SNIPPET = 2_000;
const PERSONAL_QUOTA = 50;

// ────────────────────────────────────────────────────────────
// GET /api/templates — list templates visible to caller
//   ?all=1  (admin only) — list every template across all users
//   default: shared + caller's own personal
// ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseTemplates(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const wantAll = req.nextUrl.searchParams.get("all") === "1";
  if (wantAll && profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templates = wantAll
    ? await listAllTemplates()
    : await listTemplatesForEditor(profile.uid);

  return NextResponse.json({ templates });
}

// ────────────────────────────────────────────────────────────
// POST /api/templates — create a new template
//   body: { scope, label, category, snippet }
//   - scope="personal" → owner=caller
//   - scope="shared"   → admin only
// ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canCreatePersonalTemplate(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit — same window as tone-create. Even cheap writes deserve
  // a brake so a runaway script can't fill Firestore.
  const limit = checkRateLimit(
    `prompt-template-create:${profile.uid}`,
    60,
    60 * 60 * 1000,
  );
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { scope, label, category, snippet } = body as {
    scope?: unknown;
    label?: unknown;
    category?: unknown;
    snippet?: unknown;
  };

  // Validate scope
  const scopeStr = typeof scope === "string" ? scope : "personal";
  if (!(PROMPT_TEMPLATE_SCOPES as readonly string[]).includes(scopeStr)) {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }
  const scopeVal = scopeStr as PromptTemplateScope;
  if (scopeVal === "shared" && !canCreateSharedTemplate(profile)) {
    return NextResponse.json(
      { error: "Only admin can create shared templates" },
      { status: 403 },
    );
  }

  // Validate category
  const categoryStr = typeof category === "string" ? category : "custom";
  if (
    !(PROMPT_TEMPLATE_CATEGORIES as readonly string[]).includes(categoryStr)
  ) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  const categoryVal = categoryStr as PromptTemplateCategory;

  // Validate label — sanitize + injection check first
  const labelV = validateUserText(typeof label === "string" ? label : "");
  if (!labelV.ok) {
    return NextResponse.json(
      { error: labelV.reason, code: labelV.code, field: "label" },
      { status: 400 },
    );
  }
  const labelStr = labelV.text.trim();
  if (!labelStr) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  if (labelStr.length > MAX_LABEL) {
    return NextResponse.json(
      { error: `label must be ≤ ${MAX_LABEL} chars` },
      { status: 400 },
    );
  }

  // Validate snippet — same defence; this string reaches the LLM as
  // Layer 3 (customInstructions) so injection here = direct attack on
  // content gen.
  const snippetV = validateUserText(typeof snippet === "string" ? snippet : "");
  if (!snippetV.ok) {
    return NextResponse.json(
      { error: snippetV.reason, code: snippetV.code, field: "snippet" },
      { status: 400 },
    );
  }
  const snippetStr = snippetV.text.trim();
  if (!snippetStr) {
    return NextResponse.json(
      { error: "snippet is required" },
      { status: 400 },
    );
  }
  if (snippetStr.length > MAX_SNIPPET) {
    return NextResponse.json(
      { error: `snippet must be ≤ ${MAX_SNIPPET} chars` },
      { status: 400 },
    );
  }

  // Personal quota check — shared is unlimited (admin discretion)
  if (scopeVal === "personal") {
    const owned = await countPersonalTemplates(profile.uid);
    if (owned >= PERSONAL_QUOTA) {
      return NextResponse.json(
        {
          error: `เกินจำนวน template ส่วนตัวสูงสุด (${PERSONAL_QUOTA}). ลบของเก่าก่อนสร้างใหม่`,
        },
        { status: 409 },
      );
    }
  }

  const template = await createPromptTemplate({
    scope: scopeVal,
    ownerUid: profile.uid,
    ownerEmail: profile.email,
    label: labelStr,
    category: categoryVal,
    snippet: snippetStr,
  });

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "prompt-template-create",
    provider: "system",
    success: true,
  });

  return NextResponse.json({ template });
}
