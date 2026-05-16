import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function DashboardLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-12">
        {/* Section 1: Header */}
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="grow space-y-2">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-3 w-80" />
            </div>
          </div>
          {/* Quick actions */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-28" />
          </div>
        </header>

        {/* Section 2: Recent projects (3 cards) */}
        <section className="mt-10">
          <Skeleton className="h-5 w-40" />
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="flex h-full gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <Skeleton className="h-16 w-12 rounded" />
                <div className="flex min-w-0 grow flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="mt-auto">
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Section 3: Workload overview (5 status pills) */}
        <section className="mt-10">
          <Skeleton className="h-5 w-44" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-7 w-10" />
              </div>
            ))}
          </div>
        </section>

        {/* Section 5: Personal settings */}
        <section className="mt-10 space-y-4">
          <Skeleton className="h-5 w-40" />
          {/* Display name editor */}
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <Skeleton className="h-3 w-24" />
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
          {/* Color + Account info 2-col */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-56" />
            </div>
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-3/4" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
