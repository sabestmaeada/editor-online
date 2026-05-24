import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { Nav } from "@/components/nav";
import { EditProjectForm } from "./edit-form";
import { CoverUploader } from "./cover-uploader";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireUserProfile("/projects");
  const { id } = await params;

  const access = await resolveProjectAccess(profile, id);
  if (!access) notFound();
  if (!access.canManage) redirect(`/projects/${id}`);

  const p = access.project;

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-12">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <Link
              href="/projects"
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Projects
            </Link>
            <span aria-hidden>/</span>
            <Link
              href={`/projects/${id}`}
              className="hover:text-zinc-900 dark:hover:text-zinc-100 line-clamp-1"
            >
              {p.title}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-zinc-900 dark:text-zinc-100">Edit</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Edit project
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            แก้ไข metadata ของ project — ไฟล์ใน R2 ไม่กระทบ
          </p>
        </header>

        <div className="max-w-2xl space-y-8">
          <section className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <CoverUploader
              projectId={p.id}
              hasCover={Boolean(p.coverKey)}
              initialVersion={p.coverUpdatedAt?.toMillis() ?? 0}
            />
          </section>

          <EditProjectForm
            projectId={p.id}
            defaultValues={{
              title: p.title,
              customer: p.customer,
              pages: p.pages,
              description: p.description ?? "",
              isbn: p.isbn ?? "",
              language: p.language ?? "",
              author: p.author ?? "",
              edition: p.edition ?? "",
              status: p.status,
              preface: p.preface ?? "",
            }}
          />
        </div>
      </main>
    </>
  );
}
