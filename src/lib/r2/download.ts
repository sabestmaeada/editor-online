import "server-only";
import { Readable, type Transform } from "node:stream";
// @ts-expect-error — archiver v8 ESM exports not yet in @types/archiver
import { ZipArchive as _ZipArchive } from "archiver";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  type _Object,
} from "@aws-sdk/client-s3";
import {
  r2,
  R2_BUCKET,
  projectSourcePrefix,
} from "./client";

// Local type for archiver v8's ZipArchive class
type ZipArchiveInstance = Transform & {
  append(source: Readable | Buffer, data: { name: string }): ZipArchiveInstance;
  finalize(): Promise<void>;
};
const ZipArchive = _ZipArchive as unknown as new (options?: {
  zlib?: { level?: number };
}) => ZipArchiveInstance;

export type ProjectFile = {
  path: string; // relative to source/
  size: number;
  lastModified: Date | null;
};

/**
 * List all files under a project's source/ prefix.
 */
export async function listProjectFiles(
  projectId: string,
): Promise<ProjectFile[]> {
  const prefix = projectSourcePrefix(projectId);
  const files: ProjectFile[] = [];

  let continuationToken: string | undefined = undefined;
  do {
    const res: ListObjectsV2CommandOutput = await r2().send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      const path = obj.Key.slice(prefix.length);
      if (!path) continue; // prefix itself
      files.push({
        path,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ?? null,
      });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return files;
}

/**
 * Create a streaming ZIP of every file in projects/{id}/source/.
 * Returns a Node Readable that streams ZIP bytes. Caller can pipe to a Response body.
 */
export function streamProjectZip(projectId: string): Readable {
  const prefix = projectSourcePrefix(projectId);
  const archive = new ZipArchive({ zlib: { level: 6 } });

  // Run async logic in background — the archiver Readable starts emitting
  // bytes as soon as the first file is appended.
  (async () => {
    try {
      let continuationToken: string | undefined = undefined;
      do {
        const list: ListObjectsV2CommandOutput = await r2().send(
          new ListObjectsV2Command({
            Bucket: R2_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );

        for (const obj of list.Contents ?? []) {
          if (!obj.Key) continue;
          const relPath = obj.Key.slice(prefix.length);
          if (!relPath) continue;

          const get = await r2().send(
            new GetObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key }),
          );
          if (!get.Body) continue;

          // Body is a Web ReadableStream — convert to Node stream for archiver
          const nodeBody =
            get.Body instanceof Readable
              ? (get.Body as Readable)
              : Readable.fromWeb(
                  get.Body as unknown as Parameters<typeof Readable.fromWeb>[0],
                );

          archive.append(nodeBody, { name: relPath });
        }

        continuationToken = list.IsTruncated
          ? list.NextContinuationToken
          : undefined;
      } while (continuationToken);

      await archive.finalize();
    } catch (err) {
      archive.emit("error", err);
    }
  })();

  return archive as unknown as Readable;
}

/**
 * Delete every object under a given R2 prefix. Returns count deleted.
 */
async function deleteAllUnderPrefix(prefix: string): Promise<number> {
  const { DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
  let deleted = 0;
  let continuationToken: string | undefined = undefined;

  do {
    const list: ListObjectsV2CommandOutput = await r2().send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const objects = (list.Contents ?? [])
      .filter((o: _Object) => o.Key)
      .map((o: _Object) => ({ Key: o.Key! }));

    if (objects.length > 0) {
      // Delete in batches of 1000 (R2 limit)
      for (let i = 0; i < objects.length; i += 1000) {
        const batch = objects.slice(i, i + 1000);
        await r2().send(
          new DeleteObjectsCommand({
            Bucket: R2_BUCKET,
            Delete: { Objects: batch, Quiet: true },
          }),
        );
        deleted += batch.length;
      }
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}

/**
 * Delete EVERY object under a project's prefix (source/, exports/, ...).
 * Used when deleting an entire project.
 */
export function deleteProjectFiles(projectId: string): Promise<number> {
  return deleteAllUnderPrefix(`projects/${projectId}/`);
}

/**
 * Delete only the source/ files of a project. Used when replacing files.
 * Preserves any exports/ or other auxiliary objects.
 */
export function deleteProjectSourceFiles(projectId: string): Promise<number> {
  return deleteAllUnderPrefix(projectSourcePrefix(projectId));
}
