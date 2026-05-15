"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  INVITABLE_PROJECT_ROLES,
  type ProjectMemberRole,
} from "@/lib/types";

// ─── Invite form ────────────────────────────────────────────
export function InviteMemberForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectMemberRole>("proofreader");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const formEmail = email.trim();
    if (!formEmail) return;

    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formEmail, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setEmail("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/30"
    >
      <div className="grow">
        <label
          htmlFor="invite-email"
          className="block text-xs font-medium text-zinc-500"
        >
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          required
          disabled={isPending}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
      </div>
      <div>
        <label
          htmlFor="invite-role"
          className="block text-xs font-medium text-zinc-500"
        >
          Role
        </label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value as ProjectMemberRole)}
          disabled={isPending}
          className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        >
          {INVITABLE_PROJECT_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {isPending ? "Inviting..." : "Invite"}
      </button>
      {error && (
        <p className="basis-full text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

// ─── Member role selector + remove ──────────────────────────
// Props are primitive fields only (not the full ProjectMember object) —
// Firestore Timestamps in the parent doc are not serializable across the
// Server/Client component boundary.
export function MemberRow({
  projectId,
  uid,
  email,
  displayName,
  role: initialRole,
  canManage,
  isOwner,
}: {
  projectId: string;
  uid: string;
  email: string;
  displayName: string;
  role: ProjectMemberRole;
  canManage: boolean;
  isOwner: boolean; // is this member the project owner?
}) {
  const router = useRouter();
  const [role, setRole] = useState<ProjectMemberRole>(initialRole);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as ProjectMemberRole;
    if (next === role) return;
    setError(null);
    setRole(next);

    startTransition(async () => {
      const res = await fetch(
        `/api/projects/${projectId}/members/${uid}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: next }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        setRole(initialRole);
        return;
      }
      router.refresh();
    });
  }

  async function handleRemove() {
    if (!confirm(`ลบ ${email} ออกจากโปรเจกต์?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/projects/${projectId}/members/${uid}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="grow text-sm">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {displayName}
        </span>{" "}
        <span className="text-zinc-500">· {email}</span>
      </div>

      {isOwner ? (
        <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          owner
        </span>
      ) : canManage ? (
        <>
          <select
            value={role}
            onChange={handleRoleChange}
            disabled={isPending}
            aria-label={`Role of ${email}`}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="editor">editor</option>
            <option value="proofreader">proofreader</option>
            <option value="viewer">viewer</option>
          </select>
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-zinc-700 dark:text-red-400 dark:hover:bg-red-950"
          >
            Remove
          </button>
        </>
      ) : (
        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {role}
        </span>
      )}

      {error && (
        <p className="basis-full text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Delete project button ──────────────────────────────────
export function DeleteProjectButton({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    const confirmText = window.prompt(
      `ลบโปรเจกต์ "${projectTitle}" ถาวร? ไฟล์ทั้งหมดใน R2 จะถูกลบ.\nพิมพ์ "DELETE" เพื่อยืนยัน:`,
    );
    if (confirmText !== "DELETE") return;

    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      router.push("/projects");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        {isPending ? "Deleting..." : "Delete project"}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </>
  );
}

// ─── Status selector ───────────────────────────────────────
export function StatusSelector({
  projectId,
  current,
}: {
  projectId: string;
  current: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === value) return;
    setValue(next);

    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setValue(current);
        return;
      }
      router.refresh();
    });
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={isPending}
      aria-label="Project status"
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <option value="draft">draft</option>
      <option value="in-progress">in-progress</option>
      <option value="review">review</option>
      <option value="completed">completed</option>
      <option value="archived">archived</option>
    </select>
  );
}
