"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  ContentJobStatus,
  ChapterJobStatus,
} from "@/lib/types";

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
    htmlDriveUrl: string | null;
    wordCount: number | null;
    imageCount: number | null;
    error: string | null;
  }>;
};

type Props = {
  projectId: string;
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
export function JobStatusView({ projectId, initialSnapshot }: Props) {
  const [job, setJob] = useState<JobSnapshot>(initialSnapshot);
  const [polling, setPolling] = useState(
    !TERMINAL.includes(initialSnapshot.status),
  );

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
                    {c.htmlDriveUrl ? (
                      <a
                        href={c.htmlDriveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                      >
                        เปิด ↗
                      </a>
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
        {(job.status === "done" || job.status === "partial") && (
          <Link
            href={`/projects/${projectId}/content/new`}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            🔄 สร้างใหม่
          </Link>
        )}
      </section>
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
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
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
          htmlDriveUrl:
            typeof cc.htmlDriveUrl === "string" ? cc.htmlDriveUrl : null,
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
