import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserProfile } from "@/lib/firebase/get-current-profile";
import { resolveToneAccess } from "@/lib/firebase/tone-access";
import {
  addSampleRecord,
  listSamples,
  updateTone,
} from "@/lib/firebase/tones";
import { addSample, N8nToneError } from "@/lib/n8n/tones";
import { recordTokenUsage } from "@/lib/firebase/token-usage";
import { parseUploadedFile } from "@/lib/file-parse/tones";
import { logAuthEvent } from "@/lib/firebase/auth-events";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { validateUserText } from "@/lib/security/sanitize-user-text";
import { Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_SAMPLE_BYTES = 50 * 1024; // 50 KB per Q-Tone-7
const MAX_SAMPLES_PER_TONE = 50;
const MAX_UPLOAD_BYTES = 1024 * 1024; // 1 MB raw file (before parse → text)

// ────────────────────────────────────────────────────────────
// GET /api/tones/[id]/samples — list samples
// ────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const access = await resolveToneAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const samples = await listSamples(id);
  return NextResponse.json({ samples });
}

// ────────────────────────────────────────────────────────────
// POST /api/tones/[id]/samples — add a sample
//
// Two body shapes accepted:
//   application/json:           { text: "..." }
//   multipart/form-data:        file=<.txt|.md|.docx|.pdf>
//
// Workflow: parse → enforce size → call n8n /tone-add-sample →
//   persist Firestore record + update tone counters + cache profile.
// ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: RouteContext) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const access = await resolveToneAccess(profile, id);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.canAddSample) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit — LLM tokens cost real money. 20/hour is generous for
  // normal authoring; bursts above that look like abuse.
  const limit = checkRateLimit(
    `tone-sample-add:${profile.uid}`,
    20,
    60 * 60 * 1000,
  );
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  // Sample-count cap per tone
  const existing = await listSamples(id);
  if (existing.length >= MAX_SAMPLES_PER_TONE) {
    return NextResponse.json(
      {
        error: `เกินจำนวน sample สูงสุดต่อ tone (${MAX_SAMPLES_PER_TONE}). ลบของเก่าก่อนเพิ่มใหม่`,
      },
      { status: 409 },
    );
  }

  // Parse body — either JSON or multipart
  let text = "";
  let source: "paste" | "file" = "paste";
  let fileName: string | null = null;

  const contentType = req.headers.get("content-type") || "";
  if (contentType.startsWith("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file field is required" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `ไฟล์ใหญ่เกินขนาด ${MAX_UPLOAD_BYTES / 1024}KB` },
        { status: 413 },
      );
    }
    try {
      text = await parseUploadedFile(file);
      fileName = file.name;
      source = "file";
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof Error ? e.message : "ไม่สามารถอ่านไฟล์ได้",
        },
        { status: 400 },
      );
    }
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const raw = (body as { text?: unknown }).text;
    text = typeof raw === "string" ? raw : "";
  }

  // Sanitise + detect prompt-injection (P2-S37). Replaces the old
  // narrow control-char strip with full defence: zero-width Unicode,
  // bidi override, dangerous HTML tags, injection patterns.
  const v = validateUserText(text);
  if (!v.ok) {
    await logAuthEvent({
      headers: req.headers,
      uid: profile.uid,
      email: profile.email,
      eventType: "tone-sample-add",
      provider: "system",
      success: false,
      errorCode: v.code,
      targetUid: access.tone.ownerUid,
      targetEmail: access.tone.ownerEmail,
    });
    return NextResponse.json(
      { error: v.reason, code: v.code },
      { status: 400 },
    );
  }
  text = v.text.trim();

  if (!text) {
    return NextResponse.json({ error: "Sample text is empty" }, { status: 400 });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_SAMPLE_BYTES) {
    return NextResponse.json(
      { error: `Sample ใหญ่เกิน ${MAX_SAMPLE_BYTES / 1024}KB` },
      { status: 413 },
    );
  }

  // We allocate the Firestore sample ID upfront and pass it to n8n —
  // simpler than letting n8n choose, and we can correlate the Qdrant
  // point payloads with our doc IDs after.
  const sampleIdSeed = generateSampleId();

  // Call n8n — embed + insert Qdrant + analyse
  let n8nResult;
  try {
    n8nResult = await addSample({
      ownerUid: access.tone.ownerUid,
      toneId: id,
      sampleId: sampleIdSeed,
      text,
    });
  } catch (e) {
    const code =
      e instanceof N8nToneError ? e.code : ("UNKNOWN" as const);
    const status =
      code === "MISSING_ENV"
        ? 500
        : code === "TIMEOUT" || code === "NETWORK"
          ? 504
          : 502;
    const userMessage =
      code === "MISSING_ENV"
        ? "Server is not configured for tone library"
        : code === "TIMEOUT"
          ? "Embedding timed out — please try again"
          : "Embedding service failed — please try again";
    await logAuthEvent({
      headers: req.headers,
      uid: profile.uid,
      email: profile.email,
      eventType: "tone-sample-add",
      provider: "system",
      success: false,
      errorCode: code,
      targetUid: access.tone.ownerUid,
      targetEmail: access.tone.ownerEmail,
    });
    return NextResponse.json({ error: userMessage, code }, { status });
  }

  // Persist sample record (uses its own auto-id, not our seed —
  // the seed was a transient correlation key for n8n).
  const sample = await addSampleRecord({
    toneId: id,
    text,
    qdrantPointIds: n8nResult.pointIds,
    source,
    fileName,
    uploadedBy: profile.uid,
  });

  // Cache analysis result on the tone doc (if n8n returned any).
  if (n8nResult.styleProfile || n8nResult.systemPrompt) {
    await updateTone(id, {
      styleProfile: n8nResult.styleProfile,
      systemPrompt: n8nResult.systemPrompt,
      lastAnalyzedAt: Timestamp.now(),
    });
  }

  await logAuthEvent({
    headers: req.headers,
    uid: profile.uid,
    email: profile.email,
    eventType: "tone-sample-add",
    provider: "system",
    success: true,
    targetUid: access.tone.ownerUid,
    targetEmail: access.tone.ownerEmail,
  });

  // Token usage tracking — best-effort, fire-and-forget. Attributed
  // to the TONE OWNER, not the caller — admin/editor who adds a
  // sample to someone else's tone shouldn't show on their bill.
  if (n8nResult.tokenUsage.length > 0) {
    void recordTokenUsage(
      access.tone.ownerUid,
      n8nResult.tokenUsage.map((t) => ({
        source: "tone" as const,
        node: t.node,
        jobId: id, // tone id stands in for jobId here
        projectId: null,
        chapter: null,
        model: t.model,
        promptTokens: t.promptTokens,
        completionTokens: t.completionTokens,
        totalTokens: t.totalTokens,
      })),
    );
  }

  return NextResponse.json({
    sample,
    styleProfile: n8nResult.styleProfile,
    systemPrompt: n8nResult.systemPrompt,
  });
}

/** Lightweight sample-id seed used when correlating with n8n. Doesn't
 *  need to be the final Firestore doc id (which Firestore generates). */
function generateSampleId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
