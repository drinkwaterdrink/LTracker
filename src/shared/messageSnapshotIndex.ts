import type {
  MessageAttachedSnapshot,
  MessageSnapshotIndexEntry,
  TrackerSnapshot,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function messageIndexOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function repairIndexEntry(value: unknown): MessageSnapshotIndexEntry | null {
  if (!isRecord(value) || typeof value.messageId !== "string" || typeof value.storageKey !== "string") {
    return null;
  }
  return {
    messageId: value.messageId,
    messageIndex: messageIndexOrNull(value.messageIndex),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    presetId: stringOrNull(value.presetId),
    presetName: stringOrNull(value.presetName),
    storageKey: value.storageKey,
  };
}

export function repairMessageSnapshotIndex(value: unknown): MessageSnapshotIndexEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const repaired: MessageSnapshotIndexEntry[] = [];
  for (const item of value) {
    const entry = repairIndexEntry(item);
    if (!entry || seen.has(entry.messageId)) continue;
    seen.add(entry.messageId);
    repaired.push(entry);
  }
  return sortMessageSnapshotIndex(repaired);
}

export function sortMessageSnapshotIndex(index: MessageSnapshotIndexEntry[]): MessageSnapshotIndexEntry[] {
  return [...index].sort((left, right) => {
    if (left.messageIndex !== null && right.messageIndex !== null && left.messageIndex !== right.messageIndex) {
      return left.messageIndex - right.messageIndex;
    }
    if (left.messageIndex !== null && right.messageIndex === null) return -1;
    if (left.messageIndex === null && right.messageIndex !== null) return 1;
    const created = left.createdAt.localeCompare(right.createdAt);
    return created !== 0 ? created : left.messageId.localeCompare(right.messageId);
  });
}

export function upsertMessageSnapshotIndexEntry(
  index: MessageSnapshotIndexEntry[],
  entry: MessageSnapshotIndexEntry,
): MessageSnapshotIndexEntry[] {
  const next = index.filter((item) => item.messageId !== entry.messageId);
  next.push(entry);
  return sortMessageSnapshotIndex(next);
}

export function normalizeTrackerSnapshotPresetMetadata(snapshot: TrackerSnapshot): TrackerSnapshot {
  return {
    ...snapshot,
    presetId: snapshot.presetId ?? null,
    presetName: snapshot.presetName ?? null,
    presetVersion: snapshot.presetVersion ?? null,
  };
}

export function normalizeMessageAttachedSnapshotPresetMetadata(
  snapshot: MessageAttachedSnapshot,
): MessageAttachedSnapshot {
  const normalizedSnapshot = normalizeTrackerSnapshotPresetMetadata(snapshot.snapshot);
  return {
    ...snapshot,
    presetId: snapshot.presetId ?? normalizedSnapshot.presetId ?? null,
    presetName: snapshot.presetName ?? normalizedSnapshot.presetName ?? null,
    presetVersion: snapshot.presetVersion ?? normalizedSnapshot.presetVersion ?? null,
    snapshot: normalizedSnapshot,
  };
}
