import "server-only";
import { redirect } from "next/navigation";
import { requireUserProfile } from "./require-profile";
import type { UserProfile, UserRole } from "@/lib/types";

export async function requireRole(
  redirectPath: string,
  allowed: UserRole[],
): Promise<UserProfile> {
  const profile = await requireUserProfile(redirectPath);
  if (!allowed.includes(profile.role)) {
    redirect("/dashboard");
  }
  return profile;
}

export async function requireAdmin(redirectPath: string): Promise<UserProfile> {
  return requireRole(redirectPath, ["admin"]);
}
