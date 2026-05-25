import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function TemplatesListLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-10">
        <div className="mx-auto w-full max-w-5xl">
          <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-3 h-7 w-48" />
            <Skeleton className="mt-2 h-3 w-96" />
            <div className="mt-6 flex gap-2">
              <Skeleton className="h-9 w-44" />
              <Skeleton className="h-9 w-56" />
            </div>
          </header>

          {/* Shared section */}
          <section className="mt-8">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="mt-1 h-3 w-72" />
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <li
                  key={i}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-start justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="mt-2 h-3 w-full" />
                  <Skeleton className="mt-1 h-3 w-5/6" />
                  <Skeleton className="mt-1 h-3 w-2/3" />
                  <div className="mt-3 flex justify-between">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Personal section */}
          <section className="mt-8">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="mt-1 h-3 w-72" />
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <li
                  key={i}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-2 h-3 w-full" />
                  <Skeleton className="mt-1 h-3 w-5/6" />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
