import Link from "next/link";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { listProjectsForUser } from "@/lib/firebase/list-my-projects";
import { Nav } from "@/components/nav";
import { formatRelative } from "@/lib/format";
import { formatProjectRole, type ProjectStatus } from "@/lib/types";

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

export default async function ProjectsPage() {
  const profile = await requireUserProfile("/projects");
  const projects = await listProjectsForUser(profile);

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-12">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              My Projects ({projects.length})
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

        {projects.length === 0 ? (
          <div className="mt-12 rounded-lg border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
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
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="group flex h-full flex-col rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="line-clamp-2 text-base font-semibold leading-snug group-hover:underline">
                      📘 {p.title}
                    </h2>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {p.customer} · {p.pages} pages
                  </p>
                  <div className="mt-auto pt-4 text-xs text-zinc-500">
                    <div className="flex items-center justify-between">
                      <span>
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
                            invited as{" "}
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">
                              {formatProjectRole(p.myRole)}
                            </span>
                          </span>
                        )}
                      </span>
                      <span>{formatRelative(p.updatedAt)}</span>
                    </div>
                    {p.fileCount > 0 && (
                      <div className="mt-1 text-zinc-400">
                        {p.fileCount} files · {formatBytes(p.totalSize)}
                      </div>
                    )}
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
