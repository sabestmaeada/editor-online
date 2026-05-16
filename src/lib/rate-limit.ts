import "server-only";
import { NextResponse } from "next/server";

/**
 * In-memory rate limiter — fixed-window per `key`.
 *
 * Backing store is a `Map` in the Node.js process memory of the current
 * Vercel function instance. This means:
 *
 *   - Counters survive across requests on a WARM instance (most useful case
 *     against brute-force: many attempts in a short burst all land on the
 *     same warm instance and get caught).
 *   - Counters DO reset on cold start. An attacker who paces requests slowly
 *     across cold starts can evade — but at that pace it's no longer brute
 *     force, and Firebase's own rate-limits kick in for auth.
 *   - Counters are per-instance. If Vercel scales to multiple instances,
 *     the effective limit is `limit × instanceCount`. For a small internal
 *     team this is acceptable.
 *
 * Upgrade path: swap `checkRateLimit` body to call `@upstash/ratelimit`
 * (Redis-backed, distributed) without changing any call site. The signature
 * stays the same.
 */

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
};

type Bucket = { count: number; resetAt: number };

// Module-level state. Reset on cold start (intentional — see header comment).
const buckets = new Map<string, Bucket>();

// Lazy GC: every minute, sweep expired buckets so the Map doesn't grow
// unbounded over a long-lived warm instance. Only sweeps when called — no
// background timer (which would never fire on Vercel anyway).
let lastGcAt = 0;
function maybeGc(now: number) {
  if (now - lastGcAt < 60_000) return;
  lastGcAt = now;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

/**
 * Check & increment a counter for `key`. Returns whether the caller is
 * within the limit. The window is `windowMs` from the FIRST request in
 * the window (fixed-window, not sliding).
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  maybeGc(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }

  existing.count++;
  const remaining = Math.max(0, limit - existing.count);
  return {
    allowed: existing.count <= limit,
    limit,
    remaining,
    resetAt: existing.resetAt,
  };
}

/**
 * Build a standard 429 response with `Retry-After` and X-RateLimit headers.
 * Returns null when the request IS allowed — call sites use the early-return
 * pattern:
 *
 *   const limit = checkRateLimit(...);
 *   const limited = rateLimitResponse(limit);
 *   if (limited) return limited;
 */
export function rateLimitResponse(
  result: RateLimitResult,
): NextResponse | null {
  if (result.allowed) return null;
  const retryAfterSec = Math.max(
    1,
    Math.ceil((result.resetAt - Date.now()) / 1000),
  );
  return NextResponse.json(
    {
      error: "Too many requests — please try again later",
      retryAfter: retryAfterSec,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
      },
    },
  );
}

// ─── Preset limits ──────────────────────────────────────────
// One place to tune per-endpoint budgets. Numbers are conservative for an
// internal-team tool — easy to bump up if legitimate traffic hits them.
//
// Format: { limit: N, windowMs: T } — at most N requests per T ms.

export const RATE_LIMITS = {
  /** Login / session creation. Firebase has its own ~5/min limit; we add a
   *  higher floor to catch broader flooding before Firebase even sees it. */
  authSession: { limit: 10, windowMs: 60_000 },
  /** Registration via invite token. Low — should never be hammered. */
  authRegister: { limit: 5, windowMs: 60_000 },
  /** Public token verification (invite + reset GET). Higher limit because
   *  the form may re-fetch on display, but still bounded against scanning. */
  tokenVerify: { limit: 30, windowMs: 60_000 },
  /** Password reset consumption. */
  passwordReset: { limit: 5, windowMs: 60_000 },
} as const;
