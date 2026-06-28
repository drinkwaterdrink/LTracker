import { findLTrackerTags, LTRACKER_TAG_NAME, LTRACKER_TAG_TYPE } from "./embeddedTrackerTag";
import { truncateSafe } from "./snapshotFormat";
import type { LTrackerInjectionSettings } from "./types";
import type { TrackerMemoryEntry } from "./trackerMemory";

export interface PromptInjectionMessage {
  role: "system" | "user" | "assistant";
  content: string | unknown[];
  [key: string]: unknown;
}

export interface PromptInjectionBreakdownEntry {
  messageIndex: number;
  name?: string;
}

export interface PromptInjectionApplyInput {
  messages: readonly Readonly<PromptInjectionMessage>[];
  entries: TrackerMemoryEntry[];
  settings: LTrackerInjectionSettings;
  simulateError?: boolean;
}

export interface PromptInjectionApplyResult {
  messages: PromptInjectionMessage[];
  breakdown: PromptInjectionBreakdownEntry[];
  injectedCount: number;
  injectedChars: number;
  strippedCount: number;
  skippedReason: string | null;
  error: string | null;
  promptTrackerCountBefore: number;
  promptTrackerCountAfter: number;
}

interface TrackerBlockRange {
  messageIndex: number;
  start: number;
  end: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cloneMessages(messages: readonly Readonly<PromptInjectionMessage>[]): PromptInjectionMessage[] {
  return messages.map((message) => ({ ...message }));
}

function stringContent(message: PromptInjectionMessage | Readonly<PromptInjectionMessage>): string | null {
  return typeof message.content === "string" ? message.content : null;
}

function countTrackerBlocks(messages: readonly Readonly<PromptInjectionMessage>[]): number {
  return messages.reduce((count, message) => {
    const content = stringContent(message);
    return content ? count + findLTrackerTags(content).length : count;
  }, 0);
}

function trackerBlockRanges(messages: readonly Readonly<PromptInjectionMessage>[]): TrackerBlockRange[] {
  const ranges: TrackerBlockRange[] = [];
  messages.forEach((message, messageIndex) => {
    const content = stringContent(message);
    if (!content) return;
    for (const tag of findLTrackerTags(content)) {
      ranges.push({ messageIndex, start: tag.start, end: tag.end });
    }
  });
  return ranges.sort((left, right) => {
    if (left.messageIndex !== right.messageIndex) return left.messageIndex - right.messageIndex;
    return left.start - right.start;
  });
}

function stripTrackerBlocks(
  messages: PromptInjectionMessage[],
  retainCount: number,
): { messages: PromptInjectionMessage[]; strippedCount: number } {
  const ranges = trackerBlockRanges(messages);
  if (ranges.length === 0) return { messages, strippedCount: 0 };
  const keepCount = Math.max(0, retainCount);
  const removeCount = Math.max(0, ranges.length - keepCount);
  if (removeCount === 0) return { messages, strippedCount: 0 };
  const remove = ranges.slice(0, removeCount);
  const byMessage = new Map<number, TrackerBlockRange[]>();
  for (const range of remove) {
    const list = byMessage.get(range.messageIndex) ?? [];
    list.push(range);
    byMessage.set(range.messageIndex, list);
  }
  const next = cloneMessages(messages);
  for (const [messageIndex, messageRanges] of byMessage.entries()) {
    const current = next[messageIndex];
    if (!current) continue;
    const content = stringContent(current);
    if (content === null) continue;
    let output = "";
    let cursor = 0;
    for (const range of messageRanges.sort((left, right) => left.start - right.start)) {
      output += content.slice(cursor, range.start);
      cursor = range.end;
    }
    output += content.slice(cursor);
    next[messageIndex] = {
      ...current,
      content: output.replace(/\n{3,}/g, "\n\n").trimEnd(),
    };
  }
  return { messages: next, strippedCount: removeCount };
}

function compactPayload(payload: Record<string, unknown>): string {
  const scene = payload.scene && typeof payload.scene === "object" && !Array.isArray(payload.scene)
    ? payload.scene as Record<string, unknown>
    : {};
  const location = typeof scene.location === "string" ? scene.location : null;
  const time = typeof scene.time === "string" ? scene.time : typeof scene.date === "string" ? scene.date : null;
  const cast = Array.isArray(payload.characters_present)
    ? payload.characters_present.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const name = (item as Record<string, unknown>).name;
          return typeof name === "string" ? name : null;
        }
        return null;
      }).filter((item): item is string => Boolean(item)).slice(0, 6).join("; ")
    : null;
  const threads = Array.isArray(payload.active_threads)
    ? payload.active_threads.filter((item): item is string => typeof item === "string").slice(0, 4).join("; ")
    : null;
  return [
    location ? `Location: ${location}` : null,
    time ? `Time: ${time}` : null,
    cast ? `Present: ${cast}` : null,
    threads ? `Threads: ${threads}` : null,
  ].filter((item): item is string => Boolean(item)).join("\n") || JSON.stringify(payload).slice(0, 500);
}

function minimalPayload(payload: Record<string, unknown>): string {
  const compact = compactPayload(payload).replace(/\n/g, "; ");
  return compact || "Tracker state available.";
}

function formatEntry(entry: TrackerMemoryEntry, settings: LTrackerInjectionSettings): string {
  if (settings.format === "embedded_tag") {
    return `<${LTRACKER_TAG_NAME} type="${LTRACKER_TAG_TYPE}">\n${JSON.stringify(entry.payload, null, 2)}\n</${LTRACKER_TAG_NAME}>`;
  }
  if (settings.format === "pretty_json") {
    return JSON.stringify({
      messageId: entry.messageId,
      messageIndex: entry.messageIndex,
      swipeKey: entry.swipeKey,
      presetId: entry.presetId,
      createdAt: entry.createdAt,
      data: entry.payload,
    }, null, 2);
  }
  if (settings.format === "minimal") return minimalPayload(entry.payload);
  return compactPayload(entry.payload);
}

export function formatTrackerInjectionBlock(
  entries: TrackerMemoryEntry[],
  settings: LTrackerInjectionSettings,
): string {
  const retained = entries.slice(-settings.retainCount);
  const body = retained.map((entry, index) => {
    const label = index === retained.length - 1 ? "Most recent" : `${retained.length - index} turns ago`;
    return `--- ${label} ---\n${formatEntry(entry, settings)}`;
  }).join("\n\n");
  const header = settings.includeHeader ? `${settings.header || "LTracker Recent State"}\n` : "";
  return truncateSafe(`${header}${body}`.trim(), settings.maxInjectedChars);
}

function insertSystemMessage(
  messages: PromptInjectionMessage[],
  content: string,
  placement: LTrackerInjectionSettings["injectionPlacement"],
  fallbackRole: LTrackerInjectionSettings["roleFallback"],
): { messages: PromptInjectionMessage[]; messageIndex: number } {
  const role = fallbackRole;
  const injected: PromptInjectionMessage = { role, content };
  const next = cloneMessages(messages);
  if (placement === "system_before_last" && next.length > 0) {
    const index = Math.max(0, next.length - 1);
    next.splice(index, 0, injected);
    return { messages: next, messageIndex: index };
  }
  if (placement === "system_after_history") {
    const lastHistoryIndex = next.reduce((last, message, index) => message.__isChatHistory ? index : last, -1);
    const index = lastHistoryIndex >= 0 ? lastHistoryIndex + 1 : next.length;
    next.splice(index, 0, injected);
    return { messages: next, messageIndex: index };
  }
  next.push(injected);
  return { messages: next, messageIndex: next.length - 1 };
}

function appendToLastAssistant(
  messages: PromptInjectionMessage[],
  content: string,
  fallbackRole: LTrackerInjectionSettings["roleFallback"],
): { messages: PromptInjectionMessage[]; messageIndex: number } {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || typeof message.content !== "string") continue;
    const next = cloneMessages(messages);
    const existing = message.content.trimEnd();
    next[index] = {
      ...message,
      content: `${existing}${existing ? "\n\n" : ""}${content}`,
    };
    return { messages: next, messageIndex: index };
  }
  return insertSystemMessage(messages, content, "system_after_history", fallbackRole);
}

function applyPromptInjectionUnsafe(input: PromptInjectionApplyInput): PromptInjectionApplyResult {
  if (input.simulateError) throw new Error("Simulated interceptor failure.");
  const before = countTrackerBlocks(input.messages);
  if (!input.settings.enabled) {
    return {
      messages: input.messages as PromptInjectionMessage[],
      breakdown: [],
      injectedCount: 0,
      injectedChars: 0,
      strippedCount: 0,
      skippedReason: "Prompt injection is disabled.",
      error: null,
      promptTrackerCountBefore: before,
      promptTrackerCountAfter: before,
    };
  }

  let working = cloneMessages(input.messages);
  let strippedCount = 0;
  if (input.settings.stripOlderTrackerBlocks) {
    const stripped = stripTrackerBlocks(working, input.settings.retainCount);
    working = stripped.messages;
    strippedCount = stripped.strippedCount;
  }

  const afterStripCount = countTrackerBlocks(working);
  if (input.settings.retainCount <= 0) {
    return {
      messages: working,
      breakdown: [],
      injectedCount: 0,
      injectedChars: 0,
      strippedCount,
      skippedReason: "Prompt injection retain count is 0.",
      error: null,
      promptTrackerCountBefore: before,
      promptTrackerCountAfter: afterStripCount,
    };
  }

  if (input.settings.includeOnlyIfMissingFromPrompt && afterStripCount >= input.settings.retainCount) {
    return {
      messages: working,
      breakdown: [],
      injectedCount: 0,
      injectedChars: 0,
      strippedCount,
      skippedReason: "Prompt already contains retained tracker blocks.",
      error: null,
      promptTrackerCountBefore: before,
      promptTrackerCountAfter: afterStripCount,
    };
  }

  const entries = input.entries.slice(-input.settings.retainCount);
  if (entries.length === 0) {
    return {
      messages: working,
      breakdown: [],
      injectedCount: 0,
      injectedChars: 0,
      strippedCount,
      skippedReason: "No tracker memory entries available for injection.",
      error: null,
      promptTrackerCountBefore: before,
      promptTrackerCountAfter: afterStripCount,
    };
  }

  const block = formatTrackerInjectionBlock(entries, input.settings);
  const inserted = input.settings.injectionPlacement === "append_to_last_assistant"
    ? appendToLastAssistant(working, block, input.settings.roleFallback)
    : insertSystemMessage(working, block, input.settings.injectionPlacement, input.settings.roleFallback);
  const after = countTrackerBlocks(inserted.messages);
  return {
    messages: inserted.messages,
    breakdown: [{ messageIndex: inserted.messageIndex, name: input.settings.header || "LTracker Recent State" }],
    injectedCount: entries.length,
    injectedChars: Array.from(block).length,
    strippedCount,
    skippedReason: null,
    error: null,
    promptTrackerCountBefore: before,
    promptTrackerCountAfter: after,
  };
}

export function applyPromptInjection(input: PromptInjectionApplyInput): PromptInjectionApplyResult {
  try {
    return applyPromptInjectionUnsafe(input);
  } catch (error) {
    const before = countTrackerBlocks(input.messages);
    return {
      messages: input.messages as PromptInjectionMessage[],
      breakdown: [],
      injectedCount: 0,
      injectedChars: 0,
      strippedCount: 0,
      skippedReason: "Prompt injection failed safely.",
      error: errorMessage(error),
      promptTrackerCountBefore: before,
      promptTrackerCountAfter: before,
    };
  }
}

export { countTrackerBlocks };
