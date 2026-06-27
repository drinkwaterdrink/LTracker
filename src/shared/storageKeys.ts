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

export function messageSnapshotPath(chatId: string, messageId: string): string {
  return `${messageSnapshotsPrefix(chatId)}${encodeStorageSegment(messageId)}/tracker-snapshot.json`;
}

export function diagnosticsPath(chatId: string): string {
  return `chats/${encodeStorageSegment(chatId)}/diagnostics.json`;
}

export const SETTINGS_PATH = "settings.json";
