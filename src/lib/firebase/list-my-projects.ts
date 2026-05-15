import "server-only";
import {
  listProjectsOwnedBy,
} from "./projects";
import {
  listProjectsForMember,
} from "./project-members";
import { getProject } from "./projects";
import type { ProjectWithMembership, UserProfile } from "@/lib/types";

/**
 * Server-component helper: combined list of projects this user owns
 * plus projects they've been invited to. Sorted by updatedAt desc.
 */
export async function listProjectsForUser(
  profile: UserProfile,
): Promise<ProjectWithMembership[]> {
  const [owned, memberships] = await Promise.all([
    listProjectsOwnedBy(profile.uid),
    listProjectsForMember(profile.uid),
  ]);

  const seen = new Set<string>();
  const result: ProjectWithMembership[] = [];

  for (const p of owned) {
    seen.add(p.id);
    result.push({ ...p, myRole: "owner" });
  }

  // Fetch invited project docs in parallel
  const invitedIds = memberships
    .filter((m) => !seen.has(m.projectId))
    .map((m) => m.projectId);
  const invitedDocs = await Promise.all(invitedIds.map((id) => getProject(id)));

  invitedDocs.forEach((proj, idx) => {
    if (!proj) return;
    const m = memberships.find((mm) => mm.projectId === proj.id);
    if (!m) return;
    if (seen.has(proj.id)) return;
    seen.add(proj.id);
    result.push({ ...proj, myRole: m.role });
  });

  result.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis());
  return result;
}
