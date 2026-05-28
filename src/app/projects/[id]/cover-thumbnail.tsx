"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Cover thumbnail with FB-profile-style click-to-upload.
 *
 * Two modes based on `canEdit`:
 *
 *   - canEdit=true  → renders as a <label> with hidden <input type=file>.
 *     Hover/focus shows a black/55 overlay with a camera icon and
 *     "เปลี่ยนรูปปก" label; click anywhere on the thumbnail opens
 *     the OS file picker. After upload completes, router.refresh
 *     reloads the parent server component (which re-reads coverKey +
 *     coverUpdatedAt) so the new image shows immediately.
 *
 *   - canEdit=false → renders the same static <img> the page used
 *     before, so admin-viewing-other-user's-project / reviewer /
 *     viewer roles see exactly what they used to.
 *
 * Permission semantics match the existing /edit cover uploader
 * (P2-S62): only `canEdit` (owner OR project_editor) can mutate
 * the cover; admin on other people's projects gets read-only view.
 *
 * The /api/projects/[id]/cover PUT route enforces canEdit again
 * server-side — this client gate is purely UX (don't show an
 * affordance the server will reject).
 */
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB — matches /edit page + server route

type Props = {
  projectId: string;
  title: string;
  hasCover: boolean;
  /** ms timestamp used to cache-bust the <img src>. */
  initialVersion: number;
  canEdit: boolean;
};

export function CoverThumbnail({
  projectId,
  title,
  hasCover: initialHasCover,
  initialVersion,
  canEdit,
}: Props) {
  const router = useRouter();
  const [hasCover, setHasCover] = useState(initialHasCover);
  const [version, setVersion] = useState(initialVersion);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!f) return;

    setError(null);

    if (!ALLOWED_MIME.includes(f.type)) {
      setError(`ไฟล์ไม่รองรับ (ต้องเป็น JPEG / PNG / WebP)`);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`ไฟล์ใหญ่เกินไป (จำกัด 5MB)`);
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
      // Local cache-bust value — parent's coverUpdatedAt will catch up
      // after router.refresh, but we update locally so the new cover
      // shows even before the refresh round-trip lands.
      setVersion(Date.now());
      router.refresh();
    });
  }

  // Both modes share the same <img> markup so the read-only view
  // matches the editable one pixel-for-pixel.
  const imageContent = hasCover ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`/api/projects/${projectId}/cover?v=${version}`}
      alt={`Cover of ${title}`}
      className="h-full w-full object-cover"
    />
  ) : (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/cover-placeholder.svg"
      alt=""
      className="h-full w-full object-cover opacity-80"
    />
  );

  // ─── Read-only mode ──────────────────────────────────────────
  if (!canEdit) {
    return (
      <div className="size-24 sm:size-32 flex-shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
        {imageContent}
      </div>
    );
  }

  // ─── Edit mode — FB-style click-to-upload ────────────────────
  return (
    <div className="flex flex-col gap-1">
      <label
        className="group relative size-24 sm:size-32 flex-shrink-0 cursor-pointer overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:ring-zinc-100"
        title="คลิกเพื่อเปลี่ยนรูปปก"
      >
        <input
          type="file"
          accept={ALLOWED_MIME.join(",")}
          onChange={handleFileChange}
          disabled={isPending}
          className="sr-only"
        />
        {imageContent}
        {/* Hover/focus overlay — also shown solid while uploading */}
        <div
          className={
            "absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 text-[11px] font-medium text-white transition-opacity " +
            (isPending
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100")
          }
          aria-hidden={!isPending}
        >
          {isPending ? (
            <span>กำลังอัปโหลด…</span>
          ) : (
            <>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span className="leading-tight">เปลี่ยน{hasCover ? "" : ""}รูปปก</span>
            </>
          )}
        </div>
      </label>
      {error && (
        <p className="max-w-[8rem] text-[11px] leading-tight text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
