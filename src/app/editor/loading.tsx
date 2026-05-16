import { Skeleton } from "@/components/skeleton";

/**
 * Editor loading state.
 *
 * The editor page itself just renders an <iframe> pointing at
 * /book-editor/editor.html — once the auth check finishes, the iframe
 * mounts and the legacy book editor takes over inside it.
 *
 * Skeleton mimics the editor's chrome (top toolbar + main canvas area)
 * so it doesn't feel like the screen went blank during the auth fetch.
 */
export default function EditorLoading() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Top toolbar */}
      <div className="flex h-14 items-center gap-3 border-b border-zinc-200 px-4 dark:border-zinc-800">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-4 w-32" />
        <div className="ml-4 flex items-center gap-2">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-16" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-7 w-7 rounded-full" />
        </div>
      </div>

      {/* Editor canvas placeholder */}
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-2xl space-y-4 px-8">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <div className="pt-4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    </main>
  );
}
