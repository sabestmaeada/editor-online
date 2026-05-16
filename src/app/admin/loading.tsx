import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function AdminLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-12">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-3 w-80" />
        </header>

        {/* Pending callout slot — same dimensions as the real amber banner
            so the layout doesn't jump when it appears */}
        <div className="mt-6 h-[68px] rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex h-full items-center justify-between px-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>

        {/* 3 action cards (Users / Invite / Audit) */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
            >
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-1 h-3 w-2/3" />
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
