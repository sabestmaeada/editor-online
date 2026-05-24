"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { OutlineFormInput } from "@/lib/types";

/** Public shape for the tone dropdown — server only sends id+name to
 *  the client (full tone doc isn't needed and would leak more than we
 *  want into the bundle). */
export type ToneOption = {
  id: string;
  name: string;
};

type Props = {
  projectId: string;
  defaults: OutlineFormInput;
  /** Tones the current editor can pick from. Empty array hides the
   *  dropdown and shows a "create your first tone" CTA instead.
   *  Admins always get an empty array (Q-Tone-4 = a). */
  availableTones: ToneOption[];
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

/**
 * Outline generation form (Phase 1 entry point).
 *
 * Submission is intentionally synchronous from the client's POV — we
 * show a "กำลังสร้าง..." overlay and wait for the POST to come back
 * (n8n+LLM is typically 15-30s). The server side has its own 45s
 * timeout (see `src/lib/n8n/outline.ts`) so we're well within Vercel's
 * 60s function limit.
 *
 * After success we redirect to the outline editor page where the user
 * sees the generated tree and can drag / promote / demote nodes.
 */
export function OutlineForm({ projectId, defaults, availableTones }: Props) {
  const router = useRouter();
  const [data, setData] = useState<OutlineFormInput>(defaults);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const hasTones = availableTones.length > 0;

  function update<K extends keyof OutlineFormInput>(
    key: K,
    value: OutlineFormInput[K],
  ) {
    setData((d) => ({ ...d, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (state.kind === "submitting") return;

    setState({ kind: "submitting" });
    try {
      const res = await fetch(
        `/api/projects/${projectId}/outline/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formInput: data }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          kind: "error",
          message:
            (body as { error?: string }).error ||
            `เกิดข้อผิดพลาด (HTTP ${res.status})`,
        });
        return;
      }
      // Success — go to the editor
      router.push(`/projects/${projectId}/outline`);
      router.refresh();
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "เครือข่ายมีปัญหา กรุณาลองใหม่",
      });
    }
  }

  const submitting = state.kind === "submitting";

  return (
    <form onSubmit={onSubmit} className="mt-8 max-w-3xl space-y-6">
      <Field
        label="ชื่อหนังสือ"
        required
        hint="ใช้เป็น context สำหรับ AI ในการสร้างเค้าโครง"
      >
        <input
          type="text"
          value={data.bookTitle}
          onChange={(e) => update("bookTitle", e.target.value)}
          disabled={submitting}
          maxLength={500}
          className={inputClass}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="จำนวนบท" required>
          <input
            type="number"
            value={data.chapterCount}
            onChange={(e) =>
              update("chapterCount", Number(e.target.value) || 0)
            }
            disabled={submitting}
            min={1}
            max={100}
            className={inputClass}
            required
          />
        </Field>
        <Field label="จำนวนหน้า" required>
          <input
            type="number"
            value={data.pageCount}
            onChange={(e) =>
              update("pageCount", Number(e.target.value) || 0)
            }
            disabled={submitting}
            min={1}
            max={2000}
            className={inputClass}
            required
          />
        </Field>
      </div>

      <Field
        label="จุดประสงค์ของหนังสือ"
        required
        hint="หนังสือเล่มนี้พูดถึงอะไร — บอกบริบทให้ AI ใช้ตอนสร้างเค้าโครง"
      >
        <textarea
          value={data.bookPurpose}
          onChange={(e) => update("bookPurpose", e.target.value)}
          disabled={submitting}
          maxLength={5000}
          rows={6}
          className={textareaClass}
          required
        />
      </Field>

      <Field
        label="จุดเด่นของหนังสือ"
        required
        hint="ประโยชน์หรือสิ่งที่ผู้อ่านจะได้รับ"
      >
        <textarea
          value={data.bookHighlights}
          onChange={(e) => update("bookHighlights", e.target.value)}
          disabled={submitting}
          maxLength={5000}
          rows={3}
          className={textareaClass}
          required
        />
      </Field>

      <Field
        label="กลุ่มเป้าหมาย"
        required
        hint="ใครคือผู้อ่าน + โทนภาษา / สไตล์การเขียนที่ต้องการ"
      >
        <textarea
          value={data.targetAudience}
          onChange={(e) => update("targetAudience", e.target.value)}
          disabled={submitting}
          maxLength={5000}
          rows={4}
          className={textareaClass}
          required
        />
      </Field>

      {hasTones ? (
        <Field
          label="สำนวนการเขียน"
          hint="เลือกสำนวนจากคลังของคุณ — ระบบจะใช้สไตล์นั้นในการสร้างเค้าโครง (optional)"
        >
          <select
            value={data.toneId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              const name = id
                ? (availableTones.find((t) => t.id === id)?.name ?? null)
                : null;
              setData((d) => ({ ...d, toneId: id, toneName: name }));
            }}
            disabled={submitting}
            className={inputClass}
          >
            <option value="">— ไม่ใช้สำนวน —</option>
            {availableTones.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            สำนวนการเขียน
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            คุณยังไม่มีสำนวนพร้อมใช้ — สร้างสำนวนแล้ว upload ตัวอย่างก่อน
            เพื่อให้ AI เลียนสไตล์ของคุณตอนสร้างเค้าโครง
          </p>
          <Link
            href="/tones/new"
            target="_blank"
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            + สร้างสำนวนใหม่
          </Link>
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

      <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <Link
          href={`/projects/${projectId}`}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ยกเลิก
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitting ? (
            <>
              <Spinner /> กำลังสร้างเค้าโครง…
            </>
          ) : (
            <>สร้างเค้าโครง →</>
          )}
        </button>
      </div>

      {submitting && (
        <p className="text-center text-xs text-zinc-500">
          ใช้เวลาประมาณ 15-30 วินาที — กรุณาอย่าปิดหน้าต่าง
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      )}
    </div>
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

const inputClass =
  "block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500 dark:disabled:bg-zinc-950 dark:disabled:text-zinc-500";

const textareaClass = inputClass + " resize-y";
