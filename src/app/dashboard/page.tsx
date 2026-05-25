import Link from "next/link";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { listProjectsForUser } from "@/lib/firebase/list-my-projects";
import {
  countByStatus,
  getAdminStats,
  getRecentAdminEvents,
} from "@/lib/firebase/dashboard-queries";
import { Nav } from "@/components/nav";
import { formatTimestamp, formatRelative } from "@/lib/format";
import { RecentProjects } from "./recent-projects";
import { WorkloadOverview } from "./workload-overview";
import { AdminStats } from "./admin-stats";
import { PersonalSettings } from "./personal-settings";

export const dynamic = "force-dynamic";

const canCreate = (role: string) => role === "admin" || role === "editor";

export default async function DashboardPage() {
  const profile = await requireUserProfile("/dashboard");
  const isAdmin = profile.role === "admin";

  // Fetch in parallel
  const [projects, adminStats, recentEvents] = await Promise.all([
    listProjectsForUser(profile),
    isAdmin ? getAdminStats() : Promise.resolve(null),
    isAdmin ? getRecentAdminEvents(5) : Promise.resolve([]),
  ]);

  const recent3 = projects.slice(0, 3);
  const statusCounts = countByStatus(projects);

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-12">
        <div className="mx-auto w-full max-w-5xl">
        {/* Section 1: Header + Quick Actions */}
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-4">
            <span
              className="inline-block size-12 shrink-0 rounded-full ring-2 ring-zinc-200 dark:ring-zinc-800"
              style={{ background: profile.trackColor }}
              aria-label={`Track color: ${profile.trackColor}`}
            />
            <div className="grow">
              <h1 className="text-2xl font-semibold tracking-tight">
                สวัสดี {profile.displayName} 👋
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {profile.email} · role:{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {profile.role}
                </span>
                {profile.lastLoginAt && (
                  <>
                    {" "}
                    · last login {formatRelative(profile.lastLoginAt)}
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
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
            <Link
              href="/editor"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Open editor
            </Link>
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              All projects
            </Link>
          </div>
        </header>

        {/* Section 2: Recent projects */}
        <RecentProjects projects={recent3} />

        {/* Section 3: Workload overview */}
        <WorkloadOverview counts={statusCounts} />

        {/* Section 4: Admin stats (admin only) */}
        {isAdmin && adminStats && (
          <AdminStats stats={adminStats} recentEvents={recentEvents} />
        )}

        {/* Section 5: Personal settings */}
        <PersonalSettings
          initialDisplayName={profile.displayName}
          initialColor={profile.trackColor}
          email={profile.email}
          uid={profile.uid}
          role={profile.role}
          createdAtFormatted={formatTimestamp(profile.createdAt)}
          lastLoginAtFormatted={formatTimestamp(profile.lastLoginAt)}
          lastLoginIp={profile.lastLoginIp}
        />
        </div>
      </main>
    </>
  );
}
