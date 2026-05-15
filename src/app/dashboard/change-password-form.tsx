"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { useAuth } from "@/lib/firebase/auth-context";

const MIN_LENGTH = 8;

type Status =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "success" };

export function ChangePasswordForm() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  // Only email/password users can change password.
  // Google-only users don't have a Firebase password.
  const hasPasswordProvider = user?.providerData.some(
    (p) => p.providerId === "password",
  );

  if (!user || !hasPasswordProvider) {
    return null;
  }

  function reset() {
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setStatus({ kind: "idle" });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "idle" });

    if (!user || !user.email) {
      setStatus({ kind: "error", message: "Email not available" });
      return;
    }
    if (newPw.length < MIN_LENGTH) {
      setStatus({
        kind: "error",
        message: `รหัสใหม่ต้องยาวอย่างน้อย ${MIN_LENGTH} ตัวอักษร`,
      });
      return;
    }
    if (newPw !== confirmPw) {
      setStatus({ kind: "error", message: "รหัสใหม่ไม่ตรงกัน" });
      return;
    }
    if (newPw === currentPw) {
      setStatus({
        kind: "error",
        message: "รหัสใหม่ต้องไม่เหมือนรหัสเดิม",
      });
      return;
    }

    const email = user.email;

    startTransition(async () => {
      try {
        // 1. Reauthenticate with current password
        const credential = EmailAuthProvider.credential(email, currentPw);
        await reauthenticateWithCredential(user, credential);

        // 2. Update password
        await updatePassword(user, newPw);

        // 3. Audit log (best-effort)
        fetch("/api/auth/password-changed", { method: "POST" }).catch(
          () => {},
        );

        setStatus({ kind: "success" });
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : "";
        let message = err instanceof Error ? err.message : "เปลี่ยนรหัสไม่สำเร็จ";
        if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
          message = "รหัสปัจจุบันไม่ถูกต้อง";
        } else if (code === "auth/weak-password") {
          message = "รหัสใหม่อ่อนเกินไป — ใช้ตัวอักษร + ตัวเลข ≥8 ตัว";
        } else if (code === "auth/requires-recent-login") {
          message = "Session เก่าเกินไป — กรุณา logout แล้ว login ใหม่ก่อนเปลี่ยนรหัส";
        } else if (code === "auth/too-many-requests") {
          message = "พยายามหลายครั้งเกินไป — รอสักครู่แล้วลองใหม่";
        }
        setStatus({ kind: "error", message });
      }
    });
  }

  if (!expanded) {
    return (
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">🔒 รหัสผ่าน</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              เปลี่ยนรหัสผ่านสำหรับ login email/password
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">🔒 เปลี่ยนรหัสผ่าน</h3>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            reset();
          }}
          className="text-xs text-zinc-500 hover:underline"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <PasswordField
          id="current-pw"
          label="รหัสปัจจุบัน"
          value={currentPw}
          onChange={setCurrentPw}
          autoComplete="current-password"
          required
          disabled={isPending}
        />
        <PasswordField
          id="new-pw"
          label={`รหัสใหม่ (≥${MIN_LENGTH} ตัวอักษร)`}
          value={newPw}
          onChange={setNewPw}
          autoComplete="new-password"
          required
          disabled={isPending}
          minLength={MIN_LENGTH}
        />
        <PasswordField
          id="confirm-pw"
          label="ยืนยันรหัสใหม่"
          value={confirmPw}
          onChange={setConfirmPw}
          autoComplete="new-password"
          required
          disabled={isPending}
          minLength={MIN_LENGTH}
        />

        {status.kind === "error" && (
          <p className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {status.message}
          </p>
        )}
        {status.kind === "success" && (
          <p className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            ✓ เปลี่ยนรหัสผ่านสำเร็จ — ครั้งหน้าใช้รหัสใหม่ login
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={reset}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isPending ? "Updating..." : "เปลี่ยนรหัส"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  required,
  disabled,
  minLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        minLength={minLength}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      />
    </div>
  );
}
