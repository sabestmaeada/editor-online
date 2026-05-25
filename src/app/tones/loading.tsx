import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function TonesListLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-10">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-3 w-96" />
          <div className="mt-6">
            <Skeleton className="h-9 w-40" />
          </div>
        </header>
        <section className="mt-8">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li
                key={i}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="mt-2 h-3 w-full" />
                <Skeleton className="mt-1 h-3 w-2/3" />
                <div className="mt-3 flex gap-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="mt-3 h-3 w-24" />
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
