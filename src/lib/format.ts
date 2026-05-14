import type { Timestamp } from "firebase-admin/firestore";

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

export function formatTimestamp(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  return dateFormatter.format(ts.toDate());
}

export function formatRelative(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  const diffMs = Date.now() - ts.toMillis();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "เมื่อสักครู่";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} วันที่แล้ว`;
  return formatTimestamp(ts);
}
