"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TRACK_COLORS } from "@/lib/colors";

type Props = {
  initialColor: string;
  email: string;
  uid: string;
  role: string;
  createdAtFormatted: string;
  lastLoginAtFormatted: string;
  lastLoginIp: string | null;
};

export function PersonalSettings({
  initialColor,
  email,
  uid,
  role,
  createdAtFormatted,
  lastLoginAtFormatted,
  lastLoginIp,
}: Props) {
  const router = useRouter();
  const [color, setColor] = useState(initialColor);
  const [savedColor, setSavedColor] = useState(initialColor);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleColorChange(next: string) {
    if (next === color || next === savedColor) return;
    setColor(next);
    setError(null);

    startTransition(async () => {
      const res = await fetch("/api/users/me/color", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        setColor(savedColor);
        return;
      }
      setSavedColor(next);
      router.refresh();
    });
  }

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">
        Personal settings
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
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
                disabled={isPending}
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
          {isPending && (
            <p className="mt-2 text-xs text-zinc-500">Saving...</p>
          )}
          {error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {error}
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
