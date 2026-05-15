import "server-only";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { r2, R2_BUCKET, projectCoverKey } from "./client";

export const MAX_COVER_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_COVER_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type CoverMime = (typeof ALLOWED_COVER_MIME)[number];

export function isAllowedCoverMime(v: string): v is CoverMime {
  return (ALLOWED_COVER_MIME as readonly string[]).includes(v);
}

export function extFromMime(mime: CoverMime): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

export async function uploadProjectCover(
  projectId: string,
  body: Buffer,
  mime: CoverMime,
): Promise<{ key: string; contentType: CoverMime; size: number }> {
  const ext = extFromMime(mime);
  const key = projectCoverKey(projectId, ext);

  await r2().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: mime,
      ContentLength: body.length,
      CacheControl: "private, max-age=3600",
    }),
  );

  return { key, contentType: mime, size: body.length };
}

/**
 * Delete the project's cover at a known R2 key.
 * Caller looks up the key from Firestore (project.coverKey) before calling.
 */
export async function deleteProjectCover(key: string): Promise<void> {
  await r2().send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }),
  );
}

/**
 * Fetch the cover from R2 as a Node Readable stream.
 * Returns null if R2 says NoSuchKey (cover missing).
 */
export async function getProjectCoverStream(
  key: string,
): Promise<{ stream: Readable; contentLength: number | null } | null> {
  try {
    const res = await r2().send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    );
    if (!res.Body) return null;

    const nodeStream =
      res.Body instanceof Readable
        ? (res.Body as Readable)
        : Readable.fromWeb(
            res.Body as unknown as Parameters<typeof Readable.fromWeb>[0],
          );

    return {
      stream: nodeStream,
      contentLength: res.ContentLength ?? null,
    };
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err as { name?: string }).name === "NoSuchKey"
    ) {
      return null;
    }
    throw err;
  }
}
