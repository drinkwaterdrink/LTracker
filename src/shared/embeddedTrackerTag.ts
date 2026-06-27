import { EXTENSION_VERSION } from "./types";

export const LTRACKER_TAG_NAME = "ltracker";
export const LTRACKER_TAG_TYPE = "state";

export interface LTrackerTagMatch {
  fullMatch: string;
  content: string;
  attrs: Record<string, string>;
  start: number;
  end: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeAttrValue(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function parseTagAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const key = match[1]?.toLowerCase();
    if (!key) continue;
    attrs[key] = normalizeAttrValue(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

export function buildLTrackerTag(jsonText: string, swipeKey: string, version = EXTENSION_VERSION): string {
  return `<${LTRACKER_TAG_NAME} type="${LTRACKER_TAG_TYPE}" version="${escapeAttribute(version)}" swipe="${escapeAttribute(swipeKey)}">\n${jsonText.trim()}\n</${LTRACKER_TAG_NAME}>`;
}

export function findLTrackerTags(content: string): LTrackerTagMatch[] {
  const tag = escapeRegex(LTRACKER_TAG_NAME);
  const pattern = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const matches: LTrackerTagMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const attrs = parseTagAttributes(match[1] ?? "");
    if (attrs.type && attrs.type !== LTRACKER_TAG_TYPE) continue;
    matches.push({
      fullMatch: match[0],
      content: (match[2] ?? "").trim(),
      attrs,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return matches;
}

export function findLTrackerTagForSwipe(content: string, swipeKey: string): LTrackerTagMatch | null {
  return findLTrackerTags(content).find((tag) => (tag.attrs.swipe || "default") === swipeKey) ?? null;
}

export function upsertLTrackerTag(
  content: string,
  jsonText: string,
  swipeKey: string,
  placement: "append" | "prepend" = "append",
): { content: string; inserted: boolean; replaced: boolean } {
  const tag = buildLTrackerTag(jsonText, swipeKey);
  const existing = findLTrackerTagForSwipe(content, swipeKey);
  if (existing) {
    return {
      content: `${content.slice(0, existing.start)}${tag}${content.slice(existing.end)}`,
      inserted: false,
      replaced: true,
    };
  }
  const trimmed = content.trimEnd();
  return {
    content: placement === "prepend"
      ? `${tag}\n\n${content.trimStart()}`
      : `${trimmed}${trimmed ? "\n\n" : ""}${tag}`,
    inserted: true,
    replaced: false,
  };
}

export function removeLTrackerTag(
  content: string,
  swipeKey: string,
): { content: string; removed: boolean } {
  const existing = findLTrackerTagForSwipe(content, swipeKey);
  if (!existing) return { content, removed: false };
  const next = `${content.slice(0, existing.start)}${content.slice(existing.end)}`
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return { content: next, removed: true };
}
