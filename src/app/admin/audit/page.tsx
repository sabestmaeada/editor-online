import Link from "next/link";
import { requireAdmin } from "@/lib/firebase/require-role";
import { listRecentAuthEvents } from "@/lib/firebase/admin-events";
import { Nav } from "@/components/nav";
import { formatTimestamp, formatRelative } from "@/lib/format";
import { type AuthEventType, type AuthEvent } from "@/lib/types";
import {
  filtersToParams,
  parseAuditSearchParams,
  type AuditFilters,
} from "./filters";

export const dynamic = "force-dynamic";

const EVENT_BADGE: Record<AuthEventType, string> = {
  login:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  logout: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "failed-login":
    "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  "password-reset":
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "email-change":
    "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  "role-change":
    "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
};

const ALL_EVENT_TYPES: AuthEventType[] = [
  "login",
  "logout",
  "failed-login",
  "password-reset",
  "email-change",
  "role-change",
];

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caller = await requireAdmin("/admin/audit");
  const sp = await searchParams;
  const filters = parseAuditSearchParams(sp);

  const { events, nextCursor, totalShown } = await listRecentAuthEvents({
    limit: 100,
    eventType: filters.eventType,
    email: filters.email,
    from: filters.from,
    to: filters.to,
    before: filters.before,
  });

  function urlWith(override: Partial<AuditFilters>, keepCursor = false): string {
    const merged: AuditFilters = { ...filters, ...override };
    const params = filtersToParams(merged, { includeCursor: keepCursor });
    const qs = params.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  }

  function nextPageHref(): string | null {
    if (!nextCursor) return null;
    return urlWith({ before: nextCursor }, true);
  }

  const exportHref = (() => {
    const params = filtersToParams(filters, { includeCursor: false });
    const qs = params.toString();
    return qs ? `/admin/audit/export?${qs}` : "/admin/audit/export";
  })();

  const hasActiveFilters = Boolean(
    filters.eventType || filters.email || filters.fromDate || filters.toDate,
  );

  return (
    <>
      <Nav profile={caller} />
      <main className="flex flex-1 flex-col px-8 py-12">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <Link
              href="/admin"
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Admin
            </Link>
            <span aria-hidden>/</span>
            <span className="text-zinc-900 dark:text-zinc-100">Audit Log</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Global Audit Log
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Timeline ของ auth events ทั้งระบบ — เรียงใหม่ก่อน
              </p>
            </div>
            <a
              href={exportHref}
              download
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
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export CSV
            </a>
          </div>
        </header>

        {/* ─── Filter form (email + date range) ─────────────────── */}
        <form
          action="/admin/audit"
          method="get"
          className="mt-6 grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 sm:grid-cols-[1fr_auto_auto_auto] dark:border-zinc-800 dark:bg-zinc-900/30"
        >
          {/* Preserve type filter when submitting form */}
          {filters.eventType && (
            <input type="hidden" name="type" value={filters.eventType} />
          )}

          <div>
            <label
              htmlFor="search-email"
              className="block text-xs font-medium text-zinc-500"
            >
              Email
            </label>
            <input
              id="search-email"
              name="email"
              type="email"
              defaultValue={filters.email ?? ""}
              placeholder="user@example.com"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="search-from"
              className="block text-xs font-medium text-zinc-500"
            >
              จาก (วันที่)
            </label>
            <input
              id="search-from"
              name="from"
              type="date"
              defaultValue={filters.fromDate ?? ""}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="search-to"
              className="block text-xs font-medium text-zinc-500"
            >
              ถึง (วันที่)
            </label>
            <input
              id="search-to"
              name="to"
              type="date"
              defaultValue={filters.toDate ?? ""}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              ค้นหา
            </button>
            {hasActiveFilters && (
              <Link
                href="/admin/audit"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                ล้าง
              </Link>
            )}
          </div>
        </form>

        {/* ─── Type filter chips ────────────────────────────────── */}
        <nav
          aria-label="Filter by event type"
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          <FilterChip
            href={urlWith({ eventType: undefined })}
            active={!filters.eventType}
            label="ทุก event"
          />
          {ALL_EVENT_TYPES.map((t) => (
            <FilterChip
              key={t}
              href={urlWith({ eventType: t })}
              active={filters.eventType === t}
              label={t}
              badge={EVENT_BADGE[t]}
            />
          ))}
        </nav>

        {/* ─── Results ──────────────────────────────────────────── */}
        <section className="mt-6">
          <div className="mb-2 text-xs text-zinc-500">
            {filters.before ? "ก่อนหน้า " : "ใหม่ที่สุด "}
            {totalShown} events
            {hasActiveFilters && " · ใช้ filter อยู่"}
          </div>

          {events.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
              ไม่มี events ที่ตรงเงื่อนไข
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-left uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">When</th>
                    <th className="px-3 py-2.5 font-medium">User</th>
                    <th className="px-3 py-2.5 font-medium">Event</th>
                    <th className="px-3 py-2.5 font-medium">Provider</th>
                    <th className="px-3 py-2.5 font-medium">IP / Geo</th>
                    <th className="px-3 py-2.5 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {events.map((e, idx) => (
                    <EventRow
                      key={`${e.timestamp.toMillis()}-${idx}`}
                      event={e}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <Link
              href={urlWith({ before: undefined }, false)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              ← ใหม่ที่สุด
            </Link>
            {nextPageHref() ? (
              <Link
                href={nextPageHref()!}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                เก่ากว่านี้ →
              </Link>
            ) : (
              <span className="text-xs text-zinc-400">
                จบรายการ (ไม่มี event เก่ากว่านี้)
              </span>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

function FilterChip({
  href,
  active,
  label,
  badge,
}: {
  href: string;
  active: boolean;
  label: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : badge
            ? `${badge} hover:opacity-80`
            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700")
      }
    >
      {label}
    </Link>
  );
}

function EventRow({ event: e }: { event: AuthEvent }) {
  const userDisplay =
    e.uid === "unknown" ? (
      <span className="italic text-zinc-500">unknown</span>
    ) : (
      <Link
        href={`/admin/users/${e.uid}`}
        className="hover:underline"
        title={e.uid}
      >
        {e.email}
      </Link>
    );

  return (
    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
      <td className="px-3 py-2 align-top text-zinc-600 dark:text-zinc-400">
        <div>{formatTimestamp(e.timestamp)}</div>
        <div className="text-zinc-400">{formatRelative(e.timestamp)}</div>
      </td>
      <td className="px-3 py-2 align-top">{userDisplay}</td>
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
        <div className="font-mono text-zinc-700 dark:text-zinc-300">{e.ip}</div>
        <div className="text-zinc-500">
          {[e.country, e.region, e.city].filter(Boolean).join(" · ") || "—"}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        {e.success ? (
          <span className="text-emerald-600 dark:text-emerald-400">
            ✓ success
          </span>
        ) : (
          <div>
            <div className="text-red-600 dark:text-red-400">✕ failed</div>
            {e.errorCode && <div className="text-zinc-500">{e.errorCode}</div>}
          </div>
        )}
      </td>
    </tr>
  );
}
