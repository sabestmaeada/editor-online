import Link from "next/link";
import { requireAdmin } from "@/lib/firebase/require-role";
import { listAllUsers } from "@/lib/firebase/admin-users";
import { Nav } from "@/components/nav";
import { formatRelative } from "@/lib/format";
import { RoleSelector } from "./role-selector";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const caller = await requireAdmin("/admin/users");
  const users = await listAllUsers();

  return (
    <>
      <Nav profile={caller} />
      <main className="flex flex-1 flex-col px-8 py-12">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <Link href="/admin" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Admin
            </Link>
            <span aria-hidden>/</span>
            <span className="text-zinc-900 dark:text-zinc-100">Users</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Users ({users.length})
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            จัดการ role ของ user แต่ละคน — คลิกชื่อเพื่อดู login history
          </p>
        </header>

        <section className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Last login</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {users.map((u) => {
                const isSelf = u.uid === caller.uid;
                return (
                  <tr key={u.uid} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
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
                            <span className="ml-2 text-xs text-zinc-500">(you)</span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {u.email}
                    </td>
                    <td className="px-4 py-3">
                      <RoleSelector
                        uid={u.uid}
                        currentRole={u.role}
                        displayName={u.displayName}
                        isSelf={isSelf}
                      />
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
      </main>
    </>
  );
}
