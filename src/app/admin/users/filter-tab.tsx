"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { InlineSpinner } from "@/components/inline-spinner";

/**
 * Status-filter tab for the admin user list (/admin/users).
 *
 * Same problem as the tone library's FilterPill (P2-S69): plain
 * `<Link>` query-only navigation doesn't trigger loading.tsx, so
 * the click feels dead until the server finishes listAllUsers().
 * `useLinkStatus` (Next.js 15.3+) gives us per-link pending state
 * which we surface with an inline spinner.
 *
 * Cosmetic shape kept identical to the old inline Tab component
 * (rounded-full pills with count badges + amber highlight) so the
 * page reads the same after the swap.
 */
type Props = {
  href: string;
  active: boolean;
  label: string;
  count: number;
  /** Used by the Pending tab to draw attention when count > 0. */
  highlight?: boolean;
};

export function FilterTab({ href, active, label, count, highlight }: Props) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : highlight
            ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700")
      }
    >
      <TabPending />
      {label}
      <span
        className={
          "rounded-full px-1.5 text-[10px] " +
          (active
            ? "bg-white/20"
            : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300")
        }
      >
        {count}
      </span>
    </Link>
  );
}

function TabPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  // text-current → spinner inherits the tab's foreground color,
  // works on all 3 variants (active dark / highlight amber / muted zinc).
  return <InlineSpinner size={12} className="text-current" label="กำลังโหลด" />;
}
