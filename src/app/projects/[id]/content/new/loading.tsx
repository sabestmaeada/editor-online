import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function ContentNewLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-10">
        <div className="mx-auto w-full max-w-3xl">
          <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="mt-3 h-7 w-96" />
            <Skeleton className="mt-2 h-3 w-72" />
          </header>

          <div className="mt-8 max-w-3xl space-y-6">
            {/* Tone section */}
            <section>
              <Skeleton className="h-4 w-40" />
              <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-1 h-3 w-64" />
              </div>
            </section>
            {/* Defaults collapsible */}
            <section>
              <Skeleton className="h-4 w-44" />
              <Skeleton className="mt-1 h-3 w-72" />
            </section>
            {/* Custom instructions textarea */}
            <section>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-1 h-3 w-72" />
              <Skeleton className="mt-2 h-64 w-full" />
              {/* Chips area */}
              <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-56" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <div className="mt-3 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex flex-wrap gap-1.5">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-6 w-24 rounded-full" />
                      <Skeleton className="h-6 w-28 rounded-full" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            </section>
            {/* generateImages checkbox */}
            <section className="flex items-start gap-3">
              <Skeleton className="size-4" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-full" />
              </div>
            </section>
            {/* Estimate card */}
            <section className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="my-1 h-3 w-24" />
                  <Skeleton className="my-1 h-3 w-32" />
                </div>
              ))}
            </section>
            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-40" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
