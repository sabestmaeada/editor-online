import Link from "next/link";
import {
  PROJECT_STATUSES,
  formatProjectRole,
  type ProjectMemberRole,
  type ProjectStatus,
} from "@/lib/types";

export type ProjectsFilterValues = {
  q: string;
  status: ProjectStatus | "";
  role: ProjectMemberRole | "admin" | "";
};

type Props = {
  values: ProjectsFilterValues;
  isAdmin: boolean;
};

/** Server component — renders a GET form that submits to /projects */
export function ProjectsFilter({ values, isAdmin }: Props) {
  const hasFilters =
    values.q.length > 0 || values.status !== "" || values.role !== "";

  return (
    <form
      action="/projects"
      method="get"
      className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 sm:grid-cols-[1fr_auto_auto_auto] dark:border-zinc-800 dark:bg-zinc-900/30"
    >
      <div>
        <label htmlFor="q" className="block text-xs font-medium text-zinc-500">
          Search
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={values.q}
          placeholder="Title or customer..."
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
      </div>

      <div>
        <label
          htmlFor="status"
          className="block text-xs font-medium text-zinc-500"
        >
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={values.status}
          className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        >
          <option value="">All</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="role"
          className="block text-xs font-medium text-zinc-500"
        >
          My role
        </label>
        <select
          id="role"
          name="role"
          defaultValue={values.role}
          className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        >
          <option value="">Any</option>
          <option value="project_owner">Owner</option>
          <option value="project_editor">
            {formatProjectRole("project_editor")}
          </option>
          <option value="project_proofreader">
            {formatProjectRole("project_proofreader")}
          </option>
          <option value="project_viewer">
            {formatProjectRole("project_viewer")}
          </option>
          {isAdmin && <option value="admin">Admin access</option>}
        </select>
      </div>

      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Search
        </button>
        {hasFilters && (
          <Link
            href="/projects"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}
