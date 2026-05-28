import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import {
  canCreatePersonalTemplate,
  canCreateSharedTemplate,
  canUseTemplates,
} from "@/lib/firebase/prompt-template-access";
import {
  listAllTemplates,
  listTemplatesForEditor,
} from "@/lib/firebase/prompt-templates";
import { Nav } from "@/components/nav";
import { formatRelative } from "@/lib/format";
import {
  PROMPT_TEMPLATE_CATEGORY_LABELS,
  type PromptTemplate,
} from "@/lib/types";
import { FilterPill } from "@/components/filter-pill";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function TemplatesListPage({
  searchParams,
}: PageProps) {
  const profile = await requireUserProfile("/templates");
  if (!canUseTemplates(profile)) {
    redirect("/");
  }
  const params = await searchParams;
  const view = params.view;

  const isAdmin = profile.role === "admin";
  // Only admin can use ?view=all
  if (view === "all" && !isAdmin) {
    redirect("/templates");
  }

  const templates =
    view === "all" && isAdmin
      ? await listAllTemplates({ status: null }) // admin sees archived too
      : await listTemplatesForEditor(profile.uid);

  // Group by scope first (shared on top), then by category for visual order
  const shared = templates.filter((t) => t.scope === "shared");
  const personal = templates.filter((t) => t.scope === "personal");

  const canCreate = canCreatePersonalTemplate(profile);
  const canCreateShared = canCreateSharedTemplate(profile);

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-10">
        <div className="mx-auto w-full max-w-5xl">
          <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Link href="/" className="hover:underline">
                หน้าหลัก
              </Link>
              <span>/</span>
              <span className="text-zinc-900 dark:text-zinc-100">
                Prompt templates
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Prompt templates
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              เทมเพลตคำสั่งที่ใช้ซ้ำในฟอร์มสร้างเนื้อหา —{" "}
              <span title="visible to all editors">🌐 shared</span>{" "}
              จัดการโดย admin,{" "}
              <span title="visible only to you">👤 personal</span> เป็นของคุณ
            </p>

            {/* Admin filter bar */}
            {isAdmin && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-zinc-500">แสดง:</span>
                <FilterPill href="/templates" active={view !== "all"}>
                  ของฉัน + Shared
                </FilterPill>
                <FilterPill href="/templates?view=all" active={view === "all"}>
                  ทุก user (admin)
                </FilterPill>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {canCreate && (
                <Link
                  href="/templates/new"
                  className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  + สร้าง template ส่วนตัว
                </Link>
              )}
              {canCreateShared && (
                <Link
                  href="/templates/new?scope=shared"
                  className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  + สร้าง template 🌐 shared (admin)
                </Link>
              )}
            </div>
          </header>

          {/* Shared section */}
          <Section
            title="🌐 Shared templates (จาก admin)"
            description="ใช้ได้กับทุก editor — แก้/ลบได้เฉพาะ admin"
            templates={shared}
            isAdmin={isAdmin}
            currentUid={profile.uid}
            emptyHint={
              canCreateShared
                ? "ยังไม่มี shared template — สร้างอันแรกผ่านปุ่มด้านบน"
                : "ยังไม่มี shared template ที่ admin จัดไว้"
            }
          />

          {/* Personal section */}
          <Section
            title="👤 Personal templates (ของคุณ)"
            description="ใช้ในฟอร์มสร้างเนื้อหาของคุณเอง — แก้/ลบได้"
            templates={personal}
            isAdmin={isAdmin}
            currentUid={profile.uid}
            emptyHint={
              canCreate
                ? "ยังไม่มี template ส่วนตัว — สร้างเองได้สูงสุด 50 อัน"
                : "ยังไม่มี template ส่วนตัว"
            }
          />
        </div>
      </main>
    </>
  );
}

function Section({
  title,
  description,
  templates,
  isAdmin,
  currentUid,
  emptyHint,
}: {
  title: string;
  description: string;
  templates: PromptTemplate[];
  isAdmin: boolean;
  currentUid: string;
  emptyHint: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      <p className="mt-1 text-xs text-zinc-500">{description}</p>
      {templates.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
          {emptyHint}
        </div>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Link
                href={`/templates/${t.id}/edit`}
                className="block h-full rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 font-medium text-zinc-900 dark:text-zinc-100">
                    {t.label}
                  </h3>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {PROMPT_TEMPLATE_CATEGORY_LABELS[t.category]}
                    </span>
                    {t.status === "archived" && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        archived
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-2 line-clamp-3 font-mono text-xs whitespace-pre-wrap text-zinc-500">
                  {t.snippet}
                </p>
                <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                  <span>ใช้แล้ว {t.usageCount} ครั้ง</span>
                  <span>update {formatRelative(t.updatedAt)}</span>
                </div>
                {isAdmin && t.ownerUid !== currentUid && (
                  <p className="mt-1 truncate text-xs text-zinc-400">
                    owner: {t.ownerEmail}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// (helper `filterPill` removed in P2-S72 — replaced by the shared
//  <FilterPill> from @/components/filter-pill, which carries the
//  same styling plus a useLinkStatus pending spinner for click
//  feedback during query-only navigation.)
