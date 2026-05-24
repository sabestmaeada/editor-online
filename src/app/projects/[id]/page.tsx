import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { listMembersOfProject } from "@/lib/firebase/project-members";
import { listContentJobsByProject } from "@/lib/firebase/content-jobs";
import { listProjectFiles } from "@/lib/r2/download";
import { Nav } from "@/components/nav";
import { formatTimestamp, formatRelative } from "@/lib/format";
import {
  DeleteProjectButton,
  InviteMemberForm,
  MemberRow,
  StatusSelector,
} from "./member-controls";
import { ReplaceFilesForm } from "./replace-files-form";
import type { ProjectStatus, ContentJobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<ProjectStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "in-progress":
    "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  review:
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  completed:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  archived:
    "bg-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-500",
};

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireUserProfile("/projects");
  const { id } = await params;

  const access = await resolveProjectAccess(profile, id);
  if (!access) notFound();

  const [files, members, contentJobs] = await Promise.all([
    listProjectFiles(id),
    listMembersOfProject(id),
    listContentJobsByProject(id, { limit: 5 }),
  ]);

  const { project } = access;

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-12">
        {/* Breadcrumb */}
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <Link
            href="/projects"
            className="hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Projects
          </Link>
          <span aria-hidden>/</span>
          <span className="text-zinc-900 dark:text-zinc-100 line-clamp-1">
            {project.title}
          </span>
        </div>

        {/* Header */}
        <header className="mt-2 flex flex-wrap items-start gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
          {/* Cover thumbnail */}
          <div className="size-24 sm:size-32 flex-shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
            {project.coverKey ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/projects/${project.id}/cover?v=${project.coverUpdatedAt?.toMillis() ?? 0}`}
                alt={`Cover of ${project.title}`}
                className="h-full w-full object-cover"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src="/cover-placeholder.svg"
                alt=""
                className="h-full w-full object-cover opacity-80"
              />
            )}
          </div>

          <div className="grow">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                📘 {project.title}
              </h1>
              {access.canManage ? (
                <StatusSelector
                  projectId={project.id}
                  current={project.status}
                />
              ) : (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[project.status]}`}
                >
                  {project.status}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {project.customer} · {project.pages} pages
              {project.author && <> · by {project.author}</>}
              {project.edition && <> · {project.edition} ed.</>}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {access.canEdit && (
              <Link
                href={`/projects/${project.id}/outline`}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                เค้าโครง
              </Link>
            )}
            {access.canManage && (
              <Link
                href={`/projects/${project.id}/edit`}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Edit
              </Link>
            )}
            <a
              href={`/api/projects/${project.id}/download`}
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
              Download ZIP
            </a>
          </div>
        </header>

        {/* Metadata grid */}
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Owner" value={project.ownerEmail} />
          <Fact label="Files" value={`${project.fileCount} (${formatBytes(project.totalSize)})`} />
          <Fact label="Created" value={formatTimestamp(project.createdAt)} />
          <Fact label="Updated" value={formatRelative(project.updatedAt)} />
          {project.isbn && <Fact label="ISBN" value={project.isbn} />}
          {project.language && <Fact label="Language" value={project.language} />}
        </section>

        {project.description && (
          <section className="mt-4">
            <h2 className="text-xs uppercase tracking-wide text-zinc-500">
              Description
            </h2>
            <p className="mt-1 whitespace-pre-line text-sm">
              {project.description}
            </p>
          </section>
        )}

        {/* Members */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">
            Members ({members.length})
          </h2>

          {access.canManage && (
            <div className="mt-3">
              <InviteMemberForm projectId={project.id} />
            </div>
          )}

          <div className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {members.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-500">
                ยังไม่มี member — เชิญด้วยฟอร์มด้านบน
              </p>
            ) : (
              members.map((m) => (
                <div key={m.uid} className="px-4 py-3">
                  <MemberRow
                    projectId={project.id}
                    uid={m.uid}
                    email={m.email}
                    displayName={m.displayName}
                    role={m.role}
                    canManage={access.canManage}
                    isOwner={m.uid === project.ownerUid}
                  />
                </div>
              ))
            )}
          </div>
        </section>

        {/* Content jobs (Phase 2) — only shown when ≥ 1 job */}
        {contentJobs.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight">
              เนื้อหาที่สร้าง ({contentJobs.length}
              {contentJobs.length === 5 ? "+ ล่าสุด" : ""})
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              งานสร้างเนื้อหา AI สำหรับโปรเจกต์นี้ — คลิกเพื่อดูสถานะ + เนื้อหาแต่ละบท
            </p>
            <div className="mt-4 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">วันที่</th>
                    <th className="px-3 py-2 text-left font-medium">
                      สถานะ
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      ความคืบหน้า
                    </th>
                    <th className="px-3 py-2 text-left font-medium">สำนวน</th>
                    <th className="px-3 py-2 text-right font-medium">เปิด</th>
                  </tr>
                </thead>
                <tbody>
                  {contentJobs.map((job) => (
                    <tr
                      key={job.id}
                      className="border-t border-zinc-200 dark:border-zinc-800"
                    >
                      <td className="px-3 py-2 text-zinc-500">
                        {formatRelative(job.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        <ContentJobBadge status={job.status} />
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {job.completedChapters} / {job.totalChapters} บท
                        {job.failedChapters > 0
                          ? ` · ${job.failedChapters} ล้มเหลว`
                          : ""}
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {job.toneName ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/projects/${project.id}/content/jobs/${job.id}`}
                          className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                        >
                          ดูบท →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Files */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">
            Files ({files.length})
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            ทุกไฟล์ใน R2 prefix <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{project.r2Prefix}source/</code>
          </p>

          {/* Replace files — owner / admin only */}
          {access.canManage && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                ⚠ Replace all files
              </h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                อัปโหลด ZIP ใหม่ — ลบไฟล์เดิม{" "}
                <strong>{project.fileCount}</strong> ไฟล์ทั้งหมดและแทนด้วยไฟล์จาก ZIP
              </p>
              <div className="mt-3">
                <ReplaceFilesForm
                  projectId={project.id}
                  currentFileCount={project.fileCount}
                />
              </div>
            </div>
          )}

          {files.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">ไม่มีไฟล์</p>
          ) : (
            <div className="mt-3 max-h-96 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-left uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2 font-medium">Path</th>
                    <th className="px-3 py-2 font-medium text-right">Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {files.map((f) => (
                    <tr key={f.path}>
                      <td className="px-3 py-1.5 font-mono">{f.path}</td>
                      <td className="px-3 py-1.5 text-right text-zinc-500">
                        {formatBytes(f.size)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Danger zone */}
        {access.canManage && (
          <section className="mt-12 rounded-lg border border-red-200 p-4 dark:border-red-900/50">
            <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
              Danger zone
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              ลบโปรเจกต์จะลบ Firestore docs + R2 objects ถาวร
            </p>
            <div className="mt-3">
              <DeleteProjectButton
                projectId={project.id}
                projectTitle={project.title}
              />
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
}

function ContentJobBadge({ status }: { status: ContentJobStatus }) {
  const map: Record<ContentJobStatus, { label: string; cls: string }> = {
    pending: {
      label: "รอเริ่ม",
      cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    },
    generating: {
      label: "กำลังสร้าง",
      cls: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    },
    done: {
      label: "✅ เสร็จ",
      cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    partial: {
      label: "⚠️ บางส่วน",
      cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    },
    failed: {
      label: "❌ ล้มเหลว",
      cls: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}
