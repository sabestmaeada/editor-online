/**
 * Inline saving indicator — small spinning circle for use inside
 * sentences, next to form controls, or beside list items while a
 * quick mutation (single-field update, color change, status toggle)
 * is in flight.
 *
 * Use this — not `LoadingOverlay` — for sub-second background saves
 * where blocking the whole UI would feel heavy. The optimistic
 * update has already happened by the time this is visible; this is
 * just the "we're confirming it with the server" feedback.
 */
export function InlineSpinner({
  size = 14,
  className = "",
  label = "กำลังบันทึก",
}: {
  /** Pixel size. Default 14 — sits nicely next to body text. */
  size?: number;
  /** Tailwind class override (e.g. text colour). Defaults to muted zinc. */
  className?: string;
  /** Accessible label (also acts as a hover tooltip via title). */
  label?: string;
}) {
  return (
    <svg
      className={`animate-spin ${className || "text-zinc-500 dark:text-zinc-400"}`}
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label}
    >
      <title>{label}</title>
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
