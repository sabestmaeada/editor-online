import "server-only";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { adminApp } from "./admin";

export const db: Firestore = getFirestore(adminApp);

export const USERS_COLLECTION = "users";
export const AUTH_EVENTS_COLLECTION = "authEvents";
