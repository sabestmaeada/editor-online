"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LoadingOverlay } from "@/components/loading-overlay";
import {
  PROMPT_TEMPLATE_CATEGORIES,
  PROMPT_TEMPLATE_CATEGORY_LABELS,
  type PromptTemplateCategory,
  type PromptTemplateScope,
} from "@/lib/types";

type Props = {
  mode: "create" | "edit";
  initial: {
    id?: string;
    label: string;
    category: PromptTemplateCategory;
    snippet: string;
    scope: PromptTemplateScope;
    status?: "active" | "archived";
  };
  /** Admin can change scope (personal ↔ shared); editor cannot. */
  canChangeScope: boolean;
  /** Edit mode only — controls whether the Delete button is rendered. */
  canDelete: boolean;
  /** Read-only view (e.g. editor opening a shared admin template).
   *  Disables every input + hides save/delete; only "กลับ" remains
   *  so the user can navigate out. Default false. */
  readOnly?: boolean;
};

const MAX_LABEL = 40;
const MAX_SNIPPET = 2_000;

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

/**
 * Shared create/edit form for prompt templates. Used by both
 * /templates/new and /templates/[id]/edit pages. The two pages
 * differ only in their initial state + which API endpoint they call.
 */
export function TemplateForm({
  mode,
  initial,
  canChangeScope,
  canDelete,
  readOnly = false,
}: Props) {
  const router = useRouter();
  const [label, setLabel] = useState(initial.label);
  const [category, setCategory] = useState<PromptTemplateCategory>(
    initial.category,
  );
  const [snippet, setSnippet] = useState(initial.snippet);
  const [scope, setScope] = useState<PromptTemplateScope>(initial.scope);
  const [status, setStatus] = useState<"active" | "archived">(
    initial.status ?? "active",
  );
  const [state, setState] = useState<State>({ kind: "idle" });
  const submitting = state.kind === "submitting";
  // Inputs are disabled while submitting OR if the caller marked the
  // form read-only (e.g. editor viewing a shared admin template).
  const inputsDisabled = submitting || readOnly;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || readOnly) return;
    setState({ kind: "submitting" });

    const url =
      mode === "create" ? "/api/templates" : `/api/templates/${initial.id}`;
    const method = mode === "create" ? "POST" : "PATCH";
    const body =
      mode === "create"
        ? { scope, label, category, snippet }
        : {
            label,
            category,
            snippet,
            status,
            // scope only sent when admin-mutable
            ...(canChangeScope ? { scope } : {}),
          };

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState({
          kind: "error",
          message:
            (data as { error?: string }).error ||
            `HTTP ${res.status} — ลองใหม่`,
        });
        return;
      }
      router.push("/templates");
      router.refresh();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "เครือข่ายมีปัญหา",
      });
    }
  }

  async function onDelete() {
    if (submitting || !initial.id) return;
    if (!confirm("ลบ template นี้? ลบแล้วกู้คืนไม่ได้")) return;

    setState({ kind: "submitting" });
    try {
      const res = await fetch(`/api/templates/${initial.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState({
          kind: "error",
          message:
            (data as { error?: string }).error ||
            `HTTP ${res.status} — ลองใหม่`,
        });
        return;
      }
      router.push("/templates");
      router.refresh();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "เครือข่ายมีปัญหา",
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-6">
      <LoadingOverlay
        open={submitting}
        message={mode === "create" ? "กำลังสร้าง template..." : "กำลังบันทึก..."}
      />
      {/* Label */}
      <section>
        <label
          htmlFor="label"
          className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        >
          ชื่อ template (chip label) <span className="text-red-500">*</span>
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          ข้อความสั้น ๆ ที่ขึ้นบน chip ใต้ textarea เช่น &ldquo;Beginner&rdquo;,
          &ldquo;+ Case study&rdquo; — สูงสุด {MAX_LABEL} ตัวอักษร
        </p>
        <input
          id="label"
          type="text"
          required
          maxLength={MAX_LABEL}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={inputsDisabled}
          placeholder="Beginner"
          className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <div className="mt-1 text-right text-xs text-zinc-400">
          {label.length} / {MAX_LABEL}
        </div>
      </section>

      {/* Category */}
      <section>
        <label
          htmlFor="category"
          className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        >
          หมวดหมู่ <span className="text-red-500">*</span>
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          กลุ่มของ chip ในฟอร์มสร้างเนื้อหา — จัดอยู่ใต้หัวข้อหมวดเดียวกัน
        </p>
        <select
          id="category"
          value={category}
          onChange={(e) =>
            setCategory(e.target.value as PromptTemplateCategory)
          }
          disabled={inputsDisabled}
          className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {PROMPT_TEMPLATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {PROMPT_TEMPLATE_CATEGORY_LABELS[c]} ({c})
            </option>
          ))}
        </select>
      </section>

      {/* Scope (admin only for create-shared / change-scope; editor sees disabled) */}
      <section>
        <label
          htmlFor="scope"
          className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Scope
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          👤 Personal = เฉพาะคุณเห็น / 🌐 Shared = ทุก editor เห็น (admin จัดการ)
        </p>
        <select
          id="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as PromptTemplateScope)}
          disabled={inputsDisabled || !canChangeScope}
          className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="personal">👤 Personal — เฉพาะคุณ</option>
          <option value="shared">🌐 Shared — ทุก editor</option>
        </select>
        {!canChangeScope && (
          <p className="mt-1 text-xs text-zinc-400">
            (เฉพาะ admin เปลี่ยน scope ได้)
          </p>
        )}
      </section>

      {/* Snippet */}
      <section>
        <label
          htmlFor="snippet"
          className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        >
          เนื้อหา snippet <span className="text-red-500">*</span>
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          ข้อความที่จะถูก append ลงในกล่อง customInstructions เมื่อ click chip
          — รองรับ markdown. สูงสุด {MAX_SNIPPET} ตัวอักษร
        </p>
        <textarea
          id="snippet"
          required
          maxLength={MAX_SNIPPET}
          value={snippet}
          onChange={(e) => setSnippet(e.target.value)}
          disabled={inputsDisabled}
          rows={12}
          placeholder={`## ระดับผู้อ่าน\n- เขียนสำหรับผู้เริ่มต้น (beginner)\n- อธิบายศัพท์เทคนิคทุกคำเมื่อปรากฏครั้งแรก`}
          className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <div className="mt-1 text-right text-xs text-zinc-400">
          {snippet.length} / {MAX_SNIPPET}
        </div>
      </section>

      {/* Status (edit only, hidden in read-only since user can't save changes) */}
      {mode === "edit" && !readOnly && (
        <section>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={status === "archived"}
              onChange={(e) =>
                setStatus(e.target.checked ? "archived" : "active")
              }
              disabled={inputsDisabled}
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
            />
            <span className="text-zinc-900 dark:text-zinc-100">
              Archive template
            </span>
            <span className="text-xs text-zinc-500">
              (ซ่อนจากฟอร์มสร้างเนื้อหา — เก็บไว้ในระบบ ไม่ลบ)
            </span>
          </label>
        </section>
      )}

      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {state.message}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <div>
          {mode === "edit" && canDelete && !readOnly && (
            <button
              type="button"
              onClick={onDelete}
              disabled={inputsDisabled}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              ลบ template
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/templates"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {readOnly ? "← กลับ" : "ยกเลิก"}
          </Link>
          {!readOnly && (
          <button
            type="submit"
            disabled={inputsDisabled}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {submitting
              ? "กำลังบันทึก…"
              : mode === "create"
                ? "สร้าง template"
                : "บันทึก"}
          </button>
          )}
        </div>
      </div>
    </form>
  );
}
