import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const R2_BUCKET = getRequiredEnv("R2_BUCKET");
export const R2_ENDPOINT = getRequiredEnv("R2_ENDPOINT");

let _client: S3Client | null = null;

export function r2(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
    },
    // Force path-style addressing for R2 compatibility
    forcePathStyle: false,
  });
  return _client;
}

/** Standard prefix layout for a project's R2 objects. */
export function projectPrefix(projectId: string): string {
  return `projects/${projectId}/`;
}

export function projectSourcePrefix(projectId: string): string {
  return `${projectPrefix(projectId)}source/`;
}

export function projectSourceKey(projectId: string, relPath: string): string {
  const normalized = relPath.replace(/^\/+/, "").replace(/\\/g, "/");
  return `${projectSourcePrefix(projectId)}${normalized}`;
}

export function projectMetaPrefix(projectId: string): string {
  return `${projectPrefix(projectId)}meta/`;
}

/** Build cover R2 key for the given project + file extension (no leading dot). */
export function projectCoverKey(projectId: string, ext: string): string {
  return `${projectMetaPrefix(projectId)}cover.${ext}`;
}

/** R2 prefix for generated content (Phase 2 — content jobs).
 *  Layout: projects/{projectId}/content/{jobId}/chapter-{NN}.html
 *  Storing under the project prefix lets us reuse project-level
 *  cleanup logic (e.g. when a project is deleted). */
export function contentChapterKey(
  projectId: string,
  jobId: string,
  chapterIndex: number,
): string {
  const idx = String(chapterIndex).padStart(2, "0");
  return `${projectPrefix(projectId)}content/${jobId}/chapter-${idx}.html`;
}
