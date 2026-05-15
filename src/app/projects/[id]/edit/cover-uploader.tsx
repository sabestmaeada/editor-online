"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

type Props = {
  projectId: string;
  hasCover: boolean;
  /** Used in <img src=...?v=> for cache busting after upload */
  initialVersion: number;
};

export function CoverUploader({
  projectId,
  hasCover: initialHasCover,
  initialVersion,
}: Props) {
  const router = useRouter();
  const [hasCover, setHasCover] = useState(initialHasCover);
  const [version, setVersion] = useState(initialVersion);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = ""; // allow picking same file again later
    if (!f) return;

    setError(null);

    if (!ALLOWED_MIME.includes(f.type)) {
      setError(`Invalid type — must be JPEG, PNG, or WebP (got ${f.type})`);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`Too large — max ${MAX_BYTES / 1024 / 1024}MB`);
      return;
    }

    const fd = new FormData();
    fd.set("cover", f);

    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/cover`, {
        method: "PUT",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setHasCover(true);
      setVersion(Date.now());
      router.refresh();
    });
  }

  function handleRemove() {
    if (!hasCover) return;
    if (!confirm("ลบ cover image?")) return;
    setError(null);

    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/cover`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setHasCover(false);
      setVersion(Date.now());
      router.refresh();
    });
  }

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Cover image
      </label>
      <p className="mt-0.5 text-xs text-zinc-500">
        JPEG/PNG/WebP · max 5MB · แนะนำ 600×800 px
      </p>

      <div className="mt-2 flex items-start gap-4">
        <div className="size-24 sm:size-32 flex-shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
          {hasCover ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/projects/${projectId}/cover?v=${version}`}
              alt="Cover"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
              No cover
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-50 has-[:disabled]:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">
            <input
              type="file"
              accept={ALLOWED_MIME.join(",")}
              onChange={handleFileChange}
              disabled={isPending}
              className="sr-only"
            />
            {isPending && !hasCover
              ? "Uploading..."
              : hasCover
                ? "Replace"
                : "Upload cover"}
          </label>

          {hasCover && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isPending}
              className="ml-2 inline-flex items-center rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-zinc-700 dark:text-red-400 dark:hover:bg-red-950"
            >
              {isPending ? "Removing..." : "Remove"}
            </button>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
