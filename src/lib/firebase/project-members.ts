import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  db,
  PROJECT_MEMBERS_COLLECTION,
  USERS_COLLECTION,
} from "./firestore-admin";
import type {
  Project,
  ProjectMember,
  ProjectMemberRole,
  UserProfile,
} from "@/lib/types";

function memberId(projectId: string, uid: string): string {
  return `${projectId}_${uid}`;
}

export type AddMemberInput = {
  project: Project;
  user: UserProfile;
  role: ProjectMemberRole;
  addedBy: string;
};

export async function addProjectMember(
  input: AddMemberInput,
): Promise<{ created: boolean; member: ProjectMember }> {
  const id = memberId(input.project.id, input.user.uid);
  const ref = db.collection(PROJECT_MEMBERS_COLLECTION).doc(id);
  const existing = await ref.get();

  if (existing.exists) {
    return { created: false, member: existing.data() as ProjectMember };
  }

  const now = Timestamp.now();
  const member: ProjectMember = {
    projectId: input.project.id,
    uid: input.user.uid,
    email: input.user.email,
    displayName: input.user.displayName,
    role: input.role,
    addedAt: now,
    addedBy: input.addedBy,
    lastAccessedAt: null,
  };
  await ref.set(member);
  return { created: true, member };
}

export async function removeProjectMember(
  projectId: string,
  uid: string,
): Promise<void> {
  await db
    .collection(PROJECT_MEMBERS_COLLECTION)
    .doc(memberId(projectId, uid))
    .delete();
}

export async function updateMemberRole(
  projectId: string,
  uid: string,
  newRole: ProjectMemberRole,
): Promise<{ oldRole: ProjectMemberRole; newRole: ProjectMemberRole }> {
  const ref = db
    .collection(PROJECT_MEMBERS_COLLECTION)
    .doc(memberId(projectId, uid));
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Member not found");
  const oldRole = (snap.data() as ProjectMember).role;
  if (oldRole === newRole) return { oldRole, newRole };
  await ref.update({ role: newRole });
  return { oldRole, newRole };
}

export async function getProjectMember(
  projectId: string,
  uid: string,
): Promise<ProjectMember | null> {
  const snap = await db
    .collection(PROJECT_MEMBERS_COLLECTION)
    .doc(memberId(projectId, uid))
    .get();
  return snap.exists ? (snap.data() as ProjectMember) : null;
}

export async function listMembersOfProject(
  projectId: string,
): Promise<ProjectMember[]> {
  const snap = await db
    .collection(PROJECT_MEMBERS_COLLECTION)
    .where("projectId", "==", projectId)
    .get();
  return snap.docs
    .map((d) => d.data() as ProjectMember)
    .sort((a, b) => a.addedAt.toMillis() - b.addedAt.toMillis());
}

export async function listProjectsForMember(
  uid: string,
): Promise<ProjectMember[]> {
  const snap = await db
    .collection(PROJECT_MEMBERS_COLLECTION)
    .where("uid", "==", uid)
    .get();
  return snap.docs
    .map((d) => d.data() as ProjectMember)
    .sort((a, b) => b.addedAt.toMillis() - a.addedAt.toMillis());
}

export async function bumpMemberLastAccessed(
  projectId: string,
  uid: string,
): Promise<void> {
  await db
    .collection(PROJECT_MEMBERS_COLLECTION)
    .doc(memberId(projectId, uid))
    .update({ lastAccessedAt: FieldValue.serverTimestamp() })
    .catch(() => {
      // member doc might not exist (owner ก่อน v1 ที่เพิ่ม member system) — ignore
    });
}

/**
 * Look up a UserProfile by email. Returns null if not registered.
 * Used during invite flow.
 */
export async function findUserByEmail(
  email: string,
): Promise<UserProfile | null> {
  const normalized = email.trim().toLowerCase();
  const snap = await db
    .collection(USERS_COLLECTION)
    .where("email", "==", normalized)
    .limit(1)
    .get();
  if (snap.empty) {
    // Try case-sensitive as fallback (some emails stored mixed-case)
    const snap2 = await db
      .collection(USERS_COLLECTION)
      .where("email", "==", email.trim())
      .limit(1)
      .get();
    if (snap2.empty) return null;
    return snap2.docs[0].data() as UserProfile;
  }
  return snap.docs[0].data() as UserProfile;
}
