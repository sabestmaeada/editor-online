import {
  NavSkeleton,
  PageHeaderSkeleton,
  Skeleton,
} from "@/components/skeleton";

export default function ProjectsLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-12">
        <div className="mx-auto w-full max-w-7xl">
        <PageHeaderSkeleton withButton />

        {/* Filter bar */}
        <div className="mt-6 grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 sm:grid-cols-[1fr_auto_auto_auto] dark:border-zinc-800 dark:bg-zinc-900/30">
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="flex items-end gap-2">
            <Skeleton className="h-9 w-20" />
          </div>
        </div>

        {/* Project cards grid */}
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li
              key={i}
              className="flex h-full gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <Skeleton className="h-16 w-12 rounded" />
              <div className="flex min-w-0 grow flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
                <Skeleton className="h-3 w-1/2" />
                <div className="mt-auto flex items-center justify-between pt-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
            </li>
          ))}
        </ul>
        </div>
      </main>
    </>
  );
}
