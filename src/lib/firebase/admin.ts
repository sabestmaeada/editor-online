import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

function buildApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

export const adminApp: App = buildApp();
export const adminAuth: Auth = getAuth(adminApp);

export const SESSION_COOKIE_NAME = "__session";
export const SESSION_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 5;
