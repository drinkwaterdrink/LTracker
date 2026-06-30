import type {
  LTrackerContextFiltersSettings,
  LTrackerSettings,
  TranscriptMessage,
  TranscriptRole,
} from "./types";
import { estimateTokensFromChars } from "./budget";

export interface ContextFilterExcludedMessage {
  index: number;
  role: TranscriptRole;
  name: string;
  reason: string;
}

export interface ContextFilterResult {
  enabled: boolean;
  originalMessages: TranscriptMessage[];
  includedMessages: TranscriptMessage[];
  excludedMessages: ContextFilterExcludedMessage[];
  messageCount: number;
  includedCount: number;
  excludedCount: number;
  excludedNames: string[];
  reasons: string[];
  warning: string | null;
}

export interface ContextBudgetBucket {
  key: string;
  label: string;
  chars: number;
  estimatedTokens: number;
}

export interface ContextBudgetPreview {
  buckets: ContextBudgetBucket[];
  totalChars: number;
  totalEstimatedTokens: number;
}

export interface AutoContextFilterInput {
  settings: LTrackerSettings;
  role: TranscriptRole;
  name: string;
  content: string;
}

function normalize(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value : value.toLowerCase();
}

function listMatches(value: string, patterns: string[], caseSensitive: boolean, exact: boolean): string | null {
  if (!value.trim() || patterns.length === 0) return null;
  const compared = normalize(value.trim(), caseSensitive);
  for (const pattern of patterns) {
    const cleaned = pattern.trim();
    if (!cleaned) continue;
    const next = normalize(cleaned, caseSensitive);
    if (exact ? compared === next : compared.includes(next) || next.includes(compared)) {
      return cleaned;
    }
  }
  return null;
}

function textPatternMatches(value: string, patterns: string[], caseSensitive: boolean): string | null {
  if (!value.trim() || patterns.length === 0) return null;
  const compared = normalize(value, caseSensitive);
  for (const pattern of patterns) {
    const cleaned = pattern.trim();
    if (!cleaned) continue;
    if (compared.includes(normalize(cleaned, caseSensitive))) return cleaned;
  }
  return null;
}

export function looksSystemLikeMessage(message: Pick<TranscriptMessage, "name" | "content">): boolean {
  const head = message.content.trim().slice(0, 80).toLowerCase();
  const name = message.name.trim().toLowerCase();
  return name === "system"
    || name === "narrator"
    || head.startsWith("system:")
    || head.startsWith("[system")
    || head.startsWith("<system")
    || head.startsWith("ooc:")
    || head.startsWith("(ooc")
    || head.startsWith("[ooc")
    || head.startsWith("meta:")
    || head.startsWith("[meta");
}

export function exclusionReasonForMessage(
  message: TranscriptMessage,
  filters: LTrackerContextFiltersSettings,
): string | null {
  if (!filters.enabled) return null;
  if (message.role === "user" && filters.excludeUserMessages) return "user messages disabled";
  if (message.role === "assistant" && filters.excludeAssistantMessages) return "assistant messages disabled";
  if (filters.excludeSystemLikeMessages && looksSystemLikeMessage(message)) return "system/OOC-like message";

  const nameMatch = listMatches(
    message.name,
    filters.excludedCharacterNames,
    filters.caseSensitiveExclusions,
    filters.requireExactCharacterNameMatch,
  );
  if (nameMatch) return `excluded name: ${nameMatch}`;

  const patternMatch = textPatternMatches(
    `${message.name}\n${message.content}`,
    filters.excludedMessageNamePatterns,
    filters.caseSensitiveExclusions,
  );
  if (patternMatch) return `excluded text pattern: ${patternMatch}`;

  return null;
}

export function applyContextFiltersToTranscript(
  messages: TranscriptMessage[],
  filters: LTrackerContextFiltersSettings,
): ContextFilterResult {
  const originalMessages = messages.map((message) => ({ ...message }));
  if (!filters.enabled) {
    return {
      enabled: false,
      originalMessages,
      includedMessages: originalMessages,
      excludedMessages: [],
      messageCount: originalMessages.length,
      includedCount: originalMessages.length,
      excludedCount: 0,
      excludedNames: [],
      reasons: [],
      warning: null,
    };
  }

  if (!filters.includeChatMessages) {
    return {
      enabled: true,
      originalMessages,
      includedMessages: [],
      excludedMessages: originalMessages.map((message) => ({
        index: message.index,
        role: message.role,
        name: message.name,
        reason: "chat messages disabled",
      })),
      messageCount: originalMessages.length,
      includedCount: 0,
      excludedCount: originalMessages.length,
      excludedNames: Array.from(new Set(originalMessages.map((message) => message.name).filter(Boolean))),
      reasons: ["chat messages disabled"],
      warning: "Context filters excluded every chat message.",
    };
  }

  const includedMessages: TranscriptMessage[] = [];
  const excludedMessages: ContextFilterExcludedMessage[] = [];
  const reasons = new Set<string>();
  const excludedNames = new Set<string>();

  for (const message of originalMessages) {
    const reason = exclusionReasonForMessage(message, filters);
    if (!reason) {
      includedMessages.push({ ...message });
      continue;
    }
    excludedMessages.push({
      index: message.index,
      role: message.role,
      name: message.name,
      reason,
    });
    reasons.add(reason);
    if (message.name.trim()) excludedNames.add(message.name.trim());
  }

  return {
    enabled: true,
    originalMessages,
    includedMessages,
    excludedMessages,
    messageCount: originalMessages.length,
    includedCount: includedMessages.length,
    excludedCount: excludedMessages.length,
    excludedNames: Array.from(excludedNames).sort((a, b) => a.localeCompare(b)),
    reasons: Array.from(reasons).sort((a, b) => a.localeCompare(b)),
    warning: originalMessages.length > 0 && includedMessages.length === 0
      ? "Context filters excluded every chat message."
      : null,
  };
}

export function autoSkipReasonForContextFilters(input: AutoContextFilterInput): string | null {
  const filters = input.settings.contextFilters;
  if (!filters.enabled) return null;
  const synthetic: TranscriptMessage = {
    index: 0,
    role: input.role,
    name: input.name,
    content: input.content,
  };
  const reason = exclusionReasonForMessage(synthetic, filters);
  if (!reason) return null;
  if (reason.startsWith("excluded name") && !filters.disableAutoForExcludedNames) return null;
  if (!filters.disableAutoWhenSourceFiltered && !reason.startsWith("excluded name")) return null;
  return `Auto skipped by context filters: ${reason}.`;
}

export function formatContextFilterReport(result: ContextFilterResult): string {
  if (!result.enabled) return "Context filters disabled. All readable chat messages were eligible.";
  const lines = [
    `Messages considered: ${result.messageCount}`,
    `Messages included: ${result.includedCount}`,
    `Messages skipped: ${result.excludedCount}`,
  ];
  if (result.excludedNames.length > 0) lines.push(`Skipped names: ${result.excludedNames.join(", ")}`);
  if (result.reasons.length > 0) lines.push(`Skip reasons: ${result.reasons.join("; ")}`);
  if (result.warning) lines.push(`Warning: ${result.warning}`);
  return lines.join("\n");
}

export function contextBudgetPreview(buckets: Array<{ key: string; label: string; text: string }>): ContextBudgetPreview {
  const normalized = buckets.map((bucket) => {
    const chars = bucket.text.length;
    return {
      key: bucket.key,
      label: bucket.label,
      chars,
      estimatedTokens: estimateTokensFromChars(chars),
    };
  });
  return {
    buckets: normalized,
    totalChars: normalized.reduce((sum, bucket) => sum + bucket.chars, 0),
    totalEstimatedTokens: normalized.reduce((sum, bucket) => sum + bucket.estimatedTokens, 0),
  };
}

export function formatContextBudgetPreview(preview: ContextBudgetPreview): string {
  const lines = preview.buckets.map((bucket) => `${bucket.label}: ~${bucket.estimatedTokens} tokens (${bucket.chars} chars)`);
  lines.push(`Total: ~${preview.totalEstimatedTokens} tokens (${preview.totalChars} chars)`);
  return lines.join("\n");
}
