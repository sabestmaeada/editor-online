import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import {
  canCreatePersonalTemplate,
  canCreateSharedTemplate,
} from "@/lib/firebase/prompt-template-access";
import { Nav } from "@/components/nav";
import { TemplateForm } from "../template-form";
import type { PromptTemplateScope } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CreateTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const profile = await requireUserProfile("/templates");
  if (!canCreatePersonalTemplate(profile)) {
    redirect("/");
  }
  const { scope: scopeParam } = await searchParams;

  // Default scope = personal. ?scope=shared requires admin.
  const isAdmin = profile.role === "admin";
  const canShared = canCreateSharedTemplate(profile);
  let scope: PromptTemplateScope = "personal";
  if (scopeParam === "shared") {
    if (!canShared) redirect("/templates/new");
    scope = "shared";
  }

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
              <span className="text-zinc-900 dark:text-zinc-100">สร้างใหม่</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              สร้าง prompt template
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {scope === "shared"
                ? "🌐 Shared — ทุก editor ในระบบจะเห็น template นี้"
                : "👤 Personal — เฉพาะคุณเห็นและใช้ template นี้"}
            </p>
          </header>

          <TemplateForm
            mode="create"
            initial={{
              label: "",
              category: "custom",
              snippet: "",
              scope,
            }}
            canChangeScope={isAdmin}
            canDelete={false}
          />
        </div>
      </main>
    </>
  );
}
