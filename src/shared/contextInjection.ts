import { formatSnapshotForInjection } from "./snapshotFormat";
import type {
  LTrackerSettings,
  MessageAttachedSnapshot,
  TrackerSnapshot,
} from "./types";

export interface InjectionDecisionInput {
  settings: LTrackerSettings;
  chatSnapshot: TrackerSnapshot | null;
  messageSnapshot: MessageAttachedSnapshot | null;
  internalTrackerGeneration: boolean;
}

export interface InjectionDecision {
  text: string | null;
  skippedReason: string | null;
  snapshotCreatedAt: string | null;
  sourceMessageId: string | null;
  injectedChars: number;
}

export function shouldSkipContextForInternalGeneration(context: unknown, internalTrackerGeneration: boolean): boolean {
  if (internalTrackerGeneration) return true;
  return pathMatches(context, [
    ["type"],
    ["generationType"],
    ["request", "type"],
    ["input", "type"],
    ["generation", "type"],
    ["generation", "generationType"],
  ], "quiet") || pathMatches(context, [
    ["source"],
    ["metadata", "source"],
    ["request", "source"],
    ["request", "metadata", "source"],
    ["input", "source"],
    ["input", "metadata", "source"],
  ], "ltracker");
}

export function buildInjectionDecision(input: InjectionDecisionInput): InjectionDecision {
  if (input.internalTrackerGeneration) {
    return emptyDecision("Internal LTracker tracker generation.");
  }
  if (!input.settings.injection.enabled) {
    return emptyDecision("Injection is disabled.");
  }

  const selected = input.messageSnapshot ?? input.chatSnapshot;

  if (!selected) {
    return emptyDecision("No cached tracker snapshot exists.");
  }

  const text = formatSnapshotForInjection(selected, input.settings.injection);
  const snapshotCreatedAt = "snapshot" in selected ? selected.snapshot.createdAt : selected.createdAt;
  const sourceMessageId = "snapshot" in selected ? selected.messageId : null;
  return {
    text,
    skippedReason: null,
    snapshotCreatedAt,
    sourceMessageId,
    injectedChars: Array.from(text).length,
  };
}

export function toContextHandlerResult(text: string | null): unknown {
  return text && text.trim() ? text : null;
}

function emptyDecision(skippedReason: string): InjectionDecision {
  return {
    text: null,
    skippedReason,
    snapshotCreatedAt: null,
    sourceMessageId: null,
    injectedChars: 0,
  };
}

function pathMatches(value: unknown, paths: string[][], expected: string): boolean {
  return paths.some((path) => stringAtPath(value, path)?.toLowerCase() === expected);
}

function stringAtPath(value: unknown, path: string[]): string | null {
  let current = value;
  for (const segment of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : null;
}
