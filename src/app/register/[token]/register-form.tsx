"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Status =
  | { stage: "idle" }
  | { stage: "submitting" }
  | { stage: "done" }
  | { stage: "error"; message: string };

export function RegisterForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>({ stage: "idle" });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (displayName.trim().length < 2) {
      setStatus({ stage: "error", message: "ชื่อต้องยาวอย่างน้อย 2 ตัวอักษร" });
      return;
    }
    if (password.length < 8) {
      setStatus({
        stage: "error",
        message: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร",
      });
      return;
    }
    if (password !== confirm) {
      setStatus({ stage: "error", message: "รหัสผ่านยืนยันไม่ตรงกัน" });
      return;
    }

    setStatus({ stage: "submitting" });
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, displayName, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      setStatus({ stage: "done" });
      // No client-side Firebase auth state to clear (server-side createUser).
      // Send the user to /login with a success banner; admin approves later.
      router.replace("/login?registered=1");
    } catch (err) {
      setStatus({
        stage: "error",
        message: err instanceof Error ? err.message : "Registration failed",
      });
    }
  }

  const busy = status.stage === "submitting";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          readOnly
          disabled
          className="w-full cursor-not-allowed rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="displayName" className="text-sm font-medium">
          ชื่อที่แสดง <span className="text-red-500">*</span>
        </label>
        <input
          id="displayName"
          type="text"
          required
          minLength={2}
          maxLength={60}
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={busy}
          placeholder="สมชาย ใจดี"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          รหัสผ่าน <span className="text-red-500">*</span>
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <p className="text-xs text-zinc-500">อย่างน้อย 8 ตัวอักษร</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">
          ยืนยันรหัสผ่าน <span className="text-red-500">*</span>
        </label>
        <input
          id="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
      </div>

      {status.stage === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {status.message}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || status.stage === "done"}
        className="w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy
          ? "กำลังลงทะเบียน..."
          : status.stage === "done"
            ? "สำเร็จ"
            : "สมัครสมาชิก"}
      </button>
    </form>
  );
}
