"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  uploadFileToR2,
  type UploadStatus,
} from "@/lib/upload-via-presigned";

export function ProjectUploadForm() {
  const router = useRouter();
  const [status, setStatus] = useState<UploadStatus>({ stage: "idle" });
  const [zipFile, setZipFile] = useState<File | null>(null);

  function handleZipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setZipFile(f);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!zipFile) {
      setStatus({ stage: "error", message: "กรุณาเลือกไฟล์ ZIP" });
      return;
    }
    if (!/\.zip$/i.test(zipFile.name)) {
      setStatus({ stage: "error", message: "ไฟล์ต้องเป็น .zip" });
      return;
    }

    const fd = new FormData(form);
    const metadata = {
      title: fd.get("title"),
      customer: fd.get("customer"),
      pages: fd.get("pages"),
      description: fd.get("description"),
      isbn: fd.get("isbn"),
      language: fd.get("language"),
      author: fd.get("author"),
      edition: fd.get("edition"),
    };

    try {
      // Step 1+2: presigned URL → direct PUT to R2
      const { uploadKey } = await uploadFileToR2({
        file: zipFile,
        purpose: "create",
        onStatus: setStatus,
      });

      // Step 3: tell server to process
      setStatus({ stage: "processing" });
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata, uploadKey }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        project?: { id?: string };
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      if (!data.project?.id) throw new Error("Server returned no project id");

      setStatus({ stage: "done" });
      router.push(`/projects/${data.project.id}`);
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
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      {/* Required fields */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Title *" name="title" required placeholder="The Book Title" />
        <Field label="Customer *" name="customer" required placeholder="ABC Publishing" />
        <Field label="Pages *" name="pages" type="number" min={1} required placeholder="240" />
        <Field label="Language" name="language" placeholder="th, en, ..." />
      </section>

      {/* Optional metadata */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Author" name="author" />
        <Field label="Edition" name="edition" placeholder="1st" />
        <Field label="ISBN" name="isbn" />
      </section>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
      </div>

      {/* ZIP file */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          HTML Folder (zipped) *
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          บีบอัด folder ของหนังสือเป็น .zip ก่อน upload (ต้องมี HTML อย่างน้อย 1 ไฟล์)
        </p>
        <input
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          onChange={handleZipChange}
          required
          disabled={isBusy}
          className="mt-2 block w-full cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-sm file:font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:file:bg-zinc-800 dark:hover:bg-zinc-800"
        />
        {zipFile && (
          <p className="mt-2 text-xs text-zinc-500">
            Selected: <span className="font-medium">{zipFile.name}</span> (
            {formatBytes(zipFile.size)})
          </p>
        )}
      </div>

      {/* Status messages */}
      <StatusBanner status={status} />

      {/* Submit */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={isBusy}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isBusy ? "Working..." : "Create & Upload"}
        </button>
      </div>
    </form>
  );
}

function StatusBanner({ status }: { status: UploadStatus }) {
  if (status.stage === "idle" || status.stage === "done") return null;
  if (status.stage === "error") {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        {status.message}
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
        : "กำลังประมวลผลบน server (unzip + save)...";
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

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  min,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        min={min}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      />
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
