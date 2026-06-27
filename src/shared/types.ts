export const EXTENSION_VERSION = "0.02";
export const STORAGE_SCHEMA_VERSION = 1;
export const SETTINGS_SCHEMA_VERSION = 1;
export const SPINDLE_TYPES_VERSION = "0.5.21";

export type TrackerStatus = "idle" | "generating" | "error";
export type TranscriptRole = "user" | "assistant";
export type LTrackerErrorStage =
  | "active_chat"
  | "read_messages"
  | "prompt"
  | "generation"
  | "parse"
  | "storage"
  | "unknown";

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
  extensionVersion: string;
  chatId: string;
  createdAt: string;
  messageCount: number;
  sourceMessageIds: string[];
  data: Record<string, unknown>;
}

export interface LTrackerSettings {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  recentMessageLimit: number;
  maxMessageChars: number;
  generationTimeoutMs: number;
  saveRawOutput: boolean;
  savePromptPreview: boolean;
}

export interface LTrackerError {
  stage: LTrackerErrorStage;
  message: string;
  detail?: string;
  createdAt: string;
}

export interface LTrackerCancellation {
  jobId: string;
  requestId: string;
  reason: string;
  createdAt: string;
}

export interface LTrackerBuildInfo {
  extensionVersion: string;
  storageSchemaVersion: number;
  settingsSchemaVersion: number;
  spindleTypesVersion: string;
  buildTarget: string;
}

export interface LTrackerDiagnostics {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  extensionVersion: string;
  chatId: string | null;
  status: TrackerStatus;
  storageKey: string | null;
  buildInfo: LTrackerBuildInfo;
  lastJobId: string | null;
  lastRequestId: string | null;
  lastGenerationStartedAt: string | null;
  lastGenerationCompletedAt: string | null;
  lastGenerationDurationMs: number | null;
  lastMessagesRead: number;
  lastSourceMessageIds: string[];
  lastSourceMessageRange: string | null;
  lastRawOutput: string | null;
  lastParsedTracker: Record<string, unknown> | null;
  lastPromptPreview: string | null;
  lastError: LTrackerError | null;
  lastCancellation: LTrackerCancellation | null;
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
  error: LTrackerError | null;
  permissions: PermissionState;
  settings: LTrackerSettings;
  diagnostics: LTrackerDiagnostics;
}

export type FrontendMessage =
  | { type: "ready"; chatId: string | null }
  | { type: "refresh_state"; chatId: string | null }
  | { type: "generate_tracker"; chatId: string | null; requestId: string }
  | { type: "clear_snapshot"; chatId: string | null; requestId: string }
  | { type: "save_settings"; chatId: string | null; settings: LTrackerSettings; requestId: string }
  | { type: "reset_settings"; chatId: string | null; requestId: string };

export type BackendMessage =
  | { type: "state"; state: FrontendState; requestId?: string }
  | { type: "error"; message: string; requestId?: string; state?: FrontendState };
