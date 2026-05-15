"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { USER_ROLES, type UserRole } from "@/lib/types";

type Props = {
  uid: string;
  email: string;
  displayName: string;
};

/**
 * Approve / Reject controls shown for pending users. Approve opens an
 * inline form to pick role; reject opens an optional reason input.
 */
export function PendingActions({ uid, email, displayName }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [role, setRole] = useState<UserRole>("viewer");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedRole: role }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "approve") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500" htmlFor={`role-${uid}`}>
            Role
          </label>
          <select
            id={`role-${uid}`}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={busy}
            className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "..." : "ยืนยัน Approve"}
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }

  if (mode === "reject") {
    return (
      <div className="space-y-2">
        <input
          type="text"
          placeholder="เหตุผล (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          maxLength={280}
          className="w-48 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `ยืนยันปฏิเสธ ${displayName} (${email})?\nuser นี้จะไม่สามารถ login ได้`,
                )
              )
                handleReject();
            }}
            disabled={busy}
            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "..." : "ยืนยัน Reject"}
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex gap-2">
      <button
        type="button"
        onClick={() => setMode("approve")}
        className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
      >
        Approve
      </button>
      <button
        type="button"
        onClick={() => setMode("reject")}
        className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Reject
      </button>
    </div>
  );
}

/**
 * For rejected users: permanent delete button. Block-handled server-side
 * if the user owns projects.
 */
export function RejectedActions({ uid, email, displayName }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (
      !window.confirm(
        `⚠ ลบ ${displayName} (${email}) อย่างถาวร?\n` +
          `จะลบทั้ง Firestore profile + Firebase Auth account\n` +
          `การกระทำนี้ย้อนกลับไม่ได้`,
      )
    )
      return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        ownedProjects?: number;
      };
      if (!res.ok) {
        if (data.ownedProjects && data.ownedProjects > 0) {
          throw new Error(
            `User เป็นเจ้าของ ${data.ownedProjects} project — ย้าย ownership ก่อนลบ`,
          );
        }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="rounded-md border border-red-400 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        {busy ? "กำลังลบ..." : "🗑 ลบถาวร"}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
