export const TRACK_COLORS = [
  "#E55353",
  "#F5A623",
  "#F5C842",
  "#7CB342",
  "#1A6B52",
  "#26C6DA",
  "#5B7FFF",
  "#7E57C2",
  "#EC407A",
  "#FF7043",
  "#8D6E63",
  "#546E7A",
  "#9C27B0",
  "#3F51B5",
  "#009688",
  "#827717",
] as const;

export function pickColorForUid(uid: string): string {
  let h = 0;
  for (const c of String(uid)) {
    h = (h * 31 + c.charCodeAt(0)) | 0;
  }
  return TRACK_COLORS[Math.abs(h) % TRACK_COLORS.length];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export function isValidTrackColor(color: unknown): color is string {
  return typeof color === "string" && HEX_COLOR.test(color);
}
