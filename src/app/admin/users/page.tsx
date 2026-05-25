import Link from "next/link";
import { requireAdmin } from "@/lib/firebase/require-role";
import { listAllUsers } from "@/lib/firebase/admin-users";
import { Nav } from "@/components/nav";
import { formatRelative } from "@/lib/format";
import { USER_STATUSES, type UserProfile, type UserStatus } from "@/lib/types";
import { RoleSelector } from "./role-selector";
import { PendingActions, RejectedActions } from "./status-actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function parseStatusFilter(sp: SearchParams): UserStatus | "all" {
  const v = sp.status;
  const s = typeof v === "string" ? v : "";
  if (s === "all" || s === "") return "all";
  if ((USER_STATUSES as readonly string[]).includes(s)) {
    return s as UserStatus;
  }
  return "all";
}

const STATUS_BADGE: Record<UserStatus, string> = {
  active:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  pending:
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  rejected:
    "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  disabled:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const caller = await requireAdmin("/admin/users");
  const sp = await searchParams;
  const filter = parseStatusFilter(sp);

  // Always load all users — tab counts need to reflect totals regardless of
  // the active filter. The list itself is small (admin tool) so no pagination.
  const allUsers = await listAllUsers();
  const counts = countByStatus(allUsers);
  const users =
    filter === "all" ? allUsers : allUsers.filter((u) => u.status === filter);

  return (
    <>
      <Nav profile={caller} />
      <main className="flex flex-1 flex-col px-8 py-12">
        <div className="mx-auto w-full max-w-7xl">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <Link
              href="/admin"
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Admin
            </Link>
            <span aria-hidden>/</span>
            <span className="text-zinc-900 dark:text-zinc-100">Users</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Users ({allUsers.length})
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                จัดการ role + อนุมัติ user ใหม่ — คลิกชื่อเพื่อดู login history
              </p>
            </div>
            <Link
              href="/admin/users/invite"
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Invite user
            </Link>
          </div>
        </header>

        {/* Tabs */}
        <nav
          aria-label="Filter by status"
          className="mt-6 flex flex-wrap items-center gap-2"
        >
          <Tab
            href="/admin/users"
            active={filter === "all"}
            label="All"
            count={allUsers.length}
          />
          <Tab
            href="/admin/users?status=active"
            active={filter === "active"}
            label="Active"
            count={counts.active}
          />
          <Tab
            href="/admin/users?status=pending"
            active={filter === "pending"}
            label="Pending"
            count={counts.pending}
            highlight={counts.pending > 0}
          />
          <Tab
            href="/admin/users?status=rejected"
            active={filter === "rejected"}
            label="Rejected"
            count={counts.rejected}
          />
          {counts.disabled > 0 && (
            <Tab
              href="/admin/users?status=disabled"
              active={filter === "disabled"}
              label="Disabled"
              count={counts.disabled}
            />
          )}
        </nav>

        {users.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
            <p className="text-sm text-zinc-500">
              ไม่มี user ในสถานะนี้
            </p>
          </div>
        ) : (
          <section className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Role / Actions</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {users.map((u) => {
                  const isSelf = u.uid === caller.uid;
                  return (
                    <tr
                      key={u.uid}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/users/${u.uid}`}
                          className="flex items-center gap-3 hover:underline"
                        >
                          <span
                            className="inline-block size-3 shrink-0 rounded-full"
                            style={{ background: u.trackColor }}
                            aria-hidden
                          />
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {u.displayName}
                            {isSelf && (
                              <span className="ml-2 text-xs text-zinc-500">
                                (you)
                              </span>
                            )}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {u.email}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[u.status]}`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.status === "active" && (
                          <RoleSelector
                            uid={u.uid}
                            currentRole={u.role}
                            displayName={u.displayName}
                            isSelf={isSelf}
                          />
                        )}
                        {u.status === "pending" && (
                          <PendingActions
                            uid={u.uid}
                            email={u.email}
                            displayName={u.displayName}
                          />
                        )}
                        {u.status === "rejected" && (
                          <RejectedActions
                            uid={u.uid}
                            email={u.email}
                            displayName={u.displayName}
                          />
                        )}
                        {u.status === "disabled" && (
                          <span className="text-xs text-zinc-500">
                            (disabled)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {formatRelative(u.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {formatRelative(u.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
        </div>
      </main>
    </>
  );
}

function countByStatus(users: UserProfile[]): Record<UserStatus, number> {
  const out: Record<UserStatus, number> = {
    active: 0,
    pending: 0,
    rejected: 0,
    disabled: 0,
  };
  for (const u of users) {
    out[u.status] = (out[u.status] ?? 0) + 1;
  }
  return out;
}

function Tab({
  href,
  active,
  label,
  count,
  highlight,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : highlight
            ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700")
      }
    >
      {label}
      <span
        className={
          "rounded-full px-1.5 text-[10px] " +
          (active
            ? "bg-white/20"
            : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300")
        }
      >
        {count}
      </span>
    </Link>
  );
}
