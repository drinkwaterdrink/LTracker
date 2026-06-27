export function encodeStorageSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => {
    return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

export function snapshotPath(chatId: string): string {
  return `chats/${encodeStorageSegment(chatId)}/latest-snapshot.json`;
}
