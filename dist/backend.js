// src/shared/auto.ts
function isQuietGenerationType(generationType) {
  return typeof generationType === "string" && generationType.toLowerCase() === "quiet";
}
function shouldScheduleAutoTracker(input) {
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

// src/shared/parser.ts
function normalizeJsonText(raw) {
  return raw.trim().replace(/^\uFEFF/, "").replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
}
function stripCodeFence(raw) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}
function removeTrailingCommas(raw) {
  return raw.replace(/,\s*([}\]])/g, "$1");
}
function extractBalancedObject(raw) {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return raw.slice(start, index + 1);
    }
  }
  return null;
}
function parseObject(candidate) {
  const parsed = JSON.parse(candidate);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Tracker output must be a JSON object.");
  }
  return parsed;
}
function parseTrackerJson(raw) {
  if (!raw.trim()) throw new Error("Tracker generation returned empty output.");
  const candidates = [
    normalizeJsonText(raw),
    stripCodeFence(normalizeJsonText(raw)),
    extractBalancedObject(stripCodeFence(normalizeJsonText(raw))) ?? ""
  ].filter((candidate) => candidate.trim().length > 0);
  const repaired = candidates.flatMap((candidate) => [
    candidate,
    removeTrailingCommas(candidate)
  ]);
  let lastError = null;
  for (const candidate of repaired) {
    try {
      return parseObject(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Tracker output was not valid JSON after basic repair. ${detail}`);
}

// src/shared/types.ts
var EXTENSION_VERSION = "0.03";
var STORAGE_SCHEMA_VERSION = 1;
var SETTINGS_SCHEMA_VERSION = 1;
var SPINDLE_TYPES_VERSION = "0.5.21";

// src/shared/settings.ts
var SETTINGS_LIMITS = {
  recentMessageLimit: { min: 1, max: 200, default: 24 },
  maxMessageChars: { min: 500, max: 5e4, default: 8e3 },
  generationTimeoutMs: { min: 1e4, max: 18e4, default: 45e3 },
  autoDebounceMs: { min: 250, max: 3e4, default: 1500 },
  skipFirstMessages: { min: 0, max: 100, default: 2 }
};
var DEFAULT_SETTINGS = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  recentMessageLimit: SETTINGS_LIMITS.recentMessageLimit.default,
  maxMessageChars: SETTINGS_LIMITS.maxMessageChars.default,
  generationTimeoutMs: SETTINGS_LIMITS.generationTimeoutMs.default,
  saveRawOutput: true,
  savePromptPreview: true,
  auto: {
    autoModeEnabled: false,
    autoDebounceMs: SETTINGS_LIMITS.autoDebounceMs.default,
    skipFirstMessages: SETTINGS_LIMITS.skipFirstMessages.default,
    triggerAfterAssistantMessages: true,
    triggerAfterUserMessages: false,
    attachSnapshotToMessage: true,
    onlyWhenChatActive: true
  }
};
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function clampNumber(value, fallback, min, max) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() ? Number(value) : fallback;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}
function repairSettings(value) {
  const source = isRecord(value) ? value : {};
  const autoSource = isRecord(source.auto) ? source.auto : {};
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    recentMessageLimit: clampNumber(
      source.recentMessageLimit,
      SETTINGS_LIMITS.recentMessageLimit.default,
      SETTINGS_LIMITS.recentMessageLimit.min,
      SETTINGS_LIMITS.recentMessageLimit.max
    ),
    maxMessageChars: clampNumber(
      source.maxMessageChars,
      SETTINGS_LIMITS.maxMessageChars.default,
      SETTINGS_LIMITS.maxMessageChars.min,
      SETTINGS_LIMITS.maxMessageChars.max
    ),
    generationTimeoutMs: clampNumber(
      source.generationTimeoutMs,
      SETTINGS_LIMITS.generationTimeoutMs.default,
      SETTINGS_LIMITS.generationTimeoutMs.min,
      SETTINGS_LIMITS.generationTimeoutMs.max
    ),
    saveRawOutput: typeof source.saveRawOutput === "boolean" ? source.saveRawOutput : DEFAULT_SETTINGS.saveRawOutput,
    savePromptPreview: typeof source.savePromptPreview === "boolean" ? source.savePromptPreview : DEFAULT_SETTINGS.savePromptPreview,
    auto: {
      autoModeEnabled: typeof autoSource.autoModeEnabled === "boolean" ? autoSource.autoModeEnabled : DEFAULT_SETTINGS.auto.autoModeEnabled,
      autoDebounceMs: clampNumber(
        autoSource.autoDebounceMs,
        SETTINGS_LIMITS.autoDebounceMs.default,
        SETTINGS_LIMITS.autoDebounceMs.min,
        SETTINGS_LIMITS.autoDebounceMs.max
      ),
      skipFirstMessages: clampNumber(
        autoSource.skipFirstMessages,
        SETTINGS_LIMITS.skipFirstMessages.default,
        SETTINGS_LIMITS.skipFirstMessages.min,
        SETTINGS_LIMITS.skipFirstMessages.max
      ),
      triggerAfterAssistantMessages: typeof autoSource.triggerAfterAssistantMessages === "boolean" ? autoSource.triggerAfterAssistantMessages : DEFAULT_SETTINGS.auto.triggerAfterAssistantMessages,
      triggerAfterUserMessages: typeof autoSource.triggerAfterUserMessages === "boolean" ? autoSource.triggerAfterUserMessages : DEFAULT_SETTINGS.auto.triggerAfterUserMessages,
      attachSnapshotToMessage: typeof autoSource.attachSnapshotToMessage === "boolean" ? autoSource.attachSnapshotToMessage : DEFAULT_SETTINGS.auto.attachSnapshotToMessage,
      onlyWhenChatActive: typeof autoSource.onlyWhenChatActive === "boolean" ? autoSource.onlyWhenChatActive : DEFAULT_SETTINGS.auto.onlyWhenChatActive
    }
  };
}

// src/shared/storageKeys.ts
function encodeStorageSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => {
    return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}
function snapshotPath(chatId) {
  return `chats/${encodeStorageSegment(chatId)}/latest-snapshot.json`;
}
function messageSnapshotsPrefix(chatId) {
  return `chats/${encodeStorageSegment(chatId)}/messages/`;
}
function messageSnapshotPath(chatId, messageId) {
  return `${messageSnapshotsPrefix(chatId)}${encodeStorageSegment(messageId)}/tracker-snapshot.json`;
}
function diagnosticsPath(chatId) {
  return `chats/${encodeStorageSegment(chatId)}/diagnostics.json`;
}
var SETTINGS_PATH = "settings.json";

// src/shared/defaultSchema.ts
var DEFAULT_TRACKER_SCHEMA = {
  scene: {
    time: "",
    date: "",
    location: "",
    weather: "",
    mood: "",
    danger_level: ""
  },
  characters_present: [
    {
      name: "",
      role: "",
      physical_state: "",
      emotional_state: "",
      outfit: "",
      current_goal: "",
      secrets_or_tension: ""
    }
  ],
  relationships: [
    {
      a: "",
      b: "",
      status: "",
      recent_change: ""
    }
  ],
  inventory_and_assets: [],
  active_threads: [],
  unresolved_continuity: [],
  important_facts: [],
  next_scene_pressure: ""
};
function defaultTrackerSchemaJson() {
  return JSON.stringify(DEFAULT_TRACKER_SCHEMA, null, 2);
}

// src/shared/trackerPrompt.ts
var DEFAULT_MAX_MESSAGE_CHARS = 8e3;
function buildCompactTranscript(messages, maxMessageChars = DEFAULT_MAX_MESSAGE_CHARS) {
  return messages.map((message) => {
    const role = message.role === "user" ? "USER" : "ASSISTANT";
    const name = message.name ? ` ${message.name}` : "";
    const content = message.content.trim().slice(0, maxMessageChars);
    return `[${message.index} ${role}${name}]
${content}`;
  }).join("\n\n");
}
function buildTrackerPrompt(transcript) {
  return [
    {
      role: "system",
      content: [
        "You extract the current state of an ongoing roleplay or story chat.",
        "Return JSON only. Do not wrap the JSON in Markdown.",
        "Do not invent facts unsupported by the transcript.",
        "Preserve character names exactly when possible.",
        "Summarize only the current and relevant state, not every past event.",
        'Use empty strings, empty arrays, or "unknown" for unknown fields.'
      ].join("\n")
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
        "Return only a JSON object matching the schema shape."
      ].join("\n")
    }
  ];
}

// src/backend.ts
var LTrackerStageError = class extends Error {
  stage;
  detail;
  constructor(stage, message, detail) {
    super(message);
    this.name = "LTrackerStageError";
    this.stage = stage;
    if (detail) this.detail = detail;
  }
};
var BUILD_INFO = {
  extensionVersion: EXTENSION_VERSION,
  storageSchemaVersion: STORAGE_SCHEMA_VERSION,
  settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
  spindleTypesVersion: SPINDLE_TYPES_VERSION,
  buildTarget: "es2022"
};
var activeJobs = /* @__PURE__ */ new Map();
var pendingAutoJobs = /* @__PURE__ */ new Map();
var activeChatByUser = /* @__PURE__ */ new Map();
var usersByChat = /* @__PURE__ */ new Map();
var eventCleanups = [];
var autoSubscriptionsActive = false;
var disposed = false;
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function errorDetail(error) {
  if (error instanceof Error && error.stack) return error.stack;
  return void 0;
}
function stageError(stage, error) {
  if (error instanceof LTrackerStageError) throw error;
  throw new LTrackerStageError(stage, errorMessage(error), errorDetail(error));
}
function diagnosticError(error, fallbackStage) {
  const stage = error instanceof LTrackerStageError ? error.stage : fallbackStage;
  const detail = error instanceof LTrackerStageError ? error.detail : errorDetail(error);
  const result = {
    stage,
    message: errorMessage(error),
    createdAt: nowIso()
  };
  if (detail) result.detail = detail;
  return result;
}
function isFrontendMessage(payload) {
  if (!isRecord2(payload) || typeof payload.type !== "string") return false;
  if (![
    "ready",
    "refresh_state",
    "generate_tracker",
    "clear_snapshot",
    "save_settings",
    "reset_settings"
  ].includes(payload.type)) return false;
  if ("chatId" in payload && payload.chatId !== null && typeof payload.chatId !== "string") return false;
  if (["generate_tracker", "clear_snapshot", "save_settings", "reset_settings"].includes(payload.type) && typeof payload.requestId !== "string") return false;
  if (payload.type === "save_settings" && !isRecord2(payload.settings)) return false;
  return true;
}
function permissionState() {
  return {
    generation: spindle.permissions.has("generation"),
    chats: spindle.permissions.has("chats"),
    chatMutation: spindle.permissions.has("chat_mutation")
  };
}
function send(payload, userId) {
  if (!disposed) spindle.sendToFrontend(payload, userId);
}
function defaultDiagnostics(chatId) {
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
    latestAttachedSnapshotStorageKey: null
  };
}
function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}
function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function nonNegativeInteger(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function recordOrNull(value) {
  return isRecord2(value) && !Array.isArray(value) ? value : null;
}
function sourceKindOrNull(value) {
  return value === "manual" || value === "auto" ? value : null;
}
function autoEventTypeOrNull(value) {
  return value === "GENERATION_ENDED" || value === "MESSAGE_SENT" ? value : null;
}
function errorOrNull(value) {
  if (!isRecord2(value) || typeof value.stage !== "string" || typeof value.message !== "string") return null;
  const error = {
    stage: value.stage,
    message: value.message,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso()
  };
  if (typeof value.detail === "string") error.detail = value.detail;
  return error;
}
function cancellationOrNull(value) {
  if (!isRecord2(value) || typeof value.jobId !== "string" || typeof value.requestId !== "string" || typeof value.reason !== "string") return null;
  return {
    jobId: value.jobId,
    requestId: value.requestId,
    reason: value.reason,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso()
  };
}
function repairDiagnostics(value, chatId) {
  const base = defaultDiagnostics(chatId);
  if (!isRecord2(value)) return base;
  return {
    ...base,
    status: value.status === "generating" || value.status === "error" ? value.status : "idle",
    lastJobId: stringOrNull(value.lastJobId),
    lastRequestId: stringOrNull(value.lastRequestId),
    lastGenerationSource: sourceKindOrNull(value.lastGenerationSource),
    lastGenerationStartedAt: stringOrNull(value.lastGenerationStartedAt),
    lastGenerationCompletedAt: stringOrNull(value.lastGenerationCompletedAt),
    lastGenerationDurationMs: numberOrNull(value.lastGenerationDurationMs),
    lastMessagesRead: typeof value.lastMessagesRead === "number" && Number.isFinite(value.lastMessagesRead) ? Math.max(0, Math.round(value.lastMessagesRead)) : 0,
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
    latestAttachedSnapshotStorageKey: stringOrNull(value.latestAttachedSnapshotStorageKey)
  };
}
async function getSettings(userId) {
  const raw = await spindle.userStorage.getJson(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS,
    userId
  });
  const repaired = repairSettings(raw);
  if (JSON.stringify(raw) !== JSON.stringify(repaired)) {
    await spindle.userStorage.setJson(SETTINGS_PATH, repaired, { indent: 2, userId });
  }
  return repaired;
}
async function saveSettings(settings, userId) {
  const repaired = repairSettings(settings);
  await spindle.userStorage.setJson(SETTINGS_PATH, repaired, { indent: 2, userId });
  return repaired;
}
async function resetSettings(userId) {
  await spindle.userStorage.setJson(SETTINGS_PATH, DEFAULT_SETTINGS, { indent: 2, userId });
  return DEFAULT_SETTINGS;
}
async function loadSnapshot(chatId, userId) {
  if (!chatId) return null;
  return spindle.userStorage.getJson(snapshotPath(chatId), {
    fallback: null,
    userId
  });
}
async function loadMessageSnapshot(chatId, messageId, userId) {
  if (!chatId || !messageId) return null;
  return spindle.userStorage.getJson(messageSnapshotPath(chatId, messageId), {
    fallback: null,
    userId
  });
}
async function loadDiagnostics(chatId, userId) {
  if (!chatId) return defaultDiagnostics(null);
  const raw = await spindle.userStorage.getJson(diagnosticsPath(chatId), {
    fallback: null,
    userId
  });
  return repairDiagnostics(raw, chatId);
}
async function persistDiagnostics(diagnostics, userId) {
  if (!diagnostics.chatId) return;
  await spindle.userStorage.setJson(diagnosticsPath(diagnostics.chatId), {
    ...diagnostics,
    autoSubscriptionActive: autoSubscriptionsActive
  }, {
    indent: 2,
    userId
  });
}
async function tryPersistDiagnostics(diagnostics, userId) {
  try {
    await persistDiagnostics(diagnostics, userId);
  } catch (error) {
    spindle.log.warn(`LTracker could not save diagnostics: ${errorMessage(error)}`);
  }
}
async function buildState(chatId, userId, status, error = null) {
  const settings = await getSettings(userId);
  const diagnostics = await loadDiagnostics(chatId, userId);
  const snapshot = await loadSnapshot(chatId, userId);
  const latestMessageSnapshot = await loadMessageSnapshot(
    chatId,
    diagnostics.latestAttachedMessageId,
    userId
  );
  const stateError = error ?? diagnostics.lastError;
  return {
    version: EXTENSION_VERSION,
    status: status ?? diagnostics.status,
    chatId,
    snapshot,
    latestMessageSnapshot,
    error: stateError,
    permissions: permissionState(),
    settings,
    diagnostics: {
      ...diagnostics,
      status: status ?? diagnostics.status,
      lastError: stateError,
      autoSubscriptionActive: autoSubscriptionsActive
    }
  };
}
async function sendState(chatId, userId, status, error = null, requestId) {
  const message = {
    type: "state",
    state: await buildState(chatId, userId, status, error)
  };
  if (requestId) message.requestId = requestId;
  send(message, userId);
}
function ensurePermission(permission, label) {
  if (!permissionState()[permission]) {
    throw new Error(`Missing permission: ${label}.`);
  }
}
async function resolveActiveChatId(chatId, userId) {
  if (chatId) return chatId;
  ensurePermission("chats", "chats is required to resolve the active chat");
  if (!spindle.chats?.getActive) {
    throw new Error("Lumiverse active chat API is unavailable.");
  }
  const active = await spindle.chats.getActive(userId);
  if (!active?.id) throw new Error("No active chat is open.");
  return active.id;
}
async function readChatMessages(chatId) {
  ensurePermission("chatMutation", "chat_mutation is required to read chat messages");
  if (!spindle.chat?.getMessages) {
    throw new Error("Lumiverse chat message API is unavailable.");
  }
  return spindle.chat.getMessages(chatId);
}
async function getRecentMessages(chatId, settings) {
  const messages = await readChatMessages(chatId);
  return messages.slice(-settings.recentMessageLimit);
}
function normalizeMessages(messages) {
  return messages.filter((message) => message.content.trim().length > 0).map((message) => ({
    index: message.index_in_chat,
    role: message.is_user ? "user" : "assistant",
    name: message.name ?? "",
    content: message.content
  }));
}
function normalizeGenerationText(result) {
  if (typeof result === "string" && result.trim()) return result;
  if (!isRecord2(result)) {
    throw new Error("Lumiverse generation returned an unsupported response.");
  }
  for (const key of ["content", "text", "output", "response"]) {
    const value = result[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const message = result.message;
  if (typeof message === "string" && message.trim()) return message;
  if (isRecord2(message) && typeof message.content === "string" && message.content.trim()) {
    return message.content;
  }
  throw new Error("Lumiverse generation completed without textual content.");
}
async function runTrackerGeneration(messages, userId, settings, parentSignal) {
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
      signal: controller.signal
    });
    return normalizeGenerationText(result);
  } catch (error) {
    if (parentSignal.aborted) {
      throw new Error("Tracker generation was cancelled by a newer request.");
    }
    if (timedOut) {
      throw new Error(`Tracker generation timed out after ${Math.round(settings.generationTimeoutMs / 1e3)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", onParentAbort);
  }
}
async function saveSnapshot(snapshot, userId) {
  await spindle.userStorage.setJson(snapshotPath(snapshot.chatId), snapshot, {
    indent: 2,
    userId
  });
}
async function saveMessageAttachedSnapshot(snapshot, userId) {
  await spindle.userStorage.setJson(messageSnapshotPath(snapshot.chatId, snapshot.messageId), snapshot, {
    indent: 2,
    userId
  });
}
function promptPreview(messages) {
  return messages.map((message) => {
    const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content, null, 2);
    return `## ${message.role}
${content}`;
  }).join("\n\n");
}
function sourceRange(ids) {
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0] ?? null;
  return `${ids[0]} -> ${ids[ids.length - 1]}`;
}
function newJobId() {
  return `job:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
function isCurrentJob(chatId, jobId) {
  return activeJobs.get(chatId)?.jobId === jobId;
}
function userChatKey(userId, chatId) {
  return `${userId}:${chatId}`;
}
function messageRole(message) {
  return message.is_user ? "user" : "assistant";
}
function createManualTrigger(requestId) {
  return { kind: "manual", requestId };
}
function createAutoTrigger(input) {
  return {
    kind: "auto",
    requestId: input.requestId,
    eventType: input.eventType,
    sourceMessageId: input.message.id,
    sourceMessageIndex: input.message.index_in_chat,
    generationId: input.generationId ?? null,
    generationType: input.generationType ?? null
  };
}
async function markAutoSkipped(chatId, userId, trigger, reason, eventAt = null) {
  const diagnostics = {
    ...await loadDiagnostics(chatId, userId),
    status: activeJobs.has(chatId) ? "generating" : "idle",
    lastAutoEventAt: eventAt ?? nowIso(),
    lastAutoEventType: trigger.eventType,
    lastAutoSkippedReason: reason,
    lastAutoScheduledAt: null,
    lastAutoTriggeredAt: null,
    lastAutoSourceMessageId: trigger.sourceMessageId,
    lastAutoSourceMessageIndex: trigger.sourceMessageIndex,
    lastAutoGenerationId: trigger.generationId
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(chatId, userId, diagnostics.status, null, trigger.requestId);
}
function cancelPendingAutoForChat(chatId, userId, reason) {
  for (const [key, pending] of pendingAutoJobs) {
    if (pending.chatId !== chatId) continue;
    if (userId && pending.userId !== userId) continue;
    clearTimeout(pending.timer);
    pendingAutoJobs.delete(key);
    void markAutoSkipped(pending.chatId, pending.userId, pending.trigger, reason, pending.scheduledAt).catch((error) => spindle.log.warn(`LTracker could not record auto cancellation: ${errorMessage(error)}`));
  }
}
function abortAutoJobForChat(chatId, reason) {
  const job = activeJobs.get(chatId);
  if (!job || job.sourceKind !== "auto") return;
  job.cancelReason = reason;
  job.controller.abort();
}
function rememberActiveChat(userId, chatId) {
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
    const users = usersByChat.get(chatId) ?? /* @__PURE__ */ new Set();
    users.add(userId);
    usersByChat.set(chatId, users);
  } else {
    activeChatByUser.delete(userId);
  }
}
function targetUsersForChat(chatId, userId) {
  if (userId) return [userId];
  return [...usersByChat.get(chatId) ?? []];
}
function isChatMessage(value) {
  return isRecord2(value) && typeof value.id === "string" && typeof value.chat_id === "string" && typeof value.index_in_chat === "number" && typeof value.is_user === "boolean" && typeof value.content === "string";
}
function messageFromEventPayload(payload) {
  if (isChatMessage(payload)) return payload;
  if (isRecord2(payload) && isChatMessage(payload.message)) return payload.message;
  return null;
}
async function scheduleAutoForMessage(input) {
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
    generationType: input.generationType
  });
  const decision = shouldScheduleAutoTracker({
    settings,
    role: messageRole(sourceMessage),
    messageCount: messages.length,
    chatId: input.chatId,
    activeChatId: activeChatByUser.get(input.userId) ?? null,
    trackerGenerationRunning: activeJobs.has(input.chatId)
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
    void runPendingAuto(key).catch((error) => {
      spindle.log.warn(`LTracker auto job failed: ${errorMessage(error)}`);
    });
  }, settings.auto.autoDebounceMs);
  pendingAutoJobs.set(key, {
    timer,
    chatId: input.chatId,
    userId: input.userId,
    requestId,
    trigger,
    scheduledAt
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
    lastAutoGenerationId: input.generationId
  };
  await tryPersistDiagnostics(diagnostics, input.userId);
  await sendState(input.chatId, input.userId, diagnostics.status, null, requestId);
}
async function runPendingAuto(key) {
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
      pending.scheduledAt
    );
    return;
  }
  if (activeJobs.has(pending.chatId)) {
    await markAutoSkipped(
      pending.chatId,
      pending.userId,
      pending.trigger,
      "A tracker generation is already running for this chat.",
      pending.scheduledAt
    );
    return;
  }
  await generateTracker(pending.chatId, pending.userId, pending.trigger);
}
async function handleGenerationEnded(payload, userId) {
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
      const trigger = {
        kind: "auto",
        requestId: `auto:GENERATION_ENDED:${payload.messageId}:${Date.now()}`,
        eventType: "GENERATION_ENDED",
        sourceMessageId: payload.messageId,
        sourceMessageIndex: null,
        generationId: payload.generationId,
        generationType: payload.generationType ?? null
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
        generationType: payload.generationType ?? null
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
      generationType: payload.generationType ?? null
    });
  }
}
async function handleMessageSent(payload, userId) {
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
      generationType: null
    });
  }
}
function handleChatSwitched(payload, userId) {
  if (!userId || !isRecord2(payload)) return;
  const chatId = typeof payload.chatId === "string" ? payload.chatId : null;
  rememberActiveChat(userId, chatId);
}
async function generateTracker(chatId, userId, trigger) {
  let stage = "active_chat";
  const requestId = trigger.requestId;
  const resolvedChatId = await resolveActiveChatId(chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const settings = await getSettings(userId).catch((error) => {
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
      nowIso()
    );
    return;
  }
  const existing = activeJobs.get(resolvedChatId);
  const lastCancellation = existing ? {
    jobId: existing.jobId,
    requestId: existing.requestId,
    reason: "Cancelled by a newer Generate Tracker request.",
    createdAt: nowIso()
  } : null;
  existing?.controller.abort();
  const job = {
    controller: new AbortController(),
    jobId: newJobId(),
    requestId,
    sourceKind: trigger.kind
  };
  activeJobs.set(resolvedChatId, job);
  const startedAtMs = Date.now();
  let diagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    status: "generating",
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
    lastAutoTriggeredAt: trigger.kind === "auto" ? new Date(startedAtMs).toISOString() : null
  };
  if (trigger.kind === "auto") {
    diagnostics = {
      ...diagnostics,
      lastAutoEventType: trigger.eventType,
      lastAutoSkippedReason: null,
      lastAutoSourceMessageId: trigger.sourceMessageId,
      lastAutoSourceMessageIndex: trigger.sourceMessageIndex,
      lastAutoGenerationId: trigger.generationId
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
      lastSourceMessageRange: sourceRange(sourceMessageIds)
    };
    stage = "prompt";
    const transcript = buildCompactTranscript(transcriptMessages, settings.maxMessageChars);
    const promptMessages = buildTrackerPrompt(transcript);
    diagnostics = {
      ...diagnostics,
      lastPromptPreview: settings.savePromptPreview ? promptPreview(promptMessages) : "[Prompt preview saving disabled]"
    };
    await tryPersistDiagnostics(diagnostics, userId);
    stage = "generation";
    const rawOutput = await runTrackerGeneration(promptMessages, userId, settings, job.controller.signal);
    if (!isCurrentJob(resolvedChatId, job.jobId)) return;
    diagnostics = {
      ...diagnostics,
      lastRawOutput: settings.saveRawOutput ? rawOutput : "[Raw output saving disabled]"
    };
    stage = "parse";
    const data = parseTrackerJson(rawOutput);
    if (!isCurrentJob(resolvedChatId, job.jobId)) return;
    if (trigger.kind === "auto" && settings.auto.onlyWhenChatActive && activeChatByUser.get(userId) !== resolvedChatId) {
      const completedAtMs2 = Date.now();
      diagnostics = {
        ...diagnostics,
        status: "idle",
        lastGenerationCompletedAt: new Date(completedAtMs2).toISOString(),
        lastGenerationDurationMs: completedAtMs2 - startedAtMs,
        lastAutoSkippedReason: "Chat changed before the auto tracker result was saved.",
        lastError: null
      };
      await persistDiagnostics(diagnostics, userId);
      await sendState(resolvedChatId, userId, "idle", null, requestId);
      return;
    }
    const completedAtMs = Date.now();
    const completedAt = new Date(completedAtMs).toISOString();
    const snapshot = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      extensionVersion: EXTENSION_VERSION,
      chatId: resolvedChatId,
      createdAt: completedAt,
      messageCount: transcriptMessages.length,
      sourceMessageIds,
      data
    };
    stage = "storage";
    await saveSnapshot(snapshot, userId);
    diagnostics = {
      ...diagnostics,
      status: "idle",
      lastGenerationCompletedAt: completedAt,
      lastGenerationDurationMs: completedAtMs - startedAtMs,
      lastParsedTracker: data,
      lastError: null
    };
    if (trigger.kind === "auto" && settings.auto.attachSnapshotToMessage) {
      const attachedAt = nowIso();
      const storageKey = messageSnapshotPath(resolvedChatId, trigger.sourceMessageId);
      const attachedSnapshot = {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        extensionVersion: EXTENSION_VERSION,
        chatId: resolvedChatId,
        messageId: trigger.sourceMessageId,
        messageIndex: trigger.sourceMessageIndex,
        trigger,
        snapshot,
        attachedAt
      };
      await saveMessageAttachedSnapshot(attachedSnapshot, userId);
      diagnostics = {
        ...diagnostics,
        latestAttachedMessageId: trigger.sourceMessageId,
        latestAttachedMessageIndex: trigger.sourceMessageIndex,
        latestAttachedSnapshotAt: attachedAt,
        latestAttachedSnapshotStorageKey: storageKey
      };
    }
    await persistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId);
  } catch (error) {
    if (!isCurrentJob(resolvedChatId, job.jobId)) return;
    if (trigger.kind === "auto" && job.controller.signal.aborted && job.cancelReason) {
      const completedAtMs2 = Date.now();
      diagnostics = {
        ...diagnostics,
        status: "idle",
        lastGenerationCompletedAt: new Date(completedAtMs2).toISOString(),
        lastGenerationDurationMs: completedAtMs2 - startedAtMs,
        lastCancellation: {
          jobId: job.jobId,
          requestId,
          reason: job.cancelReason,
          createdAt: nowIso()
        },
        lastAutoSkippedReason: job.cancelReason,
        lastError: null
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
      lastError: currentError
    };
    await tryPersistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "error", currentError, requestId);
  } finally {
    if (isCurrentJob(resolvedChatId, job.jobId)) activeJobs.delete(resolvedChatId);
  }
}
async function clearSnapshot(chatId, userId, requestId) {
  const resolvedChatId = await resolveActiveChatId(chatId, userId).catch((error) => {
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
      status: "idle",
      lastParsedTracker: null,
      lastError: null
    };
    await persistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId);
  } catch (error) {
    stageError("storage", error);
  }
}
async function handleSettingsSave(payload, userId) {
  const settings = await saveSettings(payload.settings, userId).catch((error) => {
    stageError("storage", error);
  });
  const resolvedChatId = payload.chatId ? payload.chatId : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  if (!settings.auto.autoModeEnabled && resolvedChatId) {
    cancelPendingAutoForChat(resolvedChatId, userId, "Auto mode was disabled.");
    abortAutoJobForChat(resolvedChatId, "Auto mode was disabled before the tracker result was saved.");
  }
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function handleSettingsReset(payload, userId) {
  await resetSettings(userId).catch((error) => {
    stageError("storage", error);
  });
  const resolvedChatId = payload.chatId ? payload.chatId : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  if (resolvedChatId) {
    cancelPendingAutoForChat(resolvedChatId, userId, "Settings were reset.");
    abortAutoJobForChat(resolvedChatId, "Settings were reset before the auto tracker result was saved.");
  }
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function handleRefresh(payload, userId) {
  const resolvedChatId = payload.chatId ? payload.chatId : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  await sendState(resolvedChatId, userId, void 0, null);
}
function disposeBackend() {
  if (disposed) return;
  disposed = true;
  for (const pending of pendingAutoJobs.values()) clearTimeout(pending.timer);
  pendingAutoJobs.clear();
  for (const job of activeJobs.values()) job.controller.abort();
  activeJobs.clear();
  for (const cleanup of eventCleanups.splice(0).reverse()) cleanup();
  autoSubscriptionsActive = false;
}
function registerEventListeners() {
  eventCleanups.push(spindle.on("GENERATION_ENDED", (payload, userId) => {
    void handleGenerationEnded(payload, userId).catch((error) => {
      spindle.log.warn(`LTracker generation-ended handler failed: ${errorMessage(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("MESSAGE_SENT", (payload, userId) => {
    void handleMessageSent(payload, userId).catch((error) => {
      spindle.log.warn(`LTracker message-sent handler failed: ${errorMessage(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("CHAT_SWITCHED", handleChatSwitched));
  eventCleanups.push(spindle.on("EXTENSION_UNLOADED", disposeBackend));
  autoSubscriptionsActive = true;
}
registerEventListeners();
spindle.onFrontendMessage((payload, userId) => {
  if (!isFrontendMessage(payload)) return;
  const requestId = "requestId" in payload ? payload.requestId : void 0;
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
      await handleRefresh(payload, userId);
    } catch (error) {
      const currentError = diagnosticError(error, "unknown");
      spindle.log.warn(`LTracker request failed: ${currentError.message}`);
      const state = await buildState(chatId, userId, "error", currentError);
      const response = {
        type: "error",
        message: currentError.message,
        state
      };
      if (requestId) response.requestId = requestId;
      send(response, userId);
    }
  })();
});
spindle.log.info("LTracker backend loaded.");
