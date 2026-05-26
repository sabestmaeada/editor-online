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
  // `canEdit` covers *content-level* mutations: editing the outline
  // tree, running outline / content gen (burns LLM tokens), retry,
  // assemble, deleting content jobs, replacing project files.
  //
  // Admin is intentionally EXCLUDED here even though they pass the
  // canDownload/canManage gates. Rationale:
  //   - Content is the owner's creative work; admin shouldn't silently
  //     mutate it without being on the member list.
  //   - LLM tokens are attributed to whoever fires the gen — admin
  //     running gens on someone else's project would charge the
  //     admin's user, not the owner. Confusing for billing/audit.
  //   - If admin truly needs to edit, the legitimate path is to
  //     invite themselves as a project_editor member (visible in the
  //     members list → audit-friendly).
  const canEdit =
    isOwner || memberRole === "project_editor";
  // `canManage` is system-level: rename / change status / manage
  // members / delete project / transfer ownership. Admin keeps full
  // power here for cleanup + administration duties.
  const canManage = isAdmin || isOwner;
  // `canDownload` lets admin + any project member view + download.
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
