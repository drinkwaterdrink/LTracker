import type { LTrackerAutoTimingSettings } from "./types";

export interface AutoFinalizationSnapshot {
  messageId: string;
  swipeKey: string;
  content: string;
}

export interface AutoFinalizationDecision {
  passed: boolean;
  contentHash: string | null;
  skippedReason: string | null;
}

export function stableContentHash(content: string): string {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function shouldCancelPendingSwipe(
  pending: Pick<AutoFinalizationSnapshot, "messageId" | "swipeKey">,
  next: Pick<AutoFinalizationSnapshot, "messageId" | "swipeKey">,
  settings: LTrackerAutoTimingSettings,
): boolean {
  return settings.cancelPendingOnSwipeChange
    && pending.messageId === next.messageId
    && pending.swipeKey !== next.swipeKey;
}

export function evaluateStableSwipeContent(
  first: AutoFinalizationSnapshot | null,
  second: AutoFinalizationSnapshot | null,
  settings: LTrackerAutoTimingSettings,
): AutoFinalizationDecision {
  if (!first || !second) {
    return {
      passed: false,
      contentHash: null,
      skippedReason: "Assistant message was not found during finalization.",
    };
  }
  const firstContent = first.content.trim();
  const secondContent = second.content.trim();
  if (!secondContent) {
    return {
      passed: false,
      contentHash: null,
      skippedReason: "Final assistant swipe content is empty.",
    };
  }
  if (first.messageId !== second.messageId || first.swipeKey !== second.swipeKey) {
    return {
      passed: false,
      contentHash: stableContentHash(secondContent),
      skippedReason: "Selected swipe changed before tracker generation.",
    };
  }
  const firstHash = stableContentHash(firstContent);
  const secondHash = stableContentHash(secondContent);
  if (settings.requireStableSwipeContent && firstHash !== secondHash) {
    return {
      passed: false,
      contentHash: secondHash,
      skippedReason: "Assistant swipe content changed during stable-content check.",
    };
  }
  return {
    passed: true,
    contentHash: secondHash,
    skippedReason: null,
  };
}
