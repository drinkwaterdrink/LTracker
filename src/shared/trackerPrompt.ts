import { DEFAULT_TRACKER_PRESET } from "./presets";
import type {
  PromptMessage,
  TrackerSchemaPreset,
  TranscriptMessage,
} from "./types";
import type { TrackerMemoryResult } from "./trackerMemory";

const DEFAULT_MAX_MESSAGE_CHARS = 8_000;

export function buildCompactTranscript(
  messages: TranscriptMessage[],
  maxMessageChars = DEFAULT_MAX_MESSAGE_CHARS,
): string {
  return messages.map((message) => {
    const role = message.role === "user" ? "USER" : "ASSISTANT";
    const name = message.name ? ` ${message.name}` : "";
    const content = message.content.trim().slice(0, maxMessageChars);
    return `[${message.index} ${role}${name}]\n${content}`;
  }).join("\n\n");
}

export function buildTrackerPrompt(
  transcript: string,
  preset: TrackerSchemaPreset = DEFAULT_TRACKER_PRESET,
  memory: TrackerMemoryResult | null = null,
): PromptMessage[] {
  const hasMemory = Boolean(memory?.renderedText.trim());
  return [
    {
      role: "system",
      content: [
        "You extract the current state of an ongoing roleplay or story chat.",
        "Return JSON only. Do not wrap the JSON in Markdown.",
        "Do not invent facts unsupported by the transcript.",
        "The current transcript has higher priority than any prior tracker memory.",
        "If prior tracker memory contradicts the current transcript, the current transcript wins.",
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
        "Recent conversation:",
        transcript,
        "",
        "Return only a JSON object matching the selected schema shape.",
        "Never include Markdown, commentary, or HTML.",
      ].filter((part): part is string => typeof part === "string").join("\n"),
    },
  ];
}
