import Link from "next/link";
import { requireAdmin } from "@/lib/firebase/require-role";
import { countPendingUsers } from "@/lib/firebase/admin-users";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const profile = await requireAdmin("/admin");
  const pendingCount = await countPendingUsers();

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-12">
        <div className="mx-auto w-full max-w-7xl">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <h1 className="text-2xl font-semibold tracking-tight">
            Admin Console
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            จัดการผู้ใช้, เชิญผู้ใช้ใหม่ และดู audit log
          </p>
        </header>

        {pendingCount > 0 && (
          <Link
            href="/admin/users?status=pending"
            className="mt-6 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-4 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:hover:bg-amber-900/60"
          >
            <div>
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                🆕 รออนุมัติ {pendingCount} user
              </div>
              <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                user ที่ลงทะเบียนผ่าน invite และรอ admin อนุมัติ
              </div>
            </div>
            <span className="text-sm text-amber-700 dark:text-amber-400">
              ดูทั้งหมด →
            </span>
          </Link>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/users"
            className="group rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <h2 className="text-base font-semibold group-hover:underline">
              👥 User Management
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              ดูรายชื่อ user, อนุมัติ user ใหม่, เปลี่ยน role
            </p>
          </Link>

          <Link
            href="/admin/users/invite"
            className="group rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <h2 className="text-base font-semibold group-hover:underline">
              ✉️ Invite user
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              สร้างลิงก์เชิญ user ใหม่ — admin ต้องอนุมัติหลังลงทะเบียน
            </p>
          </Link>

          <Link
            href="/admin/audit"
            className="group rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <h2 className="text-base font-semibold group-hover:underline">
              📊 Global Audit Log
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Timeline ของ events ทั้งระบบ (กรองตาม event type ได้)
            </p>
          </Link>
        </section>
        </div>
      </main>
    </>
  );
}
