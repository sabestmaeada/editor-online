"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  uploadFileToR2,
  type UploadStatus,
} from "@/lib/upload-via-presigned";

type Status =
  | UploadStatus
  | { stage: "success"; deleted: number; uploaded: number };

export function ReplaceFilesForm({
  projectId,
  currentFileCount,
}: {
  projectId: string;
  currentFileCount: number;
}) {
  const router = useRouter();
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ stage: "idle" });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setZipFile(f);
    setStatus({ stage: "idle" });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!zipFile) {
      setStatus({ stage: "error", message: "กรุณาเลือกไฟล์ ZIP" });
      return;
    }
    if (!/\.zip$/i.test(zipFile.name)) {
      setStatus({ stage: "error", message: "ไฟล์ต้องเป็น .zip" });
      return;
    }

    const ok = window.confirm(
      `ยืนยันแทนที่ไฟล์ทั้งหมด?\n\nไฟล์เดิม ${currentFileCount} ไฟล์จะถูกลบจาก R2 และแทนด้วยไฟล์จาก ${zipFile.name}\n\nการกระทำนี้ย้อนกลับไม่ได้`,
    );
    if (!ok) return;

    try {
      // Step 1+2: presigned URL → direct PUT to R2
      const { uploadKey } = await uploadFileToR2({
        file: zipFile,
        purpose: "replace",
        projectId,
        onStatus: setStatus,
      });

      // Step 3: tell server to process (delete old + unzip new)
      setStatus({ stage: "processing" });
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadKey }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        deleted?: number;
        uploaded?: { fileCount: number };
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      setStatus({
        stage: "success",
        deleted: data.deleted ?? 0,
        uploaded: data.uploaded?.fileCount ?? 0,
      });
      setZipFile(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setStatus({ stage: "error", message: msg });
    }
  }

  const isBusy =
    status.stage === "init" ||
    status.stage === "uploading" ||
    status.stage === "processing";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        onChange={handleFileChange}
        required
        disabled={isBusy}
        className="block w-full cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-sm file:font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:file:bg-zinc-800 dark:hover:bg-zinc-800"
      />

      {zipFile && (
        <p className="text-xs text-zinc-500">
          Selected: <span className="font-medium">{zipFile.name}</span> (
          {formatBytes(zipFile.size)})
        </p>
      )}

      <StatusBanner status={status} />

      <button
        type="submit"
        disabled={isBusy || !zipFile}
        className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
      >
        {isBusy ? "Replacing..." : "Replace all files"}
      </button>
    </form>
  );
}

function StatusBanner({ status }: { status: Status }) {
  if (status.stage === "idle" || status.stage === "done") return null;

  if (status.stage === "error") {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        {status.message}
      </div>
    );
  }

  if (status.stage === "success") {
    return (
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        ✓ แทนที่สำเร็จ — ลบเก่า {status.deleted} ไฟล์, อัปโหลดใหม่{" "}
        {status.uploaded} ไฟล์
      </div>
    );
  }

  const label =
    status.stage === "init"
      ? "กำลังขอ upload URL..."
      : status.stage === "uploading"
        ? `กำลังอัปโหลด... ${
            status.pct !== null ? `${status.pct.toFixed(0)}%` : "(starting)"
          }`
        : "กำลังประมวลผลบน server (ลบเก่า + unzip)...";
  const pct = status.stage === "uploading" ? status.pct : null;

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      {label}
      {pct !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-zinc-900 transition-all dark:bg-zinc-100"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
