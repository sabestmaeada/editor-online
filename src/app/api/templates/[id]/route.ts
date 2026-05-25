import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveTemplateAccess } from "@/lib/firebase/prompt-template-access";
import {
  deletePromptTemplate,
  updatePromptTemplate,
} from "@/lib/firebase/prompt-templates";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import {
  PROMPT_TEMPLATE_CATEGORIES,
  PROMPT_TEMPLATE_SCOPES,
  PROMPT_TEMPLATE_STATUSES,
  type PromptTemplateCategory,
  type PromptTemplateScope,
  type PromptTemplateStatus,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LABEL = 40;
const MAX_SNIPPET = 2_000;

type RouteContext = { params: Promise<{ id: string }> };

// ────────────────────────────────────────────────────────────
// GET /api/templates/[id] — fetch one template
// ────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const access = await resolveTemplateAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    template: access.template,
    canEdit: access.canEdit,
    canDelete: access.canDelete,
    canChangeScope: access.canChangeScope,
  });
}

// ────────────────────────────────────────────────────────────
// PATCH /api/templates/[id] — update label / category / snippet / status / scope
//   - editor: own personal only
//   - admin:  any template (can also change scope)
// ────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const access = await resolveTemplateAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const { label, category, snippet, status, scope } = body as {
    label?: unknown;
    category?: unknown;
    snippet?: unknown;
    status?: unknown;
    scope?: unknown;
  };

  const patch: {
    label?: string;
    category?: PromptTemplateCategory;
    snippet?: string;
    status?: PromptTemplateStatus;
    scope?: PromptTemplateScope;
  } = {};

  if (label !== undefined) {
    if (typeof label !== "string") {
      return NextResponse.json(
        { error: "label must be string" },
        { status: 400 },
      );
    }
    const trimmed = label.trim();
    if (!trimmed || trimmed.length > MAX_LABEL) {
      return NextResponse.json(
        { error: `label must be 1-${MAX_LABEL} chars` },
        { status: 400 },
      );
    }
    patch.label = trimmed;
  }

  if (category !== undefined) {
    if (
      typeof category !== "string" ||
      !(PROMPT_TEMPLATE_CATEGORIES as readonly string[]).includes(category)
    ) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    patch.category = category as PromptTemplateCategory;
  }

  if (snippet !== undefined) {
    if (typeof snippet !== "string") {
      return NextResponse.json(
        { error: "snippet must be string" },
        { status: 400 },
      );
    }
    const trimmed = snippet.trim();
    if (!trimmed || trimmed.length > MAX_SNIPPET) {
      return NextResponse.json(
        { error: `snippet must be 1-${MAX_SNIPPET} chars` },
        { status: 400 },
      );
    }
    patch.snippet = trimmed;
  }

  if (status !== undefined) {
    if (
      typeof status !== "string" ||
      !(PROMPT_TEMPLATE_STATUSES as readonly string[]).includes(status)
    ) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = status as PromptTemplateStatus;
  }

  if (scope !== undefined) {
    if (
      typeof scope !== "string" ||
      !(PROMPT_TEMPLATE_SCOPES as readonly string[]).includes(scope)
    ) {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }
    if (!access.canChangeScope) {
      // Editor tried to flip scope on a template they can edit — block,
      // changing scope is admin-only.
      return NextResponse.json(
        { error: "Only admin can change template scope" },
        { status: 403 },
      );
    }
    patch.scope = scope as PromptTemplateScope;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await updatePromptTemplate(id, patch);

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "prompt-template-edit",
    provider: "system",
    success: true,
  });

  return NextResponse.json({ ok: true });
}

// ────────────────────────────────────────────────────────────
// DELETE /api/templates/[id]
//   - editor: own personal only
//   - admin:  any template
// ────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const access = await resolveTemplateAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deletePromptTemplate(id);

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "prompt-template-delete",
    provider: "system",
    success: true,
  });

  return NextResponse.json({ ok: true });
}
