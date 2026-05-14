"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/firebase/require-role";
import {
  countAdmins,
  updateUserRole as updateUserRoleInFirestore,
} from "@/lib/firebase/admin-users";
import { getUserProfile } from "@/lib/firebase/users";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { USER_ROLES, type UserRole } from "@/lib/types";

export type RoleActionResult =
  | { ok: true }
  | { ok: false; error: string };

function isValidRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export async function updateUserRoleAction(
  formData: FormData,
): Promise<RoleActionResult> {
  const targetUid = String(formData.get("uid") ?? "");
  const newRoleRaw = String(formData.get("role") ?? "");

  if (!targetUid) return { ok: false, error: "Missing uid" };
  if (!isValidRole(newRoleRaw)) {
    return { ok: false, error: `Invalid role: ${newRoleRaw}` };
  }
  const newRole: UserRole = newRoleRaw;

  // ─── Auth: caller must be admin ────────────────────────────
  const caller = await requireAdmin("/admin/users");

  // ─── Load target ───────────────────────────────────────────
  const target = await getUserProfile(targetUid);
  if (!target) return { ok: false, error: "Target user not found" };

  if (target.role === newRole) {
    return { ok: true }; // no-op
  }

  // ─── Safety: prevent demoting the last admin ───────────────
  if (target.role === "admin" && newRole !== "admin") {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      return {
        ok: false,
        error: "Cannot demote the last admin. Promote another admin first.",
      };
    }
  }

  // ─── Apply change ──────────────────────────────────────────
  const { oldRole } = await updateUserRoleInFirestore(targetUid, newRole);

  // ─── Audit log ─────────────────────────────────────────────
  const hdrs = await headers();
  await logAuthEvent({
    headers: hdrs,
    uid: targetUid,
    email: target.email,
    eventType: "role-change",
    provider: "system",
    success: true,
    oldRole,
    newRole,
    changedBy: caller.uid,
  }).catch(() => {});

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${targetUid}`);
  return { ok: true };
}
