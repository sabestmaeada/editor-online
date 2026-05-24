import "server-only";
import mammoth from "mammoth";

/**
 * Server-side file parsing for tone-library samples.
 *
 * Accepts .txt, .md, .docx, .pdf (per Q-Tone-6 = C). Returns the
 * extracted plain text. Strips control bytes (defence against weird
 * input from the binary formats) but keeps newlines + Thai chars
 * intact.
 *
 * MIME-type validation is intentionally LENIENT (extension-based)
 * because:
 *  - .docx + .pdf come with reliable magic bytes that the parsers
 *    themselves reject if wrong
 *  - For .txt/.md we have nothing to validate against
 *  - The 1MB upload limit + 50KB output limit in the API route
 *    cap the blast radius of any malformed input
 */

const SUPPORTED_EXTS = new Set([".txt", ".md", ".docx", ".pdf"]);

export class FileParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileParseError";
  }
}

export async function parseUploadedFile(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();
  const ext = "." + (name.split(".").pop() || "");

  if (!SUPPORTED_EXTS.has(ext)) {
    throw new FileParseError(
      `Unsupported file type: ${ext}. Supported: .txt, .md, .docx, .pdf`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    switch (ext) {
      case ".txt":
      case ".md":
        return cleanText(buffer.toString("utf8"));

      case ".docx": {
        const { value } = await mammoth.extractRawText({ buffer });
        return cleanText(value);
      }

      case ".pdf": {
        // pdf-parse v2+ exposes a named export; dynamic import to
        // avoid bundling issues + reduce cold-start cost.
        const pdfParseModule = await import("pdf-parse");
        // Handle both v1 (default export) and v2 (named) shapes.
        const pdfParse =
          (pdfParseModule as { default?: typeof pdfParseModule.PDFParse })
            .default ?? pdfParseModule.PDFParse;
        // pdf-parse v2 uses a class-style API; v1 was a function.
        // For v2: new PDFParse({ data: buffer }).getText()
        // For v1: pdfParse(buffer) → { text }
        // We branch based on shape to support whatever is installed.
        let text = "";
        if (typeof pdfParse === "function") {
          if (pdfParse.prototype && "getText" in pdfParse.prototype) {
            // v2 class
            const PDFParse = pdfParse as unknown as new (opts: {
              data: Buffer;
            }) => { getText(): Promise<{ text: string }> };
            const instance = new PDFParse({ data: buffer });
            const r = await instance.getText();
            text = r.text || "";
          } else {
            // v1 function
            const r = await (
              pdfParse as unknown as (b: Buffer) => Promise<{ text: string }>
            )(buffer);
            text = r.text || "";
          }
        }
        if (!text.trim()) {
          throw new FileParseError(
            "PDF appears to be empty or scanned (no extractable text). OCR not supported.",
          );
        }
        return cleanText(text);
      }

      default:
        throw new FileParseError(`Unsupported extension: ${ext}`);
    }
  } catch (e) {
    if (e instanceof FileParseError) throw e;
    throw new FileParseError(
      `Failed to parse ${ext} file: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** Strip control bytes (except newline/tab) + collapse runs of
 *  whitespace. Keep Thai + punctuation intact. */
function cleanText(s: string): string {
  return s
    // Strip ASCII control chars except \t, \n, \r
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    // Normalise CRLF / CR → LF
    .replace(/\r\n?/g, "\n")
    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
