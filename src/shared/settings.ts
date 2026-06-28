import {
  SETTINGS_SCHEMA_VERSION,
  type LTrackerInjectionFormat,
  type LTrackerInjectionPlacement,
  type LTrackerInjectionRoleFallback,
  type LTrackerConnectionMode,
  type LTrackerMemoryOrder,
  type LTrackerMemorySource,
  type LTrackerReasoningEffort,
  type LTrackerReasoningSource,
  type LTrackerSettings,
  type LTrackerThinkingDisplay,
} from "./types";
import {
  DEFAULT_TRACKER_CONNECTION_PARAMETERS,
  TRACKER_CONNECTION_DEFAULT_TEST_PROMPT,
  TRACKER_CONNECTION_PARAMETER_LIMITS,
} from "./generationRequest";

export const SETTINGS_LIMITS = {
  recentMessageLimit: { min: 1, max: 200, default: 24 },
  maxMessageChars: { min: 500, max: 50_000, default: 8_000 },
  generationTimeoutMs: { min: 10_000, max: 180_000, default: 45_000 },
  autoDebounceMs: { min: 250, max: 30_000, default: 1_500 },
  skipFirstMessages: { min: 0, max: 100, default: 2 },
  memoryRetainCount: { min: 0, max: 10, default: 3 },
  memoryFullSnapshotCount: { min: 0, max: 10, default: 3 },
  maxMemoryChars: { min: 1_000, max: 50_000, default: 12_000 },
  injectionRetainCount: { min: 0, max: 10, default: 3 },
  maxInjectedChars: { min: 1_000, max: 50_000, default: 12_000 },
  maxRenderedChars: { min: 1_000, max: 200_000, default: 50_000 },
  maxMessageDisplayRenderedChars: { min: 1_000, max: 200_000, default: 50_000 },
  minimizedMaxHeightPx: { min: 0, max: 400, default: 0 },
} as const;

export const DEFAULT_SETTINGS: LTrackerSettings = {
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
    onlyWhenChatActive: true,
  },
  memory: {
    enabled: true,
    includeInTrackerGeneration: true,
    retainCount: SETTINGS_LIMITS.memoryRetainCount.default,
    fullSnapshotCount: SETTINGS_LIMITS.memoryFullSnapshotCount.default,
    compactOlderSnapshots: false,
    maxMemoryChars: SETTINGS_LIMITS.maxMemoryChars.default,
    source: "hybrid",
    excludeTargetMessage: true,
    order: "oldest_to_newest",
    requireSamePreset: false,
    requireSameSwipeWhenAvailable: false,
  },
  injection: {
    enabled: false,
    retainCount: SETTINGS_LIMITS.injectionRetainCount.default,
    format: "embedded_tag",
    injectionPlacement: "append_to_last_assistant",
    includeOnlyIfMissingFromPrompt: true,
    stripOlderTrackerBlocks: true,
    maxInjectedChars: SETTINGS_LIMITS.maxInjectedChars.default,
    roleFallback: "system",
    includeHeader: true,
    header: "LTracker Recent State",
  },
  renderer: {
    enabled: true,
    previewSource: "latest_chat_snapshot",
    missingValuePlaceholder: "",
    maxRenderedChars: SETTINGS_LIMITS.maxRenderedChars.default,
    allowInlineStyles: false,
  },
  messageDisplay: {
    enabled: true,
    useDomInjection: true,
    fallbackToIframeWidget: true,
    attachmentMode: "sidecar_snapshot",
    displayMode: "inline_full",
    placement: "top",
    source: "message_attached_snapshot",
    renderMode: "html_template",
    allowInlineStyles: true,
    deduplicateRenderWarnings: true,
    showRenderWarningsInDiagnosticsOnly: true,
    showDebugSwipeKey: false,
    showGenerateButtonForMissingTracker: true,
    controlDensity: "compact",
    controlPlacement: "message_header",
    showExpandedHeaderActions: true,
    showBottomActionsInInlineTracker: false,
    collapsedByDefault: true,
    compactCollapsedHeader: true,
    showTimestamp: true,
    showPresetName: true,
    showDebugCopyButtonsInHistory: true,
    showWidgetRegenerateButton: true,
    showEditButton: true,
    showDeleteButton: true,
    showNoTrackerForSwipe: false,
    showGenerationDuration: true,
    minimizedMaxHeightPx: SETTINGS_LIMITS.minimizedMaxHeightPx.default,
    maxRenderedChars: SETTINGS_LIMITS.maxMessageDisplayRenderedChars.default,
  },
  connection: {
    mode: "active_quiet",
    selectedConnectionId: null,
    selectedConnectionName: null,
    refreshConnectionsOnDrawerOpen: true,
    parameters: DEFAULT_TRACKER_CONNECTION_PARAMETERS,
    reasoning: {
      source: "inherit",
      apiReasoning: true,
      effort: "auto",
      thinkingDisplay: "auto",
    },
    testPrompt: TRACKER_CONNECTION_DEFAULT_TEST_PROMPT,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() ? Number(value) : fallback;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function memorySource(value: unknown): LTrackerMemorySource {
  return value === "message_history"
    || value === "sidecar_index"
    || value === "embedded_tags"
    || value === "hybrid"
    ? value
    : DEFAULT_SETTINGS.memory.source;
}

function memoryOrder(value: unknown): LTrackerMemoryOrder {
  return value === "oldest_to_newest" || value === "newest_to_oldest"
    ? value
    : DEFAULT_SETTINGS.memory.order;
}

function injectionFormat(value: unknown): LTrackerInjectionFormat {
  if (value === "compact") return "compact_text";
  return value === "embedded_tag"
    || value === "compact_text"
    || value === "pretty_json"
    || value === "minimal"
    ? value
    : DEFAULT_SETTINGS.injection.format;
}

function injectionPlacement(value: unknown): LTrackerInjectionPlacement {
  return value === "append_to_last_assistant"
    || value === "system_before_last"
    || value === "system_after_history"
    ? value
    : DEFAULT_SETTINGS.injection.injectionPlacement;
}

function injectionRoleFallback(value: unknown): LTrackerInjectionRoleFallback {
  return value === "system" || value === "assistant"
    ? value
    : DEFAULT_SETTINGS.injection.roleFallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function clampNullableNumber(
  source: Record<string, unknown>,
  key: string,
  fallback: number | null,
  min: number,
  max: number,
  integer = false,
): number | null {
  if (!hasOwn(source, key)) return fallback;
  const value = source[key];
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() ? Number(value) : null;
  if (numeric === null || !Number.isFinite(numeric)) return null;
  const clamped = Math.min(max, Math.max(min, numeric));
  return integer ? Math.round(clamped) : clamped;
}

function connectionMode(value: unknown): LTrackerConnectionMode {
  return value === "active_quiet"
    || value === "selected_connection_quiet"
    || value === "selected_connection_raw"
    ? value
    : DEFAULT_SETTINGS.connection.mode;
}

function reasoningSource(value: unknown): LTrackerReasoningSource {
  return value === "inherit" || value === "off" || value === "custom"
    ? value
    : DEFAULT_SETTINGS.connection.reasoning.source;
}

function reasoningEffort(value: unknown): LTrackerReasoningEffort {
  return value === "auto"
    || value === "none"
    || value === "minimal"
    || value === "low"
    || value === "medium"
    || value === "high"
    || value === "max"
    || value === "xhigh"
    ? value
    : DEFAULT_SETTINGS.connection.reasoning.effort;
}

function thinkingDisplay(value: unknown): LTrackerThinkingDisplay {
  return value === "auto" || value === "summarized" || value === "omitted"
    ? value
    : DEFAULT_SETTINGS.connection.reasoning.thinkingDisplay;
}

export function repairSettings(value: unknown): LTrackerSettings {
  const source = isRecord(value) ? value : {};
  const autoSource = isRecord(source.auto) ? source.auto : {};
  const memorySourceObject = isRecord(source.memory) ? source.memory : {};
  const injectionSource = isRecord(source.injection) ? source.injection : {};
  const rendererSource = isRecord(source.renderer) ? source.renderer : {};
  const messageDisplaySource = isRecord(source.messageDisplay) ? source.messageDisplay : {};
  const connectionSource = isRecord(source.connection) ? source.connection : {};
  const connectionParameterSource = isRecord(connectionSource.parameters) ? connectionSource.parameters : {};
  const connectionReasoningSource = isRecord(connectionSource.reasoning) ? connectionSource.reasoning : {};
  const previewSource = rendererSource.previewSource === "latest_message_snapshot" || rendererSource.previewSource === "latest_chat_snapshot"
    ? rendererSource.previewSource
    : DEFAULT_SETTINGS.renderer.previewSource;
  const messageDisplayPlacement = messageDisplaySource.placement === "bottom" || messageDisplaySource.placement === "top"
    ? messageDisplaySource.placement
    : DEFAULT_SETTINGS.messageDisplay.placement;
  const messageDisplaySourceSetting = messageDisplaySource.source === "latest_chat_snapshot" || messageDisplaySource.source === "message_attached_snapshot"
    ? messageDisplaySource.source
    : DEFAULT_SETTINGS.messageDisplay.source;
  const messageDisplayRenderMode = messageDisplaySource.renderMode === "compact_text"
    || messageDisplaySource.renderMode === "pretty_json"
    || messageDisplaySource.renderMode === "html_template"
    ? messageDisplaySource.renderMode
    : DEFAULT_SETTINGS.messageDisplay.renderMode;
  const messageDisplayAttachmentMode = messageDisplaySource.attachmentMode === "embedded_tracker_tag"
    || messageDisplaySource.attachmentMode === "both"
    || messageDisplaySource.attachmentMode === "sidecar_snapshot"
    ? messageDisplaySource.attachmentMode
    : DEFAULT_SETTINGS.messageDisplay.attachmentMode;
  const messageDisplayDisplayMode = messageDisplaySource.displayMode === "inline_button_popover"
    || messageDisplaySource.displayMode === "drawer_history_only"
    || messageDisplaySource.displayMode === "inline_full"
    ? messageDisplaySource.displayMode
    : DEFAULT_SETTINGS.messageDisplay.displayMode;
  const messageDisplayControlDensity = messageDisplaySource.controlDensity === "comfortable"
    || messageDisplaySource.controlDensity === "compact"
    ? messageDisplaySource.controlDensity
    : DEFAULT_SETTINGS.messageDisplay.controlDensity;
  const messageDisplayControlPlacement = messageDisplaySource.controlPlacement === "inside_tracker_header"
    || messageDisplaySource.controlPlacement === "message_header"
    ? messageDisplaySource.controlPlacement
    : DEFAULT_SETTINGS.messageDisplay.controlPlacement;
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    recentMessageLimit: clampNumber(
      source.recentMessageLimit,
      SETTINGS_LIMITS.recentMessageLimit.default,
      SETTINGS_LIMITS.recentMessageLimit.min,
      SETTINGS_LIMITS.recentMessageLimit.max,
    ),
    maxMessageChars: clampNumber(
      source.maxMessageChars,
      SETTINGS_LIMITS.maxMessageChars.default,
      SETTINGS_LIMITS.maxMessageChars.min,
      SETTINGS_LIMITS.maxMessageChars.max,
    ),
    generationTimeoutMs: clampNumber(
      source.generationTimeoutMs,
      SETTINGS_LIMITS.generationTimeoutMs.default,
      SETTINGS_LIMITS.generationTimeoutMs.min,
      SETTINGS_LIMITS.generationTimeoutMs.max,
    ),
    saveRawOutput: typeof source.saveRawOutput === "boolean"
      ? source.saveRawOutput
      : DEFAULT_SETTINGS.saveRawOutput,
    savePromptPreview: typeof source.savePromptPreview === "boolean"
      ? source.savePromptPreview
      : DEFAULT_SETTINGS.savePromptPreview,
    auto: {
      autoModeEnabled: typeof autoSource.autoModeEnabled === "boolean"
        ? autoSource.autoModeEnabled
        : DEFAULT_SETTINGS.auto.autoModeEnabled,
      autoDebounceMs: clampNumber(
        autoSource.autoDebounceMs,
        SETTINGS_LIMITS.autoDebounceMs.default,
        SETTINGS_LIMITS.autoDebounceMs.min,
        SETTINGS_LIMITS.autoDebounceMs.max,
      ),
      skipFirstMessages: clampNumber(
        autoSource.skipFirstMessages,
        SETTINGS_LIMITS.skipFirstMessages.default,
        SETTINGS_LIMITS.skipFirstMessages.min,
        SETTINGS_LIMITS.skipFirstMessages.max,
      ),
      triggerAfterAssistantMessages: typeof autoSource.triggerAfterAssistantMessages === "boolean"
        ? autoSource.triggerAfterAssistantMessages
        : DEFAULT_SETTINGS.auto.triggerAfterAssistantMessages,
      triggerAfterUserMessages: typeof autoSource.triggerAfterUserMessages === "boolean"
        ? autoSource.triggerAfterUserMessages
        : DEFAULT_SETTINGS.auto.triggerAfterUserMessages,
      attachSnapshotToMessage: typeof autoSource.attachSnapshotToMessage === "boolean"
        ? autoSource.attachSnapshotToMessage
        : DEFAULT_SETTINGS.auto.attachSnapshotToMessage,
      onlyWhenChatActive: typeof autoSource.onlyWhenChatActive === "boolean"
        ? autoSource.onlyWhenChatActive
        : DEFAULT_SETTINGS.auto.onlyWhenChatActive,
    },
    memory: {
      enabled: typeof memorySourceObject.enabled === "boolean"
        ? memorySourceObject.enabled
        : DEFAULT_SETTINGS.memory.enabled,
      includeInTrackerGeneration: typeof memorySourceObject.includeInTrackerGeneration === "boolean"
        ? memorySourceObject.includeInTrackerGeneration
        : DEFAULT_SETTINGS.memory.includeInTrackerGeneration,
      retainCount: clampNumber(
        memorySourceObject.retainCount,
        SETTINGS_LIMITS.memoryRetainCount.default,
        SETTINGS_LIMITS.memoryRetainCount.min,
        SETTINGS_LIMITS.memoryRetainCount.max,
      ),
      fullSnapshotCount: clampNumber(
        memorySourceObject.fullSnapshotCount,
        SETTINGS_LIMITS.memoryFullSnapshotCount.default,
        SETTINGS_LIMITS.memoryFullSnapshotCount.min,
        SETTINGS_LIMITS.memoryFullSnapshotCount.max,
      ),
      compactOlderSnapshots: typeof memorySourceObject.compactOlderSnapshots === "boolean"
        ? memorySourceObject.compactOlderSnapshots
        : DEFAULT_SETTINGS.memory.compactOlderSnapshots,
      maxMemoryChars: clampNumber(
        memorySourceObject.maxMemoryChars,
        SETTINGS_LIMITS.maxMemoryChars.default,
        SETTINGS_LIMITS.maxMemoryChars.min,
        SETTINGS_LIMITS.maxMemoryChars.max,
      ),
      source: memorySource(memorySourceObject.source),
      excludeTargetMessage: typeof memorySourceObject.excludeTargetMessage === "boolean"
        ? memorySourceObject.excludeTargetMessage
        : DEFAULT_SETTINGS.memory.excludeTargetMessage,
      order: memoryOrder(memorySourceObject.order),
      requireSamePreset: typeof memorySourceObject.requireSamePreset === "boolean"
        ? memorySourceObject.requireSamePreset
        : DEFAULT_SETTINGS.memory.requireSamePreset,
      requireSameSwipeWhenAvailable: typeof memorySourceObject.requireSameSwipeWhenAvailable === "boolean"
        ? memorySourceObject.requireSameSwipeWhenAvailable
        : DEFAULT_SETTINGS.memory.requireSameSwipeWhenAvailable,
    },
    injection: {
      enabled: typeof injectionSource.enabled === "boolean"
        ? injectionSource.enabled
        : DEFAULT_SETTINGS.injection.enabled,
      retainCount: clampNumber(
        injectionSource.retainCount,
        SETTINGS_LIMITS.injectionRetainCount.default,
        SETTINGS_LIMITS.injectionRetainCount.min,
        SETTINGS_LIMITS.injectionRetainCount.max,
      ),
      format: injectionFormat(injectionSource.format),
      injectionPlacement: injectionPlacement(injectionSource.injectionPlacement),
      includeOnlyIfMissingFromPrompt: typeof injectionSource.includeOnlyIfMissingFromPrompt === "boolean"
        ? injectionSource.includeOnlyIfMissingFromPrompt
        : DEFAULT_SETTINGS.injection.includeOnlyIfMissingFromPrompt,
      stripOlderTrackerBlocks: typeof injectionSource.stripOlderTrackerBlocks === "boolean"
        ? injectionSource.stripOlderTrackerBlocks
        : DEFAULT_SETTINGS.injection.stripOlderTrackerBlocks,
      maxInjectedChars: clampNumber(
        injectionSource.maxInjectedChars,
        SETTINGS_LIMITS.maxInjectedChars.default,
        SETTINGS_LIMITS.maxInjectedChars.min,
        SETTINGS_LIMITS.maxInjectedChars.max,
      ),
      roleFallback: injectionRoleFallback(injectionSource.roleFallback),
      includeHeader: typeof injectionSource.includeHeader === "boolean"
        ? injectionSource.includeHeader
        : DEFAULT_SETTINGS.injection.includeHeader,
      header: typeof injectionSource.header === "string" && injectionSource.header.trim()
        ? injectionSource.header.trim().slice(0, 120)
        : DEFAULT_SETTINGS.injection.header,
    },
    renderer: {
      enabled: typeof rendererSource.enabled === "boolean"
        ? rendererSource.enabled
        : DEFAULT_SETTINGS.renderer.enabled,
      previewSource,
      missingValuePlaceholder: typeof rendererSource.missingValuePlaceholder === "string"
        ? rendererSource.missingValuePlaceholder
        : DEFAULT_SETTINGS.renderer.missingValuePlaceholder,
      maxRenderedChars: clampNumber(
        rendererSource.maxRenderedChars,
        SETTINGS_LIMITS.maxRenderedChars.default,
        SETTINGS_LIMITS.maxRenderedChars.min,
        SETTINGS_LIMITS.maxRenderedChars.max,
      ),
      allowInlineStyles: typeof rendererSource.allowInlineStyles === "boolean"
        ? rendererSource.allowInlineStyles
        : DEFAULT_SETTINGS.renderer.allowInlineStyles,
    },
    messageDisplay: {
      enabled: typeof messageDisplaySource.enabled === "boolean"
        ? messageDisplaySource.enabled
        : DEFAULT_SETTINGS.messageDisplay.enabled,
      useDomInjection: typeof messageDisplaySource.useDomInjection === "boolean"
        ? messageDisplaySource.useDomInjection
        : DEFAULT_SETTINGS.messageDisplay.useDomInjection,
      fallbackToIframeWidget: typeof messageDisplaySource.fallbackToIframeWidget === "boolean"
        ? messageDisplaySource.fallbackToIframeWidget
        : DEFAULT_SETTINGS.messageDisplay.fallbackToIframeWidget,
      attachmentMode: messageDisplayAttachmentMode,
      displayMode: messageDisplayDisplayMode,
      placement: messageDisplayPlacement,
      source: messageDisplaySourceSetting,
      renderMode: messageDisplayRenderMode,
      allowInlineStyles: typeof messageDisplaySource.allowInlineStyles === "boolean"
        ? messageDisplaySource.allowInlineStyles
        : DEFAULT_SETTINGS.messageDisplay.allowInlineStyles,
      deduplicateRenderWarnings: typeof messageDisplaySource.deduplicateRenderWarnings === "boolean"
        ? messageDisplaySource.deduplicateRenderWarnings
        : DEFAULT_SETTINGS.messageDisplay.deduplicateRenderWarnings,
      showRenderWarningsInDiagnosticsOnly: typeof messageDisplaySource.showRenderWarningsInDiagnosticsOnly === "boolean"
        ? messageDisplaySource.showRenderWarningsInDiagnosticsOnly
        : DEFAULT_SETTINGS.messageDisplay.showRenderWarningsInDiagnosticsOnly,
      showDebugSwipeKey: typeof messageDisplaySource.showDebugSwipeKey === "boolean"
        ? messageDisplaySource.showDebugSwipeKey
        : DEFAULT_SETTINGS.messageDisplay.showDebugSwipeKey,
      showGenerateButtonForMissingTracker: typeof messageDisplaySource.showGenerateButtonForMissingTracker === "boolean"
        ? messageDisplaySource.showGenerateButtonForMissingTracker
        : DEFAULT_SETTINGS.messageDisplay.showGenerateButtonForMissingTracker,
      controlDensity: messageDisplayControlDensity,
      controlPlacement: messageDisplayControlPlacement,
      showExpandedHeaderActions: typeof messageDisplaySource.showExpandedHeaderActions === "boolean"
        ? messageDisplaySource.showExpandedHeaderActions
        : DEFAULT_SETTINGS.messageDisplay.showExpandedHeaderActions,
      showBottomActionsInInlineTracker: typeof messageDisplaySource.showBottomActionsInInlineTracker === "boolean"
        ? messageDisplaySource.showBottomActionsInInlineTracker
        : DEFAULT_SETTINGS.messageDisplay.showBottomActionsInInlineTracker,
      collapsedByDefault: typeof messageDisplaySource.collapsedByDefault === "boolean"
        ? messageDisplaySource.collapsedByDefault
        : DEFAULT_SETTINGS.messageDisplay.collapsedByDefault,
      compactCollapsedHeader: typeof messageDisplaySource.compactCollapsedHeader === "boolean"
        ? messageDisplaySource.compactCollapsedHeader
        : DEFAULT_SETTINGS.messageDisplay.compactCollapsedHeader,
      showTimestamp: typeof messageDisplaySource.showTimestamp === "boolean"
        ? messageDisplaySource.showTimestamp
        : DEFAULT_SETTINGS.messageDisplay.showTimestamp,
      showPresetName: typeof messageDisplaySource.showPresetName === "boolean"
        ? messageDisplaySource.showPresetName
        : DEFAULT_SETTINGS.messageDisplay.showPresetName,
      showDebugCopyButtonsInHistory: typeof messageDisplaySource.showDebugCopyButtonsInHistory === "boolean"
        ? messageDisplaySource.showDebugCopyButtonsInHistory
        : typeof messageDisplaySource.showCopyButton === "boolean"
          ? messageDisplaySource.showCopyButton
          : DEFAULT_SETTINGS.messageDisplay.showDebugCopyButtonsInHistory,
      showWidgetRegenerateButton: typeof messageDisplaySource.showWidgetRegenerateButton === "boolean"
        ? messageDisplaySource.showWidgetRegenerateButton
        : DEFAULT_SETTINGS.messageDisplay.showWidgetRegenerateButton,
      showEditButton: typeof messageDisplaySource.showEditButton === "boolean"
        ? messageDisplaySource.showEditButton
        : DEFAULT_SETTINGS.messageDisplay.showEditButton,
      showDeleteButton: typeof messageDisplaySource.showDeleteButton === "boolean"
        ? messageDisplaySource.showDeleteButton
        : DEFAULT_SETTINGS.messageDisplay.showDeleteButton,
      showNoTrackerForSwipe: typeof messageDisplaySource.showNoTrackerForSwipe === "boolean"
        ? messageDisplaySource.showNoTrackerForSwipe
        : DEFAULT_SETTINGS.messageDisplay.showNoTrackerForSwipe,
      showGenerationDuration: typeof messageDisplaySource.showGenerationDuration === "boolean"
        ? messageDisplaySource.showGenerationDuration
        : DEFAULT_SETTINGS.messageDisplay.showGenerationDuration,
      minimizedMaxHeightPx: clampNumber(
        messageDisplaySource.minimizedMaxHeightPx,
        SETTINGS_LIMITS.minimizedMaxHeightPx.default,
        SETTINGS_LIMITS.minimizedMaxHeightPx.min,
        SETTINGS_LIMITS.minimizedMaxHeightPx.max,
      ),
      maxRenderedChars: clampNumber(
        messageDisplaySource.maxRenderedChars,
        SETTINGS_LIMITS.maxMessageDisplayRenderedChars.default,
        SETTINGS_LIMITS.maxMessageDisplayRenderedChars.min,
        SETTINGS_LIMITS.maxMessageDisplayRenderedChars.max,
      ),
    },
    connection: {
      mode: connectionMode(connectionSource.mode),
      selectedConnectionId: stringOrNull(connectionSource.selectedConnectionId),
      selectedConnectionName: stringOrNull(connectionSource.selectedConnectionName),
      refreshConnectionsOnDrawerOpen: typeof connectionSource.refreshConnectionsOnDrawerOpen === "boolean"
        ? connectionSource.refreshConnectionsOnDrawerOpen
        : DEFAULT_SETTINGS.connection.refreshConnectionsOnDrawerOpen,
      parameters: {
        temperature: clampNullableNumber(
          connectionParameterSource,
          "temperature",
          TRACKER_CONNECTION_PARAMETER_LIMITS.temperature.default,
          TRACKER_CONNECTION_PARAMETER_LIMITS.temperature.min,
          TRACKER_CONNECTION_PARAMETER_LIMITS.temperature.max,
        ),
        max_tokens: clampNullableNumber(
          connectionParameterSource,
          "max_tokens",
          TRACKER_CONNECTION_PARAMETER_LIMITS.max_tokens.default,
          TRACKER_CONNECTION_PARAMETER_LIMITS.max_tokens.min,
          TRACKER_CONNECTION_PARAMETER_LIMITS.max_tokens.max,
          true,
        ),
        top_p: clampNullableNumber(
          connectionParameterSource,
          "top_p",
          null,
          TRACKER_CONNECTION_PARAMETER_LIMITS.top_p.min,
          TRACKER_CONNECTION_PARAMETER_LIMITS.top_p.max,
        ),
        frequency_penalty: clampNullableNumber(
          connectionParameterSource,
          "frequency_penalty",
          null,
          TRACKER_CONNECTION_PARAMETER_LIMITS.frequency_penalty.min,
          TRACKER_CONNECTION_PARAMETER_LIMITS.frequency_penalty.max,
        ),
        presence_penalty: clampNullableNumber(
          connectionParameterSource,
          "presence_penalty",
          null,
          TRACKER_CONNECTION_PARAMETER_LIMITS.presence_penalty.min,
          TRACKER_CONNECTION_PARAMETER_LIMITS.presence_penalty.max,
        ),
      },
      reasoning: {
        source: reasoningSource(connectionReasoningSource.source),
        apiReasoning: typeof connectionReasoningSource.apiReasoning === "boolean"
          ? connectionReasoningSource.apiReasoning
          : DEFAULT_SETTINGS.connection.reasoning.apiReasoning,
        effort: reasoningEffort(connectionReasoningSource.effort),
        thinkingDisplay: thinkingDisplay(connectionReasoningSource.thinkingDisplay),
      },
      testPrompt: typeof connectionSource.testPrompt === "string" && connectionSource.testPrompt.trim()
        ? connectionSource.testPrompt
        : TRACKER_CONNECTION_DEFAULT_TEST_PROMPT,
    },
  };
}
