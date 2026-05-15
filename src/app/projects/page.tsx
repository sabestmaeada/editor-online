import Link from "next/link";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { listProjectsForUser } from "@/lib/firebase/list-my-projects";
import { Nav } from "@/components/nav";
import { formatRelative } from "@/lib/format";
import {
  PROJECT_STATUSES,
  formatProjectRole,
  type ProjectMemberRole,
  type ProjectStatus,
  type ProjectWithMembership,
} from "@/lib/types";
import {
  ProjectsFilter,
  type ProjectsFilterValues,
} from "./projects-filter";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<ProjectStatus, string> = {
  draft:
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "in-progress":
    "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  review:
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  completed:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  archived:
    "bg-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-500",
};

const canCreate = (role: string) => role === "admin" || role === "editor";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

type SearchParams = Record<string, string | string[] | undefined>;

function parseFilters(sp: SearchParams): ProjectsFilterValues {
  const getStr = (k: string): string => {
    const v = sp[k];
    return typeof v === "string" ? v.trim() : "";
  };

  const statusRaw = getStr("status");
  const status = (PROJECT_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as ProjectStatus)
    : "";

  const roleRaw = getStr("role");
  const validRoles: (ProjectMemberRole | "admin")[] = [
    "project_owner",
    "project_editor",
    "project_proofreader",
    "project_viewer",
    "admin",
  ];
  const role = (validRoles as string[]).includes(roleRaw)
    ? (roleRaw as ProjectMemberRole | "admin")
    : "";

  return { q: getStr("q"), status, role };
}

function applyFilters(
  projects: ProjectWithMembership[],
  filters: ProjectsFilterValues,
): ProjectWithMembership[] {
  const needle = filters.q.toLowerCase();
  return projects.filter((p) => {
    if (needle) {
      const hay = `${p.title} ${p.customer}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (filters.status && p.status !== filters.status) return false;
    if (filters.role) {
      if (filters.role === "admin") {
        if (p.myRole !== null) return false;
      } else {
        if (p.myRole !== filters.role) return false;
      }
    }
    return true;
  });
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireUserProfile("/projects");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const all = await listProjectsForUser(profile);
  const projects = applyFilters(all, filters);
  const hasFilters =
    filters.q.length > 0 || filters.status !== "" || filters.role !== "";

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-12">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              My Projects{" "}
              {hasFilters ? (
                <span className="text-zinc-500">
                  ({projects.length} / {all.length})
                </span>
              ) : (
                <span className="text-zinc-500">({all.length})</span>
              )}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              โปรเจกต์ที่คุณเป็นเจ้าของ + ถูกเชิญเข้าร่วม
            </p>
          </div>
          {canCreate(profile.role) && (
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New project
            </Link>
          )}
        </header>

        {/* Filter — only show when there are projects to filter through */}
        {all.length > 0 && (
          <div className="mt-6">
            <ProjectsFilter
              values={filters}
              isAdmin={profile.role === "admin"}
            />
          </div>
        )}

        {projects.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
            {hasFilters ? (
              <>
                <p className="text-sm text-zinc-500">
                  ไม่พบ project ที่ตรงเงื่อนไข
                </p>
                <Link
                  href="/projects"
                  className="mt-3 inline-block text-sm text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                >
                  Clear filters
                </Link>
              </>
            ) : (
              <p className="text-sm text-zinc-500">
                ยังไม่มี project
                {canCreate(profile.role) && (
                  <>
                    {" "}
                    —{" "}
                    <Link
                      href="/projects/new"
                      className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      สร้างใหม่
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="group flex h-full gap-3 rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                >
                  {/* Cover thumbnail — small, on the left */}
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
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
                        {p.title}
                      </h2>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[p.status]}`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {p.customer} · {p.pages} pages
                    </p>
                    <div className="mt-auto pt-2 text-xs text-zinc-500">
                      <div className="flex items-center justify-between">
                        <span className="truncate">
                          {p.myRole === "project_owner" ? (
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">
                              Owner
                            </span>
                          ) : p.myRole === null ? (
                            <span className="font-medium text-purple-700 dark:text-purple-300">
                              Admin access
                            </span>
                          ) : (
                            <span>
                              {formatProjectRole(p.myRole)}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0">
                          {formatRelative(p.updatedAt)}
                        </span>
                      </div>
                      {p.fileCount > 0 && (
                        <div className="mt-0.5 text-zinc-400">
                          {p.fileCount} files · {formatBytes(p.totalSize)}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
