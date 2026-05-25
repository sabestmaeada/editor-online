import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function TemplateNewLoading() {
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
            <Skeleton className="mt-3 h-7 w-56" />
            <Skeleton className="mt-2 h-3 w-72" />
          </header>

          <div className="mt-8 space-y-6">
            {/* Label field */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-72" />
              <Skeleton className="mt-2 h-9 w-full" />
            </div>
            {/* Category select */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-9 w-full" />
            </div>
            {/* Scope select */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-9 w-full" />
            </div>
            {/* Snippet textarea (big) */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-96" />
              <Skeleton className="mt-2 h-64 w-full" />
            </div>
            {/* Submit area */}
            <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-36" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
