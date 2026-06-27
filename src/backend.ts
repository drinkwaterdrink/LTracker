import type {
  ChatMessageDTO,
  GenerationEndedPayloadDTO,
  LlmMessageDTO,
  SpindleAPI,
} from "lumiverse-spindle-types";
import {
  isQuietGenerationType,
  shouldScheduleAutoTracker,
} from "./shared/auto";
import {
  buildInjectionDecision,
  shouldSkipContextForInternalGeneration,
  toContextHandlerResult,
} from "./shared/contextInjection";
import { parseTrackerJson } from "./shared/parser";
import {
  canModifyPreset,
  createPresetId,
  DEFAULT_TRACKER_PRESET,
  DEFAULT_TRACKER_PRESET_ID,
  draftToPreset,
  importTrackerPresetEnvelope,
  repairTrackerPreset,
  resolveSelectedPreset,
  validateJsonSchema,
  validateTrackerPreset,
} from "./shared/presets";
import {
  DEFAULT_SETTINGS,
  repairSettings,
} from "./shared/settings";
import {
  activePresetPath,
  diagnosticsPath,
  messageSnapshotPath,
  PRESETS_INDEX_PATH,
  presetPath,
  SETTINGS_PATH,
  snapshotPath,
} from "./shared/storageKeys";
import {
  buildCompactTranscript,
  buildTrackerPrompt,
} from "./shared/trackerPrompt";
import {
  EXTENSION_VERSION,
  SETTINGS_SCHEMA_VERSION,
  SPINDLE_TYPES_VERSION,
  STORAGE_SCHEMA_VERSION,
  type ActiveTrackerPresetState,
  type AutoTriggerEventType,
  type AutoTrackerTriggerSource,
  type BackendMessage,
  type FrontendMessage,
  type FrontendState,
  type LTrackerBuildInfo,
  type LTrackerCancellation,
  type LTrackerDiagnostics,
  type LTrackerError,
  type LTrackerErrorStage,
  type LTrackerInjectionFormat,
  type LTrackerInjectionMode,
  type LTrackerSettings,
  type MessageAttachedSnapshot,
  type PermissionState,
  type TrackerPresetDraft,
  type TrackerGenerationSourceKind,
  type TrackerSnapshot,
  type TrackerTriggerSource,
  type TrackerSchemaPreset,
  type TranscriptMessage,
  type TranscriptRole,
} from "./shared/types";

declare const spindle: SpindleAPI;

interface ActiveJob {
  controller: AbortController;
  jobId: string;
  requestId: string;
  sourceKind: TrackerGenerationSourceKind;
  cancelReason?: string;
}

interface PendingAutoJob {
  timer: ReturnType<typeof setTimeout>;
  chatId: string;
  userId: string;
  requestId: string;
  trigger: AutoTrackerTriggerSource;
  scheduledAt: string;
}

class LTrackerStageError extends Error {
  readonly stage: LTrackerErrorStage;
  readonly detail?: string;

  constructor(stage: LTrackerErrorStage, message: string, detail?: string) {
    super(message);
    this.name = "LTrackerStageError";
    this.stage = stage;
    if (detail) this.detail = detail;
  }
}

const BUILD_INFO: LTrackerBuildInfo = {
  extensionVersion: EXTENSION_VERSION,
  storageSchemaVersion: STORAGE_SCHEMA_VERSION,
  settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
  spindleTypesVersion: SPINDLE_TYPES_VERSION,
  buildTarget: "es2022",
};

const activeJobs = new Map<string, ActiveJob>();
const pendingAutoJobs = new Map<string, PendingAutoJob>();
const activeChatByUser = new Map<string, string | null>();
const usersByChat = new Map<string, Set<string>>();
const eventCleanups: Array<() => void> = [];
let autoSubscriptionsActive = false;
let contextHandlerRegistered = false;
let internalTrackerGenerationDepth = 0;
let disposed = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorDetail(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) return error.stack;
  return undefined;
}

function stageError(stage: LTrackerErrorStage, error: unknown): never {
  if (error instanceof LTrackerStageError) throw error;
  throw new LTrackerStageError(stage, errorMessage(error), errorDetail(error));
}

function diagnosticError(error: unknown, fallbackStage: LTrackerErrorStage): LTrackerError {
  const stage = error instanceof LTrackerStageError ? error.stage : fallbackStage;
  const detail = error instanceof LTrackerStageError ? error.detail : errorDetail(error);
  const result: LTrackerError = {
    stage,
    message: errorMessage(error),
    createdAt: nowIso(),
  };
  if (detail) result.detail = detail;
  return result;
}

function isFrontendMessage(payload: unknown): payload is FrontendMessage {
  if (!isRecord(payload) || typeof payload.type !== "string") return false;
  if (![
    "ready",
    "refresh_state",
    "generate_tracker",
    "clear_snapshot",
    "save_settings",
    "reset_settings",
    "select_preset",
    "save_preset_as_new",
    "duplicate_preset",
    "update_preset",
    "delete_preset",
    "reset_preset",
    "import_preset",
    "validate_preset",
  ].includes(payload.type)) return false;
  if ("chatId" in payload && payload.chatId !== null && typeof payload.chatId !== "string") return false;
  if (
    [
      "generate_tracker",
      "clear_snapshot",
      "save_settings",
      "reset_settings",
      "select_preset",
      "save_preset_as_new",
      "duplicate_preset",
      "update_preset",
      "delete_preset",
      "reset_preset",
      "import_preset",
      "validate_preset",
    ].includes(payload.type)
    && typeof payload.requestId !== "string"
  ) return false;
  if (payload.type === "save_settings" && !isRecord(payload.settings)) return false;
  if (["save_preset_as_new", "duplicate_preset", "update_preset", "validate_preset"].includes(payload.type) && !isRecord(payload.preset)) return false;
  if (["select_preset", "update_preset", "delete_preset"].includes(payload.type) && typeof payload.presetId !== "string") return false;
  if (payload.type === "import_preset" && typeof payload.importText !== "string") return false;
  return true;
}

function permissionState(): PermissionState {
  return {
    generation: spindle.permissions.has("generation"),
    chats: spindle.permissions.has("chats"),
    chatMutation: spindle.permissions.has("chat_mutation"),
    contextHandler: spindle.permissions.has("context_handler"),
  };
}

function send(payload: BackendMessage, userId: string): void {
  if (!disposed) spindle.sendToFrontend(payload, userId);
}

function defaultDiagnostics(chatId: string | null): LTrackerDiagnostics {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    extensionVersion: EXTENSION_VERSION,
    chatId,
    status: "idle",
    storageKey: chatId ? snapshotPath(chatId) : null,
    buildInfo: BUILD_INFO,
    lastJobId: null,
    lastRequestId: null,
    lastGenerationSource: null,
    lastGenerationStartedAt: null,
    lastGenerationCompletedAt: null,
    lastGenerationDurationMs: null,
    lastMessagesRead: 0,
    lastSourceMessageIds: [],
    lastSourceMessageRange: null,
    lastRawOutput: null,
    lastParsedTracker: null,
    lastPromptPreview: null,
    lastError: null,
    lastCancellation: null,
    autoSubscriptionActive: autoSubscriptionsActive,
    lastAutoEventAt: null,
    lastAutoEventType: null,
    lastAutoSkippedReason: null,
    lastAutoScheduledAt: null,
    lastAutoTriggeredAt: null,
    lastAutoSourceMessageId: null,
    lastAutoSourceMessageIndex: null,
    lastAutoGenerationId: null,
    latestAttachedMessageId: null,
    latestAttachedMessageIndex: null,
    latestAttachedSnapshotAt: null,
    latestAttachedSnapshotStorageKey: null,
    injectionEnabled: false,
    lastInjectionAt: null,
    lastInjectionMode: null,
    lastInjectionFormat: null,
    lastInjectedChars: 0,
    lastInjectionSkippedReason: null,
    lastInjectionSnapshotCreatedAt: null,
    lastInjectionSourceMessageId: null,
    selectedPresetId: null,
    selectedPresetName: null,
    lastPresetFallbackReason: null,
    lastPresetValidationError: null,
    lastPromptUsedPresetId: null,
    lastPromptUsedPresetName: null,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) && !Array.isArray(value) ? value : null;
}

function sourceKindOrNull(value: unknown): TrackerGenerationSourceKind | null {
  return value === "manual" || value === "auto" ? value : null;
}

function autoEventTypeOrNull(value: unknown): AutoTriggerEventType | null {
  return value === "GENERATION_ENDED" || value === "MESSAGE_SENT" ? value : null;
}

function injectionModeOrNull(value: unknown): LTrackerInjectionMode | null {
  return value === "latest_chat_snapshot" || value === "latest_message_snapshot" ? value : null;
}

function injectionFormatOrNull(value: unknown): LTrackerInjectionFormat | null {
  return value === "compact" || value === "pretty_json" || value === "minimal" ? value : null;
}

function errorOrNull(value: unknown): LTrackerError | null {
  if (!isRecord(value) || typeof value.stage !== "string" || typeof value.message !== "string") return null;
  const error: LTrackerError = {
    stage: value.stage as LTrackerErrorStage,
    message: value.message,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso(),
  };
  if (typeof value.detail === "string") error.detail = value.detail;
  return error;
}

function cancellationOrNull(value: unknown): LTrackerCancellation | null {
  if (
    !isRecord(value)
    || typeof value.jobId !== "string"
    || typeof value.requestId !== "string"
    || typeof value.reason !== "string"
  ) return null;
  return {
    jobId: value.jobId,
    requestId: value.requestId,
    reason: value.reason,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso(),
  };
}

function repairDiagnostics(value: unknown, chatId: string | null): LTrackerDiagnostics {
  const base = defaultDiagnostics(chatId);
  if (!isRecord(value)) return base;
  return {
    ...base,
    status: value.status === "generating" || value.status === "error" ? value.status : "idle",
    lastJobId: stringOrNull(value.lastJobId),
    lastRequestId: stringOrNull(value.lastRequestId),
    lastGenerationSource: sourceKindOrNull(value.lastGenerationSource),
    lastGenerationStartedAt: stringOrNull(value.lastGenerationStartedAt),
    lastGenerationCompletedAt: stringOrNull(value.lastGenerationCompletedAt),
    lastGenerationDurationMs: numberOrNull(value.lastGenerationDurationMs),
    lastMessagesRead: typeof value.lastMessagesRead === "number" && Number.isFinite(value.lastMessagesRead)
      ? Math.max(0, Math.round(value.lastMessagesRead))
      : 0,
    lastSourceMessageIds: stringArray(value.lastSourceMessageIds),
    lastSourceMessageRange: stringOrNull(value.lastSourceMessageRange),
    lastRawOutput: stringOrNull(value.lastRawOutput),
    lastParsedTracker: recordOrNull(value.lastParsedTracker),
    lastPromptPreview: stringOrNull(value.lastPromptPreview),
    lastError: errorOrNull(value.lastError),
    lastCancellation: cancellationOrNull(value.lastCancellation),
    autoSubscriptionActive: autoSubscriptionsActive,
    lastAutoEventAt: stringOrNull(value.lastAutoEventAt),
    lastAutoEventType: autoEventTypeOrNull(value.lastAutoEventType),
    lastAutoSkippedReason: stringOrNull(value.lastAutoSkippedReason),
    lastAutoScheduledAt: stringOrNull(value.lastAutoScheduledAt),
    lastAutoTriggeredAt: stringOrNull(value.lastAutoTriggeredAt),
    lastAutoSourceMessageId: stringOrNull(value.lastAutoSourceMessageId),
    lastAutoSourceMessageIndex: nonNegativeInteger(value.lastAutoSourceMessageIndex),
    lastAutoGenerationId: stringOrNull(value.lastAutoGenerationId),
    latestAttachedMessageId: stringOrNull(value.latestAttachedMessageId),
    latestAttachedMessageIndex: nonNegativeInteger(value.latestAttachedMessageIndex),
    latestAttachedSnapshotAt: stringOrNull(value.latestAttachedSnapshotAt),
    latestAttachedSnapshotStorageKey: stringOrNull(value.latestAttachedSnapshotStorageKey),
    injectionEnabled: typeof value.injectionEnabled === "boolean" ? value.injectionEnabled : false,
    lastInjectionAt: stringOrNull(value.lastInjectionAt),
    lastInjectionMode: injectionModeOrNull(value.lastInjectionMode),
    lastInjectionFormat: injectionFormatOrNull(value.lastInjectionFormat),
    lastInjectedChars: typeof value.lastInjectedChars === "number" && Number.isFinite(value.lastInjectedChars)
      ? Math.max(0, Math.round(value.lastInjectedChars))
      : 0,
    lastInjectionSkippedReason: stringOrNull(value.lastInjectionSkippedReason),
    lastInjectionSnapshotCreatedAt: stringOrNull(value.lastInjectionSnapshotCreatedAt),
    lastInjectionSourceMessageId: stringOrNull(value.lastInjectionSourceMessageId),
    selectedPresetId: stringOrNull(value.selectedPresetId),
    selectedPresetName: stringOrNull(value.selectedPresetName),
    lastPresetFallbackReason: stringOrNull(value.lastPresetFallbackReason),
    lastPresetValidationError: stringOrNull(value.lastPresetValidationError),
    lastPromptUsedPresetId: stringOrNull(value.lastPromptUsedPresetId),
    lastPromptUsedPresetName: stringOrNull(value.lastPromptUsedPresetName),
  };
}

async function getSettings(userId: string): Promise<LTrackerSettings> {
  const raw = await spindle.userStorage.getJson<unknown>(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS,
    userId,
  });
  const repaired = repairSettings(raw);
  if (JSON.stringify(raw) !== JSON.stringify(repaired)) {
    await spindle.userStorage.setJson(SETTINGS_PATH, repaired, { indent: 2, userId });
  }
  return repaired;
}

async function saveSettings(settings: unknown, userId: string): Promise<LTrackerSettings> {
  const repaired = repairSettings(settings);
  await spindle.userStorage.setJson(SETTINGS_PATH, repaired, { indent: 2, userId });
  return repaired;
}

async function resetSettings(userId: string): Promise<LTrackerSettings> {
  await spindle.userStorage.setJson(SETTINGS_PATH, DEFAULT_SETTINGS, { indent: 2, userId });
  return DEFAULT_SETTINGS;
}

async function loadPresetIndex(userId: string): Promise<string[]> {
  const raw = await spindle.userStorage.getJson<unknown>(PRESETS_INDEX_PATH, {
    fallback: [],
    userId,
  });
  const ids = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string" && item !== DEFAULT_TRACKER_PRESET_ID)
    : [];
  if (JSON.stringify(raw) !== JSON.stringify(ids)) {
    await spindle.userStorage.setJson(PRESETS_INDEX_PATH, ids, { indent: 2, userId });
  }
  return ids;
}

async function savePresetIndex(ids: string[], userId: string): Promise<void> {
  const unique = [...new Set(ids.filter((id) => id !== DEFAULT_TRACKER_PRESET_ID))];
  await spindle.userStorage.setJson(PRESETS_INDEX_PATH, unique, { indent: 2, userId });
}

async function loadUserPreset(presetId: string, userId: string): Promise<TrackerSchemaPreset | null> {
  const raw = await spindle.userStorage.getJson<unknown>(presetPath(presetId), {
    fallback: null,
    userId,
  });
  const repaired = repairTrackerPreset(raw);
  if (!repaired || repaired.origin === "built_in") return null;
  return repaired;
}

async function loadPresetCatalog(userId: string): Promise<TrackerSchemaPreset[]> {
  const ids = await loadPresetIndex(userId);
  const loaded = await Promise.all(ids.map((id) => loadUserPreset(id, userId)));
  return [
    DEFAULT_TRACKER_PRESET,
    ...loaded.filter((preset): preset is TrackerSchemaPreset => Boolean(preset)),
  ];
}

function defaultActivePresetState(): ActiveTrackerPresetState {
  return {
    selectedPresetId: DEFAULT_TRACKER_PRESET_ID,
    selectedAt: new Date(0).toISOString(),
  };
}

async function loadActivePresetState(
  chatId: string | null,
  userId: string,
): Promise<ActiveTrackerPresetState> {
  if (!chatId) return defaultActivePresetState();
  const raw = await spindle.userStorage.getJson<unknown>(activePresetPath(chatId), {
    fallback: null,
    userId,
  });
  if (!isRecord(raw) || typeof raw.selectedPresetId !== "string") {
    return defaultActivePresetState();
  }
  return {
    selectedPresetId: raw.selectedPresetId,
    selectedAt: typeof raw.selectedAt === "string" ? raw.selectedAt : nowIso(),
  };
}

async function saveActivePresetState(
  chatId: string,
  presetId: string,
  userId: string,
): Promise<ActiveTrackerPresetState> {
  const state: ActiveTrackerPresetState = {
    selectedPresetId: presetId,
    selectedAt: nowIso(),
  };
  await spindle.userStorage.setJson(activePresetPath(chatId), state, { indent: 2, userId });
  return state;
}

function presetById(presets: TrackerSchemaPreset[], presetId: string): TrackerSchemaPreset | null {
  return presets.find((preset) => preset.id === presetId) ?? null;
}

async function resolveActivePreset(chatId: string | null, userId: string): Promise<{
  presets: TrackerSchemaPreset[];
  activePreset: TrackerSchemaPreset;
  activePresetState: ActiveTrackerPresetState;
  fallbackReason: string | null;
}> {
  const presets = await loadPresetCatalog(userId);
  const activePresetState = await loadActivePresetState(chatId, userId);
  const resolved = resolveSelectedPreset(presets, activePresetState.selectedPresetId);
  return {
    presets,
    activePreset: resolved.preset,
    activePresetState: {
      ...activePresetState,
      selectedPresetId: resolved.preset.id,
    },
    fallbackReason: resolved.fallbackReason,
  };
}

async function saveUserPreset(
  preset: TrackerSchemaPreset,
  userId: string,
): Promise<void> {
  const validation = validateTrackerPreset(preset);
  if (!validation.ok) throw new Error(validation.error ?? "Preset is invalid.");
  if (!canModifyPreset(preset)) throw new Error("Built-in presets cannot be overwritten.");
  await spindle.userStorage.setJson(presetPath(preset.id), preset, { indent: 2, userId });
  const ids = await loadPresetIndex(userId);
  if (!ids.includes(preset.id)) await savePresetIndex([...ids, preset.id], userId);
}

async function deleteUserPreset(presetId: string, userId: string): Promise<void> {
  if (presetId === DEFAULT_TRACKER_PRESET_ID) throw new Error("Built-in presets cannot be deleted.");
  const ids = await loadPresetIndex(userId);
  if (await spindle.userStorage.exists(presetPath(presetId), userId)) {
    await spindle.userStorage.delete(presetPath(presetId), userId);
  }
  await savePresetIndex(ids.filter((id) => id !== presetId), userId);
}

async function loadSnapshot(chatId: string | null, userId: string): Promise<TrackerSnapshot | null> {
  if (!chatId) return null;
  return spindle.userStorage.getJson<TrackerSnapshot | null>(snapshotPath(chatId), {
    fallback: null,
    userId,
  });
}

async function loadMessageSnapshot(
  chatId: string | null,
  messageId: string | null,
  userId: string,
): Promise<MessageAttachedSnapshot | null> {
  if (!chatId || !messageId) return null;
  return spindle.userStorage.getJson<MessageAttachedSnapshot | null>(messageSnapshotPath(chatId, messageId), {
    fallback: null,
    userId,
  });
}

async function loadDiagnostics(chatId: string | null, userId: string): Promise<LTrackerDiagnostics> {
  if (!chatId) return defaultDiagnostics(null);
  const raw = await spindle.userStorage.getJson<unknown>(diagnosticsPath(chatId), {
    fallback: null,
    userId,
  });
  return repairDiagnostics(raw, chatId);
}

async function persistDiagnostics(diagnostics: LTrackerDiagnostics, userId: string): Promise<void> {
  if (!diagnostics.chatId) return;
  await spindle.userStorage.setJson(diagnosticsPath(diagnostics.chatId), {
    ...diagnostics,
    autoSubscriptionActive: autoSubscriptionsActive,
  }, {
    indent: 2,
    userId,
  });
}

async function tryPersistDiagnostics(diagnostics: LTrackerDiagnostics, userId: string): Promise<void> {
  try {
    await persistDiagnostics(diagnostics, userId);
  } catch (error) {
    spindle.log.warn(`LTracker could not save diagnostics: ${errorMessage(error)}`);
  }
}

async function buildState(
  chatId: string | null,
  userId: string,
  status?: FrontendState["status"],
  error: LTrackerError | null = null,
): Promise<FrontendState> {
  const settings = await getSettings(userId);
  const diagnostics = await loadDiagnostics(chatId, userId);
  const presetState = await resolveActivePreset(chatId, userId);
  const snapshot = await loadSnapshot(chatId, userId);
  const latestMessageSnapshot = await loadMessageSnapshot(
    chatId,
    diagnostics.latestAttachedMessageId,
    userId,
  );
  const injectionPreview = buildInjectionDecision({
    settings,
    chatSnapshot: snapshot,
    messageSnapshot: latestMessageSnapshot,
    internalTrackerGeneration: false,
  }).text;
  const stateError = error ?? diagnostics.lastError;
  return {
    version: EXTENSION_VERSION,
    status: status ?? diagnostics.status,
    chatId,
    snapshot,
    latestMessageSnapshot,
    injectionPreview,
    presets: presetState.presets,
    activePreset: presetState.activePreset,
    activePresetState: presetState.activePresetState,
    error: stateError,
    permissions: permissionState(),
    settings,
    diagnostics: {
      ...diagnostics,
      status: status ?? diagnostics.status,
      lastError: stateError,
      autoSubscriptionActive: autoSubscriptionsActive,
      injectionEnabled: settings.injection.enabled,
      selectedPresetId: presetState.activePreset.id,
      selectedPresetName: presetState.activePreset.name,
      lastPresetFallbackReason: presetState.fallbackReason ?? diagnostics.lastPresetFallbackReason,
    },
  };
}

async function sendState(
  chatId: string | null,
  userId: string,
  status?: FrontendState["status"],
  error: LTrackerError | null = null,
  requestId?: string,
): Promise<void> {
  const message: BackendMessage = {
    type: "state",
    state: await buildState(chatId, userId, status, error),
  };
  if (requestId) message.requestId = requestId;
  send(message, userId);
}

function ensurePermission(permission: keyof PermissionState, label: string): void {
  if (!permissionState()[permission]) {
    throw new Error(`Missing permission: ${label}.`);
  }
}

async function resolveActiveChatId(chatId: string | null, userId: string): Promise<string> {
  if (chatId) return chatId;
  ensurePermission("chats", "chats is required to resolve the active chat");
  if (!spindle.chats?.getActive) {
    throw new Error("Lumiverse active chat API is unavailable.");
  }
  const active = await spindle.chats.getActive(userId);
  if (!active?.id) throw new Error("No active chat is open.");
  return active.id;
}

async function readChatMessages(chatId: string): Promise<ChatMessageDTO[]> {
  ensurePermission("chatMutation", "chat_mutation is required to read chat messages");
  if (!spindle.chat?.getMessages) {
    throw new Error("Lumiverse chat message API is unavailable.");
  }
  return spindle.chat.getMessages(chatId);
}

async function getRecentMessages(chatId: string, settings: LTrackerSettings): Promise<ChatMessageDTO[]> {
  const messages = await readChatMessages(chatId);
  return messages.slice(-settings.recentMessageLimit);
}

function normalizeMessages(messages: ChatMessageDTO[]): TranscriptMessage[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      index: message.index_in_chat,
      role: message.is_user ? "user" : "assistant",
      name: message.name ?? "",
      content: message.content,
    }));
}

function normalizeGenerationText(result: unknown): string {
  if (typeof result === "string" && result.trim()) return result;
  if (!isRecord(result)) {
    throw new Error("Lumiverse generation returned an unsupported response.");
  }

  for (const key of ["content", "text", "output", "response"]) {
    const value = result[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  const message = result.message;
  if (typeof message === "string" && message.trim()) return message;
  if (isRecord(message) && typeof message.content === "string" && message.content.trim()) {
    return message.content;
  }

  throw new Error("Lumiverse generation completed without textual content.");
}

async function runTrackerGeneration(
  messages: LlmMessageDTO[],
  userId: string,
  settings: LTrackerSettings,
  parentSignal: AbortSignal,
): Promise<string> {
  ensurePermission("generation", "generation is required to call the active/default model");
  if (!spindle.generate?.quiet) {
    throw new Error("Lumiverse quiet generation API is unavailable.");
  }

  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, settings.generationTimeoutMs);

  parentSignal.addEventListener("abort", onParentAbort, { once: true });
  if (parentSignal.aborted) controller.abort();

  try {
    internalTrackerGenerationDepth += 1;
    const result = await spindle.generate.quiet({
      type: "quiet",
      messages,
      reasoning: { source: "off" },
      userId,
      signal: controller.signal,
    });
    return normalizeGenerationText(result);
  } catch (error) {
    if (parentSignal.aborted) {
      throw new Error("Tracker generation was cancelled by a newer request.");
    }
    if (timedOut) {
      throw new Error(`Tracker generation timed out after ${Math.round(settings.generationTimeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    internalTrackerGenerationDepth = Math.max(0, internalTrackerGenerationDepth - 1);
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", onParentAbort);
  }
}

async function saveSnapshot(snapshot: TrackerSnapshot, userId: string): Promise<void> {
  await spindle.userStorage.setJson(snapshotPath(snapshot.chatId), snapshot, {
    indent: 2,
    userId,
  });
}

async function saveMessageAttachedSnapshot(snapshot: MessageAttachedSnapshot, userId: string): Promise<void> {
  await spindle.userStorage.setJson(messageSnapshotPath(snapshot.chatId, snapshot.messageId), snapshot, {
    indent: 2,
    userId,
  });
}

function promptPreview(messages: LlmMessageDTO[]): string {
  return messages.map((message) => {
    const content = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content, null, 2);
    return `## ${message.role}\n${content}`;
  }).join("\n\n");
}

function sourceRange(ids: string[]): string | null {
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0] ?? null;
  return `${ids[0]} -> ${ids[ids.length - 1]}`;
}

function newJobId(): string {
  return `job:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function isCurrentJob(chatId: string, jobId: string): boolean {
  return activeJobs.get(chatId)?.jobId === jobId;
}

function userChatKey(userId: string, chatId: string): string {
  return `${userId}:${chatId}`;
}

function messageRole(message: ChatMessageDTO): TranscriptRole {
  return message.is_user ? "user" : "assistant";
}

function createManualTrigger(requestId: string): TrackerTriggerSource {
  return { kind: "manual", requestId };
}

function createAutoTrigger(input: {
  eventType: AutoTriggerEventType;
  requestId: string;
  message: ChatMessageDTO;
  generationId: string | null;
  generationType: string | null;
}): AutoTrackerTriggerSource {
  return {
    kind: "auto",
    requestId: input.requestId,
    eventType: input.eventType,
    sourceMessageId: input.message.id,
    sourceMessageIndex: input.message.index_in_chat,
    generationId: input.generationId ?? null,
    generationType: input.generationType ?? null,
  };
}

async function markAutoSkipped(
  chatId: string,
  userId: string,
  trigger: AutoTrackerTriggerSource,
  reason: string,
  eventAt: string | null = null,
): Promise<void> {
  const diagnostics = {
    ...await loadDiagnostics(chatId, userId),
    status: activeJobs.has(chatId) ? "generating" as const : "idle" as const,
    lastAutoEventAt: eventAt ?? nowIso(),
    lastAutoEventType: trigger.eventType,
    lastAutoSkippedReason: reason,
    lastAutoScheduledAt: null,
    lastAutoTriggeredAt: null,
    lastAutoSourceMessageId: trigger.sourceMessageId,
    lastAutoSourceMessageIndex: trigger.sourceMessageIndex,
    lastAutoGenerationId: trigger.generationId,
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(chatId, userId, diagnostics.status, null, trigger.requestId);
}

function cancelPendingAutoForChat(chatId: string, userId: string | null, reason: string): void {
  for (const [key, pending] of pendingAutoJobs) {
    if (pending.chatId !== chatId) continue;
    if (userId && pending.userId !== userId) continue;
    clearTimeout(pending.timer);
    pendingAutoJobs.delete(key);
    void markAutoSkipped(pending.chatId, pending.userId, pending.trigger, reason, pending.scheduledAt)
      .catch((error: unknown) => spindle.log.warn(`LTracker could not record auto cancellation: ${errorMessage(error)}`));
  }
}

function abortAutoJobForChat(chatId: string, reason: string): void {
  const job = activeJobs.get(chatId);
  if (!job || job.sourceKind !== "auto") return;
  job.cancelReason = reason;
  job.controller.abort();
}

function rememberActiveChat(userId: string, chatId: string | null): void {
  const previous = activeChatByUser.get(userId) ?? null;
  if (previous === chatId) return;
  if (previous) {
    const users = usersByChat.get(previous);
    users?.delete(userId);
    if (users?.size === 0) usersByChat.delete(previous);
    cancelPendingAutoForChat(previous, userId, "Chat changed before the auto timer fired.");
    abortAutoJobForChat(previous, "Chat changed before the auto tracker result was saved.");
  }
  if (chatId) {
    activeChatByUser.set(userId, chatId);
    const users = usersByChat.get(chatId) ?? new Set<string>();
    users.add(userId);
    usersByChat.set(chatId, users);
  } else {
    activeChatByUser.delete(userId);
  }
}

function targetUsersForChat(chatId: string, userId?: string): string[] {
  if (userId) return [userId];
  return [...(usersByChat.get(chatId) ?? [])];
}

function isChatMessage(value: unknown): value is ChatMessageDTO {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.chat_id === "string"
    && typeof value.index_in_chat === "number"
    && typeof value.is_user === "boolean"
    && typeof value.content === "string";
}

function messageFromEventPayload(payload: unknown): ChatMessageDTO | null {
  if (isChatMessage(payload)) return payload;
  if (isRecord(payload) && isChatMessage(payload.message)) return payload.message;
  return null;
}

async function scheduleAutoForMessage(input: {
  chatId: string;
  userId: string;
  eventType: AutoTriggerEventType;
  eventAt: string;
  message: ChatMessageDTO;
  generationId: string | null;
  generationType: string | null;
}): Promise<void> {
  if (isQuietGenerationType(input.generationType)) return;

  const settings = await getSettings(input.userId);
  if (!settings.auto.autoModeEnabled) return;

  const messages = await readChatMessages(input.chatId);
  const sourceMessage = messages.find((message) => message.id === input.message.id) ?? input.message;
  const requestId = `auto:${input.eventType}:${sourceMessage.id}:${Date.now()}`;
  const trigger = createAutoTrigger({
    eventType: input.eventType,
    requestId,
    message: sourceMessage,
    generationId: input.generationId,
    generationType: input.generationType,
  });

  const decision = shouldScheduleAutoTracker({
    settings,
    role: messageRole(sourceMessage),
    messageCount: messages.length,
    chatId: input.chatId,
    activeChatId: activeChatByUser.get(input.userId) ?? null,
    trackerGenerationRunning: activeJobs.has(input.chatId),
  });

  if (!decision.shouldSchedule) {
    await markAutoSkipped(input.chatId, input.userId, trigger, decision.reason, input.eventAt);
    return;
  }

  const key = userChatKey(input.userId, input.chatId);
  const existing = pendingAutoJobs.get(key);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const scheduledAt = nowIso();
  const timer = setTimeout(() => {
    void runPendingAuto(key).catch((error: unknown) => {
      spindle.log.warn(`LTracker auto job failed: ${errorMessage(error)}`);
    });
  }, settings.auto.autoDebounceMs);

  pendingAutoJobs.set(key, {
    timer,
    chatId: input.chatId,
    userId: input.userId,
    requestId,
    trigger,
    scheduledAt,
  });

  const diagnostics = {
    ...await loadDiagnostics(input.chatId, input.userId),
    lastAutoEventAt: input.eventAt,
    lastAutoEventType: input.eventType,
    lastAutoSkippedReason: null,
    lastAutoScheduledAt: scheduledAt,
    lastAutoTriggeredAt: null,
    lastAutoSourceMessageId: sourceMessage.id,
    lastAutoSourceMessageIndex: sourceMessage.index_in_chat,
    lastAutoGenerationId: input.generationId,
  };
  await tryPersistDiagnostics(diagnostics, input.userId);
  await sendState(input.chatId, input.userId, diagnostics.status, null, requestId);
}

async function runPendingAuto(key: string): Promise<void> {
  const pending = pendingAutoJobs.get(key);
  if (!pending) return;
  pendingAutoJobs.delete(key);

  const settings = await getSettings(pending.userId);
  if (settings.auto.onlyWhenChatActive && activeChatByUser.get(pending.userId) !== pending.chatId) {
    await markAutoSkipped(
      pending.chatId,
      pending.userId,
      pending.trigger,
      "Chat changed before the auto timer fired.",
      pending.scheduledAt,
    );
    return;
  }
  if (activeJobs.has(pending.chatId)) {
    await markAutoSkipped(
      pending.chatId,
      pending.userId,
      pending.trigger,
      "A tracker generation is already running for this chat.",
      pending.scheduledAt,
    );
    return;
  }
  await generateTracker(pending.chatId, pending.userId, pending.trigger);
}

async function handleGenerationEnded(payload: GenerationEndedPayloadDTO, userId?: string): Promise<void> {
  if (payload.error || !payload.messageId || isQuietGenerationType(payload.generationType)) return;
  const users = targetUsersForChat(payload.chatId, userId);
  if (users.length === 0) {
    spindle.log.warn(`LTracker ignored auto event without a known user for chat ${payload.chatId}.`);
    return;
  }

  const eventAt = nowIso();
  for (const targetUserId of users) {
    const settings = await getSettings(targetUserId);
    if (!settings.auto.autoModeEnabled) continue;

    const messages = await readChatMessages(payload.chatId);
    const message = messages.find((item) => item.id === payload.messageId);
    if (!message) {
      const trigger: AutoTrackerTriggerSource = {
        kind: "auto",
        requestId: `auto:GENERATION_ENDED:${payload.messageId}:${Date.now()}`,
        eventType: "GENERATION_ENDED",
        sourceMessageId: payload.messageId,
        sourceMessageIndex: null,
        generationId: payload.generationId,
        generationType: payload.generationType ?? null,
      };
      await markAutoSkipped(payload.chatId, targetUserId, trigger, "Generated message was not found.", eventAt);
      continue;
    }
    if (message.is_user) {
      const trigger = createAutoTrigger({
        eventType: "GENERATION_ENDED",
        requestId: `auto:GENERATION_ENDED:${message.id}:${Date.now()}`,
        message,
        generationId: payload.generationId,
        generationType: payload.generationType ?? null,
      });
      await markAutoSkipped(payload.chatId, targetUserId, trigger, "Generation ended on a user message.", eventAt);
      continue;
    }
    await scheduleAutoForMessage({
      chatId: payload.chatId,
      userId: targetUserId,
      eventType: "GENERATION_ENDED",
      eventAt,
      message,
      generationId: payload.generationId,
      generationType: payload.generationType ?? null,
    });
  }
}

async function handleMessageSent(payload: unknown, userId?: string): Promise<void> {
  const message = messageFromEventPayload(payload);
  if (!message || !message.is_user) return;
  const chatId = message.chat_id;
  const users = targetUsersForChat(chatId, userId);
  const eventAt = nowIso();
  for (const targetUserId of users) {
    await scheduleAutoForMessage({
      chatId,
      userId: targetUserId,
      eventType: "MESSAGE_SENT",
      eventAt,
      message,
      generationId: null,
      generationType: null,
    });
  }
}

function handleChatSwitched(payload: unknown, userId?: string): void {
  if (!userId || !isRecord(payload)) return;
  const chatId = typeof payload.chatId === "string" ? payload.chatId : null;
  rememberActiveChat(userId, chatId);
}

function stringAtPath(value: unknown, path: string[]): string | null {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

function firstStringAtPath(value: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const result = stringAtPath(value, path);
    if (result) return result;
  }
  return null;
}

function contextChatId(context: unknown): string | null {
  return firstStringAtPath(context, [
    ["chatId"],
    ["chat_id"],
    ["chat", "id"],
    ["request", "chatId"],
    ["request", "chat_id"],
    ["request", "chat", "id"],
    ["input", "chatId"],
    ["input", "chat_id"],
    ["generation", "chatId"],
    ["generation", "chat_id"],
    ["metadata", "chatId"],
  ]);
}

function contextUserId(context: unknown): string | null {
  return firstStringAtPath(context, [
    ["userId"],
    ["user_id"],
    ["operatorUserId"],
    ["request", "userId"],
    ["request", "user_id"],
    ["input", "userId"],
    ["generation", "userId"],
    ["metadata", "userId"],
  ]);
}

function knownUserForContext(userId: string | null, chatId: string | null): string | null {
  if (userId) return userId;
  if (chatId) {
    const users = targetUsersForChat(chatId);
    if (users.length === 1) return users[0] ?? null;
  }
  if (activeChatByUser.size === 1) {
    return activeChatByUser.keys().next().value ?? null;
  }
  return null;
}

async function resolveContextChatId(context: unknown, userId: string): Promise<string | null> {
  const fromContext = contextChatId(context);
  if (fromContext) return fromContext;
  return resolveActiveChatId(null, userId).catch(() => null);
}

async function withContextTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<{ timedOut: false; value: T } | { timedOut: true; value: null }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation.then((value) => ({ timedOut: false as const, value })),
      new Promise<{ timedOut: true; value: null }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true, value: null }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function recordInjectionDiagnostics(
  chatId: string,
  userId: string,
  settings: LTrackerSettings,
  decision: ReturnType<typeof buildInjectionDecision>,
  baseDiagnostics?: LTrackerDiagnostics,
): Promise<void> {
  const currentDiagnostics = baseDiagnostics ?? await loadDiagnostics(chatId, userId);
  const diagnostics = {
    ...currentDiagnostics,
    injectionEnabled: settings.injection.enabled,
    lastInjectionAt: decision.text ? nowIso() : currentDiagnostics.lastInjectionAt,
    lastInjectionMode: settings.injection.mode,
    lastInjectionFormat: settings.injection.format,
    lastInjectedChars: decision.injectedChars,
    lastInjectionSkippedReason: decision.skippedReason,
    lastInjectionSnapshotCreatedAt: decision.snapshotCreatedAt,
    lastInjectionSourceMessageId: decision.sourceMessageId,
  };
  await tryPersistDiagnostics(diagnostics, userId);
}

async function handleContextInjection(context: unknown): Promise<unknown> {
  const contextUser = contextUserId(context);
  const contextChat = contextChatId(context);
  const userId = knownUserForContext(contextUser, contextChat);
  if (!userId) return null;

  const chatId = await resolveContextChatId(context, userId);
  if (!chatId) return null;
  rememberActiveChat(userId, chatId);

  let storageResult: { timedOut: false; value: unknown } | { timedOut: true; value: null };
  try {
    storageResult = await withContextTimeout((async () => {
      const settings = await getSettings(userId);
      const skipInternal = shouldSkipContextForInternalGeneration(context, internalTrackerGenerationDepth > 0);
      const diagnostics = await loadDiagnostics(chatId, userId);
      const snapshot = settings.injection.mode === "latest_chat_snapshot"
        ? await loadSnapshot(chatId, userId)
        : null;
      const messageSnapshot = settings.injection.mode === "latest_message_snapshot"
        ? await loadMessageSnapshot(chatId, diagnostics.latestAttachedMessageId, userId)
        : null;
      const decision = buildInjectionDecision({
        settings,
        chatSnapshot: snapshot,
        messageSnapshot,
        internalTrackerGeneration: skipInternal,
      });
      await recordInjectionDiagnostics(chatId, userId, settings, decision, diagnostics);
      return toContextHandlerResult(decision.text);
    })(), 750);
  } catch (error) {
    spindle.log.warn(`LTracker context injection skipped after storage error: ${errorMessage(error)}`);
    return null;
  }

  if (!storageResult.timedOut) return storageResult.value;

  const settings = await getSettings(userId).catch(() => null);
  if (settings) {
    await recordInjectionDiagnostics(chatId, userId, settings, {
      text: null,
      skippedReason: "Context handler storage lookup timed out.",
      snapshotCreatedAt: null,
      sourceMessageId: null,
      injectedChars: 0,
    }).catch((error: unknown) => {
      spindle.log.warn(`LTracker could not record context timeout: ${errorMessage(error)}`);
    });
  }
  return null;
}

async function generateTracker(
  chatId: string | null,
  userId: string,
  trigger: TrackerTriggerSource,
): Promise<void> {
  let stage: LTrackerErrorStage = "active_chat";
  const requestId = trigger.requestId;
  const resolvedChatId = await resolveActiveChatId(chatId, userId).catch((error: unknown) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);

  const settings = await getSettings(userId).catch((error: unknown) => {
    stageError("storage", error);
  });
  const presetState = await resolveActivePreset(resolvedChatId, userId).catch((error: unknown) => {
    stageError("storage", error);
  });

  if (trigger.kind === "manual") {
    cancelPendingAutoForChat(resolvedChatId, userId, "Manual generation superseded the pending auto job.");
  }

  if (trigger.kind === "auto" && activeJobs.has(resolvedChatId)) {
    await markAutoSkipped(
      resolvedChatId,
      userId,
      trigger,
      "A tracker generation is already running for this chat.",
      nowIso(),
    );
    return;
  }

  const existing = activeJobs.get(resolvedChatId);
  const lastCancellation: LTrackerCancellation | null = existing
    ? {
        jobId: existing.jobId,
        requestId: existing.requestId,
        reason: "Cancelled by a newer Generate Tracker request.",
        createdAt: nowIso(),
      }
    : null;
  existing?.controller.abort();

  const job: ActiveJob = {
    controller: new AbortController(),
    jobId: newJobId(),
    requestId,
    sourceKind: trigger.kind,
  };
  activeJobs.set(resolvedChatId, job);

  const startedAtMs = Date.now();
  let diagnostics: LTrackerDiagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    status: "generating" as const,
    lastJobId: job.jobId,
    lastRequestId: requestId,
    lastGenerationSource: trigger.kind,
    lastGenerationStartedAt: new Date(startedAtMs).toISOString(),
    lastGenerationCompletedAt: null,
    lastGenerationDurationMs: null,
    lastMessagesRead: 0,
    lastSourceMessageIds: [],
    lastSourceMessageRange: null,
    lastRawOutput: null,
    lastParsedTracker: null,
    lastPromptPreview: null,
    lastError: null,
    lastCancellation,
    lastAutoTriggeredAt: trigger.kind === "auto" ? new Date(startedAtMs).toISOString() : null,
    selectedPresetId: presetState.activePreset.id,
    selectedPresetName: presetState.activePreset.name,
    lastPresetFallbackReason: presetState.fallbackReason,
    lastPresetValidationError: null,
    lastPromptUsedPresetId: null,
    lastPromptUsedPresetName: null,
  };
  if (trigger.kind === "auto") {
    diagnostics = {
      ...diagnostics,
      lastAutoEventType: trigger.eventType,
      lastAutoSkippedReason: null,
      lastAutoSourceMessageId: trigger.sourceMessageId,
      lastAutoSourceMessageIndex: trigger.sourceMessageIndex,
      lastAutoGenerationId: trigger.generationId,
    };
  }

  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, "generating", null, requestId);

  try {
    stage = "read_messages";
    const rawMessages = await getRecentMessages(resolvedChatId, settings);
    const transcriptMessages = normalizeMessages(rawMessages);
    if (transcriptMessages.length === 0) {
      throw new LTrackerStageError("read_messages", "This chat has no readable messages to track.");
    }

    const sourceMessageIds = rawMessages.map((message) => message.id);
    diagnostics = {
      ...diagnostics,
      lastMessagesRead: rawMessages.length,
      lastSourceMessageIds: sourceMessageIds,
      lastSourceMessageRange: sourceRange(sourceMessageIds),
    };

    stage = "prompt";
    const transcript = buildCompactTranscript(transcriptMessages, settings.maxMessageChars);
    const promptMessages: LlmMessageDTO[] = buildTrackerPrompt(transcript, presetState.activePreset);
    diagnostics = {
      ...diagnostics,
      lastPromptUsedPresetId: presetState.activePreset.id,
      lastPromptUsedPresetName: presetState.activePreset.name,
      lastPromptPreview: settings.savePromptPreview
        ? promptPreview(promptMessages)
        : "[Prompt preview saving disabled]",
    };
    await tryPersistDiagnostics(diagnostics, userId);

    stage = "generation";
    const rawOutput = await runTrackerGeneration(promptMessages, userId, settings, job.controller.signal);
    if (!isCurrentJob(resolvedChatId, job.jobId)) return;

    diagnostics = {
      ...diagnostics,
      lastRawOutput: settings.saveRawOutput ? rawOutput : "[Raw output saving disabled]",
    };

    stage = "parse";
    const data = parseTrackerJson(rawOutput);
    if (!isCurrentJob(resolvedChatId, job.jobId)) return;

    if (
      trigger.kind === "auto"
      && settings.auto.onlyWhenChatActive
      && activeChatByUser.get(userId) !== resolvedChatId
    ) {
      const completedAtMs = Date.now();
      diagnostics = {
        ...diagnostics,
        status: "idle",
        lastGenerationCompletedAt: new Date(completedAtMs).toISOString(),
        lastGenerationDurationMs: completedAtMs - startedAtMs,
        lastAutoSkippedReason: "Chat changed before the auto tracker result was saved.",
        lastError: null,
      };
      await persistDiagnostics(diagnostics, userId);
      await sendState(resolvedChatId, userId, "idle", null, requestId);
      return;
    }

    const completedAtMs = Date.now();
    const completedAt = new Date(completedAtMs).toISOString();
    const snapshot: TrackerSnapshot = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      extensionVersion: EXTENSION_VERSION,
      chatId: resolvedChatId,
      createdAt: completedAt,
      messageCount: transcriptMessages.length,
      sourceMessageIds,
      data,
    };

    stage = "storage";
    await saveSnapshot(snapshot, userId);

    diagnostics = {
      ...diagnostics,
      status: "idle",
      lastGenerationCompletedAt: completedAt,
      lastGenerationDurationMs: completedAtMs - startedAtMs,
      lastParsedTracker: data,
      lastError: null,
    };

    if (trigger.kind === "auto" && settings.auto.attachSnapshotToMessage) {
      const attachedAt = nowIso();
      const storageKey = messageSnapshotPath(resolvedChatId, trigger.sourceMessageId);
      const attachedSnapshot: MessageAttachedSnapshot = {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        extensionVersion: EXTENSION_VERSION,
        chatId: resolvedChatId,
        messageId: trigger.sourceMessageId,
        messageIndex: trigger.sourceMessageIndex,
        trigger,
        snapshot,
        attachedAt,
      };
      await saveMessageAttachedSnapshot(attachedSnapshot, userId);
      diagnostics = {
        ...diagnostics,
        latestAttachedMessageId: trigger.sourceMessageId,
        latestAttachedMessageIndex: trigger.sourceMessageIndex,
        latestAttachedSnapshotAt: attachedAt,
        latestAttachedSnapshotStorageKey: storageKey,
      };
    }

    await persistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId);
  } catch (error) {
    if (!isCurrentJob(resolvedChatId, job.jobId)) return;
    if (trigger.kind === "auto" && job.controller.signal.aborted && job.cancelReason) {
      const completedAtMs = Date.now();
      diagnostics = {
        ...diagnostics,
        status: "idle",
        lastGenerationCompletedAt: new Date(completedAtMs).toISOString(),
        lastGenerationDurationMs: completedAtMs - startedAtMs,
        lastCancellation: {
          jobId: job.jobId,
          requestId,
          reason: job.cancelReason,
          createdAt: nowIso(),
        },
        lastAutoSkippedReason: job.cancelReason,
        lastError: null,
      };
      await tryPersistDiagnostics(diagnostics, userId);
      await sendState(resolvedChatId, userId, "idle", null, requestId);
      return;
    }
    const currentError = diagnosticError(error, stage);
    const completedAtMs = Date.now();
    diagnostics = {
      ...diagnostics,
      status: "error",
      lastGenerationCompletedAt: new Date(completedAtMs).toISOString(),
      lastGenerationDurationMs: completedAtMs - startedAtMs,
      lastError: currentError,
    };
    await tryPersistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "error", currentError, requestId);
  } finally {
    if (isCurrentJob(resolvedChatId, job.jobId)) activeJobs.delete(resolvedChatId);
  }
}

async function clearSnapshot(chatId: string | null, userId: string, requestId: string): Promise<void> {
  const resolvedChatId = await resolveActiveChatId(chatId, userId).catch((error: unknown) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const path = snapshotPath(resolvedChatId);

  try {
    if (await spindle.userStorage.exists(path, userId)) {
      await spindle.userStorage.delete(path, userId);
    }
    const diagnostics = {
      ...await loadDiagnostics(resolvedChatId, userId),
      status: "idle" as const,
      lastParsedTracker: null,
      lastError: null,
    };
    await persistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId);
  } catch (error) {
    stageError("storage", error);
  }
}

function normalizePresetDraft(value: TrackerPresetDraft): TrackerPresetDraft {
  const draft: TrackerPresetDraft = {
    name: typeof value.name === "string" ? value.name : "",
    description: typeof value.description === "string" ? value.description : "",
    version: typeof value.version === "string" ? value.version : "1.0",
    jsonSchema: isRecord(value.jsonSchema) && !Array.isArray(value.jsonSchema) ? value.jsonSchema : {},
    promptInstructions: typeof value.promptInstructions === "string" ? value.promptInstructions : "",
  };
  if (typeof value.id === "string") draft.id = value.id;
  if (typeof value.htmlTemplate === "string") draft.htmlTemplate = value.htmlTemplate;
  if (typeof value.notes === "string") draft.notes = value.notes;
  if (isRecord(value.capabilities)) {
    const capabilities: NonNullable<TrackerPresetDraft["capabilities"]> = {};
    if (typeof value.capabilities.supportsHtmlTemplate === "boolean") {
      capabilities.supportsHtmlTemplate = value.capabilities.supportsHtmlTemplate;
    }
    if (typeof value.capabilities.supportsPartialRegeneration === "boolean") {
      capabilities.supportsPartialRegeneration = value.capabilities.supportsPartialRegeneration;
    }
    if (typeof value.capabilities.supportsSequentialGeneration === "boolean") {
      capabilities.supportsSequentialGeneration = value.capabilities.supportsSequentialGeneration;
    }
    if (Object.keys(capabilities).length > 0) draft.capabilities = capabilities;
  }
  return draft;
}

function validatePresetDraft(draft: TrackerPresetDraft): string | null {
  const schemaValidation = validateJsonSchema(draft.jsonSchema);
  if (!schemaValidation.ok) return schemaValidation.error;
  if (!draft.name.trim()) return "Preset name is required.";
  if (!draft.version.trim()) return "Preset version is required.";
  if (!draft.promptInstructions.trim()) return "Prompt instructions are required.";
  return null;
}

async function presetOperationChatId(chatId: string | null, userId: string): Promise<string> {
  return resolveActiveChatId(chatId, userId).catch((error: unknown) => {
    stageError("active_chat", error);
  });
}

async function recordPresetDiagnostic(
  chatId: string,
  userId: string,
  fields: Pick<LTrackerDiagnostics, "lastPresetValidationError" | "lastPresetFallbackReason">,
): Promise<void> {
  const diagnostics = {
    ...await loadDiagnostics(chatId, userId),
    ...fields,
  };
  await tryPersistDiagnostics(diagnostics, userId);
}

async function selectPreset(chatId: string | null, userId: string, presetId: string, requestId: string): Promise<void> {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  const presets = await loadPresetCatalog(userId);
  const selected = presetById(presets, presetId);
  if (!selected) throw new Error(`Preset ${presetId} was not found.`);
  await saveActivePresetState(resolvedChatId, selected.id, userId);
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetValidationError: null,
    lastPresetFallbackReason: null,
  });
  await sendState(resolvedChatId, userId, "idle", null, requestId);
}

async function savePresetFromDraft(input: {
  chatId: string | null;
  userId: string;
  requestId: string;
  draft: TrackerPresetDraft;
  mode: "new" | "duplicate" | "update";
  presetId?: string;
}): Promise<void> {
  const resolvedChatId = await presetOperationChatId(input.chatId, input.userId);
  const draft = normalizePresetDraft(input.draft);
  const validationError = validatePresetDraft(draft);
  if (validationError) {
    await recordPresetDiagnostic(resolvedChatId, input.userId, {
      lastPresetValidationError: validationError,
      lastPresetFallbackReason: null,
    });
    throw new Error(validationError);
  }

  const presets = await loadPresetCatalog(input.userId);
  const existingIds = presets.map((preset) => preset.id);
  const now = nowIso();
  const existing = input.presetId ? presetById(presets, input.presetId) : null;
  if (input.mode === "update") {
    if (!existing) throw new Error("Preset to update was not found.");
    if (!canModifyPreset(existing)) throw new Error("Built-in presets cannot be overwritten.");
  }
  const id = input.mode === "update" && input.presetId
    ? input.presetId
    : createPresetId(draft.name, existingIds);
  const preset = draftToPreset(draft, {
    id,
    origin: existing?.origin === "user_imported" && input.mode === "update" ? "user_imported" : "user_created",
    now,
    existing: input.mode === "update" ? existing : null,
  });
  await saveUserPreset(preset, input.userId);
  await saveActivePresetState(resolvedChatId, preset.id, input.userId);
  await recordPresetDiagnostic(resolvedChatId, input.userId, {
    lastPresetValidationError: null,
    lastPresetFallbackReason: null,
  });
  await sendState(resolvedChatId, input.userId, "idle", null, input.requestId);
}

async function deletePreset(chatId: string | null, userId: string, presetId: string, requestId: string): Promise<void> {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  const presets = await loadPresetCatalog(userId);
  const preset = presetById(presets, presetId);
  if (!preset) throw new Error("Preset to delete was not found.");
  if (!canModifyPreset(preset)) throw new Error("Built-in presets cannot be deleted.");
  await deleteUserPreset(presetId, userId);
  const active = await loadActivePresetState(resolvedChatId, userId);
  if (active.selectedPresetId === presetId) {
    await saveActivePresetState(resolvedChatId, DEFAULT_TRACKER_PRESET_ID, userId);
  }
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetValidationError: null,
    lastPresetFallbackReason: null,
  });
  await sendState(resolvedChatId, userId, "idle", null, requestId);
}

async function resetPreset(chatId: string | null, userId: string, requestId: string): Promise<void> {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  await saveActivePresetState(resolvedChatId, DEFAULT_TRACKER_PRESET_ID, userId);
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetValidationError: null,
    lastPresetFallbackReason: null,
  });
  await sendState(resolvedChatId, userId, "idle", null, requestId);
}

async function importPreset(chatId: string | null, userId: string, importText: string, requestId: string): Promise<void> {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  let parsed: unknown;
  try {
    parsed = JSON.parse(importText);
  } catch (error) {
    const message = `Import JSON is invalid: ${errorMessage(error)}`;
    await recordPresetDiagnostic(resolvedChatId, userId, {
      lastPresetValidationError: message,
      lastPresetFallbackReason: null,
    });
    throw new Error(message);
  }

  const presets = await loadPresetCatalog(userId);
  const imported = importTrackerPresetEnvelope(parsed, presets.map((preset) => preset.id), nowIso());
  if (!imported.ok || !imported.preset) {
    const message = imported.error ?? "Imported preset is invalid.";
    await recordPresetDiagnostic(resolvedChatId, userId, {
      lastPresetValidationError: message,
      lastPresetFallbackReason: null,
    });
    throw new Error(message);
  }
  await saveUserPreset(imported.preset, userId);
  await saveActivePresetState(resolvedChatId, imported.preset.id, userId);
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetValidationError: null,
    lastPresetFallbackReason: null,
  });
  await sendState(resolvedChatId, userId, "idle", null, requestId);
}

async function validatePreset(chatId: string | null, userId: string, draftValue: TrackerPresetDraft, requestId: string): Promise<void> {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  const draft = normalizePresetDraft(draftValue);
  const validationError = validatePresetDraft(draft);
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetValidationError: validationError,
    lastPresetFallbackReason: null,
  });
  if (validationError) throw new Error(validationError);
  await sendState(resolvedChatId, userId, "idle", null, requestId);
}

async function handleSettingsSave(
  payload: Extract<FrontendMessage, { type: "save_settings" }>,
  userId: string,
): Promise<void> {
  const settings = await saveSettings(payload.settings, userId).catch((error: unknown) => {
    stageError("storage", error);
  });
  const resolvedChatId = payload.chatId
    ? payload.chatId
    : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  if (!settings.auto.autoModeEnabled && resolvedChatId) {
    cancelPendingAutoForChat(resolvedChatId, userId, "Auto mode was disabled.");
    abortAutoJobForChat(resolvedChatId, "Auto mode was disabled before the tracker result was saved.");
  }
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}

async function handleSettingsReset(
  payload: Extract<FrontendMessage, { type: "reset_settings" }>,
  userId: string,
): Promise<void> {
  await resetSettings(userId).catch((error: unknown) => {
    stageError("storage", error);
  });
  const resolvedChatId = payload.chatId
    ? payload.chatId
    : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  if (resolvedChatId) {
    cancelPendingAutoForChat(resolvedChatId, userId, "Settings were reset.");
    abortAutoJobForChat(resolvedChatId, "Settings were reset before the auto tracker result was saved.");
  }
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}

async function handleRefresh(
  payload: Extract<FrontendMessage, { type: "ready" | "refresh_state" }>,
  userId: string,
): Promise<void> {
  const resolvedChatId = payload.chatId
    ? payload.chatId
    : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  await sendState(resolvedChatId, userId, undefined, null);
}

function disposeBackend(): void {
  if (disposed) return;
  disposed = true;
  for (const pending of pendingAutoJobs.values()) clearTimeout(pending.timer);
  pendingAutoJobs.clear();
  for (const job of activeJobs.values()) job.controller.abort();
  activeJobs.clear();
  for (const cleanup of eventCleanups.splice(0).reverse()) cleanup();
  autoSubscriptionsActive = false;
  contextHandlerRegistered = false;
}

function registerEventListeners(): void {
  eventCleanups.push(spindle.on("GENERATION_ENDED", (payload, userId) => {
    void handleGenerationEnded(payload, userId).catch((error: unknown) => {
      spindle.log.warn(`LTracker generation-ended handler failed: ${errorMessage(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("MESSAGE_SENT", (payload, userId) => {
    void handleMessageSent(payload, userId).catch((error: unknown) => {
      spindle.log.warn(`LTracker message-sent handler failed: ${errorMessage(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("CHAT_SWITCHED", handleChatSwitched));
  eventCleanups.push(spindle.on("EXTENSION_UNLOADED", disposeBackend));
  autoSubscriptionsActive = true;
}

function registerContextInjection(): void {
  if (contextHandlerRegistered) return;
  if (!permissionState().contextHandler) {
    spindle.log.warn("LTracker context injection is unavailable because context_handler permission is missing.");
    return;
  }
  spindle.registerContextHandler(handleContextInjection, 40);
  contextHandlerRegistered = true;
}

registerEventListeners();
registerContextInjection();

spindle.onFrontendMessage((payload, userId) => {
  if (!isFrontendMessage(payload)) return;

  const requestId = "requestId" in payload ? payload.requestId : undefined;
  const chatId = payload.chatId;
  if (chatId) rememberActiveChat(userId, chatId);

  void (async () => {
    try {
      if (payload.type === "generate_tracker") {
        await generateTracker(chatId, userId, createManualTrigger(payload.requestId));
        return;
      }
      if (payload.type === "clear_snapshot") {
        await clearSnapshot(chatId, userId, payload.requestId);
        return;
      }
      if (payload.type === "save_settings") {
        await handleSettingsSave(payload, userId);
        return;
      }
      if (payload.type === "reset_settings") {
        await handleSettingsReset(payload, userId);
        return;
      }
      if (payload.type === "select_preset") {
        await selectPreset(chatId, userId, payload.presetId, payload.requestId);
        return;
      }
      if (payload.type === "save_preset_as_new") {
        await savePresetFromDraft({
          chatId,
          userId,
          requestId: payload.requestId,
          draft: payload.preset,
          mode: "new",
        });
        return;
      }
      if (payload.type === "duplicate_preset") {
        await savePresetFromDraft({
          chatId,
          userId,
          requestId: payload.requestId,
          draft: payload.preset,
          mode: "duplicate",
        });
        return;
      }
      if (payload.type === "update_preset") {
        await savePresetFromDraft({
          chatId,
          userId,
          requestId: payload.requestId,
          draft: payload.preset,
          mode: "update",
          presetId: payload.presetId,
        });
        return;
      }
      if (payload.type === "delete_preset") {
        await deletePreset(chatId, userId, payload.presetId, payload.requestId);
        return;
      }
      if (payload.type === "reset_preset") {
        await resetPreset(chatId, userId, payload.requestId);
        return;
      }
      if (payload.type === "import_preset") {
        await importPreset(chatId, userId, payload.importText, payload.requestId);
        return;
      }
      if (payload.type === "validate_preset") {
        await validatePreset(chatId, userId, payload.preset, payload.requestId);
        return;
      }
      await handleRefresh(payload, userId);
    } catch (error) {
      const currentError = diagnosticError(error, "unknown");
      spindle.log.warn(`LTracker request failed: ${currentError.message}`);
      const state = await buildState(chatId, userId, "error", currentError);
      const response: BackendMessage = {
        type: "error",
        message: currentError.message,
        state,
      };
      if (requestId) response.requestId = requestId;
      send(response, userId);
    }
  })();
});

spindle.log.info("LTracker backend loaded.");
