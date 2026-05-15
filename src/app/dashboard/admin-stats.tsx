import Link from "next/link";
import type {
  AdminStats as AdminStatsData,
} from "@/lib/firebase/dashboard-queries";
import { formatRelative } from "@/lib/format";
import type { AuthEvent, AuthEventType } from "@/lib/types";

const EVENT_BADGE: Partial<Record<AuthEventType, string>> = {
  login:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  logout: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "failed-login":
    "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  "role-change":
    "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  "project-create":
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  "project-delete":
    "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  "project-member-invite":
    "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
};

function badgeClassFor(eventType: AuthEventType): string {
  return (
    EVENT_BADGE[eventType] ??
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
  );
}

export function AdminStats({
  stats,
  recentEvents,
}: {
  stats: AdminStatsData;
  recentEvents: AuthEvent[];
}) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          System overview <span className="text-xs font-normal text-zinc-500">(admin)</span>
        </h2>
        <Link
          href="/admin/audit"
          className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
        >
          Audit log →
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/admin/users"
          className="group rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
        >
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Users
          </div>
          <div className="mt-1 text-2xl font-semibold group-hover:underline">
            {stats.totalUsers}
          </div>
        </Link>

        <Link
          href="/projects"
          className="group rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
        >
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Projects
          </div>
          <div className="mt-1 text-2xl font-semibold group-hover:underline">
            {stats.totalProjects}
          </div>
        </Link>

        <Link
          href="/admin/audit"
          className="group rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
        >
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Events today
          </div>
          <div className="mt-1 text-2xl font-semibold group-hover:underline">
            {stats.eventsToday}
          </div>
        </Link>
      </div>

      {/* Recent events */}
      {recentEvents.length > 0 && (
        <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="border-b border-zinc-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            Recent events
          </div>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {recentEvents.map((e, idx) => (
              <li
                key={`${e.timestamp.toMillis()}-${idx}`}
                className="flex items-center gap-3 px-4 py-2 text-xs"
              >
                <span
                  className={`shrink-0 rounded px-2 py-0.5 font-medium ${badgeClassFor(e.eventType)}`}
                >
                  {e.eventType}
                </span>
                <span className="truncate text-zinc-700 dark:text-zinc-300">
                  {e.email}
                  {e.projectTitle && (
                    <span className="text-zinc-500">
                      {" "}
                      · {e.projectTitle}
                    </span>
                  )}
                </span>
                <span className="ml-auto shrink-0 text-zinc-500">
                  {formatRelative(e.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
