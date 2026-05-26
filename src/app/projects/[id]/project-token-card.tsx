import type { ProjectTokenSummary } from "@/lib/firebase/token-usage";

/**
 * "ค่าใช้ Token ในโปรเจกต์" card — shown on the project detail page so
 * the owner/editor can monitor LLM cost at a glance.
 *
 * Per-user scope: counts only the events recorded under the
 * VIEWING user's `users/{uid}/tokenUsage` subcollection. Multi-user
 * projects would need a cross-member roll-up — that's a future
 * extension once we have more than the occasional single-user setup.
 */
export function ProjectTokenCard({
  summary,
}: {
  summary: ProjectTokenSummary;
}) {
  // Empty state: nothing run yet on this project (or events still
  // arriving from n8n). Show a muted placeholder rather than zeros
  // everywhere — looks intentional, not "broken".
  if (summary.eventCount === 0) {
    return (
      <section className="rounded-lg border border-dashed border-zinc-300 px-5 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        ยังไม่มีข้อมูลการใช้ Token ของโปรเจกต์นี้
        <span className="ml-1 text-xs text-zinc-400">
          (สร้าง outline หรือเนื้อหาแล้วตัวเลขจะขึ้น)
        </span>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          การใช้ Token ในโปรเจกต์นี้
        </h3>
        <span className="text-xs text-zinc-500">
          {summary.eventCount.toLocaleString()} ครั้งที่เรียก AI
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TokenStat
          label="Input"
          sublabel="prompt tokens"
          value={summary.promptTokens}
          color="sky"
        />
        <TokenStat
          label="Output"
          sublabel="completion tokens"
          value={summary.completionTokens}
          color="violet"
        />
        <TokenStat
          label="Total"
          sublabel="รวม"
          value={summary.totalTokens}
          color="emerald"
          emphasised
        />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <span className="text-xs text-zinc-500">ค่าใช้จ่ายโดยประมาณ</span>
        <span className="font-mono text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          ≈ ${formatCost(summary.estimatedCostUsd)}{" "}
          <span className="text-xs font-normal text-zinc-500">USD</span>
        </span>
      </div>
    </section>
  );
}

function TokenStat({
  label,
  sublabel,
  value,
  color,
  emphasised = false,
}: {
  label: string;
  sublabel: string;
  value: number;
  color: "sky" | "violet" | "emerald";
  emphasised?: boolean;
}) {
  const colorMap = {
    sky: "text-sky-700 dark:text-sky-400",
    violet: "text-violet-700 dark:text-violet-400",
    emerald: "text-emerald-700 dark:text-emerald-400",
  } as const;
  return (
    <div
      className={`rounded-md ${emphasised ? "bg-zinc-50 dark:bg-zinc-900" : ""} px-3 py-2`}
    >
      <div className={`text-xs font-medium uppercase ${colorMap[color]}`}>
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-zinc-500">{sublabel}</div>
    </div>
  );
}

/**
 * Format USD cost with enough precision to be useful at the low
 * end (sub-cent fractions) without overflowing the slot for larger
 * costs.
 *
 *   < $0.01 → 6 decimals (e.g. "0.001234")
 *   < $1    → 4 decimals (e.g. "0.0234")
 *   ≥ $1    → 2 decimals (e.g. "12.34")
 */
function formatCost(usd: number): string {
  if (usd < 0.01) return usd.toFixed(6);
  if (usd < 1) return usd.toFixed(4);
  return usd.toFixed(2);
}
