import Link from "next/link";
import { formatRelative } from "@/lib/format";
import {
  formatProjectRole,
  type ProjectStatus,
  type ProjectWithMembership,
} from "@/lib/types";

const STATUS_BADGE: Record<ProjectStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "in-progress":
    "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  review:
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  completed:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  archived:
    "bg-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-500",
};

export function RecentProjects({
  projects,
}: {
  projects: ProjectWithMembership[];
}) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          Recent projects
        </h2>
        <Link
          href="/projects"
          className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
        >
          View all →
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          ยังไม่มี project
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="group flex h-full gap-3 rounded-lg border border-zinc-200 p-3 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <div className="h-16 w-12 flex-shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
                  {p.coverKey ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/projects/${p.id}/cover?v=${p.coverUpdatedAt?.toMillis() ?? 0}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src="/cover-placeholder.svg"
                      alt=""
                      className="h-full w-full object-cover opacity-60"
                    />
                  )}
                </div>

                <div className="flex min-w-0 grow flex-col">
                  <div className="flex items-start gap-2">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
                      {p.title}
                    </h3>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {p.customer}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[p.status]}`}
                    >
                      {p.status}
                    </span>
                    <span className="truncate text-zinc-500">
                      {p.myRole === "project_owner"
                        ? "Owner"
                        : p.myRole === null
                          ? "Admin"
                          : formatProjectRole(p.myRole)}
                      {" · "}
                      {formatRelative(p.updatedAt)}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
