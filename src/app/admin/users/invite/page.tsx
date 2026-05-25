import Link from "next/link";
import { requireAdmin } from "@/lib/firebase/require-role";
import { listInvites } from "@/lib/firebase/invites";
import { Nav } from "@/components/nav";
import { formatTimestamp, formatRelative } from "@/lib/format";
import type { Invite, InviteStatus } from "@/lib/types";
import { InviteForm, InviteRowActions } from "./invite-controls";

export const dynamic = "force-dynamic";

const INVITE_BADGE: Record<InviteStatus, string> = {
  active:
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  used:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  expired:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  revoked:
    "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export default async function AdminInvitePage() {
  const caller = await requireAdmin("/admin/users/invite");
  const invites = await listInvites({ limit: 50 });

  return (
    <>
      <Nav profile={caller} />
      <main className="flex flex-1 flex-col px-8 py-12">
        <div className="mx-auto w-full max-w-3xl">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <Link
              href="/admin"
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Admin
            </Link>
            <span aria-hidden>/</span>
            <Link
              href="/admin/users"
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Users
            </Link>
            <span aria-hidden>/</span>
            <span className="text-zinc-900 dark:text-zinc-100">Invite</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Invite user
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            ส่งลิงก์เชิญให้ user ใหม่ — admin ต้องอนุมัติอีกครั้งหลังลงทะเบียน
          </p>
        </header>

        <section className="mt-6 max-w-xl">
          <h2 className="text-base font-semibold">สร้าง invite ใหม่</h2>
          <p className="mt-1 text-xs text-zinc-500">
            ใส่ email ของ user ที่ต้องการเชิญ — ระบบจะสร้างลิงก์ให้ copy ส่งเอง (เช่น ทาง LINE/email)
          </p>
          <div className="mt-3">
            <InviteForm />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-base font-semibold">
            Invite ที่สร้างไว้ ({invites.length})
          </h2>
          {invites.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
              ยังไม่มี invite
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-left uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Email</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">สร้างเมื่อ</th>
                    <th className="px-3 py-2.5 font-medium">หมดอายุ</th>
                    <th className="px-3 py-2.5 font-medium">โดย</th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {invites.map((inv) => (
                    <InviteRow key={inv.token} invite={inv} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>
      </main>
    </>
  );
}

function InviteRow({ invite }: { invite: Invite }) {
  return (
    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
      <td className="px-3 py-2 align-top font-medium text-zinc-900 dark:text-zinc-100">
        {invite.email}
      </td>
      <td className="px-3 py-2 align-top">
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${INVITE_BADGE[invite.status]}`}
        >
          {invite.status}
        </span>
      </td>
      <td className="px-3 py-2 align-top text-zinc-600 dark:text-zinc-400">
        <div>{formatTimestamp(invite.createdAt)}</div>
        <div className="text-zinc-400">{formatRelative(invite.createdAt)}</div>
      </td>
      <td className="px-3 py-2 align-top text-zinc-600 dark:text-zinc-400">
        {formatRelative(invite.expiresAt)}
      </td>
      <td className="px-3 py-2 align-top text-zinc-600 dark:text-zinc-400">
        {invite.createdByEmail}
      </td>
      <td className="px-3 py-2 align-top text-right">
        <InviteRowActions
          token={invite.token}
          status={invite.status}
          email={invite.email}
        />
      </td>
    </tr>
  );
}
