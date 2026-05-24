"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Mode = "paste" | "file";
type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

const MAX_SAMPLE_BYTES = 50 * 1024;
const MAX_UPLOAD_BYTES = 1024 * 1024;

export function AddSampleForm({ toneId }: { toneId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("paste");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (state.kind === "submitting") return;

    setState({ kind: "submitting" });
    try {
      let res: Response;
      if (mode === "file") {
        if (!file) {
          setState({ kind: "error", message: "เลือกไฟล์ก่อน" });
          return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          setState({
            kind: "error",
            message: `ไฟล์ใหญ่เกิน ${MAX_UPLOAD_BYTES / 1024}KB`,
          });
          return;
        }
        const form = new FormData();
        form.append("file", file);
        res = await fetch(`/api/tones/${toneId}/samples`, {
          method: "POST",
          body: form,
        });
      } else {
        const bytes = new Blob([text]).size;
        if (bytes > MAX_SAMPLE_BYTES) {
          setState({
            kind: "error",
            message: `ข้อความใหญ่เกิน ${MAX_SAMPLE_BYTES / 1024}KB (${(bytes / 1024).toFixed(1)}KB)`,
          });
          return;
        }
        if (!text.trim()) {
          setState({ kind: "error", message: "ใส่ข้อความก่อน" });
          return;
        }
        res = await fetch(`/api/tones/${toneId}/samples`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          kind: "error",
          message:
            (body as { error?: string }).error ||
            `เพิ่มไม่สำเร็จ (HTTP ${res.status})`,
        });
        return;
      }

      // Success — back to tone detail
      router.push(`/tones/${toneId}`);
      router.refresh();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "เครือข่ายมีปัญหา",
      });
    }
  }

  const submitting = state.kind === "submitting";
  const textBytes = new Blob([text]).size;

  return (
    <form onSubmit={onSubmit} className="mt-8 max-w-3xl space-y-5">
      {/* Mode toggle */}
      <div className="inline-flex rounded-lg border border-zinc-300 p-1 dark:border-zinc-700">
        <button
          type="button"
          onClick={() => setMode("paste")}
          disabled={submitting}
          className={modeBtn(mode === "paste")}
        >
          📝 paste ข้อความ
        </button>
        <button
          type="button"
          onClick={() => setMode("file")}
          disabled={submitting}
          className={modeBtn(mode === "file")}
        >
          📎 upload ไฟล์
        </button>
      </div>

      {/* Paste mode */}
      {mode === "paste" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
            ข้อความตัวอย่าง <span className="text-red-500">*</span>
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting}
            rows={12}
            placeholder="paste ข้อความตัวอย่าง — ยิ่งยาวยิ่งช่วยให้ AI วิเคราะห์สไตล์ได้แม่นยำกว่า..."
            className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            required
          />
          <p className="mt-1 text-xs text-zinc-500">
            ขนาด {(textBytes / 1024).toFixed(1)}KB / {MAX_SAMPLE_BYTES / 1024}KB
            {textBytes > MAX_SAMPLE_BYTES && (
              <span className="ml-2 text-red-600">เกินขนาด!</span>
            )}
          </p>
        </div>
      )}

      {/* File mode */}
      {mode === "file" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
            ไฟล์ <span className="text-red-500">*</span>
          </label>
          <input
            type="file"
            accept=".txt,.md,.docx,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={submitting}
            className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700 dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900"
          />
          {file && (
            <p className="mt-2 text-xs text-zinc-500">
              📎 {file.name} · {(file.size / 1024).toFixed(1)}KB
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-500">
            รองรับ: .txt, .md, .docx, .pdf · ขนาดสูงสุด{" "}
            {MAX_UPLOAD_BYTES / 1024}KB ต่อไฟล์ · ระบบจะ extract text แล้ว
            จำกัด {MAX_SAMPLE_BYTES / 1024}KB
          </p>
        </div>
      )}

      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {state.message}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <Link
          href={`/tones/${toneId}`}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ยกเลิก
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {submitting ? (
            <>
              <Spinner /> กำลังประมวล…
            </>
          ) : (
            "เพิ่ม sample →"
          )}
        </button>
      </div>

      {submitting && (
        <p className="text-center text-xs text-zinc-500">
          ใช้เวลา ~10-30 วินาที (embed + analyze) — กรุณาอย่าปิดหน้าต่าง
        </p>
      )}
    </form>
  );
}

function modeBtn(active: boolean): string {
  return (
    "px-4 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 " +
    (active
      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800")
  );
}

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
