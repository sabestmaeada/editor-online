import "server-only";
import type { OutlineNode } from "@/lib/types";

/**
 * Flat representation of one chapter, ready to ship to the n8n content
 * generation webhook. Matches the legacy Sheets schema the workflow's
 * code nodes already consume (`chapter`, `title`, `content`, `topics`).
 */
export type FlatChapter = {
  /** 0-based index used for callback correlation. */
  index: number;
  /** Chapter number as a 2-digit string ("01", "02", ...). */
  chapter: string;
  /** Chapter heading text (with the "บทที่ NN:" prefix stripped). */
  title: string;
  /** Chapter intro / summary paragraph (from the first `p` child, if any). */
  content: string;
  /** Subsection titles (from `h2` children). Each becomes a section the
   *  LLM should write content for. */
  topics: string[];
};

/**
 * Walk an OutlineNode tree and return a flat chapters[] for the n8n
 * payload. See CONTENT-GENERATION-DESIGN.md §3 step 3 (Vercel handler)
 * for where this is called.
 *
 * Conventions (mirrors how `parseN8nChapter` in `src/lib/n8n/outline.ts`
 * builds the tree in the first place, so we round-trip cleanly):
 *
 *   chapter "บทที่ 01: ชื่อบท"
 *     ├─ p   "summary…"        → becomes FlatChapter.content
 *     ├─ h2  "หัวข้อย่อย 1"     → becomes FlatChapter.topics[0]
 *     └─ h2  "หัวข้อย่อย 2"     → becomes FlatChapter.topics[1]
 *
 * Non-chapter root nodes are ignored (the outline editor allows free-
 * standing notes at the root). h3/h4/p children of h2 nodes are NOT
 * surfaced as topics — they're considered editor-only annotations.
 */
export function flattenOutlineToChapters(
  nodes: OutlineNode[],
): FlatChapter[] {
  const chapters: FlatChapter[] = [];

  for (const node of nodes) {
    if (node.type !== "chapter") continue;

    const { chapterNum, title } = splitChapterHeading(node.text);

    // Find first `p` child for the summary, all `h2` children for topics.
    let content = "";
    const topics: string[] = [];
    for (const child of node.children) {
      if (child.type === "p" && !content) {
        content = child.text.trim();
      } else if (child.type === "h2") {
        const t = child.text.trim();
        if (t.length > 0) topics.push(t);
      }
    }

    chapters.push({
      index: chapters.length,
      chapter: chapterNum || padIndex(chapters.length + 1),
      title: title.trim(),
      content,
      topics,
    });
  }

  return chapters;
}

/**
 * Split a chapter heading like "บทที่ 01: ชื่อบท" into:
 *   { chapterNum: "01", title: "ชื่อบท" }
 *
 * Tolerates variations:
 *   "บทที่ 1: ชื่อ"        → { "01", "ชื่อ" }   (zero-padded)
 *   "1: ชื่อ"              → { "01", "ชื่อ" }
 *   "บทที่ 03 ชื่อบท"      → { "03", "ชื่อบท" } (space instead of colon)
 *   "ชื่อบท"               → { "",   "ชื่อบท" } (no number — caller padIndex's it)
 */
function splitChapterHeading(raw: string): {
  chapterNum: string;
  title: string;
} {
  const text = raw.trim();
  // Pattern: optional "บทที่ ", then digits, then "[ :.\t-]+", then title
  const m = text.match(/^(?:บทที่\s*)?(\d+)\s*[:.\t \-–—]+\s*(.+)$/);
  if (m) {
    return { chapterNum: padIndex(parseInt(m[1], 10)), title: m[2] };
  }
  // No number — return title as-is so caller can pad with positional index
  return { chapterNum: "", title: text };
}

function padIndex(n: number): string {
  return n.toString().padStart(2, "0");
}
