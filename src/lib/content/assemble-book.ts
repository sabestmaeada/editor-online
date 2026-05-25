import "server-only";
import { BOOK_TEMPLATE_CSS } from "./book-template-css";

/**
 * Book assembly — merge N chapter HTML files into a single book bundle
 * (book.html + style.css). Mirrors the structure of the reference book
 * template the user provided (Windows 11 mini-book example).
 *
 * Pipeline:
 *   1. For each chapter:
 *      - Strip outer wrapper + `<style>` blocks
 *      - Pull `<article class="content">` inner HTML
 *      - Run sanitize pass (broken tags / inline-code escape /
 *        unwrap `<p>` around blocks / wrap loose text / clean empties)
 *   2. Build TOC from chapter list
 *   3. Build copyright page from project metadata
 *   4. Build preface (Markdown → HTML) if provided
 *   5. Build front/back cover sections if cover image is provided
 *   6. Concat into a full HTML doc that links to ./style.css
 *
 * Sanitize functions are ported from the n8n `รวม HTML เป็นเล่มเดียว`
 * Code node so the output matches what the original pipeline produced.
 */

export type ChapterInput = {
  index: number;
  chapter: string; // "01", "02", ...
  title: string;
  /** Full standalone HTML from n8n — we extract just the content. */
  html: string;
  /** Optional word count to display in the chapter header. */
  wordCount?: number | null;
};

export type BookMetadata = {
  title: string;
  /** Customer / publisher name from project metadata. */
  customer?: string | null;
  author?: string | null;
  edition?: string | null;
  isbn?: string | null;
  /** Estimated page count from project metadata. */
  pages?: number | null;
  /** Optional Markdown preface (คำนำ). */
  preface?: string | null;
  /** Optional absolute URL to the cover image (front + back use the
   *  same image). When omitted, the assembler renders a text cover
   *  using the title + chapter/word counts. */
  coverImageUrl?: string | null;
};

export type ChapterDiagnostic = {
  chapterNum: string;
  chapterTitle: string;
  rawLength: number;
  sanitizedLength: number;
  /** Patterns that should NEVER appear after sanitize — non-zero means
   *  the sanitize pipeline has a regression. */
  hasBadPDiv: boolean;
  hasBadPFigure: boolean;
  hasBadPOl: boolean;
  hasBadPUl: boolean;
};

export type AssembledBook = {
  bookHtml: string;
  bookCss: string;
  htmlBytes: number;
  cssBytes: number;
  diagnostics: ChapterDiagnostic[];
};

export function assembleBook(input: {
  bookMeta: BookMetadata;
  chapters: ChapterInput[];
}): AssembledBook {
  const sorted = [...input.chapters].sort((a, b) => a.index - b.index);
  const diagnostics: ChapterDiagnostic[] = [];

  // ── Strip outer wrapper + sanitize each chapter ──
  const chapterSections = sorted
    .map((ch) => {
      const rawContent = extractArticleContent(ch.html);
      const content = sanitizeWholeArticleHtml(rawContent);
      diagnostics.push({
        chapterNum: ch.chapter,
        chapterTitle: ch.title,
        rawLength: rawContent.length,
        sanitizedLength: content.length,
        hasBadPDiv: /<p>\s*<div\b/i.test(content),
        hasBadPFigure: /<p>\s*<figure\b/i.test(content),
        hasBadPOl: /<p>\s*<ol\b/i.test(content),
        hasBadPUl: /<p>\s*<ul\b/i.test(content),
      });
      return renderChapter(ch, content);
    })
    .join("\n");

  // ── TOC ──
  const tocItems = sorted
    .map(
      (ch) =>
        `        <a href="#chapter-${escapeAttr(ch.chapter)}" class="toc-item">` +
        `<span class="toc-num">บทที่ ${escapeText(stripLeadingZero(ch.chapter))}</span>` +
        `<span class="toc-name">${escapeText(ch.title)}</span></a>`,
    )
    .join("\n");

  // ── Copyright page ──
  const copyrightSection = renderCopyrightPage(input.bookMeta);

  // ── Preface (optional) ──
  const prefaceSection = input.bookMeta.preface
    ? `    <section class="preface">
      <h2 class="preface-title">คำนำ</h2>
      <div class="preface-content">
${indentBy(mdToHtml(input.bookMeta.preface), 8)}
      </div>
    </section>`
    : "";

  // ── Cover sections (front + back) ──
  const totalChapters = sorted.length;
  const totalWords = sorted.reduce(
    (sum, ch) => sum + (typeof ch.wordCount === "number" ? ch.wordCount : 0),
    0,
  );
  const todayThai = new Date().toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const frontCover = renderFrontCover(
    input.bookMeta,
    totalChapters,
    totalWords,
    todayThai,
  );
  const backCover = renderBackCover(input.bookMeta);

  // ── Full HTML doc ──
  const bookHtml = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeText(input.bookMeta.title)}</title>
  <link
    href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
    rel="stylesheet">
  <link rel="stylesheet" href="./style.css" media="screen">
</head>
<body>
${frontCover}
  <div class="book-wrap">
${copyrightSection}
${prefaceSection ? "\n" + prefaceSection : ""}

    <section class="toc">
      <h2 class="toc-title">สารบัญ</h2>
      <div class="toc-list">
${tocItems}
      </div>
    </section>

${chapterSections}
${backCover ? "\n" + backCover : ""}
  </div>
</body>
</html>
`;

  return {
    bookHtml,
    bookCss: BOOK_TEMPLATE_CSS,
    htmlBytes: Buffer.byteLength(bookHtml, "utf-8"),
    cssBytes: Buffer.byteLength(BOOK_TEMPLATE_CSS, "utf-8"),
    diagnostics,
  };
}

/* ─────────────────── chapter rendering ─────────────────── */

function renderChapter(ch: ChapterInput, sanitizedContent: string): string {
  const chapterNumDisplay = stripLeadingZero(ch.chapter);
  const meta =
    typeof ch.wordCount === "number" && ch.wordCount > 0
      ? `${ch.wordCount.toLocaleString()} คำ`
      : "";

  return `    <section class="chapter" id="chapter-${escapeAttr(ch.chapter)}">
      <header class="ch-hdr">
        <div class="ch-num">CHAPTER ${escapeText(chapterNumDisplay)}</div>
        <h1 class="ch-title">${escapeText(ch.title)}</h1>${meta ? `\n        <div class="ch-meta">${escapeText(meta)}</div>` : ""}
      </header>
      <article class="content">
${indentBy(sanitizedContent, 8)}
      </article>
    </section>`;
}

/** Strip outer wrapper + chapter `<style>`, return inner article content. */
function extractArticleContent(html: string): string {
  // Strip ALL <style> blocks — chapter CSS is replaced by template CSS.
  const cleaned = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // 1. Prefer <article class="content">
  const articleMatch = cleaned.match(
    /<article[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/i,
  );
  if (articleMatch) return removeChapterTitleH1(articleMatch[1].trim());

  // 2. <body> minus header / footer
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    let body = bodyMatch[1];
    body = body.replace(/<header[\s\S]*?<\/header>/gi, "");
    body = body.replace(/<footer[\s\S]*?<\/footer>/gi, "");
    body = body.replace(
      /<div[^>]*class=["'][^"']*\bwrap\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      "$1",
    );
    return removeChapterTitleH1(body.trim());
  }

  // 3. Last resort
  return cleaned
    .replace(/<!DOCTYPE[^>]*>/i, "")
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<\/?body[^>]*>/gi, "")
    .trim();
}

/** Drop leading `<h1>` that looks like the chapter title (rebuilt in
 *  `<header class="ch-hdr">` separately). */
function removeChapterTitleH1(content: string): string {
  return content.replace(
    /^\s*<h1[^>]*>\s*(?:บทที่[^<]*?)?<\/h1>\s*/i,
    "",
  );
}

/* ─────────────────── HTML sanitize pipeline ─────────────────── */
// Ported from the n8n "รวม HTML เป็นเล่มเดียว" Code node.

function sanitizeWholeArticleHtml(html: string): string {
  if (!html || typeof html !== "string") return html;
  let out = html;
  out = repairCommonBrokenTags(out);
  out = sanitizeInlineCode(out);
  out = unwrapParagraphAroundBlocks(out);
  out = wrapLooseTextAfterHeading(out);
  out = cleanCodeBlockWhitespace(out);
  out = removeEmptyParagraphs(out);
  out = mergeAdjacentTables(out);
  out = normalizeSpacing(out);
  return out;
}

/**
 * Stitch together tables that the Markdown parser split in two.
 *
 * Pattern seen in real AI output:
 *
 *   <div class="table-wrap"><table>
 *     <thead><tr><th>col1</th><th>col2</th>...</tr></thead>
 *     <tbody></tbody>            ← empty body
 *   </table></div>
 *   <div class="table-wrap"><table>
 *     <thead><tr><th>data1</th><th>data2</th>...</tr></thead>  ← first data row, wrong tag
 *     <tbody>
 *       <tr><td>...</td>...</tr>
 *       ...
 *     </tbody>
 *   </table></div>
 *
 * Cause: the n8n Markdown table parser treats the "first row in a
 * row-run" as a header — so when the LLM emits the header rows + the
 * separator (`|---|`) on one block and the data rows in another block
 * (separated by a blank line), the parser builds two tables.
 *
 * Fix: detect adjacent table-wraps where the first has an empty tbody,
 * merge them. Keep first thead. Demote second's "thead row" to a data
 * row + prepend to its tbody.
 */
export function mergeAdjacentTables(html: string): string {
  // Optional whitespace between the two wrappers, including <p>... if
  // the unwrap pass left a paragraph in between. Loop because there
  // could be 3+ tables in a row.
  let out = html;
  for (let i = 0; i < 10; i++) {
    const before = out;
    out = out.replace(
      /<div class="table-wrap"><table>(<thead>[\s\S]*?<\/thead>)<tbody>\s*<\/tbody><\/table><\/div>\s*(?:<p>\s*<\/p>\s*)*<div class="table-wrap"><table><thead><tr>([\s\S]*?)<\/tr><\/thead>(<tbody>[\s\S]*?<\/tbody>)<\/table><\/div>/g,
      (_m, firstThead: string, secondHeaderRow: string, secondBody: string) => {
        // Demote `<th>` → `<td>` so the row joins the data section.
        const dataCells = secondHeaderRow
          .replace(/<th(\s[^>]*)?>/gi, "<td$1>")
          .replace(/<\/th>/gi, "</td>");
        const promotedRow = `<tr>${dataCells}</tr>`;
        const mergedBody = secondBody.replace(
          /^<tbody>/,
          `<tbody>${promotedRow}`,
        );
        return `<div class="table-wrap"><table>${firstThead}${mergedBody}</table></div>`;
      },
    );
    if (out === before) break;
  }
  return out;
}

/** Fix common broken closing tags + a known `<code>` self-closing bug. */
function repairCommonBrokenTags(html: string): string {
  return html
    .replace(
      /<\/(p|div|figure|ul|ol|table|blockquote|h1|h2|h3|h4|h5|h6|pre)(?=\s|<|$)/gi,
      "</$1>",
    )
    .replace(
      /<code class="inline-code"><(div|button|section|article|header|footer|main|nav|p|h1|h2|h3|h4|ul|ol|li|img|a)([^>]*)><\/code>/gi,
      (_m, tag, attrs) =>
        `<code class="inline-code"><${tag}${attrs || ""}></code>`,
    );
}

/** Escape HTML / comments inside <code>...</code> so they render as
 *  literal text. `<span>` is preserved (used for syntax highlighting). */
function sanitizeInlineCode(html: string): string {
  return html.replace(
    /<code([^>]*)>([\s\S]*?)<\/code>/gi,
    (_full, attrs, inner) => {
      let converted = inner.replace(/<!--[\s\S]*?-->/g, (m: string) =>
        escapeHtmlBasic(m),
      );
      converted = converted.replace(
        /<\s*\/?\s*(?!span\b)([a-zA-Z0-9-]+)([^>]*)>/gi,
        (m: string) => escapeHtmlBasic(m),
      );
      return `<code${attrs}>${converted}</code>`;
    },
  );
}

/** AI sometimes wraps block elements (div/figure/ul/ol/table/...) in
 *  `<p>...</p>`, which is invalid HTML and breaks browser rendering.
 *  Pull the block out, keep adjacent text as separate `<p>`s. */
function unwrapParagraphAroundBlocks(html: string): string {
  let out = html;
  for (let i = 0; i < 20; i++) {
    const before = out;
    out = out.replace(
      /<p>\s*([\s\S]*?)\s*(<(?:div|figure|ul|ol|table|blockquote|hr|h1|h2|h3|h4|h5|h6|pre)\b[\s\S]*?<\/(?:div|figure|ul|ol|table|blockquote|h1|h2|h3|h4|h5|h6|pre)>|<(?:hr)\b[^>]*>)\s*([\s\S]*?)<\/p>/gi,
      (_m, beforeText: string, blockHtml: string, afterText: string) => {
        let result = "";
        if (beforeText && beforeText.trim()) result += `<p>${beforeText.trim()}</p>`;
        result += blockHtml;
        if (afterText && afterText.trim()) result += `<p>${afterText.trim()}</p>`;
        return result;
      },
    );
    out = out.replace(
      /<p>\s*(<(?:div|figure|ul|ol|table|blockquote|hr|h1|h2|h3|h4|h5|h6|pre)\b[\s\S]*?<\/(?:div|figure|ul|ol|table|blockquote|h1|h2|h3|h4|h5|h6|pre)>|<(?:hr)\b[^>]*>)\s*<\/p>/gi,
      "$1",
    );
    if (out === before) break;
  }
  return out;
}

/** When AI puts plain text directly after a `<h2>`/`<h3>` without
 *  wrapping it in `<p>`, the browser leaves it as a bare text node.
 *  Wrap it in `<p>` so spacing + typography apply. */
function wrapLooseTextAfterHeading(html: string): string {
  let out = html.replace(
    /(<\/h[1-6]>)([\s\S]*?)(?=<p\b|<div\b|<h[1-6]\b|<ul\b|<ol\b|<table\b|<blockquote\b|<figure\b|<hr\b|<\/p>|$)/gi,
    (match, hTag: string, text: string) => {
      if (text.trim() === "") return match;
      return `${hTag}<p>${text.trim()}</p>`;
    },
  );
  out = out.replace(/<\/p>\s*<\/p>/gi, "</p>");
  return out;
}

/** Trim whitespace inside `<code>...</code>` + clean up garbage that
 *  sometimes shows up between code header and `<pre>`. */
function cleanCodeBlockWhitespace(html: string): string {
  let out = html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/gi,
    (_m, openTag: string, content: string, closeTag: string) => {
      let cleaned = content.replace(/^[\s\n\r]+|[\s\n\r]+$/g, "");
      cleaned = cleaned.replace(
        /^(?:<br\s*\/?>|<p>\s*<\/p>)+|(?:<br\s*\/?>|<p>\s*<\/p>)+$/gi,
        "",
      );
      return openTag + cleaned + closeTag;
    },
  );
  out = out.replace(
    /(<div class="code-header">[\s\S]*?<\/div>)([\s\S]*?)(<pre(?:>|\s[^>]*>))/gi,
    (_m, header: string, _garbage: string, pre: string) => header + pre,
  );
  return out;
}

/** Collapse runs of empty `<p></p>` and stray `<p>` near block tags. */
function removeEmptyParagraphs(html: string): string {
  let out = html;
  out = out.replace(/(<p>\s*){2,}/gi, "<p>");
  out = out.replace(/(<\/p>\s*){2,}/gi, "</p>");
  let prev: string;
  do {
    prev = out;
    out = out.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>|​)*<\/p>/gi, "");
  } while (out !== prev);
  out = out.replace(
    /<p>\s*(?=<h[1-6]>|<div|<ul|<ol|<table|<blockquote|<figure|<hr)/gi,
    "",
  );
  out = out.replace(
    /(<\/h[1-6]>|<\/div>|<\/ul>|<\/ol>|<\/table>|<\/blockquote>|<\/figure>|<hr>)\s*<\/p>/gi,
    "$1",
  );
  return out;
}

function normalizeSpacing(html: string): string {
  return html.replace(/\n{3,}/g, "\n\n").replace(/>\s+</g, "><");
}

/* ─────────────────── Markdown → HTML (preface) ─────────────────── */
// Lightweight Markdown converter used only for the preface — chapters
// already arrive as HTML from n8n.

function mdToHtml(md: string): string {
  const codeBlocks: string[] = [];
  let html = md.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_m, lang: string, code: string) => {
      const escaped = code
        .trim()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const lines = escaped.split("\n");
      const numbered = lines
        .map((line) => `<span class="line">${line === "" ? " " : line}</span>`)
        .join("\n");
      const badge = `<span class="code-lang-badge">${lang || "code"}</span>`;
      const block = `<div class="code-block"><div class="code-header">${badge}</div><pre><code>${numbered}</code></pre></div>`;
      codeBlocks.push(block);
      return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
    },
  );

  html = html
    .replace(/^#{4}\s+(.+)$/gm, "<h4>$1</h4>")
    .replace(/^#{3}\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^#{2}\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#{1}\s+(.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /`([^`]+)`/g,
      (_m, code: string) =>
        `<code class="inline-code">${escapeHtmlBasic(code)}</code>`,
    )
    .replace(/^>\s*(.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^---$/gm, "<hr>")
    .replace(/^\*\s+(.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ordered">$1</li>')
    .replace(/\n\n+/g, "\n</p><p>\n");

  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  html = html.replace(
    /((?:<li class="ordered">.*<\/li>\n?)+)/g,
    "<ol>$1</ol>",
  );
  html = html.replace(/<li class="ordered">/g, "<li>");
  html = "<p>" + html + "</p>";
  html = html
    .replace(/<p>\s*(<h[1-4]>)/g, "$1")
    .replace(/(<\/h[1-4]>)\s*<\/p>/g, "$1")
    .replace(/<p>\s*(<ul>)/g, "$1")
    .replace(/(<\/ul>)\s*<\/p>/g, "$1")
    .replace(/<p>\s*(<ol>)/g, "$1")
    .replace(/(<\/ol>)\s*<\/p>/g, "$1")
    .replace(/<p>\s*(<blockquote>)/g, "$1")
    .replace(/(<\/blockquote>)\s*<\/p>/g, "$1")
    .replace(/<p>\s*(<hr>)/g, "$1")
    .replace(/(<hr>)\s*<\/p>/g, "$1")
    .replace(/<p>\s*<\/p>/g, "");

  html = html.replace(
    /%%CODEBLOCK_(\d+)%%/g,
    (_m, i: string) => codeBlocks[+i],
  );
  return html;
}

/* ─────────────────── copyright + cover ─────────────────── */

function renderCopyrightPage(meta: BookMetadata): string {
  const rows: string[] = [];
  rows.push(
    `        <div class="copyright-label">ข้อมูลหนังสือและลิขสิทธิ์</div>`,
  );
  rows.push(detailRow("ชื่อหนังสือ", meta.title));
  if (meta.author) rows.push(detailRow("ผู้เขียน", meta.author));
  if (meta.edition) rows.push(detailRow("รุ่น/เวอร์ชัน", meta.edition));
  if (meta.customer) {
    rows.push(
      `        <div class="copyright-legal">สงวนลิขสิทธิ์ © ปี พ.ศ. ${
        new Date().getFullYear() + 543
      } โดย ${escapeText(meta.customer)}</div>`,
    );
  }
  rows.push(
    `        <p class="copyright-restriction">ห้ามคัดลอก ทำซ้ำ ดัดแปลง หรือเผยแพร่เนื้อหาส่วนใดส่วนหนึ่ง โดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษรจากผู้เขียน</p>`,
  );
  rows.push(
    `        <p class="copyright-note">หนังสือเล่มนี้สร้างด้วย AI Writing Pipeline สำหรับการใช้งานส่วนบุคคล</p>`,
  );

  const gridItems: string[] = [];
  if (meta.isbn) gridItems.push(infoGridItem("ISBN", meta.isbn));
  if (meta.pages && meta.pages > 0)
    gridItems.push(infoGridItem("จำนวนหน้า", `${meta.pages} หน้า`));
  if (gridItems.length > 0) {
    rows.push(
      `        <div class="copyright-info-grid">\n${gridItems.join("\n")}\n        </div>`,
    );
  }

  return `    <section class="copyright-page">
      <div class="copyright-inner">
${rows.join("\n")}
      </div>
    </section>`;
}

function renderFrontCover(
  meta: BookMetadata,
  totalChapters: number,
  totalWords: number,
  todayThai: string,
): string {
  if (meta.coverImageUrl) {
    return `  <section class="cover cover-has-image"><img class="cover-image" src="${escapeAttr(meta.coverImageUrl)}" alt="${escapeAttr(meta.title)} - ปกหนังสือ"></section>`;
  }
  return `  <section class="cover">
    <h1 class="cover-title">${escapeText(meta.title)}</h1>
    <div class="cover-line"></div>
    <div class="cover-subtitle">AI-Assisted Writing</div>
    <div class="cover-meta">
      จำนวน ${totalChapters} บท<br>
      รวม ${totalWords.toLocaleString()} คำ<br>
      ${escapeText(todayThai)}
    </div>
  </section>`;
}

function renderBackCover(meta: BookMetadata): string {
  if (meta.coverImageUrl) {
    return `    <section class="back-cover back-cover-has-image"><img class="back-cover-image" src="${escapeAttr(meta.coverImageUrl)}" alt="${escapeAttr(meta.title)} - สิ้นสุด"></section>`;
  }
  return `    <section class="back-cover">
      <div class="cover-line"></div>
      <h2 class="cover-title" style="font-size:32px;">จบเล่ม</h2>
      <div class="cover-meta">
        ขอบคุณที่ติดตามอ่าน<br>
        ${escapeText(meta.title)}
      </div>
    </section>`;
}

function detailRow(label: string, value: string): string {
  return `        <div class="copyright-detail"><span class="copyright-detail-label">${escapeText(label)}:</span> ${escapeText(value)}</div>`;
}

function infoGridItem(label: string, value: string): string {
  return `          <div class="copyright-info-item"><span class="copyright-info-label">${escapeText(label)}:</span> <span class="copyright-info-value">${escapeText(value)}</span></div>`;
}

/* ─────────────────── helpers ─────────────────── */

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlBasic(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

function stripLeadingZero(s: string): string {
  const n = parseInt(s, 10);
  if (Number.isFinite(n)) return String(n);
  return s;
}

function indentBy(s: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return s
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n");
}
