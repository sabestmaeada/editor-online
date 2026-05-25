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
 * overlay adds a louder, prettier visual cue so the user notices that
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
 *   - Full-screen fixed position with dark backdrop (covers Nav too)
 *   - NO container card — spinner + text float directly on backdrop
 *   - Sky-blue gradient stroke (matches the "active / in progress"
 *     accent used in status badges across the app — sky-50/sky-700)
 *   - Soft outer glow on the spinner for a premium / "alive" feel
 *   - Static faint ring behind the moving arc so the orbit reads
 *     clearly even at small sizes
 *   - Message in white with a drop-shadow for legibility without a card
 *   - Debounced render: avoids a jarring flicker for fast requests
 *   - ARIA role="status" + aria-live="polite" for screen readers
 */
export function LoadingOverlay({
  open,
  message = "กำลังประมวลผล...",
  debounceMs = 300,
}: Props) {
  // Local "should render?" state separate from `open` so we can
  // debounce the rising edge.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Open=true → schedule the visible flip. The cleanup handles both
    // (a) open flipped back to false (effect re-runs → cleanup first)
    // (b) component unmounted while overlay was showing
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
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-black/40 backdrop-blur-[2px]"
    >
      <GradientSpinner />
      <p className="text-base font-medium text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
        {message}
      </p>
    </div>
  );
}

/**
 * Gradient ring spinner. Two stacked circles:
 *   1. A faint static ring (background) — the "track"
 *   2. The animated arc with a 3-stop linear gradient stroke
 *
 * We hard-code the SVG gradient id (only one overlay is on-screen at a
 * time thanks to the debounce, so id collisions aren't an issue) so
 * we don't need useId, which would require sanitising for SVG syntax.
 */
const SPINNER_GRADIENT_ID = "loading-overlay-spinner-grad";

function GradientSpinner() {
  return (
    <svg
      className="size-14 animate-spin drop-shadow-[0_0_18px_rgba(56,189,248,0.55)]"
      viewBox="0 0 50 50"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={SPINNER_GRADIENT_ID}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          {/* Sky-blue gradient — light → mid → deep so the moving arc
              shows depth/direction without leaving the blue family. */}
          <stop offset="0%" stopColor="#7dd3fc" />   {/* sky-300 */}
          <stop offset="50%" stopColor="#0ea5e9" />  {/* sky-500 */}
          <stop offset="100%" stopColor="#0369a1" /> {/* sky-700 */}
        </linearGradient>
      </defs>
      {/* Static track — keeps the orbit visually anchored when the
          gradient arc swings around. */}
      <circle
        cx="25"
        cy="25"
        r="20"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="4"
      />
      {/* Animated arc. strokeDasharray creates the ~250° visible arc;
          the parent's `animate-spin` rotates the whole SVG. */}
      <circle
        cx="25"
        cy="25"
        r="20"
        stroke={`url(#${SPINNER_GRADIENT_ID})`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="90 50"
      />
    </svg>
  );
}
