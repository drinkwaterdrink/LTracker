import type {
  SpindleFrontendContext,
  SpindleMessageTagIntercept,
} from "lumiverse-spindle-types";
import {
  DEFAULT_TRACKER_PRESET,
  DEFAULT_TRACKER_PRESET_ID,
  exportTrackerPreset,
} from "./shared/presets";
import {
  importPresetPack,
  validatePresetReport,
  generateSampleSnapshot,
  sanitizePackFileName,
  exportPresetPack,
  PRESET_PACK_KIND,
  type PresetValidationReport,
  type PresetPackImportResult,
} from "./shared/presetPack";
import { detectTemplateRendererRequirements, renderHtmlTemplate } from "./shared/htmlTemplateRenderer";
import {
  groupMessageTrackerHistory,
  MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON,
  MESSAGE_NATIVE_TOOLBAR_SUPPORTED,
  MESSAGE_WIDGET_ID,
  renderMessageTracker,
  LTRACKER_DOM_TRACKER_CSS,
  currentRunningDuration,
  iconSvg,
} from "./shared/messageDisplay";
import { LTRACKER_TAG_NAME, LTRACKER_TAG_TYPE } from "./shared/embeddedTrackerTag";
import { DEFAULT_SETTINGS } from "./shared/settings";
import {
  DEFAULT_TRACKER_CONNECTION_PARAMETERS,
  TRACKER_CONNECTION_DEFAULT_TEST_PROMPT,
} from "./shared/generationRequest";
import { capturePresetRenderLock } from "./shared/presetRenderLock";
import {
  estimateCharsFromTokens,
  estimateTokensFromChars,
} from "./shared/budget";
import type {
  BackendMessage,
  FrontendMessage,
  FrontendState,
  LTrackerError,
  LTrackerConnectionMode,
  LTrackerBudgetMode,
  LTrackerDisplaySurface,
  LTrackerExpandedWidthMode,
  LTrackerInjectionFormat,
  LTrackerInjectionPlacement,
  LTrackerInjectionRoleFallback,
  LTrackerReasoningEffort,
  LTrackerReasoningSource,
  LTrackerInlineAction,
  LTrackerMemoryOrder,
  LTrackerMemorySource,
  LTrackerMessageDisplayPlacement,
  LTrackerMountPointStrategy,
  LTrackerRenderSource,
  LTrackerRenderLabSurface,
  LTrackerRenderLabViewport,
  LTrackerSampleSnapshotMode,
  LTrackerSettings,
  LTrackerThinkingDisplay,
  TemplateTrustMode,
  MessageTrackerHistoryEntry,
  MessageAttachedSnapshot,
  TrackerPresetDraft,
  TrackerSchemaPreset,
} from "./shared/types";
import {
  EXTENSION_VERSION,
  SETTINGS_SCHEMA_VERSION,
  SPINDLE_TYPES_VERSION,
  STORAGE_SCHEMA_VERSION,
} from "./shared/types";
import { DEFAULT_SWIPE_KEY } from "./shared/swipeIdentity";

const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1.45.9L12 17.62 5.45 20.9A1 1 0 0 1 4 20V4a1 1 0 0 1 1-1Zm1 2v13.38l5.55-2.78a1 1 0 0 1 .9 0L18 18.38V5H6Zm3 3h6v2H9V8Zm0 4h5v2H9v-2Z"/></svg>`;

const STYLES = `
.ltracker-root {
  color: inherit;
  font: inherit;
  min-height: 100%;
}
.ltracker-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
}
.ltracker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ltracker-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}
.ltracker-version {
  opacity: 0.72;
  font-size: 0.82rem;
}
.ltracker-actions,
.ltracker-copy-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ltracker-section-nav,
.ltracker-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ltracker-nav-chip,
.ltracker-chip {
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 999px;
  color: inherit;
  display: inline-flex;
  font-size: 0.78rem;
  line-height: 1.2;
  min-height: 28px;
  padding: 5px 8px;
  text-decoration: none;
}
.ltracker-nav-chip {
  background: color-mix(in srgb, currentColor 5%, transparent);
}
.ltracker-render-lab {
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 6px;
  margin-top: 12px;
  padding: 10px;
}
.ltracker-render-lab-stage {
  border: 1px dashed color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 6px;
  box-sizing: border-box;
  margin: 10px auto 0;
  max-width: 100%;
  overflow: auto;
  padding: 8px;
}
.ltracker-render-lab-stage.ltd-bg-plain_dark {
  background: #111318;
}
.ltracker-render-lab-stage.ltd-bg-chat {
  background: linear-gradient(180deg, rgba(36,38,48,.95), rgba(18,20,28,.95));
}
.ltracker-render-lab-stage.ltd-bg-checker {
  background-color: #151515;
  background-image:
    linear-gradient(45deg, rgba(255,255,255,.08) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255,255,255,.08) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255,255,255,.08) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.08) 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
}
.ltracker-render-lab-preview {
  box-sizing: border-box;
  margin: 0 auto;
  min-height: 80px;
  overflow: auto;
}
.ltracker-render-lab-preview.ltd-lab-inline_contained {
  max-width: 420px;
}
.ltracker-render-lab-preview.ltd-lab-inline_wide,
.ltracker-render-lab-preview.ltd-lab-popover_body,
.ltracker-render-lab-preview.ltd-lab-fullscreen_reader_body {
  width: 100%;
}
.ltracker-template-chip {
  align-items: center;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 999px;
  display: inline-flex;
  gap: 4px;
  line-height: 1.2;
  margin: 2px;
  max-width: 100%;
  padding: 2px 7px;
  vertical-align: middle;
}
.ltracker-template-chip > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ltracker-section {
  scroll-margin-top: 12px;
}
.ltracker-section-title {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.ltracker-button {
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: inherit;
  cursor: pointer;
  font: inherit;
  min-height: 36px;
  padding: 7px 11px;
}
.ltracker-button:hover {
  background: color-mix(in srgb, currentColor 13%, transparent);
}
.ltracker-button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}
.ltracker-reader-fixed-close {
  align-items: center;
  background: #ea4335;
  border: 1px solid #ff8a80;
  border-radius: 999px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  font: 700 22px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  height: 44px;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  padding: 0;
  position: fixed;
  right: max(10px, env(safe-area-inset-right));
  top: max(10px, env(safe-area-inset-top));
  width: 44px;
  z-index: 1000002;
}
.ltracker-display-preview-overlay {
  inset: 0;
  pointer-events: none;
  position: fixed;
  z-index: 999998;
}
.ltracker-display-preview-panel {
  background: #161616;
  border: 1px solid #333;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  color: #eee;
  display: flex;
  flex-direction: column;
  font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  max-height: 76vh;
  overflow: hidden;
  pointer-events: auto;
  position: fixed;
}
.ltracker-display-preview-header {
  align-items: center;
  border-bottom: 1px solid #333;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
  padding: 9px 12px;
}
.ltracker-display-preview-body {
  overflow: auto;
  padding: 12px;
}
.ltracker-panel {
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 8px;
  padding: 11px;
}
.ltracker-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  margin-bottom: 6px;
  opacity: 0.75;
}
.ltracker-status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  min-height: 28px;
  padding: 4px 9px;
}
.ltracker-save-status {
  align-items: center;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 999px;
  display: inline-flex;
  min-height: 34px;
  opacity: 0.78;
  padding: 6px 10px;
}
.ltracker-error {
  color: #ff6b6b;
  white-space: pre-wrap;
}
.ltracker-json,
.ltracker-text {
  margin: 0;
  max-height: 52vh;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.82rem;
  line-height: 1.45;
}
.ltracker-render-preview {
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 8px;
  margin-top: 8px;
  max-height: 52vh;
  overflow: auto;
  padding: 10px;
}
.ltracker-render-placeholder {
  opacity: 0.72;
}
.ltracker-grid {
  display: grid;
  grid-template-columns: minmax(120px, 0.6fr) minmax(0, 1.4fr);
  gap: 7px 10px;
  align-items: start;
}
.ltracker-key {
  font-size: 0.78rem;
  opacity: 0.72;
}
.ltracker-value {
  min-width: 0;
  overflow-wrap: anywhere;
}
.ltracker-settings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
}
.ltracker-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ltracker-field input[type="number"],
.ltracker-field input[type="text"],
.ltracker-field select {
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, currentColor 6%, transparent);
  color: inherit;
  font: inherit;
  min-height: 34px;
  padding: 6px 8px;
}
.ltracker-field textarea {
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, currentColor 6%, transparent);
  color: inherit;
  font: inherit;
  min-height: 120px;
  padding: 8px;
  resize: vertical;
  white-space: pre;
}
.ltracker-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ltracker-editor-textarea {
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, currentColor 6%, transparent);
  color: inherit;
  font: 12px/1.42 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  min-height: 220px;
  padding: 8px;
  resize: vertical;
  width: 100%;
}
.ltracker-editor-error {
  color: #ff6b6b;
  min-height: 1em;
}
.ltracker-field-wide {
  grid-column: 1 / -1;
}
.ltracker-check {
  align-items: center;
  display: flex;
  gap: 8px;
  min-height: 34px;
}
.ltracker-note {
  font-size: 0.82rem;
  line-height: 1.4;
  margin: 8px 0 0;
  opacity: 0.74;
}
.ltracker-details {
  margin-top: 8px;
}
.ltracker-details summary {
  cursor: pointer;
  font-weight: 650;
  margin-bottom: 8px;
}
.ltracker-history-list {
  display: grid;
  gap: 10px;
}
.ltracker-history-entry {
  border: 1px solid color-mix(in srgb, currentColor 13%, transparent);
  border-radius: 8px;
  padding: 9px;
}
.ltracker-history-entry summary {
  cursor: pointer;
  font-weight: 650;
}
.ltracker-history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 4px;
  opacity: 0.74;
  font-size: 0.78rem;
}
.ltr-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.ltracker-dom-popover {
  margin: 0 0 6px;
}
.ltracker-dom-popover summary {
  cursor: pointer;
  list-style: none;
}
.ltracker-dom-popover summary::-webkit-details-marker {
  display: none;
}
.ltracker-dom-popover-button {
  align-items: center;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 8px;
  display: inline-flex;
  gap: 7px;
  min-height: 30px;
  padding: 4px 8px;
}
.ltracker-dom-popover-panel {
  border: 1px solid color-mix(in srgb, currentColor 13%, transparent);
  border-radius: 8px;
  margin-top: 6px;
  max-height: 52vh;
  overflow: auto;
  padding: 8px;
}
@media (max-width: 520px) {
  .ltracker-shell {
    padding: 10px;
  }
  .ltracker-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .ltracker-actions,
  .ltracker-copy-actions {
    width: 100%;
  }
  .ltracker-button {
    flex: 1 1 140px;
  }
  .ltracker-grid {
    grid-template-columns: 1fr;
  }
}
.ltracker-undo-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: color-mix(in srgb, currentColor 8%, transparent);
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 0.85rem;
}
.ltracker-undo-banner button {
  background: #3b82f6;
  color: #fff;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}
.ltracker-undo-banner button:hover {
  opacity: 0.9;
}
.ltracker-confirm-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.ltracker-confirm-dialog {
  background: var(--ltracker-bg, #1e1e1e);
  color: var(--ltracker-fg, #ffffff);
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 12px;
  padding: 20px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}
.ltracker-confirm-dialog h3 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 1.15rem;
}
.ltracker-confirm-dialog p {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 0.92rem;
  line-height: 1.4;
  opacity: 0.85;
}
.ltracker-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.ltd-danger {
  background: #ef4444 !important;
  color: #fff !important;
  border-color: #ef4444 !important;
}
.ltd-danger:hover {
  background: #dc2626 !important;
}
`;

function emptyError(message: string): LTrackerError {
  return {
    stage: "unknown",
    message,
    createdAt: new Date().toISOString(),
  };
}

function emptyState(): FrontendState {
  return {
    version: EXTENSION_VERSION,
    status: "idle",
    chatId: null,
    snapshot: null,
    latestMessageSnapshot: null,
    error: null,
    permissions: {
      generation: false,
      chats: false,
      chatMutation: false,
      contextHandler: false,
      interceptor: false,
    },
    settings: DEFAULT_SETTINGS,
    diagnostics: {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      extensionVersion: EXTENSION_VERSION,
      chatId: null,
      status: "idle",
      storageKey: null,
      buildInfo: {
        extensionVersion: EXTENSION_VERSION,
        storageSchemaVersion: STORAGE_SCHEMA_VERSION,
        settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
        spindleTypesVersion: SPINDLE_TYPES_VERSION,
        buildTarget: "es2022",
      },
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
      autoSubscriptionActive: false,
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
      interceptorRegistered: false,
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
      lastRenderPresetSource: null,
      lastRenderLockedPresetId: null,
      lastRenderLockedPresetName: null,
      lastRenderLockedPresetVersion: null,
      lastRenderPresetMismatchDetected: null,
      lastRenderPresetFallbackReason: null,
      lastRenderSnapshotCreatedAt: null,
      lastRenderSource: null,
      lastRenderStatus: null,
      lastRenderWarnings: [],
      lastRenderErrors: [],
      lastSanitizedHtmlChars: 0,
      lastFallbackTextChars: 0,
      contextHandlerRegistered: false,
      contextHandlerDisabledReason: "Context handler injection remains disabled in 0.15; safe normal prompt injection uses the Lumiverse interceptor path instead.",
      lastContextHandlerError: null,
      messageDisplayEnabled: false,
      messageDisplayMode: null,
      messageDisplayPlacement: null,
      messageDisplayHydratedCount: 0,
      lastMessageDisplayHydratedAt: null,
      lastMessageDisplayError: null,
      selectedDisplaySurface: DEFAULT_SETTINGS.messageDisplay.displaySurface,
      resolvedDisplaySurface: DEFAULT_SETTINGS.messageDisplay.displaySurface,
      displaySurfaceKind: "inline",
      displaySurfaceMountStrategy: null,
      displaySurfaceParentWidthConstrained: null,
      displaySurfaceFallbackReason: null,
      lastDisplaySurfaceRehydratedAt: null,
      lastDisplayPreviewAction: null,
      lastDisplayPreviewResult: null,
      lastDisplayPreviewReason: null,
      messageLocalUiSupported: false,
      messageLocalUiFallbackReason: null,
      messageSnapshotIndexCount: 0,
      lastWidgetRegenerateMessageId: null,
      lastWidgetRegenerateStartedAt: null,
      lastWidgetRegenerateCompletedAt: null,
      lastWidgetRegenerateDurationMs: null,
      lastWidgetRegenerateCancelledAt: null,
      lastWidgetRegenerateError: null,
      activeWidgetRegenerationCount: 0,
      messageWidgetPlacementResolved: "host_default",
      messageWidgetPlacementReason: null,
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
      selectedConnectionId: null,
      selectedConnectionName: null,
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
      lastMemoryIndexCount: 0,
      lastMemoryCandidateCount: 0,
      lastMemoryLoadedSnapshotCount: 0,
      lastMemoryLoadDurationMs: 0,
      lastMemoryLoadSkippedCount: 0,
      lastJobTimeoutAt: null,
      lastJobTimeoutJobId: null,
      lastJobTimeoutMessageId: null,
      lastJobTimeoutSwipeKey: null,
      staleJobsEvictedCount: 0,
      lastHistoryOrphanCount: 0,
      lastPresetEstimatedTokens: null,
      lastPresetEstimatedRenderedChars: null,
      lastPresetPackImportAt: null,
      lastPresetPackImportStatus: null,
      lastPresetPackImportError: null,
      lastPresetPackImportSizeChars: null,
      lastPresetPackImportEstimatedTokens: null,
      lastPresetPackExportAt: null,
      lastPresetPackExportName: null,
      lastPresetValidationAt: null,
      lastPresetValidationStatus: null,
      lastPresetValidationErrorCount: 0,
      lastPresetValidationWarningCount: 0,
      lastPresetValidationEstimatedTokens: null,
      lastPresetValidationEstimatedRenderedChars: null,
      lastPresetLintAt: null,
      lastPresetLintWarningCount: 0,
      lastPresetLintErrorCount: 0,
      lastPresetLintRawObjectPaths: [],
      lastPresetLintMobileRiskCount: 0,
      lastPresetRenderLabViewport: null,
      lastPresetRenderLabSurface: null,
      lastPresetRenderLabResult: null,
      lastPresetRenderLabRenderedChars: null,
      lastPresetRenderLabWarnings: [],
      connectionProfileSelected: false,
      effectiveTrackerConnectionMode: "active_quiet",
      effectiveTrackerConnectionReason: "default",
      lastSelectedConnectionFallbackReason: null,
      lastTrackerProfileMissingAt: null,
      lastDisplaySurface: "inline_contained",
      lastPopoverOpenedAt: null,
      lastPopoverMessageId: null,
      lastPopoverSwipeKey: null,
      lastPopoverWidthPx: null,
      lastPopoverHeightPx: null,
      lastReaderOpenedAt: null,
      lastReaderMessageId: null,
      lastReaderSwipeKey: null,
      lastResolvedViewportWidth: null,
      lastResolvedViewportHeight: null,
      lastWidthModeResolved: null,
      lastWidthConstraintReason: null,
      lastWidthOverflowDetected: null,
    },
    memoryPreview: null,
    injectionPreview: null,
    renderPreview: null,
    messageSnapshotHistory: [],
    messageControlCandidates: [],
    presets: [DEFAULT_TRACKER_PRESET],
    activePreset: DEFAULT_TRACKER_PRESET,
    activePresetState: {
      selectedPresetId: DEFAULT_TRACKER_PRESET.id,
      selectedAt: new Date(0).toISOString(),
    },
    connectionProfiles: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBackendMessage(payload: unknown): payload is BackendMessage {
  return isRecord(payload) && typeof payload.type === "string";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function checked(value: boolean): string {
  return value ? " checked" : "";
}

function disabled(value: boolean): string {
  return value ? " disabled" : "";
}

function selected(value: boolean): string {
  return value ? " selected" : "";
}

function labelForStatus(status: FrontendState["status"]): string {
  if (status === "generating") return "generating";
  if (status === "error") return "error";
  return "idle";
}

function renderRow(label: string, value: string | number | null): string {
  return `
    <div class="ltracker-key">${escapeHtml(label)}</div>
    <div class="ltracker-value">${escapeHtml(value === null || value === "" ? "None" : String(value))}</div>
  `;
}

function numberInputValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function compactRecord(value: Record<string, unknown> | null): string | null {
  if (!value) return null;
  return JSON.stringify(value);
}

function renderError(error: LTrackerError | null): string {
  if (!error) return "None";
  const detail = error.detail ? `\n\n${error.detail}` : "";
  return `[${error.stage}] ${error.message}${detail}`;
}

function renderJson(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  return JSON.stringify(value, null, 2);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDurationMs(durationMs: number | null): string | null {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return null;
  if (durationMs < 1_000) return `${Math.round(durationMs)}ms`;
  const seconds = durationMs / 1_000;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}

function budgetHint(tokens: number): string {
  return `~${estimateCharsFromTokens(tokens).toLocaleString()} chars`;
}

function charLimitHint(chars: number): string {
  return `~${estimateTokensFromChars(chars).toLocaleString()} tokens`;
}

function requestId(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function setup(ctx: SpindleFrontendContext): () => void {
  const cleanups: Array<() => void> = [];
  let state = emptyState();
  let disposed = false;
  const widgetCleanups = new Map<string, () => void>();
  const widgetSignatures = new Map<string, string>();
  const domInjections = new Map<string, { element: Element; cleanup: () => void }>();
  const domSignatures = new Map<string, string>();
  const embeddedTagEntries = new Map<string, MessageTrackerHistoryEntry>();
  const optimisticJobs = new Map<string, { startedAt: string; jobId: string | null }>();
  let settingsAutosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let settingsSaveStatus: "idle" | "saving" | "saved" | "failed" = "saved";
  let historyFilterText = "";
  let historyShowDuplicates = false;
  let historyCurrentMessageOnly = false;
  let historyErrorsOnly = false;
  let historyCurrentPresetOnly = false;
  let historySelectedSwipeOnly = false;
  let currentHistoryLimit = 25;
  let recentlyDeletedBanner: { messageId: string; swipeKey: string; timer: ReturnType<typeof setTimeout> } | null = null;

  let stagedImportPack: PresetPackImportResult | null = null;
  let stagedImportRawText = "";
  let stagedValidationReport: PresetValidationReport | null = null;
  let stagedSampleSnapshot: Record<string, unknown> | null = null;
  let stagedSampleRenderResult: import("./shared/htmlTemplateRenderer").HtmlTemplateRenderResult | null = null;
  let renderLabViewport: LTrackerRenderLabViewport = "phone_narrow";
  let renderLabCustomWidth = 360;
  let renderLabSurface: LTrackerRenderLabSurface = "inline_wide";
  let renderLabBackground: "plain_dark" | "chat" | "checker" = "chat";
  let renderLabSampleMode: LTrackerSampleSnapshotMode = "stress";

  let activePopoverElement: HTMLElement | null = null;
  let activePopoverEntry: MessageTrackerHistoryEntry | null = null;
  let activeReaderElement: HTMLElement | null = null;
  let activeDisplayPreviewElement: HTMLElement | null = null;

  const removeStyle = ctx.dom.addStyle(STYLES);
  cleanups.push(removeStyle);

  if (!document.getElementById("ltracker-dom-style")) {
    const styleTag = document.createElement("style");
    styleTag.id = "ltracker-dom-style";
    styleTag.textContent = LTRACKER_DOM_TRACKER_CSS;
    document.head.appendChild(styleTag);
  }

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (state.settings.expandedWidth.closeOnEscape) {
        if (activePopoverElement) {
          closePopover();
        }
        if (activeReaderElement) {
          closeFullscreenReader();
        }
        if (activeDisplayPreviewElement) {
          closeDisplayPreview();
        }
      }
    }
  };
  document.addEventListener("keydown", handleGlobalKeyDown);
  cleanups.push(() => document.removeEventListener("keydown", handleGlobalKeyDown));

  const tab = ctx.ui.registerDrawerTab({
    id: "ltracker",
    title: "LTracker",
    shortName: "LTrack",
    headerTitle: "LTracker",
    description: "Generate and inspect the latest tracker snapshot",
    keywords: ["tracker", "state", "continuity", "json"],
    iconSvg: ICON,
  });
  tab.root.classList.add("ltracker-root");

  const inputAction = ctx.ui.registerInputBarAction({
    id: "ltracker-generate-tracker",
    label: "Generate Tracker",
    subtitle: "Update LTracker snapshot",
    iconSvg: ICON,
  });
  const elapsedTimer = setInterval(updateElapsedTimers, 250);
  cleanups.push(() => clearInterval(elapsedTimer));

  function activeChatId(): string | null {
    return ctx.getActiveChat().chatId;
  }

  function currentChatId(): string | null {
    return state.chatId ?? activeChatId();
  }

  function send(message: FrontendMessage): void {
    if (disposed) return;
    if (message.type === "ready" || message.type === "refresh_state") {
      message.historyLimit = currentHistoryLimit;
    }
    ctx.sendToBackend(message);
  }

  function trackerEntryKey(messageId: string, swipeKey: string): string {
    return `${messageId}:${swipeKey}`;
  }

  function stateActiveJob(messageId: string, swipeKey: string): { jobId: string; startedAt: string } | null {
    return state.diagnostics.activeTrackerJobs.find((job) => job.messageId === messageId && job.swipeKey === swipeKey) ?? null;
  }

  function activeJobFor(messageId: string, swipeKey: string): { isActive: boolean; jobId: string | null; startedAt: string | null } {
    const key = trackerEntryKey(messageId, swipeKey);
    const optimistic = optimisticJobs.get(key) ?? null;
    const active = stateActiveJob(messageId, swipeKey);
    return {
      isActive: Boolean(optimistic || active),
      jobId: active?.jobId ?? optimistic?.jobId ?? null,
      startedAt: optimistic?.startedAt ?? active?.startedAt ?? null,
    };
  }

  function beginOptimisticJob(messageId: string, swipeKey: string): void {
    optimisticJobs.set(trackerEntryKey(messageId, swipeKey), {
      startedAt: new Date().toISOString(),
      jobId: null,
    });
  }

  function endOptimisticJob(messageId: string, swipeKey: string): void {
    optimisticJobs.delete(trackerEntryKey(messageId, swipeKey));
  }

  function syncOptimisticJobsFromState(nextState: FrontendState): void {
    const activeKeys = new Set(nextState.diagnostics.activeTrackerJobs.map((job) => trackerEntryKey(job.messageId, job.swipeKey)));
    for (const key of Array.from(optimisticJobs.keys())) {
      if (activeKeys.has(key) || nextState.status !== "generating") optimisticJobs.delete(key);
    }
  }

  function noteInlineAction(action: LTrackerInlineAction, messageId: string, swipeKey: string, error: string | null = null): void {
    const now = new Date().toISOString();
    localDiagnostics({
      lastInlineActionClicked: action,
      lastInlineActionAt: now,
      lastInlineActionError: error,
      lastMessageControlMessageId: messageId,
      lastMessageControlSwipeKey: swipeKey,
    });
    if (action === "generate") {
      localDiagnostics({
        lastGenerateButtonMessageId: messageId,
        lastGenerateButtonClickedAt: now,
      });
    }
  }

  function settingsSaveStatusLabel(): string {
    if (settingsSaveStatus === "saving") return "Saving...";
    if (settingsSaveStatus === "failed") return "Save failed";
    return "Saved";
  }

  function setSettingsSaveStatus(status: typeof settingsSaveStatus): void {
    settingsSaveStatus = status;
    const label = settingsSaveStatusLabel();
    for (const element of Array.from(tab.root.querySelectorAll<HTMLElement>("[data-settings-save-status]"))) {
      element.textContent = label;
    }
  }

  function clearSettingsAutosaveTimer(): void {
    if (!settingsAutosaveTimer) return;
    clearTimeout(settingsAutosaveTimer);
    settingsAutosaveTimer = null;
  }

  function scheduleSettingsAutosave(): void {
    clearSettingsAutosaveTimer();
    setSettingsSaveStatus("saving");
    settingsAutosaveTimer = setTimeout(() => {
      settingsAutosaveTimer = null;
      saveSettings("settings-auto");
    }, 650);
  }

  function isSettingsControl(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("[data-setting], [data-auto-timing-setting], [data-budget-setting], [data-memory-setting], [data-injection-setting], [data-renderer-setting], [data-message-display-setting], [data-expanded-width-setting], [data-connection-setting], [data-connection-parameter], [data-connection-reasoning]"));
  }

  function isDisplaySurfaceControl(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("[data-message-display-setting=\"displaySurface\"], [data-expanded-width-setting]"));
  }

  function applyDisplaySettingsOptimistically(renderAfter = false): void {
    state = {
      ...state,
      settings: readSettings(),
    };
    hydrateMessageWidgets();
    localDiagnostics({
      selectedDisplaySurface: state.settings.messageDisplay.displaySurface,
      resolvedDisplaySurface: resolveDisplaySurface(state.settings),
      displaySurfaceKind: displaySurfaceKind(resolveDisplaySurface(state.settings)),
      lastDisplaySurfaceRehydratedAt: new Date().toISOString(),
    });
    if (renderAfter) render();
  }

  function localDiagnostics(update: Partial<FrontendState["diagnostics"]>): void {
    state = {
      ...state,
      diagnostics: {
        ...state.diagnostics,
        ...update,
      },
    };
  }

  function rerenderHistoryEntry(entry: MessageTrackerHistoryEntry): MessageTrackerHistoryEntry {
    const active = activeJobFor(entry.indexEntry.messageId, entry.indexEntry.swipeKey);
    const wasRegenerating = entry.rendered.isRegenerating;
    const chatId = entry.snapshot?.chatId ?? state.chatId ?? activeChatId() ?? "";
    return {
      ...entry,
      rendered: renderMessageTracker({
        messageId: entry.indexEntry.messageId,
        messageIndex: entry.indexEntry.messageIndex,
        attachedSnapshot: entry.snapshot,
        latestChatSnapshot: state.snapshot,
        preset: state.activePreset,
        presets: state.presets,
        activePreset: state.activePreset,
        settings: state.settings.messageDisplay,
        swipeIdentity: {
          chatId,
          messageId: entry.indexEntry.messageId,
          swipeKey: entry.indexEntry.swipeKey,
          swipeIndex: entry.indexEntry.swipeIndex,
          swipeId: entry.indexEntry.swipeId,
          swipeContentHash: entry.indexEntry.swipeContentHash,
          swipeKeySource: entry.indexEntry.swipeKeySource,
        },
        isRegenerating: active.isActive || wasRegenerating,
        activeJobId: active.jobId ?? entry.rendered.activeJobId,
        activeJobStartedAt: active.startedAt ?? (wasRegenerating ? entry.rendered.generationStartedAt : null),
      }),
    };
  }

  function allIndexedHistoryEntries(): MessageTrackerHistoryEntry[] {
    const active = currentChatId();
    const entries: MessageTrackerHistoryEntry[] = [];
    for (const entry of state.messageSnapshotHistory) {
      if (active && entry.snapshot?.chatId && entry.snapshot.chatId !== active) continue;
      entries.push(rerenderHistoryEntry(entry));
    }
    for (const entry of embeddedTagEntries.values()) {
      if (active && entry.snapshot?.chatId && entry.snapshot.chatId !== active) continue;
      entries.push(rerenderHistoryEntry(entry));
    }
    return entries;
  }

  function allRenderableEntries(): MessageTrackerHistoryEntry[] {
    const entries = new Map<string, MessageTrackerHistoryEntry>();
    for (const entry of groupMessageTrackerHistory(allIndexedHistoryEntries(), false).entries) {
      entries.set(trackerEntryKey(entry.indexEntry.messageId, entry.indexEntry.swipeKey), entry);
    }
    for (const entry of state.messageControlCandidates) {
      const key = trackerEntryKey(entry.indexEntry.messageId, entry.indexEntry.swipeKey);
      if (entries.has(key)) continue;
      entries.set(key, rerenderHistoryEntry(entry));
    }
    return Array.from(entries.values());
  }

  function findHistoryEntry(messageId: string | undefined, swipeKey: string | undefined | null = null) {
    if (!messageId) return null;
    return allRenderableEntries().find((entry) => {
      return entry.indexEntry.messageId === messageId && (!swipeKey || entry.indexEntry.swipeKey === swipeKey);
    }) ?? null;
  }

  function activeWidgetJobId(messageId: string, swipeKey: string): string | null {
    const active = activeJobFor(messageId, swipeKey);
    return active.jobId ?? findHistoryEntry(messageId, swipeKey)?.rendered.activeJobId ?? null;
  }

  function generateMessageTracker(messageId: string, swipeKey: string): void {
    beginOptimisticJob(messageId, swipeKey);
    noteInlineAction("generate", messageId, swipeKey);
    hydrateMessageWidgets();
    send({
      type: "generate_message_tracker",
      chatId: activeChatId(),
      messageId,
      swipeKey,
      requestId: requestId("widget-generate"),
    });
  }

  function toggleMessageRegeneration(messageId: string, swipeKey: string, jobId: string | null = null): void {
    const active = activeJobFor(messageId, swipeKey);
    const activeJobId = jobId || active.jobId || activeWidgetJobId(messageId, swipeKey);
    if (active.isActive || activeJobId) {
      endOptimisticJob(messageId, swipeKey);
      noteInlineAction("cancel", messageId, swipeKey);
      hydrateMessageWidgets();
      send({
        type: "cancel_tracker_generation",
        chatId: activeChatId(),
        jobId: activeJobId,
        messageId,
        swipeKey,
        requestId: requestId("widget-cancel"),
      });
      return;
    }
    beginOptimisticJob(messageId, swipeKey);
    noteInlineAction("regenerate", messageId, swipeKey);
    hydrateMessageWidgets();
    send({
      type: "regenerate_message_tracker",
      chatId: activeChatId(),
      messageId,
      swipeKey,
      requestId: requestId("widget-regenerate"),
    });
  }

  function handleWidgetPayload(expectedMessageId: string, expectedSwipeKey: string, payload: unknown): void {
    if (
      !isRecord(payload)
      || payload.type !== "ltracker_widget_action"
      || (payload.action !== "toggle_regenerate" && payload.action !== "generate")
      || payload.messageId !== expectedMessageId
    ) return;
    if ("swipeKey" in payload && payload.swipeKey !== expectedSwipeKey) return;
    const jobId = typeof payload.jobId === "string" && payload.jobId ? payload.jobId : null;
    if (payload.action === "generate") generateMessageTracker(expectedMessageId, expectedSwipeKey);
    else toggleMessageRegeneration(expectedMessageId, expectedSwipeKey, jobId);
  }

  function cleanupMessageWidgets(keepKeys: Set<string> = new Set()): void {
    for (const [key, cleanup] of widgetCleanups) {
      if (keepKeys.has(key)) continue;
      cleanup();
      widgetCleanups.delete(key);
      widgetSignatures.delete(key);
    }
  }

  function cleanupDomInjections(keepKeys: Set<string> = new Set()): void {
    for (const [key, record] of domInjections) {
      if (keepKeys.has(key)) continue;
      record.cleanup();
      domInjections.delete(key);
      domSignatures.delete(key);
    }
  }

  function markInjectedTrackerGenerating(root: Element): void {
    const startedAt = new Date().toISOString();
    const button = root.querySelector<HTMLElement>("[data-ltracker-dom-action='toggle_regenerate'], [data-ltracker-dom-action='generate']");
    button?.classList.add("ltd-spinning");
    button?.setAttribute("data-ltracker-dom-action", "toggle_regenerate");
    button?.setAttribute("title", "Cancel tracker generation");
    button?.setAttribute("aria-label", "Cancel tracker generation");
    const status = root.querySelector<HTMLElement>("[data-ltracker-status]");
    if (status) status.textContent = "generating";
    const elapsed = root.querySelector<HTMLElement>("[data-ltracker-elapsed]");
    if (elapsed) {
      elapsed.dataset.startedAt = startedAt;
      elapsed.textContent = "0ms";
    }
  }

  function updateElapsedTimers(): void {
    const now = Date.now();
    for (const element of ctx.dom.queryAll("[data-ltracker-elapsed]")) {
      if (!(element instanceof HTMLElement)) continue;
      const startedAt = element.dataset.startedAt;
      if (!startedAt) continue;
      const startedMs = Date.parse(startedAt);
      if (!Number.isFinite(startedMs)) continue;
      element.textContent = formatDurationMs(now - startedMs) ?? "0ms";
    }
  }

  function handleDomTrackerAction(event: Event): void {
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>("[data-ltracker-dom-action]")
      : null;
    if (!target) return;
    const tracker = target.closest<HTMLElement>("[data-ltracker-message-id][data-ltracker-swipe-key]");
    if (!tracker) return;
    const messageId = ctx.dom.getMessageId(target) ?? tracker.dataset.ltrackerMessageId;
    const swipeKey = tracker.dataset.ltrackerSwipeKey;
    if (!messageId || !swipeKey) return;
    const action = target.dataset.ltrackerDomAction;
    const entry = findHistoryEntry(messageId, swipeKey);
    if (action === "generate") {
      markInjectedTrackerGenerating(tracker);
      generateMessageTracker(messageId, swipeKey);
    }
    if (action === "toggle_regenerate") {
      markInjectedTrackerGenerating(tracker);
      toggleMessageRegeneration(messageId, swipeKey, entry?.rendered.activeJobId ?? null);
    }
    if (action === "reader" && entry) {
      event.preventDefault();
      openFullscreenReader(entry);
    }
    if (action === "edit" && entry) {
      noteInlineAction("edit", messageId, swipeKey);
      openTrackerEditor(entry);
    }
    if (action === "delete") {
      noteInlineAction("delete", messageId, swipeKey);
      void deleteMessageTracker(messageId, swipeKey);
    }
  }

  function renderInlineTrackerHtml(entry: MessageTrackerHistoryEntry): string {
    return entry.rendered.domHtml;
  }

  function queryMountPoint(root: Element, selector: string): Element | null {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  function displaySurfaceKind(surface: LTrackerDisplaySurface): "inline" | "overlay" | "drawer_only" {
    if (surface === "drawer_only") return "drawer_only";
    if (surface === "anchored_popover" || surface === "fullscreen_reader") return "overlay";
    return "inline";
  }

  function elementWidth(element: Element): number {
    if (!(element instanceof HTMLElement)) return 0;
    return element.getBoundingClientRect().width || element.clientWidth || 0;
  }

  function findWideMessageRow(messageElement: Element): Element | null {
    const doc = messageElement.ownerDocument || document;
    const viewWidth = doc.defaultView?.innerWidth ?? 0;
    let best: Element = messageElement;
    let bestWidth = elementWidth(messageElement);
    let current = messageElement.parentElement;
    let hops = 0;
    while (current && current !== doc.body && hops < 7) {
      const width = elementWidth(current);
      if (width > bestWidth + 24) {
        best = current;
        bestWidth = width;
      }
      if (viewWidth > 0 && width >= viewWidth * 0.72) break;
      current = current.parentElement;
      hops += 1;
    }
    return best;
  }

  function resolveTrackerMountPoint(messageElement: Element, surface: LTrackerDisplaySurface): {
    target: Element;
    strategy: LTrackerMountPointStrategy;
    fallbackReason: string | null;
  } {
    if (surface === "inline_wide") {
      const wideTarget = findWideMessageRow(messageElement);
      if (wideTarget && wideTarget !== messageElement) {
        return { target: wideTarget, strategy: "wide_message_row", fallbackReason: null };
      }
      return { target: messageElement, strategy: "wide_message_element", fallbackReason: wideTarget ? null : "wide row search returned no usable parent" };
    }
    const officialBody = queryMountPoint(
      messageElement,
      "[data-lumiverse-message-body], [data-message-body], [data-message-content], [data-chat-message-content]",
    );
    if (officialBody) {
      return { target: officialBody, strategy: "official_message_body", fallbackReason: null };
    }
    const scopedBubble = queryMountPoint(messageElement, ":scope > div[class*='bubble']");
    if (scopedBubble) {
      return { target: scopedBubble, strategy: "bubble_adapter", fallbackReason: null };
    }
    const nestedBubble = queryMountPoint(messageElement, "div[class*='bubble']");
    if (nestedBubble) {
      return { target: nestedBubble, strategy: "bubble_adapter", fallbackReason: null };
    }
    return { target: messageElement, strategy: "official_message_element", fallbackReason: null };
  }

  function positionForPlacement(placement: LTrackerMessageDisplayPlacement): InsertPosition {
    return placement === "top" ? "afterbegin" : "beforeend";
  }

  function resolveDisplaySurface(settings: LTrackerSettings): LTrackerDisplaySurface {
    if (settings.messageDisplay.displaySurface) return settings.messageDisplay.displaySurface;
    const displayMode = settings.messageDisplay.displayMode;
    const widthMode = settings.expandedWidth.expandedWidthMode;
    if (displayMode === "drawer_history_only") return "drawer_only";
    if (displayMode === "inline_button_popover") return "anchored_popover";
    if (displayMode === "inline_full") {
      if (widthMode === "contained") return "inline_contained";
      if (widthMode === "wide" || widthMode === "full_mobile") return "inline_wide";
      if (widthMode === "popover") return "anchored_popover";
    }
    return "inline_contained";
  }

  function displayModeForSurface(surface: LTrackerDisplaySurface): LTrackerSettings["messageDisplay"]["displayMode"] {
    if (surface === "drawer_only") return "drawer_history_only";
    if (surface === "anchored_popover") return "inline_button_popover";
    return "inline_full";
  }

  function togglePopover(entry: MessageTrackerHistoryEntry, anchorElement: HTMLElement): void {
    if (
      activePopoverEntry
      && activePopoverEntry.indexEntry.messageId === entry.indexEntry.messageId
      && activePopoverEntry.indexEntry.swipeKey === entry.indexEntry.swipeKey
    ) {
      closePopover();
    } else {
      openPopover(entry, anchorElement);
    }
  }

  function openPopover(entry: MessageTrackerHistoryEntry, anchorElement: HTMLElement, preview = false): void {
    closePopover();
    closeFullscreenReader();
    closeDisplayPreview();

    const doc = anchorElement.ownerDocument || document;
    const overlay = doc.createElement("div");
    overlay.className = "ltracker-popover-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "999999",
      pointerEvents: "none",
    });

    const backdrop = doc.createElement("div");
    backdrop.className = "ltracker-popover-backdrop";
    Object.assign(backdrop.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: state.settings.expandedWidth.popoverBackdrop ? "rgba(0,0,0,0.55)" : "transparent",
      pointerEvents: "auto",
    });
    if (state.settings.expandedWidth.closeOnBackdropClick) {
      backdrop.addEventListener("click", closePopover);
    }
    overlay.appendChild(backdrop);

    const panel = doc.createElement("div");
    panel.className = "ltracker-popover-panel";

    const width = state.settings.expandedWidth;
    const body = entry.rendered.html || `<pre class="ltd-pre" style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(entry.rendered.textFallback)}</pre>`;
    const meta = [
      entry.rendered.presetName ? entry.rendered.presetName : null,
      entry.rendered.snapshotCreatedAt ? entry.rendered.snapshotCreatedAt : null,
      entry.rendered.controlState.debugSwipeLabel,
    ].filter((item): item is string => Boolean(item)).join(" / ");

    const duration = state.settings.messageDisplay.showGenerationDuration
      ? formatDurationMs(entry.rendered.generationDurationMs)
      : null;
    const elapsedMarkup = state.settings.messageDisplay.showGenerationDuration
      ? entry.rendered.isRegenerating && entry.rendered.generationStartedAt
        ? `<span class="ltd-pill" data-started-at="${escapeHtml(entry.rendered.generationStartedAt)}">${escapeHtml(currentRunningDuration(entry.rendered.generationStartedAt) ?? "0ms")}</span>`
        : duration ? `<span class="ltd-pill">${escapeHtml(duration)}</span>` : ""
      : "";
    const statusMarkup = entry.rendered.isRegenerating
      ? `<span class="ltd-pill" data-ltracker-status>generating</span>`
      : entry.rendered.controlState.error ? `<span class="ltd-pill ltd-warning" data-ltracker-status>warning</span>` : "";

    panel.innerHTML = `
      <div class="ltd-popover-header" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; min-width: 0; border-bottom: 1px solid #333; padding: 8px 10px 8px 12px; background: #222; border-top-left-radius: 8px; border-top-right-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; font-family: sans-serif; min-width: 0; flex: 1 1 auto; flex-wrap: wrap;">
          <span style="font-weight: bold; color: #9b5cff; font-size: 13px;">${preview ? "LTracker Popover Preview" : "LTracker Popover"}</span>
          <span style="font-size: 11px; color: #aaa; min-width: 0; max-width: min(42vw, 250px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(meta)}</span>
          ${elapsedMarkup}
          ${statusMarkup}
        </div>
        <div class="ltd-popover-actions" style="display: flex; gap: 4px; align-items: center; flex: 0 0 auto;">
          <button class="ltd-icon-button" data-popover-action="reader" title="Open fullscreen reader" style="width: 22px; height: 22px; padding: 0;">${iconSvg("reader")}</button>
          <button class="ltd-icon-button" data-popover-action="toggle_regenerate" title="Regenerate" style="width: 22px; height: 22px; padding: 0;">${iconSvg(entry.rendered.isRegenerating ? "stop" : "refresh")}</button>
          <button class="ltd-icon-button" data-popover-action="edit" title="Edit" style="width: 22px; height: 22px; padding: 0;">${iconSvg("edit")}</button>
          <button class="ltd-icon-button" data-popover-action="delete" title="Delete" style="width: 22px; height: 22px; padding: 0;">${iconSvg("delete")}</button>
          <button class="ltd-icon-button" data-popover-action="close" title="Close" style="background: #ea4335; border-color: #ea4335; color: #fff; min-width: 44px; min-height: 44px; width: 44px; height: 44px; padding: 0; font-weight: bold; font-size: 20px; line-height: 1;">&times;</button>
        </div>
      </div>
      <div class="ltd-popover-body" style="padding: 12px; overflow-y: auto; background: #161616; flex: 1; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; overflow-x: auto; max-width: 100%;">
        ${body}
      </div>
    `;

    Object.assign(panel.style, {
      position: "absolute",
      background: "#161616",
      border: "1px solid #333",
      borderRadius: "8px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
      color: "#eee",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "12px",
      pointerEvents: "auto",
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
      maxWidth: "calc(100vw - max(20px, env(safe-area-inset-left) + env(safe-area-inset-right)))",
      maxHeight: "calc(100vh - max(20px, env(safe-area-inset-top) + env(safe-area-inset-bottom)))",
      overflow: "hidden",
    });

    const anchorRect = anchorElement.getBoundingClientRect();
    const isMobile = doc.defaultView ? doc.defaultView.innerWidth < width.fullscreenBreakpointPx : false;
    const viewWidth = doc.defaultView ? doc.defaultView.innerWidth : 800;
    const viewHeight = doc.defaultView ? doc.defaultView.innerHeight : 600;

    if (isMobile || (width.preferFullscreenOnMobile && isMobile)) {
      Object.assign(panel.style, {
        width: `calc(100vw - ${Math.max(8, width.mobileHorizontalMarginPx * 2)}px)`,
        height: `${width.expandedContentMaxHeightVh}vh`,
        bottom: `max(${Math.max(4, width.mobileHorizontalMarginPx)}px, env(safe-area-inset-bottom))`,
        left: `max(${Math.max(4, width.mobileHorizontalMarginPx)}px, env(safe-area-inset-left))`,
        right: `max(${Math.max(4, width.mobileHorizontalMarginPx)}px, env(safe-area-inset-right))`,
        position: "fixed",
      });
    } else {
      const panelWidth = Math.min(width.maxExpandedWidthPx, viewWidth - 40);
      const panelHeight = Math.min((viewHeight * width.expandedContentMaxHeightVh) / 100, 800);
      Object.assign(panel.style, {
        width: `${panelWidth}px`,
        height: `${panelHeight}px`,
      });

      const top = anchorRect.bottom + (doc.defaultView?.scrollY ?? 0);
      const left = Math.max(10, Math.min(viewWidth - panelWidth - 20, anchorRect.left + (doc.defaultView?.scrollX ?? 0)));

      if (top + panelHeight > viewHeight + (doc.defaultView?.scrollY ?? 0)) {
        const topAbove = anchorRect.top + (doc.defaultView?.scrollY ?? 0) - panelHeight - 10;
        if (topAbove > 10) {
          panel.style.top = `${topAbove}px`;
        } else {
          panel.style.top = "50%";
          panel.style.left = "50%";
          panel.style.transform = "translate(-50%, -50%)";
          panel.style.position = "fixed";
        }
      } else {
        panel.style.top = `${top}px`;
      }
      if (panel.style.position !== "fixed") {
        panel.style.left = `${left}px`;
      }
    }

    panel.addEventListener("click", (e) => {
      const btn = e.target instanceof HTMLElement ? e.target.closest("[data-popover-action]") : null;
      if (!btn) return;
      const action = (btn as HTMLElement).dataset.popoverAction;
      const messageId = entry.indexEntry.messageId;
      const swipeKey = entry.indexEntry.swipeKey;

      if (action === "close") {
        closePopover();
      }
      if (action === "reader") {
        closePopover();
        openFullscreenReader(entry);
      }
      if (action === "toggle_regenerate") {
        toggleMessageRegeneration(messageId, swipeKey, entry.rendered.activeJobId ?? null);
        closePopover();
      }
      if (action === "edit") {
        closePopover();
        openTrackerEditor(entry);
      }
      if (action === "delete") {
        closePopover();
        void deleteMessageTracker(messageId, swipeKey);
      }
    });

    overlay.appendChild(panel);
    doc.body.appendChild(overlay);
    activePopoverElement = overlay;
    activePopoverEntry = entry;

    localDiagnostics({
      lastDisplaySurface: "anchored_popover",
      lastPopoverOpenedAt: new Date().toISOString(),
      lastPopoverMessageId: entry.indexEntry.messageId,
      lastPopoverSwipeKey: entry.indexEntry.swipeKey,
      lastPopoverWidthPx: panel.offsetWidth || null,
      lastPopoverHeightPx: panel.offsetHeight || null,
      lastResolvedViewportWidth: viewWidth,
      lastResolvedViewportHeight: viewHeight,
      lastDisplayPreviewAction: preview ? "popover" : state.diagnostics.lastDisplayPreviewAction,
      lastDisplayPreviewResult: preview ? "opened" : state.diagnostics.lastDisplayPreviewResult,
      lastDisplayPreviewReason: preview ? "Opened detached popover preview." : state.diagnostics.lastDisplayPreviewReason,
    });
  }

  function closePopover(): void {
    if (activePopoverElement) {
      activePopoverElement.remove();
      activePopoverElement = null;
      activePopoverEntry = null;
    }
  }

  function openFullscreenReader(entry: MessageTrackerHistoryEntry, preview = false): void {
    closePopover();
    closeFullscreenReader();
    closeDisplayPreview();

    const doc = document;
    const overlay = doc.createElement("div");
    overlay.className = "ltracker-reader-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      background: "#111",
      zIndex: "999999",
      color: "#eee",
      fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
      overflow: "hidden",
    });

    const meta = [
      entry.rendered.presetName ? entry.rendered.presetName : null,
      entry.rendered.snapshotCreatedAt ? entry.rendered.snapshotCreatedAt : null,
      entry.rendered.controlState.debugSwipeLabel,
    ].filter((item): item is string => Boolean(item)).join(" / ");

    const duration = state.settings.messageDisplay.showGenerationDuration
      ? formatDurationMs(entry.rendered.generationDurationMs)
      : null;
    const elapsedMarkup = state.settings.messageDisplay.showGenerationDuration
      ? entry.rendered.isRegenerating && entry.rendered.generationStartedAt
        ? `<span class="ltd-pill" data-started-at="${escapeHtml(entry.rendered.generationStartedAt)}">${escapeHtml(currentRunningDuration(entry.rendered.generationStartedAt) ?? "0ms")}</span>`
        : duration ? `<span class="ltd-pill">${escapeHtml(duration)}</span>` : ""
      : "";
    const statusMarkup = entry.rendered.isRegenerating
      ? `<span class="ltd-pill" data-ltracker-status>generating</span>`
      : entry.rendered.controlState.error ? `<span class="ltd-pill ltd-warning" data-ltracker-status>warning</span>` : "";

    const body = entry.rendered.html || `<pre class="ltd-pre" style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(entry.rendered.textFallback)}</pre>`;

    overlay.innerHTML = `
      <button class="ltracker-reader-fixed-close" data-reader-action="close" title="Close Reader" aria-label="Close Reader">&times;</button>
      <header class="ltracker-reader-header" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; min-width: 0; border-bottom: 1px solid #333; padding: calc(10px + env(safe-area-inset-top)) 64px 10px 16px; background: #1a1a1a; font-family: sans-serif; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 260px; flex-wrap: wrap;">
          <h2 style="margin: 0; font-size: 15px; font-weight: bold; color: #9b5cff; min-width: 0;">${preview ? "LTracker Reader Preview" : "LTracker Reader"}</h2>
          <span style="font-size: 11px; color: #aaa; min-width: 0; max-width: min(52vw, 350px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(meta)}</span>
          ${elapsedMarkup}
          ${statusMarkup}
        </div>
        <div style="display: flex; gap: 6px; align-items: center; flex: 0 0 auto; padding-right: 44px;">
          <button class="ltd-icon-button" data-reader-action="toggle_regenerate" title="Regenerate" style="width: 24px; height: 24px; padding: 0;">${iconSvg(entry.rendered.isRegenerating ? "stop" : "refresh")}</button>
          <button class="ltd-icon-button" data-reader-action="edit" title="Edit" style="width: 24px; height: 24px; padding: 0;">${iconSvg("edit")}</button>
          <button class="ltd-icon-button" data-reader-action="delete" title="Delete" style="width: 24px; height: 24px; padding: 0;">${iconSvg("delete")}</button>
          <button class="ltd-icon-button" data-reader-action="close" title="Close Reader" style="background: #ea4335; border-color: #ea4335; color: #fff; width: auto; padding: 0 12px; font-weight: bold; height: 24px; font-size: 12px; line-height: 22px; cursor: pointer; border-radius: 6px;">Close</button>
        </div>
      </header>
      <main class="ltracker-reader-body" style="flex: 1; min-height: 0; padding: 18px; overflow-y: auto; background: #111; box-sizing: border-box;">
        <div class="ltracker-reader-content-wrapper" style="width: 100%; max-width: min(100%, var(--ltracker-reader-content-max, 1100px)); margin: 0 auto; overflow-x: auto; box-sizing: border-box; background: #161616; padding: 15px; border-radius: 8px; border: 1px solid #333; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          ${body}
        </div>
      </main>
    `;

    overlay.addEventListener("click", (e) => {
      const btn = e.target instanceof HTMLElement ? e.target.closest("[data-reader-action]") : null;
      if (!btn) return;
      const action = (btn as HTMLElement).dataset.readerAction;
      const messageId = entry.indexEntry.messageId;
      const swipeKey = entry.indexEntry.swipeKey;

      if (action === "close") {
        closeFullscreenReader();
      }
      if (action === "toggle_regenerate") {
        toggleMessageRegeneration(messageId, swipeKey, entry.rendered.activeJobId ?? null);
        closeFullscreenReader();
      }
      if (action === "edit") {
        closeFullscreenReader();
        openTrackerEditor(entry);
      }
      if (action === "delete") {
        closeFullscreenReader();
        void deleteMessageTracker(messageId, swipeKey);
      }
    });

    doc.body.appendChild(overlay);
    activeReaderElement = overlay;

    localDiagnostics({
      lastDisplaySurface: "fullscreen_reader",
      lastReaderOpenedAt: new Date().toISOString(),
      lastReaderMessageId: entry.indexEntry.messageId,
      lastReaderSwipeKey: entry.indexEntry.swipeKey,
      lastDisplayPreviewAction: preview ? "fullscreen" : state.diagnostics.lastDisplayPreviewAction,
      lastDisplayPreviewResult: preview ? "opened" : state.diagnostics.lastDisplayPreviewResult,
      lastDisplayPreviewReason: preview ? "Opened fullscreen reader preview." : state.diagnostics.lastDisplayPreviewReason,
    });
  }

  function closeFullscreenReader(): void {
    if (activeReaderElement) {
      activeReaderElement.remove();
      activeReaderElement = null;
      localDiagnostics({
        lastDisplayPreviewResult: state.diagnostics.lastDisplayPreviewAction === "fullscreen" ? "closed" : state.diagnostics.lastDisplayPreviewResult,
      });
    }
  }

  function closeDisplayPreview(): void {
    if (activeDisplayPreviewElement) {
      activeDisplayPreviewElement.remove();
      activeDisplayPreviewElement = null;
    }
  }

  function renderEntryForSurface(entry: MessageTrackerHistoryEntry, surface: LTrackerDisplaySurface): MessageTrackerHistoryEntry {
    const chatId = entry.snapshot?.chatId ?? state.chatId ?? activeChatId() ?? "";
    return {
      ...entry,
      rendered: renderMessageTracker({
        messageId: entry.indexEntry.messageId,
        messageIndex: entry.indexEntry.messageIndex,
        attachedSnapshot: entry.snapshot,
        latestChatSnapshot: state.snapshot,
        preset: state.activePreset,
        presets: state.presets,
        activePreset: state.activePreset,
        settings: {
          ...state.settings.messageDisplay,
          displaySurface: surface,
          displayMode: displayModeForSurface(surface),
        },
        swipeIdentity: {
          chatId,
          messageId: entry.indexEntry.messageId,
          swipeKey: entry.indexEntry.swipeKey,
          swipeIndex: entry.indexEntry.swipeIndex,
          swipeId: entry.indexEntry.swipeId,
          swipeContentHash: entry.indexEntry.swipeContentHash,
          swipeKeySource: entry.indexEntry.swipeKeySource,
        },
        isRegenerating: entry.rendered.isRegenerating,
        activeJobId: entry.rendered.activeJobId,
        activeJobStartedAt: entry.rendered.generationStartedAt,
      }),
    };
  }

  function latestPreviewEntry(): MessageTrackerHistoryEntry | null {
    const current = findHistoryEntry(
      state.diagnostics.lastMessageControlMessageId ?? undefined,
      state.diagnostics.lastMessageControlSwipeKey,
    );
    return current ?? allRenderableEntries()[0] ?? null;
  }

  function openDisplayPreview(entry: MessageTrackerHistoryEntry, surface: "inline_contained" | "inline_wide"): void {
    closeDisplayPreview();
    closePopover();
    closeFullscreenReader();

    const renderedEntry = renderEntryForSurface(entry, surface);
    const doc = document;
    const overlay = doc.createElement("div");
    overlay.className = "ltracker-display-preview-overlay";
    const width = state.settings.expandedWidth;
    const panel = doc.createElement("section");
    panel.className = "ltracker-display-preview-panel";
    panel.style.right = surface === "inline_wide" ? `max(4px, env(safe-area-inset-right))` : "18px";
    panel.style.left = surface === "inline_wide" ? `max(4px, env(safe-area-inset-left))` : "";
    panel.style.bottom = `max(10px, env(safe-area-inset-bottom))`;
    panel.style.width = surface === "inline_wide"
      ? `calc(100vw - ${Math.max(8, width.mobileHorizontalMarginPx * 2)}px)`
      : `min(420px, calc(100vw - 24px))`;
    panel.style.maxWidth = surface === "inline_wide"
      ? `min(${width.maxExpandedWidthPx}px, calc(100vw - 8px))`
      : "min(420px, calc(100vw - 24px))";
    panel.innerHTML = `
      <div class="ltracker-display-preview-header">
        <strong>${surface === "inline_wide" ? "Preview: Inline wide" : "Preview: Inline contained"}</strong>
        <button class="ltracker-button" type="button" data-preview-action="close">Close</button>
      </div>
      <div class="ltracker-display-preview-body">
        ${renderedEntry.rendered.domHtml}
      </div>
    `;
    panel.addEventListener("click", (event) => {
      const button = event.target instanceof HTMLElement ? event.target.closest("[data-preview-action]") : null;
      if (button) {
        closeDisplayPreview();
        localDiagnostics({
          lastDisplayPreviewResult: "closed",
          lastDisplayPreviewReason: "Closed inline display preview.",
        });
      }
    });
    overlay.appendChild(panel);
    doc.body.appendChild(overlay);
    activeDisplayPreviewElement = overlay;
    localDiagnostics({
      lastDisplayPreviewAction: surface === "inline_wide" ? "wide" : "contained",
      lastDisplayPreviewResult: "opened",
      lastDisplayPreviewReason: surface === "inline_wide"
        ? "Opened a chat-width inline preview without mutating chat storage."
        : "Opened a contained inline preview without mutating chat storage.",
    });
  }

  function widthConstraintDiagnostic(element: Element, surface: LTrackerDisplaySurface): { constrained: boolean | null; reason: string | null } {
    if (!(element instanceof HTMLElement) || surface !== "inline_wide") return { constrained: null, reason: null };
    const parent = element.parentElement;
    const doc = element.ownerDocument || document;
    const viewWidth = doc.defaultView?.innerWidth ?? 0;
    if (!parent || viewWidth <= 0) return { constrained: null, reason: null };
    const parentWidth = elementWidth(parent);
    if (parentWidth > 0 && parentWidth < Math.min(viewWidth * 0.62, state.settings.expandedWidth.maxExpandedWidthPx * 0.6)) {
      return {
        constrained: true,
        reason: `Parent width ${Math.round(parentWidth)}px is much narrower than viewport ${Math.round(viewWidth)}px.`,
      };
    }
    return { constrained: false, reason: null };
  }

  function applyExpandedWidthMode(element: Element): void {
    if (!(element instanceof HTMLElement)) return;
    const width = state.settings.expandedWidth;
    const surface = resolveDisplaySurface(state.settings);
    const maxWidth = `${width.maxExpandedWidthPx}px`;
    const contained = surface === "inline_contained" || (surface === "inline_wide" && width.expandedWidthMode === "contained");
    const compactShell = surface === "anchored_popover" || surface === "fullscreen_reader";
    element.classList.toggle("ltd-chat-width", surface === "inline_wide");
    element.classList.toggle("ltd-overlay-shell", compactShell);
    element.style.setProperty("--ltracker-expanded-width", maxWidth);
    element.style.maxWidth = contained || compactShell
      ? "100%"
      : width.expandedWidthMode === "full_mobile"
        ? `min(${maxWidth}, calc(100vw - ${width.mobileHorizontalMarginPx * 2}px))`
        : `min(${maxWidth}, 100%)`;
    element.style.width = compactShell ? "auto" : "100%";
    element.style.marginLeft = "";
    element.style.marginRight = "";
    element.style.setProperty("--ltracker-expanded-max-height", `${width.expandedContentMaxHeightVh}vh`);

    const details = element.querySelector<HTMLDetailsElement>(":scope > details");
    if (compactShell) details?.removeAttribute("open");

    const summary = element.querySelector<HTMLElement>(":scope > details > summary");
    if (summary) {
      summary.addEventListener("click", (e) => {
        const currentSurface = resolveDisplaySurface(state.settings);
        if (currentSurface !== "anchored_popover" && currentSurface !== "fullscreen_reader") return;
        if (e.target instanceof HTMLElement && e.target.closest("[data-ltracker-dom-action]")) return;
        e.preventDefault();
        const messageId = element.dataset.ltrackerMessageId;
        const swipeKey = element.dataset.ltrackerSwipeKey;
        if (!messageId || !swipeKey) return;
        const entry = findHistoryEntry(messageId, swipeKey);
        if (!entry) return;
        if (currentSurface === "fullscreen_reader") {
          openFullscreenReader(entry);
        } else {
          togglePopover(entry, summary);
        }
      });
    }

    localDiagnostics({
      selectedDisplaySurface: state.settings.messageDisplay.displaySurface,
      resolvedDisplaySurface: surface,
      displaySurfaceKind: displaySurfaceKind(surface),
      expandedWidthModeResolved: width.expandedWidthMode,
      lastExpandedTrackerWidthPx: width.expandedWidthMode === "contained" ? null : width.maxExpandedWidthPx,
      lastWidthModeResolved: width.expandedWidthMode,
    });
  }

  function hydrateDomInjections(): boolean {
    const surface = resolveDisplaySurface(state.settings);
    if (
      !state.settings.messageDisplay.enabled
      || !state.settings.messageDisplay.useDomInjection
      || surface === "drawer_only"
    ) {
      cleanupDomInjections();
      localDiagnostics({
        selectedDisplaySurface: state.settings.messageDisplay.displaySurface,
        resolvedDisplaySurface: surface,
        displaySurfaceKind: displaySurfaceKind(surface),
        displaySurfaceMountStrategy: surface === "drawer_only" ? "drawer_only" : null,
        displaySurfaceFallbackReason: surface === "drawer_only" ? "Drawer history only is selected." : null,
        messageDisplayHydratedCount: 0,
      });
      return false;
    }
    const keepKeys = new Set<string>();
    let injectedAny = false;
    let hydratedCount = 0;
    for (const entry of allRenderableEntries()) {
      const html = renderInlineTrackerHtml(entry);
      if (!html.trim()) continue;
      const key = trackerEntryKey(entry.indexEntry.messageId, entry.indexEntry.swipeKey);
      const messageElement = ctx.dom.findMessageElement(entry.indexEntry.messageId);
      const requestedPlacement = state.settings.messageDisplay.placement;
      localDiagnostics({
        lastPlacementRequested: requestedPlacement,
        lastPlacementRenderAttemptAt: new Date().toISOString(),
      });
      if (!messageElement) continue;
      keepKeys.add(key);
      const mount = resolveTrackerMountPoint(messageElement, surface);
      const target = mount.target;
      const position = positionForPlacement(requestedPlacement);
      const signature = [
        entry.rendered.renderMode,
        entry.rendered.snapshotCreatedAt,
        entry.rendered.presetId,
        entry.rendered.swipeKey,
        entry.rendered.isRegenerating ? "generating" : "idle",
        entry.rendered.generationStartedAt,
        entry.rendered.activeJobId,
        entry.rendered.controlState.generationStatus,
        surface,
        state.settings.messageDisplay.displayMode,
        state.settings.expandedWidth.expandedWidthMode,
        state.settings.expandedWidth.maxExpandedWidthPx,
        state.settings.expandedWidth.mobileHorizontalMarginPx,
        state.settings.expandedWidth.expandedContentMaxHeightVh,
        mount.strategy,
        html,
      ].join("\n");
      if (domSignatures.get(key) === signature) {
        injectedAny = true;
        hydratedCount += 1;
        continue;
      }
      try {
        domInjections.get(key)?.cleanup();
        const element = ctx.dom.inject(target, html, position);
        applyExpandedWidthMode(element);
        const widthDiag = widthConstraintDiagnostic(element, surface);
        element.addEventListener("click", handleDomTrackerAction);
        domInjections.set(key, {
          element,
          cleanup: () => {
            element.removeEventListener("click", handleDomTrackerAction);
            ctx.dom.uninject(element);
          },
        });
        domSignatures.set(key, signature);
        localDiagnostics({
          selectedDisplaySurface: state.settings.messageDisplay.displaySurface,
          resolvedDisplaySurface: surface,
          displaySurfaceKind: displaySurfaceKind(surface),
          displaySurfaceMountStrategy: mount.strategy,
          displaySurfaceParentWidthConstrained: widthDiag.constrained,
          displaySurfaceFallbackReason: mount.fallbackReason ?? widthDiag.reason,
          lastDisplaySurface: surface,
          lastDisplaySurfaceRehydratedAt: new Date().toISOString(),
          lastPlacementResolved: requestedPlacement,
          lastPlacementRenderResult: "rendered",
          lastPlacementError: null,
          lastMountPointStrategy: mount.strategy,
          lastWidthConstraintReason: widthDiag.reason,
          lastWidthOverflowDetected: widthDiag.constrained,
          lastDomInjectionAt: new Date().toISOString(),
          lastDomInjectionError: null,
          lastMessageDisplayError: null,
          lastMessageControlRenderAt: new Date().toISOString(),
          lastMessageControlMessageId: entry.indexEntry.messageId,
          lastMessageControlSwipeKey: entry.indexEntry.swipeKey,
          lastMessageControlState: entry.rendered.controlState.generationStatus,
          nativeToolbarSupported: MESSAGE_NATIVE_TOOLBAR_SUPPORTED,
          nativeToolbarFallbackReason: MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON,
        });
        injectedAny = true;
        hydratedCount += 1;
      } catch (error) {
        localDiagnostics({
          lastPlacementRenderResult: "failed",
          lastPlacementError: errorMessage(error),
          lastMountPointStrategy: mount.strategy,
          displaySurfaceMountStrategy: mount.strategy,
          displaySurfaceFallbackReason: errorMessage(error),
          lastDomInjectionError: errorMessage(error),
          lastMessageDisplayError: errorMessage(error),
        });
      }
    }
    cleanupDomInjections(keepKeys);
    localDiagnostics({
      messageDisplayHydratedCount: hydratedCount,
      lastMessageDisplayHydratedAt: hydratedCount > 0 ? new Date().toISOString() : state.diagnostics.lastMessageDisplayHydratedAt,
    });
    return injectedAny;
  }

  function hydrateMessageWidgets(): void {
    const renderWidget = ctx.messages?.renderWidget;
    const injected = hydrateDomInjections();
    if (state.settings.messageDisplay.useDomInjection && (injected || !state.settings.messageDisplay.fallbackToIframeWidget)) {
      cleanupMessageWidgets();
      return;
    }
    if (
      !state.settings.messageDisplay.enabled
      || resolveDisplaySurface(state.settings) === "drawer_only"
      || !renderWidget
      || !state.settings.messageDisplay.fallbackToIframeWidget
    ) {
      cleanupMessageWidgets();
      return;
    }

    const keepKeys = new Set<string>();
    for (const entry of allRenderableEntries()) {
      if (!entry.rendered.widgetHtml.trim()) continue;
      const key = `${entry.indexEntry.messageId}:${entry.indexEntry.swipeKey}:${MESSAGE_WIDGET_ID}`;
      keepKeys.add(key);
      const signature = [
        entry.rendered.renderMode,
        entry.rendered.snapshotCreatedAt,
        entry.rendered.presetId,
        entry.rendered.widgetHtml,
      ].join("\n");
      if (widgetSignatures.get(key) === signature) continue;
      try {
        widgetCleanups.get(key)?.();
        const cleanup = renderWidget({
          messageId: entry.indexEntry.messageId,
          widgetId: MESSAGE_WIDGET_ID,
          html: entry.rendered.widgetHtml,
          minHeight: state.settings.messageDisplay.collapsedByDefault ? Math.max(0, state.settings.messageDisplay.minimizedMaxHeightPx) : 40,
          maxHeight: 4000,
        }, (payload) => handleWidgetPayload(entry.indexEntry.messageId, entry.indexEntry.swipeKey, payload));
        widgetCleanups.set(key, cleanup);
        widgetSignatures.set(key, signature);
      } catch (error) {
        state = {
          ...state,
          diagnostics: {
            ...state.diagnostics,
            lastMessageDisplayError: errorMessage(error),
          },
        };
      }
    }
    cleanupMessageWidgets(keepKeys);
  }

  function buildEmbeddedTagEntry(payload: SpindleMessageTagIntercept): MessageTrackerHistoryEntry | null {
    if (!payload.messageId) return null;
    const chatId = payload.chatId ?? currentChatId();
    if (!chatId) return null;
    const swipeKey = payload.attrs.swipe || DEFAULT_SWIPE_KEY;
    const version = payload.attrs.version || EXTENSION_VERSION;
    const parsed = JSON.parse(payload.content);
    if (!isRecord(parsed) || Array.isArray(parsed)) {
      throw new Error("Embedded LTracker tag content must be a JSON object.");
    }
    const attachedAt = new Date().toISOString();
    const presetRenderLock = capturePresetRenderLock(state.activePreset, attachedAt);
    const snapshot: MessageAttachedSnapshot = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      extensionVersion: version,
      chatId,
      messageId: payload.messageId,
      messageIndex: null,
      swipeKey,
      swipeIndex: null,
      swipeId: null,
      swipeContentHash: null,
      swipeKeySource: "unknown",
      presetId: state.activePreset.id,
      presetName: state.activePreset.name,
      presetVersion: state.activePreset.version,
      trigger: {
        kind: "widget",
        requestId: `tag-intercept:${payload.messageId}:${swipeKey}`,
        sourceMessageId: payload.messageId,
        sourceMessageIndex: null,
        swipeKey,
        swipeIndex: null,
        swipeId: null,
        swipeContentHash: null,
        swipeKeySource: "unknown",
      },
      snapshot: {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        extensionVersion: version,
        chatId,
        createdAt: attachedAt,
        messageCount: 1,
        sourceMessageIds: [payload.messageId],
        presetId: state.activePreset.id,
        presetName: state.activePreset.name,
        presetVersion: state.activePreset.version,
        generationStartedAt: null,
        generationCompletedAt: null,
        generationDurationMs: null,
        generationCancelledAt: null,
        generationStatus: "completed",
        presetRenderLock,
        data: parsed,
      },
      attachedAt,
    };
    const indexEntry = {
      messageId: payload.messageId,
      messageIndex: null,
      swipeKey,
      swipeIndex: null,
      swipeId: null,
      swipeContentHash: null,
      swipeKeySource: "unknown" as const,
      createdAt: attachedAt,
      presetId: state.activePreset.id,
      presetName: state.activePreset.name,
      storageKey: `embedded:${chatId}:${payload.messageId}:${swipeKey}`,
    };
    return {
      indexEntry,
      snapshot,
      rendered: renderMessageTracker({
        messageId: payload.messageId,
        messageIndex: null,
        attachedSnapshot: snapshot,
        latestChatSnapshot: state.snapshot,
        preset: state.activePreset,
        presets: state.presets,
        activePreset: state.activePreset,
        settings: state.settings.messageDisplay,
        swipeIdentity: {
          chatId,
          messageId: payload.messageId,
          swipeKey,
          swipeIndex: null,
          swipeId: null,
          swipeContentHash: null,
          swipeKeySource: "unknown",
        },
        isRegenerating: false,
        activeJobId: null,
        activeJobStartedAt: null,
      }),
    };
  }

  function handleEmbeddedTrackerTag(payload: SpindleMessageTagIntercept): void {
    const swipeKey = payload.attrs.swipe || DEFAULT_SWIPE_KEY;
    const outbound: FrontendMessage = {
      type: "embedded_tracker_tag_intercepted",
      chatId: payload.chatId ?? currentChatId(),
      messageId: payload.messageId ?? null,
      swipeKey,
      jsonText: payload.content,
      requestId: requestId("tag-intercept"),
    };
    if (typeof payload.isStreaming === "boolean") outbound.isStreaming = payload.isStreaming;
    send(outbound);
    if (payload.isStreaming) return;
    try {
      const entry = buildEmbeddedTagEntry(payload);
      if (!entry) return;
      embeddedTagEntries.set(trackerEntryKey(entry.indexEntry.messageId, entry.indexEntry.swipeKey), entry);
      localDiagnostics({
        lastTagInterceptAt: new Date().toISOString(),
        lastTagInterceptMessageId: entry.indexEntry.messageId,
        lastTagInterceptSwipeKey: entry.indexEntry.swipeKey,
        lastTagInterceptError: null,
      });
      hydrateMessageWidgets();
    } catch (error) {
      localDiagnostics({
        lastTagInterceptAt: new Date().toISOString(),
        lastTagInterceptMessageId: payload.messageId ?? null,
        lastTagInterceptSwipeKey: swipeKey,
        lastTagInterceptError: errorMessage(error),
      });
    }
  }

  function requestState(): void {
    send({ type: "refresh_state", chatId: activeChatId() });
  }

  function activateDrawer(): void {
    if (state.settings.connection.refreshConnectionsOnDrawerOpen) {
      refreshConnections();
      return;
    }
    requestState();
  }

  function generateTracker(): void {
    send({
      type: "generate_tracker",
      chatId: activeChatId(),
      requestId: requestId("generate"),
    });
  }

  function refreshConnections(): void {
    send({
      type: "refresh_connections",
      chatId: activeChatId(),
      requestId: requestId("connections-refresh"),
    });
  }

  function testTrackerConnection(): void {
    send({
      type: "test_tracker_connection",
      chatId: activeChatId(),
      settings: readSettings(),
      requestId: requestId("connection-test"),
    });
  }

  function cancelConnectionTest(): void {
    send({
      type: "cancel_connection_test",
      chatId: activeChatId(),
      requestId: requestId("connection-test-cancel"),
    });
  }

  function resetConnectionParameters(): void {
    const current = readSettings();
    state = {
      ...state,
      settings: {
        ...current,
        connection: {
          ...current.connection,
          parameters: DEFAULT_TRACKER_CONNECTION_PARAMETERS,
        },
      },
    };
    render();
    scheduleSettingsAutosave();
  }

  function validReasoningEffort(value: string | undefined): LTrackerReasoningEffort | null {
    return value === "auto"
      || value === "none"
      || value === "minimal"
      || value === "low"
      || value === "medium"
      || value === "high"
      || value === "max"
      || value === "xhigh"
      ? value
      : null;
  }

  function applyPresetRecommendedConnection(): void {
    const recommended = state.activePreset.recommendedConnection;
    if (!recommended) return;
    const current = readSettings();
    const reasoningSource = recommended.reasoning?.source;
    state = {
      ...state,
      settings: {
        ...current,
        connection: {
          ...current.connection,
          mode: recommended.mode ?? current.connection.mode,
          parameters: {
            ...current.connection.parameters,
            temperature: recommended.temperature ?? current.connection.parameters.temperature,
            max_tokens: recommended.max_tokens ?? current.connection.parameters.max_tokens,
          },
          reasoning: {
            ...current.connection.reasoning,
            source: reasoningSource === "inherit" || reasoningSource === "off" || reasoningSource === "custom"
              ? reasoningSource
              : current.connection.reasoning.source,
            effort: validReasoningEffort(recommended.reasoning?.effort) ?? current.connection.reasoning.effort,
          },
        },
      },
    };
    render();
    scheduleSettingsAutosave();
  }

  function clearSnapshot(): void {
    send({
      type: "clear_snapshot",
      chatId: activeChatId(),
      requestId: requestId("clear"),
    });
  }

  function readSettings(): LTrackerSettings {
    const numberValue = (name: keyof Pick<LTrackerSettings, "recentMessageLimit" | "maxMessageChars" | "generationTimeoutMs">): number => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-setting="${name}"]`);
      return input ? Number(input.value) : state.settings[name];
    };
    const booleanValue = (name: keyof Pick<LTrackerSettings, "saveRawOutput" | "savePromptPreview">): boolean => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-setting="${name}"]`);
      return input ? input.checked : state.settings[name];
    };
    const autoNumberValue = (name: keyof Pick<LTrackerSettings["auto"], "autoDebounceMs" | "skipFirstMessages">): number => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.auto[name];
    };
    const autoBooleanValue = (name: keyof Omit<LTrackerSettings["auto"], "autoDebounceMs" | "skipFirstMessages">): boolean => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-setting="${name}"]`);
      return input ? input.checked : state.settings.auto[name];
    };
    const autoTimingNumberValue = (name: keyof Pick<LTrackerSettings["autoTiming"], "postCompletionSettleMs" | "stableContentCheckMs">): number => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-auto-timing-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.autoTiming[name];
    };
    const autoTimingBooleanValue = (
      name: keyof Pick<LTrackerSettings["autoTiming"], "waitForAssistantFinalization" | "requireStableSwipeContent" | "cancelPendingOnSwipeChange">,
    ): boolean => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-auto-timing-setting="${name}"]`);
      return input ? input.checked : state.settings.autoTiming[name];
    };
    const budgetNumberValue = (
      name: keyof Omit<LTrackerSettings["budget"], "mode" | "ultraModeEnabled">,
    ): number => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-budget-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.budget[name];
    };
    const budgetBooleanValue = (name: keyof Pick<LTrackerSettings["budget"], "ultraModeEnabled">): boolean => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-budget-setting="${name}"]`);
      return input ? input.checked : state.settings.budget[name];
    };
    const budgetSelectValue = <T extends string>(name: keyof Pick<LTrackerSettings["budget"], "mode">, fallback: T): T => {
      const input = tab.root.querySelector<HTMLSelectElement>(`[data-budget-setting="${name}"]`);
      return input ? input.value as T : fallback;
    };
    const memoryNumberValue = (name: keyof Pick<LTrackerSettings["memory"], "retainCount" | "fullSnapshotCount" | "maxMemoryChars">): number => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-memory-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.memory[name];
    };
    const memoryBooleanValue = (
      name: keyof Pick<LTrackerSettings["memory"], "enabled" | "includeInTrackerGeneration" | "compactOlderSnapshots" | "excludeTargetMessage" | "requireSamePreset" | "requireSameSwipeWhenAvailable">,
    ): boolean => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-memory-setting="${name}"]`);
      return input ? input.checked : state.settings.memory[name];
    };
    const memorySelectValue = <T extends string>(name: keyof Pick<LTrackerSettings["memory"], "source" | "order">, fallback: T): T => {
      const input = tab.root.querySelector<HTMLSelectElement>(`[data-memory-setting="${name}"]`);
      return input ? input.value as T : fallback;
    };
    const injectionNumberValue = (name: keyof Pick<LTrackerSettings["injection"], "retainCount" | "maxInjectedChars">): number => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-injection-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.injection[name];
    };
    const injectionBooleanValue = (name: keyof Pick<LTrackerSettings["injection"], "enabled" | "includeOnlyIfMissingFromPrompt" | "stripOlderTrackerBlocks" | "includeHeader">): boolean => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-injection-setting="${name}"]`);
      return input ? input.checked : state.settings.injection[name];
    };
    const injectionTextValue = (name: keyof Pick<LTrackerSettings["injection"], "header">): string => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-injection-setting="${name}"]`);
      return input ? input.value : state.settings.injection[name];
    };
    const rendererBooleanValue = (name: keyof Pick<LTrackerSettings["renderer"], "enabled" | "allowInlineStyles">): boolean => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-renderer-setting="${name}"]`);
      return input ? input.checked : state.settings.renderer[name];
    };
    const rendererTextValue = (name: keyof Pick<LTrackerSettings["renderer"], "missingValuePlaceholder">): string => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-renderer-setting="${name}"]`);
      return input ? input.value : state.settings.renderer[name];
    };
    const messageDisplayNumberValue = (name: keyof Pick<LTrackerSettings["messageDisplay"], "maxRenderedChars" | "minimizedMaxHeightPx">): number => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-message-display-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.messageDisplay[name];
    };
    const messageDisplayBooleanValue = (
      name: keyof Pick<
        LTrackerSettings["messageDisplay"],
        | "enabled"
        | "useDomInjection"
        | "fallbackToIframeWidget"
        | "allowInlineStyles"
        | "deduplicateRenderWarnings"
        | "showRenderWarningsInDiagnosticsOnly"
        | "showDebugSwipeKey"
        | "showGenerateButtonForMissingTracker"
        | "showExpandedHeaderActions"
        | "showBottomActionsInInlineTracker"
        | "collapsedByDefault"
        | "compactCollapsedHeader"
        | "showTimestamp"
        | "showPresetName"
        | "showDebugCopyButtonsInHistory"
        | "showWidgetRegenerateButton"
        | "showEditButton"
        | "showDeleteButton"
        | "showNoTrackerForSwipe"
        | "showGenerationDuration"
      >,
    ): boolean => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-message-display-setting="${name}"]`);
      return input ? input.checked : state.settings.messageDisplay[name];
    };
    const injectionSelectValue = <T extends string>(name: keyof Pick<LTrackerSettings["injection"], "format" | "injectionPlacement" | "roleFallback">, fallback: T): T => {
      const input = tab.root.querySelector<HTMLSelectElement>(`[data-injection-setting="${name}"]`);
      return input ? input.value as T : fallback;
    };
    const rendererSelectValue = <T extends string>(name: keyof Pick<LTrackerSettings["renderer"], "previewSource">, fallback: T): T => {
      const input = tab.root.querySelector<HTMLSelectElement>(`[data-renderer-setting="${name}"]`);
      return input ? input.value as T : fallback;
    };
    const rendererTrustModeValue = (): TemplateTrustMode => {
      const input = tab.root.querySelector<HTMLSelectElement>("[data-renderer-setting=\"templateTrustMode\"]");
      return input ? input.value as TemplateTrustMode : state.settings.renderer.templateTrustMode;
    };
    const messageDisplaySelectValue = <T extends string>(
      name: keyof Pick<LTrackerSettings["messageDisplay"], "attachmentMode" | "displayMode" | "displaySurface" | "placement" | "source" | "renderMode" | "controlDensity" | "controlPlacement">,
      fallback: T,
    ): T => {
      const input = tab.root.querySelector<HTMLSelectElement>(`[data-message-display-setting="${name}"]`);
      return input ? input.value as T : fallback;
    };
    const expandedWidthNumberValue = (
      name: keyof Pick<LTrackerSettings["expandedWidth"], "maxExpandedWidthPx" | "mobileHorizontalMarginPx" | "expandedContentMaxHeightVh" | "fullscreenBreakpointPx">,
    ): number => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-expanded-width-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.expandedWidth[name];
    };
    const expandedWidthSelectValue = <T extends string>(name: keyof Pick<LTrackerSettings["expandedWidth"], "expandedWidthMode">, fallback: T): T => {
      const input = tab.root.querySelector<HTMLSelectElement>(`[data-expanded-width-setting="${name}"]`);
      return input ? input.value as T : fallback;
    };
    const expandedWidthBooleanValue = (
      name: keyof Pick<LTrackerSettings["expandedWidth"], "preferFullscreenOnMobile" | "popoverBackdrop" | "closeOnBackdropClick" | "closeOnEscape">,
    ): boolean => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-expanded-width-setting="${name}"]`);
      return input ? input.checked : state.settings.expandedWidth[name];
    };
    const connectionBooleanValue = (
      name: keyof Pick<LTrackerSettings["connection"], "refreshConnectionsOnDrawerOpen">,
    ): boolean => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-connection-setting="${name}"]`);
      return input ? input.checked : state.settings.connection[name];
    };
    const connectionTextValue = (
      name: keyof Pick<LTrackerSettings["connection"], "testPrompt">,
    ): string => {
      const input = tab.root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-connection-setting="${name}"]`);
      return input ? input.value : state.settings.connection[name];
    };
    const connectionSelectValue = <T extends string>(name: string, fallback: T): T => {
      const input = tab.root.querySelector<HTMLSelectElement>(`[data-connection-setting="${name}"], [data-connection-reasoning="${name}"]`);
      return input ? input.value as T : fallback;
    };
    const connectionParameterValue = (
      name: keyof LTrackerSettings["connection"]["parameters"],
    ): number | null => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-connection-parameter="${name}"]`);
      if (!input) return state.settings.connection.parameters[name];
      if (!input.value.trim()) return null;
      const numeric = Number(input.value);
      return Number.isFinite(numeric) ? numeric : null;
    };
    const selectedConnectionInput = tab.root.querySelector<HTMLSelectElement>("[data-connection-setting=\"selectedConnectionId\"]");
    const selectedConnectionId = selectedConnectionInput?.value.trim() || null;
    const selectedConnection = selectedConnectionId
      ? state.connectionProfiles.find((profile) => profile.id === selectedConnectionId) ?? null
      : null;
    const displaySurface = messageDisplaySelectValue<LTrackerDisplaySurface>("displaySurface", state.settings.messageDisplay.displaySurface);
    return {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      recentMessageLimit: numberValue("recentMessageLimit"),
      maxMessageChars: numberValue("maxMessageChars"),
      generationTimeoutMs: numberValue("generationTimeoutMs"),
      saveRawOutput: booleanValue("saveRawOutput"),
      savePromptPreview: booleanValue("savePromptPreview"),
      auto: {
        autoModeEnabled: autoBooleanValue("autoModeEnabled"),
        autoDebounceMs: autoNumberValue("autoDebounceMs"),
        skipFirstMessages: autoNumberValue("skipFirstMessages"),
        triggerAfterAssistantMessages: autoBooleanValue("triggerAfterAssistantMessages"),
        triggerAfterUserMessages: autoBooleanValue("triggerAfterUserMessages"),
        attachSnapshotToMessage: autoBooleanValue("attachSnapshotToMessage"),
        onlyWhenChatActive: autoBooleanValue("onlyWhenChatActive"),
      },
      autoTiming: {
        waitForAssistantFinalization: autoTimingBooleanValue("waitForAssistantFinalization"),
        postCompletionSettleMs: autoTimingNumberValue("postCompletionSettleMs"),
        stableContentCheckMs: autoTimingNumberValue("stableContentCheckMs"),
        requireStableSwipeContent: autoTimingBooleanValue("requireStableSwipeContent"),
        cancelPendingOnSwipeChange: autoTimingBooleanValue("cancelPendingOnSwipeChange"),
      },
      budget: {
        mode: budgetSelectValue<LTrackerBudgetMode>("mode", state.settings.budget.mode),
        ultraModeEnabled: budgetBooleanValue("ultraModeEnabled"),
        recentMessageBudgetTokens: budgetNumberValue("recentMessageBudgetTokens"),
        perMessageBudgetTokens: budgetNumberValue("perMessageBudgetTokens"),
        trackerMemoryBudgetTokens: budgetNumberValue("trackerMemoryBudgetTokens"),
        promptInjectionBudgetTokens: budgetNumberValue("promptInjectionBudgetTokens"),
        maxTrackerOutputTokens: budgetNumberValue("maxTrackerOutputTokens"),
        promptPreviewBudgetTokens: budgetNumberValue("promptPreviewBudgetTokens"),
        renderedHtmlMaxChars: budgetNumberValue("renderedHtmlMaxChars"),
        rawOutputMaxChars: budgetNumberValue("rawOutputMaxChars"),
        presetImportMaxChars: budgetNumberValue("presetImportMaxChars"),
      },
      memory: {
        enabled: memoryBooleanValue("enabled"),
        includeInTrackerGeneration: memoryBooleanValue("includeInTrackerGeneration"),
        retainCount: memoryNumberValue("retainCount"),
        fullSnapshotCount: memoryNumberValue("fullSnapshotCount"),
        compactOlderSnapshots: memoryBooleanValue("compactOlderSnapshots"),
        maxMemoryChars: memoryNumberValue("maxMemoryChars"),
        source: memorySelectValue<LTrackerMemorySource>("source", state.settings.memory.source),
        excludeTargetMessage: memoryBooleanValue("excludeTargetMessage"),
        order: memorySelectValue<LTrackerMemoryOrder>("order", state.settings.memory.order),
        requireSamePreset: memoryBooleanValue("requireSamePreset"),
        requireSameSwipeWhenAvailable: memoryBooleanValue("requireSameSwipeWhenAvailable"),
      },
      injection: {
        enabled: injectionBooleanValue("enabled"),
        retainCount: injectionNumberValue("retainCount"),
        format: injectionSelectValue<LTrackerInjectionFormat>("format", state.settings.injection.format),
        injectionPlacement: injectionSelectValue<LTrackerInjectionPlacement>("injectionPlacement", state.settings.injection.injectionPlacement),
        includeOnlyIfMissingFromPrompt: injectionBooleanValue("includeOnlyIfMissingFromPrompt"),
        stripOlderTrackerBlocks: injectionBooleanValue("stripOlderTrackerBlocks"),
        maxInjectedChars: injectionNumberValue("maxInjectedChars"),
        roleFallback: injectionSelectValue<LTrackerInjectionRoleFallback>("roleFallback", state.settings.injection.roleFallback),
        includeHeader: injectionBooleanValue("includeHeader"),
        header: injectionTextValue("header"),
      },
      renderer: {
        enabled: rendererBooleanValue("enabled"),
        previewSource: rendererSelectValue("previewSource", state.settings.renderer.previewSource),
        missingValuePlaceholder: rendererTextValue("missingValuePlaceholder"),
        maxRenderedChars: budgetNumberValue("renderedHtmlMaxChars"),
        allowInlineStyles: rendererTrustModeValue() !== "safe",
        templateTrustMode: rendererTrustModeValue(),
      },
      messageDisplay: {
        enabled: messageDisplayBooleanValue("enabled"),
        useDomInjection: messageDisplayBooleanValue("useDomInjection"),
        fallbackToIframeWidget: messageDisplayBooleanValue("fallbackToIframeWidget"),
        attachmentMode: messageDisplaySelectValue("attachmentMode", state.settings.messageDisplay.attachmentMode),
        displayMode: displayModeForSurface(displaySurface),
        displaySurface,
        placement: messageDisplaySelectValue("placement", state.settings.messageDisplay.placement),
        source: messageDisplaySelectValue("source", state.settings.messageDisplay.source),
        renderMode: messageDisplaySelectValue("renderMode", state.settings.messageDisplay.renderMode),
        allowInlineStyles: rendererTrustModeValue() !== "safe",
        deduplicateRenderWarnings: messageDisplayBooleanValue("deduplicateRenderWarnings"),
        showRenderWarningsInDiagnosticsOnly: messageDisplayBooleanValue("showRenderWarningsInDiagnosticsOnly"),
        showDebugSwipeKey: messageDisplayBooleanValue("showDebugSwipeKey"),
        showGenerateButtonForMissingTracker: messageDisplayBooleanValue("showGenerateButtonForMissingTracker"),
        controlDensity: messageDisplaySelectValue("controlDensity", state.settings.messageDisplay.controlDensity),
        controlPlacement: messageDisplaySelectValue("controlPlacement", state.settings.messageDisplay.controlPlacement),
        showExpandedHeaderActions: messageDisplayBooleanValue("showExpandedHeaderActions"),
        showBottomActionsInInlineTracker: messageDisplayBooleanValue("showBottomActionsInInlineTracker"),
        collapsedByDefault: messageDisplayBooleanValue("collapsedByDefault"),
        compactCollapsedHeader: messageDisplayBooleanValue("compactCollapsedHeader"),
        showTimestamp: messageDisplayBooleanValue("showTimestamp"),
        showPresetName: messageDisplayBooleanValue("showPresetName"),
        showDebugCopyButtonsInHistory: messageDisplayBooleanValue("showDebugCopyButtonsInHistory"),
        showWidgetRegenerateButton: messageDisplayBooleanValue("showWidgetRegenerateButton"),
        showEditButton: messageDisplayBooleanValue("showEditButton"),
        showDeleteButton: messageDisplayBooleanValue("showDeleteButton"),
        showNoTrackerForSwipe: messageDisplayBooleanValue("showNoTrackerForSwipe"),
        showGenerationDuration: messageDisplayBooleanValue("showGenerationDuration"),
        minimizedMaxHeightPx: messageDisplayNumberValue("minimizedMaxHeightPx"),
        maxRenderedChars: messageDisplayNumberValue("maxRenderedChars"),
      },
      expandedWidth: {
        expandedWidthMode: expandedWidthSelectValue<LTrackerExpandedWidthMode>("expandedWidthMode", state.settings.expandedWidth.expandedWidthMode),
        maxExpandedWidthPx: expandedWidthNumberValue("maxExpandedWidthPx"),
        mobileHorizontalMarginPx: expandedWidthNumberValue("mobileHorizontalMarginPx"),
        expandedContentMaxHeightVh: expandedWidthNumberValue("expandedContentMaxHeightVh"),
        preferFullscreenOnMobile: expandedWidthBooleanValue("preferFullscreenOnMobile"),
        fullscreenBreakpointPx: expandedWidthNumberValue("fullscreenBreakpointPx"),
        popoverBackdrop: expandedWidthBooleanValue("popoverBackdrop"),
        closeOnBackdropClick: expandedWidthBooleanValue("closeOnBackdropClick"),
        closeOnEscape: expandedWidthBooleanValue("closeOnEscape"),
      },
      connection: {
        mode: connectionSelectValue<LTrackerConnectionMode>("mode", state.settings.connection.mode),
        selectedConnectionId,
        selectedConnectionName: selectedConnection
          ? selectedConnection.name
          : selectedConnectionId ? state.settings.connection.selectedConnectionName : null,
        refreshConnectionsOnDrawerOpen: connectionBooleanValue("refreshConnectionsOnDrawerOpen"),
        parameters: {
          temperature: connectionParameterValue("temperature"),
          max_tokens: connectionParameterValue("max_tokens"),
          top_p: connectionParameterValue("top_p"),
          frequency_penalty: connectionParameterValue("frequency_penalty"),
          presence_penalty: connectionParameterValue("presence_penalty"),
        },
        reasoning: {
          source: connectionSelectValue<LTrackerReasoningSource>("source", state.settings.connection.reasoning.source),
          apiReasoning: Boolean(tab.root.querySelector<HTMLInputElement>("[data-connection-reasoning=\"apiReasoning\"]")?.checked ?? state.settings.connection.reasoning.apiReasoning),
          effort: connectionSelectValue<LTrackerReasoningEffort>("effort", state.settings.connection.reasoning.effort),
          thinkingDisplay: connectionSelectValue<LTrackerThinkingDisplay>("thinkingDisplay", state.settings.connection.reasoning.thinkingDisplay),
        },
        testPrompt: connectionTextValue("testPrompt"),
      },
      history: {
        pageSize: state.settings.history?.pageSize ?? 25,
        showDuplicates: state.settings.history?.showDuplicates ?? false,
      },
      storageMaintenance: {
        enabled: state.settings.storageMaintenance?.enabled ?? false,
        maxSnapshotsPerChat: state.settings.storageMaintenance?.maxSnapshotsPerChat ?? 100,
        cleanupDuplicatesOnly: state.settings.storageMaintenance?.cleanupDuplicatesOnly ?? false,
      },
    };
  }

  function saveSettings(prefix = "settings"): void {
    setSettingsSaveStatus("saving");
    send({
      type: "save_settings",
      chatId: activeChatId(),
      settings: readSettings(),
      requestId: requestId(prefix),
    });
  }

  function resetSettings(): void {
    clearSettingsAutosaveTimer();
    setSettingsSaveStatus("saving");
    send({
      type: "reset_settings",
      chatId: activeChatId(),
      requestId: requestId("settings-reset"),
    });
  }

  function setLocalError(message: string): void {
    state = {
      ...state,
      status: "error",
      error: emptyError(message),
    };
    render();
  }

  function fieldText(name: string, fallback: string): string {
    const input = tab.root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-preset-field="${name}"]`);
    return input ? input.value : fallback;
  }

  function readPresetDraft(): TrackerPresetDraft | null {
    let jsonSchema: Record<string, unknown>;
    try {
      const parsed = JSON.parse(fieldText("jsonSchema", "{}"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setLocalError("JSON Schema must be a JSON object.");
        return null;
      }
      jsonSchema = parsed as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLocalError(`JSON Schema is invalid JSON: ${message}`);
      return null;
    }

    const htmlTemplate = fieldText("htmlTemplate", "");
    const draft: TrackerPresetDraft = {
      id: state.activePreset.id,
      name: fieldText("name", state.activePreset.name),
      description: fieldText("description", state.activePreset.description),
      version: fieldText("version", state.activePreset.version),
      jsonSchema,
      promptInstructions: fieldText("promptInstructions", state.activePreset.promptInstructions),
      htmlTemplate,
      notes: fieldText("notes", state.activePreset.notes ?? ""),
      capabilities: {
        supportsHtmlTemplate: htmlTemplate.trim().length > 0,
      },
    };
    return draft;
  }

  function selectPreset(presetId: string): void {
    send({
      type: "select_preset",
      chatId: activeChatId(),
      presetId,
      requestId: requestId("preset-select"),
    });
  }

  function savePresetAsNew(): void {
    const preset = readPresetDraft();
    if (!preset) return;
    send({
      type: "save_preset_as_new",
      chatId: activeChatId(),
      preset,
      requestId: requestId("preset-new"),
    });
  }

  function duplicatePreset(): void {
    const preset = readPresetDraft();
    if (!preset) return;
    send({
      type: "duplicate_preset",
      chatId: activeChatId(),
      preset: {
        ...preset,
        name: `${preset.name || state.activePreset.name} Copy`,
      },
      requestId: requestId("preset-duplicate"),
    });
  }

  function updatePreset(): void {
    if (state.activePreset.origin === "built_in") return;
    const preset = readPresetDraft();
    if (!preset) return;
    send({
      type: "update_preset",
      chatId: activeChatId(),
      presetId: state.activePreset.id,
      preset,
      requestId: requestId("preset-update"),
    });
  }

  function deletePreset(): void {
    if (state.activePreset.origin === "built_in") return;
    send({
      type: "delete_preset",
      chatId: activeChatId(),
      presetId: state.activePreset.id,
      requestId: requestId("preset-delete"),
    });
  }

  function resetPreset(): void {
    send({
      type: "reset_preset",
      chatId: activeChatId(),
      requestId: requestId("preset-reset"),
    });
  }

  function importPreset(): void {
    const input = tab.root.querySelector<HTMLTextAreaElement>("[data-preset-import]");
    const importText = input?.value.trim() ?? "";
    if (!importText) {
      setLocalError("Paste preset export JSON before importing.");
      return;
    }
    send({
      type: "import_preset",
      chatId: activeChatId(),
      importText,
      requestId: requestId("preset-import"),
    });
  }

  function validatePreset(): void {
    const preset = readPresetDraft();
    if (!preset) return;
    send({
      type: "validate_preset",
      chatId: activeChatId(),
      preset,
      requestId: requestId("preset-validate"),
    });
  }

  function validatePresetReportFrontend(): void {
    const preset = readPresetDraft();
    if (!preset) return;
    send({
      type: "validate_preset_report",
      chatId: activeChatId(),
      preset,
      requestId: requestId("preset-validate-report"),
    });
  }

  function generateSampleSnapshotFrontend(): void {
    send({
      type: "generate_sample_snapshot",
      chatId: activeChatId(),
      sampleMode: renderLabSampleMode,
      requestId: requestId("preset-sample-snapshot"),
    });
  }

  function renderLabWidthPx(): number {
    if (renderLabViewport === "phone_narrow") return 360;
    if (renderLabViewport === "phone_large") return 430;
    if (renderLabViewport === "tablet") return 768;
    if (renderLabViewport === "desktop") return 1100;
    return Math.min(1800, Math.max(260, Math.round(renderLabCustomWidth || 360)));
  }

  function renderLabTargetPreset(): TrackerSchemaPreset | TrackerPresetDraft {
    return stagedImportPack?.preset ?? state.activePreset;
  }

  function buildRenderLabPreview(): {
    preset: TrackerSchemaPreset | TrackerPresetDraft;
    sampleData: Record<string, unknown>;
    report: PresetValidationReport;
    html: string;
    warnings: string[];
    result: "rendered" | "fallback";
  } {
    const preset = renderLabTargetPreset();
    const schema = isRecord(preset.jsonSchema) ? preset.jsonSchema : {};
    const sampleData = generateSampleSnapshot(schema, renderLabSampleMode);
    const report = validatePresetReport(preset, {
      allowInlineStyles: true,
      maxRenderedChars: state.settings.budget.renderedHtmlMaxChars,
      sampleMode: renderLabSampleMode,
    });
    const rendered = renderHtmlTemplate(
      {
        template: preset.htmlTemplate ?? "",
        snapshotData: sampleData,
        presetId: "id" in preset && typeof preset.id === "string" ? preset.id : "render_lab",
        presetName: preset.name ?? "Render Lab Preset",
      },
      {
        allowInlineStyles: true,
        templateTrustMode: "trusted",
        missingValuePlaceholder: state.settings.renderer.missingValuePlaceholder,
        maxRenderedChars: state.settings.budget.renderedHtmlMaxChars,
        deduplicateWarnings: true,
        maxWarnings: 80,
      },
    );
    const warnings = [
      ...report.rawArrayInterpolationPaths.map((path) => `Raw array interpolation risk: ${path}`),
      ...report.rawObjectInterpolationPaths.map((path) => `Raw object interpolation risk: ${path}`),
      ...report.mobileRiskWarnings,
      ...report.verticalTextRiskWarnings,
      ...rendered.warnings,
      ...rendered.errors,
    ];
    return {
      preset,
      sampleData,
      report,
      html: rendered.html || `<pre>${escapeHtml(rendered.textFallback)}</pre>`,
      warnings,
      result: rendered.html ? "rendered" : "fallback",
    };
  }

  function renderLabReportText(): string {
    const lab = buildRenderLabPreview();
    return [
      `Preset: ${lab.preset.name ?? "Unnamed"}`,
      `Sample mode: ${renderLabSampleMode}`,
      `Viewport: ${renderLabViewport} (${renderLabWidthPx()}px)`,
      `Surface: ${renderLabSurface}`,
      `Result: ${lab.result}`,
      `Errors: ${lab.report.errorCount}`,
      `Warnings: ${lab.report.warningCount}`,
      `Prompt tokens: ~${lab.report.estimatedPromptTokens}`,
      `Rendered chars: ${lab.html.length}`,
      `Raw array paths: ${lab.report.rawArrayInterpolationPaths.join(", ") || "none"}`,
      `Raw object paths: ${lab.report.rawObjectInterpolationPaths.join(", ") || "none"}`,
      `Mobile risks: ${lab.report.mobileRiskWarnings.join(" | ") || "none"}`,
      `Vertical text risks: ${lab.report.verticalTextRiskWarnings.join(" | ") || "none"}`,
      `Renderer features: ${lab.report.rendererRequirements.features.join(", ") || "basic"}`,
      `Renderer warnings: ${lab.report.rendererRequirements.warnings.join(" | ") || "none"}`,
      `Render warnings: ${lab.warnings.join(" | ") || "none"}`,
    ].join("\n");
  }

  function recordRenderLabDiagnostics(result: ReturnType<typeof buildRenderLabPreview>): void {
    localDiagnostics({
      lastPresetRenderLabViewport: renderLabViewport,
      lastPresetRenderLabSurface: renderLabSurface,
      lastPresetRenderLabResult: result.result,
      lastPresetRenderLabRenderedChars: result.html.length,
      lastPresetRenderLabWarnings: result.warnings.slice(0, 20),
      lastPresetLintAt: new Date().toISOString(),
      lastPresetLintWarningCount: result.report.warningCount,
      lastPresetLintErrorCount: result.report.errorCount,
      lastPresetLintRawObjectPaths: [...result.report.rawObjectInterpolationPaths, ...result.report.rawArrayInterpolationPaths],
      lastPresetLintMobileRiskCount: result.report.mobileRiskWarnings.length + result.report.verticalTextRiskWarnings.length,
    });
  }

  function exportPresetPackFrontend(includeSettings: boolean): void {
    const msg: FrontendMessage = {
      type: "export_preset_pack",
      chatId: activeChatId(),
      requestId: requestId("preset-export-pack"),
    };
    if (includeSettings) {
      msg.includeRecommendedSettings = true;
    }
    msg.includeExampleSnapshot = true;
    send(msg);
  }

  function triggerFileImport(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.ltracker.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === "string") {
          stageImportText(text);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function stageImportText(text: string): void {
    const maxChars = state.settings.budget.presetImportMaxChars;
    if (text.length > maxChars) {
      setLocalError(`Import size (${text.length} chars) exceeds limit of ${maxChars} chars.`);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setLocalError(`Invalid JSON: ${errorMessage(e)}`);
      return;
    }

    const result = importPresetPack(parsed, state.presets.map((p) => p.id), new Date().toISOString());
    if (!result.ok || !result.preset) {
      setLocalError(result.error ?? "Failed to parse import preset pack.");
      return;
    }

    stagedImportPack = result;
    stagedImportRawText = text;
    state = {
      ...state,
      error: null,
    };
    render();
  }

  function executeImportPresetPack(): void {
    if (!stagedImportPack || !stagedImportRawText) return;

    const nameInput = tab.root.querySelector<HTMLInputElement>("[data-import-review-name]");
    const presetName = nameInput?.value.trim() || stagedImportPack.preset?.name || "Imported Preset";

    const installModeSelect = tab.root.querySelector<HTMLSelectElement>("[data-import-review-install-mode]");
    const installMode = installModeSelect?.value || "new";

    const trustModeSelect = tab.root.querySelector<HTMLSelectElement>("[data-import-review-trust-mode]");
    const trustMode = trustModeSelect?.value as TemplateTrustMode || "safe";

    const applyRecToggle = tab.root.querySelector<HTMLInputElement>("[data-import-review-apply-settings]");
    const applyRecommendedSettings = applyRecToggle ? applyRecToggle.checked : false;

    const msg: FrontendMessage = {
      type: "import_preset_pack",
      chatId: activeChatId(),
      importText: stagedImportRawText,
      requestId: requestId("preset-import-pack"),
    };

    if (presetName) msg.presetName = presetName;
    if (installMode === "overwrite") {
      const overwriteSelect = tab.root.querySelector<HTMLSelectElement>("[data-import-review-overwrite-target]");
      if (overwriteSelect?.value) {
        msg.overwritePresetId = overwriteSelect.value;
      }
    }
    if (trustMode) msg.trustMode = trustMode;
    if (applyRecommendedSettings) msg.applyRecommendedSettings = applyRecommendedSettings;

    send(msg);

    stagedImportPack = null;
    stagedImportRawText = "";
    render();
  }

  function selectedRenderSource(): LTrackerRenderSource {
    const input = tab.root.querySelector<HTMLSelectElement>("[data-renderer-setting=\"previewSource\"]");
    return input?.value === "latest_message_snapshot" ? "latest_message_snapshot" : "latest_chat_snapshot";
  }

  function renderTemplatePreview(): void {
    send({
      type: "render_template",
      chatId: activeChatId(),
      source: selectedRenderSource(),
      requestId: requestId("render-template"),
    });
  }

  async function copyText(value: string | null, label: string): Promise<void> {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state = {
        ...state,
        status: "error",
        error: emptyError(`Could not copy ${label}: ${message}`),
      };
      render();
    }
  }

  async function showLTrackerConfirm(title: string, message: string): Promise<boolean> {
    if (ctx.ui?.showConfirm) {
      const res = await ctx.ui.showConfirm({
        title,
        message,
        variant: "danger",
        confirmLabel: "Delete",
      });
      return res.confirmed;
    }
    
    return new Promise<boolean>((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "ltracker-confirm-backdrop";
      backdrop.innerHTML = `
        <div class="ltracker-confirm-dialog">
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
          <div class="ltracker-confirm-actions">
            <button class="ltracker-button ltracker-cancel-btn" type="button">Cancel</button>
            <button class="ltracker-button ltracker-confirm-btn ltd-danger" type="button">Delete</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
      
      const onCancel = () => {
        cleanup();
        resolve(false);
      };
      const onConfirm = () => {
        cleanup();
        resolve(true);
      };
      const cleanup = () => {
        backdrop.querySelector(".ltracker-cancel-btn")?.removeEventListener("click", onCancel);
        backdrop.querySelector(".ltracker-confirm-btn")?.removeEventListener("click", onConfirm);
        backdrop.remove();
      };
      
      backdrop.querySelector(".ltracker-cancel-btn")?.addEventListener("click", onCancel);
      backdrop.querySelector(".ltracker-confirm-btn")?.addEventListener("click", onConfirm);
    });
  }

  async function deleteMessageTracker(messageId: string, swipeKey: string): Promise<void> {
    const confirmed = await showLTrackerConfirm(
      "Delete Tracker",
      "Delete tracker for this message/swipe? This does not delete the chat message."
    );
    if (!confirmed) return;
    
    send({
      type: "delete_message_tracker",
      chatId: activeChatId(),
      messageId,
      swipeKey,
      requestId: requestId("tracker-delete"),
    });

    if (recentlyDeletedBanner) {
      clearTimeout(recentlyDeletedBanner.timer);
    }
    
    const timer = setTimeout(() => {
      if (recentlyDeletedBanner && recentlyDeletedBanner.messageId === messageId && recentlyDeletedBanner.swipeKey === swipeKey) {
        recentlyDeletedBanner = null;
        render();
      }
    }, 30000);
    
    recentlyDeletedBanner = { messageId, swipeKey, timer };
    render();
  }

  function renderPresetSourceLabel(source: string | null): string {
    if (source === "snapshot_render_lock") return "Snapshot locked template";
    if (source === "installed_preset_id") return "Installed preset id match";
    if (source === "installed_preset_name_version") return "Installed preset name/version match";
    if (source === "active_preset_legacy_fallback") return "Active preset legacy fallback";
    if (source === "json_fallback_original_preset_missing") return "JSON fallback; original preset unavailable";
    return "Unknown render source";
  }

  function generatedPresetLabel(entry: MessageTrackerHistoryEntry): string {
    return entry.rendered.presetName
      ? `${entry.rendered.presetName}${entry.rendered.presetVersion ? ` ${entry.rendered.presetVersion}` : ""}`
      : entry.indexEntry.presetName ?? "Preset unknown";
  }

  function renderedPresetLabel(entry: MessageTrackerHistoryEntry): string {
    return renderPresetSourceLabel(entry.rendered.renderPresetSource);
  }

  function openTrackerEditor(entry: MessageTrackerHistoryEntry): void {
    const modal = ctx.ui.showModal({
      title: "LTracker Message Tracker",
      width: 760,
      maxHeight: 720,
    });
    const rendered = entry.rendered;
    const metadata = JSON.stringify({
      messageId: entry.indexEntry.messageId,
      messageIndex: entry.indexEntry.messageIndex,
      swipeKey: entry.indexEntry.swipeKey,
      swipeIndex: entry.indexEntry.swipeIndex,
      swipeId: entry.indexEntry.swipeId,
      swipeContentHash: entry.indexEntry.swipeContentHash,
      swipeKeySource: entry.indexEntry.swipeKeySource,
      presetId: rendered.presetId,
      presetName: rendered.presetName,
      presetVersion: rendered.presetVersion,
      generatedWith: generatedPresetLabel(entry),
      renderedWith: renderedPresetLabel(entry),
      renderPresetSource: rendered.renderPresetSource,
      renderPresetWarning: rendered.renderPresetWarning,
      renderPresetFallbackReason: rendered.renderPresetFallbackReason,
      renderPresetMismatchDetected: rendered.renderPresetMismatchDetected,
      renderLockedPresetId: rendered.renderLockedPresetId,
      renderLockedPresetName: rendered.renderLockedPresetName,
      renderLockedPresetVersion: rendered.renderLockedPresetVersion,
      snapshotCreatedAt: rendered.snapshotCreatedAt,
      attachedAt: rendered.attachedAt,
      generationDurationMs: rendered.generationDurationMs,
      generationStatus: rendered.generationStatus,
    }, null, 2);
    modal.root.innerHTML = `
      <div class="ltracker-editor">
        <div class="ltracker-actions">
          <button class="ltracker-button" type="button" data-editor-action="copy-json">Copy JSON</button>
          <button class="ltracker-button" type="button" data-editor-action="copy-text">Copy text</button>
          <button class="ltracker-button" type="button" data-editor-action="copy-html">Copy sanitized HTML</button>
          <button class="ltracker-button" type="button" data-editor-action="save-json">Save edited JSON</button>
          <button class="ltracker-button" type="button" data-editor-action="close">Close</button>
        </div>
        <div class="ltracker-editor-error" data-editor-error></div>
        <section class="ltracker-panel">
          <span class="ltracker-label">Preset identity</span>
          <div class="ltracker-grid ltracker-details">
            ${renderRow("Generated with", generatedPresetLabel(entry))}
            ${renderRow("Rendered with", renderedPresetLabel(entry))}
            ${renderRow("Render warning", rendered.renderPresetWarning)}
          </div>
          <button class="ltracker-button" type="button" disabled>Rebind to current preset (future)</button>
        </section>
        <section class="ltracker-panel">
          <span class="ltracker-label">Rendered preview</span>
          ${rendered.html ? `<div class="ltracker-render-preview">${rendered.html}</div>` : `<pre class="ltracker-text">${escapeHtml(rendered.textFallback)}</pre>`}
        </section>
        <section class="ltracker-panel">
          <span class="ltracker-label">Tracker JSON</span>
          <textarea class="ltracker-editor-textarea" data-editor-json>${escapeHtml(rendered.json)}</textarea>
        </section>
        <section class="ltracker-panel">
          <span class="ltracker-label">Text fallback</span>
          <pre class="ltracker-text">${escapeHtml(rendered.textFallback)}</pre>
        </section>
        <section class="ltracker-panel">
          <span class="ltracker-label">Sanitized HTML</span>
          <pre class="ltracker-text">${escapeHtml(rendered.html || "None")}</pre>
        </section>
        <section class="ltracker-panel">
          <span class="ltracker-label">Source metadata</span>
          <pre class="ltracker-json">${escapeHtml(metadata)}</pre>
        </section>
      </div>
    `;
    const setError = (message: string): void => {
      const target = modal.root.querySelector<HTMLElement>("[data-editor-error]");
      if (target) target.textContent = message;
    };
    const onClick = (event: Event): void => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-editor-action]")
        : null;
      const action = target?.dataset.editorAction;
      if (!action) return;
      const jsonInput = modal.root.querySelector<HTMLTextAreaElement>("[data-editor-json]");
      if (action === "copy-json") void copyText(jsonInput?.value ?? rendered.json, "tracker JSON");
      if (action === "copy-text") void copyText(rendered.textFallback, "tracker text");
      if (action === "copy-html") void copyText(rendered.html || null, "tracker HTML");
      if (action === "close") modal.dismiss();
      if (action === "save-json") {
        const jsonText = jsonInput?.value ?? "";
        try {
          const parsed = JSON.parse(jsonText);
          const data = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "data" in parsed && isRecord(parsed.data)
            ? parsed.data
            : parsed;
          if (!data || typeof data !== "object" || Array.isArray(data)) {
            setError("Tracker JSON must be a JSON object.");
            return;
          }
          send({
            type: "save_edited_message_tracker",
            chatId: activeChatId(),
            messageId: entry.indexEntry.messageId,
            swipeKey: entry.indexEntry.swipeKey,
            jsonText: JSON.stringify(data),
            requestId: requestId("tracker-edit"),
          });
          modal.dismiss();
        } catch (error) {
          setError(`Invalid JSON: ${errorMessage(error)}`);
        }
      }
    };
    modal.root.addEventListener("click", onClick);
    modal.onDismiss(() => modal.root.removeEventListener("click", onClick));
  }

  function renderMessageHistory(): string {
    const filter = historyFilterText.trim().toLowerCase();
    const currentMessageId = state.diagnostics.lastMessageControlMessageId
      ?? state.diagnostics.latestAttachedMessageId
      ?? state.diagnostics.lastSwipeDetectedMessageId;
    const selectedSwipeKey = state.diagnostics.lastMessageControlSwipeKey
      ?? state.diagnostics.lastSwipeKey;
    const baseEntries = groupMessageTrackerHistory(allIndexedHistoryEntries(), historyShowDuplicates).entries;
    const entries = baseEntries.filter((entry) => {
      const rendered = entry.rendered;
      if (historyErrorsOnly && rendered.errors.length === 0 && rendered.controlState.generationStatus !== "failed") return false;
      if (historyCurrentMessageOnly && (!currentMessageId || entry.indexEntry.messageId !== currentMessageId)) return false;
      if (historySelectedSwipeOnly && (!selectedSwipeKey || entry.indexEntry.swipeKey !== selectedSwipeKey)) return false;
      if (historyCurrentPresetOnly && (rendered.presetId ?? entry.indexEntry.presetId) !== state.activePreset.id) return false;
      if (!filter) return true;
      const haystack = [
        entry.indexEntry.messageId,
        entry.indexEntry.swipeKey,
        entry.indexEntry.presetName,
        rendered.presetName,
        rendered.snapshotCreatedAt,
        rendered.textFallback,
      ].filter((item): item is string => Boolean(item)).join(" ").toLowerCase();
      return haystack.includes(filter);
    });

    const undoBannerHtml = recentlyDeletedBanner
      ? `
        <div class="ltracker-undo-banner">
          <span>Tracker snapshot deleted.</span>
          <button class="ltracker-button" type="button" data-action="undo-delete">Undo</button>
        </div>
      `
      : "";

    const loadMoreHtml = state.diagnostics.messageSnapshotIndexCount > currentHistoryLimit
      ? `
        <div class="ltracker-history-load-more" style="margin-top: 14px; text-align: center;">
          <button class="ltracker-button" type="button" data-action="load-more-history">Load More</button>
        </div>
      `
      : "";

    if (entries.length === 0) {
      const message = baseEntries.length > 0
        ? "No message-attached tracker snapshots match the current filters."
        : "No message-attached tracker snapshots are indexed for this chat yet.";
      return `
        ${undoBannerHtml}
        <div class="ltracker-render-placeholder">${escapeHtml(message)}</div>
      `;
    }
    return `
      ${undoBannerHtml}
      <div class="ltracker-history-list">
        ${entries.map((entry) => {
          const rendered = entry.rendered;
          const open = state.settings.messageDisplay.collapsedByDefault ? "" : " open";
          const duration = formatDurationMs(rendered.generationDurationMs);
          const title = [
            entry.indexEntry.messageIndex !== null ? `Message #${entry.indexEntry.messageIndex}` : "Message",
            entry.indexEntry.swipeIndex !== null ? `Swipe ${entry.indexEntry.swipeIndex + 1}` : `Swipe ${entry.indexEntry.swipeKey}`,
            rendered.presetName ? rendered.presetName : "Preset unknown",
            duration,
          ].filter((item): item is string => Boolean(item)).join(" - ");
          const meta = [
            `id ${entry.indexEntry.messageId}`,
            `swipe ${entry.indexEntry.swipeKey}`,
            entry.indexEntry.swipeKeySource ? `source ${entry.indexEntry.swipeKeySource}` : null,
            rendered.snapshotCreatedAt ? `snapshot ${rendered.snapshotCreatedAt}` : "snapshot unavailable",
            rendered.attachedAt ? `attached ${rendered.attachedAt}` : null,
            rendered.generationDurationMs !== null ? `duration ${formatDurationMs(rendered.generationDurationMs)}` : null,
            rendered.isRegenerating ? "generating" : null,
            `mode ${rendered.renderMode}`,
            `generated ${generatedPresetLabel(entry)}`,
            `rendered ${renderedPresetLabel(entry)}`,
            rendered.renderPresetWarning ? `render warning ${rendered.renderPresetWarning}` : null,
          ].filter((item): item is string => Boolean(item)).join(" / ");
          const htmlPreview = rendered.html
            ? `<div class="ltracker-render-preview">${rendered.html}</div>`
            : `<pre class="ltracker-text">${escapeHtml(rendered.textFallback)}</pre>`;
          const copyActions = state.settings.messageDisplay.showDebugCopyButtonsInHistory
            ? `
                <button class="ltracker-button" type="button" data-action="copy-history-json" data-message-id="${escapeHtml(entry.indexEntry.messageId)}" data-swipe-key="${escapeHtml(entry.indexEntry.swipeKey)}"${disabled(!rendered.json)}>
                  Copy JSON
                </button>
                <button class="ltracker-button" type="button" data-action="copy-history-html" data-message-id="${escapeHtml(entry.indexEntry.messageId)}" data-swipe-key="${escapeHtml(entry.indexEntry.swipeKey)}"${disabled(!rendered.html)}>
                  Copy HTML
                </button>
                <button class="ltracker-button" type="button" data-action="copy-history-text" data-message-id="${escapeHtml(entry.indexEntry.messageId)}" data-swipe-key="${escapeHtml(entry.indexEntry.swipeKey)}"${disabled(!rendered.textFallback)}>
                  Copy Text
                </button>
              `
            : "";
          return `
            <article class="ltracker-history-entry">
              <details${open}>
                <summary>${escapeHtml(title)}</summary>
                <div class="ltracker-history-meta">${escapeHtml(meta)}</div>
                ${htmlPreview}
                <div class="ltracker-copy-actions" style="margin-top: 8px;">
                  <button class="ltracker-button" type="button" data-action="regenerate-history" data-message-id="${escapeHtml(entry.indexEntry.messageId)}" data-swipe-key="${escapeHtml(entry.indexEntry.swipeKey)}">
                    Regenerate
                  </button>
                  <button class="ltracker-button" type="button" data-action="edit-history" data-message-id="${escapeHtml(entry.indexEntry.messageId)}" data-swipe-key="${escapeHtml(entry.indexEntry.swipeKey)}">
                    Edit/View
                  </button>
                  <button class="ltracker-button" type="button" data-action="delete-history" data-message-id="${escapeHtml(entry.indexEntry.messageId)}" data-swipe-key="${escapeHtml(entry.indexEntry.swipeKey)}">
                    Delete
                  </button>
                  ${copyActions}
                </div>
              </details>
            </article>
          `;
        }).join("")}
      </div>
      ${loadMoreHtml}
    `;
  }

  function render(): void {
    inputAction.setEnabled(state.status !== "generating");
    const canGenerate = state.status !== "generating";
    const snapshotText = state.snapshot
      ? JSON.stringify(state.snapshot.data, null, 2)
      : "No tracker snapshot saved for this chat yet.";
    const diagnostics = state.diagnostics;
    const rawOutput = diagnostics.lastRawOutput;
    const prompt = diagnostics.lastPromptPreview;
    const parsedTracker = diagnostics.lastParsedTracker;
    const error = state.error ?? diagnostics.lastError;
    const autoStatus = state.settings.auto.autoModeEnabled
      ? diagnostics.autoSubscriptionActive ? "Armed" : "Enabled, listener inactive"
      : "Disabled";
    const latestMessageSnapshotText = state.latestMessageSnapshot
      ? JSON.stringify(state.latestMessageSnapshot, null, 2)
      : "No message-attached tracker snapshot saved yet.";
    const memoryPreviewText = state.memoryPreview
      ?? "No tracker memory block available yet.";
    const injectionPreviewText = state.injectionPreview
      ?? "No injection preview available yet.";
    const renderPreview = state.renderPreview;
    const renderStatus = renderPreview?.status ?? "not rendered";
    const renderSnapshotAt = renderPreview?.snapshotCreatedAt ?? "None";
    const renderHasTemplate = state.activePreset.htmlTemplate?.trim() ? "yes" : "no";
    const renderHtmlPreview = renderPreview?.html
      ? `<div class="ltracker-render-preview">${renderPreview.html}</div>`
      : `<div class="ltracker-render-preview ltracker-render-placeholder">${escapeHtml("No sanitized HTML preview yet. Render a snapshot to preview the active template.")}</div>`;
    const renderTextFallback = renderPreview?.textFallback
      ?? "No text fallback preview yet. Render a snapshot to create one.";
    const renderWarningsText = renderPreview?.warnings.length
      ? renderPreview.warnings.join("\n")
      : "None";
    const renderErrorsText = renderPreview?.errors.length
      ? renderPreview.errors.join("\n")
      : "None";
    const messageHistoryHtml = renderMessageHistory();
    const placementWarning = state.settings.messageDisplay.placement === "top"
      && diagnostics.messageWidgetPlacementReason
      && diagnostics.messageDisplayRenderer === "iframe_widget"
      ? `<p class="ltracker-note">${escapeHtml("Current Lumiverse widget API renders below messages.")}</p>`
      : "";
    const currentDisplaySurface = resolveDisplaySurface(state.settings);
    const overlaySurfaceSelected = currentDisplaySurface === "anchored_popover" || currentDisplaySurface === "fullscreen_reader";
    const displaySurfaceNote = currentDisplaySurface === "inline_wide"
      ? "Inline wide uses a wide message-row mount and width settings below."
      : overlaySurfaceSelected
        ? "Popover and fullscreen are detached from message-bubble width limits; width fields below apply to inline surfaces."
        : currentDisplaySurface === "drawer_only"
          ? "Drawer history only removes inline chat display."
          : "Inline contained stays inside the normal message bubble.";
    const inlineOnlySuffix = overlaySurfaceSelected || currentDisplaySurface === "drawer_only" ? " (inline only)" : "";
    const activePreset = state.activePreset;
    const activePresetIsBuiltIn = activePreset.origin === "built_in";
    const presetSchemaText = JSON.stringify(activePreset.jsonSchema, null, 2);
    const presetHtmlWarning = activePreset.htmlTemplate?.trim()
      ? ""
      : activePresetIsBuiltIn
        ? "Built-in preset has no HTML template."
        : "";
    const presetOptions = state.presets.map((preset) => {
      return `<option value="${escapeHtml(preset.id)}"${selected(preset.id === activePreset.id)}>${escapeHtml(preset.name)} (${escapeHtml(preset.origin)})</option>`;
    }).join("");
    const permissionText = [
      state.permissions.generation ? "generation granted" : "generation missing",
      state.permissions.chats ? "chats granted" : "chats missing",
      state.permissions.chatMutation ? "chat_mutation granted" : "chat_mutation missing",
      diagnostics.contextHandlerDisabledReason
        ? "context_handler disabled by hotfix"
        : state.permissions.contextHandler ? "context_handler granted" : "context_handler missing",
      state.permissions.interceptor ? "interceptor granted" : "interceptor missing",
    ].join(" / ");
    const connectionSettings = state.settings.connection;
    const selectedConnection = connectionSettings.selectedConnectionId
      ? state.connectionProfiles.find((profile) => profile.id === connectionSettings.selectedConnectionId) ?? null
      : null;
    const connectionOptions = [
      `<option value=""${selected(!connectionSettings.selectedConnectionId)}>None selected</option>`,
      ...state.connectionProfiles.map((profile) => {
        const label = [
          profile.name,
          profile.provider ? `provider ${profile.provider}` : null,
          profile.model ? `model ${profile.model}` : null,
          profile.is_default ? "default" : null,
        ].filter((item): item is string => Boolean(item)).join(" / ");
        return `<option value="${escapeHtml(profile.id)}"${selected(profile.id === connectionSettings.selectedConnectionId)}>${escapeHtml(label)}</option>`;
      }),
      connectionSettings.selectedConnectionId && !selectedConnection
        ? `<option value="${escapeHtml(connectionSettings.selectedConnectionId)}" selected>${escapeHtml(connectionSettings.selectedConnectionName ?? connectionSettings.selectedConnectionId)} (missing)</option>`
        : "",
    ].join("");
    const connectionWarning = connectionSettings.mode !== "active_quiet" && !connectionSettings.selectedConnectionId
      ? "Selected connection mode needs a connection profile. LTracker will fall back to active quiet mode."
      : connectionSettings.mode !== "active_quiet" && !selectedConnection
        ? "Selected tracker connection is not in the current profile list. LTracker will fall back to active quiet mode."
        : diagnostics.lastGenerationConnectionFallbackReason;
    const reasoningControls = connectionSettings.reasoning.source === "custom"
      ? `
            <label class="ltracker-check">
              <input type="checkbox" data-connection-reasoning="apiReasoning"${checked(connectionSettings.reasoning.apiReasoning)}>
              API reasoning
            </label>
            <label class="ltracker-field">
              Effort
              <select data-connection-reasoning="effort">
                <option value="auto"${selected(connectionSettings.reasoning.effort === "auto")}>Auto</option>
                <option value="none"${selected(connectionSettings.reasoning.effort === "none")}>None</option>
                <option value="minimal"${selected(connectionSettings.reasoning.effort === "minimal")}>Minimal</option>
                <option value="low"${selected(connectionSettings.reasoning.effort === "low")}>Low</option>
                <option value="medium"${selected(connectionSettings.reasoning.effort === "medium")}>Medium</option>
                <option value="high"${selected(connectionSettings.reasoning.effort === "high")}>High</option>
                <option value="max"${selected(connectionSettings.reasoning.effort === "max")}>Max</option>
                <option value="xhigh"${selected(connectionSettings.reasoning.effort === "xhigh")}>XHigh</option>
              </select>
            </label>
            <label class="ltracker-field">
              Thinking display
              <select data-connection-reasoning="thinkingDisplay">
                <option value="auto"${selected(connectionSettings.reasoning.thinkingDisplay === "auto")}>Auto</option>
                <option value="summarized"${selected(connectionSettings.reasoning.thinkingDisplay === "summarized")}>Summarized</option>
                <option value="omitted"${selected(connectionSettings.reasoning.thinkingDisplay === "omitted")}>Omitted</option>
              </select>
            </label>
        `
      : "";
    const connectionTestRunning = diagnostics.lastConnectionTestStatus === "running";
    const connectionTestSummary = [
      `status ${diagnostics.lastConnectionTestStatus}`,
      diagnostics.lastConnectionTestDurationMs !== null ? `duration ${formatDurationMs(diagnostics.lastConnectionTestDurationMs)}` : null,
      diagnostics.lastConnectionTestFinishReason ? `finish ${diagnostics.lastConnectionTestFinishReason}` : null,
      diagnostics.lastConnectionTestError ? `error ${diagnostics.lastConnectionTestError}` : null,
    ].filter((item): item is string => Boolean(item)).join(" / ");
    const recommendedConnection = activePreset.recommendedConnection;
    const recommendedConnectionText = recommendedConnection
      ? [
          recommendedConnection.notes ?? null,
          recommendedConnection.mode ? `mode ${recommendedConnection.mode}` : null,
          recommendedConnection.temperature !== undefined ? `temperature ${recommendedConnection.temperature}` : null,
          recommendedConnection.max_tokens !== undefined ? `max_tokens ${recommendedConnection.max_tokens}` : null,
          recommendedConnection.reasoning?.source ? `reasoning ${recommendedConnection.reasoning.source}` : null,
        ].filter((item): item is string => Boolean(item)).join(" / ")
      : null;

    const renderLab = buildRenderLabPreview();
    const renderLabWidth = renderLabWidthPx();
    const renderLabWarningsHtml = renderLab.warnings.length > 0
      ? `
        <details class="ltracker-details" style="margin-top: 8px;" open>
          <summary>Render warnings (${renderLab.warnings.length})</summary>
          <ul style="font-size: 10px; margin: 6px 0 0 16px; padding: 0;">
            ${renderLab.warnings.slice(0, 30).map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
          </ul>
        </details>
      `
      : `<p class="ltracker-note">No Render Lab warnings for this sample.</p>`;
    const renderLabRequirements = renderLab.report.rendererRequirements.features.length > 0
      ? renderLab.report.rendererRequirements.features.join(", ")
      : "Basic HTML";
    const renderLabHtml = `
      <div class="ltracker-render-lab" data-render-lab-root>
        <div class="ltracker-section-title">
          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold;">Preset Render Lab</span>
          <span class="ltracker-chip">Preview only</span>
        </div>
        <div class="ltracker-settings">
          <label class="ltracker-field">
            Sample data
            <select data-render-lab="sampleMode">
              <option value="minimal"${selected(renderLabSampleMode === "minimal")}>Minimal</option>
              <option value="normal"${selected(renderLabSampleMode === "normal")}>Normal</option>
              <option value="stress"${selected(renderLabSampleMode === "stress")}>Stress / Max Arrays</option>
              <option value="mobile_torture"${selected(renderLabSampleMode === "mobile_torture")}>Mobile Torture</option>
              <option value="cast_heavy"${selected(renderLabSampleMode === "cast_heavy")}>Cast Heavy</option>
              <option value="world_heavy"${selected(renderLabSampleMode === "world_heavy")}>World Heavy</option>
            </select>
          </label>
          <label class="ltracker-field">
            Viewport
            <select data-render-lab="viewport">
              <option value="phone_narrow"${selected(renderLabViewport === "phone_narrow")}>Phone narrow - 360px</option>
              <option value="phone_large"${selected(renderLabViewport === "phone_large")}>Phone large - 430px</option>
              <option value="tablet"${selected(renderLabViewport === "tablet")}>Tablet - 768px</option>
              <option value="desktop"${selected(renderLabViewport === "desktop")}>Desktop - 1100px</option>
              <option value="custom"${selected(renderLabViewport === "custom")}>Custom width</option>
            </select>
          </label>
          <label class="ltracker-field">
            Custom width
            <input type="number" min="260" max="1800" step="10" data-render-lab="customWidth" value="${escapeHtml(String(renderLabCustomWidth))}">
          </label>
          <label class="ltracker-field">
            Display shell
            <select data-render-lab="surface">
              <option value="inline_contained"${selected(renderLabSurface === "inline_contained")}>Inline contained</option>
              <option value="inline_wide"${selected(renderLabSurface === "inline_wide")}>Inline wide</option>
              <option value="popover_body"${selected(renderLabSurface === "popover_body")}>Popover body</option>
              <option value="fullscreen_reader_body"${selected(renderLabSurface === "fullscreen_reader_body")}>Fullscreen reader body</option>
            </select>
          </label>
          <label class="ltracker-field">
            Background
            <select data-render-lab="background">
              <option value="chat"${selected(renderLabBackground === "chat")}>Simulated chat</option>
              <option value="plain_dark"${selected(renderLabBackground === "plain_dark")}>Plain dark</option>
              <option value="checker"${selected(renderLabBackground === "checker")}>Transparent checker</option>
            </select>
          </label>
        </div>
        <div class="ltracker-grid ltracker-details" style="margin-top: 8px;">
          ${renderRow("Preset under test", renderLab.preset.name ?? "Unnamed")}
          ${renderRow("Viewport width", `${renderLabWidth}px`)}
          ${renderRow("Renderer requirements", renderLabRequirements)}
          ${renderRow("Recommended mode", renderLab.report.rendererRequirements.recommendedMode === "dev" ? "Trusted now; future Dev Mode for JavaScript-like content" : renderLab.report.rendererRequirements.recommendedMode)}
          ${renderRow("Raw array paths", renderLab.report.rawArrayInterpolationPaths.join(", ") || null)}
          ${renderRow("Raw object paths", renderLab.report.rawObjectInterpolationPaths.join(", ") || null)}
          ${renderRow("Mobile QA", `${renderLab.report.mobileRiskWarnings.length + renderLab.report.verticalTextRiskWarnings.length} warning(s)`)}
          ${renderRow("Estimated prompt tokens", `~${renderLab.report.estimatedPromptTokens.toLocaleString()}`)}
          ${renderRow("Rendered chars", renderLab.html.length.toLocaleString())}
        </div>
        <div class="ltracker-render-lab-stage ltd-bg-${escapeHtml(renderLabBackground)}" style="width: ${escapeHtml(String(renderLabWidth))}px;">
          <div class="ltracker-render-lab-preview ltd-lab-${escapeHtml(renderLabSurface)}" data-render-lab-preview>
            ${renderLab.html}
          </div>
        </div>
        ${renderLabWarningsHtml}
        <details class="ltracker-details" style="margin-top: 8px;">
          <summary>Sanitized HTML</summary>
          <pre class="ltracker-json" style="max-height: 180px; font-size: 10px;">${escapeHtml(renderLab.html)}</pre>
        </details>
        <div class="ltracker-actions" style="margin-top: 8px;">
          <button class="ltracker-button" type="button" data-action="copy-render-lab-html">Copy sanitized HTML</button>
          <button class="ltracker-button" type="button" data-action="copy-render-lab-sample">Copy sample JSON</button>
          <button class="ltracker-button" type="button" data-action="copy-render-lab-report">Copy lint report</button>
        </div>
      </div>
    `;

    let importReviewHtml = "";
    if (stagedImportPack) {
      const pack = stagedImportPack;
      const preset = pack.preset;
      const meta = pack.packMeta;
      const hasRec = Boolean(pack.recommendedSettings);

      const overwriteOptions = state.presets
        .filter((p) => p.origin !== "built_in" && p.id !== DEFAULT_TRACKER_PRESET_ID)
        .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
        .join("");

      const recDetailsList: string[] = [];
      if (pack.recommendedSettings) {
        const rec = pack.recommendedSettings;
        if (rec.connection) {
          recDetailsList.push(`Connection settings (mode: ${rec.connection.mode || "inherit"})`);
        }
        if (rec.memory) {
          recDetailsList.push(`Memory settings (retain: ${rec.memory.retainCount ?? "inherit"})`);
        }
        if (rec.injection) {
          recDetailsList.push(`Injection settings (format: ${rec.injection.format ?? "inherit"})`);
        }
        if (rec.messageDisplay) {
          recDetailsList.push(`Display settings (surface: ${rec.messageDisplay.displaySurface ?? rec.messageDisplay.displayMode ?? "inherit"})`);
        }
        if (rec.expandedWidth) {
          recDetailsList.push(`Expanded width settings (mode: ${rec.expandedWidth.expandedWidthMode ?? "inherit"})`);
        }
        if (rec.budget) {
          recDetailsList.push(`Budget settings (ultra mode: ${rec.budget.ultraModeEnabled ? "enabled" : "disabled"})`);
        }
      }

      const recDetailsHtml = recDetailsList.length > 0
        ? `<div class="ltracker-rec-details" style="font-size: 10px; color: #aaa; margin-top: 4px; padding-left: 10px;">Applying recommendations will update:<ul>${recDetailsList.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
        : "";
      const rendererRequirements = detectTemplateRendererRequirements(preset?.htmlTemplate ?? "");
      const importValidation = preset ? validatePresetReport(preset, {
        allowInlineStyles: true,
        maxRenderedChars: state.settings.budget.renderedHtmlMaxChars,
        sampleMode: renderLabSampleMode,
      }) : null;
      const importQaSignals = importValidation
        ? [
            importValidation.rawArrayInterpolationPaths.length > 0 ? `Possible raw arrays: ${importValidation.rawArrayInterpolationPaths.join(", ")}` : null,
            importValidation.rawObjectInterpolationPaths.length > 0 ? `Possible raw objects: ${importValidation.rawObjectInterpolationPaths.join(", ")}` : null,
            importValidation.mobileRiskWarnings.length > 0 ? `Mobile overflow risks: ${importValidation.mobileRiskWarnings.length}` : null,
            importValidation.verticalTextRiskWarnings.length > 0 ? `Vertical text risks: ${importValidation.verticalTextRiskWarnings.length}` : null,
          ].filter((item): item is string => Boolean(item))
        : [];
      const rendererRequirementsHtml = rendererRequirements.features.length > 0 || rendererRequirements.warnings.length > 0
        ? `
          <div class="ltracker-rec-details" style="font-size: 11px; color: #ddd; margin-bottom: 12px; border: 1px solid rgba(155,92,255,.35); padding: 8px; border-radius: 6px;">
            <strong>This preset uses:</strong>
            <ul style="margin: 6px 0 6px 18px; padding: 0;">
              ${rendererRequirements.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("") || "<li>Basic HTML template features</li>"}
            </ul>
            <div>Recommended mode: ${escapeHtml(rendererRequirements.recommendedMode === "dev" ? "Trusted; JavaScript remains stripped until future Dev Mode" : rendererRequirements.recommendedMode === "trusted" ? "Trusted" : "Safe")}</div>
            ${importValidation ? `<div>Estimated prompt tokens: ~${escapeHtml(importValidation.estimatedPromptTokens.toLocaleString())} / rendered size: ${escapeHtml(importValidation.estimatedRenderedChars.toLocaleString())} chars / schema fields: ${escapeHtml(String(importValidation.unusedSchemaFields.length + importValidation.missingPlaceholders.length))} QA paths checked</div>` : ""}
            ${importQaSignals.length > 0 ? `<div style="color: #fbbc05; margin-top: 4px;">Mobile QA status: review recommended. ${escapeHtml(importQaSignals.join(" / "))}</div>` : `<div style="color: #34a853; margin-top: 4px;">Mobile QA status: no obvious raw-object or mobile layout warnings in sample preview.</div>`}
            ${rendererRequirements.warnings.map((warning) => `<div style="color: #fbbc05; margin-top: 4px;">${escapeHtml(warning)}</div>`).join("")}
          </div>
        `
        : "";

      importReviewHtml = `
        <div class="ltracker-import-review" style="border: 1px solid var(--border-color, #444); padding: 12px; border-radius: 6px; background: rgba(255,255,255,0.02); margin-bottom: 15px;">
          <h3 style="margin-top: 0; color: #9b5cff; font-size: 14px; font-weight: bold; margin-bottom: 8px;">Preset Pack Import Review</h3>
          <div class="ltracker-grid ltracker-details" style="margin-bottom: 12px;">
            ${renderRow("Pack name", preset?.name ?? "Unknown")}
            ${renderRow("Version", preset?.version ?? "1.0")}
            ${renderRow("Author/Exported by", meta?.author ?? "Unknown")}
            ${renderRow("Exported at", meta?.exportedAt ?? "Unknown")}
            ${renderRow("Description", preset?.description ?? "None")}
            ${renderRow("Min. LTracker version", meta?.minVersion ?? "None")}
          </div>
          ${rendererRequirementsHtml}

          <div class="ltracker-settings" style="margin-bottom: 12px;">
            <label class="ltracker-field">
              Preset name (editable)
              <input type="text" data-import-review-name value="${escapeHtml(preset?.name ?? "Imported Preset")}">
            </label>
            <label class="ltracker-field">
              Install mode
              <select data-import-review-install-mode>
                <option value="new">Save as new preset</option>
                ${overwriteOptions ? `<option value="overwrite">Overwrite existing preset</option>` : ""}
              </select>
            </label>
            ${overwriteOptions ? `
              <label class="ltracker-field" data-import-review-overwrite-container style="display: none;">
                Preset to overwrite
                <select data-import-review-overwrite-target>
                  ${overwriteOptions}
                </select>
              </label>
            ` : ""}
            <label class="ltracker-field">
              Template trust mode
              <select data-import-review-trust-mode>
                <option value="trusted"${selected(rendererRequirements.recommendedMode !== "safe")}>Trusted</option>
                <option value="safe"${selected(rendererRequirements.recommendedMode === "safe")}>Safe</option>
              </select>
            </label>
            ${hasRec ? `
              <label class="ltracker-check">
                <input type="checkbox" data-import-review-apply-settings checked>
                Apply recommended settings
              </label>
              ${recDetailsHtml}
            ` : ""}
          </div>

          <div class="ltracker-actions">
            <button class="ltracker-button" type="button" data-action="import-preset-pack" style="background: #9b5cff; color: #fff;">
              Install Preset
            </button>
            <button class="ltracker-button" type="button" data-action="cancel-import">
              Cancel Import
            </button>
          </div>
        </div>
      `;
    }

    let validationReportHtml = "";
    if (stagedValidationReport) {
      const rep = stagedValidationReport;
      const entriesHtml = rep.entries.map((entry) => {
        let badgeColor = "#444";
        if (entry.severity === "error") badgeColor = "#ea4335";
        if (entry.severity === "warning") badgeColor = "#fbbc05";
        if (entry.severity === "pass") badgeColor = "#34a853";
        if (entry.severity === "info") badgeColor = "#4285f4";

        return `
          <div class="ltracker-validation-entry" style="display: flex; gap: 8px; margin-bottom: 4px; font-size: 11px; align-items: flex-start;">
            <span style="background: ${badgeColor}; color: #fff; padding: 1px 4px; border-radius: 3px; font-size: 9px; text-transform: uppercase; font-weight: bold; min-width: 50px; text-align: center; margin-top: 2px;">
              ${escapeHtml(entry.severity)}
            </span>
            <div>
              <span style="font-weight: bold; color: #ccc;">[${escapeHtml(entry.category)}]</span>
              <span>${escapeHtml(entry.message)}</span>
            </div>
          </div>
        `;
      }).join("");

      const placeholdersHtml = rep.missingPlaceholders.length > 0
        ? `<p class="ltracker-note" style="color: #fbbc05; margin-top: 5px;">Missing Schema Fields: ${rep.missingPlaceholders.map(p => `<code>${escapeHtml(p)}</code>`).join(", ")}</p>`
        : "";

      const unusedHtml = rep.unusedSchemaFields.length > 0
        ? `<p class="ltracker-note" style="color: #4285f4; margin-top: 5px;">Unused Schema Fields: ${rep.unusedSchemaFields.map(f => `<code>${escapeHtml(f)}</code>`).join(", ")}</p>`
        : "";

      const warningGroupsHtml = rep.sanitizerWarningGroups.length > 0
        ? `
          <details style="margin-top: 5px;">
            <summary style="font-size: 11px; color: #fbbc05; cursor: pointer;">Sanitizer Warnings (${rep.sanitizerWarningGroups.length})</summary>
            <ul style="font-size: 10px; margin: 4px 0 0 15px; padding: 0; color: #aaa;">
              ${rep.sanitizerWarningGroups.map(g => `<li>${escapeHtml(g)}</li>`).join("")}
            </ul>
          </details>
        `
        : "";
      const authoringLintHtml = rep.rawArrayInterpolationPaths.length > 0
        || rep.rawObjectInterpolationPaths.length > 0
        || rep.mobileRiskWarnings.length > 0
        || rep.verticalTextRiskWarnings.length > 0
        ? `
          <details style="margin-top: 5px;" open>
            <summary style="font-size: 11px; color: #fbbc05; cursor: pointer;">Preset Authoring Warnings</summary>
            <ul style="font-size: 10px; margin: 4px 0 0 15px; padding: 0; color: #aaa;">
              ${rep.rawArrayInterpolationPaths.map((path) => `<li>${escapeHtml(`Raw array interpolation risk: ${path}. Use #each or fieldChipList/chipList.`)}</li>`).join("")}
              ${rep.rawObjectInterpolationPaths.map((path) => `<li>${escapeHtml(`Raw object interpolation risk: ${path}. Use #with, json, or a field helper.`)}</li>`).join("")}
              ${rep.mobileRiskWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
              ${rep.verticalTextRiskWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
            </ul>
          </details>
        `
        : "";
      const rendererReqHtml = rep.rendererRequirements.features.length > 0 || rep.rendererRequirements.warnings.length > 0
        ? `
          <div style="font-size: 11px; color: #ddd; margin-top: 8px; border: 1px solid rgba(155,92,255,.25); padding: 6px; border-radius: 4px;">
            Renderer requirements: ${escapeHtml(rep.rendererRequirements.features.join(", ") || "Basic HTML")}
            <br>Recommended mode: ${escapeHtml(rep.rendererRequirements.recommendedMode === "dev" ? "Trusted now; future Dev Mode for JavaScript-like content" : rep.rendererRequirements.recommendedMode)}
          </div>
        `
        : "";

      validationReportHtml = `
        <div class="ltracker-validation-report" style="border: 1px solid var(--border-color, #444); padding: 12px; border-radius: 6px; background: rgba(255,255,255,0.01); margin-top: 15px;">
          <h3 style="margin-top: 0; color: ${rep.ok ? "#34a853" : "#ea4335"}; font-size: 14px; font-weight: bold; margin-bottom: 8px;">
            Preset Validation: ${rep.ok ? "Passed" : "Failed with Errors"}
          </h3>
          <div class="ltracker-chip-row" style="margin-bottom: 8px;">
            <span class="ltracker-chip" style="background: rgba(234,67,53,0.1); color: #ea4335;">Errors: ${rep.errorCount}</span>
            <span class="ltracker-chip" style="background: rgba(251,188,5,0.1); color: #fbbc05;">Warnings: ${rep.warningCount}</span>
            <span class="ltracker-chip" style="background: rgba(52,168,83,0.1); color: #34a853;">Passes: ${rep.passCount}</span>
          </div>

          <div style="max-height: 200px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.05); padding: 6px; border-radius: 4px; background: rgba(0,0,0,0.1); margin-bottom: 8px;">
            ${entriesHtml}
          </div>

          ${placeholdersHtml}
          ${unusedHtml}
          ${authoringLintHtml}
          ${warningGroupsHtml}
          ${rendererReqHtml}

          <div class="ltracker-grid ltracker-details" style="margin-top: 8px; font-size: 11px;">
            ${renderRow("Est. Pack Size", `${rep.estimatedPackSizeChars.toLocaleString()} chars`)}
            ${renderRow("Est. Prompt Tokens", `~${rep.estimatedPromptTokens.toLocaleString()}`)}
            ${renderRow("Est. Rendered HTML Size", `${rep.estimatedRenderedChars.toLocaleString()} chars`)}
            ${renderRow("Ultra Mode recommended", rep.estimatedPromptTokens > 8000 || rep.estimatedRenderedChars > 100000 ? "Yes" : "No")}
          </div>
        </div>
      `;
    }

    let sampleSnapshotHtml = "";
    if (stagedSampleSnapshot) {
      const renderPreview = stagedSampleRenderResult;
      const sampleHtmlPreview = renderPreview?.html
        ? `<div class="ltracker-render-preview">${renderPreview.html}</div>`
        : `<div class="ltracker-render-preview ltracker-render-placeholder">${escapeHtml("No HTML preview rendered.")}</div>`;

      sampleSnapshotHtml = `
        <div class="ltracker-sample-snapshot-preview" style="border: 1px solid var(--border-color, #444); padding: 12px; border-radius: 6px; background: rgba(255,255,255,0.01); margin-top: 15px;">
          <h3 style="margin-top: 0; color: #4285f4; font-size: 14px; font-weight: bold; margin-bottom: 8px;">Sample Snapshot & Render Preview</h3>
          <details style="margin-bottom: 8px;">
            <summary style="font-size: 11px; cursor: pointer; color: #aaa;">View Sample Snapshot Data</summary>
            <pre class="ltracker-json" style="max-height: 150px; font-size: 10px;">${escapeHtml(JSON.stringify(stagedSampleSnapshot, null, 2))}</pre>
          </details>

          ${sampleHtmlPreview}

          <div class="ltracker-actions" style="margin-top: 8px;">
            <button class="ltracker-button" type="button" data-action="copy-sample-snapshot">
              Copy Sample Snapshot JSON
            </button>
            <button class="ltracker-button" type="button" data-action="copy-render-html-sample" ${disabled(!renderPreview?.html)}>
              Copy Rendered HTML
            </button>
          </div>
        </div>
      `;
    }

    tab.root.innerHTML = `
      <section class="ltracker-shell">
        <header class="ltracker-header">
          <div>
            <h2 class="ltracker-title">LTracker</h2>
            <div class="ltracker-version">Version ${escapeHtml(state.version)}</div>
          </div>
          <div class="ltracker-actions">
            <span class="ltracker-status">${escapeHtml(labelForStatus(state.status))}</span>
            <span class="ltracker-save-status" data-settings-save-status>${escapeHtml(settingsSaveStatusLabel())}</span>
          </div>
        </header>

        <nav class="ltracker-section-nav" aria-label="LTracker sections">
          ${["Dashboard", "Generation", "Auto", "Connection", "Display", "Renderer", "Memory / Injection", "Presets", "History", "Diagnostics", "Advanced"].map((label) => {
            const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            return `<a class="ltracker-nav-chip" data-drawer-section="${escapeHtml(id)}" href="#ltracker-section-${id}">${escapeHtml(label)}</a>`;
          }).join("")}
        </nav>

        <div class="ltracker-actions">
          <button class="ltracker-button" type="button" data-action="generate" ${disabled(!canGenerate)}>
            Generate Tracker
          </button>
          <button class="ltracker-button" type="button" data-action="refresh">
            Refresh State
          </button>
          <button class="ltracker-button" type="button" data-action="clear-snapshot" ${disabled(!state.chatId)}>
            Clear Current Chat Snapshot
          </button>
        </div>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-dashboard">
          <div class="ltracker-section-title">
            <span class="ltracker-label">Dashboard</span>
          </div>
          <div class="ltracker-chip-row">
            <span class="ltracker-chip">Auto ${escapeHtml(state.settings.auto.autoModeEnabled ? "on" : "off")}</span>
            <span class="ltracker-chip">Memory ${escapeHtml(state.settings.memory.enabled ? "on" : "off")}</span>
            <span class="ltracker-chip">Inject ${escapeHtml(state.settings.injection.enabled ? "on" : "off")}</span>
            <span class="ltracker-chip">Display ${escapeHtml(diagnostics.messageDisplayMode ?? "drawer")}</span>
            <span class="ltracker-chip">Attach ${escapeHtml(state.settings.messageDisplay.attachmentMode)}</span>
          </div>
          <div class="ltracker-grid ltracker-details">
            ${renderRow("Active preset", activePreset.name)}
            ${renderRow("Tracker connection", connectionSettings.selectedConnectionName ?? connectionSettings.mode)}
            ${renderRow("Latest snapshot", state.snapshot?.createdAt ?? null)}
            ${renderRow("Latest memory", diagnostics.lastMemorySourceSummary)}
            ${renderRow("Auto finalization", diagnostics.lastAutoFinalizationState)}
            ${renderRow("Waiting message", diagnostics.lastAutoWaitingMessageId)}
          </div>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="generate" ${disabled(!canGenerate)}>Generate Tracker</button>
            <button class="ltracker-button" type="button" data-action="refresh">Refresh State</button>
            <button class="ltracker-button" type="button" data-action="render-template" ${disabled(!state.chatId)}>Render Latest Snapshot</button>
            <button class="ltracker-button" type="button" data-action="reset-settings">Reset Settings</button>
          </div>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-generation">
          <span class="ltracker-label">Generation</span>
          <div class="ltracker-settings">
            <label class="ltracker-field">
              Recent message limit
              <input type="number" min="1" max="200" step="1" data-setting="recentMessageLimit" value="${escapeHtml(String(state.settings.recentMessageLimit))}">
            </label>
            <label class="ltracker-field">
              Per-message chars
              <input type="number" min="500" max="512000" step="100" data-setting="maxMessageChars" value="${escapeHtml(String(state.settings.maxMessageChars))}">
            </label>
            <label class="ltracker-field">
              Timeout ms
              <input type="number" min="10000" max="180000" step="1000" data-setting="generationTimeoutMs" value="${escapeHtml(String(state.settings.generationTimeoutMs))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="saveRawOutput"${checked(state.settings.saveRawOutput)}>
              Save raw output
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="savePromptPreview"${checked(state.settings.savePromptPreview)}>
              Save prompt preview
            </label>
            <label class="ltracker-field">
              Budget mode
              <select data-budget-setting="mode">
                <option value="estimated_tokens"${selected(state.settings.budget.mode === "estimated_tokens")}>Estimated tokens</option>
                <option value="characters"${selected(state.settings.budget.mode === "characters")}>Characters</option>
              </select>
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-budget-setting="ultraModeEnabled"${checked(state.settings.budget.ultraModeEnabled)}>
              Ultra Tracker Mode
            </label>
            <label class="ltracker-field">
              Recent budget tokens
              <input type="number" min="256" max="128000" step="256" data-budget-setting="recentMessageBudgetTokens" value="${escapeHtml(String(state.settings.budget.recentMessageBudgetTokens))}">
              <span class="ltracker-key">${escapeHtml(budgetHint(state.settings.budget.recentMessageBudgetTokens))}</span>
            </label>
            <label class="ltracker-field">
              Per-message budget tokens
              <input type="number" min="256" max="128000" step="256" data-budget-setting="perMessageBudgetTokens" value="${escapeHtml(String(state.settings.budget.perMessageBudgetTokens))}">
              <span class="ltracker-key">${escapeHtml(budgetHint(state.settings.budget.perMessageBudgetTokens))}</span>
            </label>
            <label class="ltracker-field">
              Max tracker output tokens
              <input type="number" min="256" max="64000" step="256" data-budget-setting="maxTrackerOutputTokens" value="${escapeHtml(String(state.settings.budget.maxTrackerOutputTokens))}">
            </label>
            <label class="ltracker-field">
              Prompt preview tokens
              <input type="number" min="256" max="128000" step="256" data-budget-setting="promptPreviewBudgetTokens" value="${escapeHtml(String(state.settings.budget.promptPreviewBudgetTokens))}">
            </label>
            <label class="ltracker-field">
              Raw output chars
              <input type="number" min="1000" max="2000000" step="1000" data-budget-setting="rawOutputMaxChars" value="${escapeHtml(String(state.settings.budget.rawOutputMaxChars))}">
              <span class="ltracker-key">${escapeHtml(charLimitHint(state.settings.budget.rawOutputMaxChars))}</span>
            </label>
          </div>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="reset-settings">Reset Settings</button>
          </div>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-auto">
          <span class="ltracker-label">Auto</span>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-setting="autoModeEnabled"${checked(state.settings.auto.autoModeEnabled)}>
              Auto mode
            </label>
            <label class="ltracker-field">
              Wait after message finishes
              <input type="number" min="250" max="30000" step="250" data-setting="autoDebounceMs" value="${escapeHtml(String(state.settings.auto.autoDebounceMs))}">
            </label>
            <label class="ltracker-field">
              Skip first messages
              <input type="number" min="0" max="100" step="1" data-setting="skipFirstMessages" value="${escapeHtml(String(state.settings.auto.skipFirstMessages))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="triggerAfterAssistantMessages"${checked(state.settings.auto.triggerAfterAssistantMessages)}>
              Trigger after assistant
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="triggerAfterUserMessages"${checked(state.settings.auto.triggerAfterUserMessages)}>
              Trigger after user
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="attachSnapshotToMessage"${checked(state.settings.auto.attachSnapshotToMessage)}>
              Attach snapshot to message
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="onlyWhenChatActive"${checked(state.settings.auto.onlyWhenChatActive)}>
              Active chat only
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-auto-timing-setting="waitForAssistantFinalization"${checked(state.settings.autoTiming.waitForAssistantFinalization)}>
              Wait for assistant finalization
            </label>
            <label class="ltracker-field">
              Settle ms
              <input type="number" min="0" max="10000" step="50" data-auto-timing-setting="postCompletionSettleMs" value="${escapeHtml(String(state.settings.autoTiming.postCompletionSettleMs))}">
            </label>
            <label class="ltracker-field">
              Stable check ms
              <input type="number" min="0" max="5000" step="50" data-auto-timing-setting="stableContentCheckMs" value="${escapeHtml(String(state.settings.autoTiming.stableContentCheckMs))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-auto-timing-setting="requireStableSwipeContent"${checked(state.settings.autoTiming.requireStableSwipeContent)}>
              Require stable swipe content
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-auto-timing-setting="cancelPendingOnSwipeChange"${checked(state.settings.autoTiming.cancelPendingOnSwipeChange)}>
              Cancel pending on swipe change
            </label>
          </div>
          <div class="ltracker-grid ltracker-details">
            ${renderRow("Finalization state", diagnostics.lastAutoFinalizationState)}
            ${renderRow("Waiting message", diagnostics.lastAutoWaitingMessageId)}
            ${renderRow("Waiting swipe", diagnostics.lastAutoWaitingSwipeKey)}
            ${renderRow("Stable passed", diagnostics.lastAutoStableCheckPassed === null ? null : diagnostics.lastAutoStableCheckPassed ? "yes" : "no")}
            ${renderRow("Pending finalizations", diagnostics.pendingAutoFinalizationCount)}
          </div>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-connection">
          <span class="ltracker-label">Tracker Connection</span>
          <div class="ltracker-settings">
            <label class="ltracker-field">
              Tracker Profile
              <select data-connection-setting="selectedConnectionId">
                ${connectionOptions}
              </select>
            </label>
            <p class="ltracker-note" style="margin-top: 2px; margin-bottom: 8px;">Fallback: Use active roleplay connection if tracker profile is unavailable</p>
            <label class="ltracker-check">
              <input type="checkbox" data-connection-setting="refreshConnectionsOnDrawerOpen"${checked(connectionSettings.refreshConnectionsOnDrawerOpen)}>
              Refresh on drawer open
            </label>
            <label class="ltracker-field ltracker-field-wide">
              Test prompt
              <textarea data-connection-setting="testPrompt">${escapeHtml(connectionSettings.testPrompt || TRACKER_CONNECTION_DEFAULT_TEST_PROMPT)}</textarea>
            </label>
          </div>
          ${connectionWarning ? `<p class="ltracker-note">${escapeHtml(connectionWarning)}</p>` : ""}
          <div class="ltracker-actions" style="margin-top: 10px; margin-bottom: 10px;">
            <button class="ltracker-button" type="button" data-action="refresh-connections">Refresh Connections</button>
            <button class="ltracker-button" type="button" data-action="test-connection" ${disabled(connectionTestRunning)}>Test Tracker Connection</button>
            <button class="ltracker-button" type="button" data-action="cancel-connection-test" ${disabled(!connectionTestRunning)}>Cancel Test</button>
          </div>
          <div class="ltracker-grid ltracker-details">
            ${renderRow("Selected name", selectedConnection?.name ?? connectionSettings.selectedConnectionName)}
            ${renderRow("Selected id", connectionSettings.selectedConnectionId)}
            ${renderRow("Provider", selectedConnection?.provider ?? null)}
            ${renderRow("Model", selectedConnection?.model ?? null)}
            ${renderRow("Has API key", selectedConnection?.has_api_key === null || selectedConnection?.has_api_key === undefined ? null : selectedConnection.has_api_key ? "yes" : "no")}
            ${renderRow("Reasoning binding", compactRecord(selectedConnection?.reasoning_bindings ?? null))}
            ${renderRow("Profiles loaded", state.connectionProfiles.length)}
            ${renderRow("Last refresh", diagnostics.lastConnectionRefreshAt)}
            ${renderRow("Refresh error", diagnostics.lastConnectionRefreshError)}
            ${renderRow("Connection test", connectionTestSummary || null)}
          </div>

          <details class="ltracker-details" style="margin-top: 15px;">
            <summary style="font-weight: bold; cursor: pointer;">Advanced Connection & Model Parameters</summary>
            <div class="ltracker-settings" style="margin-top: 10px;">
              <label class="ltracker-field">
                Low-level Connection Mode
                <select data-connection-setting="mode">
                  <option value="selected_connection_raw"${selected(connectionSettings.mode === "selected_connection_raw")}>Selected profile + raw parameters (Default)</option>
                  <option value="active_quiet"${selected(connectionSettings.mode === "active_quiet")}>Always use active chat connection</option>
                  <option value="selected_connection_quiet"${selected(connectionSettings.mode === "selected_connection_quiet")}>Selected profile, quiet mode</option>
                </select>
              </label>
              <label class="ltracker-field">
                Temperature
                <input type="number" min="0" max="2" step="0.05" data-connection-parameter="temperature" value="${escapeHtml(numberInputValue(connectionSettings.parameters.temperature))}">
              </label>
              <label class="ltracker-field">
                Max tokens
                <input type="number" min="256" max="64000" step="256" data-connection-parameter="max_tokens" value="${escapeHtml(numberInputValue(connectionSettings.parameters.max_tokens))}">
              </label>
              <label class="ltracker-field">
                Top p
                <input type="number" min="0" max="1" step="0.05" data-connection-parameter="top_p" value="${escapeHtml(numberInputValue(connectionSettings.parameters.top_p))}">
              </label>
              <label class="ltracker-field">
                Frequency penalty
                <input type="number" min="-2" max="2" step="0.05" data-connection-parameter="frequency_penalty" value="${escapeHtml(numberInputValue(connectionSettings.parameters.frequency_penalty))}">
              </label>
              <label class="ltracker-field">
                Presence penalty
                <input type="number" min="-2" max="2" step="0.05" data-connection-parameter="presence_penalty" value="${escapeHtml(numberInputValue(connectionSettings.parameters.presence_penalty))}">
              </label>
              <label class="ltracker-field">
                Reasoning Source
                <select data-connection-reasoning="source">
                  <option value="inherit"${selected(connectionSettings.reasoning.source === "inherit")}>Inherit</option>
                  <option value="off"${selected(connectionSettings.reasoning.source === "off")}>Off</option>
                  <option value="custom"${selected(connectionSettings.reasoning.source === "custom")}>Custom</option>
                </select>
              </label>
              ${reasoningControls}
            </div>
            <div class="ltracker-actions" style="margin-top: 10px;">
              <button class="ltracker-button" type="button" data-action="reset-connection-parameters">Reset Parameters</button>
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Last connection test output</summary>
            <pre class="ltracker-text">${escapeHtml(diagnostics.lastConnectionTestOutputPreview ?? "None")}</pre>
          </details>
          <details class="ltracker-details">
            <summary>Last connection test usage</summary>
            <pre class="ltracker-text">${escapeHtml(compactRecord(diagnostics.lastConnectionTestUsage) ?? "None")}</pre>
          </details>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-memory-injection">
          <span class="ltracker-label">Tracker Memory</span>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-memory-setting="enabled"${checked(state.settings.memory.enabled)}>
              Enable tracker memory
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-memory-setting="includeInTrackerGeneration"${checked(state.settings.memory.includeInTrackerGeneration)}>
              Include in tracker generation
            </label>
            <label class="ltracker-field">
              Retain last N
              <input type="number" min="0" max="10" step="1" data-memory-setting="retainCount" value="${escapeHtml(String(state.settings.memory.retainCount))}">
            </label>
            <label class="ltracker-field">
              Full snapshots
              <input type="number" min="0" max="10" step="1" data-memory-setting="fullSnapshotCount" value="${escapeHtml(String(state.settings.memory.fullSnapshotCount))}">
            </label>
            <label class="ltracker-field">
              Memory budget tokens
              <input type="number" min="256" max="128000" step="256" data-budget-setting="trackerMemoryBudgetTokens" value="${escapeHtml(String(state.settings.budget.trackerMemoryBudgetTokens))}">
              <span class="ltracker-key">${escapeHtml(budgetHint(state.settings.budget.trackerMemoryBudgetTokens))}</span>
            </label>
            <label class="ltracker-field">
              Memory source
              <select data-memory-setting="source">
                <option value="hybrid"${selected(state.settings.memory.source === "hybrid")}>Hybrid</option>
                <option value="sidecar_index"${selected(state.settings.memory.source === "sidecar_index")}>Sidecar index</option>
                <option value="embedded_tags"${selected(state.settings.memory.source === "embedded_tags")}>Embedded tags</option>
                <option value="message_history"${selected(state.settings.memory.source === "message_history")}>Message history</option>
              </select>
            </label>
            <label class="ltracker-field">
              Order
              <select data-memory-setting="order">
                <option value="oldest_to_newest"${selected(state.settings.memory.order === "oldest_to_newest")}>Oldest to newest</option>
                <option value="newest_to_oldest"${selected(state.settings.memory.order === "newest_to_oldest")}>Newest to oldest</option>
              </select>
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-memory-setting="compactOlderSnapshots"${checked(state.settings.memory.compactOlderSnapshots)}>
              Compact older snapshots
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-memory-setting="excludeTargetMessage"${checked(state.settings.memory.excludeTargetMessage)}>
              Exclude target message
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-memory-setting="requireSamePreset"${checked(state.settings.memory.requireSamePreset)}>
              Require same preset
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-memory-setting="requireSameSwipeWhenAvailable"${checked(state.settings.memory.requireSameSwipeWhenAvailable)}>
              Require same swipe when available
            </label>
          </div>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="copy-memory-preview" ${disabled(!state.memoryPreview)}>
              Copy Memory Block
            </button>
          </div>
          <details class="ltracker-details">
            <summary>Preview memory block</summary>
            <pre class="ltracker-text">${escapeHtml(memoryPreviewText)}</pre>
          </details>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Advanced Prompt Injection</span>
          <p class="ltracker-note">${escapeHtml("Normal prompt injection affects roleplay prompt context and uses the interceptor path. Keep it off if you only want tracker-generation memory.")}</p>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-injection-setting="enabled"${checked(state.settings.injection.enabled)}>
              Enable normal prompt injection
            </label>
            <label class="ltracker-field">
              Retain last N
              <input type="number" min="0" max="10" step="1" data-injection-setting="retainCount" value="${escapeHtml(String(state.settings.injection.retainCount))}">
            </label>
            <label class="ltracker-field">
              Format
              <select data-injection-setting="format">
                <option value="embedded_tag"${selected(state.settings.injection.format === "embedded_tag")}>Embedded tag</option>
                <option value="compact_text"${selected(state.settings.injection.format === "compact_text")}>Compact text</option>
                <option value="pretty_json"${selected(state.settings.injection.format === "pretty_json")}>Pretty JSON</option>
                <option value="minimal"${selected(state.settings.injection.format === "minimal")}>Minimal</option>
              </select>
            </label>
            <label class="ltracker-field">
              Placement
              <select data-injection-setting="injectionPlacement">
                <option value="append_to_last_assistant"${selected(state.settings.injection.injectionPlacement === "append_to_last_assistant")}>Append to last assistant</option>
                <option value="system_before_last"${selected(state.settings.injection.injectionPlacement === "system_before_last")}>System before last</option>
                <option value="system_after_history"${selected(state.settings.injection.injectionPlacement === "system_after_history")}>System after history</option>
              </select>
            </label>
            <label class="ltracker-field">
              Injection budget tokens
              <input type="number" min="256" max="128000" step="256" data-budget-setting="promptInjectionBudgetTokens" value="${escapeHtml(String(state.settings.budget.promptInjectionBudgetTokens))}">
              <span class="ltracker-key">${escapeHtml(budgetHint(state.settings.budget.promptInjectionBudgetTokens))}</span>
            </label>
            <label class="ltracker-field">
              Role fallback
              <select data-injection-setting="roleFallback">
                <option value="system"${selected(state.settings.injection.roleFallback === "system")}>System</option>
                <option value="assistant"${selected(state.settings.injection.roleFallback === "assistant")}>Assistant</option>
              </select>
            </label>
            <label class="ltracker-field">
              Header
              <input type="text" data-injection-setting="header" value="${escapeHtml(state.settings.injection.header)}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-injection-setting="includeOnlyIfMissingFromPrompt"${checked(state.settings.injection.includeOnlyIfMissingFromPrompt)}>
              Only backfill if missing
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-injection-setting="stripOlderTrackerBlocks"${checked(state.settings.injection.stripOlderTrackerBlocks)}>
              Strip older tracker blocks
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-injection-setting="includeHeader"${checked(state.settings.injection.includeHeader)}>
              Include header
            </label>
          </div>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="copy-injection-preview" ${disabled(!state.injectionPreview)}>
              Copy Injection Preview
            </button>
          </div>
          <details class="ltracker-details">
            <summary>Current injection preview</summary>
            <pre class="ltracker-text">${escapeHtml(injectionPreviewText)}</pre>
          </details>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-renderer">
          <span class="ltracker-label">Renderer</span>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-renderer-setting="enabled"${checked(state.settings.renderer.enabled)}>
              Enable drawer renderer
            </label>
            <label class="ltracker-field">
              Preview source
              <select data-renderer-setting="previewSource">
                <option value="latest_chat_snapshot"${selected(state.settings.renderer.previewSource === "latest_chat_snapshot")}>Latest chat snapshot</option>
                <option value="latest_message_snapshot"${selected(state.settings.renderer.previewSource === "latest_message_snapshot")}>Latest message snapshot</option>
              </select>
            </label>
            <label class="ltracker-field">
              Missing value placeholder
              <input type="text" data-renderer-setting="missingValuePlaceholder" value="${escapeHtml(state.settings.renderer.missingValuePlaceholder)}">
            </label>
            <label class="ltracker-field">
              Template mode
              <select data-renderer-setting="templateTrustMode">
                <option value="trusted"${selected(state.settings.renderer.templateTrustMode === "trusted")}>Trusted</option>
                <option value="safe"${selected(state.settings.renderer.templateTrustMode === "safe")}>Safe</option>
                <option value="dev"${selected(state.settings.renderer.templateTrustMode === "dev")}>Dev future</option>
              </select>
            </label>
            <label class="ltracker-field">
              Rendered HTML chars
              <input type="number" min="1000" max="2000000" step="1000" data-budget-setting="renderedHtmlMaxChars" value="${escapeHtml(String(state.settings.budget.renderedHtmlMaxChars))}">
              <span class="ltracker-key">${escapeHtml(charLimitHint(state.settings.budget.renderedHtmlMaxChars))}</span>
            </label>
          </div>
          <div class="ltracker-grid ltracker-details">
            ${renderRow("Active preset", activePreset.name)}
            ${renderRow("Has HTML template", renderHasTemplate)}
            ${renderRow("Latest snapshot timestamp", renderSnapshotAt)}
            ${renderRow("Render status", renderStatus)}
          </div>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="render-template" ${disabled(!state.chatId)}>
              Render Latest Snapshot
            </button>
            <button class="ltracker-button" type="button" data-action="copy-render-html" ${disabled(!renderPreview?.html)}>
              Copy Sanitized HTML
            </button>
            <button class="ltracker-button" type="button" data-action="copy-render-fallback" ${disabled(!renderPreview?.textFallback)}>
              Copy Text Fallback
            </button>
            <button class="ltracker-button" type="button" data-action="copy-render-errors" ${disabled(!renderPreview || (renderPreview.errors.length === 0 && renderPreview.warnings.length === 0))}>
              Copy Render Errors
            </button>
          </div>
          <details class="ltracker-details" open>
            <summary>Sanitized rendered HTML preview</summary>
            ${renderHtmlPreview}
          </details>
          <details class="ltracker-details">
            <summary>Plain-text fallback preview</summary>
            <pre class="ltracker-text">${escapeHtml(renderTextFallback)}</pre>
          </details>
          <details class="ltracker-details">
            <summary>Render warnings</summary>
            <pre class="ltracker-text">${escapeHtml(renderWarningsText)}</pre>
          </details>
          <details class="ltracker-details">
            <summary>Render errors</summary>
            <pre class="ltracker-text ltracker-error">${escapeHtml(renderErrorsText)}</pre>
          </details>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-display">
          <span class="ltracker-label">Display</span>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="enabled"${checked(state.settings.messageDisplay.enabled)}>
              Enable message display
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="useDomInjection"${checked(state.settings.messageDisplay.useDomInjection)}>
              DOM injection primary
            </label>
            <label class="ltracker-field">
              Attachment mode
              <select data-message-display-setting="attachmentMode">
                <option value="sidecar_snapshot"${selected(state.settings.messageDisplay.attachmentMode === "sidecar_snapshot")}>Sidecar snapshot</option>
                <option value="embedded_tracker_tag"${selected(state.settings.messageDisplay.attachmentMode === "embedded_tracker_tag")}>Embedded tracker tag</option>
                <option value="both"${selected(state.settings.messageDisplay.attachmentMode === "both")}>Both</option>
              </select>
            </label>
            <label class="ltracker-field">
              Display surface
              <select data-message-display-setting="displaySurface">
                <option value="inline_contained"${selected(state.settings.messageDisplay.displaySurface === "inline_contained")}>Inline contained</option>
                <option value="inline_wide"${selected(state.settings.messageDisplay.displaySurface === "inline_wide")}>Inline wide</option>
                <option value="anchored_popover"${selected(state.settings.messageDisplay.displaySurface === "anchored_popover")}>Anchored popover</option>
                <option value="fullscreen_reader"${selected(state.settings.messageDisplay.displaySurface === "fullscreen_reader")}>Fullscreen reader</option>
                <option value="drawer_only"${selected(state.settings.messageDisplay.displaySurface === "drawer_only")}>Drawer history only</option>
              </select>
            </label>
            <p class="ltracker-note ltracker-field-wide">${escapeHtml(displaySurfaceNote)}</p>
            <label class="ltracker-field">
              Placement
              <select data-message-display-setting="placement">
                <option value="top"${selected(state.settings.messageDisplay.placement === "top")}>Top</option>
                <option value="bottom"${selected(state.settings.messageDisplay.placement === "bottom")}>Bottom</option>
              </select>
            </label>
            <label class="ltracker-field">
              Source
              <select data-message-display-setting="source">
                <option value="message_attached_snapshot"${selected(state.settings.messageDisplay.source === "message_attached_snapshot")}>Message-attached snapshot</option>
                <option value="latest_chat_snapshot"${selected(state.settings.messageDisplay.source === "latest_chat_snapshot")}>Latest chat snapshot</option>
              </select>
            </label>
            <label class="ltracker-field">
              Render mode
              <select data-message-display-setting="renderMode">
                <option value="html_template"${selected(state.settings.messageDisplay.renderMode === "html_template")}>HTML template</option>
                <option value="compact_text"${selected(state.settings.messageDisplay.renderMode === "compact_text")}>Compact text</option>
                <option value="pretty_json"${selected(state.settings.messageDisplay.renderMode === "pretty_json")}>Pretty JSON</option>
              </select>
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="deduplicateRenderWarnings"${checked(state.settings.messageDisplay.deduplicateRenderWarnings)}>
              Deduplicate render warnings
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showRenderWarningsInDiagnosticsOnly"${checked(state.settings.messageDisplay.showRenderWarningsInDiagnosticsOnly)}>
              Keep warning details in diagnostics
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showGenerateButtonForMissingTracker"${checked(state.settings.messageDisplay.showGenerateButtonForMissingTracker)}>
              Missing tracker generate icon
            </label>
            <label class="ltracker-field">
              Control density
              <select data-message-display-setting="controlDensity">
                <option value="compact"${selected(state.settings.messageDisplay.controlDensity === "compact")}>Compact</option>
                <option value="comfortable"${selected(state.settings.messageDisplay.controlDensity === "comfortable")}>Comfortable</option>
              </select>
            </label>
            <label class="ltracker-field">
              Control placement
              <select data-message-display-setting="controlPlacement">
                <option value="message_header"${selected(state.settings.messageDisplay.controlPlacement === "message_header")}>Message header</option>
                <option value="inside_tracker_header"${selected(state.settings.messageDisplay.controlPlacement === "inside_tracker_header")}>Inside tracker header</option>
              </select>
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showExpandedHeaderActions"${checked(state.settings.messageDisplay.showExpandedHeaderActions)}>
              Expanded header actions
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showBottomActionsInInlineTracker"${checked(state.settings.messageDisplay.showBottomActionsInInlineTracker)}>
              Bottom inline actions
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="collapsedByDefault"${checked(state.settings.messageDisplay.collapsedByDefault)}>
              Collapsed by default
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="compactCollapsedHeader"${checked(state.settings.messageDisplay.compactCollapsedHeader)}>
              Compact collapsed header
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showTimestamp"${checked(state.settings.messageDisplay.showTimestamp)}>
              Show timestamp
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showPresetName"${checked(state.settings.messageDisplay.showPresetName)}>
              Show preset name
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showDebugCopyButtonsInHistory"${checked(state.settings.messageDisplay.showDebugCopyButtonsInHistory)}>
              History debug copy buttons
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showWidgetRegenerateButton"${checked(state.settings.messageDisplay.showWidgetRegenerateButton)}>
              Widget regenerate button
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showEditButton"${checked(state.settings.messageDisplay.showEditButton)}>
              Edit button
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showDeleteButton"${checked(state.settings.messageDisplay.showDeleteButton)}>
              Delete button
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showNoTrackerForSwipe"${checked(state.settings.messageDisplay.showNoTrackerForSwipe)}>
              No-tracker swipe state
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showGenerationDuration"${checked(state.settings.messageDisplay.showGenerationDuration)}>
              Generation duration
            </label>
            <label class="ltracker-field">
              Expanded width mode${escapeHtml(inlineOnlySuffix)}
              <select data-expanded-width-setting="expandedWidthMode">
                <option value="contained"${selected(state.settings.expandedWidth.expandedWidthMode === "contained")}>Contained</option>
                <option value="wide"${selected(state.settings.expandedWidth.expandedWidthMode === "wide")}>Wide</option>
                <option value="full_mobile"${selected(state.settings.expandedWidth.expandedWidthMode === "full_mobile")}>Full mobile</option>
              </select>
            </label>
            <label class="ltracker-field">
              Max expanded width${escapeHtml(inlineOnlySuffix)}
              <input type="number" min="320" max="1800" step="20" data-expanded-width-setting="maxExpandedWidthPx" value="${escapeHtml(String(state.settings.expandedWidth.maxExpandedWidthPx))}">
            </label>
            <label class="ltracker-field">
              Mobile margin${escapeHtml(inlineOnlySuffix)}
              <input type="number" min="0" max="32" step="1" data-expanded-width-setting="mobileHorizontalMarginPx" value="${escapeHtml(String(state.settings.expandedWidth.mobileHorizontalMarginPx))}">
            </label>
            <label class="ltracker-field">
              Expanded max height${escapeHtml(inlineOnlySuffix)}
              <input type="number" min="30" max="95" step="1" data-expanded-width-setting="expandedContentMaxHeightVh" value="${escapeHtml(String(state.settings.expandedWidth.expandedContentMaxHeightVh))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-expanded-width-setting="preferFullscreenOnMobile"${checked(state.settings.expandedWidth.preferFullscreenOnMobile)}>
              Prefer fullscreen on mobile
            </label>
            <label class="ltracker-field">
              Fullscreen breakpoint px
              <input type="number" min="320" max="1800" step="50" data-expanded-width-setting="fullscreenBreakpointPx" value="${escapeHtml(String(state.settings.expandedWidth.fullscreenBreakpointPx))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-expanded-width-setting="popoverBackdrop"${checked(state.settings.expandedWidth.popoverBackdrop)}>
              Popover backdrop overlay
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-expanded-width-setting="closeOnBackdropClick"${checked(state.settings.expandedWidth.closeOnBackdropClick)}>
              Close popover on backdrop click
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-expanded-width-setting="closeOnEscape"${checked(state.settings.expandedWidth.closeOnEscape)}>
              Close popover/reader on Escape
            </label>
            <label class="ltracker-field">
              Legacy minimized height
              <input type="number" min="0" max="400" step="10" data-message-display-setting="minimizedMaxHeightPx" value="${escapeHtml(String(state.settings.messageDisplay.minimizedMaxHeightPx))}">
            </label>
            <label class="ltracker-field">
              Message render chars
              <input type="number" min="1000" max="2000000" step="1000" data-message-display-setting="maxRenderedChars" value="${escapeHtml(String(state.settings.messageDisplay.maxRenderedChars))}">
            </label>
          </div>
          <div class="ltracker-presets-subsection" style="margin-top: 15px; margin-bottom: 10px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold; display: block; margin-bottom: 8px;">Display Surface Preview / Testing</span>
            <div class="ltracker-actions">
              <button class="ltracker-button" type="button" data-action="preview-display-surface" data-surface="contained">Preview Contained</button>
              <button class="ltracker-button" type="button" data-action="preview-display-surface" data-surface="wide">Preview Wide</button>
              <button class="ltracker-button" type="button" data-action="preview-display-surface" data-surface="popover">Preview Popover</button>
              <button class="ltracker-button" type="button" data-action="preview-display-surface" data-surface="fullscreen">Preview Fullscreen</button>
            </div>
          </div>
          ${placementWarning}
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-history">
          <span class="ltracker-label">Message Tracker History</span>
          <div class="ltracker-settings" style="margin-bottom: 10px;">
            <label class="ltracker-field ltracker-field-wide">
              Search/filter
              <input type="search" data-history-filter="text" value="${escapeHtml(historyFilterText)}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-history-filter="showDuplicates"${checked(historyShowDuplicates)}>
              Show duplicates
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-history-filter="currentMessageOnly"${checked(historyCurrentMessageOnly)}>
              Current message only
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-history-filter="selectedSwipeOnly"${checked(historySelectedSwipeOnly)}>
              Selected swipe only
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-history-filter="currentPresetOnly"${checked(historyCurrentPresetOnly)}>
              Current preset only
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-history-filter="errorsOnly"${checked(historyErrorsOnly)}>
              Errors only
            </label>
          </div>
          <div class="ltracker-actions" style="margin-bottom: 10px;">
            <button class="ltracker-button" type="button" data-action="refresh">Refresh History</button>
            <button class="ltracker-button" type="button" data-action="cleanup-duplicates" ${disabled(diagnostics.lastHistoryDuplicateCount <= 0)}>Clear Duplicate Index Entries</button>
            <button class="ltracker-button" type="button" data-action="run-storage-maintenance-scan">Scan History Index</button>
            <button class="ltracker-button" type="button" data-action="cleanup-missing-index">Cleanup Missing Index Entries</button>
            <button class="ltracker-button" type="button" data-action="copy-storage-report">Copy Storage Report</button>
          </div>
          <div class="ltracker-chip-row" style="margin-bottom: 10px;">
            <span class="ltracker-chip">Groups ${escapeHtml(String(diagnostics.lastHistoryGroupedCount))}</span>
            <span class="ltracker-chip">Duplicates ${escapeHtml(String(diagnostics.lastHistoryDuplicateCount))}</span>
          </div>
          ${messageHistoryHtml}
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-presets">
          <span class="ltracker-label">Presets</span>
          
          <div class="ltracker-presets-subsection" style="margin-bottom: 15px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold; display: block; margin-bottom: 8px;">Current Preset</span>
            <div class="ltracker-settings">
              <label class="ltracker-field">
                Selected preset
                <select data-preset-select>
                  ${presetOptions}
                </select>
              </label>
              <label class="ltracker-field">
                Preset name
                <input type="text" data-preset-field="name" value="${escapeHtml(activePreset.name)}"${disabled(activePresetIsBuiltIn)}>
              </label>
              <label class="ltracker-field">
                Preset version
                <input type="text" data-preset-field="version" value="${escapeHtml(activePreset.version)}"${disabled(activePresetIsBuiltIn)}>
              </label>
              <label class="ltracker-field">
                Origin
                <input type="text" value="${escapeHtml(activePreset.origin)}" disabled>
              </label>
              <label class="ltracker-field ltracker-field-wide">
                Preset description
                <textarea data-preset-field="description"${disabled(activePresetIsBuiltIn)}>${escapeHtml(activePreset.description)}</textarea>
              </label>
            </div>
          </div>

          ${importReviewHtml}

          <div class="ltracker-presets-subsection" style="margin-bottom: 15px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold; display: block; margin-bottom: 8px;">Preset Configuration</span>
            <div class="ltracker-settings">
              <label class="ltracker-field ltracker-field-wide">
                Schema Box 1 - JSON Schema
                <textarea data-preset-field="jsonSchema"${disabled(activePresetIsBuiltIn)}>${escapeHtml(presetSchemaText)}</textarea>
              </label>
              <label class="ltracker-field ltracker-field-wide">
                Schema Box 2 - HTML Template (Sanitized preview/message display)
                <textarea data-preset-field="htmlTemplate"${disabled(activePresetIsBuiltIn)}>${escapeHtml(activePreset.htmlTemplate ?? "")}</textarea>
              </label>
              <label class="ltracker-field ltracker-field-wide">
                Prompt Box - AI Instructions
                <textarea data-preset-field="promptInstructions"${disabled(activePresetIsBuiltIn)}>${escapeHtml(activePreset.promptInstructions)}</textarea>
              </label>
              <label class="ltracker-field ltracker-field-wide">
                Notes
                <textarea data-preset-field="notes"${disabled(activePresetIsBuiltIn)}>${escapeHtml(activePreset.notes ?? "")}</textarea>
              </label>
            </div>
          </div>

          <div class="ltracker-presets-subsection" style="margin-bottom: 15px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold; display: block; margin-bottom: 8px;">Validate & Preview</span>
            <div class="ltracker-actions">
              <button class="ltracker-button" type="button" data-action="validate-preset-report">
                Validate Preset (Full Report)
              </button>
              <button class="ltracker-button" type="button" data-action="render-template" ${disabled(!state.chatId)}>
                Render With Latest Snapshot
              </button>
              <button class="ltracker-button" type="button" data-action="generate-sample-snapshot">
                Render With Sample Snapshot
              </button>
            </div>
            ${renderLabHtml}
            ${validationReportHtml}
            ${sampleSnapshotHtml}
          </div>

          <div class="ltracker-presets-subsection" style="margin-bottom: 15px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold; display: block; margin-bottom: 8px;">Import & Export Preset Packs</span>
            <div style="font-size: 11px; color: #aaa; margin-bottom: 8px;">
              Manage presets as single <code>.ltracker.json</code> files containing schemas, templates, instructions, notes, and settings recommendations.
            </div>
            <div class="ltracker-actions" style="margin-bottom: 10px;">
              <button class="ltracker-button" type="button" data-action="import-file-pack">
                Import Preset Pack File (.ltracker.json)
              </button>
              <button class="ltracker-button" type="button" data-action="export-preset-pack">
                Export Selected Preset Pack
              </button>
              <button class="ltracker-button" type="button" data-action="export-preset-pack-settings">
                Export Preset Pack + Current Settings
              </button>
            </div>
            <div class="ltracker-actions" style="margin-bottom: 10px;">
              <button class="ltracker-button" type="button" data-action="copy-preset-pack-json">
                Copy Preset Pack JSON
              </button>
              <button class="ltracker-button" type="button" data-action="copy-legacy-preset-json">
                Copy Current Preset Legacy JSON
              </button>
            </div>
            <label class="ltracker-field ltracker-field-wide">
              Or paste Preset / Pack JSON below and click preview:
              <textarea data-preset-import placeholder="Paste JSON here..."></textarea>
            </label>
            <div class="ltracker-actions" style="margin-top: 5px;">
              <button class="ltracker-button" type="button" data-action="import-preset-pack-preview">
                Preview Pasted JSON
              </button>
            </div>
          </div>

          <div class="ltracker-presets-subsection">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold; display: block; margin-bottom: 8px;">Preset Storage Management</span>
            <div class="ltracker-actions">
              <button class="ltracker-button" type="button" data-action="save-preset-new">Save As New Preset</button>
              <button class="ltracker-button" type="button" data-action="duplicate-preset">Duplicate Preset</button>
              <button class="ltracker-button" type="button" data-action="update-preset" ${disabled(activePresetIsBuiltIn)}>Update Current Preset</button>
              <button class="ltracker-button" type="button" data-action="delete-preset" ${disabled(activePresetIsBuiltIn)}>Delete Preset</button>
              <button class="ltracker-button" type="button" data-action="reset-preset">Reset To Default Preset</button>
              <button class="ltracker-button" type="button" data-action="apply-preset-connection" ${disabled(!recommendedConnection)}>
                Apply Preset Recommended Tracker Settings
              </button>
            </div>
            ${presetHtmlWarning ? `<p class="ltracker-note">${escapeHtml(presetHtmlWarning)}</p>` : ""}
            ${recommendedConnectionText ? `<p class="ltracker-note">${escapeHtml(recommendedConnectionText)}</p>` : ""}
          </div>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-diagnostics">
          <span class="ltracker-label">Diagnostics</span>
          <div class="ltracker-actions" style="margin-bottom: 12px;">
            <button class="ltracker-button" type="button" data-action="copy-all-diagnostics">Copy All Diagnostics</button>
            <button class="ltracker-button" type="button" data-action="copy-last-error">Copy Last Error</button>
          </div>
          
          <details class="ltracker-details">
            <summary>Status & General</summary>
            <div class="ltracker-grid">
              ${renderRow("Extension version", state.version)}
              ${renderRow("Active chat id", state.chatId)}
              ${renderRow("Current status", state.status)}
              ${renderRow("Auto mode", autoStatus)}
              ${renderRow("Permission status", permissionText)}
              ${renderRow("Connection mode", diagnostics.connectionMode)}
              ${renderRow("Native toolbar supported", diagnostics.nativeToolbarSupported ? "yes" : "no")}
              ${renderRow("Native toolbar fallback", diagnostics.nativeToolbarFallbackReason)}
              ${renderRow("Message-local UI supported", diagnostics.messageLocalUiSupported ? "yes" : "no")}
              ${renderRow("Message-local fallback reason", diagnostics.messageLocalUiFallbackReason)}
              ${renderRow("Build target", diagnostics.buildInfo.buildTarget)}
              ${renderRow("Spindle types", diagnostics.buildInfo.spindleTypesVersion)}
              ${renderRow("Storage schema", diagnostics.buildInfo.storageSchemaVersion)}
              ${renderRow("Settings schema", diagnostics.buildInfo.settingsSchemaVersion)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Generation Jobs</summary>
            <div class="ltracker-grid">
              ${renderRow("Active tracker jobs", diagnostics.activeTrackerJobs.map((job) => `${job.messageId}/${job.swipeKey}`).join(", "))}
              ${renderRow("Active widget regenerations", diagnostics.activeWidgetRegenerationCount)}
              ${renderRow("Last job id", diagnostics.lastJobId)}
              ${renderRow("Last request id", diagnostics.lastRequestId)}
              ${renderRow("Last duration ms", diagnostics.lastGenerationDurationMs)}
              ${renderRow("Last generation source", diagnostics.lastGenerationSource)}
              ${renderRow("Last generation started", diagnostics.lastGenerationStartedAt)}
              ${renderRow("Last generation completed", diagnostics.lastGenerationCompletedAt)}
              ${renderRow("Last cancellation", diagnostics.lastCancellation ? `${diagnostics.lastCancellation.jobId}: ${diagnostics.lastCancellation.reason}` : null)}
              ${renderRow("Last widget regenerate message", diagnostics.lastWidgetRegenerateMessageId)}
              ${renderRow("Last widget regenerate started", diagnostics.lastWidgetRegenerateStartedAt)}
              ${renderRow("Last widget regenerate completed", diagnostics.lastWidgetRegenerateCompletedAt)}
              ${renderRow("Last widget regenerate duration", diagnostics.lastWidgetRegenerateDurationMs)}
              ${renderRow("Last widget regenerate cancelled", diagnostics.lastWidgetRegenerateCancelledAt)}
              ${renderRow("Last widget regenerate error", diagnostics.lastWidgetRegenerateError)}
              ${renderRow("Last job timeout at", diagnostics.lastJobTimeoutAt)}
              ${renderRow("Last job timeout job id", diagnostics.lastJobTimeoutJobId)}
              ${renderRow("Last job timeout message id", diagnostics.lastJobTimeoutMessageId)}
              ${renderRow("Last job timeout swipe key", diagnostics.lastJobTimeoutSwipeKey)}
              ${renderRow("Stale jobs evicted count", diagnostics.staleJobsEvictedCount)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Auto Timing</summary>
            <div class="ltracker-grid">
              ${renderRow("Last auto event", diagnostics.lastAutoEventAt)}
              ${renderRow("Last auto event type", diagnostics.lastAutoEventType)}
              ${renderRow("Last auto scheduled", diagnostics.lastAutoScheduledAt)}
              ${renderRow("Last auto triggered", diagnostics.lastAutoTriggeredAt)}
              ${renderRow("Last auto skipped", diagnostics.lastAutoSkippedReason)}
              ${renderRow("Last auto source message", diagnostics.lastAutoSourceMessageId)}
              ${renderRow("Last auto source index", diagnostics.lastAutoSourceMessageIndex)}
              ${renderRow("Last auto generation id", diagnostics.lastAutoGenerationId)}
              ${renderRow("Auto finalization state", diagnostics.lastAutoFinalizationState)}
              ${renderRow("Auto waiting message", diagnostics.lastAutoWaitingMessageId)}
              ${renderRow("Auto waiting swipe", diagnostics.lastAutoWaitingSwipeKey)}
              ${renderRow("Auto finalized at", diagnostics.lastAutoFinalizedAt)}
              ${renderRow("Auto stable check at", diagnostics.lastAutoStableCheckAt)}
              ${renderRow("Auto stable passed", diagnostics.lastAutoStableCheckPassed === null ? null : diagnostics.lastAutoStableCheckPassed ? "yes" : "no")}
              ${renderRow("Auto stable hash", diagnostics.lastAutoContentStableHash)}
              ${renderRow("Auto finalization skipped", diagnostics.lastAutoFinalizationSkippedReason)}
              ${renderRow("Pending auto finalizations", diagnostics.pendingAutoFinalizationCount)}
              ${renderRow("Swipe change cancelled pending", diagnostics.lastSwipeChangeCancelledPendingJob ? "yes" : "no")}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Memory</summary>
            <div class="ltracker-grid">
              ${renderRow("Last memory index count", diagnostics.lastMemoryIndexCount)}
              ${renderRow("Last memory candidate count", diagnostics.lastMemoryCandidateCount)}
              ${renderRow("Last memory loaded snapshot count", diagnostics.lastMemoryLoadedSnapshotCount)}
              ${renderRow("Last memory load duration ms", diagnostics.lastMemoryLoadDurationMs)}
              ${renderRow("Last memory load skipped count", diagnostics.lastMemoryLoadSkippedCount)}
              ${renderRow("Last memory entry count", diagnostics.lastMemoryEntryCount)}
              ${renderRow("Last memory chars", diagnostics.lastMemoryChars)}
              ${renderRow("Last memory truncated", diagnostics.lastMemoryTruncated ? "yes" : "no")}
              ${renderRow("Last memory sources", diagnostics.lastMemorySourceSummary)}
              ${renderRow("Last memory skipped", diagnostics.lastMemorySkippedReason)}
              ${renderRow("Last prompt included memory", diagnostics.lastPromptIncludedMemory ? "yes" : "no")}
              ${renderRow("Estimated memory tokens", diagnostics.estimatedMemoryTokensLastRun)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Prompt Injection</summary>
            <div class="ltracker-grid">
              ${renderRow("Injection enabled", diagnostics.injectionEnabled ? "yes" : "no")}
              ${renderRow("Context handler registered", diagnostics.contextHandlerRegistered ? "yes" : "no")}
              ${renderRow("Context handler disabled reason", diagnostics.contextHandlerDisabledReason)}
              ${renderRow("Last context handler error", diagnostics.lastContextHandlerError)}
              ${renderRow("Last injection at", diagnostics.lastInjectionAt)}
              ${renderRow("Last injection mode", diagnostics.lastInjectionMode)}
              ${renderRow("Last injection format", diagnostics.lastInjectionFormat)}
              ${renderRow("Last injected chars", diagnostics.lastInjectedChars)}
              ${renderRow("Last injection skipped", diagnostics.lastInjectionSkippedReason)}
              ${renderRow("Last injection snapshot", diagnostics.lastInjectionSnapshotCreatedAt)}
              ${renderRow("Last injection source message", diagnostics.lastInjectionSourceMessageId)}
              ${renderRow("Interceptor registered", diagnostics.interceptorRegistered ? "yes" : "no")}
              ${renderRow("Last interceptor at", diagnostics.lastInterceptorAt)}
              ${renderRow("Last interceptor injected count", diagnostics.lastInterceptorInjectedCount)}
              ${renderRow("Last interceptor injected chars", diagnostics.lastInterceptorInjectedChars)}
              ${renderRow("Last interceptor stripped count", diagnostics.lastInterceptorStrippedCount)}
              ${renderRow("Last interceptor skipped", diagnostics.lastInterceptorSkippedReason)}
              ${renderRow("Last interceptor error", diagnostics.lastInterceptorError)}
              ${renderRow("Prompt trackers before", diagnostics.lastInterceptorPromptTrackerCountBefore)}
              ${renderRow("Prompt trackers after", diagnostics.lastInterceptorPromptTrackerCountAfter)}
              ${renderRow("Estimated prompt tokens", diagnostics.estimatedPromptTokensLastRun)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Display / DOM</summary>
            <div class="ltracker-grid">
              ${renderRow("Message display enabled", diagnostics.messageDisplayEnabled ? "yes" : "no")}
              ${renderRow("Message display mode", diagnostics.messageDisplayMode)}
              ${renderRow("Message display renderer", diagnostics.messageDisplayRenderer)}
              ${renderRow("Message display placement", diagnostics.messageDisplayPlacement)}
              ${renderRow("Message display hydrated count", diagnostics.messageDisplayHydratedCount)}
              ${renderRow("Last message display hydration", diagnostics.lastMessageDisplayHydratedAt)}
              ${renderRow("Last message display error", diagnostics.lastMessageDisplayError)}
              ${renderRow("Selected display surface", diagnostics.selectedDisplaySurface)}
              ${renderRow("Resolved display surface", diagnostics.resolvedDisplaySurface)}
              ${renderRow("Display surface kind", diagnostics.displaySurfaceKind)}
              ${renderRow("Display surface mount", diagnostics.displaySurfaceMountStrategy)}
              ${renderRow("Display surface constrained", diagnostics.displaySurfaceParentWidthConstrained === null ? null : diagnostics.displaySurfaceParentWidthConstrained ? "yes" : "no")}
              ${renderRow("Display surface fallback", diagnostics.displaySurfaceFallbackReason)}
              ${renderRow("Last surface rehydration", diagnostics.lastDisplaySurfaceRehydratedAt)}
              ${renderRow("Last display preview action", diagnostics.lastDisplayPreviewAction)}
              ${renderRow("Last display preview result", diagnostics.lastDisplayPreviewResult)}
              ${renderRow("Last display preview reason", diagnostics.lastDisplayPreviewReason)}
              ${renderRow("Last message control render", diagnostics.lastMessageControlRenderAt)}
              ${renderRow("Last message control message", diagnostics.lastMessageControlMessageId)}
              ${renderRow("Last message control swipe", diagnostics.lastMessageControlSwipeKey)}
              ${renderRow("Last message control state", diagnostics.lastMessageControlState)}
              ${renderRow("Last generate button message", diagnostics.lastGenerateButtonMessageId)}
              ${renderRow("Last generate button click", diagnostics.lastGenerateButtonClickedAt)}
              ${renderRow("Last inline action", diagnostics.lastInlineActionClicked)}
              ${renderRow("Last inline action at", diagnostics.lastInlineActionAt)}
              ${renderRow("Last inline action error", diagnostics.lastInlineActionError)}
              ${renderRow("Message widget placement resolved", diagnostics.messageWidgetPlacementResolved)}
              ${renderRow("Message widget placement reason", diagnostics.messageWidgetPlacementReason)}
              ${renderRow("Expanded width mode", diagnostics.expandedWidthModeResolved)}
              ${renderRow("Expanded width px", diagnostics.lastExpandedTrackerWidthPx)}
              ${renderRow("Iframe fallback visible in main UI", diagnostics.iframeFallbackVisibleInMainUi ? "yes" : "no")}
              ${renderRow("Latest attached message", diagnostics.latestAttachedMessageId)}
              ${renderRow("Latest attached index", diagnostics.latestAttachedMessageIndex)}
              ${renderRow("Latest attached at", diagnostics.latestAttachedSnapshotAt)}
              ${renderRow("Latest attached storage key", diagnostics.latestAttachedSnapshotStorageKey)}
              ${renderRow("Last DOM injection", diagnostics.lastDomInjectionAt)}
              ${renderRow("Last DOM injection error", diagnostics.lastDomInjectionError)}
              ${renderRow("Last uninject", diagnostics.lastUninjectAt)}
              ${renderRow("Last embedded tag write", diagnostics.lastEmbeddedTagWriteAt)}
              ${renderRow("Last embedded tag message", diagnostics.lastEmbeddedTagWriteMessageId)}
              ${renderRow("Last embedded tag swipe", diagnostics.lastEmbeddedTagWriteSwipeKey)}
              ${renderRow("Last embedded tag error", diagnostics.lastEmbeddedTagError)}
              ${renderRow("Last tag intercept", diagnostics.lastTagInterceptAt)}
              ${renderRow("Last tag intercept message", diagnostics.lastTagInterceptMessageId)}
              ${renderRow("Last tag intercept swipe", diagnostics.lastTagInterceptSwipeKey)}
              ${renderRow("Last tag intercept error", diagnostics.lastTagInterceptError)}
              ${renderRow("Last display surface", diagnostics.lastDisplaySurface)}
              ${renderRow("Last popover opened at", diagnostics.lastPopoverOpenedAt)}
              ${renderRow("Last popover message", diagnostics.lastPopoverMessageId)}
              ${renderRow("Last popover swipe", diagnostics.lastPopoverSwipeKey)}
              ${renderRow("Last popover width px", diagnostics.lastPopoverWidthPx)}
              ${renderRow("Last popover height px", diagnostics.lastPopoverHeightPx)}
              ${renderRow("Last reader opened at", diagnostics.lastReaderOpenedAt)}
              ${renderRow("Last reader message", diagnostics.lastReaderMessageId)}
              ${renderRow("Last reader swipe", diagnostics.lastReaderSwipeKey)}
              ${renderRow("Last resolved viewport width", diagnostics.lastResolvedViewportWidth)}
              ${renderRow("Last resolved viewport height", diagnostics.lastResolvedViewportHeight)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Storage & History</summary>
            <div class="ltracker-grid">
              ${renderRow("Message snapshot index count", diagnostics.messageSnapshotIndexCount)}
              ${renderRow("Swipe tracker index count", diagnostics.swipeTrackerIndexCount)}
              ${renderRow("History grouped count", diagnostics.lastHistoryGroupedCount)}
              ${renderRow("History duplicate count", diagnostics.lastHistoryDuplicateCount)}
              ${renderRow("History orphan count", diagnostics.lastHistoryOrphanCount)}
              ${renderRow("History cleanup at", diagnostics.lastHistoryCleanupAt)}
              ${renderRow("Storage key", diagnostics.storageKey)}
              ${renderRow("Messages read", diagnostics.lastMessagesRead)}
              ${renderRow("Source message range", diagnostics.lastSourceMessageRange)}
              ${renderRow("Source message ids", diagnostics.lastSourceMessageIds.join(", "))}
              ${renderRow("Last deleted tracker message", diagnostics.lastDeletedTrackerMessageId)}
              ${renderRow("Last deleted tracker swipe", diagnostics.lastDeletedTrackerSwipeKey)}
              ${renderRow("Last edited tracker message", diagnostics.lastEditedTrackerMessageId)}
              ${renderRow("Last edited tracker swipe", diagnostics.lastEditedTrackerSwipeKey)}
              ${renderRow("Last swipe detected message", diagnostics.lastSwipeDetectedMessageId)}
              ${renderRow("Last swipe key", diagnostics.lastSwipeKey)}
              ${renderRow("Last swipe key source", diagnostics.lastSwipeKeySource)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Connections</summary>
            <div class="ltracker-grid">
              ${renderRow("Selected connection id", diagnostics.selectedConnectionId)}
              ${renderRow("Selected connection name", diagnostics.selectedConnectionName)}
              ${renderRow("Selected connection available", diagnostics.selectedConnectionAvailable ? "yes" : "no")}
              ${renderRow("Connection list count", diagnostics.connectionListCount)}
              ${renderRow("Last connection refresh", diagnostics.lastConnectionRefreshAt)}
              ${renderRow("Last connection refresh error", diagnostics.lastConnectionRefreshError)}
              ${renderRow("Last generation connection mode", diagnostics.lastGenerationConnectionModeUsed)}
              ${renderRow("Last generation connection id", diagnostics.lastGenerationConnectionIdUsed)}
              ${renderRow("Last generation connection name", diagnostics.lastGenerationConnectionNameUsed)}
              ${renderRow("Last generation connection fallback", diagnostics.lastGenerationConnectionFallbackReason)}
              ${renderRow("Last generation parameters", compactRecord(diagnostics.lastGenerationParametersUsed))}
              ${renderRow("Last reasoning override", compactRecord(diagnostics.lastReasoningOverrideUsed))}
              ${renderRow("Last connection test at", diagnostics.lastConnectionTestAt)}
              ${renderRow("Last connection test status", diagnostics.lastConnectionTestStatus)}
              ${renderRow("Last connection test duration", diagnostics.lastConnectionTestDurationMs)}
              ${renderRow("Last connection test error", diagnostics.lastConnectionTestError)}
              ${renderRow("Last connection test finish", diagnostics.lastConnectionTestFinishReason)}
              ${renderRow("Last connection test usage", compactRecord(diagnostics.lastConnectionTestUsage))}
              ${renderRow("Connection profile selected", diagnostics.connectionProfileSelected ? "yes" : "no")}
              ${renderRow("Effective connection mode", diagnostics.effectiveTrackerConnectionMode)}
              ${renderRow("Effective connection reason", diagnostics.effectiveTrackerConnectionReason)}
              ${renderRow("Last connection fallback reason", diagnostics.lastSelectedConnectionFallbackReason)}
              ${renderRow("Last profile missing at", diagnostics.lastTrackerProfileMissingAt)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Renderer & Presets</summary>
            <div class="ltracker-grid">
              ${renderRow("Selected preset id", diagnostics.selectedPresetId ?? activePreset.id)}
              ${renderRow("Selected preset name", diagnostics.selectedPresetName ?? activePreset.name)}
              ${renderRow("Last preset fallback", diagnostics.lastPresetFallbackReason)}
              ${renderRow("Last preset validation error", diagnostics.lastPresetValidationError)}
              ${renderRow("Last prompt preset id", diagnostics.lastPromptUsedPresetId)}
              ${renderRow("Last prompt preset name", diagnostics.lastPromptUsedPresetName)}
              ${renderRow("Last render at", diagnostics.lastRenderAt)}
              ${renderRow("Last render preset id", diagnostics.lastRenderPresetId)}
              ${renderRow("Last render preset name", diagnostics.lastRenderPresetName)}
              ${renderRow("Last render preset source", diagnostics.lastRenderPresetSource)}
              ${renderRow("Last render locked preset id", diagnostics.lastRenderLockedPresetId)}
              ${renderRow("Last render locked preset name", diagnostics.lastRenderLockedPresetName)}
              ${renderRow("Last render locked preset version", diagnostics.lastRenderLockedPresetVersion)}
              ${renderRow("Last render preset mismatch", diagnostics.lastRenderPresetMismatchDetected === null ? null : diagnostics.lastRenderPresetMismatchDetected ? "yes" : "no")}
              ${renderRow("Last render fallback reason", diagnostics.lastRenderPresetFallbackReason)}
              ${renderRow("Last render snapshot", diagnostics.lastRenderSnapshotCreatedAt)}
              ${renderRow("Last render source", diagnostics.lastRenderSource)}
              ${renderRow("Last render status", diagnostics.lastRenderStatus)}
              ${renderRow("Last sanitized HTML chars", diagnostics.lastSanitizedHtmlChars)}
              ${renderRow("Last fallback text chars", diagnostics.lastFallbackTextChars)}
              ${renderRow("Last render warnings", diagnostics.lastRenderWarnings.join(", "))}
              ${renderRow("Last render errors", diagnostics.lastRenderErrors.join(", "))}
              ${renderRow("Template trust mode", diagnostics.templateTrustMode)}
              ${renderRow("Ultra mode", diagnostics.ultraModeEnabled ? "yes" : "no")}
              ${renderRow("Last preset estimated tokens", diagnostics.lastPresetEstimatedTokens)}
              ${renderRow("Last preset estimated chars", diagnostics.lastPresetEstimatedRenderedChars)}
              ${renderRow("Last preset lint at", diagnostics.lastPresetLintAt)}
              ${renderRow("Last preset lint warnings", diagnostics.lastPresetLintWarningCount)}
              ${renderRow("Last preset lint errors", diagnostics.lastPresetLintErrorCount)}
              ${renderRow("Last preset lint raw paths", diagnostics.lastPresetLintRawObjectPaths.join(", "))}
              ${renderRow("Last preset mobile risks", diagnostics.lastPresetLintMobileRiskCount)}
              ${renderRow("Render Lab viewport", diagnostics.lastPresetRenderLabViewport)}
              ${renderRow("Render Lab surface", diagnostics.lastPresetRenderLabSurface)}
              ${renderRow("Render Lab result", diagnostics.lastPresetRenderLabResult)}
              ${renderRow("Render Lab rendered chars", diagnostics.lastPresetRenderLabRenderedChars)}
              ${renderRow("Render Lab warnings", diagnostics.lastPresetRenderLabWarnings.join(", "))}
            </div>
          </details>
          <details class="ltracker-details">
            <summary>Last raw model output</summary>
            <pre class="ltracker-text">${escapeHtml(rawOutput ?? "None")}</pre>
          </details>
          <details class="ltracker-details">
            <summary>Last prompt preview</summary>
            <pre class="ltracker-text">${escapeHtml(prompt ?? "None")}</pre>
          </details>
          <div class="ltracker-details">
            <span class="ltracker-label">Last parsed tracker JSON</span>
            <pre class="ltracker-json">${escapeHtml(renderJson(parsedTracker, "None"))}</pre>
          </div>
          <div class="ltracker-details">
            <span class="ltracker-label">Last parse/generation/storage error</span>
            <pre class="ltracker-text ltracker-error">${escapeHtml(renderError(error))}</pre>
          </div>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-advanced">
          <span class="ltracker-label">Advanced</span>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="fallbackToIframeWidget"${checked(state.settings.messageDisplay.fallbackToIframeWidget)}>
              Iframe fallback / legacy backup
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-renderer-setting="allowInlineStyles"${checked(state.settings.renderer.allowInlineStyles)} disabled>
              Trusted inline styles active
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showDebugSwipeKey"${checked(state.settings.messageDisplay.showDebugSwipeKey)}>
              Debug swipe key
            </label>
            <label class="ltracker-field">
              Dev Mode Templates
              <input type="text" value="Future" disabled>
            </label>
          </div>
          <div class="ltracker-grid ltracker-details">
            ${renderRow("Context handler", diagnostics.contextHandlerDisabledReason)}
            ${renderRow("Message widget fallback", diagnostics.messageWidgetPlacementReason)}
            ${renderRow("DOM injection error", diagnostics.lastDomInjectionError)}
          </div>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Copy</span>
          <div class="ltracker-copy-actions">
            <button class="ltracker-button" type="button" data-action="copy-snapshot" ${disabled(!state.snapshot)}>
              Copy Latest Tracker JSON
            </button>
            <button class="ltracker-button" type="button" data-action="copy-prompt" ${disabled(!prompt)}>
              Copy Last Prompt
            </button>
            <button class="ltracker-button" type="button" data-action="copy-raw" ${disabled(!rawOutput)}>
              Copy Last Raw Output
            </button>
            <button class="ltracker-button" type="button" data-action="copy-message-snapshot" ${disabled(!state.latestMessageSnapshot)}>
              Copy Message Snapshot
            </button>
          </div>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Latest message-attached snapshot</span>
          <pre class="ltracker-json">${escapeHtml(latestMessageSnapshotText)}</pre>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Latest tracker snapshot</span>
          <pre class="ltracker-json">${escapeHtml(snapshotText)}</pre>
        </section>
      </section>
    `;
    hydrateMessageWidgets();
  }

  const onClick = (event: Event): void => {
    const sectionTarget = event.target instanceof HTMLElement
      ? event.target.closest<HTMLAnchorElement>("[data-drawer-section]")
      : null;
    if (sectionTarget?.dataset.drawerSection) {
      localDiagnostics({ drawerActiveSection: sectionTarget.dataset.drawerSection });
    }
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>("[data-action]")
      : null;
    const action = target?.dataset.action;
    const historyEntry = findHistoryEntry(target?.dataset.messageId, target?.dataset.swipeKey ?? null);
    if (action === "generate") generateTracker();
    if (action === "refresh") requestState();
    if (action === "cleanup-duplicates") {
      send({
        type: "cleanup_duplicate_history",
        chatId: activeChatId(),
        requestId: requestId("history-cleanup"),
      });
    }
    if (action === "refresh-connections") refreshConnections();
    if (action === "test-connection") testTrackerConnection();
    if (action === "cancel-connection-test") cancelConnectionTest();
    if (action === "reset-connection-parameters") resetConnectionParameters();
    if (action === "apply-preset-connection") applyPresetRecommendedConnection();
    if (action === "clear-snapshot") clearSnapshot();
    if (action === "reset-settings") resetSettings();
    if (action === "copy-snapshot") {
      void copyText(state.snapshot ? JSON.stringify(state.snapshot.data, null, 2) : null, "tracker JSON");
    }
    if (action === "copy-prompt") void copyText(state.diagnostics.lastPromptPreview, "prompt");
    if (action === "copy-raw") void copyText(state.diagnostics.lastRawOutput, "raw output");
    if (action === "copy-message-snapshot") {
      void copyText(
        state.latestMessageSnapshot ? JSON.stringify(state.latestMessageSnapshot, null, 2) : null,
        "message snapshot",
      );
    }
    if (action === "copy-memory-preview") void copyText(state.memoryPreview, "tracker memory block");
    if (action === "copy-injection-preview") void copyText(state.injectionPreview, "injection preview");
    if (action === "copy-storage-report") {
      const report = [
        `Storage key: ${state.diagnostics.storageKey}`,
        `Message snapshot index count: ${state.diagnostics.messageSnapshotIndexCount}`,
        `Swipe tracker index count: ${state.diagnostics.swipeTrackerIndexCount}`,
        `History grouped count: ${state.diagnostics.lastHistoryGroupedCount}`,
        `History duplicate count: ${state.diagnostics.lastHistoryDuplicateCount}`,
        `History orphan count: ${state.diagnostics.lastHistoryOrphanCount}`,
        `History cleanup at: ${state.diagnostics.lastHistoryCleanupAt}`,
      ].join("\n");
      void copyText(report, "storage report");
    }
    if (action === "render-template") renderTemplatePreview();
    if (action === "copy-render-html") void copyText(state.renderPreview?.html ?? null, "sanitized HTML");
    if (action === "copy-render-fallback") void copyText(state.renderPreview?.textFallback ?? null, "text fallback");
    if (action === "copy-render-errors") {
      const renderLog = state.renderPreview
        ? [
            ...state.renderPreview.errors.map((item) => `error: ${item}`),
            ...state.renderPreview.warnings.map((item) => `warning: ${item}`),
          ].join("\n")
        : null;
      void copyText(renderLog, "render errors");
    }
    if (action === "copy-history-json") void copyText(historyEntry?.rendered.json ?? null, "message tracker JSON");
    if (action === "copy-history-html") void copyText(historyEntry?.rendered.html ?? null, "message tracker HTML");
    if (action === "copy-history-text") void copyText(historyEntry?.rendered.textFallback ?? null, "message tracker text");
    if (action === "regenerate-history" && historyEntry) {
      toggleMessageRegeneration(historyEntry.indexEntry.messageId, historyEntry.indexEntry.swipeKey, historyEntry.rendered.activeJobId);
    }
    if (action === "edit-history" && historyEntry) {
      openTrackerEditor(historyEntry);
    }
    if (action === "delete-history" && historyEntry) {
      void deleteMessageTracker(historyEntry.indexEntry.messageId, historyEntry.indexEntry.swipeKey);
    }
    if (action === "save-preset-new") savePresetAsNew();
    if (action === "duplicate-preset") duplicatePreset();
    if (action === "update-preset") updatePreset();
    if (action === "delete-preset") deletePreset();
    if (action === "reset-preset") resetPreset();
    if (action === "import-preset") importPreset();
    if (action === "validate-preset") validatePreset();
    if (action === "validate-preset-report") validatePresetReportFrontend();
    if (action === "generate-sample-snapshot") generateSampleSnapshotFrontend();
    if (action === "export-preset") {
      void copyText(JSON.stringify(exportTrackerPreset(state.activePreset), null, 2), "selected preset export");
    }
    if (action === "export-preset-pack") exportPresetPackFrontend(false);
    if (action === "export-preset-pack-settings") exportPresetPackFrontend(true);
    if (action === "copy-preset-pack-json") {
      const exportOpts: Parameters<typeof exportPresetPack>[1] = {
        includeRecommendedSettings: true,
        settings: state.settings,
      };
      if (state.snapshot?.data) {
        exportOpts.exampleSnapshot = state.snapshot.data;
      }
      const pack = exportPresetPack(state.activePreset, exportOpts);
      void copyText(JSON.stringify(pack, null, 2), "preset pack JSON");
    }
    if (action === "copy-legacy-preset-json") {
      void copyText(JSON.stringify(exportTrackerPreset(state.activePreset), null, 2), "legacy preset JSON");
    }
    if (action === "import-file-pack") triggerFileImport();
    if (action === "import-preset-pack-preview") {
      const input = tab.root.querySelector<HTMLTextAreaElement>("[data-preset-import]");
      const text = input?.value.trim() ?? "";
      if (!text) {
        setLocalError("Paste preset pack JSON before previewing.");
      } else {
        stageImportText(text);
      }
    }
    if (action === "import-preset-pack") executeImportPresetPack();
    if (action === "cancel-import") {
      stagedImportPack = null;
      stagedImportRawText = "";
      render();
    }
    if (action === "copy-sample-snapshot") {
      void copyText(stagedSampleSnapshot ? JSON.stringify(stagedSampleSnapshot, null, 2) : null, "sample snapshot JSON");
    }
    if (action === "copy-render-lab-html") {
      const lab = buildRenderLabPreview();
      recordRenderLabDiagnostics(lab);
      void copyText(lab.html, "Render Lab sanitized HTML");
    }
    if (action === "copy-render-lab-sample") {
      const lab = buildRenderLabPreview();
      recordRenderLabDiagnostics(lab);
      void copyText(JSON.stringify(lab.sampleData, null, 2), "Render Lab sample JSON");
    }
    if (action === "copy-render-lab-report") {
      const lab = buildRenderLabPreview();
      recordRenderLabDiagnostics(lab);
      void copyText(renderLabReportText(), "Render Lab lint report");
    }
    if (action === "undo-delete" && recentlyDeletedBanner) {
      send({
        type: "restore_deleted_tracker",
        chatId: activeChatId(),
        messageId: recentlyDeletedBanner.messageId,
        swipeKey: recentlyDeletedBanner.swipeKey,
        requestId: requestId("tracker-restore"),
      });
      clearTimeout(recentlyDeletedBanner.timer);
      recentlyDeletedBanner = null;
      render();
    }
    if (action === "load-more-history") {
      currentHistoryLimit += 25;
      send({
        type: "refresh_state",
        chatId: activeChatId(),
      });
    }
    if (action === "run-storage-maintenance-scan") {
      send({
        type: "run_storage_maintenance_scan",
        chatId: activeChatId(),
        requestId: requestId("storage-scan"),
      });
    }
    if (action === "cleanup-missing-index") {
      send({
        type: "cleanup_missing_index_entries",
        chatId: activeChatId(),
        requestId: requestId("storage-clean"),
      });
    }
    if (action === "copy-all-diagnostics") {
      const flatDiags = Object.entries(state.diagnostics)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join("\n");
      void copyText(flatDiags, "all diagnostics");
    }
    if (action === "copy-last-error") {
      const err = state.diagnostics.lastError;
      const errText = err ? `Stage: ${err.stage}\nMessage: ${err.message}${err.detail ? `\nDetail: ${err.detail}` : ""}` : "No error recorded.";
      void copyText(errText, "last error");
    }
    if (action === "preview-display-surface") {
      const surface = (target as HTMLElement).dataset.surface;
      const entry = latestPreviewEntry();
      if (entry) {
        if (surface === "contained") {
          openDisplayPreview(entry, "inline_contained");
        } else if (surface === "wide") {
          openDisplayPreview(entry, "inline_wide");
        } else if (surface === "popover") {
          openPopover(entry, target as HTMLElement, true);
        } else if (surface === "fullscreen") {
          openFullscreenReader(entry, true);
        }
      } else {
        localDiagnostics({
          lastDisplayPreviewAction: surface ?? "unknown",
          lastDisplayPreviewResult: "unavailable",
          lastDisplayPreviewReason: "No tracker snapshot available to preview. Generate a tracker first.",
        });
        setLocalError("No tracker snapshot available to preview. Generate a tracker first.");
      }
    }
  };

  tab.root.addEventListener("click", onClick);
  cleanups.push(() => tab.root.removeEventListener("click", onClick));

  const updateHistoryFilter = (input: HTMLInputElement): boolean => {
    const filter = input.dataset.historyFilter;
    if (!filter) return false;
    if (filter === "text") historyFilterText = input.value;
    if (filter === "showDuplicates") historyShowDuplicates = input.checked;
    if (filter === "currentMessageOnly") historyCurrentMessageOnly = input.checked;
    if (filter === "selectedSwipeOnly") historySelectedSwipeOnly = input.checked;
    if (filter === "currentPresetOnly") historyCurrentPresetOnly = input.checked;
    if (filter === "errorsOnly") historyErrorsOnly = input.checked;
    render();
    return true;
  };

  const updateRenderLabControl = (element: EventTarget | null): boolean => {
    const control = element instanceof HTMLElement
      ? element.closest<HTMLInputElement | HTMLSelectElement>("[data-render-lab]")
      : null;
    if (!control) return false;
    const key = control.dataset.renderLab;
    const value = control.value;
    if (key === "sampleMode" && (value === "minimal" || value === "normal" || value === "stress" || value === "mobile_torture" || value === "cast_heavy" || value === "world_heavy")) {
      renderLabSampleMode = value;
    } else if (key === "viewport" && (value === "phone_narrow" || value === "phone_large" || value === "tablet" || value === "desktop" || value === "custom")) {
      renderLabViewport = value;
    } else if (key === "surface" && (value === "inline_contained" || value === "inline_wide" || value === "popover_body" || value === "fullscreen_reader_body")) {
      renderLabSurface = value;
    } else if (key === "background" && (value === "plain_dark" || value === "chat" || value === "checker")) {
      renderLabBackground = value;
    } else if (key === "customWidth") {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) renderLabCustomWidth = Math.min(1800, Math.max(260, Math.round(numeric)));
    } else {
      return false;
    }
    const lab = buildRenderLabPreview();
    recordRenderLabDiagnostics(lab);
    render();
    return true;
  };

  const onInput = (event: Event): void => {
    const historyInput = event.target instanceof HTMLElement
      ? event.target.closest<HTMLInputElement>("[data-history-filter]")
      : null;
    if (historyInput && updateHistoryFilter(historyInput)) return;
    if (updateRenderLabControl(event.target)) return;
    if (isSettingsControl(event.target)) {
      scheduleSettingsAutosave();
      if (isDisplaySurfaceControl(event.target)) applyDisplaySettingsOptimistically(false);
    }
  };

  tab.root.addEventListener("input", onInput);
  cleanups.push(() => tab.root.removeEventListener("input", onInput));

  const onChange = (event: Event): void => {
    const historyInput = event.target instanceof HTMLElement
      ? event.target.closest<HTMLInputElement>("[data-history-filter]")
      : null;
    if (historyInput && updateHistoryFilter(historyInput)) return;
    if (updateRenderLabControl(event.target)) return;
    if (isSettingsControl(event.target)) {
      scheduleSettingsAutosave();
      if (isDisplaySurfaceControl(event.target)) applyDisplaySettingsOptimistically(true);
    }
    const target = event.target instanceof HTMLSelectElement
      ? event.target.closest<HTMLSelectElement>("[data-preset-select]")
      : null;
    if (target) selectPreset(target.value);

    const installModeSelect = event.target instanceof HTMLSelectElement
      ? event.target.closest<HTMLSelectElement>("[data-import-review-install-mode]")
      : null;
    if (installModeSelect) {
      const overwriteContainer = tab.root.querySelector<HTMLElement>("[data-import-review-overwrite-container]");
      if (overwriteContainer) {
        overwriteContainer.style.display = installModeSelect.value === "overwrite" ? "block" : "none";
      }
    }
  };

  tab.root.addEventListener("change", onChange);
  cleanups.push(() => tab.root.removeEventListener("change", onChange));

  cleanups.push(ctx.messages.registerTagInterceptor({
    tagName: LTRACKER_TAG_NAME,
    attrs: { type: LTRACKER_TAG_TYPE },
    removeFromMessage: true,
  }, handleEmbeddedTrackerTag));

  cleanups.push(tab.onActivate(activateDrawer));
  cleanups.push(inputAction.onClick(generateTracker));
  cleanups.push(ctx.onBackendMessage((payload) => {
    if (!isBackendMessage(payload)) return;
    const settingsResponse = typeof payload.requestId === "string"
      && (payload.requestId.startsWith("settings:") || payload.requestId.startsWith("settings-auto:") || payload.requestId.startsWith("settings-reset:"));
    if (payload.type === "state") {
      if (payload.state.chatId !== state.chatId) embeddedTagEntries.clear();
      syncOptimisticJobsFromState(payload.state);
      state = payload.state;
      if (settingsResponse) settingsSaveStatus = "saved";
      render();
    }
    if (payload.type === "error") {
      if (payload.state) syncOptimisticJobsFromState(payload.state);
      state = payload.state ?? {
        ...state,
        status: "error",
        error: emptyError(payload.message),
      };
      if (settingsResponse) settingsSaveStatus = "failed";
      render();
    }
    if (payload.type === "preset_pack_export_ready") {
      let methodUsed = "file download";
      try {
        const blob = new Blob([payload.json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = payload.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        methodUsed = "copy fallback";
        void copyText(payload.json, "preset pack JSON");
      }
      console.log(`LTracker export method used: ${methodUsed}`);
    }
    if (payload.type === "preset_pack_validation_report") {
      stagedValidationReport = payload.report;
      render();
    }
    if (payload.type === "sample_snapshot_ready") {
      stagedSampleSnapshot = payload.snapshot;
      stagedSampleRenderResult = payload.renderResult;
      render();
    }
  }));
  cleanups.push(() => clearSettingsAutosaveTimer());
  cleanups.push(() => cleanupMessageWidgets());
  cleanups.push(() => cleanupDomInjections());
  cleanups.push(() => closeDisplayPreview());
  cleanups.push(() => closePopover());
  cleanups.push(() => closeFullscreenReader());
  cleanups.push(() => inputAction.destroy());
  cleanups.push(() => tab.destroy());

  render();
  send({ type: "ready", chatId: activeChatId() });

  return () => {
    disposed = true;
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  };
}
