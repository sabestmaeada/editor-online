import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import {
  clearProjectCover,
  setProjectCover,
} from "@/lib/firebase/projects";
import {
  ALLOWED_COVER_MIME,
  MAX_COVER_BYTES,
  deleteProjectCover,
  extFromMime,
  getProjectCoverStream,
  isAllowedCoverMime,
  uploadProjectCover,
} from "@/lib/r2/cover";
import { projectCoverKey } from "@/lib/r2/client";
import { logAuthEvent } from "@/lib/firebase/auth-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// ────────────────────────────────────────────────────────────
// GET — proxy cover image (members + admin)
// ────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) return new Response("Not found", { status: 404 });
  // Any project member (including viewers) can fetch the cover
  if (!access.canDownload) return new Response("Forbidden", { status: 403 });

  const coverKey = access.project.coverKey;
  if (!coverKey) return new Response("No cover", { status: 404 });

  const result = await getProjectCoverStream(coverKey);
  if (!result) return new Response("No cover", { status: 404 });

  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      result.stream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      result.stream.on("end", () => controller.close());
      result.stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      result.stream.destroy();
    },
  });

  const headers: HeadersInit = {
    "Content-Type": access.project.coverContentType ?? "application/octet-stream",
    "Cache-Control": "private, max-age=3600",
  };
  if (result.contentLength !== null) {
    headers["Content-Length"] = String(result.contentLength);
  }
  return new Response(webStream, { headers });
}

// ────────────────────────────────────────────────────────────
// PUT — upload / replace cover (owner + admin)
// ────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart body" },
      { status: 400 },
    );
  }

  const file = formData.get("cover");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'cover' file" },
      { status: 400 },
    );
  }

  if (!isAllowedCoverMime(file.type)) {
    return NextResponse.json(
      {
        error: `Invalid type — must be one of: ${ALLOWED_COVER_MIME.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_COVER_BYTES) {
    return NextResponse.json(
      { error: `File too large — max ${MAX_COVER_BYTES / 1024 / 1024}MB` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // If user is replacing a cover with different MIME, the old object is at a
  // different key — delete it explicitly to avoid orphan.
  const prevKey = access.project.coverKey ?? null;
  const newKey = projectCoverKey(id, extFromMime(file.type));

  const uploaded = await uploadProjectCover(id, buffer, file.type);
  await setProjectCover(id, uploaded.key, uploaded.contentType);

  if (prevKey && prevKey !== newKey) {
    await deleteProjectCover(prevKey).catch(() => {
      // best-effort cleanup; not fatal
    });
  }

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

  return NextResponse.json({
    ok: true,
    cover: { key: uploaded.key, contentType: uploaded.contentType, size: uploaded.size },
  });
}

// ────────────────────────────────────────────────────────────
// DELETE — remove cover (owner + admin)
// ────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const coverKey = access.project.coverKey;
  if (!coverKey) {
    return NextResponse.json({ ok: true, alreadyEmpty: true });
  }

  await deleteProjectCover(coverKey).catch(() => {});
  await clearProjectCover(id);

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
