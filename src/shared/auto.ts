import type {
  LTrackerSettings,
  TranscriptRole,
} from "./types";

export interface AutoScheduleInput {
  settings: LTrackerSettings;
  role: TranscriptRole;
  messageCount: number;
  chatId: string;
  activeChatId: string | null;
  trackerGenerationRunning: boolean;
}

export type AutoScheduleDecision =
  | { shouldSchedule: true }
  | { shouldSchedule: false; reason: string };

export function isQuietGenerationType(generationType: string | null | undefined): boolean {
  return typeof generationType === "string" && generationType.toLowerCase() === "quiet";
}

export function shouldScheduleAutoTracker(input: AutoScheduleInput): AutoScheduleDecision {
  const { settings, role } = input;
  if (!settings.auto.autoModeEnabled) {
    return { shouldSchedule: false, reason: "Auto mode is disabled." };
  }
  if (input.trackerGenerationRunning) {
    return { shouldSchedule: false, reason: "A tracker generation is already running for this chat." };
  }
  if (input.messageCount <= settings.auto.skipFirstMessages) {
    return { shouldSchedule: false, reason: `Skipped before message ${settings.auto.skipFirstMessages + 1}.` };
  }
  if (settings.auto.onlyWhenChatActive && input.activeChatId !== input.chatId) {
    return { shouldSchedule: false, reason: "Chat is not the active chat." };
  }
  if (role === "assistant" && !settings.auto.triggerAfterAssistantMessages) {
    return { shouldSchedule: false, reason: "Assistant-message auto trigger is disabled." };
  }
  if (role === "user" && !settings.auto.triggerAfterUserMessages) {
    return { shouldSchedule: false, reason: "User-message auto trigger is disabled." };
  }
  return { shouldSchedule: true };
}
