import type {
  ChatMessageDTO,
  ConnectionProfileDTO,
  GenerationEndedPayloadDTO,
  GenerationStartedPayloadDTO,
  GenerationRequestDTO,
  InterceptorResultDTO,
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
import {
  CONTEXT_HANDLER_DISABLED_REASON,
  CONTEXT_HANDLER_EXPERIMENTAL_ENABLED,
  runContextHandlerFailSafe,
} from "./shared/contextHandlerRuntime";
import {
  findLTrackerTags,
  removeLTrackerTag,
  upsertLTrackerTag,
} from "./shared/embeddedTrackerTag";
import {
  formatTemplateTextFallback,
  renderHtmlTemplate,
} from "./shared/htmlTemplateRenderer";
import {
  buildMessageTrackerHistory,
  groupMessageTrackerHistory,
  MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON,
  MESSAGE_NATIVE_TOOLBAR_SUPPORTED,
  MESSAGE_LOCAL_UI_FALLBACK_REASON,
  MESSAGE_LOCAL_UI_SUPPORTED,
  MESSAGE_WIDGET_PLACEMENT_REASON,
  renderMessageTracker,
} from "./shared/messageDisplay";
import {
  effectivePerMessageChars,
  effectivePromptInjectionChars,
  effectivePromptPreviewChars,
  effectiveRecentTranscriptChars,
  effectiveTrackerMemoryChars,
  estimateTokensFromChars,
} from "./shared/budget";
import {
  evaluateStableSwipeContent,
  shouldCancelPendingSwipe,
  stableContentHash,
  type AutoFinalizationSnapshot,
} from "./shared/autoTiming";
import {
  normalizeMessageAttachedSnapshotPresetMetadata,
  normalizeTrackerSnapshotPresetMetadata,
  repairMessageSnapshotIndex,
  removeMessageSnapshotIndexEntry,
  upsertMessageSnapshotIndexEntry,
} from "./shared/messageSnapshotIndex";
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
  applyPromptInjection,
  formatTrackerInjectionBlock,
  type PromptInjectionMessage,
} from "./shared/promptInjection";
import {
  activePresetPath,
  diagnosticsPath,
  legacyMessageSnapshotPath,
  messageSnapshotIndexPath,
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
  buildTrackerMemoryResult,
  memoryOptionsFromTrigger,
  trackerMemorySourceSummary,
  type TrackerMemoryEntry,
  type TrackerMemoryResult,
} from "./shared/trackerMemory";
import {
  buildTrackerGenerationRequest,
  TRACKER_CONNECTION_DEFAULT_TEST_PROMPT,
  type TrackerGenerationRequestBuildResult,
} from "./shared/generationRequest";
import {
  DEFAULT_SWIPE_KEY,
  defaultSwipeIdentity,
  deriveSwipeTrackerIdentity,
  hashSwipeContent,
  swipeIdentityKey,
} from "./shared/swipeIdentity";
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
  type LTrackerConnectionProfileSummary,
  type LTrackerConnectionTestStatus,
  type LTrackerDiagnostics,
  type LTrackerError,
  type LTrackerErrorStage,
  type LTrackerInjectionFormat,
  type LTrackerInjectionMode,
  type LTrackerMessageDisplayMode,
  type LTrackerMessageDisplayPlacement,
  type LTrackerMessageWidgetPlacementResolved,
  type LTrackerRenderSource,
  type LTrackerRenderStatus,
  type LTrackerSettings,
  type MessageAttachedSnapshot,
  type MessageSnapshotIndexEntry,
  type MessageTrackerHistoryEntry,
  type PermissionState,
  type RenderedTrackerPreview,
  type SwipeTrackerIdentity,
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
  chatId: string;
  jobKey: string;
  jobId: string;
  requestId: string;
  sourceKind: TrackerGenerationSourceKind;
  startedAt: string;
  sourceMessageId?: string;
  sourceMessageIndex?: number | null;
  swipeKey?: string;
  swipeIndex?: number | null;
  swipeId?: string | null;
  swipeContentHash?: string | null;
  swipeKeySource?: string | null;
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

interface PendingAutoFinalizationJob {
  timer: ReturnType<typeof setTimeout>;
  chatId: string;
  userId: string;
  requestId: string;
  trigger: AutoTrackerTriggerSource;
  scheduledAt: string;
  eventAt: string;
  state: "waiting_for_message_finalization" | "settling_after_finalization" | "stable_check";
  messageId: string;
  swipeKey: string;
  initialContentHash: string | null;
}

interface ConnectionProfileCache {
  profiles: LTrackerConnectionProfileSummary[];
  refreshedAt: string | null;
  error: string | null;
}

interface ConnectionTestJob {
  controller: AbortController;
  requestId: string;
  startedAtMs: number;
}

interface TrackerGenerationResult {
  text: string;
  response: unknown;
  requestDiagnostics: TrackerGenerationRequestBuildResult;
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
const pendingAutoFinalizations = new Map<string, PendingAutoFinalizationJob>();
const connectionProfilesByUser = new Map<string, ConnectionProfileCache>();
const connectionTestJobs = new Map<string, ConnectionTestJob>();
const activeChatByUser = new Map<string, string | null>();
const usersByChat = new Map<string, Set<string>>();
const eventCleanups: Array<() => void> = [];
let autoSubscriptionsActive = false;
let contextHandlerRegistered = false;
let interceptorRegistered = false;
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
    "refresh_connections",
    "generate_tracker",
    "test_tracker_connection",
    "cancel_connection_test",
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
    "render_template",
    "generate_message_tracker",
    "regenerate_message_tracker",
    "cancel_tracker_generation",
    "delete_message_tracker",
    "save_edited_message_tracker",
    "cleanup_duplicate_history",
    "embedded_tracker_tag_intercepted",
  ].includes(payload.type)) return false;
  if ("chatId" in payload && payload.chatId !== null && typeof payload.chatId !== "string") return false;
  if (
    [
      "generate_tracker",
      "refresh_connections",
      "test_tracker_connection",
      "cancel_connection_test",
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
      "render_template",
      "generate_message_tracker",
      "regenerate_message_tracker",
      "cancel_tracker_generation",
      "delete_message_tracker",
      "save_edited_message_tracker",
      "cleanup_duplicate_history",
      "embedded_tracker_tag_intercepted",
    ].includes(payload.type)
    && typeof payload.requestId !== "string"
  ) return false;
  if (payload.type === "save_settings" && !isRecord(payload.settings)) return false;
  if (payload.type === "test_tracker_connection" && "settings" in payload && payload.settings !== undefined && !isRecord(payload.settings)) return false;
  if (["save_preset_as_new", "duplicate_preset", "update_preset", "validate_preset"].includes(payload.type) && !isRecord(payload.preset)) return false;
  if (["select_preset", "update_preset", "delete_preset"].includes(payload.type) && typeof payload.presetId !== "string") return false;
  if (payload.type === "import_preset" && typeof payload.importText !== "string") return false;
  if (
    payload.type === "regenerate_message_tracker"
    && (typeof payload.messageId !== "string" || ("swipeKey" in payload && payload.swipeKey !== null && payload.swipeKey !== undefined && typeof payload.swipeKey !== "string"))
  ) return false;
  if (
    payload.type === "generate_message_tracker"
    && (typeof payload.messageId !== "string" || ("swipeKey" in payload && payload.swipeKey !== null && payload.swipeKey !== undefined && typeof payload.swipeKey !== "string"))
  ) return false;
  if (
    payload.type === "cancel_tracker_generation"
    && ("jobId" in payload && payload.jobId !== null && payload.jobId !== undefined && typeof payload.jobId !== "string")
  ) return false;
  if (
    payload.type === "cancel_tracker_generation"
    && ("messageId" in payload && payload.messageId !== null && payload.messageId !== undefined && typeof payload.messageId !== "string")
  ) return false;
  if (
    payload.type === "cancel_tracker_generation"
    && ("swipeKey" in payload && payload.swipeKey !== null && payload.swipeKey !== undefined && typeof payload.swipeKey !== "string")
  ) return false;
  if (payload.type === "delete_message_tracker" && (typeof payload.messageId !== "string" || typeof payload.swipeKey !== "string")) return false;
  if (
    payload.type === "save_edited_message_tracker"
    && (typeof payload.messageId !== "string" || typeof payload.swipeKey !== "string" || typeof payload.jsonText !== "string")
  ) return false;
  if (
    payload.type === "embedded_tracker_tag_intercepted"
    && (
      ("messageId" in payload && payload.messageId !== null && typeof payload.messageId !== "string")
      || ("swipeKey" in payload && payload.swipeKey !== null && typeof payload.swipeKey !== "string")
      || typeof payload.jsonText !== "string"
    )
  ) return false;
  if (
    payload.type === "render_template"
    && "source" in payload
    && payload.source !== undefined
    && payload.source !== "latest_chat_snapshot"
    && payload.source !== "latest_message_snapshot"
  ) return false;
  return true;
}

function permissionState(): PermissionState {
  return {
    generation: spindle.permissions.has("generation"),
    chats: spindle.permissions.has("chats"),
    chatMutation: spindle.permissions.has("chat_mutation"),
    contextHandler: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED && spindle.permissions.has("context_handler"),
    interceptor: spindle.permissions.has("interceptor"),
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
    lastAutoFinalizationState: null,
    lastAutoWaitingMessageId: null,
    lastAutoWaitingSwipeKey: null,
    lastAutoFinalizedAt: null,
    lastAutoStableCheckAt: null,
    lastAutoStableCheckPassed: null,
    lastAutoContentStableHash: null,
    lastAutoFinalizationSkippedReason: null,
    pendingAutoFinalizationCount: 0,
    lastSwipeChangeCancelledPendingJob: false,
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
    lastMemoryEntryCount: 0,
    lastMemoryChars: 0,
    lastMemoryTruncated: false,
    lastMemorySourceSummary: null,
    lastMemorySkippedReason: null,
    lastPromptIncludedMemory: false,
    interceptorRegistered,
    lastInterceptorAt: null,
    lastInterceptorInjectedCount: 0,
    lastInterceptorInjectedChars: 0,
    lastInterceptorStrippedCount: 0,
    lastInterceptorSkippedReason: null,
    lastInterceptorError: null,
    lastInterceptorPromptTrackerCountBefore: 0,
    lastInterceptorPromptTrackerCountAfter: 0,
    selectedPresetId: null,
    selectedPresetName: null,
    lastPresetFallbackReason: null,
    lastPresetValidationError: null,
    lastPromptUsedPresetId: null,
    lastPromptUsedPresetName: null,
    lastRenderAt: null,
    lastRenderPresetId: null,
    lastRenderPresetName: null,
    lastRenderSnapshotCreatedAt: null,
    lastRenderSource: null,
    lastRenderStatus: null,
    lastRenderWarnings: [],
    lastRenderErrors: [],
    lastSanitizedHtmlChars: 0,
    lastFallbackTextChars: 0,
    contextHandlerRegistered,
    contextHandlerDisabledReason: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED ? null : CONTEXT_HANDLER_DISABLED_REASON,
    lastContextHandlerError: null,
    messageDisplayEnabled: false,
    messageDisplayMode: null,
    messageDisplayPlacement: null,
    messageDisplayHydratedCount: 0,
    lastMessageDisplayHydratedAt: null,
    lastMessageDisplayError: null,
    messageLocalUiSupported: MESSAGE_LOCAL_UI_SUPPORTED,
    messageLocalUiFallbackReason: MESSAGE_LOCAL_UI_FALLBACK_REASON,
    messageSnapshotIndexCount: 0,
    lastWidgetRegenerateMessageId: null,
    lastWidgetRegenerateStartedAt: null,
    lastWidgetRegenerateCompletedAt: null,
    lastWidgetRegenerateDurationMs: null,
    lastWidgetRegenerateCancelledAt: null,
    lastWidgetRegenerateError: null,
    activeWidgetRegenerationCount: 0,
    messageWidgetPlacementResolved: "host_default",
    messageWidgetPlacementReason: MESSAGE_WIDGET_PLACEMENT_REASON,
    messageDisplayRenderer: "drawer_history",
    lastDomInjectionAt: null,
    lastDomInjectionError: null,
    lastUninjectAt: null,
    lastDeletedTrackerMessageId: null,
    lastDeletedTrackerSwipeKey: null,
    lastEditedTrackerMessageId: null,
    lastEditedTrackerSwipeKey: null,
    lastSwipeDetectedMessageId: null,
    lastSwipeKey: null,
    lastSwipeKeySource: null,
    swipeTrackerIndexCount: 0,
    activeTrackerJobs: [],
    lastPlacementRequested: null,
    lastPlacementResolved: null,
    lastPlacementRenderAttemptAt: null,
    lastPlacementRenderResult: null,
    lastPlacementError: null,
    lastMountPointStrategy: null,
    lastEmbeddedTagWriteAt: null,
    lastEmbeddedTagWriteMessageId: null,
    lastEmbeddedTagWriteSwipeKey: null,
    lastEmbeddedTagError: null,
    lastTagInterceptAt: null,
    lastTagInterceptMessageId: null,
    lastTagInterceptSwipeKey: null,
    lastTagInterceptError: null,
    lastMessageControlRenderAt: null,
    lastMessageControlMessageId: null,
    lastMessageControlSwipeKey: null,
    lastMessageControlState: null,
    lastGenerateButtonMessageId: null,
    lastGenerateButtonClickedAt: null,
    lastInlineActionClicked: null,
    lastInlineActionAt: null,
    lastInlineActionError: null,
    nativeToolbarSupported: MESSAGE_NATIVE_TOOLBAR_SUPPORTED,
    nativeToolbarFallbackReason: MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON,
    connectionMode: DEFAULT_SETTINGS.connection.mode,
    selectedConnectionId: DEFAULT_SETTINGS.connection.selectedConnectionId,
    selectedConnectionName: DEFAULT_SETTINGS.connection.selectedConnectionName,
    selectedConnectionAvailable: false,
    connectionListCount: 0,
    lastConnectionRefreshAt: null,
    lastConnectionRefreshError: null,
    lastGenerationConnectionModeUsed: null,
    lastGenerationConnectionIdUsed: null,
    lastGenerationConnectionNameUsed: null,
    lastGenerationConnectionFallbackReason: null,
    lastGenerationParametersUsed: null,
    lastReasoningOverrideUsed: null,
    lastConnectionTestAt: null,
    lastConnectionTestStatus: "idle",
    lastConnectionTestDurationMs: null,
    lastConnectionTestError: null,
    lastConnectionTestOutputPreview: null,
    lastConnectionTestFinishReason: null,
    lastConnectionTestUsage: null,
    drawerActiveSection: null,
    lastDrawerRefreshAt: null,
    lastHistoryGroupedCount: 0,
    lastHistoryDuplicateCount: 0,
    lastHistoryCleanupAt: null,
    expandedWidthModeResolved: null,
    lastExpandedTrackerWidthPx: null,
    templateTrustMode: DEFAULT_SETTINGS.renderer.templateTrustMode,
    ultraModeEnabled: DEFAULT_SETTINGS.budget.ultraModeEnabled,
    estimatedPromptTokensLastRun: null,
    estimatedMemoryTokensLastRun: null,
    iframeFallbackVisibleInMainUi: false,
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
  return value === "manual" || value === "auto" || value === "widget" ? value : null;
}

function autoEventTypeOrNull(value: unknown): AutoTriggerEventType | null {
  return value === "GENERATION_ENDED" || value === "MESSAGE_SENT" ? value : null;
}

function injectionModeOrNull(value: unknown): LTrackerInjectionMode | null {
  return value === "latest_chat_snapshot" || value === "latest_message_snapshot" ? value : null;
}

function injectionFormatOrNull(value: unknown): LTrackerInjectionFormat | null {
  return value === "embedded_tag" || value === "compact_text" || value === "pretty_json" || value === "minimal" ? value : null;
}

function renderSourceOrNull(value: unknown): LTrackerRenderSource | null {
  return value === "latest_chat_snapshot" || value === "latest_message_snapshot" ? value : null;
}

function renderStatusOrNull(value: unknown): LTrackerRenderStatus | null {
  return value === "rendered"
    || value === "fallback"
    || value === "no_template"
    || value === "no_snapshot"
    || value === "error"
    ? value
    : null;
}

function messageDisplayModeOrNull(value: unknown): LTrackerMessageDisplayMode | null {
  return value === "dom_injection" || value === "message_widget" || value === "drawer_history" || value === "disabled" ? value : null;
}

function messageDisplayPlacementOrNull(value: unknown): LTrackerMessageDisplayPlacement | null {
  return value === "top" || value === "bottom" ? value : null;
}

function messageWidgetPlacementResolved(value: unknown): LTrackerMessageWidgetPlacementResolved {
  return value === "top" || value === "bottom" || value === "host_default" || value === "unsupported"
    ? value
    : MESSAGE_LOCAL_UI_SUPPORTED ? "host_default" : "unsupported";
}

function messageDisplayRenderer(value: unknown): LTrackerDiagnostics["messageDisplayRenderer"] {
  return value === "dom_injection" || value === "iframe_widget" || value === "drawer_history"
    ? value
    : "drawer_history";
}

function mountPointStrategy(value: unknown): LTrackerDiagnostics["lastMountPointStrategy"] {
  return value === "official_message_body"
    || value === "official_message_element"
    || value === "bubble_adapter"
    || value === "widget_fallback"
    || value === "drawer_only"
    ? value
    : null;
}

function inlineActionOrNull(value: unknown): LTrackerDiagnostics["lastInlineActionClicked"] {
  return value === "generate"
    || value === "regenerate"
    || value === "cancel"
    || value === "edit"
    || value === "delete"
    || value === "toggle"
    ? value
    : null;
}

function connectionTestStatus(value: unknown): LTrackerConnectionTestStatus {
  return value === "idle"
    || value === "running"
    || value === "success"
    || value === "error"
    || value === "cancelled"
    ? value
    : "idle";
}

function activeTrackerJobsOrEmpty(value: unknown): LTrackerDiagnostics["activeTrackerJobs"] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is LTrackerDiagnostics["activeTrackerJobs"][number] => {
    return isRecord(item)
      && typeof item.jobId === "string"
      && typeof item.messageId === "string"
      && typeof item.swipeKey === "string"
      && typeof item.startedAt === "string";
  });
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
    lastAutoFinalizationState: stringOrNull(value.lastAutoFinalizationState),
    lastAutoWaitingMessageId: stringOrNull(value.lastAutoWaitingMessageId),
    lastAutoWaitingSwipeKey: stringOrNull(value.lastAutoWaitingSwipeKey),
    lastAutoFinalizedAt: stringOrNull(value.lastAutoFinalizedAt),
    lastAutoStableCheckAt: stringOrNull(value.lastAutoStableCheckAt),
    lastAutoStableCheckPassed: typeof value.lastAutoStableCheckPassed === "boolean" ? value.lastAutoStableCheckPassed : null,
    lastAutoContentStableHash: stringOrNull(value.lastAutoContentStableHash),
    lastAutoFinalizationSkippedReason: stringOrNull(value.lastAutoFinalizationSkippedReason),
    pendingAutoFinalizationCount: typeof value.pendingAutoFinalizationCount === "number" && Number.isFinite(value.pendingAutoFinalizationCount)
      ? Math.max(0, Math.round(value.pendingAutoFinalizationCount))
      : 0,
    lastSwipeChangeCancelledPendingJob: typeof value.lastSwipeChangeCancelledPendingJob === "boolean" ? value.lastSwipeChangeCancelledPendingJob : false,
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
    lastMemoryEntryCount: typeof value.lastMemoryEntryCount === "number" && Number.isFinite(value.lastMemoryEntryCount)
      ? Math.max(0, Math.round(value.lastMemoryEntryCount))
      : 0,
    lastMemoryChars: typeof value.lastMemoryChars === "number" && Number.isFinite(value.lastMemoryChars)
      ? Math.max(0, Math.round(value.lastMemoryChars))
      : 0,
    lastMemoryTruncated: typeof value.lastMemoryTruncated === "boolean" ? value.lastMemoryTruncated : false,
    lastMemorySourceSummary: stringOrNull(value.lastMemorySourceSummary),
    lastMemorySkippedReason: stringOrNull(value.lastMemorySkippedReason),
    lastPromptIncludedMemory: typeof value.lastPromptIncludedMemory === "boolean" ? value.lastPromptIncludedMemory : false,
    interceptorRegistered,
    lastInterceptorAt: stringOrNull(value.lastInterceptorAt),
    lastInterceptorInjectedCount: typeof value.lastInterceptorInjectedCount === "number" && Number.isFinite(value.lastInterceptorInjectedCount)
      ? Math.max(0, Math.round(value.lastInterceptorInjectedCount))
      : 0,
    lastInterceptorInjectedChars: typeof value.lastInterceptorInjectedChars === "number" && Number.isFinite(value.lastInterceptorInjectedChars)
      ? Math.max(0, Math.round(value.lastInterceptorInjectedChars))
      : 0,
    lastInterceptorStrippedCount: typeof value.lastInterceptorStrippedCount === "number" && Number.isFinite(value.lastInterceptorStrippedCount)
      ? Math.max(0, Math.round(value.lastInterceptorStrippedCount))
      : 0,
    lastInterceptorSkippedReason: stringOrNull(value.lastInterceptorSkippedReason),
    lastInterceptorError: stringOrNull(value.lastInterceptorError),
    lastInterceptorPromptTrackerCountBefore: typeof value.lastInterceptorPromptTrackerCountBefore === "number" && Number.isFinite(value.lastInterceptorPromptTrackerCountBefore)
      ? Math.max(0, Math.round(value.lastInterceptorPromptTrackerCountBefore))
      : 0,
    lastInterceptorPromptTrackerCountAfter: typeof value.lastInterceptorPromptTrackerCountAfter === "number" && Number.isFinite(value.lastInterceptorPromptTrackerCountAfter)
      ? Math.max(0, Math.round(value.lastInterceptorPromptTrackerCountAfter))
      : 0,
    selectedPresetId: stringOrNull(value.selectedPresetId),
    selectedPresetName: stringOrNull(value.selectedPresetName),
    lastPresetFallbackReason: stringOrNull(value.lastPresetFallbackReason),
    lastPresetValidationError: stringOrNull(value.lastPresetValidationError),
    lastPromptUsedPresetId: stringOrNull(value.lastPromptUsedPresetId),
    lastPromptUsedPresetName: stringOrNull(value.lastPromptUsedPresetName),
    lastRenderAt: stringOrNull(value.lastRenderAt),
    lastRenderPresetId: stringOrNull(value.lastRenderPresetId),
    lastRenderPresetName: stringOrNull(value.lastRenderPresetName),
    lastRenderSnapshotCreatedAt: stringOrNull(value.lastRenderSnapshotCreatedAt),
    lastRenderSource: renderSourceOrNull(value.lastRenderSource),
    lastRenderStatus: renderStatusOrNull(value.lastRenderStatus),
    lastRenderWarnings: stringArray(value.lastRenderWarnings),
    lastRenderErrors: stringArray(value.lastRenderErrors),
    lastSanitizedHtmlChars: typeof value.lastSanitizedHtmlChars === "number" && Number.isFinite(value.lastSanitizedHtmlChars)
      ? Math.max(0, Math.round(value.lastSanitizedHtmlChars))
      : 0,
    lastFallbackTextChars: typeof value.lastFallbackTextChars === "number" && Number.isFinite(value.lastFallbackTextChars)
      ? Math.max(0, Math.round(value.lastFallbackTextChars))
      : 0,
    contextHandlerRegistered,
    contextHandlerDisabledReason: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED
      ? stringOrNull(value.contextHandlerDisabledReason)
      : CONTEXT_HANDLER_DISABLED_REASON,
    lastContextHandlerError: stringOrNull(value.lastContextHandlerError),
    messageDisplayEnabled: typeof value.messageDisplayEnabled === "boolean" ? value.messageDisplayEnabled : base.messageDisplayEnabled,
    messageDisplayMode: messageDisplayModeOrNull(value.messageDisplayMode),
    messageDisplayPlacement: messageDisplayPlacementOrNull(value.messageDisplayPlacement),
    messageDisplayHydratedCount: typeof value.messageDisplayHydratedCount === "number" && Number.isFinite(value.messageDisplayHydratedCount)
      ? Math.max(0, Math.round(value.messageDisplayHydratedCount))
      : 0,
    lastMessageDisplayHydratedAt: stringOrNull(value.lastMessageDisplayHydratedAt),
    lastMessageDisplayError: stringOrNull(value.lastMessageDisplayError),
    messageLocalUiSupported: typeof value.messageLocalUiSupported === "boolean"
      ? value.messageLocalUiSupported
      : MESSAGE_LOCAL_UI_SUPPORTED,
    messageLocalUiFallbackReason: stringOrNull(value.messageLocalUiFallbackReason) ?? MESSAGE_LOCAL_UI_FALLBACK_REASON,
    messageSnapshotIndexCount: typeof value.messageSnapshotIndexCount === "number" && Number.isFinite(value.messageSnapshotIndexCount)
      ? Math.max(0, Math.round(value.messageSnapshotIndexCount))
      : 0,
    lastWidgetRegenerateMessageId: stringOrNull(value.lastWidgetRegenerateMessageId),
    lastWidgetRegenerateStartedAt: stringOrNull(value.lastWidgetRegenerateStartedAt),
    lastWidgetRegenerateCompletedAt: stringOrNull(value.lastWidgetRegenerateCompletedAt),
    lastWidgetRegenerateDurationMs: numberOrNull(value.lastWidgetRegenerateDurationMs),
    lastWidgetRegenerateCancelledAt: stringOrNull(value.lastWidgetRegenerateCancelledAt),
    lastWidgetRegenerateError: stringOrNull(value.lastWidgetRegenerateError),
    activeWidgetRegenerationCount: typeof value.activeWidgetRegenerationCount === "number" && Number.isFinite(value.activeWidgetRegenerationCount)
      ? Math.max(0, Math.round(value.activeWidgetRegenerationCount))
      : 0,
    messageWidgetPlacementResolved: messageWidgetPlacementResolved(value.messageWidgetPlacementResolved),
    messageWidgetPlacementReason: stringOrNull(value.messageWidgetPlacementReason) ?? MESSAGE_WIDGET_PLACEMENT_REASON,
    messageDisplayRenderer: messageDisplayRenderer(value.messageDisplayRenderer),
    lastDomInjectionAt: stringOrNull(value.lastDomInjectionAt),
    lastDomInjectionError: stringOrNull(value.lastDomInjectionError),
    lastUninjectAt: stringOrNull(value.lastUninjectAt),
    lastDeletedTrackerMessageId: stringOrNull(value.lastDeletedTrackerMessageId),
    lastDeletedTrackerSwipeKey: stringOrNull(value.lastDeletedTrackerSwipeKey),
    lastEditedTrackerMessageId: stringOrNull(value.lastEditedTrackerMessageId),
    lastEditedTrackerSwipeKey: stringOrNull(value.lastEditedTrackerSwipeKey),
    lastSwipeDetectedMessageId: stringOrNull(value.lastSwipeDetectedMessageId),
    lastSwipeKey: stringOrNull(value.lastSwipeKey),
    lastSwipeKeySource: stringOrNull(value.lastSwipeKeySource),
    swipeTrackerIndexCount: typeof value.swipeTrackerIndexCount === "number" && Number.isFinite(value.swipeTrackerIndexCount)
      ? Math.max(0, Math.round(value.swipeTrackerIndexCount))
      : 0,
    activeTrackerJobs: activeTrackerJobsOrEmpty(value.activeTrackerJobs),
    lastPlacementRequested: messageDisplayPlacementOrNull(value.lastPlacementRequested),
    lastPlacementResolved: messageDisplayPlacementOrNull(value.lastPlacementResolved),
    lastPlacementRenderAttemptAt: stringOrNull(value.lastPlacementRenderAttemptAt),
    lastPlacementRenderResult: stringOrNull(value.lastPlacementRenderResult),
    lastPlacementError: stringOrNull(value.lastPlacementError),
    lastMountPointStrategy: mountPointStrategy(value.lastMountPointStrategy),
    lastEmbeddedTagWriteAt: stringOrNull(value.lastEmbeddedTagWriteAt),
    lastEmbeddedTagWriteMessageId: stringOrNull(value.lastEmbeddedTagWriteMessageId),
    lastEmbeddedTagWriteSwipeKey: stringOrNull(value.lastEmbeddedTagWriteSwipeKey),
    lastEmbeddedTagError: stringOrNull(value.lastEmbeddedTagError),
    lastTagInterceptAt: stringOrNull(value.lastTagInterceptAt),
    lastTagInterceptMessageId: stringOrNull(value.lastTagInterceptMessageId),
    lastTagInterceptSwipeKey: stringOrNull(value.lastTagInterceptSwipeKey),
    lastTagInterceptError: stringOrNull(value.lastTagInterceptError),
    lastMessageControlRenderAt: stringOrNull(value.lastMessageControlRenderAt),
    lastMessageControlMessageId: stringOrNull(value.lastMessageControlMessageId),
    lastMessageControlSwipeKey: stringOrNull(value.lastMessageControlSwipeKey),
    lastMessageControlState: stringOrNull(value.lastMessageControlState),
    lastGenerateButtonMessageId: stringOrNull(value.lastGenerateButtonMessageId),
    lastGenerateButtonClickedAt: stringOrNull(value.lastGenerateButtonClickedAt),
    lastInlineActionClicked: inlineActionOrNull(value.lastInlineActionClicked),
    lastInlineActionAt: stringOrNull(value.lastInlineActionAt),
    lastInlineActionError: stringOrNull(value.lastInlineActionError),
    nativeToolbarSupported: MESSAGE_NATIVE_TOOLBAR_SUPPORTED,
    nativeToolbarFallbackReason: MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON,
    connectionMode: typeof value.connectionMode === "string" ? value.connectionMode : base.connectionMode,
    selectedConnectionId: stringOrNull(value.selectedConnectionId),
    selectedConnectionName: stringOrNull(value.selectedConnectionName),
    selectedConnectionAvailable: typeof value.selectedConnectionAvailable === "boolean"
      ? value.selectedConnectionAvailable
      : base.selectedConnectionAvailable,
    connectionListCount: typeof value.connectionListCount === "number" && Number.isFinite(value.connectionListCount)
      ? Math.max(0, Math.round(value.connectionListCount))
      : 0,
    lastConnectionRefreshAt: stringOrNull(value.lastConnectionRefreshAt),
    lastConnectionRefreshError: stringOrNull(value.lastConnectionRefreshError),
    lastGenerationConnectionModeUsed: stringOrNull(value.lastGenerationConnectionModeUsed),
    lastGenerationConnectionIdUsed: stringOrNull(value.lastGenerationConnectionIdUsed),
    lastGenerationConnectionNameUsed: stringOrNull(value.lastGenerationConnectionNameUsed),
    lastGenerationConnectionFallbackReason: stringOrNull(value.lastGenerationConnectionFallbackReason),
    lastGenerationParametersUsed: recordOrNull(value.lastGenerationParametersUsed),
    lastReasoningOverrideUsed: recordOrNull(value.lastReasoningOverrideUsed),
    lastConnectionTestAt: stringOrNull(value.lastConnectionTestAt),
    lastConnectionTestStatus: connectionTestStatus(value.lastConnectionTestStatus),
    lastConnectionTestDurationMs: numberOrNull(value.lastConnectionTestDurationMs),
    lastConnectionTestError: stringOrNull(value.lastConnectionTestError),
    lastConnectionTestOutputPreview: stringOrNull(value.lastConnectionTestOutputPreview),
    lastConnectionTestFinishReason: stringOrNull(value.lastConnectionTestFinishReason),
    lastConnectionTestUsage: recordOrNull(value.lastConnectionTestUsage),
    drawerActiveSection: stringOrNull(value.drawerActiveSection),
    lastDrawerRefreshAt: stringOrNull(value.lastDrawerRefreshAt),
    lastHistoryGroupedCount: typeof value.lastHistoryGroupedCount === "number" && Number.isFinite(value.lastHistoryGroupedCount)
      ? Math.max(0, Math.round(value.lastHistoryGroupedCount))
      : 0,
    lastHistoryDuplicateCount: typeof value.lastHistoryDuplicateCount === "number" && Number.isFinite(value.lastHistoryDuplicateCount)
      ? Math.max(0, Math.round(value.lastHistoryDuplicateCount))
      : 0,
    lastHistoryCleanupAt: stringOrNull(value.lastHistoryCleanupAt),
    expandedWidthModeResolved: stringOrNull(value.expandedWidthModeResolved),
    lastExpandedTrackerWidthPx: numberOrNull(value.lastExpandedTrackerWidthPx),
    templateTrustMode: value.templateTrustMode === "safe" || value.templateTrustMode === "trusted" || value.templateTrustMode === "dev"
      ? value.templateTrustMode
      : base.templateTrustMode,
    ultraModeEnabled: typeof value.ultraModeEnabled === "boolean" ? value.ultraModeEnabled : base.ultraModeEnabled,
    estimatedPromptTokensLastRun: numberOrNull(value.estimatedPromptTokensLastRun),
    estimatedMemoryTokensLastRun: numberOrNull(value.estimatedMemoryTokensLastRun),
    iframeFallbackVisibleInMainUi: typeof value.iframeFallbackVisibleInMainUi === "boolean" ? value.iframeFallbackVisibleInMainUi : false,
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
  const snapshot = await spindle.userStorage.getJson<TrackerSnapshot | null>(snapshotPath(chatId), {
    fallback: null,
    userId,
  });
  return snapshot ? normalizeTrackerSnapshotPresetMetadata(snapshot) : null;
}

async function loadMessageSnapshot(
  chatId: string | null,
  messageId: string | null,
  userId: string,
  swipeKey = DEFAULT_SWIPE_KEY,
): Promise<MessageAttachedSnapshot | null> {
  if (!chatId || !messageId) return null;
  const snapshot = await spindle.userStorage.getJson<MessageAttachedSnapshot | null>(messageSnapshotPath(chatId, messageId, swipeKey), {
    fallback: null,
    userId,
  });
  if (snapshot) return normalizeMessageAttachedSnapshotPresetMetadata(snapshot);
  if (swipeKey !== DEFAULT_SWIPE_KEY) return null;
  const legacy = await spindle.userStorage.getJson<MessageAttachedSnapshot | null>(legacyMessageSnapshotPath(chatId, messageId), {
    fallback: null,
    userId,
  });
  return legacy ? normalizeMessageAttachedSnapshotPresetMetadata(legacy) : null;
}

async function loadMessageSnapshotIndex(chatId: string | null, userId: string): Promise<MessageSnapshotIndexEntry[]> {
  if (!chatId) return [];
  const raw = await spindle.userStorage.getJson<unknown>(messageSnapshotIndexPath(chatId), {
    fallback: [],
    userId,
  });
  const repaired = repairMessageSnapshotIndex(raw);
  if (JSON.stringify(raw) !== JSON.stringify(repaired)) {
    await spindle.userStorage.setJson(messageSnapshotIndexPath(chatId), repaired, { indent: 2, userId });
  }
  return repaired;
}

async function saveMessageSnapshotIndex(
  chatId: string,
  index: MessageSnapshotIndexEntry[],
  userId: string,
): Promise<void> {
  await spindle.userStorage.setJson(messageSnapshotIndexPath(chatId), repairMessageSnapshotIndex(index), {
    indent: 2,
    userId,
  });
}

function messageIndexFromChatMessage(message: ChatMessageDTO): number | null {
  return typeof message.index_in_chat === "number" && Number.isFinite(message.index_in_chat)
    ? Math.max(0, Math.round(message.index_in_chat))
    : null;
}

function trackerPayloadText(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, null, 2);
}

function memoryEntryFromAttachedSnapshot(
  snapshot: MessageAttachedSnapshot,
  source: TrackerMemoryEntry["source"] = "sidecar_snapshot",
): TrackerMemoryEntry {
  return {
    messageId: snapshot.messageId,
    messageIndex: snapshot.messageIndex,
    swipeKey: snapshot.swipeKey,
    presetId: snapshot.presetId ?? snapshot.snapshot.presetId,
    presetName: snapshot.presetName ?? snapshot.snapshot.presetName,
    createdAt: snapshot.snapshot.createdAt || snapshot.attachedAt,
    source,
    payload: snapshot.snapshot.data,
    text: trackerPayloadText(snapshot.snapshot.data),
  };
}

function memoryEntryFromChatSnapshot(snapshot: TrackerSnapshot): TrackerMemoryEntry {
  return {
    messageId: null,
    messageIndex: null,
    swipeKey: null,
    presetId: snapshot.presetId,
    presetName: snapshot.presetName,
    createdAt: snapshot.createdAt,
    source: "latest_chat_snapshot",
    payload: snapshot.data,
    text: trackerPayloadText(snapshot.data),
  };
}

function parseEmbeddedMemoryEntriesFromContent(
  content: string,
  message: ChatMessageDTO,
  source: TrackerMemoryEntry["source"],
): TrackerMemoryEntry[] {
  const tags = findLTrackerTags(content);
  const entries: TrackerMemoryEntry[] = [];
  for (const tag of tags) {
    try {
      const payload = parseTrackerJson(tag.content);
      entries.push({
        messageId: message.id,
        messageIndex: messageIndexFromChatMessage(message),
        swipeKey: tag.attrs.swipe || null,
        presetId: null,
        presetName: null,
        createdAt: nowIso(),
        source,
        payload,
        text: trackerPayloadText(payload),
      });
    } catch {
      // Ignore malformed embedded tags during memory collection.
    }
  }
  return entries;
}

async function embeddedMemoryEntriesFromMessages(
  chatId: string,
  settings: LTrackerSettings,
): Promise<TrackerMemoryEntry[]> {
  if (
    settings.memory.source !== "hybrid"
    && settings.memory.source !== "embedded_tags"
    && settings.memory.source !== "message_history"
  ) return [];
  const messages = await readChatMessages(chatId).catch(() => []);
  const source: TrackerMemoryEntry["source"] = settings.memory.source === "message_history"
    ? "history_scan"
    : "embedded_tag";
  const entries: TrackerMemoryEntry[] = [];
  for (const message of messages.slice(-Math.max(settings.recentMessageLimit, 24))) {
    if (typeof message.content === "string") {
      entries.push(...parseEmbeddedMemoryEntriesFromContent(message.content, message, source));
    }
    const swipes = Array.isArray(message.swipes) ? message.swipes : [];
    for (const swipeContent of swipes) {
      if (typeof swipeContent !== "string" || swipeContent === message.content) continue;
      entries.push(...parseEmbeddedMemoryEntriesFromContent(swipeContent, message, source));
    }
  }
  return entries;
}

async function sidecarMemoryEntriesFromIndex(
  chatId: string,
  userId: string,
  index: MessageSnapshotIndexEntry[],
): Promise<TrackerMemoryEntry[]> {
  const entries: TrackerMemoryEntry[] = [];
  for (const indexEntry of index) {
    const attached = await loadMessageSnapshot(chatId, indexEntry.messageId, userId, indexEntry.swipeKey);
    if (!attached) continue;
    entries.push(memoryEntryFromAttachedSnapshot(attached));
  }
  return entries;
}

async function collectTrackerMemory(
  chatId: string,
  userId: string,
  settings: LTrackerSettings,
  activePreset: TrackerSchemaPreset,
  trigger?: TrackerTriggerSource,
): Promise<TrackerMemoryResult> {
  const memorySettings = {
    ...settings.memory,
    maxMemoryChars: effectiveTrackerMemoryChars(settings),
  };
  if (!settings.memory.enabled || settings.memory.retainCount <= 0) {
    return buildTrackerMemoryResult([], memorySettings, trigger
      ? memoryOptionsFromTrigger(trigger, activePreset)
      : { activePreset });
  }

  const entries: TrackerMemoryEntry[] = [];
  const index = await loadMessageSnapshotIndex(chatId, userId);
  if (settings.memory.source === "hybrid" || settings.memory.source === "sidecar_index") {
    entries.push(...await sidecarMemoryEntriesFromIndex(chatId, userId, index));
  }
  if (settings.memory.source === "hybrid" || settings.memory.source === "embedded_tags" || settings.memory.source === "message_history") {
    entries.push(...await embeddedMemoryEntriesFromMessages(chatId, settings));
  }
  if (entries.length === 0 && (settings.memory.source === "hybrid" || settings.memory.source === "sidecar_index")) {
    const latestSnapshot = await loadSnapshot(chatId, userId);
    if (latestSnapshot) entries.push(memoryEntryFromChatSnapshot(latestSnapshot));
  }

  return buildTrackerMemoryResult(entries, memorySettings, trigger
    ? memoryOptionsFromTrigger(trigger, activePreset)
    : { activePreset });
}

function chatJobKey(chatId: string): string {
  return `chat:${chatId}`;
}

function trackerJobKey(chatId: string, messageId: string, swipeKey: string): string {
  return `tracker:${chatId}:${messageId}:${swipeKey}`;
}

function jobKeyForTrigger(chatId: string, trigger: TrackerTriggerSource): string {
  return trigger.kind === "manual"
    ? chatJobKey(chatId)
    : trackerJobKey(chatId, trigger.sourceMessageId, trigger.swipeKey);
}

function jobsForChat(chatId: string): ActiveJob[] {
  return [...activeJobs.values()].filter((job) => job.chatId === chatId);
}

function hasActiveJobForChat(chatId: string): boolean {
  return jobsForChat(chatId).length > 0;
}

function abortJobsForChat(chatId: string, reason: string): void {
  for (const job of jobsForChat(chatId)) {
    job.cancelReason = reason;
    job.controller.abort();
  }
}

function activeWidgetJobsForChat(chatId: string | null): Record<string, { jobId: string; startedAt: string | null }> {
  if (!chatId) return {};
  const result: Record<string, { jobId: string; startedAt: string | null }> = {};
  for (const job of jobsForChat(chatId)) {
    if (!job.sourceMessageId || !job.swipeKey) continue;
    result[swipeIdentityKey({ messageId: job.sourceMessageId, swipeKey: job.swipeKey })] = {
      jobId: job.jobId,
      startedAt: job.startedAt,
    };
  }
  return result;
}

function activeTrackerJobDiagnostics(chatId: string | null): LTrackerDiagnostics["activeTrackerJobs"] {
  if (!chatId) return [];
  return jobsForChat(chatId)
    .filter((job) => job.sourceMessageId && job.swipeKey)
    .map((job) => ({
      jobId: job.jobId,
      messageId: job.sourceMessageId ?? "",
      swipeKey: job.swipeKey ?? DEFAULT_SWIPE_KEY,
      startedAt: job.startedAt,
    }));
}

async function buildMessageControlCandidates(
  chatId: string | null,
  settings: LTrackerSettings,
  latestChatSnapshot: TrackerSnapshot | null,
  preset: TrackerSchemaPreset,
  messageSnapshotIndex: MessageSnapshotIndexEntry[],
  activeWidgetJobs: Record<string, { jobId: string; startedAt: string | null }>,
  selectedSwipeIdentities: Record<string, SwipeTrackerIdentity>,
): Promise<MessageTrackerHistoryEntry[]> {
  if (!chatId || !settings.messageDisplay.showGenerateButtonForMissingTracker) return [];
  const messages = await readChatMessages(chatId);
  const existingKeys = new Set(messageSnapshotIndex.map((entry) => swipeIdentityKey(entry)));
  const recent = messages.slice(-Math.max(settings.recentMessageLimit, 12));
  const entries: MessageTrackerHistoryEntry[] = [];
  for (const message of recent) {
    if (message.is_user) continue;
    const identity = selectedSwipeIdentities[message.id] ?? deriveSwipeTrackerIdentity(chatId, message);
    const key = swipeIdentityKey(identity);
    if (existingKeys.has(key)) continue;
    const activeJob = activeWidgetJobs[key] ?? null;
    const indexEntry: MessageSnapshotIndexEntry = {
      messageId: message.id,
      messageIndex: typeof message.index_in_chat === "number" && Number.isFinite(message.index_in_chat) ? Math.round(message.index_in_chat) : null,
      swipeKey: identity.swipeKey,
      swipeIndex: identity.swipeIndex,
      swipeId: identity.swipeId,
      swipeContentHash: identity.swipeContentHash,
      swipeKeySource: identity.swipeKeySource,
      createdAt: nowIso(),
      presetId: preset.id,
      presetName: preset.name,
      storageKey: `missing:${chatId}:${message.id}:${identity.swipeKey}`,
    };
    entries.push({
      indexEntry,
      snapshot: null,
      rendered: renderMessageTracker({
        messageId: message.id,
        messageIndex: indexEntry.messageIndex,
        attachedSnapshot: null,
        latestChatSnapshot,
        preset,
        settings: settings.messageDisplay,
        swipeIdentity: identity,
        isRegenerating: Boolean(activeJob),
        activeJobId: activeJob?.jobId ?? null,
        activeJobStartedAt: activeJob?.startedAt ?? null,
      }),
    });
  }
  return entries;
}

function resolveMessageWidgetPlacement(
  requested: LTrackerMessageDisplayPlacement,
  settings?: LTrackerSettings,
): { resolved: LTrackerMessageWidgetPlacementResolved; reason: string | null } {
  if (settings?.messageDisplay.useDomInjection) {
    return {
      resolved: requested,
      reason: requested === "top" ? null : "DOM injection uses beforeend for bottom placement.",
    };
  }
  if (!MESSAGE_LOCAL_UI_SUPPORTED) {
    return { resolved: "unsupported", reason: MESSAGE_LOCAL_UI_FALLBACK_REASON ?? MESSAGE_WIDGET_PLACEMENT_REASON };
  }
  if (requested === "bottom") return { resolved: "host_default", reason: null };
  return { resolved: "host_default", reason: MESSAGE_WIDGET_PLACEMENT_REASON };
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

function summarizeConnectionProfile(profile: ConnectionProfileDTO): LTrackerConnectionProfileSummary {
  return {
    id: profile.id,
    name: profile.name,
    provider: typeof profile.provider === "string" ? profile.provider : null,
    model: typeof profile.model === "string" ? profile.model : null,
    has_api_key: typeof profile.has_api_key === "boolean" ? profile.has_api_key : null,
    is_default: typeof profile.is_default === "boolean" ? profile.is_default : null,
    reasoning_bindings: recordOrNull(profile.reasoning_bindings),
    updated_at: typeof profile.updated_at === "string" ? profile.updated_at : null,
  };
}

function connectionCacheForUser(userId: string): ConnectionProfileCache {
  return connectionProfilesByUser.get(userId) ?? {
    profiles: [],
    refreshedAt: null,
    error: null,
  };
}

async function refreshConnectionProfiles(
  userId: string,
  chatId: string | null,
): Promise<LTrackerConnectionProfileSummary[]> {
  ensurePermission("generation", "generation is required to list connection profiles");
  if (!spindle.connections?.list) {
    throw new Error("Lumiverse connection profile list API is unavailable.");
  }
  const refreshedAt = nowIso();
  try {
    const profiles = (await spindle.connections.list(userId)).map(summarizeConnectionProfile);
    connectionProfilesByUser.set(userId, { profiles, refreshedAt, error: null });
    if (chatId) {
      const settings = await getSettings(userId);
      const diagnostics = {
        ...await loadDiagnostics(chatId, userId),
        connectionMode: settings.connection.mode,
        selectedConnectionId: settings.connection.selectedConnectionId,
        selectedConnectionName: settings.connection.selectedConnectionName,
        selectedConnectionAvailable: Boolean(settings.connection.selectedConnectionId && profiles.some((profile) => profile.id === settings.connection.selectedConnectionId)),
        connectionListCount: profiles.length,
        lastConnectionRefreshAt: refreshedAt,
        lastConnectionRefreshError: null,
      };
      await tryPersistDiagnostics(diagnostics, userId);
    }
    return profiles;
  } catch (error) {
    const message = errorMessage(error);
    const previous = connectionCacheForUser(userId);
    connectionProfilesByUser.set(userId, { ...previous, refreshedAt, error: message });
    if (chatId) {
      const settings = await getSettings(userId);
      const diagnostics = {
        ...await loadDiagnostics(chatId, userId),
        connectionMode: settings.connection.mode,
        selectedConnectionId: settings.connection.selectedConnectionId,
        selectedConnectionName: settings.connection.selectedConnectionName,
        selectedConnectionAvailable: Boolean(settings.connection.selectedConnectionId && previous.profiles.some((profile) => profile.id === settings.connection.selectedConnectionId)),
        connectionListCount: previous.profiles.length,
        lastConnectionRefreshAt: refreshedAt,
        lastConnectionRefreshError: message,
      };
      await tryPersistDiagnostics(diagnostics, userId);
    }
    throw error;
  }
}

async function getSelectedConnectionProfile(
  settings: LTrackerSettings,
  userId: string,
): Promise<LTrackerConnectionProfileSummary | null> {
  const selectedId = settings.connection.selectedConnectionId;
  if (!selectedId) return null;
  const cached = connectionCacheForUser(userId).profiles.find((profile) => profile.id === selectedId);
  if (cached) return cached;
  if (!spindle.connections?.get) return null;
  try {
    const profile = await spindle.connections.get(selectedId, userId);
    return profile ? summarizeConnectionProfile(profile) : null;
  } catch (error) {
    spindle.log.warn(`LTracker could not fetch selected tracker connection: ${errorMessage(error)}`);
    return null;
  }
}

async function buildState(
  chatId: string | null,
  userId: string,
  status?: FrontendState["status"],
  error: LTrackerError | null = null,
  renderPreview: RenderedTrackerPreview | null = null,
): Promise<FrontendState> {
  const settings = await getSettings(userId);
  const diagnostics = await loadDiagnostics(chatId, userId);
  const connectionCache = connectionCacheForUser(userId);
  const selectedConnectionAvailable = Boolean(
    settings.connection.selectedConnectionId
    && connectionCache.profiles.some((profile) => profile.id === settings.connection.selectedConnectionId),
  );
  const presetState = await resolveActivePreset(chatId, userId);
  const snapshot = await loadSnapshot(chatId, userId);
  const activeWidgetJobs = activeWidgetJobsForChat(chatId);
  const messageSnapshotIndex = await loadMessageSnapshotIndex(chatId, userId);
  const selectedSwipeIdentities = await selectedSwipeIdentitiesForChat(chatId);
  const historySnapshots = await Promise.all(
    messageSnapshotIndex.map((entry) => loadMessageSnapshot(chatId, entry.messageId, userId, entry.swipeKey)),
  );
  const rawMessageSnapshotHistory = buildMessageTrackerHistory({
    index: messageSnapshotIndex,
    snapshots: historySnapshots,
    latestChatSnapshot: snapshot,
    preset: presetState.activePreset,
    settings: settings.messageDisplay,
    activeWidgetJobs,
    selectedSwipeIdentities,
  });
  const historyGrouping = groupMessageTrackerHistory(rawMessageSnapshotHistory, false);
  const messageSnapshotHistory = rawMessageSnapshotHistory;
  const latestMessageSnapshotHistory = historyGrouping.entries;
  const messageControlCandidates = await buildMessageControlCandidates(
    chatId,
    settings,
    snapshot,
    presetState.activePreset,
    messageSnapshotIndex,
    activeWidgetJobs,
    selectedSwipeIdentities,
  ).catch((error: unknown) => {
    spindle.log.warn(`LTracker could not build message control candidates: ${errorMessage(error)}`);
    return [];
  });
  const latestMessageSnapshot = await loadMessageSnapshot(
    chatId,
    diagnostics.latestAttachedMessageId,
    userId,
    diagnostics.lastSwipeKey ?? DEFAULT_SWIPE_KEY,
  );
  const messageDisplayMode: LTrackerMessageDisplayMode = !settings.messageDisplay.enabled
    ? "disabled"
    : settings.messageDisplay.useDomInjection ? "dom_injection"
      : settings.messageDisplay.fallbackToIframeWidget && MESSAGE_LOCAL_UI_SUPPORTED ? "message_widget" : "drawer_history";
  const messageDisplayRenderer: LTrackerDiagnostics["messageDisplayRenderer"] = !settings.messageDisplay.enabled
    ? "drawer_history"
    : settings.messageDisplay.useDomInjection ? "dom_injection"
      : settings.messageDisplay.fallbackToIframeWidget && MESSAGE_LOCAL_UI_SUPPORTED ? "iframe_widget" : "drawer_history";
  const messageDisplayHydratedCount = settings.messageDisplay.enabled
    ? latestMessageSnapshotHistory.filter((entry) => entry.snapshot !== null).length
    : 0;
  const placement = resolveMessageWidgetPlacement(settings.messageDisplay.placement, settings);
  const activeWidgetRegenerationCount = Object.keys(activeWidgetJobs).length;
  const memoryPreviewResult = chatId
    ? await collectTrackerMemory(chatId, userId, settings, presetState.activePreset).catch((error: unknown) => {
        spindle.log.warn(`LTracker could not build tracker memory preview: ${errorMessage(error)}`);
        return null;
      })
    : null;
  const memoryPreview = memoryPreviewResult?.renderedText.trim() ? memoryPreviewResult.renderedText : null;
  const injectionSettings = {
    ...settings.injection,
    maxInjectedChars: effectivePromptInjectionChars(settings),
  };
  const injectionPreview = memoryPreviewResult?.entries.length
    ? formatTrackerInjectionBlock(memoryPreviewResult.entries, injectionSettings)
    : null;
  const stateError = error ?? diagnostics.lastError;
  return {
    version: EXTENSION_VERSION,
    status: status ?? diagnostics.status,
    chatId,
    snapshot,
    latestMessageSnapshot,
    memoryPreview,
    injectionPreview,
    renderPreview,
    messageSnapshotHistory,
    messageControlCandidates,
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
      connectionMode: settings.connection.mode,
      selectedConnectionId: settings.connection.selectedConnectionId,
      selectedConnectionName: settings.connection.selectedConnectionName,
      selectedConnectionAvailable,
      connectionListCount: connectionCache.profiles.length,
      lastConnectionRefreshAt: connectionCache.refreshedAt ?? diagnostics.lastConnectionRefreshAt,
      lastConnectionRefreshError: connectionCache.error ?? diagnostics.lastConnectionRefreshError,
      drawerActiveSection: diagnostics.drawerActiveSection ?? "dashboard",
      lastDrawerRefreshAt: nowIso(),
      pendingAutoFinalizationCount: pendingAutoFinalizations.size,
      autoSubscriptionActive: autoSubscriptionsActive,
      injectionEnabled: settings.injection.enabled && interceptorRegistered,
      lastMemoryEntryCount: memoryPreviewResult?.entries.length ?? diagnostics.lastMemoryEntryCount,
      lastMemoryChars: memoryPreviewResult?.totalChars ?? diagnostics.lastMemoryChars,
      lastMemoryTruncated: memoryPreviewResult?.truncated ?? diagnostics.lastMemoryTruncated,
      lastMemorySourceSummary: memoryPreviewResult ? trackerMemorySourceSummary(memoryPreviewResult.entries) : diagnostics.lastMemorySourceSummary,
      lastMemorySkippedReason: memoryPreviewResult?.skippedReason ?? diagnostics.lastMemorySkippedReason,
      selectedPresetId: presetState.activePreset.id,
      selectedPresetName: presetState.activePreset.name,
      lastPresetFallbackReason: presetState.fallbackReason ?? diagnostics.lastPresetFallbackReason,
      contextHandlerRegistered,
      interceptorRegistered,
      contextHandlerDisabledReason: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED
        ? diagnostics.contextHandlerDisabledReason
        : CONTEXT_HANDLER_DISABLED_REASON,
      messageDisplayEnabled: settings.messageDisplay.enabled,
      messageDisplayMode,
      messageDisplayPlacement: settings.messageDisplay.placement,
      messageDisplayHydratedCount,
      lastMessageDisplayHydratedAt: messageDisplayHydratedCount > 0
        ? nowIso()
        : diagnostics.lastMessageDisplayHydratedAt,
      messageLocalUiSupported: MESSAGE_LOCAL_UI_SUPPORTED,
      messageLocalUiFallbackReason: MESSAGE_LOCAL_UI_FALLBACK_REASON,
      messageSnapshotIndexCount: messageSnapshotIndex.length,
      lastHistoryGroupedCount: historyGrouping.groupedCount,
      lastHistoryDuplicateCount: historyGrouping.duplicateCount,
      swipeTrackerIndexCount: messageSnapshotIndex.length,
      activeWidgetRegenerationCount,
      activeTrackerJobs: activeTrackerJobDiagnostics(chatId),
      messageWidgetPlacementResolved: placement.resolved,
      messageWidgetPlacementReason: placement.reason,
      messageDisplayRenderer,
      nativeToolbarSupported: MESSAGE_NATIVE_TOOLBAR_SUPPORTED,
      nativeToolbarFallbackReason: MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON,
      templateTrustMode: settings.renderer.templateTrustMode,
      ultraModeEnabled: settings.budget.ultraModeEnabled,
      iframeFallbackVisibleInMainUi: false,
      expandedWidthModeResolved: settings.expandedWidth.expandedWidthMode,
    },
    connectionProfiles: connectionCache.profiles,
  };
}

async function sendState(
  chatId: string | null,
  userId: string,
  status?: FrontendState["status"],
  error: LTrackerError | null = null,
  requestId?: string,
  renderPreview: RenderedTrackerPreview | null = null,
): Promise<void> {
  const message: BackendMessage = {
    type: "state",
    state: await buildState(chatId, userId, status, error, renderPreview),
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

async function selectedSwipeIdentitiesForChat(chatId: string | null): Promise<Record<string, SwipeTrackerIdentity>> {
  if (!chatId) return {};
  try {
    const messages = await readChatMessages(chatId);
    const result: Record<string, SwipeTrackerIdentity> = {};
    for (const message of messages) {
      if (message.is_user) continue;
      result[message.id] = deriveSwipeTrackerIdentity(chatId, message);
    }
    return result;
  } catch (error) {
    spindle.log.warn(`LTracker could not read selected swipes: ${errorMessage(error)}`);
    return {};
  }
}

async function getMessagesForTrigger(
  chatId: string,
  settings: LTrackerSettings,
  trigger: TrackerTriggerSource,
): Promise<ChatMessageDTO[]> {
  if (trigger.kind !== "widget") return getRecentMessages(chatId, settings);
  const messages = await readChatMessages(chatId);
  const targetIndex = messages.findIndex((message) => message.id === trigger.sourceMessageId);
  if (targetIndex < 0) {
    throw new LTrackerStageError("read_messages", "The selected message was not found for regeneration.");
  }
  return messages.slice(0, targetIndex + 1).slice(-settings.recentMessageLimit);
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

function generationFinishReason(result: unknown): string | null {
  if (!isRecord(result)) return null;
  for (const key of ["finish_reason", "finishReason", "stop_reason", "stopReason"]) {
    const value = result[key];
    if (typeof value === "string") return value;
  }
  const choice = Array.isArray(result.choices) ? result.choices[0] : null;
  if (isRecord(choice)) {
    for (const key of ["finish_reason", "finishReason"]) {
      const value = choice[key];
      if (typeof value === "string") return value;
    }
  }
  return null;
}

function generationUsage(result: unknown): Record<string, unknown> | null {
  if (!isRecord(result)) return null;
  const usage = result.usage ?? result.token_usage ?? result.tokenUsage;
  return recordOrNull(usage);
}

async function runTrackerGeneration(
  messages: LlmMessageDTO[],
  userId: string,
  settings: LTrackerSettings,
  parentSignal: AbortSignal,
): Promise<TrackerGenerationResult> {
  ensurePermission("generation", "generation is required to call the tracker model");

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
    const selectedConnection = await getSelectedConnectionProfile(settings, userId);
    const requestDiagnostics = buildTrackerGenerationRequest({
      messages,
      settings,
      selectedConnection,
      quietSupportsConnectionId: true,
      signal: controller.signal,
    });
    const request = {
      ...requestDiagnostics.request,
      userId,
    } as GenerationRequestDTO;
    if (requestDiagnostics.request.type === "raw" && !spindle.generate?.raw) {
      throw new Error("Lumiverse raw generation API is unavailable.");
    }
    if (requestDiagnostics.request.type === "quiet" && !spindle.generate?.quiet) {
      throw new Error("Lumiverse quiet generation API is unavailable.");
    }

    internalTrackerGenerationDepth += 1;
    const response = requestDiagnostics.request.type === "raw"
      ? await spindle.generate.raw(request)
      : await spindle.generate.quiet(request);
    return {
      text: normalizeGenerationText(response),
      response,
      requestDiagnostics,
    };
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
  await spindle.userStorage.setJson(messageSnapshotPath(snapshot.chatId, snapshot.messageId, snapshot.swipeKey), snapshot, {
    indent: 2,
    userId,
  });
}

async function saveMessageAttachedSnapshotWithIndex(
  snapshot: MessageAttachedSnapshot,
  userId: string,
): Promise<MessageSnapshotIndexEntry[]> {
  await saveMessageAttachedSnapshot(snapshot, userId);
  const storageKey = messageSnapshotPath(snapshot.chatId, snapshot.messageId, snapshot.swipeKey);
  const index = await loadMessageSnapshotIndex(snapshot.chatId, userId);
  const nextIndex = upsertMessageSnapshotIndexEntry(index, {
    messageId: snapshot.messageId,
    messageIndex: snapshot.messageIndex,
    swipeKey: snapshot.swipeKey,
    swipeIndex: snapshot.swipeIndex,
    swipeId: snapshot.swipeId,
    swipeContentHash: snapshot.swipeContentHash,
    swipeKeySource: snapshot.swipeKeySource,
    createdAt: snapshot.attachedAt,
    presetId: snapshot.presetId,
    presetName: snapshot.presetName,
    storageKey,
  });
  await saveMessageSnapshotIndex(snapshot.chatId, nextIndex, userId);
  return nextIndex;
}

function shouldSaveSidecarSnapshot(settings: LTrackerSettings): boolean {
  return settings.messageDisplay.attachmentMode === "sidecar_snapshot" || settings.messageDisplay.attachmentMode === "both";
}

function shouldWriteEmbeddedTrackerTag(settings: LTrackerSettings): boolean {
  return settings.messageDisplay.attachmentMode === "embedded_tracker_tag" || settings.messageDisplay.attachmentMode === "both";
}

function resolveSwipeContentIndex(message: ChatMessageDTO, swipeKey: string): number {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  const activeIndex = typeof message.swipe_id === "number" && Number.isInteger(message.swipe_id)
    ? Math.max(0, message.swipe_id)
    : 0;
  const activeIdentity = deriveSwipeTrackerIdentity(message.chat_id, message);
  if (activeIdentity.swipeKey === swipeKey) return Math.min(activeIndex, Math.max(0, swipes.length - 1));
  const indexMatch = /^index-(\d+)$/.exec(swipeKey);
  if (indexMatch) {
    const index = Number(indexMatch[1]);
    if (Number.isInteger(index) && index >= 0 && index < swipes.length) return index;
  }
  const hashMatch = /^hash-(.+)$/.exec(swipeKey);
  if (hashMatch) {
    const hash = hashMatch[1];
    const found = swipes.findIndex((content) => hashSwipeContent(content) === hash);
    if (found >= 0) return found;
  }
  return Math.min(activeIndex, Math.max(0, swipes.length - 1));
}

async function updateMessageSwipeContent(
  chatId: string,
  messageId: string,
  swipeKey: string,
  mutate: (content: string) => { content: string; changed: boolean },
): Promise<{ changed: boolean; swipeIndex: number | null }> {
  const messages = await readChatMessages(chatId);
  const message = messages.find((item) => item.id === messageId);
  if (!message) throw new LTrackerStageError("read_messages", "Message not found for embedded tracker update.");
  if (message.is_user) throw new LTrackerStageError("read_messages", "Embedded tracker tags can only be written to assistant messages.");
  const swipes = Array.isArray(message.swipes) && message.swipes.length > 0 ? [...message.swipes] : [message.content ?? ""];
  const swipeIndex = resolveSwipeContentIndex(message, swipeKey);
  const current = swipes[swipeIndex] ?? message.content ?? "";
  const next = mutate(current);
  if (!next.changed || next.content === current) return { changed: false, swipeIndex };
  swipes[swipeIndex] = next.content;
  const patchSwipeIndex = typeof message.swipe_id === "number"
    && Number.isInteger(message.swipe_id)
    && message.swipe_id >= 0
    && message.swipe_id < swipes.length
    ? message.swipe_id
    : swipeIndex;
  await spindle.chat.updateMessage(chatId, messageId, {
    swipes,
    swipe_id: patchSwipeIndex,
    skipChunkRebuild: true,
  });
  return { changed: true, swipeIndex };
}

async function writeEmbeddedTrackerTag(
  attachedSnapshot: MessageAttachedSnapshot,
  userId: string,
): Promise<void> {
  const jsonText = JSON.stringify(attachedSnapshot.snapshot.data, null, 2);
  await updateMessageSwipeContent(
    attachedSnapshot.chatId,
    attachedSnapshot.messageId,
    attachedSnapshot.swipeKey,
    (content) => {
      const next = upsertLTrackerTag(content, jsonText, attachedSnapshot.swipeKey, "append");
      return { content: next.content, changed: next.inserted || next.replaced };
    },
  );
  const diagnostics = {
    ...await loadDiagnostics(attachedSnapshot.chatId, userId),
    lastEmbeddedTagWriteAt: nowIso(),
    lastEmbeddedTagWriteMessageId: attachedSnapshot.messageId,
    lastEmbeddedTagWriteSwipeKey: attachedSnapshot.swipeKey,
    lastEmbeddedTagError: null,
  };
  await tryPersistDiagnostics(diagnostics, userId);
}

async function removeEmbeddedTrackerTag(
  chatId: string,
  messageId: string,
  swipeKey: string,
  userId: string,
): Promise<void> {
  const result = await updateMessageSwipeContent(chatId, messageId, swipeKey, (content) => {
    const next = removeLTrackerTag(content, swipeKey);
    return { content: next.content, changed: next.removed };
  });
  if (!result.changed) return;
  const diagnostics = {
    ...await loadDiagnostics(chatId, userId),
    lastEmbeddedTagWriteAt: nowIso(),
    lastEmbeddedTagWriteMessageId: messageId,
    lastEmbeddedTagWriteSwipeKey: swipeKey,
    lastEmbeddedTagError: null,
  };
  await tryPersistDiagnostics(diagnostics, userId);
}

function promptPreview(messages: LlmMessageDTO[], maxChars = 64_000): string {
  const rendered = messages.map((message) => {
    const content = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content, null, 2);
    return `## ${message.role}\n${content}`;
  }).join("\n\n");
  return rendered.length > maxChars ? `${rendered.slice(0, Math.max(0, maxChars - 12))}\n[truncated]` : rendered;
}

function sourceRange(ids: string[]): string | null {
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0] ?? null;
  return `${ids[0]} -> ${ids[ids.length - 1]}`;
}

function newJobId(): string {
  return `job:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function isCurrentJob(jobKey: string, jobId: string): boolean {
  return activeJobs.get(jobKey)?.jobId === jobId;
}

function userChatKey(userId: string, chatId: string): string {
  return `${userId}:${chatId}`;
}

function autoFinalizationKey(userId: string, chatId: string, messageId: string, swipeKey: string): string {
  return `${userId}:${chatId}:${messageId}:${swipeKey}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
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
  const identity = deriveSwipeTrackerIdentity(input.message.chat_id, input.message);
  return {
    kind: "auto",
    requestId: input.requestId,
    eventType: input.eventType,
    sourceMessageId: input.message.id,
    sourceMessageIndex: input.message.index_in_chat,
    generationId: input.generationId ?? null,
    generationType: input.generationType ?? null,
    swipeKey: identity.swipeKey,
    swipeIndex: identity.swipeIndex,
    swipeId: identity.swipeId,
    swipeContentHash: identity.swipeContentHash,
    swipeKeySource: identity.swipeKeySource,
  };
}

function createWidgetTrigger(input: {
  requestId: string;
  message: ChatMessageDTO;
  swipeKey?: string | null;
}): TrackerTriggerSource {
  const identity = deriveSwipeTrackerIdentity(input.message.chat_id, input.message);
  if (input.swipeKey && input.swipeKey !== identity.swipeKey) {
    throw new LTrackerStageError("read_messages", "The selected swipe changed before tracker regeneration started.");
  }
  return {
    kind: "widget",
    requestId: input.requestId,
    sourceMessageId: input.message.id,
    sourceMessageIndex: input.message.index_in_chat,
    swipeKey: identity.swipeKey,
    swipeIndex: identity.swipeIndex,
    swipeId: identity.swipeId,
    swipeContentHash: identity.swipeContentHash,
    swipeKeySource: identity.swipeKeySource,
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
    status: hasActiveJobForChat(chatId) ? "generating" as const : "idle" as const,
    lastAutoEventAt: eventAt ?? nowIso(),
    lastAutoEventType: trigger.eventType,
    lastAutoSkippedReason: reason,
    lastAutoScheduledAt: null,
    lastAutoTriggeredAt: null,
    lastAutoSourceMessageId: trigger.sourceMessageId,
    lastAutoSourceMessageIndex: trigger.sourceMessageIndex,
    lastAutoGenerationId: trigger.generationId,
    lastAutoFinalizationSkippedReason: reason,
    pendingAutoFinalizationCount: pendingAutoFinalizations.size,
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

function cancelPendingAutoFinalizationForChat(chatId: string, userId: string | null, reason: string): void {
  for (const [key, pending] of pendingAutoFinalizations) {
    if (pending.chatId !== chatId) continue;
    if (userId && pending.userId !== userId) continue;
    clearTimeout(pending.timer);
    pendingAutoFinalizations.delete(key);
    void markAutoSkipped(pending.chatId, pending.userId, pending.trigger, reason, pending.scheduledAt)
      .catch((error: unknown) => spindle.log.warn(`LTracker could not record auto finalization cancellation: ${errorMessage(error)}`));
  }
}

async function cancelPendingAutoFinalizationForSwipeChange(input: {
  chatId: string;
  userId: string;
  messageId: string;
  nextSwipeKey: string;
  settings: LTrackerSettings;
}): Promise<boolean> {
  let cancelled = false;
  for (const [key, pending] of pendingAutoFinalizations) {
    if (pending.chatId !== input.chatId || pending.userId !== input.userId) continue;
    if (!shouldCancelPendingSwipe(
      { messageId: pending.messageId, swipeKey: pending.swipeKey },
      { messageId: input.messageId, swipeKey: input.nextSwipeKey },
      input.settings.autoTiming,
    )) continue;
    clearTimeout(pending.timer);
    pendingAutoFinalizations.delete(key);
    cancelled = true;
  }
  if (cancelled) {
    const diagnostics = {
      ...await loadDiagnostics(input.chatId, input.userId),
      lastAutoFinalizationState: "cancelled_on_swipe_change",
      lastAutoFinalizationSkippedReason: "Selected swipe changed before tracker generation.",
      pendingAutoFinalizationCount: pendingAutoFinalizations.size,
      lastSwipeChangeCancelledPendingJob: true,
    };
    await tryPersistDiagnostics(diagnostics, input.userId);
  }
  return cancelled;
}

function abortAutoJobForChat(chatId: string, reason: string): void {
  for (const job of jobsForChat(chatId)) {
    if (job.sourceKind !== "auto") continue;
    job.cancelReason = reason;
    job.controller.abort();
  }
}

function rememberActiveChat(userId: string, chatId: string | null): void {
  const previous = activeChatByUser.get(userId) ?? null;
  if (previous === chatId) return;
  if (previous) {
    const users = usersByChat.get(previous);
    users?.delete(userId);
    if (users?.size === 0) usersByChat.delete(previous);
    cancelPendingAutoForChat(previous, userId, "Chat changed before the auto timer fired.");
    cancelPendingAutoFinalizationForChat(previous, userId, "Chat changed before the auto tracker finalized.");
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

async function queueAutoDebounce(input: {
  chatId: string;
  userId: string;
  eventAt: string;
  settings: LTrackerSettings;
  trigger: AutoTrackerTriggerSource;
  finalizationState?: string | null;
  stableHash?: string | null;
  stablePassed?: boolean | null;
}): Promise<void> {
  const key = userChatKey(input.userId, input.chatId);
  const existing = pendingAutoJobs.get(key);
  if (existing) clearTimeout(existing.timer);

  const scheduledAt = nowIso();
  const timer = setTimeout(() => {
    void runPendingAuto(key).catch((error: unknown) => {
      spindle.log.warn(`LTracker auto job failed: ${errorMessage(error)}`);
    });
  }, input.settings.auto.autoDebounceMs);

  pendingAutoJobs.set(key, {
    timer,
    chatId: input.chatId,
    userId: input.userId,
    requestId: input.trigger.requestId,
    trigger: input.trigger,
    scheduledAt,
  });

  const diagnostics = {
    ...await loadDiagnostics(input.chatId, input.userId),
    lastAutoEventAt: input.eventAt,
    lastAutoEventType: input.trigger.eventType,
    lastAutoSkippedReason: null,
    lastAutoScheduledAt: scheduledAt,
    lastAutoTriggeredAt: null,
    lastAutoSourceMessageId: input.trigger.sourceMessageId,
    lastAutoSourceMessageIndex: input.trigger.sourceMessageIndex,
    lastAutoGenerationId: input.trigger.generationId,
    lastAutoFinalizationState: input.finalizationState ?? "scheduled_after_finalization",
    lastAutoFinalizedAt: input.finalizationState ? nowIso() : null,
    lastAutoStableCheckAt: input.stablePassed === null || input.stablePassed === undefined ? null : nowIso(),
    lastAutoStableCheckPassed: input.stablePassed ?? null,
    lastAutoContentStableHash: input.stableHash ?? null,
    lastAutoFinalizationSkippedReason: null,
    pendingAutoFinalizationCount: pendingAutoFinalizations.size,
  };
  await tryPersistDiagnostics(diagnostics, input.userId);
  await sendState(input.chatId, input.userId, diagnostics.status, null, input.trigger.requestId);
}

async function readFinalizationTarget(
  chatId: string,
  messageId: string,
): Promise<{ message: ChatMessageDTO; snapshot: AutoFinalizationSnapshot } | null> {
  const messages = await readChatMessages(chatId);
  const message = messages.find((item) => item.id === messageId);
  if (!message) return null;
  const identity = deriveSwipeTrackerIdentity(chatId, message);
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  const activeIndex = typeof message.swipe_id === "number" && Number.isFinite(message.swipe_id)
    ? Math.max(0, Math.round(message.swipe_id))
    : 0;
  const content = swipes[activeIndex] ?? message.content ?? "";
  return {
    message,
    snapshot: {
      messageId: message.id,
      swipeKey: identity.swipeKey,
      content,
    },
  };
}

async function runAutoFinalization(key: string): Promise<void> {
  const pending = pendingAutoFinalizations.get(key);
  if (!pending) return;
  const settings = await getSettings(pending.userId);
  const markState = async (state: PendingAutoFinalizationJob["state"], extra: Partial<LTrackerDiagnostics> = {}) => {
    const diagnostics = {
      ...await loadDiagnostics(pending.chatId, pending.userId),
      lastAutoFinalizationState: state,
      lastAutoWaitingMessageId: pending.messageId,
      lastAutoWaitingSwipeKey: pending.swipeKey,
      pendingAutoFinalizationCount: pendingAutoFinalizations.size,
      ...extra,
    };
    await tryPersistDiagnostics(diagnostics, pending.userId);
    await sendState(pending.chatId, pending.userId, diagnostics.status, null, pending.requestId);
  };

  await markState("settling_after_finalization");
  await delay(settings.autoTiming.postCompletionSettleMs);
  if (pendingAutoFinalizations.get(key) !== pending) return;

  const first = await readFinalizationTarget(pending.chatId, pending.messageId);
  await markState("stable_check");
  await delay(settings.autoTiming.stableContentCheckMs);
  if (pendingAutoFinalizations.get(key) !== pending) return;

  const second = await readFinalizationTarget(pending.chatId, pending.messageId);
  const decision = evaluateStableSwipeContent(first?.snapshot ?? null, second?.snapshot ?? null, settings.autoTiming);
  pendingAutoFinalizations.delete(key);

  if (!decision.passed || !second) {
    const diagnostics = {
      ...await loadDiagnostics(pending.chatId, pending.userId),
      lastAutoFinalizationState: "skipped",
      lastAutoStableCheckAt: nowIso(),
      lastAutoStableCheckPassed: false,
      lastAutoContentStableHash: decision.contentHash,
      lastAutoFinalizationSkippedReason: decision.skippedReason,
      lastAutoSkippedReason: decision.skippedReason,
      pendingAutoFinalizationCount: pendingAutoFinalizations.size,
    };
    await tryPersistDiagnostics(diagnostics, pending.userId);
    await sendState(pending.chatId, pending.userId, diagnostics.status, null, pending.requestId);
    return;
  }

  const finalizedTrigger = createAutoTrigger({
    eventType: pending.trigger.eventType,
    requestId: pending.trigger.requestId,
    message: second.message,
    generationId: pending.trigger.generationId,
    generationType: pending.trigger.generationType,
  });
  await queueAutoDebounce({
    chatId: pending.chatId,
    userId: pending.userId,
    eventAt: pending.eventAt,
    settings,
    trigger: finalizedTrigger,
    finalizationState: "finalized",
    stableHash: decision.contentHash,
    stablePassed: true,
  });
}

async function queueAutoFinalization(input: {
  chatId: string;
  userId: string;
  eventAt: string;
  settings: LTrackerSettings;
  trigger: AutoTrackerTriggerSource;
  message: ChatMessageDTO;
}): Promise<void> {
  const key = autoFinalizationKey(input.userId, input.chatId, input.trigger.sourceMessageId, input.trigger.swipeKey);
  const existing = pendingAutoFinalizations.get(key);
  if (existing) clearTimeout(existing.timer);
  const scheduledAt = nowIso();
  const initialContent = input.message.content ?? "";
  const timer = setTimeout(() => {
    void runAutoFinalization(key).catch((error: unknown) => {
      spindle.log.warn(`LTracker auto finalization failed: ${errorMessage(error)}`);
    });
  }, 0);
  pendingAutoFinalizations.set(key, {
    timer,
    chatId: input.chatId,
    userId: input.userId,
    requestId: input.trigger.requestId,
    trigger: input.trigger,
    scheduledAt,
    eventAt: input.eventAt,
    state: "waiting_for_message_finalization",
    messageId: input.trigger.sourceMessageId,
    swipeKey: input.trigger.swipeKey,
    initialContentHash: initialContent.trim() ? stableContentHash(initialContent) : null,
  });

  const diagnostics = {
    ...await loadDiagnostics(input.chatId, input.userId),
    lastAutoEventAt: input.eventAt,
    lastAutoEventType: input.trigger.eventType,
    lastAutoSkippedReason: null,
    lastAutoScheduledAt: null,
    lastAutoTriggeredAt: null,
    lastAutoSourceMessageId: input.trigger.sourceMessageId,
    lastAutoSourceMessageIndex: input.trigger.sourceMessageIndex,
    lastAutoGenerationId: input.trigger.generationId,
    lastAutoFinalizationState: "waiting_for_message_finalization",
    lastAutoWaitingMessageId: input.trigger.sourceMessageId,
    lastAutoWaitingSwipeKey: input.trigger.swipeKey,
    lastAutoFinalizedAt: null,
    lastAutoStableCheckAt: null,
    lastAutoStableCheckPassed: null,
    lastAutoContentStableHash: stableContentHash(initialContent),
    lastAutoFinalizationSkippedReason: null,
    pendingAutoFinalizationCount: pendingAutoFinalizations.size,
    lastSwipeChangeCancelledPendingJob: false,
  };
  await tryPersistDiagnostics(diagnostics, input.userId);
  await sendState(input.chatId, input.userId, diagnostics.status, null, input.trigger.requestId);
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
    trackerGenerationRunning: hasActiveJobForChat(input.chatId),
  });

  if (!decision.shouldSchedule) {
    await markAutoSkipped(input.chatId, input.userId, trigger, decision.reason, input.eventAt);
    return;
  }

  if (settings.autoTiming.waitForAssistantFinalization && !sourceMessage.is_user) {
    await queueAutoFinalization({
      chatId: input.chatId,
      userId: input.userId,
      eventAt: input.eventAt,
      settings,
      trigger,
      message: sourceMessage,
    });
    return;
  }

  await queueAutoDebounce({
    chatId: input.chatId,
    userId: input.userId,
    eventAt: input.eventAt,
    settings,
    trigger,
    finalizationState: null,
    stableHash: null,
    stablePassed: null,
  });
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
  if (hasActiveJobForChat(pending.chatId)) {
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

async function handleGenerationStarted(payload: GenerationStartedPayloadDTO, userId?: string): Promise<void> {
  if (isQuietGenerationType(payload.generationType)) return;
  const users = targetUsersForChat(payload.chatId, userId);
  const eventAt = nowIso();
  for (const targetUserId of users) {
    const settings = await getSettings(targetUserId);
    if (!settings.auto.autoModeEnabled || !settings.autoTiming.waitForAssistantFinalization) continue;
    const targetMessageId = typeof payload.targetMessageId === "string" ? payload.targetMessageId : null;
    const diagnostics = {
      ...await loadDiagnostics(payload.chatId, targetUserId),
      lastAutoEventAt: eventAt,
      lastAutoGenerationId: payload.generationId,
      lastAutoFinalizationState: "waiting_for_message_finalization",
      lastAutoWaitingMessageId: targetMessageId,
      lastAutoWaitingSwipeKey: null,
      lastAutoFinalizationSkippedReason: null,
      pendingAutoFinalizationCount: pendingAutoFinalizations.size,
    };
    await tryPersistDiagnostics(diagnostics, targetUserId);
    await sendState(payload.chatId, targetUserId, diagnostics.status, null);
  }
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
      const identity = defaultSwipeIdentity(payload.chatId, payload.messageId);
      const trigger: AutoTrackerTriggerSource = {
        kind: "auto",
        requestId: `auto:GENERATION_ENDED:${payload.messageId}:${Date.now()}`,
        eventType: "GENERATION_ENDED",
        sourceMessageId: payload.messageId,
        sourceMessageIndex: null,
        generationId: payload.generationId,
        generationType: payload.generationType ?? null,
        swipeKey: identity.swipeKey,
        swipeIndex: identity.swipeIndex,
        swipeId: identity.swipeId,
        swipeContentHash: identity.swipeContentHash,
        swipeKeySource: identity.swipeKeySource,
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

async function handleMessageSwiped(payload: unknown, userId?: string): Promise<void> {
  if (!isRecord(payload) || !isChatMessage(payload.message) || typeof payload.chatId !== "string") return;
  const message = payload.message;
  const identity = deriveSwipeTrackerIdentity(payload.chatId, message);
  const users = targetUsersForChat(payload.chatId, userId);
  const eventAt = nowIso();
  for (const targetUserId of users) {
    const settings = await getSettings(targetUserId);
    const cancelledPending = await cancelPendingAutoFinalizationForSwipeChange({
      chatId: payload.chatId,
      userId: targetUserId,
      messageId: message.id,
      nextSwipeKey: identity.swipeKey,
      settings,
    });
    const diagnostics = {
      ...await loadDiagnostics(payload.chatId, targetUserId),
      lastSwipeDetectedMessageId: message.id,
      lastSwipeKey: identity.swipeKey,
      lastSwipeKeySource: identity.swipeKeySource,
      lastSwipeChangeCancelledPendingJob: cancelledPending,
    };
    await tryPersistDiagnostics(diagnostics, targetUserId);
    const action = typeof payload.action === "string" ? payload.action : null;
    if (!message.is_user && (action === "added" || action === "updated")) {
      await scheduleAutoForMessage({
        chatId: payload.chatId,
        userId: targetUserId,
        eventType: "GENERATION_ENDED",
        eventAt,
        message,
        generationId: null,
        generationType: "swipe",
      });
    } else {
      await sendState(payload.chatId, targetUserId, diagnostics.status, null);
    }
  }
}

async function handleSwipeEdited(payload: unknown, userId?: string): Promise<void> {
  if (!isRecord(payload) || !isChatMessage(payload.message) || typeof payload.chatId !== "string") return;
  await handleMessageSwiped({
    chatId: payload.chatId,
    message: payload.message,
    action: "updated",
  }, userId);
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
    lastInjectionMode: null,
    lastInjectionFormat: settings.injection.format,
    lastInjectedChars: decision.injectedChars,
    lastInjectionSkippedReason: decision.skippedReason,
    lastInjectionSnapshotCreatedAt: decision.snapshotCreatedAt,
    lastInjectionSourceMessageId: decision.sourceMessageId,
  };
  await tryPersistDiagnostics(diagnostics, userId);
}

async function recordInterceptorDiagnostics(
  chatId: string,
  userId: string,
  settings: LTrackerSettings,
  result: ReturnType<typeof applyPromptInjection>,
): Promise<void> {
  const currentDiagnostics = await loadDiagnostics(chatId, userId);
  await tryPersistDiagnostics({
    ...currentDiagnostics,
    injectionEnabled: settings.injection.enabled,
    lastInjectionAt: result.injectedCount > 0 ? nowIso() : currentDiagnostics.lastInjectionAt,
    lastInjectionMode: null,
    lastInjectionFormat: settings.injection.format,
    lastInjectedChars: result.injectedChars,
    lastInjectionSkippedReason: result.skippedReason,
    interceptorRegistered,
    lastInterceptorAt: nowIso(),
    lastInterceptorInjectedCount: result.injectedCount,
    lastInterceptorInjectedChars: result.injectedChars,
    lastInterceptorStrippedCount: result.strippedCount,
    lastInterceptorSkippedReason: result.skippedReason,
    lastInterceptorError: result.error,
    lastInterceptorPromptTrackerCountBefore: result.promptTrackerCountBefore,
    lastInterceptorPromptTrackerCountAfter: result.promptTrackerCountAfter,
  }, userId);
}

async function recordInterceptorSkipped(
  chatId: string | null,
  userId: string | null,
  reason: string,
  error: string | null = null,
): Promise<void> {
  if (!chatId || !userId) return;
  const currentDiagnostics = await loadDiagnostics(chatId, userId);
  await tryPersistDiagnostics({
    ...currentDiagnostics,
    interceptorRegistered,
    lastInterceptorAt: nowIso(),
    lastInterceptorInjectedCount: 0,
    lastInterceptorInjectedChars: 0,
    lastInterceptorStrippedCount: 0,
    lastInterceptorSkippedReason: reason,
    lastInterceptorError: error,
  }, userId);
}

function promptMessagesForInjection(messages: LlmMessageDTO[]): PromptInjectionMessage[] {
  return messages.map((message) => ({ ...message })) as PromptInjectionMessage[];
}

function ltrackerMessagesFromPrompt(messages: PromptInjectionMessage[]): LlmMessageDTO[] {
  return messages.map((message) => ({ ...message })) as LlmMessageDTO[];
}

function injectionMemorySettings(settings: LTrackerSettings): LTrackerSettings {
  return {
    ...settings,
    memory: {
      ...settings.memory,
      enabled: true,
      includeInTrackerGeneration: true,
      retainCount: settings.injection.retainCount,
      fullSnapshotCount: settings.injection.retainCount,
      compactOlderSnapshots: false,
      maxMemoryChars: effectivePromptInjectionChars(settings),
      source: settings.memory.source,
      excludeTargetMessage: settings.memory.excludeTargetMessage,
      order: "oldest_to_newest",
      requireSamePreset: settings.memory.requireSamePreset,
      requireSameSwipeWhenAvailable: settings.memory.requireSameSwipeWhenAvailable,
    },
  };
}

async function handlePromptInterceptor(
  messages: LlmMessageDTO[],
  context: unknown,
): Promise<LlmMessageDTO[] | InterceptorResultDTO> {
  if (disposed) return messages;
  if (shouldSkipContextForInternalGeneration(context, internalTrackerGenerationDepth > 0)) {
    const contextUser = contextUserId(context);
    const contextChat = contextChatId(context);
    await recordInterceptorSkipped(contextChat, knownUserForContext(contextUser, contextChat), "Skipped quiet or internal LTracker generation.");
    return messages;
  }

  const contextUser = contextUserId(context);
  const contextChat = contextChatId(context);
  const userId = knownUserForContext(contextUser, contextChat);
  if (!userId) return messages;
  const chatId = await resolveContextChatId(context, userId);
  if (!chatId) return messages;
  rememberActiveChat(userId, chatId);

  try {
    const settings = await getSettings(userId);
    const presetState = await resolveActivePreset(chatId, userId);
    const injectionSettings = {
      ...settings.injection,
      maxInjectedChars: effectivePromptInjectionChars(settings),
    };
    if (!settings.injection.enabled) {
      const result = applyPromptInjection({
        messages: promptMessagesForInjection(messages),
        entries: [],
        settings: injectionSettings,
      });
      await recordInterceptorDiagnostics(chatId, userId, settings, result);
      return messages;
    }

    const memorySettings = injectionMemorySettings(settings);
    const memory = await collectTrackerMemory(chatId, userId, memorySettings, presetState.activePreset);
    const result = applyPromptInjection({
      messages: promptMessagesForInjection(messages),
      entries: memory.entries,
      settings: injectionSettings,
    });
    await recordInterceptorDiagnostics(chatId, userId, settings, result);
    if (result.error) return messages;
    const response: InterceptorResultDTO = {
      messages: ltrackerMessagesFromPrompt(result.messages),
    };
    if (result.breakdown.length > 0) response.breakdown = result.breakdown;
    return response;
  } catch (error) {
    await recordInterceptorSkipped(chatId, userId, "Prompt injection failed safely.", errorMessage(error));
    return messages;
  }
}

async function handlePromptInterceptorFailSafe(
  messages: LlmMessageDTO[],
  context: unknown,
): Promise<LlmMessageDTO[] | InterceptorResultDTO> {
  try {
    const result = await withContextTimeout(handlePromptInterceptor(messages, context), 750);
    if (!result.timedOut) return result.value;
    const contextUser = contextUserId(context);
    const contextChat = contextChatId(context);
    await recordInterceptorSkipped(contextChat, knownUserForContext(contextUser, contextChat), "Prompt injection timed out.");
    return messages;
  } catch (error) {
    spindle.log.warn(`LTracker prompt interceptor failed safely: ${errorMessage(error)}`);
    return messages;
  }
}

async function handleContextInjection(context: unknown): Promise<unknown> {
  return runContextHandlerFailSafe({
    context,
    enabled: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED,
    run: handleContextInjectionEnabled,
    onError: (message) => {
      spindle.log.warn(`LTracker context injection failed safely: ${message}`);
    },
  });
}

async function handleContextInjectionEnabled(context: unknown): Promise<unknown> {
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
      const snapshot = await loadSnapshot(chatId, userId);
      const messageSnapshot = await loadMessageSnapshot(chatId, diagnostics.latestAttachedMessageId, userId);
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
    abortJobsForChat(resolvedChatId, "Manual generation superseded this tracker job.");
  }

  if (trigger.kind === "auto" && hasActiveJobForChat(resolvedChatId)) {
    await markAutoSkipped(
      resolvedChatId,
      userId,
      trigger,
      "A tracker generation is already running for this chat.",
      nowIso(),
    );
    return;
  }
  const jobKey = jobKeyForTrigger(resolvedChatId, trigger);
  if (trigger.kind === "widget") {
    const running = activeJobs.get(jobKey);
    if (running) {
      running.cancelReason = "Widget regeneration was cancelled.";
      running.controller.abort();
      return;
    }
  }

  const existing = activeJobs.get(jobKey);
  const lastCancellation: LTrackerCancellation | null = existing
    ? {
        jobId: existing.jobId,
        requestId: existing.requestId,
        reason: "Cancelled by a newer Generate Tracker request.",
        createdAt: nowIso(),
      }
    : null;
  existing?.controller.abort();

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const job: ActiveJob = {
    controller: new AbortController(),
    chatId: resolvedChatId,
    jobKey,
    jobId: newJobId(),
    requestId,
    sourceKind: trigger.kind,
    startedAt,
  };
  if (trigger.kind === "auto" || trigger.kind === "widget") {
    job.sourceMessageId = trigger.sourceMessageId;
    job.sourceMessageIndex = trigger.sourceMessageIndex;
    job.swipeKey = trigger.swipeKey;
    job.swipeIndex = trigger.swipeIndex;
    job.swipeId = trigger.swipeId;
    job.swipeContentHash = trigger.swipeContentHash;
    job.swipeKeySource = trigger.swipeKeySource;
  }
  activeJobs.set(jobKey, job);

  let diagnostics: LTrackerDiagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    status: "generating" as const,
    lastJobId: job.jobId,
    lastRequestId: requestId,
    lastGenerationSource: trigger.kind,
    lastGenerationStartedAt: startedAt,
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
    lastAutoTriggeredAt: trigger.kind === "auto" ? startedAt : null,
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
      lastSwipeDetectedMessageId: trigger.sourceMessageId,
      lastSwipeKey: trigger.swipeKey,
      lastSwipeKeySource: trigger.swipeKeySource,
      activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId),
    };
  }
  if (trigger.kind === "widget") {
    diagnostics = {
      ...diagnostics,
      lastWidgetRegenerateMessageId: trigger.sourceMessageId,
      lastWidgetRegenerateStartedAt: startedAt,
      lastWidgetRegenerateCompletedAt: null,
      lastWidgetRegenerateDurationMs: null,
      lastWidgetRegenerateCancelledAt: null,
      lastWidgetRegenerateError: null,
      activeWidgetRegenerationCount: 1,
      lastSwipeDetectedMessageId: trigger.sourceMessageId,
      lastSwipeKey: trigger.swipeKey,
      lastSwipeKeySource: trigger.swipeKeySource,
      activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId),
    };
  }

  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, "generating", null, requestId);

  try {
    stage = "read_messages";
    const rawMessages = await getMessagesForTrigger(resolvedChatId, settings, trigger);
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
    const transcript = buildCompactTranscript(
      transcriptMessages,
      effectivePerMessageChars(settings),
      effectiveRecentTranscriptChars(settings),
    );
    const memory = settings.memory.enabled && settings.memory.includeInTrackerGeneration
      ? await collectTrackerMemory(resolvedChatId, userId, settings, presetState.activePreset, trigger)
      : {
          entries: [],
          renderedText: "",
          totalChars: 0,
          truncated: false,
          skippedReason: settings.memory.enabled
            ? "Tracker memory is not included in tracker generation."
            : "Tracker memory is disabled.",
        } satisfies TrackerMemoryResult;
    const promptMessages: LlmMessageDTO[] = buildTrackerPrompt(
      transcript,
      presetState.activePreset,
      memory.renderedText ? memory : null,
    );
    diagnostics = {
      ...diagnostics,
      lastPromptUsedPresetId: presetState.activePreset.id,
      lastPromptUsedPresetName: presetState.activePreset.name,
      lastMemoryEntryCount: memory.entries.length,
      lastMemoryChars: memory.totalChars,
      lastMemoryTruncated: memory.truncated,
      lastMemorySourceSummary: trackerMemorySourceSummary(memory.entries),
      lastMemorySkippedReason: memory.skippedReason,
      lastPromptIncludedMemory: Boolean(memory.renderedText),
      estimatedMemoryTokensLastRun: estimateTokensFromChars(memory.totalChars),
      lastPromptPreview: settings.savePromptPreview
        ? promptPreview(promptMessages, effectivePromptPreviewChars(settings))
        : "[Prompt preview saving disabled]",
    };
    diagnostics = {
      ...diagnostics,
      estimatedPromptTokensLastRun: settings.savePromptPreview
        ? estimateTokensFromChars((diagnostics.lastPromptPreview ?? "").length)
        : null,
    };
    await tryPersistDiagnostics(diagnostics, userId);

    stage = "generation";
    const generation = await runTrackerGeneration(promptMessages, userId, settings, job.controller.signal);
    const rawOutput = generation.text;
    if (!isCurrentJob(jobKey, job.jobId)) return;

    diagnostics = {
      ...diagnostics,
      lastRawOutput: settings.saveRawOutput
        ? rawOutput.slice(0, settings.budget.rawOutputMaxChars)
        : "[Raw output saving disabled]",
      lastGenerationConnectionModeUsed: generation.requestDiagnostics.modeUsed,
      lastGenerationConnectionIdUsed: generation.requestDiagnostics.connectionIdUsed,
      lastGenerationConnectionNameUsed: generation.requestDiagnostics.connectionNameUsed,
      lastGenerationConnectionFallbackReason: generation.requestDiagnostics.fallbackReason,
      lastGenerationParametersUsed: generation.requestDiagnostics.parametersUsed,
      lastReasoningOverrideUsed: generation.requestDiagnostics.reasoningOverrideUsed,
    };

    stage = "parse";
    const data = parseTrackerJson(rawOutput);
    if (!isCurrentJob(jobKey, job.jobId)) return;

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
      if (isCurrentJob(jobKey, job.jobId)) activeJobs.delete(jobKey);
      diagnostics = {
        ...diagnostics,
        activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId),
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
      presetId: presetState.activePreset.id,
      presetName: presetState.activePreset.name,
      presetVersion: presetState.activePreset.version,
      generationStartedAt: startedAt,
      generationCompletedAt: completedAt,
      generationDurationMs: completedAtMs - startedAtMs,
      generationCancelledAt: null,
      generationStatus: "completed",
      data,
    };

    stage = "storage";
    if (trigger.kind !== "widget") {
      await saveSnapshot(snapshot, userId);
    }

    diagnostics = {
      ...diagnostics,
      status: "idle",
      lastGenerationCompletedAt: completedAt,
      lastGenerationDurationMs: completedAtMs - startedAtMs,
      lastParsedTracker: data,
      lastError: null,
    };

    if ((trigger.kind === "auto" && settings.auto.attachSnapshotToMessage) || trigger.kind === "widget") {
      const attachedAt = nowIso();
      const storageKey = messageSnapshotPath(resolvedChatId, trigger.sourceMessageId, trigger.swipeKey);
      const attachedSnapshot: MessageAttachedSnapshot = {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        extensionVersion: EXTENSION_VERSION,
        chatId: resolvedChatId,
        messageId: trigger.sourceMessageId,
        messageIndex: trigger.sourceMessageIndex,
        swipeKey: trigger.swipeKey,
        swipeIndex: trigger.swipeIndex,
        swipeId: trigger.swipeId,
        swipeContentHash: trigger.swipeContentHash,
        swipeKeySource: trigger.swipeKeySource,
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name,
        presetVersion: presetState.activePreset.version,
        trigger,
        snapshot,
        attachedAt,
      };
      let embeddedTagWriteAt: string | null = null;
      const index = shouldSaveSidecarSnapshot(settings)
        ? await saveMessageAttachedSnapshotWithIndex(attachedSnapshot, userId)
        : await loadMessageSnapshotIndex(resolvedChatId, userId);
      if (shouldWriteEmbeddedTrackerTag(settings)) {
        try {
          await writeEmbeddedTrackerTag(attachedSnapshot, userId);
          embeddedTagWriteAt = nowIso();
        } catch (error) {
          diagnostics = {
            ...diagnostics,
            lastEmbeddedTagError: errorMessage(error),
          };
        }
      }
      diagnostics = {
        ...diagnostics,
        latestAttachedMessageId: trigger.sourceMessageId,
        latestAttachedMessageIndex: trigger.sourceMessageIndex,
        latestAttachedSnapshotAt: attachedAt,
        latestAttachedSnapshotStorageKey: shouldSaveSidecarSnapshot(settings) ? storageKey : null,
        messageSnapshotIndexCount: index.length,
        swipeTrackerIndexCount: index.length,
        lastSwipeDetectedMessageId: trigger.sourceMessageId,
        lastSwipeKey: trigger.swipeKey,
        lastSwipeKeySource: trigger.swipeKeySource,
        lastEmbeddedTagWriteAt: embeddedTagWriteAt ?? diagnostics.lastEmbeddedTagWriteAt,
        lastEmbeddedTagWriteMessageId: shouldWriteEmbeddedTrackerTag(settings) ? trigger.sourceMessageId : diagnostics.lastEmbeddedTagWriteMessageId,
        lastEmbeddedTagWriteSwipeKey: shouldWriteEmbeddedTrackerTag(settings) ? trigger.swipeKey : diagnostics.lastEmbeddedTagWriteSwipeKey,
        activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId),
      };
      if (trigger.kind === "widget") {
        diagnostics = {
          ...diagnostics,
          lastWidgetRegenerateMessageId: trigger.sourceMessageId,
          lastWidgetRegenerateCompletedAt: completedAt,
          lastWidgetRegenerateDurationMs: completedAtMs - startedAtMs,
          lastWidgetRegenerateCancelledAt: null,
          lastWidgetRegenerateError: null,
          activeWidgetRegenerationCount: 0,
          activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId),
        };
      }
    }

    if (isCurrentJob(jobKey, job.jobId)) activeJobs.delete(jobKey);
    diagnostics = {
      ...diagnostics,
      activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId),
    };
    await persistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId);
  } catch (error) {
    if (!isCurrentJob(jobKey, job.jobId)) return;
    if (job.controller.signal.aborted && job.cancelReason) {
      const completedAtMs = Date.now();
      const cancelledAt = new Date(completedAtMs).toISOString();
      diagnostics = {
        ...diagnostics,
        status: "idle",
        lastGenerationCompletedAt: cancelledAt,
        lastGenerationDurationMs: completedAtMs - startedAtMs,
        lastCancellation: {
          jobId: job.jobId,
          requestId,
          reason: job.cancelReason,
          createdAt: cancelledAt,
        },
        lastError: null,
      };
      if (trigger.kind === "auto") {
        diagnostics = {
          ...diagnostics,
          lastAutoSkippedReason: job.cancelReason,
        };
      }
      if (trigger.kind === "widget") {
        diagnostics = {
          ...diagnostics,
          lastWidgetRegenerateMessageId: trigger.sourceMessageId,
          lastWidgetRegenerateCompletedAt: null,
          lastWidgetRegenerateDurationMs: completedAtMs - startedAtMs,
          lastWidgetRegenerateCancelledAt: cancelledAt,
          lastWidgetRegenerateError: null,
          activeWidgetRegenerationCount: 0,
          activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId),
        };
      }
      if (isCurrentJob(jobKey, job.jobId)) activeJobs.delete(jobKey);
      diagnostics = {
        ...diagnostics,
        activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId),
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
    if (trigger.kind === "widget") {
      diagnostics = {
        ...diagnostics,
        lastWidgetRegenerateMessageId: trigger.sourceMessageId,
        lastWidgetRegenerateCompletedAt: new Date(completedAtMs).toISOString(),
        lastWidgetRegenerateDurationMs: completedAtMs - startedAtMs,
        lastWidgetRegenerateCancelledAt: null,
        lastWidgetRegenerateError: currentError.message,
        activeWidgetRegenerationCount: 0,
        activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId),
      };
    }
    if (isCurrentJob(jobKey, job.jobId)) activeJobs.delete(jobKey);
    diagnostics = {
      ...diagnostics,
      activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId),
    };
    await tryPersistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "error", currentError, requestId);
  } finally {
    if (isCurrentJob(jobKey, job.jobId)) activeJobs.delete(jobKey);
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

function textLength(value: string): number {
  return Array.from(value).length;
}

async function renderTemplatePreview(
  chatId: string | null,
  userId: string,
  requestId: string,
  requestedSource?: LTrackerRenderSource,
): Promise<void> {
  const resolvedChatId = await resolveActiveChatId(chatId, userId).catch((error: unknown) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);

  try {
    const settings = await getSettings(userId);
    const source = requestedSource ?? settings.renderer.previewSource;
    const diagnostics = await loadDiagnostics(resolvedChatId, userId);
    const presetState = await resolveActivePreset(resolvedChatId, userId);
    const snapshotSource = source === "latest_message_snapshot"
      ? await loadMessageSnapshot(resolvedChatId, diagnostics.latestAttachedMessageId, userId)
      : await loadSnapshot(resolvedChatId, userId);
    const snapshot = snapshotSource && "snapshot" in snapshotSource
      ? snapshotSource.snapshot
      : snapshotSource;

    if (!snapshot) {
      const preview: RenderedTrackerPreview = {
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name,
        snapshotCreatedAt: null,
        source,
        status: "no_snapshot",
        html: "",
        textFallback: "No tracker snapshot is available for the selected preview source.",
        warnings: [],
        errors: ["No tracker snapshot is available for the selected preview source."],
      };
      const updatedDiagnostics: LTrackerDiagnostics = {
        ...diagnostics,
        lastRenderAt: nowIso(),
        lastRenderPresetId: preview.presetId,
        lastRenderPresetName: preview.presetName,
        lastRenderSnapshotCreatedAt: null,
        lastRenderSource: source,
        lastRenderStatus: preview.status,
        lastRenderWarnings: preview.warnings,
        lastRenderErrors: preview.errors,
        lastSanitizedHtmlChars: 0,
        lastFallbackTextChars: textLength(preview.textFallback),
      };
      await persistDiagnostics(updatedDiagnostics, userId);
      await sendState(resolvedChatId, userId, "idle", null, requestId, preview);
      return;
    }

    const template = presetState.activePreset.htmlTemplate ?? "";
    const fallback = formatTemplateTextFallback(snapshot.data);
    let preview: RenderedTrackerPreview;
    if (!settings.renderer.enabled) {
      preview = {
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name,
        snapshotCreatedAt: snapshot.createdAt,
        source,
        status: "fallback",
        html: "",
        textFallback: fallback,
        warnings: ["Renderer preview is disabled in settings; showing text fallback."],
        errors: [],
      };
    } else {
      const result = renderHtmlTemplate({
        template,
        snapshotData: snapshot.data,
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name,
      }, {
        missingValuePlaceholder: settings.renderer.missingValuePlaceholder,
        maxRenderedChars: settings.renderer.maxRenderedChars,
        allowInlineStyles: settings.renderer.allowInlineStyles,
      });
      const status: LTrackerRenderStatus = !template.trim()
        ? "no_template"
        : result.ok ? "rendered" : "error";
      preview = {
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name,
        snapshotCreatedAt: snapshot.createdAt,
        source,
        status,
        html: result.html,
        textFallback: result.textFallback,
        warnings: result.warnings,
        errors: result.errors,
      };
    }

    const updatedDiagnostics: LTrackerDiagnostics = {
      ...diagnostics,
      lastRenderAt: nowIso(),
      lastRenderPresetId: preview.presetId,
      lastRenderPresetName: preview.presetName,
      lastRenderSnapshotCreatedAt: preview.snapshotCreatedAt,
      lastRenderSource: source,
      lastRenderStatus: preview.status,
      lastRenderWarnings: preview.warnings,
      lastRenderErrors: preview.errors,
      lastSanitizedHtmlChars: textLength(preview.html),
      lastFallbackTextChars: textLength(preview.textFallback),
    };
    await persistDiagnostics(updatedDiagnostics, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId, preview);
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

async function handleConnectionRefresh(
  payload: Extract<FrontendMessage, { type: "refresh_connections" }>,
  userId: string,
): Promise<void> {
  const resolvedChatId = payload.chatId
    ? payload.chatId
    : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  try {
    await refreshConnectionProfiles(userId, resolvedChatId);
  } catch (error) {
    spindle.log.warn(`LTracker connection refresh failed: ${errorMessage(error)}`);
  }
  await sendState(resolvedChatId, userId, undefined, null, payload.requestId);
}

async function testTrackerConnection(
  payload: Extract<FrontendMessage, { type: "test_tracker_connection" }>,
  userId: string,
): Promise<void> {
  const resolvedChatId = payload.chatId
    ? payload.chatId
    : await resolveActiveChatId(payload.chatId, userId).catch(() => activeChatByUser.get(userId) ?? null);
  rememberActiveChat(userId, resolvedChatId);
  const existing = connectionTestJobs.get(userId);
  existing?.controller.abort();

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const job: ConnectionTestJob = {
    controller: new AbortController(),
    requestId: payload.requestId,
    startedAtMs,
  };
  connectionTestJobs.set(userId, job);

  const settings = payload.settings ? await saveSettings(payload.settings, userId) : await getSettings(userId);
  let diagnostics: LTrackerDiagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    lastConnectionTestAt: startedAt,
    lastConnectionTestStatus: "running",
    lastConnectionTestDurationMs: null,
    lastConnectionTestError: null,
    lastConnectionTestOutputPreview: null,
    lastConnectionTestFinishReason: null,
    lastConnectionTestUsage: null,
    connectionMode: settings.connection.mode,
    selectedConnectionId: settings.connection.selectedConnectionId,
    selectedConnectionName: settings.connection.selectedConnectionName,
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, undefined, null, payload.requestId);

  try {
    const prompt = settings.connection.testPrompt.trim() || TRACKER_CONNECTION_DEFAULT_TEST_PROMPT;
    const generation = await runTrackerGeneration([
      {
        role: "user",
        content: prompt,
      },
    ] as LlmMessageDTO[], userId, settings, job.controller.signal);
    if (connectionTestJobs.get(userId) !== job) return;
    const completedAtMs = Date.now();
    diagnostics = {
      ...diagnostics,
      lastConnectionTestAt: new Date(completedAtMs).toISOString(),
      lastConnectionTestStatus: "success",
      lastConnectionTestDurationMs: completedAtMs - startedAtMs,
      lastConnectionTestError: null,
      lastConnectionTestOutputPreview: generation.text.slice(0, 500),
      lastConnectionTestFinishReason: generationFinishReason(generation.response),
      lastConnectionTestUsage: generationUsage(generation.response),
      lastGenerationConnectionModeUsed: generation.requestDiagnostics.modeUsed,
      lastGenerationConnectionIdUsed: generation.requestDiagnostics.connectionIdUsed,
      lastGenerationConnectionNameUsed: generation.requestDiagnostics.connectionNameUsed,
      lastGenerationConnectionFallbackReason: generation.requestDiagnostics.fallbackReason,
      lastGenerationParametersUsed: generation.requestDiagnostics.parametersUsed,
      lastReasoningOverrideUsed: generation.requestDiagnostics.reasoningOverrideUsed,
    };
    await tryPersistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, undefined, null, payload.requestId);
  } catch (error) {
    if (connectionTestJobs.get(userId) !== job) return;
    const completedAtMs = Date.now();
    const cancelled = job.controller.signal.aborted;
    diagnostics = {
      ...diagnostics,
      lastConnectionTestAt: new Date(completedAtMs).toISOString(),
      lastConnectionTestStatus: cancelled ? "cancelled" : "error",
      lastConnectionTestDurationMs: completedAtMs - startedAtMs,
      lastConnectionTestError: cancelled ? null : errorMessage(error),
    };
    await tryPersistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, undefined, null, payload.requestId);
  } finally {
    if (connectionTestJobs.get(userId) === job) connectionTestJobs.delete(userId);
  }
}

async function cancelConnectionTest(
  payload: Extract<FrontendMessage, { type: "cancel_connection_test" }>,
  userId: string,
): Promise<void> {
  const resolvedChatId = payload.chatId
    ? payload.chatId
    : await resolveActiveChatId(payload.chatId, userId).catch(() => activeChatByUser.get(userId) ?? null);
  rememberActiveChat(userId, resolvedChatId);
  const job = connectionTestJobs.get(userId);
  if (job) job.controller.abort();
  await sendState(resolvedChatId, userId, undefined, null, payload.requestId);
}

async function regenerateMessageTracker(
  payload: Extract<FrontendMessage, { type: "generate_message_tracker" | "regenerate_message_tracker" }>,
  userId: string,
): Promise<void> {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error: unknown) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const messages = await readChatMessages(resolvedChatId);
  const message = messages.find((item) => item.id === payload.messageId);
  if (!message) {
    throw new LTrackerStageError("read_messages", "The selected message was not found for regeneration.");
  }
  if (message.is_user) {
    throw new LTrackerStageError("read_messages", "Message tracker regeneration is only available for assistant messages.");
  }
  await generateTracker(resolvedChatId, userId, createWidgetTrigger({
    requestId: payload.requestId,
    message,
    swipeKey: payload.swipeKey ?? null,
  }));
}

async function deleteMessageTracker(
  payload: Extract<FrontendMessage, { type: "delete_message_tracker" }>,
  userId: string,
): Promise<void> {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error: unknown) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const path = messageSnapshotPath(resolvedChatId, payload.messageId, payload.swipeKey);
  if (await spindle.userStorage.exists(path, userId)) {
    await spindle.userStorage.delete(path, userId);
  }
  if (payload.swipeKey === DEFAULT_SWIPE_KEY) {
    const legacyPath = legacyMessageSnapshotPath(resolvedChatId, payload.messageId);
    if (await spindle.userStorage.exists(legacyPath, userId)) {
      await spindle.userStorage.delete(legacyPath, userId);
    }
  }
  const index = await loadMessageSnapshotIndex(resolvedChatId, userId);
  const nextIndex = removeMessageSnapshotIndexEntry(index, payload.messageId, payload.swipeKey);
  await saveMessageSnapshotIndex(resolvedChatId, nextIndex, userId);
  const settings = await getSettings(userId);
  if (shouldWriteEmbeddedTrackerTag(settings)) {
    try {
      await removeEmbeddedTrackerTag(resolvedChatId, payload.messageId, payload.swipeKey, userId);
    } catch (error) {
      await tryPersistDiagnostics({
        ...await loadDiagnostics(resolvedChatId, userId),
        lastEmbeddedTagError: errorMessage(error),
      }, userId);
    }
  }
  const diagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    lastDeletedTrackerMessageId: payload.messageId,
    lastDeletedTrackerSwipeKey: payload.swipeKey,
    messageSnapshotIndexCount: nextIndex.length,
    swipeTrackerIndexCount: nextIndex.length,
    lastError: null,
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}

async function cleanupDuplicateHistory(
  payload: Extract<FrontendMessage, { type: "cleanup_duplicate_history" }>,
  userId: string,
): Promise<void> {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error: unknown) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const index = await loadMessageSnapshotIndex(resolvedChatId, userId);
  const repaired = repairMessageSnapshotIndex(index);
  await saveMessageSnapshotIndex(resolvedChatId, repaired, userId);
  const diagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    lastHistoryCleanupAt: nowIso(),
    lastHistoryGroupedCount: repaired.length,
    lastHistoryDuplicateCount: Math.max(0, index.length - repaired.length),
    messageSnapshotIndexCount: repaired.length,
    swipeTrackerIndexCount: repaired.length,
    lastError: null,
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}

async function saveEditedMessageTracker(
  payload: Extract<FrontendMessage, { type: "save_edited_message_tracker" }>,
  userId: string,
): Promise<void> {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error: unknown) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const existing = await loadMessageSnapshot(resolvedChatId, payload.messageId, userId, payload.swipeKey);
  if (!existing) {
    throw new LTrackerStageError("storage", "No tracker snapshot exists for this message swipe.");
  }
  const parsed = parseTrackerJson(payload.jsonText);
  const editedAt = nowIso();
  const edited: MessageAttachedSnapshot = {
    ...existing,
    extensionVersion: EXTENSION_VERSION,
    attachedAt: editedAt,
    snapshot: {
      ...existing.snapshot,
      extensionVersion: EXTENSION_VERSION,
      data: parsed,
      editedAt,
      editedByUser: true,
    },
  };
  const index = await saveMessageAttachedSnapshotWithIndex(edited, userId);
  const settings = await getSettings(userId);
  if (shouldWriteEmbeddedTrackerTag(settings)) {
    try {
      await writeEmbeddedTrackerTag(edited, userId);
    } catch (error) {
      await tryPersistDiagnostics({
        ...await loadDiagnostics(resolvedChatId, userId),
        lastEmbeddedTagError: errorMessage(error),
      }, userId);
    }
  }
  const diagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    lastEditedTrackerMessageId: payload.messageId,
    lastEditedTrackerSwipeKey: payload.swipeKey,
    latestAttachedMessageId: payload.messageId,
    latestAttachedMessageIndex: existing.messageIndex,
    latestAttachedSnapshotAt: editedAt,
    latestAttachedSnapshotStorageKey: messageSnapshotPath(resolvedChatId, payload.messageId, payload.swipeKey),
    messageSnapshotIndexCount: index.length,
    swipeTrackerIndexCount: index.length,
    lastParsedTracker: parsed,
    lastError: null,
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}

async function cancelTrackerGeneration(
  payload: Extract<FrontendMessage, { type: "cancel_tracker_generation" }>,
  userId: string,
): Promise<void> {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error: unknown) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const job = [...activeJobs.values()].find((item) => {
    if (payload.jobId && item.jobId === payload.jobId) return true;
    return Boolean(payload.messageId && payload.swipeKey && item.sourceMessageId === payload.messageId && item.swipeKey === payload.swipeKey);
  });
  if (!job || job.chatId !== resolvedChatId) {
    await sendState(resolvedChatId, userId, undefined, null, payload.requestId);
    return;
  }
  job.cancelReason = job.sourceKind === "widget"
    ? "Widget regeneration was cancelled."
    : "Tracker generation was cancelled.";
  job.controller.abort();
  await sendState(resolvedChatId, userId, "generating", null, payload.requestId);
}

async function handleEmbeddedTrackerTagIntercepted(
  payload: Extract<FrontendMessage, { type: "embedded_tracker_tag_intercepted" }>,
  userId: string,
): Promise<void> {
  if (payload.isStreaming) return;
  const resolvedChatId = payload.chatId
    ? payload.chatId
    : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  const messageId = payload.messageId;
  const swipeKey = payload.swipeKey || DEFAULT_SWIPE_KEY;
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = parseTrackerJson(payload.jsonText);
  } catch (error) {
    if (resolvedChatId) {
      await tryPersistDiagnostics({
        ...await loadDiagnostics(resolvedChatId, userId),
        lastTagInterceptAt: nowIso(),
        lastTagInterceptMessageId: messageId,
        lastTagInterceptSwipeKey: swipeKey,
        lastTagInterceptError: errorMessage(error),
      }, userId);
    }
    return;
  }
  if (!resolvedChatId || !messageId) return;
  const settings = await getSettings(userId);
  const presetState = await resolveActivePreset(resolvedChatId, userId);
  let index = await loadMessageSnapshotIndex(resolvedChatId, userId);
  if (settings.messageDisplay.attachmentMode === "both") {
    const attachedAt = nowIso();
    const attachedSnapshot: MessageAttachedSnapshot = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      extensionVersion: EXTENSION_VERSION,
      chatId: resolvedChatId,
      messageId,
      messageIndex: null,
      swipeKey,
      swipeIndex: null,
      swipeId: null,
      swipeContentHash: null,
      swipeKeySource: "unknown",
      presetId: presetState.activePreset.id,
      presetName: presetState.activePreset.name,
      presetVersion: presetState.activePreset.version,
      trigger: {
        kind: "widget",
        requestId: payload.requestId,
        sourceMessageId: messageId,
        sourceMessageIndex: null,
        swipeKey,
        swipeIndex: null,
        swipeId: null,
        swipeContentHash: null,
        swipeKeySource: "unknown",
      },
      snapshot: {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        extensionVersion: EXTENSION_VERSION,
        chatId: resolvedChatId,
        createdAt: attachedAt,
        messageCount: 1,
        sourceMessageIds: [messageId],
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name,
        presetVersion: presetState.activePreset.version,
        data: parsed,
      },
      attachedAt,
    };
    index = await saveMessageAttachedSnapshotWithIndex(attachedSnapshot, userId);
  }
  await tryPersistDiagnostics({
    ...await loadDiagnostics(resolvedChatId, userId),
    lastTagInterceptAt: nowIso(),
    lastTagInterceptMessageId: messageId,
    lastTagInterceptSwipeKey: swipeKey,
    lastTagInterceptError: null,
    messageSnapshotIndexCount: index.length,
    swipeTrackerIndexCount: index.length,
  }, userId);
}

function disposeBackend(): void {
  if (disposed) return;
  disposed = true;
  for (const pending of pendingAutoJobs.values()) clearTimeout(pending.timer);
  pendingAutoJobs.clear();
  for (const pending of pendingAutoFinalizations.values()) clearTimeout(pending.timer);
  pendingAutoFinalizations.clear();
  for (const job of activeJobs.values()) job.controller.abort();
  activeJobs.clear();
  for (const job of connectionTestJobs.values()) job.controller.abort();
  connectionTestJobs.clear();
  for (const cleanup of eventCleanups.splice(0).reverse()) cleanup();
  autoSubscriptionsActive = false;
  contextHandlerRegistered = false;
  interceptorRegistered = false;
}

function registerEventListeners(): void {
  eventCleanups.push(spindle.on("GENERATION_STARTED", (payload, userId) => {
    void handleGenerationStarted(payload, userId).catch((error: unknown) => {
      spindle.log.warn(`LTracker generation-started handler failed: ${errorMessage(error)}`);
    });
  }));
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
  eventCleanups.push(spindle.on("MESSAGE_SWIPED", (payload, userId) => {
    void handleMessageSwiped(payload, userId).catch((error: unknown) => {
      spindle.log.warn(`LTracker message-swiped handler failed: ${errorMessage(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("SWIPE_EDITED", (payload, userId) => {
    void handleSwipeEdited(payload, userId).catch((error: unknown) => {
      spindle.log.warn(`LTracker swipe-edited handler failed: ${errorMessage(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("CHAT_SWITCHED", handleChatSwitched));
  eventCleanups.push(spindle.on("EXTENSION_UNLOADED", disposeBackend));
  autoSubscriptionsActive = true;
}

function registerContextInjection(): void {
  if (contextHandlerRegistered) return;
  if (!CONTEXT_HANDLER_EXPERIMENTAL_ENABLED) {
    spindle.log.warn(CONTEXT_HANDLER_DISABLED_REASON);
    return;
  }
  spindle.log.warn("LTracker context injection stayed disabled because no verified Lumiverse context handler DTO is available.");
}

function registerSafePromptInterceptor(): void {
  if (interceptorRegistered) return;
  if (!spindle.permissions.has("interceptor")) {
    spindle.log.warn("LTracker prompt injection is unavailable until the interceptor permission is granted.");
    return;
  }
  if (!spindle.registerInterceptor) {
    spindle.log.warn("LTracker prompt injection is unavailable because registerInterceptor is missing.");
    return;
  }
  spindle.registerInterceptor(async (messages, context) => handlePromptInterceptorFailSafe(messages, context), 0);
  interceptorRegistered = true;
}

registerEventListeners();
registerSafePromptInterceptor();
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
      if (payload.type === "refresh_connections") {
        await handleConnectionRefresh(payload, userId);
        return;
      }
      if (payload.type === "test_tracker_connection") {
        await testTrackerConnection(payload, userId);
        return;
      }
      if (payload.type === "cancel_connection_test") {
        await cancelConnectionTest(payload, userId);
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
      if (payload.type === "render_template") {
        await renderTemplatePreview(chatId, userId, payload.requestId, payload.source);
        return;
      }
      if (payload.type === "generate_message_tracker") {
        await regenerateMessageTracker(payload, userId);
        return;
      }
      if (payload.type === "regenerate_message_tracker") {
        await regenerateMessageTracker(payload, userId);
        return;
      }
      if (payload.type === "cancel_tracker_generation") {
        await cancelTrackerGeneration(payload, userId);
        return;
      }
      if (payload.type === "delete_message_tracker") {
        await deleteMessageTracker(payload, userId);
        return;
      }
      if (payload.type === "cleanup_duplicate_history") {
        await cleanupDuplicateHistory(payload, userId);
        return;
      }
      if (payload.type === "save_edited_message_tracker") {
        await saveEditedMessageTracker(payload, userId);
        return;
      }
      if (payload.type === "embedded_tracker_tag_intercepted") {
        await handleEmbeddedTrackerTagIntercepted(payload, userId);
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
