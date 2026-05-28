"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { InlineSpinner } from "@/components/inline-spinner";

/**
 * Event-type filter chip for /admin/audit.
 *
 * Same `useLinkStatus` pattern as `FilterPill` (P2-S69) and
 * `FilterTab` (P2-S70). 40+ chips on this page (one per
 * AuthEventType), so the spinner needs to appear inside the
 * clicked chip only — the per-Link nature of useLinkStatus handles
 * that automatically.
 *
 * `badge` prop carries the per-event-type colour pair (from
 * EVENT_BADGE map in page.tsx) used when the chip is INACTIVE so
 * users can scan event types by colour. Active state still falls
 * back to neutral zinc-900 so the selection is unambiguous.
 *
 * Layout tweak vs the old inline version: added
 * `inline-flex items-center gap-1.5` so the spinner sits cleanly
 * beside the label without the chip relying on default text flow.
 */
type Props = {
  href: string;
  active: boolean;
  label: string;
  /** Tailwind class string from EVENT_BADGE map — bg + text colour for inactive state. */
  badge?: string;
};

export function FilterChip({ href, active, label, badge }: Props) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : badge
            ? `${badge} hover:opacity-80`
            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700")
      }
    >
      <ChipPending />
      {label}
    </Link>
  );
}

function ChipPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  // text-current → spinner colour follows the chip's text color, so
  // it works across all 40+ badge variants (emerald/red/amber/...).
  return <InlineSpinner size={12} className="text-current" label="กำลังโหลด" />;
}
