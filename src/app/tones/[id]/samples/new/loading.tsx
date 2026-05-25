import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function AddSampleLoading() {
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
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="mt-3 h-7 w-80" />
            <Skeleton className="mt-2 h-3 w-96" />
          </header>

          <div className="mt-8 space-y-5">
            {/* Mode toggle (paste/file) */}
            <div className="inline-flex gap-1 rounded-lg border border-zinc-300 p-1 dark:border-zinc-700">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-20" />
            </div>
            {/* Textarea / file input */}
            <Skeleton className="h-64 w-full" />
            {/* Submit + cancel */}
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-40" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
