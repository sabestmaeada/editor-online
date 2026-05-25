import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function ProjectDetailLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-12">
        <div className="mx-auto w-full max-w-5xl">
        {/* Breadcrumb */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-2" />
          <Skeleton className="h-3 w-40" />
        </div>

        {/* Header */}
        <header className="mt-2 flex flex-wrap items-start gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <Skeleton className="size-24 rounded-md sm:size-32" />
          <div className="grow space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-72" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-32" />
          </div>
        </header>

        {/* Metadata grid */}
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-4 w-32" />
            </div>
          ))}
        </section>

        {/* Members */}
        <section className="mt-10">
          <Skeleton className="h-6 w-32" />
          <div className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="grow space-y-1">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-52" />
                </div>
                <Skeleton className="h-7 w-24" />
              </div>
            ))}
          </div>
        </section>

        {/* Files */}
        <section className="mt-10">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-2 h-3 w-72" />
          <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
              <Skeleton className="h-3 w-16" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between border-t border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </section>
        </div>
      </main>
    </>
  );
}
