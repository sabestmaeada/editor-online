"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

type ToneDisplay =
  | { id: string; name: string; preview: string }
  | { error: string }
  | null;

type Props = {
  projectId: string;
  bookTitle: string;
  chapterCount: number;
  tone: ToneDisplay;
  /** Layer 2 — read-only structure rules (heading, image syntax,
   *  table, language, no emoji). Shown in "ดูข้อกำหนดโครงสร้าง"
   *  collapse + appears as ② in the composed preview. */
  structurePrompt: string;
  /** Layer 3 default — pre-fills the customInstructions textarea so
   *  the user starts with a sensible style baseline they can edit. */
  defaultCustomInstructions: string;
  canSubmit: boolean;
  outlineFinalized: boolean;
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

const MAX_CUSTOM = 5_000;

/**
 * Phase 2 content-generation submit form.
 *
 * The user reviews:
 *   - which tone will be used (read-only — set during outline)
 *   - the default structural instructions (read-only)
 *   - any per-job custom instructions they want to add
 *   - the composed final prompt that will be sent to n8n
 *
 * Submit → POST /api/projects/[id]/content/generate → redirect to job
 * status page.
 */
export function ContentSubmitForm({
  projectId,
  bookTitle,
  chapterCount,
  tone,
  structurePrompt,
  defaultCustomInstructions,
  canSubmit,
  outlineFinalized,
}: Props) {
  const router = useRouter();
  // Pre-fill the textarea with the default Layer 3 content style rules.
  // User can edit/delete freely — what they leave at submit time is
  // what gets sent (or null if they wipe it clean).
  const [customInstructions, setCustomInstructions] = useState(
    defaultCustomInstructions,
  );
  const [generateImages, setGenerateImages] = useState(false);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const [showDefaults, setShowDefaults] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const submitting = state.kind === "submitting";
  const tonePrompt =
    tone && "id" in tone && typeof tone.preview === "string"
      ? // We only have a preview snippet on the client (full prompt is
        // server-only). The actual composer runs server-side; this is
        // just for display.
        tone.preview
      : null;

  const previewText = useMemo(() => {
    const blocks: string[] = [];
    blocks.push(
      tonePrompt
        ? `## ① สำนวน (Tone)\n${tonePrompt}${tonePrompt.length >= 240 ? "\n…(แสดง 240 ตัวอักษรแรก)" : ""}`
        : "## ① สำนวน (Tone)\n(ไม่ได้เลือกสำนวน — ข้ามชั้นนี้)",
    );
    blocks.push(`## ② โครงสร้าง (Structure)\n${structurePrompt}`);
    const c = customInstructions.trim();
    blocks.push(
      c.length > 0
        ? `## ③ คำสั่งเพิ่มเติม (Custom)\n${c}`
        : "## ③ คำสั่งเพิ่มเติม (Custom)\n(ไม่มี)",
    );
    return blocks.join("\n\n");
  }, [tonePrompt, structurePrompt, customInstructions]);

  const estimatedMin = Math.max(1, Math.ceil((chapterCount * 30) / 60));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || !canSubmit) return;

    setState({ kind: "submitting" });
    try {
      const res = await fetch(
        `/api/projects/${projectId}/content/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customInstructions: customInstructions.trim() || null,
            generateImages,
          }),
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
      const { jobId } = (await res.json()) as { jobId: string };
      router.push(`/projects/${projectId}/content/jobs/${jobId}`);
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

  return (
    <form onSubmit={onSubmit} className="mt-8 max-w-3xl space-y-6">
      {outlineFinalized && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          ⚠️ เค้าโครงนี้ถูก finalize แล้ว — การสร้างเนื้อหารอบนี้คือ retry.
          งานเก่าจะถูกทับ
        </div>
      )}

      {/* ── Tone ── */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          สำนวนการเขียน (Tone)
        </h2>
        {tone === null ? (
          <p className="mt-1 text-sm text-zinc-500">
            ไม่ได้เลือกสำนวน — ระบบจะใช้ default tone (
            <Link
              href={`/projects/${projectId}/outline/new`}
              className="underline"
            >
              แก้ไขใน outline
            </Link>
            )
          </p>
        ) : "error" in tone ? (
          <div className="mt-1 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            ❌ {tone.error}
          </div>
        ) : (
          <div className="mt-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="font-medium text-zinc-900 dark:text-zinc-100">
              {tone.name}
            </div>
            <div className="mt-1 line-clamp-2 text-xs text-zinc-500">
              {tone.preview}
              {tone.preview.length >= 240 ? "…" : ""}
            </div>
          </div>
        )}
        <p className="mt-1 text-xs text-zinc-400">
          สำนวนถูกตั้งค่าตอนสร้าง outline — แก้ไขได้ที่หน้า outline form
        </p>
      </section>

      {/* ── Structure rules (Layer 2 — read-only) ── */}
      <section>
        <button
          type="button"
          onClick={() => setShowDefaults((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
        >
          ข้อกำหนดโครงสร้าง (Structure)
          <span className="text-xs text-zinc-400">
            {showDefaults ? "▲ ซ่อน" : "▼ ดู"}
          </span>
        </button>
        <p className="mt-1 text-xs text-zinc-500">
          กฎโครงสร้างที่ระบบบังคับ (heading, image, table, ภาษา) — แก้ไขได้โดย
          admin (PR + redeploy) เท่านั้น
        </p>
        {showDefaults && (
          <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs whitespace-pre-wrap text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {structurePrompt}
          </pre>
        )}
      </section>

      {/* ── Custom instructions (Layer 3 — editable, pre-filled) ── */}
      <section>
        <label
          htmlFor="custom-instructions"
          className="flex items-center justify-between text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        >
          <span>คำสั่งเพิ่มเติม / สไตล์เนื้อหา</span>
          <button
            type="button"
            onClick={() => setCustomInstructions(defaultCustomInstructions)}
            disabled={
              submitting || customInstructions === defaultCustomInstructions
            }
            className="text-xs font-normal text-zinc-500 underline hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-zinc-100"
          >
            ↺ คืนค่าตั้งต้น
          </button>
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          ค่าเริ่มต้นเป็นสไตล์สำหรับตำราเชิงเทคนิค (ความยาวบท, code block,
          note/workshop, step-by-step). แก้ไข/ลบทิ้งได้ตามชนิดหนังสือ
        </p>
        <textarea
          id="custom-instructions"
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          disabled={submitting}
          rows={14}
          maxLength={MAX_CUSTOM}
          className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          placeholder="พิมพ์คำสั่งเพิ่มเติม… (ลบทิ้งได้ถ้าไม่ต้องการ)"
        />
        <div className="mt-1 text-right text-xs text-zinc-400">
          {customInstructions.length} / {MAX_CUSTOM}
        </div>
      </section>

      {/* ── Image generation option ── */}
      <section>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={generateImages}
            onChange={(e) => setGenerateImages(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-700"
          />
          <div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              สร้างภาพประกอบด้วย AI
            </div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              เปิด AI generate ภาพประกอบสำหรับ {"[[IMAGE: ...]]"} placeholder
              แต่ละจุดในเนื้อหา — ใช้เวลานานขึ้น + มีค่าใช้จ่ายเพิ่ม
              <br />
              ค่าเริ่มต้น: <strong>ไม่สร้าง</strong> — เพื่อความเร็วและประหยัด
            </div>
          </div>
        </label>
      </section>

      {/* ── Preview composed prompt (collapsible) ── */}
      <section>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
        >
          ตัวอย่าง prompt สุดท้าย (Preview)
          <span className="text-xs text-zinc-400">
            {showPreview ? "▲ ซ่อน" : "▼ ดู"}
          </span>
        </button>
        <p className="mt-1 text-xs text-zinc-500">
          รวม 3 ชั้น (tone + structure + custom) — อัปเดตทันทีตามที่พิมพ์
        </p>
        {showPreview && (
          <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs whitespace-pre-wrap text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {previewText}
          </pre>
        )}
      </section>

      {/* ── Estimate ── */}
      <section className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex justify-between">
          <span className="text-zinc-500">หนังสือ</span>
          <span className="font-medium">{bookTitle}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-zinc-500">จำนวนบท</span>
          <span className="font-medium">{chapterCount} บท</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-zinc-500">เวลาที่คาดการณ์</span>
          <span className="font-medium">
            ~{chapterCount} × 30s = {estimatedMin} นาที
          </span>
        </div>
      </section>

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
          href={`/projects/${projectId}/outline`}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ยกเลิก
        </Link>
        <button
          type="submit"
          disabled={submitting || !canSubmit}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitting ? (
            <>
              <Spinner /> กำลังส่ง…
            </>
          ) : (
            <>เริ่มสร้างเนื้อหา →</>
          )}
        </button>
      </div>
    </form>
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
