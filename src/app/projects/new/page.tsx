import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { Nav } from "@/components/nav";
import { ProjectUploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const profile = await requireUserProfile("/projects/new");

  // Only editor + admin can create projects
  if (profile.role !== "admin" && profile.role !== "editor") {
    redirect("/projects");
  }

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
            <span className="text-zinc-900 dark:text-zinc-100">New</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            New Project
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            กรอกข้อมูล + เลือกไฟล์ ZIP ของ HTML folder
          </p>
        </header>

        <div className="max-w-2xl">
          <ProjectUploadForm />
        </div>
      </main>
    </>
  );
}
