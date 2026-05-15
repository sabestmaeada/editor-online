"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <p className="text-sm text-zinc-500">Loading...</p>
    </main>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/dashboard";

  // Pre-login banners — derived from URL params set by /register success,
  // proxy redirects with stale sessions, or require-profile redirects when
  // a user's status changes mid-session.
  const justRegistered = searchParams.get("registered") === "1";
  const statusError = searchParams.get("error"); // e.g. status-pending

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);

  async function exchangeSession(user: User) {
    const idToken = await user.getIdToken();
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (res.ok) return;

    // Server rejected our cookie creation — most often because the user's
    // status is not "active". Sign the user out of Firebase so the next
    // attempt doesn't reuse the same in-memory user object.
    let serverMessage = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) serverMessage = data.error;
    } catch {
      // ignore
    }
    await signOut(auth).catch(() => {});
    throw new Error(serverMessage);
  }

  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("email");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await exchangeSession(cred.user);
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setBusy("google");
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await exchangeSession(cred.user);
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(null);
    }
  }

  const statusErrorMessage = (() => {
    if (!statusError) return null;
    if (statusError === "status-pending")
      return "บัญชีของคุณรออนุมัติจาก admin";
    if (statusError === "status-rejected")
      return "บัญชีของคุณถูกปฏิเสธ — กรุณาติดต่อ admin";
    if (statusError === "status-disabled")
      return "บัญชีของคุณถูกระงับการใช้งาน";
    return null;
  })();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-zinc-500">
            Access your online editor account.
          </p>
        </header>

        {justRegistered && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            ✓ ลงทะเบียนสำเร็จ — รอ admin อนุมัติก่อนเข้าใช้งาน
            <br />
            <span className="text-xs">
              คุณจะ login ได้หลังได้รับการอนุมัติ
            </span>
          </div>
        )}

        {statusErrorMessage && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            ⚠ {statusErrorMessage}
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy !== null}
            className="w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy === "email" ? "Signing in..." : "Sign in with email"}
          </button>
        </form>

        {/* Google login — hidden until ready. To re-enable, uncomment block below. */}
        {/*
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            or
          </span>
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={busy !== null}
          className="w-full rounded-md border border-zinc-300 bg-white py-2 text-sm font-medium transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          {busy === "google" ? "Signing in..." : "Continue with Google"}
        </button>
        */}
      </div>
    </main>
  );
}
