import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { getContentJob } from "@/lib/firebase/content-jobs";
import { updateProject } from "@/lib/firebase/projects";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { r2, R2_BUCKET, projectSourceKey } from "@/lib/r2/client";
import { deleteProjectSourceFiles } from "@/lib/r2/download";
import { assembleBook } from "@/lib/content/assemble-book";
import { getProject } from "@/lib/firebase/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string; jobId: string }>;
};

// ────────────────────────────────────────────────────────────
// POST /api/projects/[id]/content/jobs/[jobId]/assemble
//
// Merge all generated chapter HTML files into a single book.html +
// book.css and write to projects/[id]/source/ — overwriting any
// existing source files. After this runs, the project's "Download ZIP"
// button picks up the assembled book automatically.
//
// Auth: canEdit on project.
//
// Idempotent — running twice is safe (second call just overwrites).
// ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: projectId, jobId } = await ctx.params;

  const access = await resolveProjectAccess(profile, projectId);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const job = await getContentJob(jobId);
  if (!job || job.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only allow when at least one chapter is done — partial / done are
  // both fine; pending / generating / failed (with 0 done) is rejected
  // because there's nothing to assemble.
  const doneChapters = job.chapters.filter(
    (c) => c.status === "done" && c.htmlR2Key,
  );
  if (doneChapters.length === 0) {
    return NextResponse.json(
      { error: "No completed chapters yet — wait or retry first" },
      { status: 400 },
    );
  }

  // 1. Fetch each chapter HTML from R2 (parallel)
  let chapterHtmls: Array<{
    index: number;
    chapter: string;
    title: string;
    html: string;
  }>;
  try {
    chapterHtmls = await Promise.all(
      doneChapters.map(async (c) => {
        const obj = await r2().send(
          new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: c.htmlR2Key as string,
          }),
        );
        const html = (await obj.Body?.transformToString("utf-8")) ?? "";
        return {
          index: c.index,
          chapter: c.chapter,
          title: c.title,
          html,
          wordCount: c.wordCount,
        };
      }),
    );
  } catch (e) {
    console.error("[assemble] R2 fetch failed:", e);
    return NextResponse.json(
      { error: "Failed to load chapter HTML from storage" },
      { status: 502 },
    );
  }

  // 2. Pull the full project doc (access.project doesn't include
  //    preface — it's a denormalised summary). Cover image URL points
  //    back at our own /cover route which proxies from R2.
  const fullProject = await getProject(projectId);
  const hasCover = !!fullProject?.coverKey;
  const coverImageUrl = hasCover
    ? `${callbackBaseUrl(req)}/api/projects/${projectId}/cover`
    : null;

  // 3. Assemble book — pulls metadata off the project doc for the
  //    copyright page, preface, and front/back cover.
  const { bookHtml, bookCss, htmlBytes, cssBytes, diagnostics } =
    assembleBook({
      bookMeta: {
        title: access.project.title,
        customer: access.project.customer ?? null,
        author: access.project.author ?? null,
        edition: access.project.edition ?? null,
        isbn: access.project.isbn ?? null,
        pages: access.project.pages ?? null,
        preface: fullProject?.preface ?? null,
        coverImageUrl,
      },
      chapters: chapterHtmls,
    });

  // 4. Hash compare with existing files (skip upload if identical).
  //    Saves R2 write cost + lets the UI tell the user "ไม่มีการ
  //    เปลี่ยนแปลง" so they're not confused when nothing seems to happen.
  const htmlKey = projectSourceKey(projectId, "book.html");
  const cssKey = projectSourceKey(projectId, "style.css");
  const newHtmlHash = sha256(bookHtml);
  const newCssHash = sha256(bookCss);
  const [existingHtmlHash, existingCssHash] = await Promise.all([
    fetchR2Hash(htmlKey),
    fetchR2Hash(cssKey),
  ]);

  const unchanged =
    existingHtmlHash === newHtmlHash && existingCssHash === newCssHash;

  if (unchanged) {
    // Nothing to do. Skip delete + upload + project doc update.
    await logAuthEvent({
      headers: req.headers,
      uid: profile.uid,
      email: profile.email,
      eventType: "project-files-replace",
      provider: "system",
      success: true,
      errorCode: "UNCHANGED",
      projectId,
      projectTitle: access.project.title,
      jobId,
      totalChapters: doneChapters.length,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      unchanged: true,
      fileCount: fullProject?.fileCount ?? 2,
      totalSize: fullProject?.totalSize ?? 0,
      chapters: doneChapters.length,
      htmlBytes,
      cssBytes,
      hasCover,
      hasPreface: !!fullProject?.preface,
      diagnostics,
    });
  }

  // 5. Content has changed — clear existing source/ then upload new
  //    book files. Filename is `style.css` (not `book.css`) to match
  //    the template's `<link rel="stylesheet" href="./style.css">`.
  await deleteProjectSourceFiles(projectId).catch((e) => {
    console.warn("[assemble] source/ cleanup failed (continuing):", e);
  });

  try {
    await Promise.all([
      r2().send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: htmlKey,
          Body: Buffer.from(bookHtml, "utf-8"),
          ContentType: "text/html; charset=utf-8",
        }),
      ),
      r2().send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: cssKey,
          Body: Buffer.from(bookCss, "utf-8"),
          ContentType: "text/css; charset=utf-8",
        }),
      ),
    ]);
  } catch (e) {
    console.error("[assemble] R2 upload failed:", e);
    return NextResponse.json(
      { error: "Failed to save assembled book to storage" },
      { status: 502 },
    );
  }

  // 6. Update project doc
  const totalBytes = htmlBytes + cssBytes;
  await updateProject(projectId, {
    fileCount: 2,
    totalSize: totalBytes,
  });

  // 7. Audit (reuse project-files-replace — same semantic as ZIP replace)
  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "project-files-replace",
    provider: "system",
    success: true,
    projectId,
    projectTitle: access.project.title,
    jobId,
    totalChapters: doneChapters.length,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    unchanged: false,
    fileCount: 2,
    totalSize: totalBytes,
    chapters: doneChapters.length,
    htmlBytes,
    cssBytes,
    hasCover,
    hasPreface: !!fullProject?.preface,
    diagnostics,
  });
}

/** SHA-256 hex digest of a string. */
function sha256(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

/** Fetch an R2 object and compute its hex SHA-256 digest. Returns null
 *  if the object doesn't exist (or any other error) — caller treats
 *  null as "needs upload". */
async function fetchR2Hash(key: string): Promise<string | null> {
  try {
    const obj = await r2().send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    );
    const body = (await obj.Body?.transformToString("utf-8")) ?? "";
    return sha256(body);
  } catch {
    return null;
  }
}

/** Same shape as the helper in /content/generate. Repeated here to
 *  keep the file self-contained; if we add a third route that needs
 *  it, extract to a shared util. */
function callbackBaseUrl(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
