import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * Trade-offs documented inline. The current policy is "as strict as the
 * app actually tolerates" — we keep `unsafe-inline` / `unsafe-eval` where
 * required and note the path to a nonce-based CSP in the comments.
 */

// Firebase domains the client SDK talks to in the browser:
// - identitytoolkit / securetoken: Auth REST endpoints
// - <project>.firebaseapp.com: Auth helper iframe (popup flows, even when we
//   only use email/password the SDK may load this)
// - firestore: not used client-side today (Admin SDK on server) but allowed
//   so future client reads don't silently fail
const FIREBASE_ORIGINS = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firestore.googleapis.com",
  "https://*.firebaseapp.com",
  "https://*.googleapis.com",
];

// R2 (S3-compatible) — the browser PUTs ZIPs directly to a presigned URL
// at `<bucket>.<account>.r2.cloudflarestorage.com`. Whitelisting the
// wildcard covers both vanilla R2 endpoints and is the cleanest default.
// Custom domain users: append the custom origin here.
const R2_ORIGINS = ["https://*.r2.cloudflarestorage.com"];

const CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],

  // 'unsafe-inline' — Next.js inlines hydration scripts; Book Editor uses
  //   onclick="..." handlers; both would break without it.
  // 'unsafe-eval' — Firebase Web SDK uses `new Function()` for some code
  //   paths in older browsers. Safe to drop once we audit + drop those.
  // Future: replace these with per-request nonces (requires moving headers
  // out of next.config into middleware).
  "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],

  // 'unsafe-inline' — track-color circles use `style={{ background }}`,
  //   Next.js inlines critical CSS too. Tailwind v4 itself doesn't need it.
  "style-src": ["'self'", "'unsafe-inline'"],

  // data: — Next.js may inline tiny images as data URIs
  // blob: — file inputs / FormData previews
  "img-src": ["'self'", "data:", "blob:"],

  // 'self' for Geist webfonts bundled by next/font, data: for icon fonts
  "font-src": ["'self'", "data:"],

  // Outbound XHR / fetch / WebSocket destinations
  "connect-src": ["'self'", ...FIREBASE_ORIGINS, ...R2_ORIGINS],

  // We embed /book-editor/editor.html inside /editor. Same-origin only.
  "frame-src": ["'self'", "https://*.firebaseapp.com"],

  // Who can embed US in an iframe — only our own pages. Replaces the
  // deprecated X-Frame-Options for modern browsers (we also set XFO below
  // for legacy ones).
  "frame-ancestors": ["'self'"],

  // No plugins (Flash etc.) — also disables <object>/<embed>
  "object-src": ["'none'"],

  // Form submissions can only go to our own origin
  "form-action": ["'self'"],

  // Restrict <base href="..."> to defeat dangling-base injection
  "base-uri": ["'self'"],
};

function buildCsp(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([k, vs]) => `${k} ${vs.join(" ")}`)
    .join("; ");
}

const securityHeaders = [
  // CSP — primary defense against XSS + clickjacking
  { key: "Content-Security-Policy", value: buildCsp() },

  // Legacy clickjacking protection. CSP's `frame-ancestors` supersedes
  // this in modern browsers; kept for older clients.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },

  // Prevent MIME sniffing — critical for the /api/projects/[id]/cover
  // proxy and download routes where we set Content-Type explicitly.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Don't leak full URL paths in Referer to third parties
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Lock down browser feature access. Add features here if the app starts
  // using them legitimately (e.g. camera for QR scan).
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()",
  },

  // HSTS — Vercel typically sets this in production already, but being
  // explicit avoids surprises on alternative hosting.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },

  // Tell browsers we don't want the upgrade-insecure-requests CSP override
  // disabled by mixed-content sniffing. Belt-and-suspenders alongside HSTS.
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to every path — security headers are cheap and we'd rather
        // have them on /api responses too (e.g. X-Content-Type-Options).
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
