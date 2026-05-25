"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  ContentJobStatus,
  ChapterJobStatus,
} from "@/lib/types";
import { LoadingOverlay } from "@/components/loading-overlay";

/** Serialised version of ContentJob (Timestamps → epoch ms) for RSC handoff. */
export type JobSnapshot = {
  id: string;
  status: ContentJobStatus;
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
  toneName: string | null;
  createdAt: number; // epoch ms
  updatedAt: number;
  chapters: Array<{
    index: number;
    chapter: string;
    title: string;
    status: ChapterJobStatus;
    /** True when HTML is available — UI shows preview/download
     *  buttons. Backed by ChapterJobItem.htmlR2Key on the server. */
    hasHtml: boolean;
    htmlBytes: number | null;
    wordCount: number | null;
    imageCount: number | null;
    error: string | null;
  }>;
};

type Props = {
  projectId: string;
  /** Current fileCount of the project — shown in the assemble
   *  confirm modal so the user knows how many files will be replaced. */
  projectFileCount: number;
  initialSnapshot: JobSnapshot;
};

const POLL_INTERVAL_MS = 5_000;

const TERMINAL: ContentJobStatus[] = ["done", "partial", "failed"];

/**
 * Job-status UI for Phase 2 content generation.
 *
 * Polls /api/projects/[id]/content/jobs/[jobId] every 5s while the job
 * is still in `pending` or `generating` — stops once we reach a
 * terminal state to avoid hammering the API.
 */
export function JobStatusView({
  projectId,
  projectFileCount,
  initialSnapshot,
}: Props) {
  const router = useRouter();
  const [job, setJob] = useState<JobSnapshot>(initialSnapshot);
  const [polling, setPolling] = useState(
    !TERMINAL.includes(initialSnapshot.status),
  );
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<
    "idle" | "confirming" | "submitting" | { error: string }
  >("idle");
  const [assembling, setAssembling] = useState<
    | "idle"
    | "confirming"
    | "submitting"
    | { done: number; bytes: number; unchanged: boolean }
    | { error: string }
  >("idle");

  function startAssemble() {
    // If there are existing files, warn before overwriting. Empty
    // project (fileCount=0) → skip the confirm entirely.
    if (projectFileCount > 0) {
      setAssembling("confirming");
    } else {
      void handleAssemble();
    }
  }

  async function handleAssemble() {
    setAssembling("submitting");
    try {
      const res = await fetch(
        `/api/projects/${projectId}/content/jobs/${job.id}/assemble`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        chapters?: number;
        totalSize?: number;
        unchanged?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setAssembling({
          error:
            data.error ?? `เกิดข้อผิดพลาด (HTTP ${res.status})`,
        });
        return;
      }
      setAssembling({
        done: data.chapters ?? 0,
        bytes: data.totalSize ?? 0,
        unchanged: data.unchanged === true,
      });
      // Refresh so project page picks up updated fileCount/totalSize.
      router.refresh();
    } catch (err) {
      setAssembling({
        error: err instanceof Error ? err.message : "เครือข่ายมีปัญหา",
      });
    }
  }

  async function handleDelete() {
    setDeleting("submitting");
    try {
      const res = await fetch(
        `/api/projects/${projectId}/content/jobs/${job.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleting({
          error:
            (body as { error?: string }).error ||
            `เกิดข้อผิดพลาด (HTTP ${res.status})`,
        });
        return;
      }
      // Redirect back to project page — job no longer exists.
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch (err) {
      setDeleting({
        error: err instanceof Error ? err.message : "เครือข่ายมีปัญหา",
      });
    }
  }

  // Stable ref so the polling effect doesn't re-create the interval
  // on every render.
  const isTerminalRef = useRef(TERMINAL.includes(initialSnapshot.status));

  useEffect(() => {
    isTerminalRef.current = TERMINAL.includes(job.status);
    if (isTerminalRef.current) {
      setPolling(false);
    }
  }, [job.status]);

  useEffect(() => {
    if (!polling) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/content/jobs/${job.id}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { job?: unknown };
        if (cancelled || !data.job) return;
        const next = serialiseFromApi(data.job);
        if (next) setJob(next);
      } catch {
        // Swallow — network blip, try again next tick.
      }
    };

    const handle = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [polling, projectId, job.id]);

  const progressPct =
    job.totalChapters > 0
      ? Math.round(
          ((job.completedChapters + job.failedChapters) / job.totalChapters) *
            100,
        )
      : 0;

  return (
    <div className="mt-8 space-y-6">
      <LoadingOverlay
        open={assembling === "submitting"}
        message="กำลังรวมเป็นเล่ม (book.html + style.css)..."
      />
      <LoadingOverlay
        open={deleting === "submitting"}
        message="กำลังลบเนื้อหา..."
      />
      <section>
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2">
              <JobStatusBadge status={job.status} />
              {polling && (
                <span className="text-xs text-zinc-500">
                  · กำลังอัปเดตทุก 5 วินาที
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              เสร็จแล้ว {job.completedChapters} / {job.totalChapters} บท
              {job.failedChapters > 0 ? ` · ล้มเหลว ${job.failedChapters} บท` : ""}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tracking-tight">
              {progressPct}%
            </div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-zinc-900 transition-all dark:bg-zinc-100"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          รายการบท
        </h2>
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">ชื่อบท</th>
                <th className="px-3 py-2 text-left font-medium">สถานะ</th>
                <th className="px-3 py-2 text-right font-medium">คำ</th>
                <th className="px-3 py-2 text-right font-medium">ภาพ</th>
                <th className="px-3 py-2 text-right font-medium">ดู</th>
              </tr>
            </thead>
            <tbody>
              {job.chapters.map((c) => (
                <tr
                  key={c.index}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-3 py-2 text-zinc-500">{c.chapter}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {c.title}
                    </div>
                    {c.error && (
                      <div className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                        {c.error}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ChapterStatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {c.wordCount?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {c.imageCount ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.hasHtml ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewing(c.index)}
                          className="text-xs text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                        >
                          ดู
                        </button>
                        <a
                          href={`/api/projects/${projectId}/content/jobs/${job.id}/chapters/${c.index}/html?download=1`}
                          className="text-xs text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
                        >
                          ดาวน์โหลด
                        </a>
                      </div>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex justify-between border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <Link
          href={`/projects/${projectId}/outline`}
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← กลับไปหน้า outline
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDeleting("confirming")}
            disabled={
              deleting === "submitting" || deleting === "confirming"
            }
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:bg-zinc-950 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            🗑 ลบเนื้อหา
          </button>
          {(job.status === "done" || job.status === "partial") &&
            job.completedChapters > 0 && (
              <button
                type="button"
                onClick={startAssemble}
                disabled={
                  assembling === "submitting" || assembling === "confirming"
                }
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {assembling === "submitting"
                  ? "กำลังรวม…"
                  : "📚 รวมเป็นเล่ม"}
              </button>
            )}
          {(job.status === "done" || job.status === "partial") && (
            <Link
              href={`/projects/${projectId}/content/new`}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              🔄 สร้างใหม่
            </Link>
          )}
        </div>
      </section>

      {typeof assembling === "object" && "done" in assembling && (
        <div
          role="status"
          className={
            assembling.unchanged
              ? "rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              : "rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          }
        >
          {assembling.unchanged ? (
            <>
              ℹ️ เนื้อหาเหมือนเดิม — ไม่มีการเปลี่ยนแปลง ·{" "}
              <Link
                href={`/projects/${projectId}`}
                className="font-medium underline"
              >
                ดาวน์โหลดของเดิม →
              </Link>
            </>
          ) : (
            <>
              ✅ รวมเป็นเล่มเรียบร้อย — {assembling.done} บท ·{" "}
              {(assembling.bytes / 1024).toFixed(1)} KB ·{" "}
              <Link
                href={`/projects/${projectId}`}
                className="font-medium underline"
              >
                ไปดาวน์โหลด ZIP →
              </Link>
            </>
          )}
        </div>
      )}
      {typeof assembling === "object" && "error" in assembling && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          ❌ {assembling.error}
        </div>
      )}

      {assembling === "confirming" && (
        <ConfirmAssembleModal
          fileCount={projectFileCount}
          onCancel={() => setAssembling("idle")}
          onConfirm={() => void handleAssemble()}
        />
      )}

      {(deleting === "confirming" ||
        deleting === "submitting" ||
        (typeof deleting === "object" && "error" in deleting)) && (
        <ConfirmDeleteModal
          job={job}
          state={deleting}
          onCancel={() => setDeleting("idle")}
          onConfirm={handleDelete}
        />
      )}

      {previewing !== null && (
        <ChapterPreviewModal
          projectId={projectId}
          jobId={job.id}
          chapter={job.chapters.find((c) => c.index === previewing) ?? null}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────── confirm delete modal ─────────────────── */

function ConfirmDeleteModal({
  job,
  state,
  onCancel,
  onConfirm,
}: {
  job: JobSnapshot;
  state:
    | "confirming"
    | "submitting"
    | { error: string };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const submitting = state === "submitting";
  const error =
    typeof state === "object" && "error" in state ? state.error : null;
  const completedCount = job.chapters.filter(
    (c) => c.status === "done",
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 p-4"
      onClick={submitting ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          ลบเนื้อหาที่สร้าง?
        </h2>
        <div className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <p>การลบจะทำให้:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              ลบไฟล์ HTML ทั้งหมด ({completedCount} บท) ออกจาก Cloud
              storage
            </li>
            <li>ลบประวัติการสร้างเนื้อหารอบนี้</li>
            <li>เค้าโครง (outline) ของโปรเจกต์จะไม่ถูกลบ</li>
            <li>โปรเจกต์จะไม่ถูกลบ</li>
          </ul>
          <p className="mt-3 font-medium text-red-700 dark:text-red-400">
            ⚠️ ไม่สามารถย้อนกลับได้
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {submitting ? "กำลังลบ…" : "ลบ"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── confirm assemble modal ─────────────────── */

function ConfirmAssembleModal({
  fileCount,
  onCancel,
  onConfirm,
}: {
  fileCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          รวมเป็นเล่ม?
        </h2>
        <div className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <p>
            โปรเจกต์มีไฟล์เดิมอยู่{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">
              {fileCount}
            </strong>{" "}
            ไฟล์ — จะถูกแทนที่ด้วย <code>book.html</code> + <code>style.css</code>
          </p>
          <ul className="ml-4 list-disc space-y-1 text-xs">
            <li>ถ้าเนื้อหาใหม่เหมือนเดิมจะ skip ไม่เขียนทับ</li>
            <li>ถ้าต่าง ระบบจะลบไฟล์เดิมแล้วเขียนใหม่</li>
            <li>เนื้อหาบทใน Cloud storage ยังอยู่เหมือนเดิม</li>
          </ul>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            ยืนยันรวม
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── preview modal ─────────────────── */

function ChapterPreviewModal({
  projectId,
  jobId,
  chapter,
  onClose,
}: {
  projectId: string;
  jobId: string;
  chapter: JobSnapshot["chapters"][number] | null;
  onClose: () => void;
}) {
  if (!chapter) return null;
  const htmlUrl = `/api/projects/${projectId}/content/jobs/${jobId}/chapters/${chapter.index}/html`;
  const downloadUrl = `${htmlUrl}?download=1`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <div className="text-xs text-zinc-500">
              บทที่ {chapter.chapter}
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {chapter.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={downloadUrl}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              ดาวน์โหลด
            </a>
            <a
              href={htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              เปิดในแท็บใหม่ ↗
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>
        </header>
        <iframe
          src={htmlUrl}
          className="flex-1 w-full bg-white"
          // Sandbox keeps generated HTML from running arbitrary scripts
          // against parent origin. allow-same-origin lets the iframe
          // load resources from our domain (the HTML route).
          sandbox="allow-same-origin"
          title={`บทที่ ${chapter.chapter}: ${chapter.title}`}
        />
      </div>
    </div>
  );
}

/* ─────────────────── helpers ─────────────────── */

function JobStatusBadge({ status }: { status: ContentJobStatus }) {
  const map: Record<ContentJobStatus, { label: string; cls: string }> = {
    pending: {
      label: "รอเริ่ม",
      cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    },
    generating: {
      label: "กำลังสร้าง",
      cls: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    },
    done: {
      label: "✅ เสร็จสมบูรณ์",
      cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    partial: {
      label: "⚠️ เสร็จบางส่วน",
      cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    },
    failed: {
      label: "❌ ล้มเหลว",
      cls: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    },
  };
  const { label, cls } = map[status];
  // Show animated dots only while work is in flight so the user can
  // see at a glance "the page isn't frozen". pending also gets dots —
  // it means n8n hasn't ack'd yet, which is also "waiting work".
  const showDots = status === "generating" || status === "pending";
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
      {showDots && <WorkingDots />}
    </span>
  );
}

function ChapterStatusBadge({ status }: { status: ChapterJobStatus }) {
  const map: Record<ChapterJobStatus, { label: string; cls: string }> = {
    pending: {
      label: "รอ",
      cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    },
    generating: {
      label: "กำลังเขียน",
      cls: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    },
    done: {
      label: "✓ เสร็จ",
      cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    failed: {
      label: "✗ ล้มเหลว",
      cls: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
      {status === "generating" && <WorkingDots />}
    </span>
  );
}

/**
 * Three small dots that pulse-fade in sequence — the classic
 * "thinking / working" typing-indicator. Used in the status badges
 * to signal that the page is alive while we wait for n8n callbacks.
 *
 * Uses `bg-current` so it inherits the badge's text color (sky-700 in
 * the generating state). The staggered animationDelay creates the
 * wave illusion without needing custom keyframes.
 */
function WorkingDots() {
  return (
    <span
      className="ml-1.5 inline-flex items-center gap-0.5"
      aria-hidden="true"
    >
      {[0, 200, 400].map((delay) => (
        <span
          key={delay}
          className="block size-1 rounded-full bg-current animate-pulse"
          style={{ animationDelay: `${delay}ms`, animationDuration: "1.2s" }}
        />
      ))}
    </span>
  );
}

/** Re-shape API response (Firestore Timestamps already serialised by
 *  the route handler) into our snapshot. Defensive — accepts anything
 *  shaped roughly like the expected output. */
function serialiseFromApi(raw: unknown): JobSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;

  const createdAt = parseTs(r.createdAt);
  const updatedAt = parseTs(r.updatedAt);
  if (createdAt === null || updatedAt === null) return null;

  const chapters = Array.isArray(r.chapters)
    ? r.chapters.map((c) => {
        const cc = c as Record<string, unknown>;
        return {
          index: typeof cc.index === "number" ? cc.index : 0,
          chapter: typeof cc.chapter === "string" ? cc.chapter : "",
          title: typeof cc.title === "string" ? cc.title : "",
          status: (typeof cc.status === "string"
            ? cc.status
            : "pending") as ChapterJobStatus,
          // API returns ChapterJobItem directly — has htmlR2Key,
          // not hasHtml. Coerce to boolean here so UI just checks
          // a flag without exposing the R2 key path.
          hasHtml:
            typeof cc.htmlR2Key === "string" && cc.htmlR2Key.length > 0,
          htmlBytes: typeof cc.htmlBytes === "number" ? cc.htmlBytes : null,
          wordCount: typeof cc.wordCount === "number" ? cc.wordCount : null,
          imageCount:
            typeof cc.imageCount === "number" ? cc.imageCount : null,
          error: typeof cc.error === "string" ? cc.error : null,
        };
      })
    : [];

  return {
    id: r.id,
    status: (typeof r.status === "string"
      ? r.status
      : "pending") as ContentJobStatus,
    totalChapters: typeof r.totalChapters === "number" ? r.totalChapters : 0,
    completedChapters:
      typeof r.completedChapters === "number" ? r.completedChapters : 0,
    failedChapters:
      typeof r.failedChapters === "number" ? r.failedChapters : 0,
    toneName: typeof r.toneName === "string" ? r.toneName : null,
    createdAt,
    updatedAt,
    chapters,
  };
}

function parseTs(v: unknown): number | null {
  // Firestore Timestamp serialised as { _seconds, _nanoseconds } in the
  // JSON response (Node SDK default behaviour). Convert to epoch ms.
  if (v && typeof v === "object") {
    const obj = v as { _seconds?: number; seconds?: number };
    const sec = obj._seconds ?? obj.seconds;
    if (typeof sec === "number") return sec * 1000;
  }
  if (typeof v === "number") return v;
  return null;
}
