import type {
  ChatMessageDTO,
  LlmMessageDTO,
  SpindleAPI,
} from "lumiverse-spindle-types";
import { parseTrackerJson } from "./shared/parser";
import {
  DEFAULT_SETTINGS,
  repairSettings,
} from "./shared/settings";
import {
  diagnosticsPath,
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
  type BackendMessage,
  type FrontendMessage,
  type FrontendState,
  type LTrackerBuildInfo,
  type LTrackerCancellation,
  type LTrackerDiagnostics,
  type LTrackerError,
  type LTrackerErrorStage,
  type LTrackerSettings,
  type PermissionState,
  type TrackerSnapshot,
  type TranscriptMessage,
} from "./shared/types";

declare const spindle: SpindleAPI;

interface ActiveJob {
  controller: AbortController;
  jobId: string;
  requestId: string;
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
let disposed = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
    createdAt: new Date().toISOString(),
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
  ].includes(payload.type)) return false;
  if ("chatId" in payload && payload.chatId !== null && typeof payload.chatId !== "string") return false;
  if (
    ["generate_tracker", "clear_snapshot", "save_settings", "reset_settings"].includes(payload.type)
    && typeof payload.requestId !== "string"
  ) return false;
  if (payload.type === "save_settings" && !isRecord(payload.settings)) return false;
  return true;
}

function permissionState(): PermissionState {
  return {
    generation: spindle.permissions.has("generation"),
    chats: spindle.permissions.has("chats"),
    chatMutation: spindle.permissions.has("chat_mutation"),
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
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) && !Array.isArray(value) ? value : null;
}

function errorOrNull(value: unknown): LTrackerError | null {
  if (!isRecord(value) || typeof value.stage !== "string" || typeof value.message !== "string") return null;
  const error: LTrackerError = {
    stage: value.stage as LTrackerErrorStage,
    message: value.message,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
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
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
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

async function loadSnapshot(chatId: string | null, userId: string): Promise<TrackerSnapshot | null> {
  if (!chatId) return null;
  return spindle.userStorage.getJson<TrackerSnapshot | null>(snapshotPath(chatId), {
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
  await spindle.userStorage.setJson(diagnosticsPath(diagnostics.chatId), diagnostics, {
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
  const snapshot = await loadSnapshot(chatId, userId);
  const stateError = error ?? diagnostics.lastError;
  return {
    version: EXTENSION_VERSION,
    status: status ?? diagnostics.status,
    chatId,
    snapshot,
    error: stateError,
    permissions: permissionState(),
    settings,
    diagnostics: {
      ...diagnostics,
      status: status ?? diagnostics.status,
      lastError: stateError,
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

async function getRecentMessages(chatId: string, settings: LTrackerSettings): Promise<ChatMessageDTO[]> {
  ensurePermission("chatMutation", "chat_mutation is required to read recent chat messages");
  if (!spindle.chat?.getMessages) {
    throw new Error("Lumiverse chat message API is unavailable.");
  }
  const messages = await spindle.chat.getMessages(chatId);
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

async function generateTracker(chatId: string | null, userId: string, requestId: string): Promise<void> {
  let stage: LTrackerErrorStage = "active_chat";
  const resolvedChatId = await resolveActiveChatId(chatId, userId).catch((error: unknown) => {
    stageError("active_chat", error);
  });

  const settings = await getSettings(userId).catch((error: unknown) => {
    stageError("storage", error);
  });

  const existing = activeJobs.get(resolvedChatId);
  const lastCancellation: LTrackerCancellation | null = existing
    ? {
        jobId: existing.jobId,
        requestId: existing.requestId,
        reason: "Cancelled by a newer Generate Tracker request.",
        createdAt: new Date().toISOString(),
      }
    : null;
  existing?.controller.abort();

  const job: ActiveJob = {
    controller: new AbortController(),
    jobId: newJobId(),
    requestId,
  };
  activeJobs.set(resolvedChatId, job);

  const startedAtMs = Date.now();
  let diagnostics: LTrackerDiagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    status: "generating" as const,
    lastJobId: job.jobId,
    lastRequestId: requestId,
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
  };

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
    const promptMessages: LlmMessageDTO[] = buildTrackerPrompt(transcript);
    diagnostics = {
      ...diagnostics,
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

    const completedAtMs = Date.now();
    diagnostics = {
      ...diagnostics,
      status: "idle",
      lastGenerationCompletedAt: new Date(completedAtMs).toISOString(),
      lastGenerationDurationMs: completedAtMs - startedAtMs,
      lastParsedTracker: data,
      lastError: null,
    };

    const snapshot: TrackerSnapshot = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      extensionVersion: EXTENSION_VERSION,
      chatId: resolvedChatId,
      createdAt: new Date(completedAtMs).toISOString(),
      messageCount: transcriptMessages.length,
      sourceMessageIds,
      data,
    };

    stage = "storage";
    await saveSnapshot(snapshot, userId);
    await persistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId);
  } catch (error) {
    if (!isCurrentJob(resolvedChatId, job.jobId)) return;
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

async function handleSettingsSave(
  payload: Extract<FrontendMessage, { type: "save_settings" }>,
  userId: string,
): Promise<void> {
  await saveSettings(payload.settings, userId).catch((error: unknown) => {
    stageError("storage", error);
  });
  const resolvedChatId = payload.chatId
    ? payload.chatId
    : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
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
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}

async function handleRefresh(
  payload: Extract<FrontendMessage, { type: "ready" | "refresh_state" }>,
  userId: string,
): Promise<void> {
  const resolvedChatId = payload.chatId
    ? payload.chatId
    : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  await sendState(resolvedChatId, userId, undefined, null);
}

spindle.onFrontendMessage((payload, userId) => {
  if (!isFrontendMessage(payload)) return;

  const requestId = "requestId" in payload ? payload.requestId : undefined;
  const chatId = payload.chatId;

  void (async () => {
    try {
      if (payload.type === "generate_tracker") {
        await generateTracker(chatId, userId, payload.requestId);
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
