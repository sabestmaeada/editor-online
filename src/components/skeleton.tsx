// Skeleton primitives — render gray placeholder blocks that "shimmer".
//
// Usage:
//   <Skeleton className="h-4 w-32" />
//   <Skeleton className="size-12 rounded-full" />
//
// The shimmer effect comes from the `shimmer` keyframe in globals.css.

export function Skeleton({
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={
        "skeleton-shimmer rounded-md bg-zinc-200/80 dark:bg-zinc-800/80 " +
        className
      }
      {...rest}
    />
  );
}

/**
 * Nav skeleton — matches the real `<Nav>` dimensions (h-14 px-6) so the
 * layout doesn't jump when the real Nav mounts.
 */
export function NavSkeleton() {
  return (
    <nav
      aria-label="Loading navigation"
      className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex h-14 items-center gap-6 px-6">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <Skeleton className="size-[18px] rounded" />
          <Skeleton className="h-4 w-24" />
        </div>

        {/* Main menu */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-12" />
        </div>

        {/* User badge + logout (right side) */}
        <div className="ml-auto flex items-center gap-3">
          <Skeleton className="h-7 w-44 rounded-full" />
          <Skeleton className="h-7 w-16" />
        </div>
      </div>
    </nav>
  );
}

/**
 * Page header skeleton — title + subtitle + bottom border, mirroring the
 * `<header className="border-b ... pb-6">` block used on every page.
 */
export function PageHeaderSkeleton({
  withButton = false,
  withBreadcrumb = false,
}: {
  withButton?: boolean;
  withBreadcrumb?: boolean;
}) {
  return (
    <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
      {withBreadcrumb && (
        <div className="mb-3 flex items-center gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-2" />
          <Skeleton className="h-3 w-24" />
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-3 w-72" />
        </div>
        {withButton && <Skeleton className="h-9 w-32" />}
      </div>
    </header>
  );
}
