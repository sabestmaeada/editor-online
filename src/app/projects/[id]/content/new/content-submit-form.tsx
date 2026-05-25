"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import {
  PROMPT_TEMPLATE_CATEGORIES,
  PROMPT_TEMPLATE_CATEGORY_LABELS,
  type PromptTemplateCategory,
  type PromptTemplateScope,
} from "@/lib/types";
import { LoadingOverlay } from "@/components/loading-overlay";

type ToneDisplay =
  | { id: string; name: string; preview: string }
  | { error: string }
  | null;

/** Slim payload of a template — only the fields the chip UI needs.
 *  Page strips heavy fields (timestamps, usage, owner) before sending. */
export type FormTemplate = {
  id: string;
  scope: PromptTemplateScope;
  label: string;
  category: PromptTemplateCategory;
  snippet: string;
};

type Props = {
  projectId: string;
  bookTitle: string;
  chapterCount: number;
  tone: ToneDisplay;
  /** Layer 2 — read-only structure rules (heading, image syntax,
   *  table, language, no emoji). Shown in "ดูข้อกำหนดโครงสร้าง"
   *  collapse + appears as ② in the composed preview. */
  structurePrompt: string;
  /** Templates visible to this user (their personal + all shared).
   *  Empty array if the role can't use templates — chips section
   *  is hidden in that case. */
  templates: FormTemplate[];
  /** ID of the shared template treated as "Default" (admin-curated).
   *  Used to:
   *    - highlight the chip with sky border + ⭐ icon
   *    - show an onboarding banner when not yet applied
   *  Null when no shared template is labelled "Default" yet (e.g.
   *  on a fresh deploy before admin curates one). */
  defaultTemplateId: string | null;
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
  templates,
  defaultTemplateId,
  canSubmit,
  outlineFinalized,
}: Props) {
  const router = useRouter();
  // Textarea starts empty — editor builds it up by clicking chips
  // (including the admin-curated "Default" chip) or typing freely.
  // No hard-coded fallback any more (see P2-S32).
  const [customInstructions, setCustomInstructions] = useState("");
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
      <LoadingOverlay
        open={submitting}
        message="กำลังส่งงานสร้างเนื้อหา..."
      />
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

      {/* ── Custom instructions (Layer 3 — editable, starts empty) ── */}
      <section>
        <label
          htmlFor="custom-instructions"
          className="flex items-center justify-between text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        >
          <span>คำสั่งเพิ่มเติม / สไตล์เนื้อหา</span>
          {customInstructions.length > 0 && (
            <button
              type="button"
              onClick={() => setCustomInstructions("")}
              disabled={submitting}
              className="text-xs font-normal text-zinc-500 underline hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-zinc-100"
            >
              ล้างข้อความ
            </button>
          )}
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          คลิก chip ด้านล่างเพื่อแทรกสไตล์อย่างรวดเร็ว หรือพิมพ์เองได้ตามต้องการ
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

        {/* Template chips — toggle append/remove snippet from textarea */}
        <TemplateChips
          templates={templates}
          defaultTemplateId={defaultTemplateId}
          customInstructions={customInstructions}
          setCustomInstructions={setCustomInstructions}
          disabled={submitting}
        />
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

/**
 * Chips section rendered under the customInstructions textarea.
 *
 * Each chip = one prompt template. Click behaviour is "toggle":
 *   - if snippet is NOT currently in textarea → append it (separated by \n\n)
 *   - if snippet IS in textarea → remove it (and any extra blank lines)
 *
 * "Applied" state is computed from `customInstructions.includes(snippet)`
 * so if the user manually edits/deletes a snippet's text, the chip auto-
 * resyncs. Stale state from a separate `appliedSet` would be confusing.
 *
 * Personal templates (👤) are owned by the user; shared (🌐) are
 * admin-curated. Grouped by category for scanability — only categories
 * that have at least one template are rendered.
 *
 * The shared "Default" template (identified by `defaultTemplateId`) is
 * styled with a sky-coloured border + ⭐ icon to draw attention, and an
 * onboarding banner explains it to first-time users until they apply it.
 */
function TemplateChips({
  templates,
  defaultTemplateId,
  customInstructions,
  setCustomInstructions,
  disabled,
}: {
  templates: FormTemplate[];
  defaultTemplateId: string | null;
  customInstructions: string;
  setCustomInstructions: (s: string) => void;
  disabled: boolean;
}) {
  // Group templates by category. Stable iteration order matches the
  // PROMPT_TEMPLATE_CATEGORIES constant declaration order.
  const grouped = useMemo(() => {
    const map = new Map<PromptTemplateCategory, FormTemplate[]>();
    for (const c of PROMPT_TEMPLATE_CATEGORIES) map.set(c, []);
    for (const t of templates) {
      const arr = map.get(t.category);
      if (arr) arr.push(t);
    }
    return map;
  }, [templates]);

  function toggle(t: FormTemplate) {
    if (disabled) return;
    if (customInstructions.includes(t.snippet)) {
      // Remove — also collapse any double blank lines left behind so the
      // textarea doesn't accumulate whitespace after multiple toggles.
      const next = customInstructions
        .replace(t.snippet, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      setCustomInstructions(next);
    } else {
      // Append with a blank line separator so each snippet reads as its
      // own block when the AI sees the composed prompt.
      const current = customInstructions.trimEnd();
      const sep = current.length > 0 ? "\n\n" : "";
      setCustomInstructions(current + sep + t.snippet);
    }
  }

  // Resolve the Default template + its applied state for the banner.
  const defaultTpl = defaultTemplateId
    ? (templates.find((t) => t.id === defaultTemplateId) ?? null)
    : null;
  const defaultApplied = defaultTpl
    ? customInstructions.includes(defaultTpl.snippet)
    : false;

  return (
    <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          เทมเพลตด่วน — คลิกเพื่อแทรก / คลิกซ้ำเพื่อลบ
        </div>
        <Link
          href="/templates"
          className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          จัดการ templates →
        </Link>
      </div>

      {/* Onboarding banner — only when Default chip exists AND user hasn't
          applied it yet. Hides itself the moment user clicks the chip. */}
      {defaultTpl && !defaultApplied && (
        <div className="mt-3 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
          💡 คลิก chip{" "}
          <span className="font-semibold">
            ⭐ {defaultTpl.label}
          </span>{" "}
          ด้านล่างเพื่อใช้สไตล์ค่าเริ่มต้นที่ admin จัดไว้
        </div>
      )}

      {templates.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          ยังไม่มี template — สร้าง snippet ที่ใช้บ่อยใน{" "}
          <Link
            href="/templates/new"
            className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            หน้า templates
          </Link>{" "}
          เพื่อเรียกใช้ซ้ำได้
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {PROMPT_TEMPLATE_CATEGORIES.map((cat) => {
            const items = grouped.get(cat) ?? [];
            if (items.length === 0) return null;
            return (
              <div
                key={cat}
                className="flex flex-wrap items-center gap-1.5 text-xs"
              >
                <span className="min-w-[80px] shrink-0 text-zinc-500">
                  {PROMPT_TEMPLATE_CATEGORY_LABELS[cat]}:
                </span>
                {items.map((t) => {
                  const applied = customInstructions.includes(t.snippet);
                  const isDefault = t.id === defaultTemplateId;
                  // 3 visual states layered: applied wins over isDefault
                  // (emerald) so the user can always see "this is in your
                  // textarea right now". When NOT applied, the Default
                  // chip gets a sky-blue ring to draw attention.
                  const className =
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
                    (applied
                      ? "border-emerald-500 bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900"
                      : isDefault
                        ? "border-sky-500 bg-sky-50 text-sky-900 ring-2 ring-sky-200 hover:bg-sky-100 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-900 dark:hover:bg-sky-900"
                        : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800");
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggle(t)}
                      disabled={disabled}
                      title={t.snippet}
                      className={className}
                    >
                      {isDefault && <span aria-hidden="true">⭐</span>}
                      <span aria-hidden="true">
                        {t.scope === "shared" ? "🌐" : "👤"}
                      </span>
                      <span>{t.label}</span>
                      {applied && <span aria-hidden="true">✓</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
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
