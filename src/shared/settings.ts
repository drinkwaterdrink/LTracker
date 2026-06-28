import {
  SETTINGS_SCHEMA_VERSION,
  type LTrackerConnectionMode,
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
  maxInjectedChars: { min: 500, max: 20_000, default: 3_000 },
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
  injection: {
    enabled: false,
    mode: "latest_chat_snapshot",
    format: "compact",
    maxInjectedChars: SETTINGS_LIMITS.maxInjectedChars.default,
    includeHeader: true,
    includeTimestamp: true,
    includeSourceMessageId: false,
    onlyInjectWhenSnapshotExists: true,
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
  const injectionSource = isRecord(source.injection) ? source.injection : {};
  const rendererSource = isRecord(source.renderer) ? source.renderer : {};
  const messageDisplaySource = isRecord(source.messageDisplay) ? source.messageDisplay : {};
  const connectionSource = isRecord(source.connection) ? source.connection : {};
  const connectionParameterSource = isRecord(connectionSource.parameters) ? connectionSource.parameters : {};
  const connectionReasoningSource = isRecord(connectionSource.reasoning) ? connectionSource.reasoning : {};
  const mode = injectionSource.mode === "latest_message_snapshot" || injectionSource.mode === "latest_chat_snapshot"
    ? injectionSource.mode
    : DEFAULT_SETTINGS.injection.mode;
  const format = injectionSource.format === "pretty_json" || injectionSource.format === "minimal" || injectionSource.format === "compact"
    ? injectionSource.format
    : DEFAULT_SETTINGS.injection.format;
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
    injection: {
      enabled: typeof injectionSource.enabled === "boolean"
        ? injectionSource.enabled
        : DEFAULT_SETTINGS.injection.enabled,
      mode,
      format,
      maxInjectedChars: clampNumber(
        injectionSource.maxInjectedChars,
        SETTINGS_LIMITS.maxInjectedChars.default,
        SETTINGS_LIMITS.maxInjectedChars.min,
        SETTINGS_LIMITS.maxInjectedChars.max,
      ),
      includeHeader: typeof injectionSource.includeHeader === "boolean"
        ? injectionSource.includeHeader
        : DEFAULT_SETTINGS.injection.includeHeader,
      includeTimestamp: typeof injectionSource.includeTimestamp === "boolean"
        ? injectionSource.includeTimestamp
        : DEFAULT_SETTINGS.injection.includeTimestamp,
      includeSourceMessageId: typeof injectionSource.includeSourceMessageId === "boolean"
        ? injectionSource.includeSourceMessageId
        : DEFAULT_SETTINGS.injection.includeSourceMessageId,
      onlyInjectWhenSnapshotExists: typeof injectionSource.onlyInjectWhenSnapshotExists === "boolean"
        ? injectionSource.onlyInjectWhenSnapshotExists
        : DEFAULT_SETTINGS.injection.onlyInjectWhenSnapshotExists,
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
