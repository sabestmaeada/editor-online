"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5_000;

/**
 * Client component shown on the outline page while `outline.status`
 * is "generating". Calls `router.refresh()` every 5 seconds to
 * re-fetch the server component — when n8n's callback flips the
 * status to "ready" / "failed", the next refresh swaps in the real
 * UI automatically.
 *
 * We intentionally use router.refresh() (Next.js soft refresh)
 * instead of a separate GET API — outline pages are already SSR'd
 * with strong cache control (`force-dynamic`), so refresh re-runs
 * the server work and re-renders. One pattern, one source of truth.
 */
export function OutlineGeneratingWait({
  startedAt,
}: {
  /** Epoch ms when the outline generation was first kicked off — used
   *  to show "ผ่านไปกี่นาที" in the waiting UI. Optional; if omitted
   *  the elapsed indicator is hidden. */
  startedAt?: number;
}) {
  const router = useRouter();
  // Initialise to 0 — first useEffect tick will set the real elapsed
  // value within ~1s. We must not call Date.now() during render (React
  // 19 purity rule: impure calls produce unstable results across renders).
  const [elapsedSec, setElapsedSec] = useState(0);

  // Refresh the page every 5s — the server component will re-fetch
  // the outline and (when ready) re-render the editor.
  useEffect(() => {
    const handle = window.setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [router]);

  // Tick a local "elapsed seconds" counter so the user can see we're
  // still alive between refreshes. Initial state is 0; the first tick
  // (~1s after mount) replaces it with the real elapsed value. We
  // deliberately don't setState synchronously inside this effect —
  // React 19's set-state-in-effect rule rejects that pattern.
  useEffect(() => {
    if (!startedAt) return;
    const handle = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1_000);
    return () => window.clearInterval(handle);
  }, [startedAt]);

  return (
    <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 px-6 py-12 text-center dark:border-blue-900 dark:bg-blue-950">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4">
        <Spinner />
        <div>
          <p className="text-base font-semibold text-blue-900 dark:text-blue-100">
            กำลังสร้างเค้าโครงด้วย AI
            <WorkingDots />
          </p>
          <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
            หน้านี้จะอัปเดตเองอัตโนมัติเมื่อเค้าโครงพร้อม — ปลอดภัยที่จะ
            สลับไปทำงานอื่นหรือปิดแท็บแล้วกลับมาทีหลัง
          </p>
          {startedAt && (
            <p className="mt-3 text-xs text-blue-600 dark:text-blue-400">
              ผ่านไป {formatElapsed(elapsedSec)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec} วินาที`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem === 0 ? `${min} นาที` : `${min} นาที ${rem} วินาที`;
}

function Spinner() {
  return (
    <svg
      className="size-10 animate-spin text-blue-600 dark:text-blue-400"
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
