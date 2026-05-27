import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { getOutline } from "@/lib/firebase/outlines";
import { listTonesByOwner } from "@/lib/firebase/tones";
import { Nav } from "@/components/nav";
import { OutlineForm, type ToneOption } from "./outline-form";

export const dynamic = "force-dynamic";

export default async function OutlineNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireUserProfile("/projects");
  const { id } = await params;

  const access = await resolveProjectAccess(profile, id);
  if (!access) notFound();

  // canEdit gates writers / editors / owners / admins. Other members
  // (reviewer-only, viewer) can still view existing outlines but can't
  // trigger generation.
  if (!access.canEdit) {
    redirect(`/projects/${id}`);
  }

  // If there's already an outline, pre-fill the form from its snapshot
  // so retries / re-generations don't make the user re-type everything.
  // (The submit still overwrites — Q1=A: one outline per project.)
  const existing = await getOutline(id);

  // Load the caller's own tone library entries (active + analysed only).
  //
  // Historical note: an earlier design (Q-Tone-4 = a) hid the dropdown
  // from admins on the assumption that admins don't author books and
  // shouldn't tag others' projects with personal tones. That premise
  // changed with P2-S61: admins now don't have `canEdit` on other
  // users' projects at all — so the only way an admin reaches this
  // page is when they're the project's owner / project_editor member.
  // In both of those cases, picking their own tone is exactly what
  // they want, so the role gate has been removed.
  const availableTones: ToneOption[] = (
    await listTonesByOwner(profile.uid, { status: "active" })
  )
    .filter((t) => t.systemPrompt !== null && t.systemPrompt.length > 0)
    .map((t) => ({ id: t.id, name: t.name }));

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
                href={`/projects/${id}`}
                className="hover:underline"
              >
                {access.project.title}
              </Link>
              <span>/</span>
              <span className="text-zinc-900 dark:text-zinc-100">
                สร้างเค้าโครง
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              สร้างเค้าโครงหนังสือด้วย AI
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              กรอกข้อมูลหนังสือ — ระบบจะสร้างโครงสารบัญ (บท / หัวข้อย่อย) ให้
              จากนั้นปรับแก้ได้
            </p>
            {existing && existing.status === "finalized" && (
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                ⚠️ โปรเจกต์นี้มีเค้าโครงที่ finalized แล้ว — การสร้างใหม่จะทับ
                ของเดิม. ถ้าต้องการแก้แทน ใช้{" "}
                <Link
                  href={`/projects/${id}/outline`}
                  className="font-medium underline"
                >
                  หน้า outline editor
                </Link>
              </div>
            )}
          </header>

          <OutlineForm
            projectId={id}
            availableTones={availableTones}
            defaults={{
              bookTitle:
                existing?.formInput.bookTitle || access.project.title || "",
              chapterCount: existing?.formInput.chapterCount || 12,
              pageCount:
                existing?.formInput.pageCount || access.project.pages || 250,
              bookPurpose:
                existing?.formInput.bookPurpose ||
                DEFAULT_PURPOSE,
              bookHighlights:
                existing?.formInput.bookHighlights || DEFAULT_HIGHLIGHTS,
              targetAudience:
                existing?.formInput.targetAudience || DEFAULT_AUDIENCE,
              // Pre-fill toneId only if it still resolves to an
              // available tone (user may have archived/deleted it).
              toneId:
                existing?.formInput.toneId &&
                availableTones.some((t) => t.id === existing.formInput.toneId)
                  ? existing.formInput.toneId
                  : null,
              toneName: null,
            }}
          />
        </div>
      </main>
    </>
  );
}

// Defaults lifted from the n8n formTrigger node the user shared
// (the original Thai field labels' defaultValue). They give a sensible
// starting point for an "OpenClaw"-style book — user edits them as
// needed before submit.
const DEFAULT_PURPOSE =
  "OpenClaw (หรือ OpenClaw AI Agent) คือแพลตฟอร์ม AI Agent แบบ Open Source ที่ทำงานแบบ Self-hosted บนคอมพิวเตอร์ของคุณเอง เปรียบเสมือนเลขาผู้ช่วยส่วนตัวที่มีสมองและมือเท้า สามารถควบคุมเมาส์/คีย์บอร์ด จัดการไฟล์ และทำงานอัตโนมัติผ่านแชท (WhatsApp, Discord, Telegram) ได้ตลอด 24 ชม. โดยเน้นความปลอดภัยของข้อมูล";

const DEFAULT_HIGHLIGHTS =
  "ช่วยงานประจำวันให้เร็วขึ้น คิดงานเป็นระบบขึ้น และสื่อสารได้ดีขึ้น";

const DEFAULT_AUDIENCE =
  "มือใหม่ คนทำงานทั่วไป ครู นักเรียน และเจ้าของกิจการขนาดเล็ก หนังสือต้องมีโทนเป็นหนังสือเทคโนโลยีสมัยใหม่ อ่านง่าย ชัด ใช้งานได้จริง ไม่ใช่หนังสือเชิงวิชาการ ไม่ใช่ภาษาคู่มือราชการ ไม่ใช่บทความเชิงเรียงความ และไม่ใช่การเล่าแบบนิยาย";
