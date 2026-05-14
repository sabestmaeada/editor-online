"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { USER_ROLES, type UserRole } from "@/lib/types";
import { updateUserRoleAction } from "./actions";

type Props = {
  uid: string;
  currentRole: UserRole;
  displayName: string;
  isSelf: boolean;
};

export function RoleSelector({ uid, currentRole, displayName, isSelf }: Props) {
  const router = useRouter();
  const [value, setValue] = useState<UserRole>(currentRole);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as UserRole;
    if (next === currentRole) {
      setValue(next);
      return;
    }

    // Confirm self-demote from admin
    if (isSelf && currentRole === "admin" && next !== "admin") {
      const ok = window.confirm(
        `คุณกำลังลด role ของตัวเองจาก admin → ${next}\nคุณจะไม่สามารถเข้าหน้านี้ได้อีก ดำเนินการต่อ?`,
      );
      if (!ok) {
        e.target.value = currentRole;
        return;
      }
    }

    setValue(next);
    setError(null);

    const fd = new FormData();
    fd.set("uid", uid);
    fd.set("role", next);

    startTransition(async () => {
      const result = await updateUserRoleAction(fd);
      if (!result.ok) {
        setError(result.error);
        setValue(currentRole);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={handleChange}
        disabled={isPending}
        aria-label={`Role of ${displayName}`}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {USER_ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {isPending && (
        <span className="text-xs text-zinc-500">saving...</span>
      )}
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400" title={error}>
          ✕ {error}
        </span>
      )}
    </div>
  );
}
