import { defaultTrackerSchemaJson } from "./defaultSchema";
import type { PromptMessage, TranscriptMessage } from "./types";

const MAX_MESSAGE_CHARS = 8_000;

export function buildCompactTranscript(messages: TranscriptMessage[]): string {
  return messages.map((message) => {
    const role = message.role === "user" ? "USER" : "ASSISTANT";
    const name = message.name ? ` ${message.name}` : "";
    const content = message.content.trim().slice(0, MAX_MESSAGE_CHARS);
    return `[${message.index} ${role}${name}]\n${content}`;
  }).join("\n\n");
}

export function buildTrackerPrompt(transcript: string): PromptMessage[] {
  return [
    {
      role: "system",
      content: [
        "You extract the current state of an ongoing roleplay or story chat.",
        "Return JSON only. Do not wrap the JSON in Markdown.",
        "Do not invent facts unsupported by the transcript.",
        "Preserve character names exactly when possible.",
        "Summarize only the current and relevant state, not every past event.",
        "Use empty strings, empty arrays, or \"unknown\" for unknown fields.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "Fill this tracker schema from the transcript.",
        "",
        "Tracker schema:",
        defaultTrackerSchemaJson(),
        "",
        "Transcript:",
        transcript,
        "",
        "Return only a JSON object matching the schema shape.",
      ].join("\n"),
    },
  ];
}
