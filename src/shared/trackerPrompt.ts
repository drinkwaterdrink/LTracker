import { DEFAULT_TRACKER_PRESET } from "./presets";
import type {
  PromptMessage,
  TrackerSchemaPreset,
  TranscriptMessage,
} from "./types";

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
): PromptMessage[] {
  return [
    {
      role: "system",
      content: [
        "You extract the current state of an ongoing roleplay or story chat.",
        "Return JSON only. Do not wrap the JSON in Markdown.",
        "Do not invent facts unsupported by the transcript.",
        "Preset prompt instructions are lower priority than these safety and integrity requirements.",
        "Preserve character names exactly when possible.",
        "Summarize only the current and relevant state, not every past event.",
        "Use empty strings, empty arrays, or \"unknown\" for unknown fields.",
      ].join("\n"),
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
        "Transcript:",
        transcript,
        "",
        "Return only a JSON object matching the selected schema shape.",
        "Never include Markdown, commentary, or HTML.",
      ].join("\n"),
    },
  ];
}
