/**
 * RFC 4180-compliant CSV cell escaping.
 * Wraps in double-quotes when value contains comma, quote, or newline.
 */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}
