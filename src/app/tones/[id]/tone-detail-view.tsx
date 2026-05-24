"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StyleProfile } from "@/lib/types";

type ToneJson = {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  name: string;
  description: string;
  sampleCount: number;
  totalChunks: number;
  status: "active" | "archived";
  styleProfile: StyleProfile | null;
  systemPrompt: string | null;
  lastAnalyzedAtFormatted: string | null;
};

type SampleJson = {
  id: string;
  textPreview: string;
  textLength: number;
  source: "paste" | "file";
  fileName: string | null;
  uploadedByEmail: string;
  uploadedAtFormatted: string;
  uploadedAtRelative: string;
  qdrantPointCount: number;
};

type Props = {
  tone: ToneJson;
  samples: SampleJson[];
  permissions: {
    canEdit: boolean;
    canAddSample: boolean;
    canDelete: boolean;
    canTransfer: boolean;
  };
};

export function ToneDetailView({ tone, samples, permissions }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tone.name);
  const [description, setDescription] = useState(tone.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveMetadata() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tones/${tone.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error || `บันทึกไม่สำเร็จ`);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เครือข่ายมีปัญหา");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive() {
    const newStatus = tone.status === "active" ? "archived" : "active";
    if (
      !window.confirm(
        newStatus === "archived"
          ? "Archive สำนวนนี้? (ซ่อนจาก list ปกติ)"
          : "Restore สำนวนกลับสู่ active?",
      )
    )
      return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tones/${tone.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error || `เปลี่ยน status ไม่ได้`);
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function deleteTone() {
    if (
      !window.confirm(
        `ลบสำนวน "${tone.name}" + ${tone.sampleCount} samples แบบถาวร? ทำซ้ำไม่ได้`,
      )
    )
      return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tones/${tone.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error || `ลบไม่สำเร็จ`);
        return;
      }
      router.push("/tones");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSample(sampleId: string, preview: string) {
    if (!window.confirm(`ลบ sample "${preview.slice(0, 40)}…"?`)) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/tones/${tone.id}/samples/${sampleId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error || `ลบไม่สำเร็จ`);
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-3">
      {/* Left: metadata + style profile */}
      <section className="space-y-6 lg:col-span-2">
        {/* Metadata card */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">ข้อมูลสำนวน</h2>
            {permissions.canEdit && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                แก้ไข
              </button>
            )}
          </div>

          {editing ? (
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  ชื่อ
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  คำอธิบาย
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  className={inputClass + " resize-y"}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveMetadata}
                  disabled={saving || !name.trim()}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {saving ? "..." : "บันทึก"}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setName(tone.name);
                    setDescription(tone.description);
                  }}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-zinc-500">ชื่อ</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                  {tone.name}
                </dd>
              </div>
              {tone.description && (
                <div>
                  <dt className="text-xs text-zinc-500">คำอธิบาย</dt>
                  <dd className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                    {tone.description}
                  </dd>
                </div>
              )}
              <div className="flex gap-4 pt-2 text-xs text-zinc-500">
                <span>
                  {tone.sampleCount} samples · {tone.totalChunks} chunks
                </span>
                {tone.lastAnalyzedAtFormatted && (
                  <span>analyzed {tone.lastAnalyzedAtFormatted}</span>
                )}
              </div>
            </dl>
          )}
        </div>

        {/* Style profile card */}
        {tone.styleProfile && (
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold">
              🎨 สไตล์ที่วิเคราะห์ได้
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {Object.entries(tone.styleProfile)
                .filter(([k]) => k !== "signature_phrases")
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-zinc-500">{labelFor(k)}</dt>
                    <dd className="text-zinc-700 dark:text-zinc-300">
                      {String(v)}
                    </dd>
                  </div>
                ))}
            </dl>
            {tone.styleProfile.signature_phrases.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-zinc-500">
                  วลีเอกลักษณ์
                </p>
                <ul className="flex flex-wrap gap-2">
                  {tone.styleProfile.signature_phrases.map((p, i) => (
                    <li
                      key={i}
                      className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      &ldquo;{p}&rdquo;
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* System prompt preview */}
        {tone.systemPrompt && (
          <details className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <summary className="cursor-pointer p-4 text-sm font-medium">
              📋 System prompt (สำหรับ AI)
            </summary>
            <pre className="border-t border-zinc-200 p-4 text-xs whitespace-pre-wrap text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              {tone.systemPrompt}
            </pre>
          </details>
        )}
      </section>

      {/* Right: samples + actions */}
      <section className="space-y-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Samples ({samples.length})</h2>
            {permissions.canAddSample && (
              <Link
                href={`/tones/${tone.id}/samples/new`}
                className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
              >
                + เพิ่ม
              </Link>
            )}
          </div>

          {samples.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">
              ยังไม่มี sample
            </p>
          ) : (
            <ul className="space-y-2">
              {samples.map((s) => (
                <li
                  key={s.id}
                  className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                >
                  <p className="line-clamp-2 text-zinc-700 dark:text-zinc-300">
                    {s.textPreview}
                    {s.textLength > 200 && "…"}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                    <span>
                      {s.textLength} chars · {s.qdrantPointCount} chunks
                      {s.source === "file" && s.fileName && (
                        <> · 📎 {s.fileName}</>
                      )}
                    </span>
                    {permissions.canDelete && (
                      <button
                        onClick={() => deleteSample(s.id, s.textPreview)}
                        disabled={saving}
                        className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                      >
                        ลบ
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">
                    {s.uploadedByEmail} · {s.uploadedAtRelative}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Danger zone */}
        {permissions.canDelete && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/30">
            <h2 className="text-sm font-semibold text-red-900 dark:text-red-300">
              ⚠ Danger zone
            </h2>
            <div className="mt-3 space-y-2">
              <button
                onClick={toggleArchive}
                disabled={saving}
                className="w-full rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:bg-zinc-950 dark:text-amber-300"
              >
                {tone.status === "active" ? "Archive" : "Restore"} สำนวนนี้
              </button>
              <button
                onClick={deleteTone}
                disabled={saving}
                className="w-full rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-zinc-950 dark:text-red-300"
              >
                ลบถาวร (สำนวน + ทุก sample)
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}
      </section>
    </div>
  );
}

function labelFor(key: string): string {
  const labels: Record<string, string> = {
    tone: "Tone",
    reader_address: "เรียกผู้อ่านว่า",
    pov: "มุมมอง",
    vocabulary_level: "ระดับคำศัพท์",
    sentence_style: "สไตล์ประโยค",
    uses_examples: "การยกตัวอย่าง",
    uses_metaphors: "การใช้คำเปรียบ",
    humor_level: "ระดับความตลก",
  };
  return labels[key] ?? key;
}

const inputClass =
  "block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
