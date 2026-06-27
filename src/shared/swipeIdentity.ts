import type {
  SwipeKeySource,
  SwipeTrackerIdentity,
} from "./types";

export const DEFAULT_SWIPE_KEY = "default";

interface SwipeIdentityMessageLike {
  id: string;
  content?: string;
  swipe_id?: number | string | null;
  swipeId?: string | number | null;
  activeSwipeId?: string | number | null;
  selectedSwipeId?: string | number | null;
  swipes?: unknown;
  extra?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeKeyPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80) || DEFAULT_SWIPE_KEY;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function stringOrNumberAsString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.max(0, Math.round(value)));
  return null;
}

function officialSwipeId(message: SwipeIdentityMessageLike): string | null {
  const direct = stringOrNumberAsString(message.swipeId)
    ?? stringOrNumberAsString(message.activeSwipeId)
    ?? stringOrNumberAsString(message.selectedSwipeId);
  if (direct) return direct;
  if (!isRecord(message.extra)) return null;
  return stringOrNumberAsString(message.extra.swipeId)
    ?? stringOrNumberAsString(message.extra.activeSwipeId)
    ?? stringOrNumberAsString(message.extra.selectedSwipeId)
    ?? stringOrNumberAsString(message.extra.swipe_id);
}

export function hashSwipeContent(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function deriveSwipeTrackerIdentity(
  chatId: string,
  message: SwipeIdentityMessageLike,
): SwipeTrackerIdentity {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  const swipeIndex = numberOrNull(typeof message.swipe_id === "number" ? message.swipe_id : null);
  const activeContent = swipeIndex !== null && typeof swipes[swipeIndex] === "string"
    ? swipes[swipeIndex]
    : typeof message.content === "string" ? message.content : "";
  const swipeContentHash = activeContent ? hashSwipeContent(activeContent) : null;

  const swipeId = officialSwipeId(message);
  if (swipeId) {
    return {
      chatId,
      messageId: message.id,
      swipeKey: `id-${normalizeKeyPart(swipeId)}`,
      swipeIndex,
      swipeId,
      swipeContentHash,
      swipeKeySource: "swipe_id",
    };
  }

  if (swipeIndex !== null) {
    return {
      chatId,
      messageId: message.id,
      swipeKey: `index-${swipeIndex}`,
      swipeIndex,
      swipeId: null,
      swipeContentHash,
      swipeKeySource: "swipe_index",
    };
  }

  if (swipeContentHash) {
    return {
      chatId,
      messageId: message.id,
      swipeKey: `hash-${swipeContentHash}`,
      swipeIndex: null,
      swipeId: null,
      swipeContentHash,
      swipeKeySource: "content_hash",
    };
  }

  return defaultSwipeIdentity(chatId, message.id);
}

export function defaultSwipeIdentity(chatId: string, messageId: string): SwipeTrackerIdentity {
  return {
    chatId,
    messageId,
    swipeKey: DEFAULT_SWIPE_KEY,
    swipeIndex: null,
    swipeId: null,
    swipeContentHash: null,
    swipeKeySource: "unknown",
  };
}

export function swipeIdentityKey(identity: Pick<SwipeTrackerIdentity, "messageId" | "swipeKey">): string {
  return `${identity.messageId}:${identity.swipeKey}`;
}

export function swipeKeySourceOrUnknown(value: unknown): SwipeKeySource {
  return value === "swipe_id" || value === "swipe_index" || value === "content_hash" || value === "unknown"
    ? value
    : "unknown";
}
