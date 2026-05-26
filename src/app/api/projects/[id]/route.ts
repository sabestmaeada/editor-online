import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import {
  updateProject,
  deleteProjectDoc,
} from "@/lib/firebase/projects";
import {
  listMembersOfProject,
  removeProjectMember,
} from "@/lib/firebase/project-members";
import { deleteProjectFiles, listProjectFiles } from "@/lib/r2/download";
import { deleteContentJobsByProject } from "@/lib/firebase/content-jobs";
import { deleteOutline } from "@/lib/firebase/outlines";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/types";
import { validateUserText } from "@/lib/security/sanitize-user-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function isValidStatus(v: unknown): v is ProjectStatus {
  return typeof v === "string" && (PROJECT_STATUSES as readonly string[]).includes(v);
}

// ────────────────────────────────────────────────────────────
// GET /api/projects/[id] — details (project + files + members)
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

  const [files, members] = await Promise.all([
    listProjectFiles(id),
    listMembersOfProject(id),
  ]);

  return NextResponse.json({
    project: access.project,
    files,
    members,
    permissions: {
      isAdmin: access.isAdmin,
      isOwner: access.isOwner,
      canManage: access.canManage,
      canEdit: access.canEdit,
      canDownload: access.canDownload,
      myRole:
        access.membership?.role ?? (access.isOwner ? "project_owner" : null),
    },
  });
}

// ────────────────────────────────────────────────────────────
// PATCH /api/projects/[id] — update metadata (owner/admin only)
// ────────────────────────────────────────────────────────────
type UpdatePayload = {
  title?: unknown;
  customer?: unknown;
  pages?: unknown;
  description?: unknown;
  isbn?: unknown;
  language?: unknown;
  author?: unknown;
  edition?: unknown;
  status?: unknown;
  preface?: unknown;
};

function asStr(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as UpdatePayload;
  const update: Record<string, unknown> = {};

  const fields: (keyof UpdatePayload)[] = [
    "title",
    "customer",
    "description",
    "isbn",
    "language",
    "author",
    "edition",
  ];
  for (const f of fields) {
    const v = asStr(body[f]);
    if (v !== undefined) update[f] = v;
  }

  // preface can be longer — bypass asStr trim/empty handling but
  // still allow null (to clear). Cap at 20000 chars to avoid abuse.
  // Sanitise + injection check before storing — preface renders into
  // the assembled book HTML and could also reach the LLM if used as
  // context in the future.
  if (body.preface !== undefined) {
    if (body.preface === null) {
      update.preface = null;
    } else if (typeof body.preface === "string") {
      const v = validateUserText(body.preface);
      if (!v.ok) {
        return NextResponse.json(
          { error: v.reason, code: v.code, field: "preface" },
          { status: 400 },
        );
      }
      const trimmed = v.text.trim();
      if (trimmed.length > 20000) {
        return NextResponse.json(
          { error: "preface must be ≤ 20000 chars" },
          { status: 400 },
        );
      }
      update.preface = trimmed.length > 0 ? trimmed : null;
    }
  }

  if (body.pages !== undefined) {
    const n =
      typeof body.pages === "string"
        ? Number(body.pages)
        : typeof body.pages === "number"
          ? body.pages
          : NaN;
    if (Number.isFinite(n) && n >= 0 && n < 999999) {
      update.pages = Math.floor(n);
    }
  }

  if (body.status !== undefined) {
    if (!isValidStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  // title required (can't blank it out)
  if (update.title === null) {
    return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  }
  if (update.customer === null) {
    return NextResponse.json({ error: "customer cannot be empty" }, { status: 400 });
  }

  await updateProject(id, update);

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "project-metadata-update",
    provider: "system",
    success: true,
    projectId: id,
    projectTitle: access.project.title,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

// ────────────────────────────────────────────────────────────
// DELETE /api/projects/[id] — owner/admin only, hard delete in v1
// ────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // We log every step's outcome so partial failures are observable
  // in production. The DELETE response also reports them so the UI
  // can surface "deleted, but some cleanup failed" if needed.
  //
  // Order matters:
  //   1. R2 first (most-likely-to-fail external call). Failing here
  //      leaves Firestore intact → user can retry the whole delete.
  //   2. Subcollections + side-collections BEFORE the project doc —
  //      orphan subcollections (Firestore doesn't cascade) are the
  //      classic footgun. Outline lives at projects/{id}/outline/current.
  //   3. Project doc LAST. Once it's gone, the user no longer sees the
  //      project at all; if earlier steps half-succeeded, we still
  //      logged warnings server-side and the next admin cleanup can
  //      mop up orphans.

  // 1. R2 objects — covers source/, content/, meta/cover, exports/
  //    since it wipes the whole projects/{id}/ prefix.
  let deletedFiles = 0;
  let r2Error: string | null = null;
  try {
    deletedFiles = await deleteProjectFiles(id);
  } catch (e) {
    r2Error = e instanceof Error ? e.message : String(e);
    console.error(
      `[project-delete] R2 cleanup failed for project ${id}:`,
      e,
    );
  }

  // 2a. Delete outline subcollection FIRST (was missed in P2-S51 fix).
  //     Firestore does NOT cascade-delete subcollections when the parent
  //     doc is removed — without this, projects/{id}/outline/current
  //     stays alive forever as an orphan.
  let outlineDeleted = true;
  try {
    await deleteOutline(id);
  } catch (e) {
    outlineDeleted = false;
    console.error(
      `[project-delete] outline cleanup failed for project ${id}:`,
      e,
    );
  }

  // 2b. Project members
  let memberCount = 0;
  let memberErrors = 0;
  try {
    const members = await listMembersOfProject(id);
    memberCount = members.length;
    const results = await Promise.allSettled(
      members.map((m) => removeProjectMember(id, m.uid)),
    );
    memberErrors = results.filter((r) => r.status === "rejected").length;
    if (memberErrors > 0) {
      console.error(
        `[project-delete] ${memberErrors} member removals failed for project ${id}`,
      );
    }
  } catch (e) {
    console.error(
      `[project-delete] listing members failed for project ${id}:`,
      e,
    );
  }

  // 3. Content jobs (Phase 2). R2 objects under projects/{id}/content/
  //    were already wiped in step 1.
  let deletedJobs = 0;
  let jobsError: string | null = null;
  try {
    deletedJobs = await deleteContentJobsByProject(id);
  } catch (e) {
    jobsError = e instanceof Error ? e.message : String(e);
    console.error(
      `[project-delete] content jobs cleanup failed for project ${id}:`,
      e,
    );
  }

  // 4. Project doc LAST. If this fails after everything else has been
  //    wiped, the doc itself is the last remnant — admin can manually
  //    delete via Firestore console.
  let projectDocDeleted = true;
  try {
    await deleteProjectDoc(id);
  } catch (e) {
    projectDocDeleted = false;
    console.error(
      `[project-delete] project doc deletion failed for ${id}:`,
      e,
    );
  }

  // Audit — record success only if every step succeeded so a partial
  // delete shows up in the audit log as a "failed" event for an admin
  // to investigate.
  const fullSuccess =
    !r2Error &&
    outlineDeleted &&
    memberErrors === 0 &&
    !jobsError &&
    projectDocDeleted;

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "project-delete",
    provider: "system",
    success: fullSuccess,
    errorCode: fullSuccess
      ? null
      : [
          r2Error ? "R2_FAILED" : null,
          !outlineDeleted ? "OUTLINE_FAILED" : null,
          memberErrors > 0 ? "MEMBER_FAILED" : null,
          jobsError ? "JOBS_FAILED" : null,
          !projectDocDeleted ? "PROJECT_DOC_FAILED" : null,
        ]
          .filter(Boolean)
          .join(","),
    projectId: id,
    projectTitle: access.project.title,
  }).catch(() => {});

  // If the project doc itself failed to delete, return a server error
  // so the client doesn't redirect away (user can retry). Other partial
  // failures still return 200 with the warnings array — the project is
  // effectively gone from the user's perspective.
  if (!projectDocDeleted) {
    return NextResponse.json(
      {
        ok: false,
        error: "Project document could not be deleted — please retry",
        deletedFiles,
        deletedJobs,
      },
      { status: 500 },
    );
  }

  const warnings: string[] = [];
  if (r2Error) warnings.push(`R2 cleanup partially failed: ${r2Error}`);
  if (!outlineDeleted) warnings.push("Outline cleanup failed");
  if (memberErrors > 0)
    warnings.push(`${memberErrors} of ${memberCount} member removals failed`);
  if (jobsError) warnings.push(`Content jobs cleanup failed: ${jobsError}`);

  return NextResponse.json({
    ok: true,
    deletedFiles,
    deletedJobs,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}
