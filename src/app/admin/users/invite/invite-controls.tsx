"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { InviteStatus } from "@/lib/types";

type CreateStatus =
  | { stage: "idle" }
  | { stage: "submitting" }
  | { stage: "done"; url: string; email: string; copied: boolean }
  | { stage: "error"; message: string };

export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<CreateStatus>({ stage: "idle" });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ stage: "submitting" });
    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        invite?: { token: string; email: string };
        error?: string;
      };
      if (!res.ok || !data.invite) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const url = `${window.location.origin}/register/${data.invite.token}`;
      setStatus({
        stage: "done",
        url,
        email: data.invite.email,
        copied: false,
      });
      setEmail("");
      router.refresh();
    } catch (err) {
      setStatus({
        stage: "error",
        message: err instanceof Error ? err.message : "Failed to invite",
      });
    }
  }

  async function copyToClipboard() {
    if (status.stage !== "done") return;
    try {
      await navigator.clipboard.writeText(status.url);
      setStatus({ ...status, copied: true });
      setTimeout(() => {
        setStatus((s) => (s.stage === "done" ? { ...s, copied: false } : s));
      }, 2000);
    } catch {
      // ignore — user can copy manually
    }
  }

  const busy = status.stage === "submitting";

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          required
          placeholder="user@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "กำลังสร้าง..." : "สร้าง invite"}
        </button>
      </form>

      {status.stage === "error" && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {status.message}
        </p>
      )}

      {status.stage === "done" && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
            ✓ สร้าง invite สำหรับ {status.email} แล้ว
          </p>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
            Copy link ด้านล่างแล้วส่งให้ user (อายุ 7 วัน)
          </p>
          <div className="mt-2 flex gap-2">
            <code className="flex-1 break-all rounded border border-emerald-300 bg-white px-2 py-1.5 text-xs text-zinc-800 dark:border-emerald-800 dark:bg-zinc-900 dark:text-zinc-200">
              {status.url}
            </code>
            <button
              type="button"
              onClick={copyToClipboard}
              className="shrink-0 rounded border border-emerald-400 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-700 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-zinc-800"
            >
              {status.copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function InviteRowActions({
  token,
  status,
  email,
}: {
  token: string;
  status: InviteStatus;
  email: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      const url = `${window.location.origin}/register/${token}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function revoke() {
    if (
      !window.confirm(
        `ยกเลิก invite สำหรับ ${email}?\nผู้รับลิงก์เก่าจะไม่สามารถใช้ลงทะเบียนได้`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/invite/${token}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  if (status !== "active") {
    return <span className="text-zinc-400">—</span>;
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="inline-flex gap-2">
        <button
          type="button"
          onClick={copyLink}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {copied ? "✓" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={revoke}
          disabled={busy}
          className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          {busy ? "..." : "Revoke"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
