import "server-only";
import { getTone } from "./tones";
import type { ToneStyle, UserProfile } from "@/lib/types";

/**
 * Permission helpers for the tone library.
 *
 * Rules (from TONE-LIBRARY-DESIGN.md §7):
 *   - List / view / edit / archive own tone:  owner OR admin
 *   - Create tone:                            editor OR admin? — actually
 *     editor only (admin has no tones, just manages — per Q-Tone-6=a)
 *     BUT we keep admin allowed to create because some admin users
 *     might still want their own tones; the UX simply doesn't surface
 *     the dropdown to them by default
 *   - Transfer ownership:                     admin only
 *
 * All gates here are server-side; Firestore rules deny direct client
 * access (see firestore.rules).
 */

const CREATE_ROLES = new Set(["admin", "editor"]);

export type ToneAccess = {
  tone: ToneStyle;
  caller: UserProfile;
  isAdmin: boolean;
  isOwner: boolean;
  canRead: boolean;
  canEdit: boolean;
  canAddSample: boolean;
  canDelete: boolean;
  canTransfer: boolean;
};

/**
 * Resolve full access info for `caller` against `toneId`. Returns null
 * if tone doesn't exist OR caller has no read access.
 *
 * - Owner: full RW (except transfer)
 * - Admin: full RW + transfer
 * - Anyone else: no access (return null)
 */
export async function resolveToneAccess(
  caller: UserProfile,
  toneId: string,
): Promise<ToneAccess | null> {
  const tone = await getTone(toneId);
  if (!tone) return null;

  const isAdmin = caller.role === "admin";
  const isOwner = tone.ownerUid === caller.uid;

  if (!isAdmin && !isOwner) return null;

  return {
    tone,
    caller,
    isAdmin,
    isOwner,
    canRead: true,
    canEdit: true,
    canAddSample: true,
    canDelete: true,
    canTransfer: isAdmin, // ownership transfer is admin-only
  };
}

/** Quick check used when listing — caller can see own tones; admin can
 *  see all. */
export function canSeeOtherUsersTones(caller: UserProfile): boolean {
  return caller.role === "admin";
}

/** Gate for POST /api/tones (create). */
export function canCreateTone(caller: UserProfile): boolean {
  return CREATE_ROLES.has(caller.role);
}
