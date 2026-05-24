import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveProjectAccess } from "@/lib/firebase/project-access";
import { getContentJob } from "@/lib/firebase/content-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; jobId: string }>;
};

// ────────────────────────────────────────────────────────────
// GET /api/projects/[id]/content/jobs/[jobId]
//
// Returns the full ContentJob doc for UI polling. Any project member
// can read (read-only) — write paths are /content/generate (auth:
// canEdit) and /content/callback (auth: shared secret).
// ────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: projectId, jobId } = await ctx.params;

  // Project access — any member can view jobs of their project.
  const access = await resolveProjectAccess(profile, projectId);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const job = await getContentJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Guard: job must belong to the project in the URL — prevents one
  // project's members from reading another project's job by guessing
  // the jobId.
  if (job.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
