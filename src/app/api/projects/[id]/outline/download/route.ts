import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { getOutline } from "@/lib/firebase/outlines";
import {
  outlineToMarkdown,
  outlineMarkdownFilename,
} from "@/lib/content/outline-to-markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// ────────────────────────────────────────────────────────────
// GET /api/projects/[id]/outline/download
//
// Serialises the current outline as Markdown and returns it as a
// file download. Read-only; any project member with canDownload
// (including admin viewing an unrelated project) is allowed.
//
// Status guard: only "ready" / "finalized" outlines are downloadable
// — a "generating" outline has no nodes yet, "failed" has no useful
// content. Returning 409 for those instead of a confusing empty file.
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
  if (!access.canDownload) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const outline = await getOutline(id);
  if (!outline) {
    return NextResponse.json(
      { error: "ยังไม่มี outline ของโปรเจกต์นี้" },
      { status: 404 },
    );
  }
  if (outline.status !== "ready" && outline.status !== "finalized") {
    return NextResponse.json(
      {
        error: `Outline อยู่ในสถานะ ${outline.status} — รอให้สำเร็จก่อนค่อยดาวน์โหลด`,
      },
      { status: 409 },
    );
  }

  const md = outlineToMarkdown(outline);
  const filename = outlineMarkdownFilename(outline);

  // RFC 5987 — encode non-ASCII filename for Content-Disposition.
  // Browsers fall back to the plain `filename=` when filename* isn't
  // recognised; we provide both for max compatibility.
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_");

  return new NextResponse(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition":
        `attachment; filename="${asciiFallback}"; ` +
        `filename*=UTF-8''${encodeURIComponent(filename)}`,
      // Don't cache — outline can change at any time.
      "Cache-Control": "private, no-store",
    },
  });
}
