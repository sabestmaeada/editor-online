import "server-only";
import {
  listAllProjects,
  listProjectsOwnedBy,
  getProject,
} from "./projects";
import { listProjectsForMember } from "./project-members";
import type { ProjectWithMembership, UserProfile } from "@/lib/types";

/**
 * Server-component helper: list of projects this user can access.
 * - Admin: all projects in the system (with their explicit role if any, else null)
 * - Others: projects they own + projects they've been invited to
 *
 * Sorted by updatedAt desc.
 */
export async function listProjectsForUser(
  profile: UserProfile,
): Promise<ProjectWithMembership[]> {
  if (profile.role === "admin") {
    return listAllProjectsAsAdmin(profile);
  }

  return listOwnedAndInvited(profile);
}

async function listAllProjectsAsAdmin(
  profile: UserProfile,
): Promise<ProjectWithMembership[]> {
  const [all, memberships] = await Promise.all([
    listAllProjects(),
    listProjectsForMember(profile.uid),
  ]);

  const myMembershipByProject = new Map(
    memberships.map((m) => [m.projectId, m.role]),
  );

  // listAllProjects already sorts by updatedAt desc
  return all.map((p) => {
    if (p.ownerUid === profile.uid) {
      return { ...p, myRole: "project_owner" as const };
    }
    const role = myMembershipByProject.get(p.id) ?? null;
    return { ...p, myRole: role };
  });
}

async function listOwnedAndInvited(
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
    result.push({ ...p, myRole: "project_owner" });
  }

  const invitedIds = memberships
    .filter((m) => !seen.has(m.projectId))
    .map((m) => m.projectId);
  const invitedDocs = await Promise.all(invitedIds.map((id) => getProject(id)));

  invitedDocs.forEach((proj) => {
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
