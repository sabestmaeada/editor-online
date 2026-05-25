import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { resolveToneAccess } from "@/lib/firebase/tone-access";
import { Nav } from "@/components/nav";
import { AddSampleForm } from "./add-sample-form";

export const dynamic = "force-dynamic";

export default async function AddSamplePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireUserProfile("/tones");
  const { id } = await params;

  const access = await resolveToneAccess(profile, id);
  if (!access) notFound();
  if (!access.canAddSample) {
    redirect(`/tones/${id}`);
  }

  return (
    <>
      <Nav profile={profile} />
      <main className="flex flex-1 flex-col px-8 py-10">
        <div className="mx-auto w-full max-w-3xl">
          <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Link href="/tones" className="hover:underline">
                สำนวนการเขียน
              </Link>
              <span>/</span>
              <Link href={`/tones/${id}`} className="hover:underline">
                {access.tone.name}
              </Link>
              <span>/</span>
              <span className="text-zinc-900 dark:text-zinc-100">
                เพิ่ม sample
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              เพิ่มตัวอย่างเข้าสู่สำนวน &ldquo;{access.tone.name}&rdquo;
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              paste ข้อความหรือ upload ไฟล์ (.txt / .md / .docx / .pdf) —
              ระบบจะ embed + วิเคราะห์สไตล์อัตโนมัติ
            </p>
          </header>

          <AddSampleForm toneId={id} />
        </div>
      </main>
    </>
  );
}
