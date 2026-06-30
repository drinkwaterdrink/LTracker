export const EXTENSION_VERSION = "0.25";
export const STORAGE_SCHEMA_VERSION = 1;
export const SETTINGS_SCHEMA_VERSION = 1;
export const SPINDLE_TYPES_VERSION = "0.5.21";

export type TrackerStatus = "idle" | "generating" | "error";
export type TranscriptRole = "user" | "assistant";
export type TrackerGenerationSourceKind = "manual" | "auto" | "widget";
export type AutoTriggerEventType = "GENERATION_ENDED" | "MESSAGE_SENT";
export type LTrackerInjectionMode = "latest_chat_snapshot" | "latest_message_snapshot";
export type LTrackerInjectionFormat = "embedded_tag" | "compact_text" | "pretty_json" | "minimal";
export type LTrackerInjectionPlacement = "append_to_last_assistant" | "system_before_last" | "system_after_history";
export type LTrackerInjectionRoleFallback = "system" | "assistant";
export type LTrackerMemorySource = "message_history" | "sidecar_index" | "embedded_tags" | "hybrid";
export type LTrackerMemoryOrder = "oldest_to_newest" | "newest_to_oldest";
export type LTrackerRenderSource = "latest_chat_snapshot" | "latest_message_snapshot";
export type LTrackerRenderStatus = "rendered" | "fallback" | "no_template" | "no_snapshot" | "error";
export type LTrackerSampleSnapshotMode = "minimal" | "normal" | "stress" | "mobile_torture" | "cast_heavy" | "world_heavy";
export type LTrackerRenderLabViewport = "phone_narrow" | "phone_large" | "tablet" | "desktop" | "custom";
export type LTrackerRenderLabSurface = "inline_contained" | "inline_wide" | "popover_body" | "fullscreen_reader_body";
export type LTrackerMessageDisplayPlacement = "top" | "bottom";
export type LTrackerMessageDisplaySource = "message_attached_snapshot" | "latest_chat_snapshot";
export type LTrackerMessageDisplayRenderMode = "html_template" | "compact_text" | "pretty_json";
export type LTrackerMessageDisplayDisplayMode = "inline_full" | "inline_button_popover" | "drawer_history_only";
export type LTrackerMessageAttachmentMode = "sidecar_snapshot" | "embedded_tracker_tag" | "both";
export type LTrackerMessageControlDensity = "compact" | "comfortable";
export type LTrackerMessageControlPlacement = "message_header" | "inside_tracker_header";
export type LTrackerMessageControlGenerationStatus = "idle" | "generating" | "completed" | "cancelled" | "failed";
export type LTrackerInlineAction = "generate" | "regenerate" | "cancel" | "edit" | "delete" | "toggle";
export type LTrackerConnectionMode = "active_quiet" | "selected_connection_quiet" | "selected_connection_raw";
export type LTrackerReasoningSource = "inherit" | "off" | "custom";
export type LTrackerReasoningEffort = "auto" | "none" | "minimal" | "low" | "medium" | "high" | "max" | "xhigh";
export type LTrackerThinkingDisplay = "auto" | "summarized" | "omitted";
export type LTrackerConnectionTestStatus = "idle" | "running" | "success" | "error" | "cancelled";
export type LTrackerMessageDisplayMode = "dom_injection" | "message_widget" | "drawer_history" | "disabled";
export type LTrackerMessageWidgetPlacementResolved = "top" | "bottom" | "host_default" | "unsupported";
export type LTrackerMessageDisplayRenderer = "dom_injection" | "iframe_widget" | "drawer_history";
export type LTrackerMountPointStrategy =
  | "official_message_body"
  | "official_message_element"
  | "bubble_adapter"
  | "wide_message_row"
  | "wide_message_element"
  | "wide_bubble_fallback"
  | "widget_fallback"
  | "drawer_only";
export type LTrackerDisplaySurfaceKind = "inline" | "overlay" | "drawer_only";
export type TemplateTrustMode = "safe" | "trusted" | "dev";
export type LTrackerBudgetMode = "characters" | "estimated_tokens";
export type LTrackerExpandedWidthMode = "contained" | "wide" | "full_mobile" | "popover";
export type LTrackerDisplaySurface =
  | "inline_contained"
  | "inline_wide"
  | "anchored_popover"
  | "fullscreen_reader"
  | "drawer_only";
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

export interface TrackerPresetRecommendedConnection {
  mode?: LTrackerConnectionMode;
  temperature?: number;
  max_tokens?: number;
  reasoning?: {
    source?: LTrackerReasoningSource;
    effort?: string;
  };
  notes?: string;
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
  recommendedConnection?: TrackerPresetRecommendedConnection;
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
  recommendedConnection?: TrackerPresetRecommendedConnection;
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

export interface TrackerPresetRenderLock {
  presetId: string | null;
  presetName: string | null;
  presetVersion: string | null;
  schemaTitle: string | null;
  schemaHash: string | null;
  htmlTemplateHash: string | null;
  promptInstructionsHash: string | null;
  htmlTemplate?: string | null;
  jsonSchema?: Record<string, unknown> | null;
  promptInstructions?: string | null;
  capturedAt: string;
}

export type RenderPresetSource =
  | "snapshot_render_lock"
  | "installed_preset_id"
  | "installed_preset_name_version"
  | "active_preset_legacy_fallback"
  | "json_fallback_original_preset_missing";

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
  presetRenderLock?: TrackerPresetRenderLock | null;
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

export interface LTrackerAutoTimingSettings {
  waitForAssistantFinalization: boolean;
  postCompletionSettleMs: number;
  stableContentCheckMs: number;
  requireStableSwipeContent: boolean;
  cancelPendingOnSwipeChange: boolean;
}

export interface LTrackerBudgetSettings {
  mode: LTrackerBudgetMode;
  ultraModeEnabled: boolean;
  recentMessageBudgetTokens: number;
  perMessageBudgetTokens: number;
  trackerMemoryBudgetTokens: number;
  promptInjectionBudgetTokens: number;
  maxTrackerOutputTokens: number;
  promptPreviewBudgetTokens: number;
  renderedHtmlMaxChars: number;
  rawOutputMaxChars: number;
  presetImportMaxChars: number;
}

export interface LTrackerMemorySettings {
  enabled: boolean;
  includeInTrackerGeneration: boolean;
  retainCount: number;
  fullSnapshotCount: number;
  compactOlderSnapshots: boolean;
  maxMemoryChars: number;
  source: LTrackerMemorySource;
  excludeTargetMessage: boolean;
  order: LTrackerMemoryOrder;
  requireSamePreset: boolean;
  requireSameSwipeWhenAvailable: boolean;
}

export interface LTrackerInjectionSettings {
  enabled: boolean;
  format: LTrackerInjectionFormat;
  retainCount: number;
  injectionPlacement: LTrackerInjectionPlacement;
  includeOnlyIfMissingFromPrompt: boolean;
  stripOlderTrackerBlocks: boolean;
  maxInjectedChars: number;
  roleFallback: LTrackerInjectionRoleFallback;
  includeHeader: boolean;
  header: string;
}

export interface LTrackerRendererSettings {
  enabled: boolean;
  previewSource: LTrackerRenderSource;
  missingValuePlaceholder: string;
  maxRenderedChars: number;
  allowInlineStyles: boolean;
  templateTrustMode: TemplateTrustMode;
}

export interface LTrackerMessageDisplaySettings {
  enabled: boolean;
  useDomInjection: boolean;
  fallbackToIframeWidget: boolean;
  attachmentMode: LTrackerMessageAttachmentMode;
  displayMode: LTrackerMessageDisplayDisplayMode;
  displaySurface: LTrackerDisplaySurface;
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

export interface LTrackerExpandedWidthSettings {
  expandedWidthMode: LTrackerExpandedWidthMode;
  maxExpandedWidthPx: number;
  mobileHorizontalMarginPx: number;
  expandedContentMaxHeightVh: number;
  preferFullscreenOnMobile: boolean;
  fullscreenBreakpointPx: number;
  popoverBackdrop: boolean;
  closeOnBackdropClick: boolean;
  closeOnEscape: boolean;
}

export interface LTrackerConnectionParameters {
  temperature: number | null;
  max_tokens: number | null;
  top_p: number | null;
  frequency_penalty: number | null;
  presence_penalty: number | null;
}

export interface LTrackerReasoningSettings {
  source: LTrackerReasoningSource;
  apiReasoning: boolean;
  effort: LTrackerReasoningEffort;
  thinkingDisplay: LTrackerThinkingDisplay;
}

export interface LTrackerConnectionSettings {
  mode: LTrackerConnectionMode;
  selectedConnectionId: string | null;
  selectedConnectionName: string | null;
  refreshConnectionsOnDrawerOpen: boolean;
  parameters: LTrackerConnectionParameters;
  reasoning: LTrackerReasoningSettings;
  testPrompt: string;
}

export interface LTrackerConnectionProfileSummary {
  id: string;
  name: string;
  provider: string | null;
  model: string | null;
  has_api_key: boolean | null;
  is_default: boolean | null;
  reasoning_bindings: Record<string, unknown> | null;
  updated_at: string | null;
}

export interface LTrackerHistorySettings {
  pageSize: number;
  showDuplicates: boolean;
}

export interface LTrackerStorageMaintenanceSettings {
  enabled: boolean;
  maxSnapshotsPerChat: number;
  cleanupDuplicatesOnly: boolean;
}

export interface LTrackerContextFiltersSettings {
  enabled: boolean;
  includeChatMessages: boolean;
  includeTrackerMemory: boolean;
  includeEmbeddedTrackerTags: boolean;
  includeWorldLoreContext: boolean;
  includeCharacterContext: boolean;
  includePersonaContext: boolean;
  excludeUserMessages: boolean;
  excludeAssistantMessages: boolean;
  excludeSystemLikeMessages: boolean;
  maxWorldLoreChars: number;
  maxCharacterContextChars: number;
  maxPersonaContextChars: number;
  excludedCharacterNames: string[];
  excludedMessageNamePatterns: string[];
  excludedLoreKeywords: string[];
  loreAllowlistKeywords: string[];
  requireExactCharacterNameMatch: boolean;
  caseSensitiveExclusions: boolean;
  showContextFilterDiagnostics: boolean;
  disableAutoForExcludedNames: boolean;
  disableAutoWhenSourceFiltered: boolean;
  includeOnlyMatchedLore: boolean;
  manualWorldLoreContext: string;
  manualCharacterContext: string;
  manualPersonaContext: string;
}

export interface LTrackerSettings {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  recentMessageLimit: number;
  maxMessageChars: number;
  generationTimeoutMs: number;
  saveRawOutput: boolean;
  savePromptPreview: boolean;
  auto: LTrackerAutoSettings;
  autoTiming: LTrackerAutoTimingSettings;
  budget: LTrackerBudgetSettings;
  memory: LTrackerMemorySettings;
  injection: LTrackerInjectionSettings;
  renderer: LTrackerRendererSettings;
  messageDisplay: LTrackerMessageDisplaySettings;
  expandedWidth: LTrackerExpandedWidthSettings;
  connection: LTrackerConnectionSettings;
  contextFilters: LTrackerContextFiltersSettings;
  history: LTrackerHistorySettings;
  storageMaintenance: LTrackerStorageMaintenanceSettings;
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

export type LTrackerMaintenanceSeverity = "ok" | "warning" | "repairable" | "error";

export interface LTrackerMaintenanceReportItem {
  severity: LTrackerMaintenanceSeverity;
  category: string;
  message: string;
  suggestedFix: string | null;
  repairActionId: string | null;
}

export interface LTrackerMaintenanceReport {
  createdAt: string;
  chatId: string | null;
  status: LTrackerMaintenanceSeverity;
  summary: string;
  items: LTrackerMaintenanceReportItem[];
  counts: {
    ok: number;
    warning: number;
    repairable: number;
    error: number;
  };
  duplicateIndexEntries: number;
  missingSidecarIndexEntries: number;
  orphanSidecarSnapshots: number;
  snapshotsWithoutPresetLocks: number;
  snapshotsWithIncompletePresetLocks: number;
  snapshotsWithUnavailableOriginalPreset: number;
  brokenEmbeddedTags: number;
  malformedEmbeddedTags: number;
  repairedCount: number;
  deletedCount: number;
  limitationNotes: string[];
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
  lastAutoFinalizationState: string | null;
  lastAutoWaitingMessageId: string | null;
  lastAutoWaitingSwipeKey: string | null;
  lastAutoFinalizedAt: string | null;
  lastAutoStableCheckAt: string | null;
  lastAutoStableCheckPassed: boolean | null;
  lastAutoContentStableHash: string | null;
  lastAutoFinalizationSkippedReason: string | null;
  pendingAutoFinalizationCount: number;
  lastSwipeChangeCancelledPendingJob: boolean;
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
  lastMemoryEntryCount: number;
  lastMemoryChars: number;
  lastMemoryTruncated: boolean;
  lastMemorySourceSummary: string | null;
  lastMemorySkippedReason: string | null;
  lastPromptIncludedMemory: boolean;
  lastContextFilterMessageCount: number;
  lastContextFilterIncludedCount: number;
  lastContextFilterExcludedCount: number;
  lastContextFilterExcludedNames: string[];
  lastContextFilterReasons: string[];
  lastContextFilterWarning: string | null;
  lastIncludedContextChars: number;
  lastIncludedContextTokens: number;
  lastContextIncludedSourceSummary: string | null;
  lastIncludedContextPreview: string | null;
  lastContextExclusionReport: string | null;
  worldLoreApiAvailable: boolean;
  worldLorePermissionDeclared: boolean;
  lastWorldLoreReadStatus: string | null;
  lastWorldLoreEntriesConsidered: number;
  lastWorldLoreEntriesIncluded: number;
  lastWorldLoreCharsIncluded: number;
  lastWorldLoreSkippedReason: string | null;
  lastWorldLoreContextPreview: string | null;
  characterApiAvailable: boolean;
  characterPermissionDeclared: boolean;
  lastCharacterContextReadStatus: string | null;
  lastCharacterContextCharsIncluded: number;
  lastCharacterContextSkippedReason: string | null;
  personaApiAvailable: boolean;
  personaPermissionDeclared: boolean;
  lastPersonaContextReadStatus: string | null;
  lastPersonaContextCharsIncluded: number;
  lastPersonaContextSkippedReason: string | null;
  interceptorRegistered: boolean;
  lastInterceptorAt: string | null;
  lastInterceptorInjectedCount: number;
  lastInterceptorInjectedChars: number;
  lastInterceptorStrippedCount: number;
  lastInterceptorSkippedReason: string | null;
  lastInterceptorError: string | null;
  lastInterceptorPromptTrackerCountBefore: number;
  lastInterceptorPromptTrackerCountAfter: number;
  selectedPresetId: string | null;
  selectedPresetName: string | null;
  lastPresetFallbackReason: string | null;
  lastPresetValidationError: string | null;
  lastPromptUsedPresetId: string | null;
  lastPromptUsedPresetName: string | null;
  lastRenderAt: string | null;
  lastRenderPresetId: string | null;
  lastRenderPresetName: string | null;
  lastRenderPresetSource: RenderPresetSource | null;
  lastRenderLockedPresetId: string | null;
  lastRenderLockedPresetName: string | null;
  lastRenderLockedPresetVersion: string | null;
  lastRenderPresetMismatchDetected: boolean | null;
  lastRenderPresetFallbackReason: string | null;
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
  selectedDisplaySurface: LTrackerDisplaySurface | null;
  resolvedDisplaySurface: LTrackerDisplaySurface | null;
  displaySurfaceKind: LTrackerDisplaySurfaceKind | null;
  displaySurfaceMountStrategy: LTrackerMountPointStrategy | null;
  displaySurfaceParentWidthConstrained: boolean | null;
  displaySurfaceFallbackReason: string | null;
  lastDisplaySurfaceRehydratedAt: string | null;
  lastDisplayPreviewAction: string | null;
  lastDisplayPreviewResult: string | null;
  lastDisplayPreviewReason: string | null;
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
  connectionMode: string;
  selectedConnectionId: string | null;
  selectedConnectionName: string | null;
  selectedConnectionAvailable: boolean;
  connectionListCount: number;
  connectionProfileSelected: boolean;
  effectiveTrackerConnectionMode: string | null;
  effectiveTrackerConnectionReason: string | null;
  lastSelectedConnectionFallbackReason: string | null;
  lastTrackerProfileMissingAt: string | null;
  lastConnectionRefreshAt: string | null;
  lastConnectionRefreshError: string | null;
  lastGenerationConnectionModeUsed: string | null;
  lastGenerationConnectionIdUsed: string | null;
  lastGenerationConnectionNameUsed: string | null;
  lastGenerationConnectionFallbackReason: string | null;
  lastGenerationParametersUsed: Record<string, unknown> | null;
  lastReasoningOverrideUsed: Record<string, unknown> | null;
  lastConnectionTestAt: string | null;
  lastConnectionTestStatus: LTrackerConnectionTestStatus;
  lastConnectionTestDurationMs: number | null;
  lastConnectionTestError: string | null;
  lastConnectionTestOutputPreview: string | null;
  lastConnectionTestFinishReason: string | null;
  lastConnectionTestUsage: Record<string, unknown> | null;
  drawerActiveSection: string | null;
  lastDrawerRefreshAt: string | null;
  lastHistoryGroupedCount: number;
  lastHistoryDuplicateCount: number;
  lastHistoryCleanupAt: string | null;
  expandedWidthModeResolved: string | null;
  lastExpandedTrackerWidthPx: number | null;
  lastDisplaySurface: LTrackerDisplaySurface | null;
  lastPopoverOpenedAt: string | null;
  lastPopoverMessageId: string | null;
  lastPopoverSwipeKey: string | null;
  lastPopoverWidthPx: number | null;
  lastPopoverHeightPx: number | null;
  lastReaderOpenedAt: string | null;
  lastReaderMessageId: string | null;
  lastReaderSwipeKey: string | null;
  lastResolvedViewportWidth: number | null;
  lastResolvedViewportHeight: number | null;
  lastWidthModeResolved: string | null;
  lastWidthConstraintReason: string | null;
  lastWidthOverflowDetected: boolean | null;
  templateTrustMode: TemplateTrustMode;
  ultraModeEnabled: boolean;
  estimatedPromptTokensLastRun: number | null;
  estimatedMemoryTokensLastRun: number | null;
  iframeFallbackVisibleInMainUi: boolean;
  lastMemoryIndexCount: number;
  lastMemoryCandidateCount: number;
  lastMemoryLoadedSnapshotCount: number;
  lastMemoryLoadDurationMs: number;
  lastMemoryLoadSkippedCount: number;
  lastJobTimeoutAt: string | null;
  lastJobTimeoutJobId: string | null;
  lastJobTimeoutMessageId: string | null;
  lastJobTimeoutSwipeKey: string | null;
  staleJobsEvictedCount: number;
  lastHistoryOrphanCount: number;
  lastPresetEstimatedTokens: number | null;
  lastPresetEstimatedRenderedChars: number | null;
  lastPresetPackImportAt: string | null;
  lastPresetPackImportStatus: string | null;
  lastPresetPackImportError: string | null;
  lastPresetPackImportSizeChars: number | null;
  lastPresetPackImportEstimatedTokens: number | null;
  lastPresetPackExportAt: string | null;
  lastPresetPackExportName: string | null;
  lastPresetValidationAt: string | null;
  lastPresetValidationStatus: string | null;
  lastPresetValidationErrorCount: number;
  lastPresetValidationWarningCount: number;
  lastPresetValidationEstimatedTokens: number | null;
  lastPresetValidationEstimatedRenderedChars: number | null;
  lastPresetLintAt: string | null;
  lastPresetLintWarningCount: number;
  lastPresetLintErrorCount: number;
  lastPresetLintRawObjectPaths: string[];
  lastPresetLintMobileRiskCount: number;
  lastPresetRenderLabViewport: LTrackerRenderLabViewport | null;
  lastPresetRenderLabSurface: LTrackerRenderLabSurface | null;
  lastPresetRenderLabResult: string | null;
  lastPresetRenderLabRenderedChars: number | null;
  lastPresetRenderLabWarnings: string[];
  lastHealthCheckAt: string | null;
  lastHealthCheckStatus: LTrackerMaintenanceSeverity | null;
  lastMaintenanceActionAt: string | null;
  lastMaintenanceAction: string | null;
  lastMaintenanceReport: LTrackerMaintenanceReport | null;
}

export interface PermissionState {
  generation: boolean;
  chats: boolean;
  chatMutation: boolean;
  contextHandler: boolean;
  interceptor: boolean;
  worldBooks: boolean;
  characters: boolean;
  personas: boolean;
}

export interface FrontendState {
  version: typeof EXTENSION_VERSION;
  status: TrackerStatus;
  chatId: string | null;
  snapshot: TrackerSnapshot | null;
  latestMessageSnapshot: MessageAttachedSnapshot | null;
  memoryPreview: string | null;
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
  connectionProfiles: LTrackerConnectionProfileSummary[];
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
  renderPresetSource: RenderPresetSource | null;
  renderPresetWarning: string | null;
  renderPresetFallbackReason: string | null;
  renderPresetMismatchDetected: boolean;
  renderLockedPresetId: string | null;
  renderLockedPresetName: string | null;
  renderLockedPresetVersion: string | null;
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
  | { type: "ready"; chatId: string | null; historyLimit?: number }
  | { type: "refresh_state"; chatId: string | null; historyLimit?: number }
  | { type: "generate_tracker"; chatId: string | null; requestId: string }
  | { type: "refresh_connections"; chatId: string | null; requestId: string }
  | { type: "test_tracker_connection"; chatId: string | null; settings?: LTrackerSettings; requestId: string }
  | { type: "cancel_connection_test"; chatId: string | null; requestId: string }
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
  | { type: "import_preset_pack"; chatId: string | null; importText: string; presetName?: string; overwritePresetId?: string; trustMode?: TemplateTrustMode; applyRecommendedSettings?: boolean; requestId: string }
  | { type: "export_preset_pack"; chatId: string | null; includeRecommendedSettings?: boolean; includeExampleSnapshot?: boolean; requestId: string }
  | { type: "validate_preset"; chatId: string | null; preset: TrackerPresetDraft; requestId: string }
  | { type: "validate_preset_report"; chatId: string | null; preset: TrackerPresetDraft; requestId: string }
  | { type: "generate_sample_snapshot"; chatId: string | null; sampleMode?: LTrackerSampleSnapshotMode; requestId: string }
  | { type: "render_template"; chatId: string | null; source?: LTrackerRenderSource; requestId: string }
  | { type: "generate_message_tracker"; chatId: string | null; messageId: string; swipeKey?: string | null; requestId: string }
  | { type: "regenerate_message_tracker"; chatId: string | null; messageId: string; swipeKey?: string | null; requestId: string }
  | { type: "cancel_tracker_generation"; chatId: string | null; jobId?: string | null; messageId?: string | null; swipeKey?: string | null; requestId: string }
  | { type: "delete_message_tracker"; chatId: string | null; messageId: string; swipeKey: string; requestId: string }
  | { type: "save_edited_message_tracker"; chatId: string | null; messageId: string; swipeKey: string; jsonText: string; requestId: string }
  | { type: "cleanup_duplicate_history"; chatId: string | null; requestId: string }
  | { type: "embedded_tracker_tag_intercepted"; chatId: string | null; messageId: string | null; swipeKey: string | null; jsonText: string; isStreaming?: boolean; requestId: string }
  | { type: "restore_deleted_tracker"; chatId: string | null; messageId: string; swipeKey: string; requestId: string }
  | { type: "run_storage_maintenance_scan"; chatId: string | null; requestId: string }
  | { type: "cleanup_missing_index_entries"; chatId: string | null; requestId: string }
  | { type: "run_health_check"; chatId: string | null; requestId: string }
  | { type: "repair_settings"; chatId: string | null; requestId: string }
  | { type: "repair_snapshot_index"; chatId: string | null; requestId: string }
  | { type: "repair_preset_render_locks"; chatId: string | null; requestId: string }
  | { type: "clean_orphan_snapshots"; chatId: string | null; requestId: string }
  | { type: "clean_broken_embedded_tags"; chatId: string | null; requestId: string };

export type BackendMessage =
  | { type: "state"; state: FrontendState; requestId?: string }
  | { type: "error"; message: string; requestId?: string; state?: FrontendState }
  | { type: "preset_pack_export_ready"; json: string; fileName: string; requestId?: string }
  | { type: "preset_pack_validation_report"; report: import("./presetPack").PresetValidationReport; requestId?: string }
  | { type: "sample_snapshot_ready"; snapshot: Record<string, unknown>; renderResult: import("./htmlTemplateRenderer").HtmlTemplateRenderResult | null; requestId?: string };
