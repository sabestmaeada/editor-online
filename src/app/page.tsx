import Link from "next/link";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await getCurrentUserProfile();

  // ─── Logged in ─────────────────────────────────────────────
  if (profile) {
    return (
      <>
        <Nav profile={profile} />
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            สวัสดี {profile.displayName} 👋
          </h1>
          <p className="mt-3 max-w-md text-sm text-zinc-500">
            พร้อมแก้ไขหนังสือของคุณแล้ว — เปิด editor หรือไปที่ dashboard ได้เลย
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/editor"
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Open Book Editor
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              Go to Dashboard
            </Link>
          </div>
        </main>
      </>
    );
  }

  // ─── Logged out ────────────────────────────────────────────
  return (
    <>
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-14 items-center px-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>Book Editor</span>
          </Link>
          <div className="ml-auto">
            <Link
              href="/login"
              className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Online Book Editor
        </h1>
        <p className="mt-4 max-w-lg text-base text-zinc-600 dark:text-zinc-400">
          WYSIWYG editor สำหรับหนังสือ HTML — รองรับ track changes ต่อ user, image embed, sidebar TOC
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Sign in to get started
          </Link>
        </div>
      </main>
    </>
  );
}
