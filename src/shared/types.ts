export const EXTENSION_VERSION = "0.12";
export const STORAGE_SCHEMA_VERSION = 1;
export const SETTINGS_SCHEMA_VERSION = 1;
export const SPINDLE_TYPES_VERSION = "0.5.21";

export type TrackerStatus = "idle" | "generating" | "error";
export type TranscriptRole = "user" | "assistant";
export type TrackerGenerationSourceKind = "manual" | "auto" | "widget";
export type AutoTriggerEventType = "GENERATION_ENDED" | "MESSAGE_SENT";
export type LTrackerInjectionMode = "latest_chat_snapshot" | "latest_message_snapshot";
export type LTrackerInjectionFormat = "compact" | "pretty_json" | "minimal";
export type LTrackerRenderSource = "latest_chat_snapshot" | "latest_message_snapshot";
export type LTrackerRenderStatus = "rendered" | "fallback" | "no_template" | "no_snapshot" | "error";
export type LTrackerMessageDisplayPlacement = "top" | "bottom";
export type LTrackerMessageDisplaySource = "message_attached_snapshot" | "latest_chat_snapshot";
export type LTrackerMessageDisplayRenderMode = "html_template" | "compact_text" | "pretty_json";
export type LTrackerMessageDisplayDisplayMode = "inline_full" | "inline_button_popover" | "drawer_history_only";
export type LTrackerMessageAttachmentMode = "sidecar_snapshot" | "embedded_tracker_tag" | "both";
export type LTrackerMessageControlDensity = "compact" | "comfortable";
export type LTrackerMessageControlPlacement = "message_header" | "inside_tracker_header";
export type LTrackerMessageControlGenerationStatus = "idle" | "generating" | "completed" | "cancelled" | "failed";
export type LTrackerInlineAction = "generate" | "regenerate" | "cancel" | "edit" | "delete" | "toggle";
export type LTrackerMessageDisplayMode = "dom_injection" | "message_widget" | "drawer_history" | "disabled";
export type LTrackerMessageWidgetPlacementResolved = "top" | "bottom" | "host_default" | "unsupported";
export type LTrackerMessageDisplayRenderer = "dom_injection" | "iframe_widget" | "drawer_history";
export type LTrackerMountPointStrategy = "official_message_body" | "official_message_element" | "bubble_adapter" | "widget_fallback" | "drawer_only";
export type SwipeKeySource = "swipe_id" | "swipe_index" | "content_hash" | "unknown";
export type TrackerPresetOrigin = "built_in" | "user_imported" | "user_created";
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

export interface TrackerPresetCapabilities {
  supportsHtmlTemplate?: boolean;
  supportsPartialRegeneration?: boolean;
  supportsSequentialGeneration?: boolean;
}

export interface TrackerSchemaPreset {
  id: string;
  name: string;
  description: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  jsonSchema: Record<string, unknown>;
  promptInstructions: string;
  htmlTemplate?: string;
  notes?: string;
  origin: TrackerPresetOrigin;
  capabilities?: TrackerPresetCapabilities;
}

export interface TrackerPresetDraft {
  id?: string;
  name: string;
  description: string;
  version: string;
  jsonSchema: Record<string, unknown>;
  promptInstructions: string;
  htmlTemplate?: string;
  notes?: string;
  capabilities?: TrackerPresetCapabilities;
}

export interface ActiveTrackerPresetState {
  selectedPresetId: string;
  selectedAt: string;
}

export interface TrackerPresetExportEnvelope {
  kind: "ltracker_schema_preset";
  formatVersion: 1;
  preset: TrackerSchemaPreset;
}

export interface TrackerSnapshot {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  extensionVersion: string;
  chatId: string;
  createdAt: string;
  messageCount: number;
  sourceMessageIds: string[];
  presetId: string | null;
  presetName: string | null;
  presetVersion: string | null;
  generationStartedAt?: string | null;
  generationCompletedAt?: string | null;
  generationDurationMs?: number | null;
  generationCancelledAt?: string | null;
  generationStatus?: "completed" | "cancelled" | "failed" | null;
  editedAt?: string | null;
  editedByUser?: boolean;
  data: Record<string, unknown>;
}

export interface SwipeTrackerIdentity {
  chatId: string;
  messageId: string;
  swipeKey: string;
  swipeIndex: number | null;
  swipeId: string | null;
  swipeContentHash: string | null;
  swipeKeySource: SwipeKeySource;
}

export interface ManualTrackerTriggerSource {
  kind: "manual";
  requestId: string;
}

export interface AutoTrackerTriggerSource {
  kind: "auto";
  requestId: string;
  eventType: AutoTriggerEventType;
  sourceMessageId: string;
  sourceMessageIndex: number | null;
  generationId: string | null;
  generationType: string | null;
  swipeKey: string;
  swipeIndex: number | null;
  swipeId: string | null;
  swipeContentHash: string | null;
  swipeKeySource: SwipeKeySource;
}

export interface WidgetTrackerTriggerSource {
  kind: "widget";
  requestId: string;
  sourceMessageId: string;
  sourceMessageIndex: number | null;
  swipeKey: string;
  swipeIndex: number | null;
  swipeId: string | null;
  swipeContentHash: string | null;
  swipeKeySource: SwipeKeySource;
}

export type TrackerTriggerSource = ManualTrackerTriggerSource | AutoTrackerTriggerSource | WidgetTrackerTriggerSource;

export interface MessageAttachedSnapshot {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  extensionVersion: string;
  chatId: string;
  messageId: string;
  messageIndex: number | null;
  swipeKey: string;
  swipeIndex: number | null;
  swipeId: string | null;
  swipeContentHash: string | null;
  swipeKeySource: SwipeKeySource;
  presetId: string | null;
  presetName: string | null;
  presetVersion: string | null;
  trigger: AutoTrackerTriggerSource | WidgetTrackerTriggerSource;
  snapshot: TrackerSnapshot;
  attachedAt: string;
}

export interface MessageSnapshotIndexEntry {
  messageId: string;
  messageIndex: number | null;
  swipeKey: string;
  swipeIndex: number | null;
  swipeId: string | null;
  swipeContentHash: string | null;
  swipeKeySource: SwipeKeySource;
  createdAt: string;
  presetId: string | null;
  presetName: string | null;
  storageKey: string;
}

export interface LTrackerAutoSettings {
  autoModeEnabled: boolean;
  autoDebounceMs: number;
  skipFirstMessages: number;
  triggerAfterAssistantMessages: boolean;
  triggerAfterUserMessages: boolean;
  attachSnapshotToMessage: boolean;
  onlyWhenChatActive: boolean;
}

export interface LTrackerInjectionSettings {
  enabled: boolean;
  mode: LTrackerInjectionMode;
  format: LTrackerInjectionFormat;
  maxInjectedChars: number;
  includeHeader: boolean;
  includeTimestamp: boolean;
  includeSourceMessageId: boolean;
  onlyInjectWhenSnapshotExists: boolean;
}

export interface LTrackerRendererSettings {
  enabled: boolean;
  previewSource: LTrackerRenderSource;
  missingValuePlaceholder: string;
  maxRenderedChars: number;
  allowInlineStyles: boolean;
}

export interface LTrackerMessageDisplaySettings {
  enabled: boolean;
  useDomInjection: boolean;
  fallbackToIframeWidget: boolean;
  attachmentMode: LTrackerMessageAttachmentMode;
  displayMode: LTrackerMessageDisplayDisplayMode;
  placement: LTrackerMessageDisplayPlacement;
  source: LTrackerMessageDisplaySource;
  renderMode: LTrackerMessageDisplayRenderMode;
  allowInlineStyles: boolean;
  deduplicateRenderWarnings: boolean;
  showRenderWarningsInDiagnosticsOnly: boolean;
  showDebugSwipeKey: boolean;
  showGenerateButtonForMissingTracker: boolean;
  controlDensity: LTrackerMessageControlDensity;
  controlPlacement: LTrackerMessageControlPlacement;
  showExpandedHeaderActions: boolean;
  showBottomActionsInInlineTracker: boolean;
  collapsedByDefault: boolean;
  compactCollapsedHeader: boolean;
  showTimestamp: boolean;
  showPresetName: boolean;
  showDebugCopyButtonsInHistory: boolean;
  showWidgetRegenerateButton: boolean;
  showEditButton: boolean;
  showDeleteButton: boolean;
  showNoTrackerForSwipe: boolean;
  showGenerationDuration: boolean;
  minimizedMaxHeightPx: number;
  maxRenderedChars: number;
}

export interface LTrackerSettings {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  recentMessageLimit: number;
  maxMessageChars: number;
  generationTimeoutMs: number;
  saveRawOutput: boolean;
  savePromptPreview: boolean;
  auto: LTrackerAutoSettings;
  injection: LTrackerInjectionSettings;
  renderer: LTrackerRendererSettings;
  messageDisplay: LTrackerMessageDisplaySettings;
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
  lastGenerationSource: TrackerGenerationSourceKind | null;
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
  autoSubscriptionActive: boolean;
  lastAutoEventAt: string | null;
  lastAutoEventType: AutoTriggerEventType | null;
  lastAutoSkippedReason: string | null;
  lastAutoScheduledAt: string | null;
  lastAutoTriggeredAt: string | null;
  lastAutoSourceMessageId: string | null;
  lastAutoSourceMessageIndex: number | null;
  lastAutoGenerationId: string | null;
  latestAttachedMessageId: string | null;
  latestAttachedMessageIndex: number | null;
  latestAttachedSnapshotAt: string | null;
  latestAttachedSnapshotStorageKey: string | null;
  injectionEnabled: boolean;
  lastInjectionAt: string | null;
  lastInjectionMode: LTrackerInjectionMode | null;
  lastInjectionFormat: LTrackerInjectionFormat | null;
  lastInjectedChars: number;
  lastInjectionSkippedReason: string | null;
  lastInjectionSnapshotCreatedAt: string | null;
  lastInjectionSourceMessageId: string | null;
  selectedPresetId: string | null;
  selectedPresetName: string | null;
  lastPresetFallbackReason: string | null;
  lastPresetValidationError: string | null;
  lastPromptUsedPresetId: string | null;
  lastPromptUsedPresetName: string | null;
  lastRenderAt: string | null;
  lastRenderPresetId: string | null;
  lastRenderPresetName: string | null;
  lastRenderSnapshotCreatedAt: string | null;
  lastRenderSource: LTrackerRenderSource | null;
  lastRenderStatus: LTrackerRenderStatus | null;
  lastRenderWarnings: string[];
  lastRenderErrors: string[];
  lastSanitizedHtmlChars: number;
  lastFallbackTextChars: number;
  contextHandlerRegistered: boolean;
  contextHandlerDisabledReason: string | null;
  lastContextHandlerError: string | null;
  messageDisplayEnabled: boolean;
  messageDisplayMode: LTrackerMessageDisplayMode | null;
  messageDisplayPlacement: LTrackerMessageDisplayPlacement | null;
  messageDisplayHydratedCount: number;
  lastMessageDisplayHydratedAt: string | null;
  lastMessageDisplayError: string | null;
  messageLocalUiSupported: boolean;
  messageLocalUiFallbackReason: string | null;
  messageSnapshotIndexCount: number;
  lastWidgetRegenerateMessageId: string | null;
  lastWidgetRegenerateStartedAt: string | null;
  lastWidgetRegenerateCompletedAt: string | null;
  lastWidgetRegenerateDurationMs: number | null;
  lastWidgetRegenerateCancelledAt: string | null;
  lastWidgetRegenerateError: string | null;
  activeWidgetRegenerationCount: number;
  messageWidgetPlacementResolved: LTrackerMessageWidgetPlacementResolved;
  messageWidgetPlacementReason: string | null;
  messageDisplayRenderer: LTrackerMessageDisplayRenderer;
  lastDomInjectionAt: string | null;
  lastDomInjectionError: string | null;
  lastUninjectAt: string | null;
  lastDeletedTrackerMessageId: string | null;
  lastDeletedTrackerSwipeKey: string | null;
  lastEditedTrackerMessageId: string | null;
  lastEditedTrackerSwipeKey: string | null;
  lastSwipeDetectedMessageId: string | null;
  lastSwipeKey: string | null;
  lastSwipeKeySource: string | null;
  swipeTrackerIndexCount: number;
  activeTrackerJobs: Array<{ jobId: string; messageId: string; swipeKey: string; startedAt: string }>;
  lastPlacementRequested: LTrackerMessageDisplayPlacement | null;
  lastPlacementResolved: LTrackerMessageDisplayPlacement | null;
  lastPlacementRenderAttemptAt: string | null;
  lastPlacementRenderResult: string | null;
  lastPlacementError: string | null;
  lastMountPointStrategy: LTrackerMountPointStrategy | null;
  lastEmbeddedTagWriteAt: string | null;
  lastEmbeddedTagWriteMessageId: string | null;
  lastEmbeddedTagWriteSwipeKey: string | null;
  lastEmbeddedTagError: string | null;
  lastTagInterceptAt: string | null;
  lastTagInterceptMessageId: string | null;
  lastTagInterceptSwipeKey: string | null;
  lastTagInterceptError: string | null;
  lastMessageControlRenderAt: string | null;
  lastMessageControlMessageId: string | null;
  lastMessageControlSwipeKey: string | null;
  lastMessageControlState: string | null;
  lastGenerateButtonMessageId: string | null;
  lastGenerateButtonClickedAt: string | null;
  lastInlineActionClicked: LTrackerInlineAction | null;
  lastInlineActionAt: string | null;
  lastInlineActionError: string | null;
  nativeToolbarSupported: boolean;
  nativeToolbarFallbackReason: string | null;
}

export interface PermissionState {
  generation: boolean;
  chats: boolean;
  chatMutation: boolean;
  contextHandler: boolean;
}

export interface FrontendState {
  version: typeof EXTENSION_VERSION;
  status: TrackerStatus;
  chatId: string | null;
  snapshot: TrackerSnapshot | null;
  latestMessageSnapshot: MessageAttachedSnapshot | null;
  injectionPreview: string | null;
  renderPreview: RenderedTrackerPreview | null;
  messageSnapshotHistory: MessageTrackerHistoryEntry[];
  messageControlCandidates: MessageTrackerHistoryEntry[];
  presets: TrackerSchemaPreset[];
  activePreset: TrackerSchemaPreset;
  activePresetState: ActiveTrackerPresetState;
  error: LTrackerError | null;
  permissions: PermissionState;
  settings: LTrackerSettings;
  diagnostics: LTrackerDiagnostics;
}

export interface RenderedTrackerPreview {
  presetId: string;
  presetName: string;
  snapshotCreatedAt: string | null;
  source: LTrackerRenderSource;
  status: LTrackerRenderStatus;
  html: string;
  textFallback: string;
  warnings: string[];
  errors: string[];
}

export interface RenderedMessageTracker {
  messageId: string;
  messageIndex: number | null;
  swipeKey: string;
  swipeIndex: number | null;
  swipeId: string | null;
  swipeContentHash: string | null;
  swipeKeySource: SwipeKeySource;
  presetId: string | null;
  presetName: string | null;
  presetVersion: string | null;
  snapshotCreatedAt: string | null;
  attachedAt: string | null;
  generationStartedAt: string | null;
  generationCompletedAt: string | null;
  generationDurationMs: number | null;
  generationCancelledAt: string | null;
  generationStatus: "completed" | "cancelled" | "failed" | null;
  isRegenerating: boolean;
  activeJobId: string | null;
  controlState: MessageTrackerControlState;
  renderMode: LTrackerMessageDisplayRenderMode;
  html: string;
  textFallback: string;
  json: string;
  widgetHtml: string;
  domHtml: string;
  warnings: string[];
  errors: string[];
}

export interface MessageTrackerControlState {
  messageId: string;
  swipeKey: string;
  hasTracker: boolean;
  isExpanded: boolean;
  isGenerating: boolean;
  generationStartedAt: string | null;
  generationDurationMs: number | null;
  generationStatus: LTrackerMessageControlGenerationStatus;
  error: string | null;
  debugSwipeLabel: string | null;
}

export interface MessageTrackerHistoryEntry {
  indexEntry: MessageSnapshotIndexEntry;
  snapshot: MessageAttachedSnapshot | null;
  rendered: RenderedMessageTracker;
}

export type FrontendMessage =
  | { type: "ready"; chatId: string | null }
  | { type: "refresh_state"; chatId: string | null }
  | { type: "generate_tracker"; chatId: string | null; requestId: string }
  | { type: "clear_snapshot"; chatId: string | null; requestId: string }
  | { type: "save_settings"; chatId: string | null; settings: LTrackerSettings; requestId: string }
  | { type: "reset_settings"; chatId: string | null; requestId: string }
  | { type: "select_preset"; chatId: string | null; presetId: string; requestId: string }
  | { type: "save_preset_as_new"; chatId: string | null; preset: TrackerPresetDraft; requestId: string }
  | { type: "duplicate_preset"; chatId: string | null; preset: TrackerPresetDraft; requestId: string }
  | { type: "update_preset"; chatId: string | null; presetId: string; preset: TrackerPresetDraft; requestId: string }
  | { type: "delete_preset"; chatId: string | null; presetId: string; requestId: string }
  | { type: "reset_preset"; chatId: string | null; requestId: string }
  | { type: "import_preset"; chatId: string | null; importText: string; requestId: string }
  | { type: "validate_preset"; chatId: string | null; preset: TrackerPresetDraft; requestId: string }
  | { type: "render_template"; chatId: string | null; source?: LTrackerRenderSource; requestId: string }
  | { type: "generate_message_tracker"; chatId: string | null; messageId: string; swipeKey?: string | null; requestId: string }
  | { type: "regenerate_message_tracker"; chatId: string | null; messageId: string; swipeKey?: string | null; requestId: string }
  | { type: "cancel_tracker_generation"; chatId: string | null; jobId?: string | null; messageId?: string | null; swipeKey?: string | null; requestId: string }
  | { type: "delete_message_tracker"; chatId: string | null; messageId: string; swipeKey: string; requestId: string }
  | { type: "save_edited_message_tracker"; chatId: string | null; messageId: string; swipeKey: string; jsonText: string; requestId: string }
  | { type: "embedded_tracker_tag_intercepted"; chatId: string | null; messageId: string | null; swipeKey: string | null; jsonText: string; isStreaming?: boolean; requestId: string };

export type BackendMessage =
  | { type: "state"; state: FrontendState; requestId?: string }
  | { type: "error"; message: string; requestId?: string; state?: FrontendState };
