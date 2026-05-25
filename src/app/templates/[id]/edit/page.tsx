import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
  if (!access.canEdit) {
    // Read-only access (e.g. editor viewing a shared template) — push
    // them back to the list. They can copy snippet from the card preview.
    redirect("/templates");
  }

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
              แก้ไข template
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {template.scope === "shared" ? "🌐 Shared" : "👤 Personal"} ·
              สร้างโดย {template.ownerEmail} · ใช้แล้ว{" "}
              {template.usageCount} ครั้ง
            </p>
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
          />
        </div>
      </main>
    </>
  );
}
