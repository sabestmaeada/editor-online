import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function NewProjectLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-12">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="mt-3 h-7 w-48" />
          <Skeleton className="mt-2 h-3 w-80" />
        </header>

        <div className="max-w-2xl">
          {/* Required fields — 2-col grid */}
          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </section>

          {/* Optional metadata — 2-col grid */}
          <section className="mt-4 grid gap-4 sm:grid-cols-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </section>

          {/* Description textarea */}
          <div className="mt-4 space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-20 w-full" />
          </div>

          {/* ZIP file picker */}
          <div className="mt-4 space-y-1.5">
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-3 w-72" />
            <Skeleton className="h-9 w-full" />
          </div>

          {/* Submit */}
          <div className="mt-6 flex justify-end">
            <Skeleton className="h-9 w-40" />
          </div>
        </div>
      </main>
    </>
  );
}
