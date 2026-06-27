import {
  SETTINGS_SCHEMA_VERSION,
  type LTrackerSettings,
} from "./types";

export const SETTINGS_LIMITS = {
  recentMessageLimit: { min: 1, max: 200, default: 24 },
  maxMessageChars: { min: 500, max: 50_000, default: 8_000 },
  generationTimeoutMs: { min: 10_000, max: 180_000, default: 45_000 },
  autoDebounceMs: { min: 250, max: 30_000, default: 1_500 },
  skipFirstMessages: { min: 0, max: 100, default: 2 },
  maxInjectedChars: { min: 500, max: 20_000, default: 3_000 },
  maxRenderedChars: { min: 1_000, max: 200_000, default: 50_000 },
  maxMessageDisplayRenderedChars: { min: 1_000, max: 200_000, default: 50_000 },
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
    placement: "top",
    source: "message_attached_snapshot",
    renderMode: "html_template",
    collapsedByDefault: true,
    showTimestamp: true,
    showPresetName: true,
    showDebugCopyButtonsInHistory: true,
    showWidgetRegenerateButton: true,
    showGenerationDuration: true,
    maxRenderedChars: SETTINGS_LIMITS.maxMessageDisplayRenderedChars.default,
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

export function repairSettings(value: unknown): LTrackerSettings {
  const source = isRecord(value) ? value : {};
  const autoSource = isRecord(source.auto) ? source.auto : {};
  const injectionSource = isRecord(source.injection) ? source.injection : {};
  const rendererSource = isRecord(source.renderer) ? source.renderer : {};
  const messageDisplaySource = isRecord(source.messageDisplay) ? source.messageDisplay : {};
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
      placement: messageDisplayPlacement,
      source: messageDisplaySourceSetting,
      renderMode: messageDisplayRenderMode,
      collapsedByDefault: typeof messageDisplaySource.collapsedByDefault === "boolean"
        ? messageDisplaySource.collapsedByDefault
        : DEFAULT_SETTINGS.messageDisplay.collapsedByDefault,
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
      showGenerationDuration: typeof messageDisplaySource.showGenerationDuration === "boolean"
        ? messageDisplaySource.showGenerationDuration
        : DEFAULT_SETTINGS.messageDisplay.showGenerationDuration,
      maxRenderedChars: clampNumber(
        messageDisplaySource.maxRenderedChars,
        SETTINGS_LIMITS.maxMessageDisplayRenderedChars.default,
        SETTINGS_LIMITS.maxMessageDisplayRenderedChars.min,
        SETTINGS_LIMITS.maxMessageDisplayRenderedChars.max,
      ),
    },
  };
}
