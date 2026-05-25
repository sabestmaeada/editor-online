"use client";

import { useEffect, useState } from "react";

type Props = {
  /** Whether the underlying async work is in progress. The overlay
   *  appears `debounceMs` after this flips to true, and hides
   *  immediately when it flips back to false. */
  open: boolean;
  /** Short text shown under the spinner. Keep to one line — long
   *  messages wrap awkwardly inside the panel. */
  message?: string;
  /** Delay (ms) before the overlay actually renders. Stops the
   *  "flash of overlay" on requests that finish in <300ms.
   *  Default 300 — sweet spot for human-perceptible loading. */
  debounceMs?: number;
};

/**
 * Drop-in loading overlay for async mutations (Firestore writes, R2
 * uploads, n8n calls) where the page itself doesn't change. The form
 * keeps its own button spinner (per request from the user); this
 * overlay just adds a louder visual cue so the user notices that
 * something is happening.
 *
 * Usage:
 *   const [state, setState] = useState({ kind: "idle" });
 *   ...
 *   <LoadingOverlay
 *     open={state.kind === "submitting"}
 *     message="กำลังบันทึก..."
 *   />
 *
 * Design notes:
 *   - Full-screen fixed position with backdrop (covers Nav too)
 *   - Blocks pointer events while visible — user can't double-submit
 *   - Click-through-friendly otherwise (we never block on a stuck
 *     overlay — every caller pairs open=true with a try/finally)
 *   - Debounced render: avoids a jarring flicker for fast requests
 *   - ARIA role="status" + aria-live="polite" for screen readers
 */
export function LoadingOverlay({
  open,
  message = "กำลังประมวลผล...",
  debounceMs = 300,
}: Props) {
  // Local "should render?" state separate from `open` so we can
  // debounce the rising edge without re-rendering the whole tree on
  // every keystroke a parent might do while open=false.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Open=true → schedule the visible flip. The cleanup function
    // handles BOTH cases that need to hide the overlay:
    //   - open flipped back to false (effect re-runs → cleanup runs first)
    //   - component unmounted while overlay was showing
    // Putting the hide in cleanup keeps both flows uniform and stops
    // the React-19 `set-state-in-effect` lint from firing on a separate
    // setVisible(false) branch.
    const handle = window.setTimeout(() => setVisible(true), debounceMs);
    return () => {
      window.clearTimeout(handle);
      setVisible(false);
    };
  }, [open, debounceMs]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
    >
      <div className="flex flex-col items-center gap-4 rounded-lg border border-zinc-200 bg-white px-8 py-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <Spinner />
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {message}
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="size-8 animate-spin text-zinc-900 dark:text-zinc-100"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.2"
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
