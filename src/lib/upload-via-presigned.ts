// Client-side helper to upload a file directly to R2 via a presigned URL.
// Bypasses Vercel's request body limit for large ZIP uploads.

export type UploadStatus =
  | { stage: "idle" }
  | { stage: "init" }
  | { stage: "uploading"; pct: number | null }
  | { stage: "processing" }
  | { stage: "done" }
  | { stage: "error"; message: string };

type Purpose = "create" | "replace";

export type UploadOptions = {
  file: File;
  purpose: Purpose;
  projectId?: string;
  onStatus: (status: UploadStatus) => void;
};

/**
 * Run the 3-step presigned upload:
 *   1. POST /api/projects/upload-url to obtain a signed URL
 *   2. PUT the file directly to R2 (with progress)
 *   3. caller is responsible for the "process" step (different per purpose)
 *
 * Returns the uploadKey so the caller can pass it to the process endpoint.
 */
export async function uploadFileToR2(
  options: UploadOptions,
): Promise<{ uploadKey: string }> {
  const { file, purpose, projectId, onStatus } = options;

  // 1. Init: request presigned URL from our server
  onStatus({ stage: "init" });
  const initRes = await fetch("/api/projects/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, projectId }),
  });
  const initData = (await initRes.json().catch(() => ({}))) as {
    uploadKey?: string;
    uploadUrl?: string;
    error?: string;
  };
  if (!initRes.ok || !initData.uploadKey || !initData.uploadUrl) {
    throw new Error(
      initData.error ?? `Failed to get upload URL: HTTP ${initRes.status}`,
    );
  }
  const { uploadKey, uploadUrl } = initData as {
    uploadKey: string;
    uploadUrl: string;
  };

  // 2. PUT file directly to R2 (bypasses Vercel)
  onStatus({ stage: "uploading", pct: null });
  await putWithProgress(uploadUrl, file, (pct) => {
    onStatus({ stage: "uploading", pct });
  });

  return { uploadKey };
}

function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/zip");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(
            `R2 upload failed: HTTP ${xhr.status} ${xhr.statusText || ""}`.trim(),
          ),
        );
      }
    };
    xhr.onerror = () =>
      reject(new Error("Network error during upload (check R2 CORS config?)"));
    xhr.send(file);
  });
}
