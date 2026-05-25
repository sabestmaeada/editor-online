import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function ToneDetailLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-10">
        <div className="mx-auto w-full max-w-5xl">
          <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-40" />
            </div>
          </header>

          <div className="mt-8 grid gap-8 lg:grid-cols-3">
            {/* Left: metadata + style profile (2 columns) */}
            <section className="space-y-6 lg:col-span-2">
              {/* Metadata card */}
              <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <Skeleton className="h-5 w-28" />
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="mt-2 h-3 w-20" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>

              {/* Style profile card */}
              <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <Skeleton className="h-5 w-40" />
                <div className="mt-3 grid grid-cols-2 gap-4">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div key={i}>
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="mt-1 h-3 w-3/4" />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Right: sample list */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-8 w-24" />
              </div>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="mt-1 h-3 w-5/6" />
                  <div className="mt-2 flex gap-2">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
