"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LoadingOverlay } from "@/components/loading-overlay";

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

export function CreateToneForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (state.kind === "submitting") return;

    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/tones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          kind: "error",
          message:
            (body as { error?: string }).error ||
            `สร้างไม่สำเร็จ (HTTP ${res.status})`,
        });
        return;
      }
      const { tone } = (await res.json()) as { tone: { id: string } };
      router.push(`/tones/${tone.id}`);
      router.refresh();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "เครือข่ายมีปัญหา",
      });
    }
  }

  const submitting = state.kind === "submitting";

  return (
    <form onSubmit={onSubmit} className="mt-8 max-w-2xl space-y-5">
      <LoadingOverlay
        open={submitting}
        message="กำลังสร้างสำนวน..."
      />
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          ชื่อสำนวน <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          maxLength={100}
          required
          placeholder="เช่น สำนวนนิยายแฟนตาซีของผม"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500">
          ตั้งชื่อให้จำง่าย — จะใช้แสดงใน list + dropdown
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          คำอธิบาย
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
          maxLength={1000}
          rows={4}
          placeholder="เช่น สไตล์ดาร์กแฟนตาซี ใช้คำโบราณ บรรยายบรรยากาศหนัก ๆ — สำหรับหนังสือชุด..."
          className={textareaClass}
        />
        <p className="mt-1 text-xs text-zinc-500">
          อธิบายว่า tone นี้ใช้ทำอะไร / มีลักษณะแบบไหน (optional)
        </p>
      </div>

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
          href="/tones"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ยกเลิก
        </Link>
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitting ? "กำลังสร้าง…" : "สร้างสำนวน →"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500";

const textareaClass = inputClass + " resize-y";
