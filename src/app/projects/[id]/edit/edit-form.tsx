"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/types";
import { LoadingOverlay } from "@/components/loading-overlay";

type FormValues = {
  title: string;
  customer: string;
  pages: number;
  description: string;
  isbn: string;
  language: string;
  author: string;
  edition: string;
  status: ProjectStatus;
  preface: string;
};

type Props = {
  projectId: string;
  defaultValues: FormValues;
};

export function EditProjectForm({ projectId, defaultValues }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      title: String(fd.get("title") ?? "").trim(),
      customer: String(fd.get("customer") ?? "").trim(),
      pages: Number(fd.get("pages") ?? 0),
      description: String(fd.get("description") ?? "").trim() || null,
      isbn: String(fd.get("isbn") ?? "").trim() || null,
      language: String(fd.get("language") ?? "").trim() || null,
      author: String(fd.get("author") ?? "").trim() || null,
      edition: String(fd.get("edition") ?? "").trim() || null,
      status: fd.get("status") as ProjectStatus,
      preface: String(fd.get("preface") ?? "").trim() || null,
    };

    if (!payload.title) {
      setError("Title is required");
      return;
    }
    if (!payload.customer) {
      setError("Customer is required");
      return;
    }
    if (!Number.isFinite(payload.pages) || payload.pages < 0) {
      setError("Pages must be a non-negative number");
      return;
    }

    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      router.push(`/projects/${projectId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      <LoadingOverlay open={isPending} message="กำลังบันทึก..." />
      {/* Required */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Title *"
          name="title"
          defaultValue={defaultValues.title}
          required
          disabled={isPending}
        />
        <Field
          label="Customer *"
          name="customer"
          defaultValue={defaultValues.customer}
          required
          disabled={isPending}
        />
        <Field
          label="Pages *"
          name="pages"
          type="number"
          min={0}
          defaultValue={defaultValues.pages}
          required
          disabled={isPending}
        />
        <div>
          <label
            htmlFor="status"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={defaultValues.status}
            disabled={isPending}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Optional */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Author"
          name="author"
          defaultValue={defaultValues.author}
          disabled={isPending}
        />
        <Field
          label="Edition"
          name="edition"
          defaultValue={defaultValues.edition}
          placeholder="1st"
          disabled={isPending}
        />
        <Field
          label="Language"
          name="language"
          defaultValue={defaultValues.language}
          placeholder="th, en, ..."
          disabled={isPending}
        />
        <Field
          label="ISBN"
          name="isbn"
          defaultValue={defaultValues.isbn}
          disabled={isPending}
        />
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
          defaultValue={defaultValues.description}
          disabled={isPending}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
      </div>

      <div>
        <label
          htmlFor="preface"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          คำนำ (Preface)
        </label>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          คำนำของหนังสือ (Markdown) — ถ้ามีจะแสดงก่อนสารบัญตอนรวมเล่ม.
          ไม่ใส่ก็ได้
        </p>
        <textarea
          id="preface"
          name="preface"
          rows={8}
          defaultValue={defaultValues.preface}
          disabled={isPending}
          maxLength={20000}
          placeholder="ในยุคดิจิทัลที่เทคโนโลยีหมุนเปลี่ยนไปอย่างรวดเร็ว..."
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono leading-relaxed outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push(`/projects/${projectId}`)}
          disabled={isPending}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isPending ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  min,
  defaultValue,
  disabled,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
  defaultValue?: string | number;
  disabled?: boolean;
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
        defaultValue={defaultValue}
        disabled={disabled}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      />
    </div>
  );
}
