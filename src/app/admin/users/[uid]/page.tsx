import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/firebase/require-role";
import { getUserProfile } from "@/lib/firebase/users";
import { listAuthEventsForUser } from "@/lib/firebase/admin-events";
import { Nav } from "@/components/nav";
import { formatTimestamp, formatRelative } from "@/lib/format";
import { RoleSelector } from "../role-selector";
import { ResetLinkButton } from "./reset-link-button";
import type { AuthEventType } from "@/lib/types";

export const dynamic = "force-dynamic";

const EVENT_BADGE: Record<AuthEventType, string> = {
  login:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  logout: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "failed-login":
    "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  "password-reset":
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400", // legacy
  "password-self-change":
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "password-reset-link-issued":
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "password-reset-link-used":
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "email-change":
    "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  "role-change":
    "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  "user-invite":
    "bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  "user-invite-revoke":
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  "user-register":
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "user-approve":
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "user-reject":
    "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  "user-delete":
    "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  "project-create":
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  "project-metadata-update":
    "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "project-delete":
    "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  "project-download":
    "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  "project-files-replace":
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "project-member-invite":
    "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "project-member-remove":
    "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  "project-member-role-change":
    "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  // Outline / content generation
  "outline-generate-start":
    "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "outline-generate-success":
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "outline-generate-failed":
    "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  "outline-edit":
    "bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  "outline-finalize":
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  "content-generate-start":
    "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "content-generate-success":
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "content-generate-failed":
    "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  // Tone library
  "tone-create":
    "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  "tone-edit":
    "bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  "tone-archive":
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "tone-delete":
    "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  "tone-transfer-ownership":
    "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  "tone-sample-add":
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "tone-sample-delete":
    "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const caller = await requireAdmin("/admin/users");
  const { uid } = await params;

  const target = await getUserProfile(uid);
  if (!target) notFound();

  const events = await listAuthEventsForUser(uid, 200);
  const isSelf = uid === caller.uid;

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
            <Link
              href="/admin/users"
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Users
            </Link>
            <span aria-hidden>/</span>
            <span className="text-zinc-900 dark:text-zinc-100">
              {target.displayName}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <span
              className="inline-block size-12 rounded-full ring-2 ring-zinc-200 dark:ring-zinc-800"
              style={{ background: target.trackColor }}
              aria-hidden
            />
            <div className="flex-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {target.displayName}
                {isSelf && (
                  <span className="ml-2 text-sm text-zinc-500">(you)</span>
                )}
              </h1>
              <p className="text-sm text-zinc-500">{target.email}</p>
            </div>
            <RoleSelector
              uid={target.uid}
              currentRole={target.role}
              displayName={target.displayName}
              isSelf={isSelf}
            />
          </div>
        </header>

        {/* Admin actions — reset link is the main one for now. Goes under
            the header so it's visually grouped with role/identity controls. */}
        {!isSelf && (
          <section className="mt-4 flex flex-wrap items-start gap-3">
            <ResetLinkButton
              uid={target.uid}
              displayName={target.displayName}
              email={target.email}
              disabled={target.status !== "active"}
            />
          </section>
        )}

        {/* Profile facts */}
        <section className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <Fact label="UID" value={<code className="text-xs">{target.uid}</code>} />
          <Fact label="Role" value={target.role} />
          <Fact label="Status" value={target.status} />
          <Fact label="Joined" value={formatTimestamp(target.createdAt)} />
          <Fact
            label="Last login"
            value={formatTimestamp(target.lastLoginAt)}
          />
        </section>

        {/* Auth events */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">
            Login history{" "}
            <span className="text-sm font-normal text-zinc-500">
              ({events.length})
            </span>
          </h2>

          {events.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              ยังไม่มี event ของ user นี้
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-left uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">When</th>
                    <th className="px-3 py-2.5 font-medium">Event</th>
                    <th className="px-3 py-2.5 font-medium">Provider</th>
                    <th className="px-3 py-2.5 font-medium">IP / Geo</th>
                    <th className="px-3 py-2.5 font-medium">User Agent</th>
                    <th className="px-3 py-2.5 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {events.map((e, idx) => (
                    <tr
                      key={`${e.timestamp.toMillis()}-${idx}`}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    >
                      <td className="px-3 py-2 align-top text-zinc-600 dark:text-zinc-400">
                        <div>{formatTimestamp(e.timestamp)}</div>
                        <div className="text-zinc-400">
                          {formatRelative(e.timestamp)}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${EVENT_BADGE[e.eventType]}`}
                        >
                          {e.eventType}
                        </span>
                        {e.eventType === "role-change" && (
                          <div className="mt-1 text-zinc-500">
                            {e.oldRole} → {e.newRole}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-zinc-600 dark:text-zinc-400">
                        {e.provider}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-mono text-zinc-700 dark:text-zinc-300">
                          {e.ip}
                        </div>
                        <div className="text-zinc-500">
                          {[e.country, e.region, e.city]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </td>
                      <td
                        className="px-3 py-2 align-top text-zinc-500"
                        title={e.userAgent}
                      >
                        <div className="max-w-[20rem] truncate">
                          {e.userAgent}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {e.success ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            ✓ success
                          </span>
                        ) : (
                          <div>
                            <div className="text-red-600 dark:text-red-400">
                              ✕ failed
                            </div>
                            {e.errorCode && (
                              <div className="text-zinc-500">{e.errorCode}</div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
}
