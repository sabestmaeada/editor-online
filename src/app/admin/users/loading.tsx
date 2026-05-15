import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function AdminUsersLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-12">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3 w-14" />
          </div>
          <Skeleton className="mt-3 h-7 w-40" />
          <Skeleton className="mt-2 h-3 w-80" />
        </header>

        {/* Users table */}
        <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          {/* Table head */}
          <div className="grid grid-cols-[1.5fr_2fr_1fr_1fr_1fr] gap-4 bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
            {["User", "Email", "Role", "Last login", "Joined"].map((label) => (
              <Skeleton key={label} className="h-3 w-20" />
            ))}
          </div>
          {/* Table rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[1.5fr_2fr_1fr_1fr_1fr] items-center gap-4 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-3 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
