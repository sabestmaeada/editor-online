import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function ToneNewLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-10">
        <div className="mx-auto w-full max-w-3xl">
          <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="mt-3 h-7 w-44" />
            <Skeleton className="mt-2 h-3 w-72" />
          </header>

          <div className="mt-8 max-w-2xl space-y-5">
            {/* name field */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
            {/* description textarea */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-24 w-full" />
            </div>
            {/* buttons */}
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
