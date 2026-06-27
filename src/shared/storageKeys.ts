export function encodeStorageSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => {
    return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

export function snapshotPath(chatId: string): string {
  return `chats/${encodeStorageSegment(chatId)}/latest-snapshot.json`;
}

export function messageSnapshotsPrefix(chatId: string): string {
  return `chats/${encodeStorageSegment(chatId)}/messages/`;
}

export function legacyMessageSnapshotPath(chatId: string, messageId: string): string {
  return `${messageSnapshotsPrefix(chatId)}${encodeStorageSegment(messageId)}/tracker-snapshot.json`;
}

export function messageSnapshotPath(chatId: string, messageId: string, swipeKey = "default"): string {
  return `${messageSnapshotsPrefix(chatId)}${encodeStorageSegment(messageId)}/swipes/${encodeStorageSegment(swipeKey)}/tracker-snapshot.json`;
}

export function messageSnapshotIndexPath(chatId: string): string {
  return `chats/${encodeStorageSegment(chatId)}/message-snapshots/index.json`;
}

export function diagnosticsPath(chatId: string): string {
  return `chats/${encodeStorageSegment(chatId)}/diagnostics.json`;
}

export function activePresetPath(chatId: string): string {
  return `chats/${encodeStorageSegment(chatId)}/active-preset.json`;
}

export function presetPath(presetId: string): string {
  return `presets/${encodeStorageSegment(presetId)}.json`;
}

export const PRESETS_INDEX_PATH = "presets/index.json";
export const SETTINGS_PATH = "settings.json";
