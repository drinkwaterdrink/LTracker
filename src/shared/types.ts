export const EXTENSION_VERSION = "0.01";
export const STORAGE_SCHEMA_VERSION = 1;

export type TrackerStatus = "idle" | "generating" | "error";
export type TranscriptRole = "user" | "assistant";

export interface TranscriptMessage {
  index: number;
  role: TranscriptRole;
  name: string;
  content: string;
}

export interface PromptMessage {
  role: "system" | "user";
  content: string;
}

export interface TrackerSnapshot {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  extensionVersion: typeof EXTENSION_VERSION;
  chatId: string;
  createdAt: string;
  messageCount: number;
  sourceMessageIds: string[];
  data: Record<string, unknown>;
}

export interface PermissionState {
  generation: boolean;
  chats: boolean;
  chatMutation: boolean;
}

export interface FrontendState {
  version: typeof EXTENSION_VERSION;
  status: TrackerStatus;
  chatId: string | null;
  snapshot: TrackerSnapshot | null;
  error: string | null;
  permissions: PermissionState;
}

export type FrontendMessage =
  | { type: "ready"; chatId: string | null }
  | { type: "refresh_state"; chatId: string | null }
  | { type: "generate_tracker"; chatId: string | null; requestId: string };

export type BackendMessage =
  | { type: "state"; state: FrontendState; requestId?: string }
  | { type: "error"; message: string; requestId?: string; state?: FrontendState };
