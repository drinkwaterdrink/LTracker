import { truncateSafe } from "./snapshotFormat";
import type {
  LTrackerMemorySettings,
  TrackerSchemaPreset,
  TrackerTriggerSource,
  MessageSnapshotIndexEntry,
} from "./types";

export interface TrackerMemoryEntry {
  messageId: string | null;
  messageIndex: number | null;
  swipeKey: string | null;
  presetId: string | null;
  presetName: string | null;
  createdAt: string;
  source: "sidecar_snapshot" | "embedded_tag" | "latest_chat_snapshot" | "history_scan";
  payload: Record<string, unknown>;
  text: string;
}

export interface TrackerMemoryResult {
  entries: TrackerMemoryEntry[];
  renderedText: string;
  totalChars: number;
  truncated: boolean;
  skippedReason: string | null;
}

export interface TrackerMemoryBuildOptions {
  targetMessageId?: string | null;
  targetMessageIndex?: number | null;
  targetSwipeKey?: string | null;
  activePreset?: TrackerSchemaPreset | null;
}

const EMPTY_MEMORY: TrackerMemoryResult = {
  entries: [],
  renderedText: "",
  totalChars: 0,
  truncated: false,
  skippedReason: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function primitiveToString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(payload: Record<string, unknown>): string {
  const value = stableJson(payload);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function entrySort(left: TrackerMemoryEntry, right: TrackerMemoryEntry): number {
  if (left.messageIndex !== null && right.messageIndex !== null && left.messageIndex !== right.messageIndex) {
    return left.messageIndex - right.messageIndex;
  }
  if (left.messageIndex !== null && right.messageIndex === null) return -1;
  if (left.messageIndex === null && right.messageIndex !== null) return 1;
  const created = left.createdAt.localeCompare(right.createdAt);
  if (created !== 0) return created;
  const leftMessage = left.messageId ?? "";
  const rightMessage = right.messageId ?? "";
  if (leftMessage !== rightMessage) return leftMessage.localeCompare(rightMessage);
  return (left.swipeKey ?? "").localeCompare(right.swipeKey ?? "");
}

function sourceAllowed(source: TrackerMemoryEntry["source"], setting: LTrackerMemorySettings["source"]): boolean {
  if (setting === "hybrid") return true;
  if (setting === "sidecar_index") return source === "sidecar_snapshot" || source === "latest_chat_snapshot";
  if (setting === "embedded_tags") return source === "embedded_tag";
  return source === "history_scan";
}

function shouldExcludeTarget(entry: TrackerMemoryEntry, options: TrackerMemoryBuildOptions): boolean {
  if (!options.targetMessageId) return false;
  if (entry.messageId !== options.targetMessageId) return false;
  if (!options.targetSwipeKey) return true;
  return (entry.swipeKey ?? "default") === options.targetSwipeKey;
}

function compactValue(value: unknown): string | null {
  const primitive = primitiveToString(value);
  if (primitive) return primitive;
  if (Array.isArray(value)) {
    const rendered = value
      .map((item) => {
        const itemPrimitive = primitiveToString(item);
        if (itemPrimitive) return itemPrimitive;
        if (isRecord(item)) {
          return primitiveToString(item.name) ?? primitiveToString(item.title) ?? primitiveToString(item.id);
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
    return rendered.length > 0 ? rendered.slice(0, 5).join("; ") : null;
  }
  if (isRecord(value)) {
    for (const key of ["location", "time", "date", "mood", "status", "name", "title", "summary"]) {
      const rendered = primitiveToString(value[key]);
      if (rendered) return rendered;
    }
  }
  return null;
}

function compactPayloadSummary(payload: Record<string, unknown>): string {
  const scene = isRecord(payload.scene) ? payload.scene : null;
  const sceneParts = [
    scene ? compactValue(scene.location) : null,
    scene ? compactValue(scene.time) ?? compactValue(scene.date) : null,
    scene ? compactValue(scene.mood) : null,
  ].filter((item): item is string => Boolean(item));
  const characters = compactValue(payload.characters_present ?? payload.characters ?? payload.present_characters);
  const threads = compactValue(payload.active_threads ?? payload.unresolved_continuity ?? payload.important_facts);
  const parts = [
    sceneParts.length > 0 ? `scene ${sceneParts.join(", ")}` : null,
    characters ? `present ${characters}` : null,
    threads ? `threads ${threads}` : null,
  ].filter((item): item is string => Boolean(item));
  return parts.length > 0 ? parts.join(" | ") : JSON.stringify(payload).slice(0, 240);
}

function entryText(entry: TrackerMemoryEntry, compact: boolean): string {
  if (compact) return compactPayloadSummary(entry.payload);
  if (entry.text.trim()) return entry.text.trim();
  return JSON.stringify(entry.payload, null, 2);
}

function labelForEntry(index: number, total: number): string {
  if (index === total - 1) return "Most recent";
  const turnsAgo = total - index;
  return `${turnsAgo} turns ago`;
}

export function buildTrackerMemoryResult(
  rawEntries: TrackerMemoryEntry[],
  settings: LTrackerMemorySettings,
  options: TrackerMemoryBuildOptions = {},
): TrackerMemoryResult {
  if (!settings.enabled) return { ...EMPTY_MEMORY, skippedReason: "Tracker memory is disabled." };
  if (settings.retainCount <= 0) return { ...EMPTY_MEMORY, skippedReason: "Tracker memory retain count is 0." };

  let candidates = rawEntries
    .filter((entry) => sourceAllowed(entry.source, settings.source))
    .filter((entry) => !settings.excludeTargetMessage || !shouldExcludeTarget(entry, options));

  if (settings.requireSamePreset && options.activePreset) {
    candidates = candidates.filter((entry) => entry.presetId === options.activePreset?.id);
  }

  if (settings.requireSameSwipeWhenAvailable && options.targetSwipeKey) {
    const sameSwipe = candidates.filter((entry) => (entry.swipeKey ?? "default") === options.targetSwipeKey);
    if (sameSwipe.length > 0) candidates = sameSwipe;
  }

  const deduped: TrackerMemoryEntry[] = [];
  const seen = new Set<string>();
  for (const entry of candidates.sort(entrySort)) {
    const key = hashPayload(entry.payload);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  if (deduped.length === 0) return { ...EMPTY_MEMORY, skippedReason: "No prior tracker snapshots found." };

  const retained = deduped.slice(-settings.retainCount);
  const oldestToNewest = retained.sort(entrySort);
  const renderOrder = settings.order === "newest_to_oldest" ? [...oldestToNewest].reverse() : oldestToNewest;
  const fullCount = Math.min(settings.fullSnapshotCount, renderOrder.length);
  const fullStart = Math.max(0, renderOrder.length - fullCount);
  const renderedEntries: TrackerMemoryEntry[] = [];
  const blocks: string[] = [];
  let omittedOlder = 0;

  renderOrder.forEach((entry, index) => {
    const isFull = index >= fullStart;
    if (!isFull && !settings.compactOlderSnapshots) {
      omittedOlder += 1;
      return;
    }
    renderedEntries.push(entry);
    blocks.push(`--- ${labelForEntry(index, renderOrder.length)} ---\n${entryText(entry, !isFull)}`);
  });

  if (blocks.length === 0) {
    return { ...EMPTY_MEMORY, skippedReason: "Tracker memory sunset omitted all retained entries." };
  }

  const warning = omittedOlder > 0
    ? `\n[${omittedOlder} older tracker snapshot${omittedOlder === 1 ? "" : "s"} omitted by sunset settings.]`
    : "";
  const rawText = `Previous tracker states:\n${blocks.join("\n\n")}${warning}`;
  const renderedText = truncateSafe(rawText, settings.maxMemoryChars);
  return {
    entries: renderedEntries,
    renderedText,
    totalChars: Array.from(renderedText).length,
    truncated: renderedText !== rawText,
    skippedReason: null,
  };
}

export function trackerMemorySourceSummary(entries: TrackerMemoryEntry[]): string | null {
  if (entries.length === 0) return null;
  const counts = new Map<TrackerMemoryEntry["source"], number>();
  for (const entry of entries) counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  return [...counts.entries()].map(([source, count]) => `${source}:${count}`).join(", ");
}

export function memoryOptionsFromTrigger(
  trigger: TrackerTriggerSource,
  activePreset: TrackerSchemaPreset,
): TrackerMemoryBuildOptions {
  if (trigger.kind === "manual") {
    return { activePreset };
  }
  return {
    activePreset,
    targetMessageId: trigger.sourceMessageId,
    targetMessageIndex: trigger.sourceMessageIndex,
    targetSwipeKey: trigger.swipeKey,
  };
}

export function selectTrackerMemoryCandidates(
  index: MessageSnapshotIndexEntry[],
  settings: LTrackerMemorySettings,
  options: TrackerMemoryBuildOptions = {},
): MessageSnapshotIndexEntry[] {
  if (!settings.enabled || settings.retainCount <= 0) return [];

  // 1. Cheap filters from index metadata before loading where possible
  let filtered = index.filter((entry) => {
    // Exclude target message/swipe
    if (settings.excludeTargetMessage && options.targetMessageId) {
      if (entry.messageId === options.targetMessageId) {
        if (!options.targetSwipeKey || entry.swipeKey === options.targetSwipeKey) {
          return false;
        }
      }
    }
    // Same preset filter if index has presetId
    if (settings.requireSamePreset && options.activePreset && entry.presetId) {
      if (entry.presetId !== options.activePreset.id) return false;
    }
    // Same swipe filter if index has swipeKey
    if (settings.requireSameSwipeWhenAvailable && options.targetSwipeKey && entry.swipeKey) {
      if (entry.swipeKey !== options.targetSwipeKey) return false;
    }
    return true;
  });

  // 2. Deduplicate index entries by messageId + swipeKey, keeping the latest entry (by createdAt)
  const dedupedMap = new Map<string, MessageSnapshotIndexEntry>();
  for (const entry of filtered) {
    const key = `${entry.messageId}:${entry.swipeKey}`;
    const existing = dedupedMap.get(key);
    if (!existing || entry.createdAt.localeCompare(existing.createdAt) > 0) {
      dedupedMap.set(key, entry);
    }
  }
  const deduped = Array.from(dedupedMap.values());

  // 3. Sort candidates by recency first (newest to oldest)
  const sortedNewestToOldest = deduped.sort((left, right) => {
    if (left.messageIndex !== null && right.messageIndex !== null && left.messageIndex !== right.messageIndex) {
      return right.messageIndex - left.messageIndex;
    }
    if (left.messageIndex !== null && right.messageIndex === null) return 1;
    if (left.messageIndex === null && right.messageIndex !== null) return -1;
    return right.createdAt.localeCompare(left.createdAt);
  });

  // 4. Select the candidate load window
  const targetRetain = Math.max(settings.retainCount, settings.fullSnapshotCount ?? 3, 1);
  const candidateWindowSize = Math.min(
    sortedNewestToOldest.length,
    Math.max(targetRetain * 6 + 10, targetRetain + 20)
  );
  
  const selectedCandidates = sortedNewestToOldest.slice(0, candidateWindowSize);

  // 5. Sort selected candidates back to oldest-to-newest for loading order
  return selectedCandidates.sort((left, right) => {
    if (left.messageIndex !== null && right.messageIndex !== null && left.messageIndex !== right.messageIndex) {
      return left.messageIndex - right.messageIndex;
    }
    if (left.messageIndex !== null && right.messageIndex === null) return -1;
    if (left.messageIndex === null && right.messageIndex !== null) return 1;
    return left.createdAt.localeCompare(right.createdAt);
  });
}
