import Link from "next/link";
import type { UserProfile } from "@/lib/types";
import { LogoutButton } from "./logout-button";
import { NavLink } from "./nav-link";

type Props = {
  profile: UserProfile;
};

export function Nav({ profile }: Props) {
  const isAdmin = profile.role === "admin";

  return (
    <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex h-14 items-center gap-6 px-6">
        {/* Brand */}
        <Link
          href="/dashboard"
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

        {/* Main menu */}
        <div className="flex items-center gap-1">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/projects">Projects</NavLink>
          <NavLink href="/editor">Editor</NavLink>
        </div>

        {/* Admin menu */}
        {isAdmin && (
          <>
            <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
            <div className="flex items-center gap-1">
              <NavLink href="/admin">Admin</NavLink>
            </div>
          </>
        )}

        {/* User badge + logout */}
        <div className="ml-auto flex items-center gap-3">
          <div
            className="flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-sm dark:border-zinc-800"
            title={`${profile.email} · ${profile.role}`}
          >
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ background: profile.trackColor }}
              aria-label={`Track color: ${profile.trackColor}`}
            />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {profile.displayName}
            </span>
            <span className="text-xs uppercase tracking-wide text-zinc-500">
              {profile.role}
            </span>
          </div>
          <LogoutButton />
        </div>
      </div>
    </nav>
  );
}
