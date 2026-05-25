import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function AdminAuditLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-12">
        <div className="mx-auto w-full max-w-7xl">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-3 w-80" />
            </div>
            <Skeleton className="h-8 w-32" />
          </div>
        </header>

        {/* Filter form */}
        <div className="mt-6 grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 sm:grid-cols-[1fr_auto_auto_auto] dark:border-zinc-800 dark:bg-zinc-900/30">
          <div className="space-y-1">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-36" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-36" />
          </div>
          <div className="flex items-end">
            <Skeleton className="h-9 w-20" />
          </div>
        </div>

        {/* Filter chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>

        {/* Results count */}
        <Skeleton className="mt-6 h-3 w-32" />

        {/* Events table */}
        <section className="mt-2 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-6 gap-3 bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-6 gap-3 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <div className="space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-20 rounded" />
              <Skeleton className="h-3 w-14" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </section>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-7 w-28" />
        </div>
        </div>
      </main>
    </>
  );
}
