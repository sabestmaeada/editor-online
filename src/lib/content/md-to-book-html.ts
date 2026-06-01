/**
 * Markdown → book chapters converter (P2-S85).
 *
 * Splits a single uploaded `.md` file into chapter inputs for the SAME
 * `assembleBook()` used by the AI pipeline, so the uploaded-Markdown book
 * gets the identical structure (front cover, copyright page, สารบัญ/TOC,
 * `section.chapter > header.ch-hdr + article.content`, back cover) and the
 * standard `style.css`. We do NOT hand-roll the book wrapper here — we only
 * produce per-chapter content HTML and let the assembler do the rest.
 *
 * Chapter splitting: each top-level `# H1` starts a new chapter (its text
 * becomes the chapter title). A document with no `# H1` becomes one chapter
 * titled with the project title. This matches the structured-chapter skill
 * output (H1 = chapter title, H2 = sections).
 *
 * Markdown mapping (beyond the GFM defaults marked already handles):
 *   - `> [!NOTE]` / [!TIP] / [!WARNING] / [!IMPORTANT] / [!CAUTION]
 *       → <div class="note"><div class="note-label">…</div>…</div>
 *   - a paragraph that is just an image
 *       → <figure class="book-img"><img><figcaption>…</figcaption></figure>
 *   - fenced code block
 *       → <div class="code-block"><div class="code-header">…</div><pre><code>…
 *   - h5 / h6 → h4 (book template styles h1–h4 only)
 *
 * Security: markdown can embed raw HTML, so the rendered output is run
 * through a focused sanitizer that strips <script>/<style>/<iframe>/…,
 * inline `on*=` handlers, and `javascript:` URLs. (The assembler then runs
 * its own structural sanitize pass on top.) Project creation is already
 * gated to editor/admin roles, so this is defense-in-depth.
 */

import { marked } from "marked";
import type { ChapterInput } from "./assemble-book";

const NOTE_LABELS: Record<string, string> = {
  NOTE: "Note",
  TIP: "Tip",
  WARNING: "Warning",
  IMPORTANT: "Important",
  CAUTION: "Caution",
};

export type MdChapterOptions = {
  /** Title used when the markdown has no `# H1` to name the chapter. */
  fallbackTitle: string;
};

/** Minimal HTML-escape for text injected into attributes (code badge). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Strip the dangerous subset of raw HTML that markdown may carry through.
 * Regex-based (no DOM) — adequate for trusted-author content, not a
 * substitute for a full sanitizer on untrusted input.
 */
function sanitizeHtml(html: string): string {
  return (
    html
      // element + its content
      .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
      .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, "")
      // standalone dangerous tags (open or close)
      .replace(
        /<\s*\/?\s*(iframe|object|embed|form|input|link|meta|base)\b[^>]*>/gi,
        "",
      )
      // inline event handlers: on...="..." | '...' | bare
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
      // javascript: URLs
      .replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
      .replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'")
  );
}

/** `> [!NOTE]` callouts → book `.note` boxes. */
function transformCallouts(html: string): string {
  return html.replace(
    /<blockquote>([\s\S]*?)<\/blockquote>/gi,
    (full, inner: string) => {
      const marker = inner.match(/^\s*<p>\s*\[!(\w+)\]\s*/i);
      if (!marker) return full; // ordinary blockquote — leave as-is
      const type = marker[1].toUpperCase();
      const label = NOTE_LABELS[type] ?? "Note";
      // remove the `[!TYPE]` marker from the first paragraph
      let body = inner.replace(/^\s*<p>\s*\[![^\]]+\]\s*/i, "<p>");
      // if that left an empty leading paragraph, drop it
      body = body.replace(/^\s*<p>\s*<\/p>\s*/i, "");
      return `<div class="note"><div class="note-label">${label}</div>${body.trim()}</div>`;
    },
  );
}

/** A paragraph that is only an image → <figure class="book-img">. */
function transformImageFigures(html: string): string {
  return html.replace(
    /<p>\s*(<img\b[^>]*>)\s*<\/p>/gi,
    (_full, imgTag: string) => {
      const altMatch = imgTag.match(/\balt="([^"]*)"/i);
      const alt = altMatch ? altMatch[1] : "";
      const caption = alt ? `<figcaption>${alt}</figcaption>` : "";
      return `<figure class="book-img">${imgTag}${caption}</figure>`;
    },
  );
}

/** Fenced code blocks → book `.code-block` structure. */
function transformCodeBlocks(html: string): string {
  return html.replace(
    /<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/gi,
    (_full, lang: string | undefined, code: string) => {
      const badge = escapeHtml((lang || "code").trim() || "code");
      return `<div class="code-block"><div class="code-header"><span class="code-lang-badge">${badge}</span></div><pre><code>${code}</code></pre></div>`;
    },
  );
}

/** Book template styles h1–h4 only; fold deeper headings up to h4. */
function clampHeadingLevels(html: string): string {
  return html
    .replace(/<h5\b([^>]*)>/gi, "<h4$1>")
    .replace(/<\/h5>/gi, "</h4>")
    .replace(/<h6\b([^>]*)>/gi, "<h4$1>")
    .replace(/<\/h6>/gi, "</h4>");
}

/** Markdown → book content HTML (one flat run of block elements). */
function mdToContentHtml(md: string): string {
  // GFM: tables, strikethrough, autolinks.
  const rawHtml = marked.parse(md ?? "", {
    gfm: true,
    breaks: false,
    async: false,
  }) as string;

  // Sanitize first, then map generic HTML onto book-specific structure.
  let html = sanitizeHtml(rawHtml);
  html = transformCallouts(html);
  html = transformImageFigures(html);
  html = transformCodeBlocks(html);
  html = clampHeadingLevels(html);
  return html;
}

/** Rough word count for the chapter header / cover totals. Uses
 *  Intl.Segmenter (handles Thai, which has no inter-word spaces) and
 *  falls back to whitespace splitting if unavailable. */
function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
  try {
    const seg = new Intl.Segmenter("th", { granularity: "word" });
    let n = 0;
    for (const part of seg.segment(text)) {
      if ((part as { isWordLike?: boolean }).isWordLike) n++;
    }
    return n;
  } catch {
    return text.split(/\s+/).filter(Boolean).length;
  }
}

function makeChapter(
  index: number,
  title: string,
  content: string,
): ChapterInput {
  return {
    index,
    chapter: String(index + 1).padStart(2, "0"),
    title,
    // Wrap so assembleBook's extractArticleContent picks up the content.
    html: `<article class="content">\n${content}\n</article>`,
    wordCount: countWords(content) || null,
  };
}

/**
 * Convert markdown into chapter inputs for assembleBook(). Each top-level
 * `# H1` starts a new chapter; a doc with no H1 becomes a single chapter
 * named with `opts.fallbackTitle`.
 */
export function mdToChapters(
  md: string,
  opts: MdChapterOptions,
): ChapterInput[] {
  const html = mdToContentHtml(md);

  // Locate every top-level H1 (chapter boundary).
  const re = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  const heads: { title: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    heads.push({
      title: m[1].replace(/<[^>]+>/g, "").trim(),
      start: m.index,
      end: re.lastIndex,
    });
  }

  if (heads.length === 0) {
    return [makeChapter(0, opts.fallbackTitle, html.trim())];
  }

  // Any content before the first H1 is folded into chapter 1.
  const preamble = html.slice(0, heads[0].start).trim();
  const chapters: ChapterInput[] = [];
  for (let i = 0; i < heads.length; i++) {
    const cStart = heads[i].end;
    const cEnd = i + 1 < heads.length ? heads[i + 1].start : html.length;
    let content = html.slice(cStart, cEnd).trim();
    if (i === 0 && preamble) content = `${preamble}\n${content}`;
    chapters.push(makeChapter(i, heads[i].title || opts.fallbackTitle, content));
  }
  return chapters;
}
