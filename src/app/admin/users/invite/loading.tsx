import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function AdminInviteLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-12">
        <div className="mx-auto w-full max-w-3xl">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3 w-14" />
          </div>
          <Skeleton className="mt-3 h-7 w-40" />
          <Skeleton className="mt-2 h-3 w-80" />
        </header>

        <section className="mt-6 max-w-xl">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-72" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-32" />
          </div>
        </section>

        <section className="mt-10">
          <Skeleton className="h-5 w-48" />
          <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1.5fr_1fr] gap-3 bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-16" />
              ))}
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1.5fr_1fr] items-center gap-3 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-16 rounded" />
                <div className="space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-7 w-24 justify-self-end" />
              </div>
            ))}
          </div>
        </section>
        </div>
      </main>
    </>
  );
}
