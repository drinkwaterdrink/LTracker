import type {
  LTrackerInjectionIsolationMode,
} from "./types";
import type { TrackerMemoryEntry } from "./trackerMemory";

export type PromptInjectionRejectedReason =
  | "skipped_non_selected_swipe"
  | "skipped_future_message_index"
  | "skipped_message_not_in_prompt"
  | "skipped_global_snapshot_unverified"
  | "skipped_no_selected_swipe_match"
  | "skipped_ambiguous_prompt_boundary";

export interface PromptInjectionBoundary {
  verified: boolean;
  boundaryMessageId: string | null;
  boundaryMessageIndex: number | null;
  latestAssistantMessageId: string | null;
  latestAssistantMessageIndex: number | null;
  selectedSwipeKey: string | null;
  selectedSwipeByMessageId: Record<string, string>;
}

export interface PromptInjectionIsolationResult {
  entries: TrackerMemoryEntry[];
  candidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  rejectedReasons: string[];
  injectedEntryIds: string[];
  sourceSummary: string | null;
  safetyDecision: string;
}

function entryId(entry: TrackerMemoryEntry): string {
  return [
    entry.source,
    entry.messageId ?? "global",
    entry.swipeKey ?? "unknown",
    entry.createdAt,
  ].join(":");
}

function entrySort(left: TrackerMemoryEntry, right: TrackerMemoryEntry): number {
  if (left.messageIndex !== null && right.messageIndex !== null && left.messageIndex !== right.messageIndex) {
    return left.messageIndex - right.messageIndex;
  }
  if (left.messageIndex !== null && right.messageIndex === null) return -1;
  if (left.messageIndex === null && right.messageIndex !== null) return 1;
  return left.createdAt.localeCompare(right.createdAt);
}

function sourceSummary(entries: TrackerMemoryEntry[]): string | null {
  if (entries.length === 0) return null;
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.source}:${entry.messageId ?? "global"}:${entry.swipeKey ?? "unknown"}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([source, count]) => `${source}=${count}`).join(", ");
}

function addReason(reasons: Set<PromptInjectionRejectedReason>, reason: PromptInjectionRejectedReason): void {
  reasons.add(reason);
}

function emptyResult(
  candidateCount: number,
  rejectedReasons: Set<PromptInjectionRejectedReason>,
  safetyDecision: string,
): PromptInjectionIsolationResult {
  return {
    entries: [],
    candidateCount,
    acceptedCount: 0,
    rejectedCount: candidateCount,
    rejectedReasons: [...rejectedReasons],
    injectedEntryIds: [],
    sourceSummary: null,
    safetyDecision,
  };
}

export function isolatePromptInjectionEntries(input: {
  entries: TrackerMemoryEntry[];
  isolationMode: LTrackerInjectionIsolationMode;
  retainCount: number;
  boundary: PromptInjectionBoundary | null;
}): PromptInjectionIsolationResult {
  const rejectedReasons = new Set<PromptInjectionRejectedReason>();
  const candidateCount = input.entries.length;

  if (input.isolationMode === "off") {
    return emptyResult(candidateCount, rejectedReasons, "skipped_isolation_off");
  }

  if (input.isolationMode === "legacy_recent") {
    const entries = [...input.entries].sort(entrySort).slice(-input.retainCount);
    return {
      entries,
      candidateCount,
      acceptedCount: entries.length,
      rejectedCount: Math.max(0, candidateCount - entries.length),
      rejectedReasons: [],
      injectedEntryIds: entries.map(entryId),
      sourceSummary: sourceSummary(entries),
      safetyDecision: entries.length > 0 ? "accepted_legacy_recent" : "skipped_no_candidates",
    };
  }

  const boundary = input.boundary;
  if (!boundary?.verified || boundary.boundaryMessageIndex === null) {
    addReason(rejectedReasons, "skipped_ambiguous_prompt_boundary");
    return emptyResult(candidateCount, rejectedReasons, "skipped_ambiguous_prompt_boundary");
  }

  if (!boundary.latestAssistantMessageId || !boundary.selectedSwipeKey) {
    addReason(rejectedReasons, "skipped_no_selected_swipe_match");
    return emptyResult(candidateCount, rejectedReasons, "skipped_no_selected_swipe_match");
  }

  const accepted: TrackerMemoryEntry[] = [];
  let rejectedCount = 0;

  for (const entry of input.entries) {
    const reasons = new Set<PromptInjectionRejectedReason>();

    if (!entry.messageId) {
      addReason(reasons, "skipped_global_snapshot_unverified");
    } else {
      const selectedSwipe = boundary.selectedSwipeByMessageId[entry.messageId];
      if (!selectedSwipe) {
        addReason(reasons, "skipped_message_not_in_prompt");
      }
      if (entry.messageIndex !== null && entry.messageIndex > boundary.boundaryMessageIndex) {
        addReason(reasons, "skipped_future_message_index");
      }
      if (!entry.swipeKey || (selectedSwipe && entry.swipeKey !== selectedSwipe)) {
        addReason(reasons, "skipped_non_selected_swipe");
      }
      if (
        (input.isolationMode === "latest_selected_swipe_only" || input.isolationMode === "same_message_selected_swipe_only")
        && (
          entry.messageId !== boundary.latestAssistantMessageId
          || entry.swipeKey !== boundary.selectedSwipeKey
        )
      ) {
        addReason(reasons, "skipped_no_selected_swipe_match");
      }
    }

    if (reasons.size > 0) {
      rejectedCount += 1;
      for (const reason of reasons) rejectedReasons.add(reason);
      continue;
    }

    accepted.push(entry);
  }

  const hasLatestSelected = accepted.some((entry) => (
    entry.messageId === boundary.latestAssistantMessageId
    && entry.swipeKey === boundary.selectedSwipeKey
  ));
  if (!hasLatestSelected) {
    addReason(rejectedReasons, "skipped_no_selected_swipe_match");
    return emptyResult(candidateCount, rejectedReasons, "skipped_no_selected_swipe_match");
  }

  const retained = [...accepted].sort(entrySort).slice(-Math.max(0, input.retainCount));
  return {
    entries: retained,
    candidateCount,
    acceptedCount: retained.length,
    rejectedCount: rejectedCount + Math.max(0, accepted.length - retained.length),
    rejectedReasons: [...rejectedReasons],
    injectedEntryIds: retained.map(entryId),
    sourceSummary: sourceSummary(retained),
    safetyDecision: retained.length > 0 ? "accepted_swipe_isolated" : "skipped_no_candidates",
  };
}

export function buildPromptInjectionSafetyReport(input: {
  enabled: boolean;
  isolationMode: LTrackerInjectionIsolationMode;
  boundary: PromptInjectionBoundary | null;
  result: PromptInjectionIsolationResult;
}): string {
  const boundary = input.boundary;
  return [
    "Prompt Injection Safety Report",
    `enabled: ${input.enabled ? "yes" : "no"}`,
    `isolationMode: ${input.isolationMode}`,
    `boundaryMessageId: ${boundary?.boundaryMessageId ?? "unverified"}`,
    `boundaryMessageIndex: ${boundary?.boundaryMessageIndex ?? "unverified"}`,
    `latestAssistantMessageId: ${boundary?.latestAssistantMessageId ?? "unverified"}`,
    `selectedSwipeKey: ${boundary?.selectedSwipeKey ?? "unverified"}`,
    `candidatesConsidered: ${input.result.candidateCount}`,
    `candidatesInjected: ${input.result.acceptedCount}`,
    `candidatesRejected: ${input.result.rejectedCount}`,
    `rejectedReasons: ${input.result.rejectedReasons.join(", ") || "none"}`,
    `injectedEntryIds: ${input.result.injectedEntryIds.join(", ") || "none"}`,
    `sourceSummary: ${input.result.sourceSummary ?? "none"}`,
    `safetyDecision: ${input.result.safetyDecision}`,
  ].join("\n");
}
