import "server-only";
import { getPromptTemplate } from "./prompt-templates";
import type { PromptTemplate, UserProfile } from "@/lib/types";

/**
 * Permission helpers for prompt templates.
 *
 * Rules:
 *   - List shared:               anyone with editor/admin role
 *   - List own personal:         the owner (or admin)
 *   - Create personal:           any editor/admin (own scope only)
 *   - Create shared:             admin only
 *   - Edit/Delete personal:      owner or admin
 *   - Edit/Delete shared:        admin only
 *
 * Quota:
 *   - Personal: 50 per editor (enforced in API layer via countPersonalTemplates)
 *   - Shared:   unlimited (admin discretion)
 */

const ROLES_THAT_CAN_USE = new Set(["admin", "editor"]);

/** Anyone with role=editor or =admin can use the template system at all
 *  (i.e. see chips in the content form, open /templates). Viewers can't. */
export function canUseTemplates(caller: UserProfile): boolean {
  return ROLES_THAT_CAN_USE.has(caller.role);
}

/** Can the caller create a personal template? Same as canUseTemplates —
 *  any editor or admin. */
export function canCreatePersonalTemplate(caller: UserProfile): boolean {
  return ROLES_THAT_CAN_USE.has(caller.role);
}

/** Only admins can create shared templates (curated for everyone). */
export function canCreateSharedTemplate(caller: UserProfile): boolean {
  return caller.role === "admin";
}

export type TemplateAccess = {
  template: PromptTemplate;
  caller: UserProfile;
  isAdmin: boolean;
  isOwner: boolean;
  canRead: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** True if the caller may change scope (personal↔shared). Admin only. */
  canChangeScope: boolean;
};

/**
 * Resolve full access info for `caller` against `templateId`. Returns
 * null if template doesn't exist OR caller has no read access (a non-admin
 * editor trying to view another editor's personal template).
 *
 * Reading rules:
 *   - shared: everyone with editor/admin role
 *   - personal: owner only (admin sees too, via isAdmin override)
 *
 * Mutation rules:
 *   - shared template: admin only
 *   - personal template: owner or admin
 */
export async function resolveTemplateAccess(
  caller: UserProfile,
  templateId: string,
): Promise<TemplateAccess | null> {
  if (!canUseTemplates(caller)) return null;

  const template = await getPromptTemplate(templateId);
  if (!template) return null;

  const isAdmin = caller.role === "admin";
  const isOwner = template.ownerUid === caller.uid;

  // Visibility check
  if (template.scope === "personal" && !isOwner && !isAdmin) {
    return null;
  }
  // Shared visible to everyone with editor/admin role (already gated above).

  // Mutation check — derived, not gating
  const canMutate =
    template.scope === "shared"
      ? isAdmin
      : isOwner || isAdmin; // personal: owner or admin

  return {
    template,
    caller,
    isAdmin,
    isOwner,
    canRead: true,
    canEdit: canMutate,
    canDelete: canMutate,
    canChangeScope: isAdmin,
  };
}
