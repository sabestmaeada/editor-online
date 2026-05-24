import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import {
  canCreateTone,
  canSeeOtherUsersTones,
} from "@/lib/firebase/tone-access";
import {
  listAllTones,
  listTonesByOwner,
} from "@/lib/firebase/tones";
import { Nav } from "@/components/nav";
import { formatRelative } from "@/lib/format";
import type { ToneStyle } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ user?: string }>;
};

export default async function TonesListPage({ searchParams }: PageProps) {
  const profile = await requireUserProfile("/tones");
  const params = await searchParams;
  const filter = params.user;

  // Only admin can use ?user= filter (per spec — editor sees own only)
  if (filter && filter !== profile.uid && !canSeeOtherUsersTones(profile)) {
    redirect("/tones");
  }

  let tones: ToneStyle[];
  let viewLabel: string;
  if (filter === "all" && canSeeOtherUsersTones(profile)) {
    tones = await listAllTones();
    viewLabel = "ทุก user";
  } else if (filter && filter !== profile.uid) {
    tones = await listTonesByOwner(filter);
    viewLabel = `เจ้าของ: ${filter.slice(0, 8)}…`;
  } else {
    tones = await listTonesByOwner(profile.uid);
    viewLabel = "ของคุณ";
  }

  const isAdmin = canSeeOtherUsersTones(profile);
  const canCreate = canCreateTone(profile);

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-10">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <h1 className="text-2xl font-semibold tracking-tight">
            สำนวนการเขียน
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            สร้างและจัดการสำนวน — เก็บตัวอย่างข้อความให้ AI วิเคราะห์
            แล้วใช้สร้างเนื้อหาที่มีโทนของคุณ
          </p>

          {/* Admin filter bar */}
          {isAdmin && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-zinc-500">แสดง:</span>
              <Link
                href="/tones"
                className={filterPill(!filter || filter === profile.uid)}
              >
                ของฉัน
              </Link>
              <Link
                href="/tones?user=all"
                className={filterPill(filter === "all")}
              >
                ทุก user (admin)
              </Link>
              <span className="ml-2 text-xs text-zinc-400">
                ปัจจุบัน: {viewLabel}
              </span>
            </div>
          )}

          {/* Quick actions */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {canCreate && (
              <Link
                href="/tones/new"
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
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                สร้างสำนวนใหม่
              </Link>
            )}
          </div>
        </header>

        {/* Tones list */}
        <section className="mt-8">
          {tones.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500">
                ยังไม่มีสำนวน
                {canCreate && (
                  <>
                    {" — "}
                    <Link
                      href="/tones/new"
                      className="font-medium text-zinc-900 underline dark:text-zinc-100"
                    >
                      สร้างอันแรก
                    </Link>
                  </>
                )}
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tones.map((tone) => (
                <li key={tone.id}>
                  <Link
                    href={`/tones/${tone.id}`}
                    className="block h-full rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-1 font-medium text-zinc-900 dark:text-zinc-100">
                        {tone.name}
                      </h3>
                      {tone.status === "archived" && (
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          archived
                        </span>
                      )}
                    </div>
                    {tone.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-500">
                        {tone.description}
                      </p>
                    )}
                    <dl className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                      <div>
                        <dt className="sr-only">samples</dt>
                        <dd>
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            {tone.sampleCount}
                          </span>{" "}
                          samples
                        </dd>
                      </div>
                      <div>
                        <dt className="sr-only">chunks</dt>
                        <dd>
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            {tone.totalChunks}
                          </span>{" "}
                          chunks
                        </dd>
                      </div>
                      {tone.styleProfile && (
                        <div>
                          <dt className="sr-only">tone</dt>
                          <dd className="text-emerald-600 dark:text-emerald-400">
                            ✓ analyzed
                          </dd>
                        </div>
                      )}
                    </dl>
                    {isAdmin && tone.ownerEmail !== profile.email && (
                      <p className="mt-2 truncate text-xs text-zinc-400">
                        owner: {tone.ownerEmail}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-zinc-400">
                      updated {formatRelative(tone.updatedAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function filterPill(active: boolean): string {
  return (
    "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
    (active
      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
      : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800")
  );
}
