import { NavSkeleton, Skeleton } from "@/components/skeleton";

/**
 * Mirrors `CreditsForm` (see `credits-form.css`):
 *   - Dark header bar with title + subtitle
 *   - Type-selector bar with radio chips + action buttons
 *   - 2-pane grid (420px form panel | flex-1 preview panel)
 *
 * Skeleton uses tailwind to stay consistent with the rest of the
 * loading.tsx files, even though the real form is styled via the
 * dedicated credits-form.css (different CSS technology, same shape).
 */
export default function CreditsToolLoading() {
  return (
    <>
      <NavSkeleton />
      <main className="flex flex-1 flex-col">
        {/* Dark header bar (matches .credits-header) */}
        <header className="flex items-center justify-between gap-4 bg-zinc-900 px-5 py-3.5 text-white">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-56 bg-zinc-700" />
            <Skeleton className="h-3 w-80 bg-zinc-800" />
          </div>
        </header>

        {/* Type-selector bar (matches .credits-type-bar) */}
        <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-2.5 dark:border-zinc-800">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-24" />
          </div>
        </div>

        {/* 2-pane layout: form (420px) | preview (flex-1) */}
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[420px_1fr]">
          {/* Form panel */}
          <div className="space-y-5 border-r border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900">
            {/* 3 form sections */}
            {[0, 1, 2].map((sec) => (
              <section key={sec} className="space-y-2.5">
                <Skeleton className="h-3 w-32" />
                {[0, 1, 2].map((field) => (
                  <div key={field} className="space-y-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ))}
              </section>
            ))}
          </div>

          {/* Preview panel — paper-like surface in center */}
          <div className="flex items-start justify-center bg-zinc-100 p-8 dark:bg-zinc-950">
            <div className="w-full max-w-[120mm] space-y-3 rounded-sm bg-white p-8 shadow-sm dark:bg-zinc-900">
              <Skeleton className="mx-auto h-5 w-2/3" />
              <Skeleton className="mx-auto h-3 w-1/2" />
              <div className="pt-6" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <div className="pt-2" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <div className="pt-2" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
