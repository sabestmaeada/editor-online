import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { getOutline } from "@/lib/firebase/outlines";
import { Nav } from "@/components/nav";
import { formatRelative } from "@/lib/format";
import { OutlineView } from "./outline-view";
import { OutlineGeneratingWait } from "./outline-generating-wait";

export const dynamic = "force-dynamic";

export default async function OutlinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireUserProfile("/projects");
  const { id } = await params;

  const access = await resolveProjectAccess(profile, id);
  if (!access) notFound();
  if (!access.canDownload) {
    redirect(`/projects/${id}`);
  }

  const outline = await getOutline(id);

  // No outline yet → push to the form so the user starts there.
  if (!outline) {
    redirect(`/projects/${id}/outline/new`);
  }

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-10">
        <div className="mx-auto w-full max-w-5xl">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Link href="/projects" className="hover:underline">
              Projects
            </Link>
            <span>/</span>
            <Link href={`/projects/${id}`} className="hover:underline">
              {access.project.title}
            </Link>
            <span>/</span>
            <span className="text-zinc-900 dark:text-zinc-100">เค้าโครง</span>
          </div>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                เค้าโครง: {outline.formInput.bookTitle || access.project.title}
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                สถานะ:{" "}
                <StatusBadge status={outline.status} /> · อัปเดต{" "}
                {formatRelative(outline.updatedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Download — Markdown export. Available to anyone with
                  canDownload (project members + admin), as long as the
                  outline has real content (ready / finalized). */}
              {access.canDownload &&
                (outline.status === "ready" ||
                  outline.status === "finalized") &&
                outline.nodes.length > 0 && (
                  <a
                    href={`/api/projects/${id}/outline/download`}
                    download
                    className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    title="ดาวน์โหลด outline เป็น Markdown (.md)"
                  >
                    ⬇ ดาวน์โหลด MD
                  </a>
                )}

              {/* Edit-only actions (owner + project_editor) */}
              {access.canEdit && (
                <>
                  {outline.contentJob?.jobId && (
                    <Link
                      href={`/projects/${id}/content/jobs/${outline.contentJob.jobId}`}
                      className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      📄 ดูเนื้อหาล่าสุด
                    </Link>
                  )}
                  {outline.status !== "finalized" &&
                    outline.status !== "generating" && (
                      <Link
                        href={`/projects/${id}/outline/new`}
                        className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        🔄 สร้างใหม่
                      </Link>
                    )}
                  {(outline.status === "ready" ||
                    outline.status === "finalized") &&
                    outline.nodes.length > 0 && (
                      <Link
                        href={`/projects/${id}/content/new`}
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                      >
                        สร้างเนื้อหา →
                      </Link>
                    )}
                </>
              )}
            </div>
          </div>
        </header>

        {outline.status === "generating" ? (
          <OutlineGeneratingWait
            startedAt={outline.updatedAt.toMillis()}
          />
        ) : outline.status === "failed" ? (
          <FailedOutlineCard
            projectId={id}
            errorMessage={outline.n8nMeta?.error ?? null}
            canRetry={access.canEdit}
          />
        ) : (
          <OutlineView
            projectId={id}
            initialNodes={outline.nodes}
            canEdit={access.canEdit && outline.status !== "finalized"}
          />
        )}
        </div>
      </main>
    </>
  );
}

function FailedOutlineCard({
  projectId,
  errorMessage,
  canRetry,
}: {
  projectId: string;
  errorMessage: string | null;
  canRetry: boolean;
}) {
  return (
    <div className="mt-8 rounded-lg border border-red-200 bg-red-50 px-6 py-8 text-center dark:border-red-900 dark:bg-red-950">
      <p className="text-base font-semibold text-red-900 dark:text-red-100">
        การสร้างเค้าโครงไม่สำเร็จ
      </p>
      <p className="mt-2 text-sm text-red-700 dark:text-red-300">
        AI ไม่สามารถสร้างเค้าโครงให้ได้ — สามารถส่งคำขอใหม่ได้
      </p>
      {errorMessage && (
        <details className="mt-3 inline-block text-left">
          <summary className="cursor-pointer text-xs text-red-600 dark:text-red-400">
            รายละเอียดข้อผิดพลาด
          </summary>
          <pre className="mt-2 max-w-md whitespace-pre-wrap break-words text-xs text-red-700 dark:text-red-300">
            {errorMessage}
          </pre>
        </details>
      )}
      {canRetry && (
        <div className="mt-4">
          <Link
            href={`/projects/${projectId}/outline/new`}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            🔄 ลองใหม่
          </Link>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    generating: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    ready:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    failed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    finalized:
      "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  };
  return (
    <span
      className={
        "rounded px-2 py-0.5 text-xs font-medium " +
        (map[status] ?? "bg-zinc-100 text-zinc-700")
      }
    >
      {status}
    </span>
  );
}
