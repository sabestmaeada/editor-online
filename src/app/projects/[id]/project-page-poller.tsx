"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 10_000;

/**
 * Invisible client wrapper that triggers `router.refresh()` on a
 * timer while the project has work in flight (outline generating
 * OR any content job in pending/generating).
 *
 * - Server component figures out `active` from its data fetches.
 * - We only poll when something might actually be changing — idle
 *   projects don't waste a request every 10s.
 * - `router.refresh()` re-runs the page's server component without
 *   blowing away client state (selection, scroll position, etc.),
 *   so the token card + counters update in place.
 *
 * Mirrors the polling pattern in `OutlineGeneratingWait` and the
 * content job status view — same heartbeat, same teardown.
 */
export function ProjectPagePoller({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const handle = window.setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [active, router]);

  return null;
}
