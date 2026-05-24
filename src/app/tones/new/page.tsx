import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserProfile } from "@/lib/firebase/require-profile";
import { canCreateTone } from "@/lib/firebase/tone-access";
import { Nav } from "@/components/nav";
import { CreateToneForm } from "./create-tone-form";

export const dynamic = "force-dynamic";

export default async function ToneNewPage() {
  const profile = await requireUserProfile("/tones");
  if (!canCreateTone(profile)) {
    redirect("/tones");
  }

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
            <span className="text-zinc-900 dark:text-zinc-100">สร้างใหม่</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            สร้างสำนวนใหม่
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            ตั้งชื่อ + คำอธิบาย → เพิ่มตัวอย่างข้อความในขั้นถัดไป
          </p>
        </header>

        <CreateToneForm />
      </main>
    </>
  );
}
