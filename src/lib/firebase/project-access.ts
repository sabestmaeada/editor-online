import "server-only";
import { getProject } from "./projects";
import { getProjectMember } from "./project-members";
import type { Project, ProjectMember, UserProfile } from "@/lib/types";

export type ProjectAccess = {
  caller: UserProfile;
  project: Project;
  membership: ProjectMember | null;
  isAdmin: boolean;
  isOwner: boolean;
  canManage: boolean; // metadata edit, member admin, delete
  canEdit: boolean; // edit files (v2 — same as canManage in v1)
  canDownload: boolean;
};

/**
 * Resolve full access info for a caller against a project.
 * Returns null when the project doesn't exist OR the caller has no access at all.
 */
export async function resolveProjectAccess(
  caller: UserProfile,
  projectId: string,
): Promise<ProjectAccess | null> {
  const project = await getProject(projectId);
  if (!project) return null;

  const isAdmin = caller.role === "admin";
  const isOwner = project.ownerUid === caller.uid;

  const membership = isOwner
    ? null
    : await getProjectMember(projectId, caller.uid);

  // No access at all if not admin, not owner, and not a member
  if (!isAdmin && !isOwner && !membership) return null;

  const memberRole = membership?.role;
  const canEdit =
    isAdmin || isOwner || memberRole === "editor";
  const canManage = isAdmin || isOwner;
  const canDownload = isAdmin || isOwner || membership !== null;

  return {
    caller,
    project,
    membership,
    isAdmin,
    isOwner,
    canManage,
    canEdit,
    canDownload,
  };
}
