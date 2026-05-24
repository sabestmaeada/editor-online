import "server-only";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { adminApp } from "./admin";

export const db: Firestore = getFirestore(adminApp);

// Allow `undefined` values in document writes — they get silently
// dropped instead of throwing. Without this, optional response fields
// from external sources (e.g. n8n meta.model / meta.tokensUsed when
// the LLM workflow doesn't bother including them) crash the whole
// write with "Cannot use undefined as a Firestore value".
//
// `settings()` can only be called once per Firestore instance, before
// the first read/write. In Next.js dev mode, HMR may re-import this
// module while the underlying instance is already in use — the second
// call throws "Settings can no longer be changed". That's fine; the
// initial settings from the first load remain active, so we swallow.
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch {
  /* HMR re-import — already configured */
}

export const USERS_COLLECTION = "users";
export const AUTH_EVENTS_COLLECTION = "authEvents";
export const PROJECTS_COLLECTION = "projects";
export const PROJECT_MEMBERS_COLLECTION = "projectMembers";
export const INVITES_COLLECTION = "invites";
export const PASSWORD_RESETS_COLLECTION = "passwordResets";
export const TONES_COLLECTION = "tones";
export const TONE_SAMPLES_SUB = "samples"; // sub-collection under tones/{id}
