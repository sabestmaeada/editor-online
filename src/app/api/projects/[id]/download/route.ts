import { type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { bumpMemberLastAccessed } from "@/lib/firebase/project-members";
import { streamProjectZip } from "@/lib/r2/download";
import { logAuthEvent } from "@/lib/firebase/auth-events";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await resolveProjectAccess(profile, id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!access.canDownload) return new Response("Forbidden", { status: 403 });

  // Sanitize filename: replace non-safe chars
  const safeTitle =
    access.project.title.replace(/[^a-zA-Z0-9ก-๙\-_.]/g, "_").slice(0, 80) ||
    "project";
  const filename = `${safeTitle}-${id}.zip`;

  const nodeStream = streamProjectZip(id);

  // Convert Node Readable → Web ReadableStream for Response body
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  // Best-effort: update lastAccessedAt + log download event
  if (access.membership) {
    bumpMemberLastAccessed(id, profile.uid).catch(() => {});
  }
  logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "project-download",
    provider: "system",
    success: true,
    projectId: id,
    projectTitle: access.project.title,
  }).catch(() => {});

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
