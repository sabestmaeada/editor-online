import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { ALL_AUTH_EVENT_TYPES, type AuthEventType } from "@/lib/types";

export function isValidEventType(value: string): value is AuthEventType {
  return (ALL_AUTH_EVENT_TYPES as readonly string[]).includes(value);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BANGKOK_OFFSET = "+07:00";

/**
 * Parse a YYYY-MM-DD date string as Asia/Bangkok midnight (start) or 23:59:59 (end).
 * Returns undefined if the string is invalid.
 */
export function parseDateBangkok(
  dateStr: string | null | undefined,
  variant: "start" | "end",
): Timestamp | undefined {
  if (!dateStr || !DATE_RE.test(dateStr)) return undefined;
  const time =
    variant === "end" ? "T23:59:59.999" + BANGKOK_OFFSET : "T00:00:00.000" + BANGKOK_OFFSET;
  const ms = Date.parse(dateStr + time);
  if (!Number.isFinite(ms)) return undefined;
  return Timestamp.fromMillis(ms);
}

export type AuditFilters = {
  eventType?: AuthEventType;
  email?: string;
  fromDate?: string; // YYYY-MM-DD as entered
  toDate?: string;
  before?: Timestamp;
  // Parsed Timestamps for query
  from?: Timestamp;
  to?: Timestamp;
};

export function parseAuditSearchParams(
  sp: Record<string, string | string[] | undefined>,
): AuditFilters {
  const getStr = (k: string): string | undefined => {
    const v = sp[k];
    if (typeof v === "string" && v.length > 0) return v;
    return undefined;
  };

  const typeStr = getStr("type");
  const emailRaw = getStr("email")?.trim();
  const fromDate = getStr("from");
  const toDate = getStr("to");
  const beforeStr = getStr("before");

  const beforeMs = beforeStr ? Number(beforeStr) : NaN;
  const before = Number.isFinite(beforeMs)
    ? Timestamp.fromMillis(beforeMs)
    : undefined;

  return {
    eventType: typeStr && isValidEventType(typeStr) ? typeStr : undefined,
    email: emailRaw || undefined,
    fromDate,
    toDate,
    before,
    from: parseDateBangkok(fromDate, "start"),
    to: parseDateBangkok(toDate, "end"),
  };
}

/**
 * Build URL search params from filters — excludes pagination cursor by default
 * (used when changing filters resets pagination).
 */
export function filtersToParams(
  f: AuditFilters,
  options: { includeCursor?: boolean } = {},
): URLSearchParams {
  const params = new URLSearchParams();
  if (f.eventType) params.set("type", f.eventType);
  if (f.email) params.set("email", f.email);
  if (f.fromDate) params.set("from", f.fromDate);
  if (f.toDate) params.set("to", f.toDate);
  if (options.includeCursor && f.before) {
    params.set("before", String(f.before.toMillis()));
  }
  return params;
}
