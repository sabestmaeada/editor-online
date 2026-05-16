"use client";

import { useState } from "react";

type Status =
  | { stage: "idle" }
  | { stage: "submitting" }
  | { stage: "done"; url: string; copied: boolean; autoRevokedPrior: number }
  | { stage: "error"; message: string };

/**
 * Admin action — "Issue password reset link" for the target user. Renders
 * inline next to the role selector on /admin/users/[uid].
 *
 * Output is the full URL (`/reset-password/<token>`) that admin can copy
 * and forward to the user via LINE/email manually.
 */
export function ResetLinkButton({
  uid,
  displayName,
  email,
  disabled,
}: {
  uid: string;
  displayName: string;
  email: string;
  /** Disabled if the target user is not "active". */
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>({ stage: "idle" });

  async function handleIssue() {
    if (
      !window.confirm(
        `ออก reset link สำหรับ ${displayName} (${email})?\n` +
          `ลิงก์ก่อนหน้า (ถ้ามี) จะถูก revoke อัตโนมัติ`,
      )
    )
      return;

    setStatus({ stage: "submitting" });
    try {
      const res = await fetch(`/api/admin/users/${uid}/reset-link`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reset?: { token: string; expiresAt: number };
        autoRevokedPrior?: number;
        error?: string;
      };
      if (!res.ok || !data.reset) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const url = `${window.location.origin}/reset-password/${data.reset.token}`;
      setStatus({
        stage: "done",
        url,
        copied: false,
        autoRevokedPrior: data.autoRevokedPrior ?? 0,
      });
    } catch (err) {
      setStatus({
        stage: "error",
        message: err instanceof Error ? err.message : "Failed",
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
      // user can copy manually
    }
  }

  if (status.stage === "done") {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
            ✓ สร้าง reset link แล้ว (อายุ 24 ชั่วโมง)
          </p>
          {status.autoRevokedPrior > 0 && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              ⓘ Revoked {status.autoRevokedPrior} ลิงก์เก่าอัตโนมัติ
            </p>
          )}
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
            Copy ลิงก์ส่งให้ user ทาง LINE/email
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
        <button
          type="button"
          onClick={() => setStatus({ stage: "idle" })}
          className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ออก link ใหม่
        </button>
      </div>
    );
  }

  const busy = status.stage === "submitting";

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleIssue}
        disabled={busy || disabled}
        title={
          disabled
            ? "ออก reset link ได้เฉพาะ user ที่ active เท่านั้น"
            : undefined
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        🔑 {busy ? "กำลังสร้าง..." : "ออก reset link"}
      </button>
      {status.stage === "error" && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {status.message}
        </p>
      )}
    </div>
  );
}
