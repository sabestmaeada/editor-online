import Link from "next/link";
import type { StatusCounts } from "@/lib/firebase/dashboard-queries";
import type { ProjectStatus } from "@/lib/types";

const STATUS_DISPLAY: Record<
  ProjectStatus,
  { label: string; icon: string; accent: string }
> = {
  draft: {
    label: "Draft",
    icon: "📝",
    accent: "text-zinc-600 dark:text-zinc-400",
  },
  "in-progress": {
    label: "In progress",
    icon: "🚧",
    accent: "text-blue-700 dark:text-blue-300",
  },
  review: {
    label: "Review",
    icon: "👀",
    accent: "text-amber-700 dark:text-amber-300",
  },
  completed: {
    label: "Completed",
    icon: "✅",
    accent: "text-emerald-700 dark:text-emerald-300",
  },
  archived: {
    label: "Archived",
    icon: "📦",
    accent: "text-zinc-500 dark:text-zinc-500",
  },
};

const STATUS_ORDER: ProjectStatus[] = [
  "draft",
  "in-progress",
  "review",
  "completed",
  "archived",
];

export function WorkloadOverview({ counts }: { counts: StatusCounts }) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">
        Workload overview
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        คลิกที่ตัวเลข → ดู project ที่ filter ตาม status
      </p>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {STATUS_ORDER.map((status) => {
          const count = counts[status];
          const meta = STATUS_DISPLAY[status];
          return (
            <Link
              key={status}
              href={`/projects?status=${status}`}
              className="group rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span aria-hidden>{meta.icon}</span>
                <span>{meta.label}</span>
              </div>
              <div
                className={`mt-1 text-2xl font-semibold ${meta.accent} group-hover:underline`}
              >
                {count}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
