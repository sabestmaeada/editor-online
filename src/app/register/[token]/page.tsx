import { notFound } from "next/navigation";
import Link from "next/link";
import { getInvite } from "@/lib/firebase/invites";
import { formatTimestamp } from "@/lib/format";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

/**
 * /register/[token]
 *
 * Public page. Verifies the invite token server-side and renders the
 * registration form pre-filled with the invited email. After submission,
 * client redirects to /login?registered=1 — the user never gets a session
 * cookie until admin approves.
 */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInvite(token, { persistExpiry: true });

  // We deliberately return generic states rather than leaking whether the
  // token was used/revoked/expired — same UX, less info to attackers.
  if (!invite) notFound();

  if (invite.status !== "active") {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-semibold">Invite ใช้ไม่ได้</h1>
          <p className="text-sm text-zinc-500">
            ลิงก์เชิญนี้
            {invite.status === "used" && " ถูกใช้งานไปแล้ว"}
            {invite.status === "expired" && " หมดอายุแล้ว"}
            {invite.status === "revoked" && " ถูกยกเลิกแล้ว"}
            <br />
            กรุณาติดต่อ admin เพื่อขอ invite ใหม่
          </p>
          <Link
            href="/login"
            className="inline-block text-sm text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            ← กลับสู่หน้า Login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            สมัครสมาชิก
          </h1>
          <p className="text-sm text-zinc-500">
            ลิงก์เชิญนี้สำหรับ{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {invite.email}
            </span>
            <br />
            ใช้ได้ถึง {formatTimestamp(invite.expiresAt)}
          </p>
        </header>

        <RegisterForm token={token} email={invite.email} />

        <p className="text-center text-xs text-zinc-500">
          หลังจากลงทะเบียน admin จะตรวจสอบและอนุมัติ
          <br />
          คุณจะเข้าใช้งานได้หลังได้รับการอนุมัติ
        </p>
      </div>
    </main>
  );
}
