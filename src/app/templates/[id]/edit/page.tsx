import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { resolveTemplateAccess } from "@/lib/firebase/prompt-template-access";
import { Nav } from "@/components/nav";
import { TemplateForm } from "../../template-form";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireUserProfile("/templates");
  const { id } = await params;

  const access = await resolveTemplateAccess(profile, id);
  if (!access) notFound();

  // When the caller doesn't have edit rights (typically an editor
  // viewing a shared/admin-curated template) we DON'T redirect away
  // — instead we render the same form in read-only mode so they can
  // see the full snippet and decide whether to use it. Editing /
  // deletion controls are hidden by the form when readOnly is true.
  const readOnly = !access.canEdit;
  const { template } = access;

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-10">
        <div className="mx-auto w-full max-w-3xl">
          <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Link href="/templates" className="hover:underline">
                Templates
              </Link>
              <span>/</span>
              <span className="text-zinc-900 dark:text-zinc-100">
                {template.label}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {readOnly ? "ดู template" : "แก้ไข template"}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {template.scope === "shared" ? "🌐 Shared" : "👤 Personal"} ·
              สร้างโดย {template.ownerEmail} · ใช้แล้ว{" "}
              {template.usageCount} ครั้ง
            </p>
            {readOnly && (
              <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
                🔒 Template นี้สร้างและจัดการโดย admin — คุณดูเนื้อหาได้
                และนำไปใช้ในฟอร์มสร้างเนื้อหาได้ แต่แก้ไข/ลบไม่ได้.
                ต้องการเปลี่ยน? ติดต่อ admin หรือสร้าง template ส่วนตัวของคุณเอง
              </div>
            )}
          </header>

          <TemplateForm
            mode="edit"
            initial={{
              id: template.id,
              label: template.label,
              category: template.category,
              snippet: template.snippet,
              scope: template.scope,
              status: template.status,
            }}
            canChangeScope={access.canChangeScope}
            canDelete={access.canDelete}
            readOnly={readOnly}
          />
        </div>
      </main>
    </>
  );
}
