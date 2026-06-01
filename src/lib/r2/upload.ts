import "server-only";
import { Readable } from "node:stream";
import unzipper from "unzipper";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { r2, R2_BUCKET, projectSourceKey } from "./client";
import { mdToChapters } from "@/lib/content/md-to-book-html";
import { assembleBook } from "@/lib/content/assemble-book";

// Some entry filenames inside ZIPs should be skipped:
// - macOS resource forks (__MACOSX/, .DS_Store)
// - Windows thumbnails
// - Hidden dotfiles at the root (.git/, .env, etc.)
const SKIP_PATTERNS = [
  /(^|\/)__MACOSX\//,
  /(^|\/)\.DS_Store$/,
  /(^|\/)Thumbs\.db$/,
  /(^|\/)\.git\//,
  /(^|\/)\.svn\//,
];

function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some((re) => re.test(path));
}

function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "application/javascript",
    mjs: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    avif: "image/avif",
    pdf: "application/pdf",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
  };
  return map[ext] ?? "application/octet-stream";
}

export type UploadResult = {
  fileCount: number;
  totalSize: number;
  skipped: number;
};

/**
 * Stream a ZIP from `zipStream` and upload each entry to R2 under the project's
 * source prefix. Entries are read into a Buffer one at a time before PUT —
 * trades a bit of memory per file for simpler S3 upload (avoids signed-stream gotchas).
 *
 * Caller is responsible for auth + project existence checks.
 */
export async function uploadZipToProject(
  projectId: string,
  zipStream: ReadableStream<Uint8Array> | Readable,
): Promise<UploadResult> {
  const nodeStream =
    zipStream instanceof Readable
      ? zipStream
      : Readable.fromWeb(zipStream as unknown as Parameters<typeof Readable.fromWeb>[0]);

  const parser = nodeStream.pipe(unzipper.Parse({ forceStream: true }));

  let fileCount = 0;
  let totalSize = 0;
  let skipped = 0;

  // unzipper emits "entry" events as a stream — iterate with async-for
  for await (const entryRaw of parser) {
    const entry = entryRaw as unzipper.Entry;
    const path: string = entry.path;
    const type = entry.type as "Directory" | "File";

    if (type === "Directory") {
      entry.autodrain();
      continue;
    }

    if (shouldSkip(path)) {
      entry.autodrain();
      skipped++;
      continue;
    }

    // Buffer the entry content
    const chunks: Buffer[] = [];
    for await (const chunk of entry) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks);

    await r2().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: projectSourceKey(projectId, path),
        Body: body,
        ContentType: contentTypeFor(path),
        ContentLength: body.length,
      }),
    );

    fileCount++;
    totalSize += body.length;
  }

  return { fileCount, totalSize, skipped };
}


/**
 * Fetch a staging ZIP from R2 and stream-unzip it into the project's source/ prefix.
 * Deletes the staging object after processing (best-effort).
 */
export async function processStagedUpload(
  projectId: string,
  stagingKey: string,
): Promise<UploadResult> {
  const get = await r2().send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: stagingKey }),
  );
  if (!get.Body) {
    throw new Error("Staging object has no body");
  }

  const nodeStream =
    get.Body instanceof Readable
      ? (get.Body as Readable)
      : Readable.fromWeb(
          get.Body as unknown as Parameters<typeof Readable.fromWeb>[0],
        );

  let result: UploadResult;
  try {
    result = await uploadZipToProject(projectId, nodeStream);
  } finally {
    // Best-effort cleanup; orphan staging files are harmless but wasteful
    await r2()
      .send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: stagingKey }))
      .catch(() => {});
  }
  return result;
}

/**
 * Fetch a staged Markdown file from R2, convert it into chapters, run them
 * through the SAME assembleBook() the AI pipeline uses (so the structure —
 * cover / copyright / TOC / chapters — is identical), and write the
 * resulting book.html + style.css into the project's source/ prefix.
 * Deletes the staging object after processing (best-effort). (P2-S85)
 *
 * The staging object is named `*.zip` (keys are minted that way) but here
 * its body is plain Markdown text — `sourceType: "markdown"` on the create
 * request is what routes us here instead of the unzip path.
 */
export async function processStagedMarkdown(
  projectId: string,
  stagingKey: string,
  meta: {
    title: string;
    customer?: string | null;
    author?: string | null;
    edition?: string | null;
    isbn?: string | null;
    pages?: number | null;
  },
): Promise<UploadResult> {
  const get = await r2().send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: stagingKey }),
  );
  if (!get.Body) {
    throw new Error("Staging object has no body");
  }

  try {
    const markdown = await get.Body.transformToString("utf-8");
    const chapters = mdToChapters(markdown, { fallbackTitle: meta.title });
    const assembled = assembleBook({
      bookMeta: {
        title: meta.title,
        customer: meta.customer ?? null,
        author: meta.author ?? null,
        edition: meta.edition ?? null,
        isbn: meta.isbn ?? null,
        pages: meta.pages ?? null,
      },
      chapters,
    });

    const htmlBuf = Buffer.from(assembled.bookHtml, "utf-8");
    const cssBuf = Buffer.from(assembled.bookCss, "utf-8");

    await r2().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: projectSourceKey(projectId, "index.html"),
        Body: htmlBuf,
        ContentType: "text/html; charset=utf-8",
        ContentLength: htmlBuf.length,
      }),
    );
    await r2().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: projectSourceKey(projectId, "style.css"),
        Body: cssBuf,
        ContentType: "text/css; charset=utf-8",
        ContentLength: cssBuf.length,
      }),
    );

    return {
      fileCount: 2,
      totalSize: htmlBuf.length + cssBuf.length,
      skipped: 0,
    };
  } finally {
    await r2()
      .send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: stagingKey }))
      .catch(() => {});
  }
}

