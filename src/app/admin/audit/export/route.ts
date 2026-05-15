import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/firebase/require-role";
import { streamRecentAuthEvents } from "@/lib/firebase/admin-events";
import { csvRow } from "@/lib/csv";
import { formatTimestamp } from "@/lib/format";
import { parseAuditSearchParams } from "../filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADER = [
  "timestamp_iso",
  "timestamp_local",
  "uid",
  "email",
  "eventType",
  "provider",
  "ip",
  "ipHash",
  "country",
  "region",
  "city",
  "success",
  "errorCode",
  "oldRole",
  "newRole",
  "changedBy",
  "oldEmail",
  "newEmail",
  "userAgent",
];

const MAX_EXPORT = 10000;

export async function GET(req: NextRequest) {
  // Auth: admin only (will redirect if not — but for API redirect → 307, client handles)
  await requireAdmin("/admin/audit");

  // Parse filters from URL (same shape as the page)
  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    sp[k] = v;
  });
  const filters = parseAuditSearchParams(sp);

  // Stream CSV
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // BOM for Excel compatibility with UTF-8
      controller.enqueue(encoder.encode("﻿"));
      controller.enqueue(encoder.encode(csvRow(HEADER) + "\n"));

      try {
        for await (const e of streamRecentAuthEvents(
          {
            eventType: filters.eventType,
            email: filters.email,
            from: filters.from,
            to: filters.to,
          },
          MAX_EXPORT,
        )) {
          const row = csvRow([
            e.timestamp.toDate().toISOString(),
            formatTimestamp(e.timestamp),
            e.uid,
            e.email,
            e.eventType,
            e.provider,
            e.ip,
            e.ipHash,
            e.country ?? "",
            e.region ?? "",
            e.city ?? "",
            e.success ? "true" : "false",
            e.errorCode ?? "",
            e.oldRole ?? "",
            e.newRole ?? "",
            e.changedBy ?? "",
            e.oldEmail ?? "",
            e.newEmail ?? "",
            e.userAgent,
          ]);
          controller.enqueue(encoder.encode(row + "\n"));
        }
      } catch (err) {
        // Best effort: write an error line at the end so admin sees something went wrong
        const msg = err instanceof Error ? err.message : "unknown error";
        controller.enqueue(encoder.encode(`# export error: ${msg}\n`));
      } finally {
        controller.close();
      }
    },
  });

  const filename = `audit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
