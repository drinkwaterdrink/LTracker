import type {
  MessageAttachedSnapshot,
  MessageSnapshotIndexEntry,
  TrackerSnapshot,
} from "./types";
import { normalizePresetRenderLock } from "./presetRenderLock";
import {
  DEFAULT_SWIPE_KEY,
  swipeIdentityKey,
  swipeKeySourceOrUnknown,
} from "./swipeIdentity";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function messageIndexOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function swipeKeyOrDefault(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : DEFAULT_SWIPE_KEY;
}

function repairIndexEntry(value: unknown): MessageSnapshotIndexEntry | null {
  if (!isRecord(value) || typeof value.messageId !== "string" || typeof value.storageKey !== "string") {
    return null;
  }
  return {
    messageId: value.messageId,
    messageIndex: messageIndexOrNull(value.messageIndex),
    swipeKey: swipeKeyOrDefault(value.swipeKey),
    swipeIndex: messageIndexOrNull(value.swipeIndex),
    swipeId: stringOrNull(value.swipeId),
    swipeContentHash: stringOrNull(value.swipeContentHash),
    swipeKeySource: swipeKeySourceOrUnknown(value.swipeKeySource),
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
    if (!entry) continue;
    const key = swipeIdentityKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
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
    if (left.messageId !== right.messageId) return left.messageId.localeCompare(right.messageId);
    if (left.swipeIndex !== null && right.swipeIndex !== null && left.swipeIndex !== right.swipeIndex) {
      return left.swipeIndex - right.swipeIndex;
    }
    if (left.swipeIndex !== null && right.swipeIndex === null) return -1;
    if (left.swipeIndex === null && right.swipeIndex !== null) return 1;
    const created = left.createdAt.localeCompare(right.createdAt);
    return created !== 0 ? created : left.swipeKey.localeCompare(right.swipeKey);
  });
}

export function upsertMessageSnapshotIndexEntry(
  index: MessageSnapshotIndexEntry[],
  entry: MessageSnapshotIndexEntry,
): MessageSnapshotIndexEntry[] {
  const next = index.filter((item) => swipeIdentityKey(item) !== swipeIdentityKey(entry));
  next.push(entry);
  return sortMessageSnapshotIndex(next);
}

export function removeMessageSnapshotIndexEntry(
  index: MessageSnapshotIndexEntry[],
  messageId: string,
  swipeKey: string,
): MessageSnapshotIndexEntry[] {
  return sortMessageSnapshotIndex(index.filter((item) => item.messageId !== messageId || item.swipeKey !== swipeKey));
}

export function normalizeTrackerSnapshotPresetMetadata(snapshot: TrackerSnapshot): TrackerSnapshot {
  return {
    ...snapshot,
    presetId: snapshot.presetId ?? null,
    presetName: snapshot.presetName ?? null,
    presetVersion: snapshot.presetVersion ?? null,
    generationStartedAt: snapshot.generationStartedAt ?? null,
    generationCompletedAt: snapshot.generationCompletedAt ?? null,
    generationDurationMs: typeof snapshot.generationDurationMs === "number" && Number.isFinite(snapshot.generationDurationMs)
      ? Math.max(0, Math.round(snapshot.generationDurationMs))
      : null,
    generationCancelledAt: snapshot.generationCancelledAt ?? null,
    generationStatus: snapshot.generationStatus === "completed"
      || snapshot.generationStatus === "cancelled"
      || snapshot.generationStatus === "failed"
      ? snapshot.generationStatus
      : null,
    editedAt: snapshot.editedAt ?? null,
    editedByUser: snapshot.editedByUser === true,
    presetRenderLock: normalizePresetRenderLock(snapshot.presetRenderLock),
  };
}

export function normalizeMessageAttachedSnapshotPresetMetadata(
  snapshot: MessageAttachedSnapshot,
): MessageAttachedSnapshot {
  const normalizedSnapshot = normalizeTrackerSnapshotPresetMetadata(snapshot.snapshot);
  return {
    ...snapshot,
    swipeKey: snapshot.swipeKey ?? DEFAULT_SWIPE_KEY,
    swipeIndex: snapshot.swipeIndex ?? null,
    swipeId: snapshot.swipeId ?? null,
    swipeContentHash: snapshot.swipeContentHash ?? null,
    swipeKeySource: swipeKeySourceOrUnknown(snapshot.swipeKeySource),
    presetId: snapshot.presetId ?? normalizedSnapshot.presetId ?? null,
    presetName: snapshot.presetName ?? normalizedSnapshot.presetName ?? null,
    presetVersion: snapshot.presetVersion ?? normalizedSnapshot.presetVersion ?? null,
    snapshot: normalizedSnapshot,
  };
}
