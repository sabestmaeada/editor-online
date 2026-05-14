import Link from "next/link";
import { requireAdmin } from "@/lib/firebase/require-role";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const profile = await requireAdmin("/admin");

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-12">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <h1 className="text-2xl font-semibold tracking-tight">
            Admin Console
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            จัดการผู้ใช้และดู audit log
          </p>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/users"
            className="group rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <h2 className="text-base font-semibold group-hover:underline">
              👥 User Management
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              ดูรายชื่อ user ทั้งหมด, เปลี่ยน role, ดู login history
            </p>
          </Link>

          <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
            <h2 className="text-base font-semibold">📊 Global Audit Log</h2>
            <p className="mt-1 text-sm text-zinc-500">
              ดู events ทั้งระบบในที่เดียว (timeline)
            </p>
            <p className="mt-3 text-xs text-zinc-400">Coming soon</p>
          </div>
        </section>
      </main>
    </>
  );
}
