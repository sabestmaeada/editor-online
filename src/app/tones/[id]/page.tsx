import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { resolveToneAccess } from "@/lib/firebase/tone-access";
import { listSamples } from "@/lib/firebase/tones";
import { Nav } from "@/components/nav";
import { formatRelative, formatTimestamp } from "@/lib/format";
import { ToneDetailView } from "./tone-detail-view";

export const dynamic = "force-dynamic";

export default async function ToneDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireUserProfile("/tones");
  const { id } = await params;

  const access = await resolveToneAccess(profile, id);
  if (!access) notFound();

  const samples = await listSamples(id);

  // Plain-data props for client component (Timestamps don't cross
  // server→client boundary as class instances).
  const toneJson = {
    id: access.tone.id,
    ownerUid: access.tone.ownerUid,
    ownerEmail: access.tone.ownerEmail,
    name: access.tone.name,
    description: access.tone.description,
    sampleCount: access.tone.sampleCount,
    totalChunks: access.tone.totalChunks,
    status: access.tone.status,
    styleProfile: access.tone.styleProfile,
    systemPrompt: access.tone.systemPrompt,
    lastAnalyzedAtFormatted: access.tone.lastAnalyzedAt
      ? formatTimestamp(access.tone.lastAnalyzedAt)
      : null,
  };
  const samplesJson = samples.map((s) => ({
    id: s.id,
    textPreview: s.textPreview,
    textLength: s.textLength,
    source: s.source,
    fileName: s.fileName,
    uploadedByEmail: profile.uid === s.uploadedBy ? "(คุณ)" : s.uploadedBy.slice(0, 8) + "…",
    uploadedAtFormatted: formatTimestamp(s.uploadedAt),
    uploadedAtRelative: formatRelative(s.uploadedAt),
    qdrantPointCount: s.qdrantPointIds.length,
  }));

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-10">
        <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Link href="/tones" className="hover:underline">
              สำนวนการเขียน
            </Link>
            <span>/</span>
            <span className="text-zinc-900 dark:text-zinc-100">
              {access.tone.name}
            </span>
            {access.tone.status === "archived" && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                archived
              </span>
            )}
          </div>
          {access.isAdmin && !access.isOwner && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠ คุณกำลังดู tone ของ {access.tone.ownerEmail} (admin)
            </p>
          )}
        </header>

        <ToneDetailView
          tone={toneJson}
          samples={samplesJson}
          permissions={{
            canEdit: access.canEdit,
            canAddSample: access.canAddSample,
            canDelete: access.canDelete,
            canTransfer: access.canTransfer,
          }}
        />
      </main>
    </>
  );
}
