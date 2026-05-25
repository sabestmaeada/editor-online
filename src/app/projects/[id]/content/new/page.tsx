import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { getOutline } from "@/lib/firebase/outlines";
import { getTone } from "@/lib/firebase/tones";
import { flattenOutlineToChapters } from "@/lib/content/flatten-outline";
import { STRUCTURE_PROMPT } from "@/lib/content/structure-prompt";
import { listTemplatesForEditor } from "@/lib/firebase/prompt-templates";
import { canUseTemplates } from "@/lib/firebase/prompt-template-access";
import { Nav } from "@/components/nav";
import { ContentSubmitForm } from "./content-submit-form";

export const dynamic = "force-dynamic";

export default async function ContentNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireUserProfile("/projects");
  const { id: projectId } = await params;

  const access = await resolveProjectAccess(profile, projectId);
  if (!access) notFound();
  // Anyone with canEdit on project can trigger content gen — same gate
  // as outline generation.
  if (!access.canEdit) {
    redirect(`/projects/${projectId}/outline`);
  }

  const outline = await getOutline(projectId);
  if (!outline) {
    // No outline yet → push to outline form first.
    redirect(`/projects/${projectId}/outline/new`);
  }
  if (outline.status === "generating") {
    // Outline is still being generated — wait page (reuse outline page).
    redirect(`/projects/${projectId}/outline`);
  }
  if (outline.status === "failed") {
    // Outline failed → can't generate content. Push back to outline form.
    redirect(`/projects/${projectId}/outline/new`);
  }
  // Note: outline.status === "finalized" is allowed — user is retrying
  // a previous gen attempt (e.g. n8n failed and they want to retry).

  // Resolve tone — same ownership/status checks as the API route, but
  // we render a friendly warning instead of rejecting.
  let toneDisplay:
    | { id: string; name: string; preview: string }
    | { error: string }
    | null = null;
  if (outline.formInput.toneId) {
    const tone = await getTone(outline.formInput.toneId);
    if (!tone) {
      toneDisplay = {
        error:
          "สำนวนที่เคยเลือกถูกลบไปแล้ว — สร้างเนื้อหาจะใช้ default tone แทน",
      };
    } else if (tone.ownerUid !== profile.uid) {
      toneDisplay = {
        error:
          "สำนวนของ outline นี้เป็นของผู้ใช้คนอื่น — ต้องสร้าง outline ใหม่ก่อน",
      };
    } else if (tone.status !== "active") {
      toneDisplay = {
        error: "สำนวนที่เลือกถูก archive แล้ว — ต้องเลือกสำนวนใหม่ใน outline",
      };
    } else if (!tone.systemPrompt) {
      toneDisplay = {
        error: "สำนวนยังไม่มี sample — ไปเพิ่ม sample ก่อนใช้งาน",
      };
    } else {
      toneDisplay = {
        id: tone.id,
        name: tone.name,
        preview: tone.systemPrompt.slice(0, 240),
      };
    }
  }

  const chapters = flattenOutlineToChapters(outline.nodes);
  // Block submit at the page level when we know there's nothing to do.
  const canSubmit =
    chapters.length > 0 &&
    chapters.length <= 30 &&
    (toneDisplay === null || "id" in toneDisplay);

  // Load prompt templates for the chips UI. Viewers shouldn't reach this
  // page (canEdit gate above), so canUseTemplates is true for everyone
  // here — but guard cheaply in case role check changes later.
  const templates = canUseTemplates(profile)
    ? await listTemplatesForEditor(profile.uid)
    : [];

  // Identify the "Default" chip — convention: shared template whose
  // label, trimmed + lowercased, equals "default". Admin sets this by
  // naming a shared template "Default" (or "default", "DEFAULT" — all
  // match) at /templates/new?scope=shared. If multiple match, pick
  // oldest by createdAt so the choice is stable for end users.
  //
  // If no match, defaultTemplateId is null and the form skips the
  // onboarding banner + special chip styling. Editors still see all
  // shared/personal chips as usual.
  const defaultMatches = templates
    .filter(
      (t) =>
        t.scope === "shared" &&
        t.label.trim().toLowerCase() === "default",
    )
    .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
  const defaultTemplateId = defaultMatches[0]?.id ?? null;

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-10">
        <div className="mx-auto w-full max-w-3xl">
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
              สร้างเนื้อหาหนังสือ &ldquo;
              {outline.formInput.bookTitle || access.project.title}&rdquo;
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              ระบบจะใช้ AI เขียนเนื้อหาแต่ละบทเป็น HTML แล้วเก็บใน Google
              Drive — ใช้เวลาประมาณ 30 วินาทีต่อบท
            </p>
          </header>

          <ContentSubmitForm
            projectId={projectId}
            bookTitle={outline.formInput.bookTitle || access.project.title}
            chapterCount={chapters.length}
            tone={toneDisplay}
            structurePrompt={STRUCTURE_PROMPT}
            templates={templates.map((t) => ({
              id: t.id,
              scope: t.scope,
              label: t.label,
              category: t.category,
              snippet: t.snippet,
            }))}
            defaultTemplateId={defaultTemplateId}
            canSubmit={canSubmit}
            outlineFinalized={outline.status === "finalized"}
          />
        </div>
      </main>
    </>
  );
}
