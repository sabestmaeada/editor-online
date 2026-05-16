import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function AdminUserDetailLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-12">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3 w-24" />
          </div>

          <div className="mt-4 flex items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-8 w-32" />
          </div>
        </header>

        {/* Admin actions (reset-link button row) */}
        <section className="mt-4 flex flex-wrap items-start gap-3">
          <Skeleton className="h-8 w-36" />
        </section>

        {/* Profile facts — 5 cards now (UID / Role / Status / Joined / Last login) */}
        <section className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-4 w-32" />
            </div>
          ))}
        </section>

        {/* Login history table */}
        <section className="mt-10">
          <Skeleton className="h-6 w-40" />
          <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="grid grid-cols-6 gap-3 bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-3 w-16" />
              ))}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-6 gap-3 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <div className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-3 w-14" />
                <div className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
