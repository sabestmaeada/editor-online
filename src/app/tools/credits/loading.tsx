import { NavSkeleton, Skeleton } from "@/components/skeleton";

export default function CreditsToolLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col px-8 py-10">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-3 w-96" />
        </header>

        <div className="mt-8 max-w-4xl space-y-6">
          {/* Input fields grid */}
          <section className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </section>
          {/* Buttons */}
          <div className="flex gap-3">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
          </div>
          {/* Preview area */}
          <Skeleton className="h-96 w-full" />
        </div>
      </main>
    </>
  );
}
