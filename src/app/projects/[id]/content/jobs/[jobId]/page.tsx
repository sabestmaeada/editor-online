import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { getContentJob } from "@/lib/firebase/content-jobs";
import { Nav } from "@/components/nav";
import { formatRelative } from "@/lib/format";
import { JobStatusView, type JobSnapshot } from "./job-status-view";

export const dynamic = "force-dynamic";

export default async function JobStatusPage({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>;
}) {
  const profile = await requireUserProfile("/projects");
  const { id: projectId, jobId } = await params;

  const access = await resolveProjectAccess(profile, projectId);
  if (!access) notFound();
  if (!access.canDownload) {
    // Same gate as outline page — any member can view, viewer-only role
    // can't (they don't have canDownload).
    redirect(`/projects/${projectId}`);
  }

  const job = await getContentJob(jobId);
  if (!job || job.projectId !== projectId) {
    notFound();
  }

  // Snapshot for the client component — serialise timestamps to ISO so
  // they cross the server→client boundary cleanly (Firestore Timestamp
  // can't be serialised over RSC).
  const snapshot: JobSnapshot = {
    id: job.id,
    status: job.status,
    totalChapters: job.totalChapters,
    completedChapters: job.completedChapters,
    failedChapters: job.failedChapters,
    toneName: job.toneName,
    createdAt: job.createdAt.toMillis(),
    updatedAt: job.updatedAt.toMillis(),
    chapters: job.chapters.map((c) => ({
      index: c.index,
      chapter: c.chapter,
      title: c.title,
      status: c.status,
      htmlDriveUrl: c.htmlDriveUrl,
      wordCount: c.wordCount,
      imageCount: c.imageCount,
      error: c.error,
    })),
  };

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-10">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Link href="/projects" className="hover:underline">
              Projects
            </Link>
            <span>/</span>
            <Link
              href={`/projects/${projectId}`}
              className="hover:underline"
            >
              {access.project.title}
            </Link>
            <span>/</span>
            <Link
              href={`/projects/${projectId}/outline`}
              className="hover:underline"
            >
              เค้าโครง
            </Link>
            <span>/</span>
            <span className="text-zinc-900 dark:text-zinc-100">
              สร้างเนื้อหา
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            สถานะการสร้างเนื้อหา
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            เริ่ม {formatRelative(job.createdAt)}
            {job.toneName ? ` · ใช้สำนวน "${job.toneName}"` : ""}
          </p>
        </header>

        <JobStatusView projectId={projectId} initialSnapshot={snapshot} />
      </main>
    </>
  );
}
