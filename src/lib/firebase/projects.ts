import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, PROJECTS_COLLECTION } from "./firestore-admin";
import { projectPrefix } from "@/lib/r2/client";
import type { Project, ProjectStatus } from "@/lib/types";

export type CreateProjectInput = {
  ownerUid: string;
  ownerEmail: string;
  title: string;
  customer: string;
  pages: number;
  description?: string | null;
  isbn?: string | null;
  language?: string | null;
  author?: string | null;
  edition?: string | null;
};

export type UpdateProjectInput = Partial<{
  title: string;
  customer: string;
  pages: number;
  description: string | null;
  isbn: string | null;
  language: string | null;
  author: string | null;
  edition: string | null;
  status: ProjectStatus;
  fileCount: number;
  totalSize: number;
  coverKey: string | null;
  coverContentType: string | null;
}>;

function newProjectId(): string {
  // 16 base36 chars: timestamp + random
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const id = newProjectId();
  const now = Timestamp.now();
  const project: Project = {
    id,
    title: input.title,
    customer: input.customer,
    pages: input.pages,
    description: input.description ?? null,
    isbn: input.isbn ?? null,
    language: input.language ?? null,
    author: input.author ?? null,
    edition: input.edition ?? null,
    ownerUid: input.ownerUid,
    ownerEmail: input.ownerEmail,
    status: "draft",
    r2Prefix: projectPrefix(id),
    fileCount: 0,
    totalSize: 0,
    createdAt: now,
    updatedAt: now,
    coverKey: null,
    coverContentType: null,
    coverUpdatedAt: null,
  };
  await db.collection(PROJECTS_COLLECTION).doc(id).set(project);
  return project;
}

export async function getProject(id: string): Promise<Project | null> {
  const snap = await db.collection(PROJECTS_COLLECTION).doc(id).get();
  return snap.exists ? (snap.data() as Project) : null;
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<void> {
  const data: Record<string, unknown> = {
    ...input,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.collection(PROJECTS_COLLECTION).doc(id).update(data);
}

export async function deleteProjectDoc(id: string): Promise<void> {
  await db.collection(PROJECTS_COLLECTION).doc(id).delete();
}

export async function setProjectCover(
  id: string,
  coverKey: string,
  coverContentType: string,
): Promise<void> {
  await db.collection(PROJECTS_COLLECTION).doc(id).update({
    coverKey,
    coverContentType,
    coverUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function clearProjectCover(id: string): Promise<void> {
  await db.collection(PROJECTS_COLLECTION).doc(id).update({
    coverKey: null,
    coverContentType: null,
    coverUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function listProjectsOwnedBy(uid: string): Promise<Project[]> {
  const snap = await db
    .collection(PROJECTS_COLLECTION)
    .where("ownerUid", "==", uid)
    .orderBy("updatedAt", "desc")
    .get();
  return snap.docs.map((d) => d.data() as Project);
}

export async function listAllProjects(): Promise<Project[]> {
  const snap = await db
    .collection(PROJECTS_COLLECTION)
    .orderBy("updatedAt", "desc")
    .get();
  return snap.docs.map((d) => d.data() as Project);
}
