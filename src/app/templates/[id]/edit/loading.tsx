import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function TemplateEditLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-10">
        <div className="mx-auto w-full max-w-3xl">
          <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="mt-3 h-7 w-44" />
            <Skeleton className="mt-2 h-3 w-72" />
          </header>

          <div className="mt-8 space-y-6">
            {/* Label */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
            {/* Category */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
            {/* Scope */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-full" />
            </div>
            {/* Snippet */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-64 w-full" />
            </div>
            {/* Archive checkbox */}
            <div className="flex items-center gap-2">
              <Skeleton className="size-4" />
              <Skeleton className="h-3 w-40" />
            </div>
            {/* Buttons */}
            <div className="flex items-center justify-between border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <Skeleton className="h-9 w-24" />
              <div className="flex gap-3">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
