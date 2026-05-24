import { NextResponse, type NextRequest } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { getContentJob } from "@/lib/firebase/content-jobs";
import { r2, R2_BUCKET } from "@/lib/r2/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; jobId: string; idx: string }>;
};

// ────────────────────────────────────────────────────────────
// GET /api/projects/[id]/content/jobs/[jobId]/chapters/[idx]/html
//
// Serves the generated HTML file for a chapter. Auth: any project
// member can view (read-only).
//
// Query params:
//   ?download=1  → adds Content-Disposition: attachment for download
//
// Response: raw HTML body with text/html content-type. Safe to embed
// in an <iframe srcDoc> on the client.
// ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: projectId, jobId, idx } = await ctx.params;

  const access = await resolveProjectAccess(profile, projectId);
  if (!access || !access.canDownload) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const job = await getContentJob(jobId);
  if (!job || job.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const chapterIndex = parseInt(idx, 10);
  if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
    return NextResponse.json(
      { error: "Invalid chapter index" },
      { status: 400 },
    );
  }
  const chapter = job.chapters[chapterIndex];
  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }
  if (!chapter.htmlR2Key) {
    return NextResponse.json(
      { error: "Chapter HTML not yet generated" },
      { status: 404 },
    );
  }

  // Fetch from R2
  let body: string;
  try {
    const obj = await r2().send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: chapter.htmlR2Key }),
    );
    body = (await obj.Body?.transformToString("utf-8")) ?? "";
  } catch (e) {
    console.error("[chapter-html] R2 fetch failed:", e);
    return NextResponse.json(
      { error: "Failed to load chapter HTML" },
      { status: 502 },
    );
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, max-age=0",
  };
  if (download) {
    // Sanitise chapter number + title for the filename. Drop characters
    // that browsers / filesystems hate; keep Thai chars (they survive
    // modern filesystem encoding fine).
    const safeTitle = chapter.title
      .replace(/[\\/:*?"<>|]/g, "")
      .slice(0, 60)
      .trim() || "untitled";
    const filename = `chapter_${chapter.chapter}_${safeTitle}.html`;
    headers["Content-Disposition"] =
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }

  return new NextResponse(body, { status: 200, headers });
}
