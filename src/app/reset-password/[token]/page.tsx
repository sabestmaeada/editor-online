import Link from "next/link";
import { notFound } from "next/navigation";
import { getPasswordReset } from "@/lib/firebase/password-resets";
import { getUserProfile } from "@/lib/firebase/users";
import { formatTimestamp } from "@/lib/format";
import { ResetPasswordForm } from "./reset-form";

export const dynamic = "force-dynamic";

/**
 * /reset-password/[token]
 *
 * Public page. Verifies the reset token server-side and renders the
 * password-change form. After successful change, client redirects to
 * /login?reset=1 — no session is created here.
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reset = await getPasswordReset(token, { persistExpiry: true });

  // Treat all "no token" cases as 404 so we don't leak whether the token
  // was used vs never existed.
  if (!reset) notFound();

  if (reset.status !== "active") {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-semibold">ลิงก์ใช้ไม่ได้</h1>
          <p className="text-sm text-zinc-500">
            ลิงก์รีเซ็ตรหัสผ่านนี้
            {reset.status === "used" && " ถูกใช้งานไปแล้ว"}
            {reset.status === "expired" && " หมดอายุแล้ว"}
            {reset.status === "revoked" && " ถูกยกเลิกแล้ว"}
            <br />
            ติดต่อ admin เพื่อขอลิงก์ใหม่
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

  // Double-check user still active — link could have been issued while user
  // was active, then admin rejected/disabled them.
  const target = await getUserProfile(reset.uid);
  if (!target || target.status !== "active") {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-semibold">ลิงก์ใช้ไม่ได้</h1>
          <p className="text-sm text-zinc-500">
            บัญชีนี้ไม่ได้ใช้งานแล้ว — ติดต่อ admin
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
            ตั้งรหัสผ่านใหม่
          </h1>
          <p className="text-sm text-zinc-500">
            สำหรับ{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {reset.email}
            </span>
            <br />
            ลิงก์ใช้ได้ถึง {formatTimestamp(reset.expiresAt)}
          </p>
        </header>

        <ResetPasswordForm token={token} email={reset.email} />

        <p className="text-center text-xs text-zinc-500">
          หลังจากเปลี่ยนรหัสแล้ว session อื่น ๆ ทั้งหมดจะถูก logout
          และต้อง login ใหม่ทุกอุปกรณ์
        </p>
      </div>
    </main>
  );
}
