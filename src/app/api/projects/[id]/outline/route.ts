import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import {
  getOutline,
  updateOutlineNodes,
} from "@/lib/firebase/outlines";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import {
  OUTLINE_NODE_TYPES,
  type OutlineNode,
  type OutlineNodeType,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// Tree size limits — sanity caps so a malformed PUT can't blow up Firestore.
const MAX_NODES_TOTAL = 1000;
const MAX_TEXT_LENGTH = 2000;
const MAX_TREE_DEPTH = 6;

// ────────────────────────────────────────────────────────────
// GET /api/projects/[id]/outline — fetch current outline
// ────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const access = await resolveProjectAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Anyone with project access can read the outline (same as other
  // project read endpoints).
  if (!access.canDownload) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const outline = await getOutline(id);
  return NextResponse.json({ outline });
}

// ────────────────────────────────────────────────────────────
// PUT /api/projects/[id]/outline — save edited tree
// ────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const access = await resolveProjectAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Bound the body size before JSON.parse so a malicious client can't OOM
  // the function. Outline trees should be well under 50KB in normal use.
  const raw = await req.text();
  if (raw.length > 200_000) {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { nodes } = body as { nodes?: unknown };
  if (!Array.isArray(nodes)) {
    return NextResponse.json(
      { error: "Body must include `nodes` array" },
      { status: 400 },
    );
  }

  const validation = validateNodes(nodes);
  if (validation.error !== null) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  let outline;
  try {
    outline = await updateOutlineNodes(id, validation.nodes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    // "Outline is finalised" is the user-facing case — surface as 409.
    if (msg.includes("finalised")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes("not found")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "outline-edit",
    provider: "system",
    success: true,
    projectId: id,
    projectTitle: access.project.title,
  });

  return NextResponse.json({ outline });
}

// ────────────────────────────────────────────────────────────
// Validate nodes payload. Returns parsed tree on success, or an error
// message string. Walks the tree depth-first so the first failure stops
// further work.
// ────────────────────────────────────────────────────────────
function validateNodes(
  raw: unknown[],
): { error: string; nodes?: undefined } | { error: null; nodes: OutlineNode[] } {
  let total = 0;
  const out: OutlineNode[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = walk(raw[i], `nodes[${i}]`, 0, () => ++total);
    if (typeof r === "string") return { error: r };
    out.push(r);
  }
  if (total > MAX_NODES_TOTAL) {
    return { error: `Too many nodes (max ${MAX_NODES_TOTAL})` };
  }
  return { error: null, nodes: out };
}

function walk(
  raw: unknown,
  path: string,
  depth: number,
  countOne: () => number,
): string | OutlineNode {
  if (depth > MAX_TREE_DEPTH) {
    return `${path}: tree depth exceeds ${MAX_TREE_DEPTH}`;
  }
  if (countOne() > MAX_NODES_TOTAL) {
    return `Too many nodes (max ${MAX_NODES_TOTAL})`;
  }
  if (!raw || typeof raw !== "object") {
    return `${path}: must be an object`;
  }
  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== "string" || !isOutlineNodeType(type)) {
    return `${path}.type: must be one of ${OUTLINE_NODE_TYPES.join(", ")}`;
  }
  const text = obj.text;
  if (typeof text !== "string") {
    return `${path}.text: must be a string`;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return `${path}.text: exceeds ${MAX_TEXT_LENGTH} chars`;
  }
  const id = obj.id;
  if (typeof id !== "string" || id.length === 0) {
    return `${path}.id: must be a non-empty string`;
  }
  const childrenRaw = Array.isArray(obj.children) ? obj.children : [];
  const children: OutlineNode[] = [];
  for (let i = 0; i < childrenRaw.length; i++) {
    const r = walk(childrenRaw[i], `${path}.children[${i}]`, depth + 1, countOne);
    if (typeof r === "string") return r;
    children.push(r);
  }
  return { id, type, text, children };
}

function isOutlineNodeType(v: string): v is OutlineNodeType {
  return (OUTLINE_NODE_TYPES as readonly string[]).includes(v);
}
