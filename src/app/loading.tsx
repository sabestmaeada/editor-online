import { NavSkeleton, Skeleton } from "@/components/skeleton";

/**
 * Homepage loading state.
 *
 * The real page renders one of two layouts depending on auth status:
 *   - logged in: Nav + greeting + 2 CTA buttons
 *   - logged out: small header + hero + 1 CTA
 *
 * We can't know which one is coming during the loading render (auth check
 * is what's blocking), so we go with the logged-in layout because it's the
 * more common case for returning users. The brief flash to the other
 * layout for first-time visitors is acceptable.
 */
export default function HomeLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-3 h-3 w-96 max-w-full" />
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-10 w-40" />
        </div>
      </main>
    </>
  );
}
