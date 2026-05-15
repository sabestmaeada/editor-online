import "server-only";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET } from "./client";

/** Staging area for in-progress ZIP uploads (cleaned up after processing). */
export const STAGING_PREFIX = "projects/_staging/";

/** How long a presigned PUT URL is valid for. 15 min = generous upload window. */
export const PRESIGNED_URL_EXPIRY_SEC = 15 * 60;

/** Max upload size accepted at presign time. R2 enforces via Content-Length. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB

export function newStagingKey(): string {
  return `${STAGING_PREFIX}${randomUUID()}.zip`;
}

/**
 * Generate a presigned PUT URL for uploading a ZIP directly to R2.
 * The browser will PUT the file to this URL — bypassing Vercel's body limit.
 *
 * The URL is single-use (no overwrite check) and time-limited.
 */
export async function presignZipUpload(): Promise<{
  uploadKey: string;
  uploadUrl: string;
  expiresAt: number;
}> {
  const uploadKey = newStagingKey();

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: uploadKey,
    ContentType: "application/zip",
  });

  const uploadUrl = await getSignedUrl(r2(), command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SEC,
  });

  return {
    uploadKey,
    uploadUrl,
    expiresAt: Date.now() + PRESIGNED_URL_EXPIRY_SEC * 1000,
  };
}

/**
 * Verify that an uploadKey was issued by us (must live under the staging
 * prefix) before processing it. Prevents callers from referencing arbitrary
 * R2 objects via the process endpoint.
 */
export function isValidStagingKey(key: string): boolean {
  return (
    typeof key === "string" &&
    key.startsWith(STAGING_PREFIX) &&
    key.endsWith(".zip") &&
    !key.includes("..") &&
    !key.includes("//")
  );
}
