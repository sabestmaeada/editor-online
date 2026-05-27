import "server-only";
import type { Outline, OutlineNode } from "@/lib/types";

/**
 * Serialise an Outline to Markdown — for the "Download outline" button.
 *
 * Format:
 *
 *   # ชื่อหนังสือ
 *
 *   > จำนวนบท: 5 บท
 *   > จำนวนหน้า: 200 หน้า
 *   > กลุ่มเป้าหมาย: ...
 *   > จุดประสงค์: ...
 *   > จุดเด่น: ...
 *   > สำนวน: ...                            ← only if tone selected
 *   > สร้างเมื่อ: 27 พ.ค. 2569
 *
 *   ---
 *
 *   # บทที่ 01: ชื่อบท
 *
 *   คำอธิบายบท / summary paragraph
 *
 *   ## หัวข้อย่อย 1
 *   ## หัวข้อย่อย 2
 *   ...
 *
 *   # บทที่ 02: ...
 *
 * The OutlineNode tree carries its own heading levels (chapter / h2 /
 * h3 / h4 / p), so the serialiser just maps node.type → markdown
 * prefix and walks children recursively. Round-trip back into
 * Firestore would need a parser — out of scope for Phase 1 (download
 * only).
 */
export function outlineToMarkdown(outline: Outline): string {
  const fi = outline.formInput;

  const frontmatterLines: Array<string | null> = [
    `# ${fi.bookTitle || "(ไม่มีชื่อ)"}`,
    "",
    `> จำนวนบท: ${fi.chapterCount} บท`,
    `> จำนวนหน้า: ${fi.pageCount} หน้า`,
    fi.targetAudience ? `> กลุ่มเป้าหมาย: ${escapeBlockquote(fi.targetAudience)}` : null,
    fi.bookPurpose ? `> จุดประสงค์: ${escapeBlockquote(fi.bookPurpose)}` : null,
    fi.bookHighlights ? `> จุดเด่น: ${escapeBlockquote(fi.bookHighlights)}` : null,
    fi.toneName ? `> สำนวน: ${fi.toneName}` : null,
    `> สร้างเมื่อ: ${formatThaiDate(outline.createdAt.toDate())}`,
    "",
    "---",
    "",
  ];
  const frontmatter = frontmatterLines
    .filter((line): line is string => line !== null)
    .join("\n");

  const body = outline.nodes.map((n) => nodeToMarkdown(n)).join("\n");

  return `${frontmatter}\n${body}`.trim() + "\n";
}

/* ─────────────────── helpers ─────────────────── */

function nodeToMarkdown(node: OutlineNode): string {
  const lines: string[] = [];
  switch (node.type) {
    case "chapter":
      lines.push(`# ${node.text || "(ไม่มีชื่อ)"}`);
      break;
    case "h2":
      lines.push(`## ${node.text}`);
      break;
    case "h3":
      lines.push(`### ${node.text}`);
      break;
    case "h4":
      lines.push(`#### ${node.text}`);
      break;
    case "p":
      // Plain paragraph — chapter summary / intro text.
      lines.push(node.text);
      break;
  }
  // Blank line after each heading/paragraph for clean markdown.
  lines.push("");
  for (const child of node.children) {
    lines.push(nodeToMarkdown(child));
  }
  return lines.join("\n");
}

/**
 * Multi-line text inside a blockquote — `>` must prefix every line.
 * For the front-matter we keep things on one line, so collapse any
 * embedded newlines into spaces.
 */
function escapeBlockquote(s: string): string {
  return s.replace(/\s*\n\s*/g, " ").trim();
}

/**
 * Format a JS Date in Thai locale, Buddhist year. Mirrors the rest
 * of the app's date display style ("26 พ.ค. 2569").
 */
function formatThaiDate(d: Date): string {
  try {
    return d.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Filesystem-safe filename for the downloaded MD file. Uses the
 * book title if available, falls back to the project id.
 */
export function outlineMarkdownFilename(outline: Outline): string {
  const raw =
    outline.formInput.bookTitle?.trim() || `outline-${outline.projectId}`;
  // Strip OS-unfriendly chars; keep Thai + ASCII + digits + dashes.
  const safe = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${safe}.md`;
}
