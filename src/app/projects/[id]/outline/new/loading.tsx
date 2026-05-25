import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function OutlineNewLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-10">
        <div className="mx-auto w-full max-w-3xl">
          <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="mt-3 h-7 w-80" />
            <Skeleton className="mt-2 h-3 w-96" />
          </header>

          {/* Outline form — title + chapter count + page count + 3 textareas + tone */}
          <div className="mt-8 max-w-3xl space-y-6">
            {/* Book title */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
            {/* Chapter count + page count (grid 2) */}
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
            {/* Tone dropdown */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
            {/* 3 big textareas — purpose, highlights, audience */}
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-72" />
                <Skeleton className="mt-2 h-32 w-full" />
              </div>
            ))}
            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-44" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
