import "server-only";
import { createHash } from "node:crypto";

/**
 * Anything header-like: Web Headers, ReadonlyHeaders from next/headers,
 * or NextRequest.headers — all expose `.get(name) -> string | null`.
 */
export type HeaderReader = {
  get(name: string): string | null;
};

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6 = /:/;

export function getClientIp(headers: HeaderReader): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  return "unknown";
}

export function truncateIp(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";
  const m = ip.match(IPV4);
  if (m) return `${m[1]}.${m[2]}.${m[3]}.0`;
  if (IPV6.test(ip)) {
    const parts = ip.split(":");
    return parts.slice(0, 3).join(":") + "::";
  }
  return "unknown";
}

export function hashIp(ip: string): string {
  const pepper = process.env.IP_HASH_PEPPER;
  if (!pepper) {
    throw new Error(
      "IP_HASH_PEPPER env var is required. Generate with: openssl rand -hex 32",
    );
  }
  return createHash("sha256").update(`${pepper}:${ip}`).digest("hex");
}

export type GeoInfo = {
  country: string | null;
  region: string | null;
  city: string | null;
};

export function getGeoFromHeaders(headers: HeaderReader): GeoInfo {
  return {
    country:
      headers.get("x-vercel-ip-country") ??
      headers.get("cf-ipcountry") ??
      null,
    region: headers.get("x-vercel-ip-country-region") ?? null,
    city: headers.get("x-vercel-ip-city") ?? null,
  };
}

export function getUserAgent(headers: HeaderReader): string {
  return headers.get("user-agent") ?? "unknown";
}
