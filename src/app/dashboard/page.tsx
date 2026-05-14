import Link from "next/link";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await requireUserProfile("/dashboard");

  return (
    <main className="flex flex-1 flex-col px-8 py-12">
      <header className="flex items-center justify-between border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div className="flex items-center gap-4">
          <span
            className="inline-block size-10 rounded-full ring-2 ring-zinc-200 dark:ring-zinc-800"
            style={{ background: profile.trackColor }}
            aria-label={`Track color: ${profile.trackColor}`}
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {profile.displayName}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {profile.email} ·{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {profile.role}
              </span>
            </p>
          </div>
        </div>
        <LogoutButton />
      </header>

      <section className="mt-8 space-y-6">
        <Link
          href="/editor"
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
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Open Book Editor
        </Link>
      </section>
    </main>
  );
}
