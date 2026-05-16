"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TRACK_COLORS } from "@/lib/colors";
import { ChangePasswordForm } from "./change-password-form";

type Props = {
  initialDisplayName: string;
  initialColor: string;
  email: string;
  uid: string;
  role: string;
  createdAtFormatted: string;
  lastLoginAtFormatted: string;
  lastLoginIp: string | null;
};

type NameStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function PersonalSettings({
  initialDisplayName,
  initialColor,
  email,
  uid,
  role,
  createdAtFormatted,
  lastLoginAtFormatted,
  lastLoginIp,
}: Props) {
  const router = useRouter();

  // Display name state — controlled input; "savedName" tracks the last
  // value successfully persisted so we can show "Save" only when dirty.
  const [name, setName] = useState(initialDisplayName);
  const [savedName, setSavedName] = useState(initialDisplayName);
  const [nameStatus, setNameStatus] = useState<NameStatus>({ kind: "idle" });

  // Color state — independent transition since it auto-saves on click.
  const [color, setColor] = useState(initialColor);
  const [savedColor, setSavedColor] = useState(initialColor);
  const [colorError, setColorError] = useState<string | null>(null);
  const [isColorPending, startColorTransition] = useTransition();

  function handleColorChange(next: string) {
    if (next === color || next === savedColor) return;
    setColor(next);
    setColorError(null);

    startColorTransition(async () => {
      const res = await fetch("/api/users/me/color", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setColorError(data.error ?? `HTTP ${res.status}`);
        setColor(savedColor);
        return;
      }
      setSavedColor(next);
      router.refresh();
    });
  }

  async function handleNameSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === savedName) return;
    if (trimmed.length < 2 || trimmed.length > 60) {
      setNameStatus({
        kind: "error",
        message: "ชื่อต้องยาว 2-60 ตัวอักษร",
      });
      return;
    }
    setNameStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/users/me/display-name", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        displayName?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const persisted = data.displayName ?? trimmed;
      setSavedName(persisted);
      setName(persisted);
      setNameStatus({ kind: "saved" });
      router.refresh();
      // Reset the "saved" badge after a beat so subsequent edits feel fresh.
      setTimeout(() => {
        setNameStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s));
      }, 2500);
    } catch (err) {
      setNameStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ",
      });
    }
  }

  function handleNameReset() {
    setName(savedName);
    setNameStatus({ kind: "idle" });
  }

  const nameDirty = name.trim() !== savedName;
  const nameBusy = nameStatus.kind === "saving";

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">
        Personal settings
      </h2>

      {/* Display name editor — full width because the form layout reads
          better with a wider input + side-by-side buttons. */}
      <form
        onSubmit={handleNameSubmit}
        className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">ชื่อที่แสดง</h3>
          <span className="text-xs text-zinc-500">
            ปรากฏใน Nav, member list, audit log
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-stretch gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (
                nameStatus.kind === "error" ||
                nameStatus.kind === "saved"
              ) {
                setNameStatus({ kind: "idle" });
              }
            }}
            disabled={nameBusy}
            minLength={2}
            maxLength={60}
            aria-label="Display name"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
          />
          <button
            type="submit"
            disabled={nameBusy || !nameDirty}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {nameBusy ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          {nameDirty && !nameBusy && (
            <button
              type="button"
              onClick={handleNameReset}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              ยกเลิก
            </button>
          )}
        </div>
        {nameStatus.kind === "saved" && (
          <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
            ✓ บันทึกแล้ว
          </p>
        )}
        {nameStatus.kind === "error" && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            {nameStatus.message}
          </p>
        )}
      </form>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Color picker */}
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium">สีประจำตัว</h3>
            <span className="text-xs text-zinc-500">
              ใช้ใน Track Changes ของ Editor
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {TRACK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleColorChange(c)}
                disabled={isColorPending}
                aria-label={`Choose color ${c}`}
                aria-pressed={c === color}
                className={`size-7 rounded-full transition-all disabled:opacity-50 ${
                  c === color
                    ? "ring-2 ring-zinc-900 ring-offset-2 dark:ring-zinc-100 dark:ring-offset-zinc-950"
                    : "hover:scale-110"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
          {isColorPending && (
            <p className="mt-2 text-xs text-zinc-500">Saving...</p>
          )}
          {colorError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {colorError}
            </p>
          )}
        </div>

        {/* Account info */}
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="text-sm font-medium">Account</h3>
          <dl className="mt-3 space-y-2 text-xs">
            <Row label="Email" value={email} />
            <Row label="Role" value={role} mono />
            <Row label="User ID" value={uid} mono />
            <Row label="Member since" value={createdAtFormatted} />
            <Row
              label="Last login"
              value={`${lastLoginAtFormatted}${lastLoginIp ? ` · ${lastLoginIp}` : ""}`}
            />
          </dl>
        </div>
      </div>

      {/* Change password (email/password users only — auto-hidden otherwise) */}
      <div className="mt-4">
        <ChangePasswordForm />
      </div>

      {/* Privacy note */}
      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          🔒 Privacy
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            ระบบเก็บ login history (IP truncated /24 + hash, browser, country)
            สำหรับ security audit
          </li>
          <li>Retention: 90 วัน (login/logout) · 180 วัน (failed) · 2 ปี (sensitive)</li>
          <li>IP จริงไม่ถูกเก็บ — เก็บแค่ truncated + hash (ดู subnet ได้ ดู identity ไม่ได้)</li>
          <li>ระบบลบ event เก่าอัตโนมัติเมื่อเกิน retention</li>
        </ul>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd
        className={`truncate text-right text-zinc-900 dark:text-zinc-100 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
