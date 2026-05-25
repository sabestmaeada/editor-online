import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function OutlineEditorLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-10">
        <div className="mx-auto w-full max-w-5xl">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-2" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="mt-3 h-7 w-64" />
          <Skeleton className="mt-2 h-3 w-96" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-40" />
          </div>
        </header>

        {/* Outline tree — chapter list with nested nodes */}
        <div className="mt-8 space-y-3">
          {[0, 1, 2, 3, 4].map((c) => (
            <div
              key={c}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              {/* Chapter heading */}
              <div className="flex items-center gap-2">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-5 w-80" />
              </div>
              {/* Nested h2/h3 nodes */}
              <ul className="mt-3 space-y-2 pl-6">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Skeleton className="size-3 rounded" />
                    <Skeleton className="h-4 w-72" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        </div>
      </main>
    </>
  );
}
