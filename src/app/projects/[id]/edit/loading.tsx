import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function ProjectEditLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-12">
        <div className="mx-auto w-full max-w-3xl">
          {/* Breadcrumb */}
          <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="mt-3 h-7 w-48" />
            <Skeleton className="mt-2 h-3 w-72" />
          </header>

          <div className="space-y-8">
            {/* Cover uploader card */}
            <section className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <Skeleton className="h-4 w-24" />
              <div className="mt-3 flex items-center gap-4">
                <Skeleton className="h-32 w-24 rounded-md" />
                <div className="space-y-2">
                  <Skeleton className="h-9 w-36" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </section>

            {/* Edit form — 2-col grid then full-width textarea + buttons */}
            <section className="space-y-6">
              {/* Required: 2-col grid (title, customer, pages, language) */}
              <div className="grid gap-4 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>
              {/* Optional metadata: isbn, author, edition, status (2-col) */}
              <div className="grid gap-4 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>
              {/* Description textarea */}
              <div className="space-y-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-24 w-full" />
              </div>
              {/* Preface textarea (bigger) */}
              <div className="space-y-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-40 w-full" />
              </div>
              {/* Buttons */}
              <div className="flex items-center justify-end gap-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-32" />
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
