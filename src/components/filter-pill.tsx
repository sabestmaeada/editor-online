"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { InlineSpinner } from "@/components/inline-spinner";

/**
 * Shared admin filter pill — used by view-switcher rows that flip
 * between "own data" and "all users" via query params (?user=all,
 * ?view=all, etc).
 *
 * Background: plain `<Link>` won't trigger loading.tsx when only
 * the query string changes (Next.js App Router skips loading.tsx
 * on pure searchParams navigation). Without visible feedback the
 * admin can't tell the click registered until the server finishes
 * its round-trip — surfaced in P2-S67's post-mortem.
 *
 * `useLinkStatus` (Next.js 15.3+) gives a tiny client-side hook
 * that flips `pending=true` while the enclosing <Link> is mid-
 * navigation. We surface an InlineSpinner inside the pill so the
 * user sees the click landed.
 *
 * Lives in src/components/ (not co-located) because two unrelated
 * pages reuse it verbatim (P2-S69 /tones, P2-S72 /templates).
 * Sibling components for tab- and chip-shaped filters are kept
 * inside their respective page folders since they carry per-page
 * styling concerns (count badges, event-type colour codes).
 *
 * The hook MUST be read from a descendant of <Link> (not the
 * <Link> itself) — that's why the spinner lives in its own
 * `PillPending` sub-component.
 */
type Props = {
  href: string;
  active: boolean;
  children: React.ReactNode;
};

export function FilterPill({ href, active, children }: Props) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800")
      }
    >
      <PillPending />
      {children}
    </Link>
  );
}

function PillPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  // text-current → spinner inherits pill's text color, so it works
  // on both the dark "active" variant and the light inactive one.
  return <InlineSpinner size={12} className="text-current" label="กำลังโหลด" />;
}
