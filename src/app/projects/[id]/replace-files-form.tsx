"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Status =
  | { state: "idle" }
  | { state: "uploading"; pct: number | null }
  | { state: "error"; message: string }
  | { state: "success"; deleted: number; uploaded: number };

export function ReplaceFilesForm({
  projectId,
  currentFileCount,
}: {
  projectId: string;
  currentFileCount: number;
}) {
  const router = useRouter();
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setZipFile(f);
    setStatus({ state: "idle" });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!zipFile) {
      setStatus({ state: "error", message: "กรุณาเลือกไฟล์ ZIP" });
      return;
    }
    if (!/\.zip$/i.test(zipFile.name)) {
      setStatus({ state: "error", message: "ไฟล์ต้องเป็น .zip" });
      return;
    }

    const ok = window.confirm(
      `ยืนยันแทนที่ไฟล์ทั้งหมด?\n\nไฟล์เดิม ${currentFileCount} ไฟล์จะถูกลบจาก R2 และแทนด้วยไฟล์จาก ${zipFile.name}\n\nการกระทำนี้ย้อนกลับไม่ได้`,
    );
    if (!ok) return;

    const fd = new FormData();
    fd.set("zip", zipFile);

    setStatus({ state: "uploading", pct: null });
    try {
      const result = await uploadWithProgress(
        `/api/projects/${projectId}/files`,
        fd,
        (pct) => setStatus({ state: "uploading", pct }),
      );
      setStatus({
        state: "success",
        deleted: result.deleted,
        uploaded: result.uploaded.fileCount,
      });
      setZipFile(null);
      router.refresh();
    } catch (err) {
      setStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        onChange={handleFileChange}
        required
        disabled={status.state === "uploading"}
        className="block w-full cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-sm file:font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:file:bg-zinc-800 dark:hover:bg-zinc-800"
      />

      {zipFile && (
        <p className="text-xs text-zinc-500">
          Selected: <span className="font-medium">{zipFile.name}</span> (
          {formatBytes(zipFile.size)})
        </p>
      )}

      {status.state === "uploading" && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          กำลังแทนที่ไฟล์...{" "}
          {status.pct !== null ? `${status.pct.toFixed(0)}%` : "(ไม่ทราบ %)"}
          {status.pct !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full bg-zinc-900 transition-all dark:bg-zinc-100"
                style={{ width: `${status.pct}%` }}
              />
            </div>
          )}
        </div>
      )}

      {status.state === "error" && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {status.message}
        </div>
      )}

      {status.state === "success" && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          ✓ แทนที่สำเร็จ — ลบเก่า {status.deleted} ไฟล์, อัปโหลดใหม่{" "}
          {status.uploaded} ไฟล์
        </div>
      )}

      <button
        type="submit"
        disabled={status.state === "uploading" || !zipFile}
        className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
      >
        {status.state === "uploading" ? "Replacing..." : "Replace all files"}
      </button>
    </form>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

type ApiResult = {
  ok: true;
  deleted: number;
  uploaded: { fileCount: number; totalSize: number; skipped: number };
};

function uploadWithProgress(
  url: string,
  body: FormData,
  onProgress: (pct: number | null) => void,
): Promise<ApiResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as ApiResult);
      } else {
        const msg =
          (data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : null) ?? `HTTP ${xhr.status}`;
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(body);
  });
}
