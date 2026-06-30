import { DEFAULT_TRACKER_PRESET } from "./presets";
import type {
  PromptMessage,
  TrackerSchemaPreset,
  TranscriptMessage,
} from "./types";
import type { TrackerMemoryResult } from "./trackerMemory";

const DEFAULT_MAX_MESSAGE_CHARS = 8_000;

export interface TrackerPromptContextBlock {
  title: string;
  text: string;
}

export interface TrackerPromptContextOptions {
  contextBlocks?: TrackerPromptContextBlock[];
  filterSummary?: string | null;
}

export function buildCompactTranscript(
  messages: TranscriptMessage[],
  maxMessageChars = DEFAULT_MAX_MESSAGE_CHARS,
  maxTranscriptChars = Number.POSITIVE_INFINITY,
): string {
  const blocks: string[] = [];
  let remaining = Number.isFinite(maxTranscriptChars) ? Math.max(0, maxTranscriptChars) : Number.POSITIVE_INFINITY;
  for (const message of messages) {
    if (remaining <= 0) break;
    const role = message.role === "user" ? "USER" : "ASSISTANT";
    const name = message.name ? ` ${message.name}` : "";
    const limit = Math.min(maxMessageChars, remaining);
    const content = message.content.trim().slice(0, limit);
    const block = `[${message.index} ${role}${name}]\n${content}`;
    blocks.push(block);
    remaining -= block.length + 2;
  }
  if (blocks.length < messages.length) {
    blocks.unshift(`[LTracker omitted ${messages.length - blocks.length} earlier message${messages.length - blocks.length === 1 ? "" : "s"} because the prompt budget was reached.]`);
  }
  return blocks.join("\n\n");
}

export function buildTrackerPrompt(
  transcript: string,
  preset: TrackerSchemaPreset = DEFAULT_TRACKER_PRESET,
  memory: TrackerMemoryResult | null = null,
  options: TrackerPromptContextOptions = {},
): PromptMessage[] {
  const hasMemory = Boolean(memory?.renderedText.trim());
  const contextBlocks = (options.contextBlocks ?? []).filter((block) => block.text.trim());
  const hasContextBlocks = contextBlocks.length > 0;
  const filterSummary = options.filterSummary?.trim() ?? "";
  return [
    {
      role: "system",
      content: [
        "You extract the current state of an ongoing roleplay or story chat.",
        "Return JSON only. Do not wrap the JSON in Markdown.",
        "Do not invent facts unsupported by the transcript.",
        "The current transcript has higher priority than any prior tracker memory.",
        "If prior tracker memory contradicts the current transcript, the current transcript wins.",
        hasContextBlocks
          ? "Additional context sections are background references only. The current transcript still wins if sources disagree."
          : null,
        hasMemory
          ? "Use the most recent prior tracker state as the baseline. Mutate only fields that the new transcript actually changes. Preserve stable identity anchors, names, ongoing threads, counters, and continuity fields unless the current transcript clearly updates them."
          : null,
        hasMemory
          ? "Do not resurrect characters who left the immediate scene unless the current transcript brings them back. Preserve arrays/items by stable id/name where possible."
          : null,
        "Preset prompt instructions are lower priority than these safety and integrity requirements.",
        "Preserve character names exactly when possible.",
        "Summarize only the current and relevant state, not every past event.",
        "Use empty strings, empty arrays, or \"unknown\" for unknown fields.",
      ].filter(Boolean).join("\n"),
    },
    {
      role: "user",
      content: [
        `Selected tracker preset: ${preset.name} (${preset.id})`,
        "",
        "Preset prompt instructions:",
        preset.promptInstructions,
        "",
        "Tracker JSON schema:",
        JSON.stringify(preset.jsonSchema, null, 2),
        "",
        hasMemory ? memory?.renderedText ?? "" : null,
        hasMemory ? "" : null,
        hasContextBlocks ? "Additional context sources:" : null,
        ...contextBlocks.flatMap((block) => [
          hasContextBlocks ? `[${block.title}]` : null,
          block.text.trim(),
          "",
        ]),
        filterSummary ? "Context filter summary:" : null,
        filterSummary || null,
        filterSummary ? "" : null,
        "Recent conversation:",
        transcript,
        "",
        "Return only a JSON object matching the selected schema shape.",
        "Never include Markdown, commentary, or HTML.",
      ].filter((part): part is string => typeof part === "string").join("\n"),
    },
  ];
}
