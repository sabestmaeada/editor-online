import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function JobStatusLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-10">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="mt-3 h-7 w-56" />
          <Skeleton className="mt-2 h-3 w-72" />
        </header>

        <div className="mt-8 space-y-6">
          {/* Status badge + progress bar */}
          <section>
            <div className="flex items-end justify-between">
              <div className="space-y-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-28" />
              </div>
            </div>
            <Skeleton className="mt-4 h-2 w-full rounded-full" />
          </section>

          {/* Chapter list */}
          <section>
            <Skeleton className="h-5 w-32" />
            <ul className="mt-3 space-y-2">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-6 rounded" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-72" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-20" />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
