import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import {
  DEFAULT_TRACKER_PRESET,
  exportTrackerPreset,
} from "./shared/presets";
import { DEFAULT_SETTINGS } from "./shared/settings";
import type {
  BackendMessage,
  FrontendMessage,
  FrontendState,
  LTrackerError,
  LTrackerRenderSource,
  LTrackerSettings,
  TrackerPresetDraft,
} from "./shared/types";
import {
  EXTENSION_VERSION,
  SETTINGS_SCHEMA_VERSION,
  SPINDLE_TYPES_VERSION,
  STORAGE_SCHEMA_VERSION,
} from "./shared/types";

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
    },
    injectionPreview: null,
    renderPreview: null,
    presets: [DEFAULT_TRACKER_PRESET],
    activePreset: DEFAULT_TRACKER_PRESET,
    activePresetState: {
      selectedPresetId: DEFAULT_TRACKER_PRESET.id,
      selectedAt: new Date(0).toISOString(),
    },
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

function renderError(error: LTrackerError | null): string {
  if (!error) return "None";
  const detail = error.detail ? `\n\n${error.detail}` : "";
  return `[${error.stage}] ${error.message}${detail}`;
}

function renderJson(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  return JSON.stringify(value, null, 2);
}

function requestId(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function setup(ctx: SpindleFrontendContext): () => void {
  const cleanups: Array<() => void> = [];
  let state = emptyState();
  let disposed = false;

  const removeStyle = ctx.dom.addStyle(STYLES);
  cleanups.push(removeStyle);

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

  function activeChatId(): string | null {
    return ctx.getActiveChat().chatId;
  }

  function send(message: FrontendMessage): void {
    if (!disposed) ctx.sendToBackend(message);
  }

  function requestState(): void {
    send({ type: "refresh_state", chatId: activeChatId() });
  }

  function generateTracker(): void {
    send({
      type: "generate_tracker",
      chatId: activeChatId(),
      requestId: requestId("generate"),
    });
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
    const injectionNumberValue = (name: keyof Pick<LTrackerSettings["injection"], "maxInjectedChars">): number => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.injection[name];
    };
    const injectionBooleanValue = (name: keyof Pick<LTrackerSettings["injection"], "enabled" | "includeHeader" | "includeTimestamp" | "includeSourceMessageId" | "onlyInjectWhenSnapshotExists">): boolean => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-setting="${name}"]`);
      return input ? input.checked : state.settings.injection[name];
    };
    const rendererNumberValue = (name: keyof Pick<LTrackerSettings["renderer"], "maxRenderedChars">): number => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-renderer-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.renderer[name];
    };
    const rendererBooleanValue = (name: keyof Pick<LTrackerSettings["renderer"], "enabled" | "allowInlineStyles">): boolean => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-renderer-setting="${name}"]`);
      return input ? input.checked : state.settings.renderer[name];
    };
    const rendererTextValue = (name: keyof Pick<LTrackerSettings["renderer"], "missingValuePlaceholder">): string => {
      const input = tab.root.querySelector<HTMLInputElement>(`[data-renderer-setting="${name}"]`);
      return input ? input.value : state.settings.renderer[name];
    };
    const selectValue = <T extends string>(name: keyof LTrackerSettings["injection"], fallback: T): T => {
      const input = tab.root.querySelector<HTMLSelectElement>(`[data-setting="${name}"]`);
      return input ? input.value as T : fallback;
    };
    const rendererSelectValue = <T extends string>(name: keyof Pick<LTrackerSettings["renderer"], "previewSource">, fallback: T): T => {
      const input = tab.root.querySelector<HTMLSelectElement>(`[data-renderer-setting="${name}"]`);
      return input ? input.value as T : fallback;
    };
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
      injection: {
        enabled: injectionBooleanValue("enabled"),
        mode: selectValue("mode", state.settings.injection.mode),
        format: selectValue("format", state.settings.injection.format),
        maxInjectedChars: injectionNumberValue("maxInjectedChars"),
        includeHeader: injectionBooleanValue("includeHeader"),
        includeTimestamp: injectionBooleanValue("includeTimestamp"),
        includeSourceMessageId: injectionBooleanValue("includeSourceMessageId"),
        onlyInjectWhenSnapshotExists: injectionBooleanValue("onlyInjectWhenSnapshotExists"),
      },
      renderer: {
        enabled: rendererBooleanValue("enabled"),
        previewSource: rendererSelectValue("previewSource", state.settings.renderer.previewSource),
        missingValuePlaceholder: rendererTextValue("missingValuePlaceholder"),
        maxRenderedChars: rendererNumberValue("maxRenderedChars"),
        allowInlineStyles: rendererBooleanValue("allowInlineStyles"),
      },
    };
  }

  function saveSettings(): void {
    send({
      type: "save_settings",
      chatId: activeChatId(),
      settings: readSettings(),
      requestId: requestId("settings"),
    });
  }

  function resetSettings(): void {
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
    const injectionPreviewText = state.injectionPreview
      ?? "No injection preview available. Generate a tracker and enable injection to preview cached context.";
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
    const activePreset = state.activePreset;
    const activePresetIsBuiltIn = activePreset.origin === "built_in";
    const presetSchemaText = JSON.stringify(activePreset.jsonSchema, null, 2);
    const presetHtmlWarning = activePreset.htmlTemplate?.trim()
      ? "Templates are sanitized and only rendered in the drawer preview in version 0.06. They are not inserted into chat messages."
      : activePresetIsBuiltIn
        ? "This built-in preset has no HTML template. Duplicate it before adding one."
        : "HTML template is optional. In 0.06 it is sanitized and rendered only in the drawer preview.";
    const presetOptions = state.presets.map((preset) => {
      return `<option value="${escapeHtml(preset.id)}"${selected(preset.id === activePreset.id)}>${escapeHtml(preset.name)} (${escapeHtml(preset.origin)})</option>`;
    }).join("");
    const permissionText = [
      state.permissions.generation ? "generation granted" : "generation missing",
      state.permissions.chats ? "chats granted" : "chats missing",
      state.permissions.chatMutation ? "chat_mutation granted" : "chat_mutation missing",
      state.permissions.contextHandler ? "context_handler granted" : "context_handler missing",
    ].join(" / ");

    tab.root.innerHTML = `
      <section class="ltracker-shell">
        <header class="ltracker-header">
          <div>
            <h2 class="ltracker-title">LTracker</h2>
            <div class="ltracker-version">Version ${escapeHtml(state.version)}</div>
          </div>
          <span class="ltracker-status">${escapeHtml(labelForStatus(state.status))}</span>
        </header>

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

        <section class="ltracker-panel">
          <span class="ltracker-label">Generator Settings</span>
          <div class="ltracker-settings">
            <label class="ltracker-field">
              Recent message limit
              <input type="number" min="1" max="200" step="1" data-setting="recentMessageLimit" value="${escapeHtml(String(state.settings.recentMessageLimit))}">
            </label>
            <label class="ltracker-field">
              Max chars per message
              <input type="number" min="500" max="50000" step="100" data-setting="maxMessageChars" value="${escapeHtml(String(state.settings.maxMessageChars))}">
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
            <label class="ltracker-check">
              <input type="checkbox" data-setting="autoModeEnabled"${checked(state.settings.auto.autoModeEnabled)}>
              Auto mode
            </label>
            <label class="ltracker-field">
              Auto debounce ms
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
          </div>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="save-settings">Save Settings</button>
            <button class="ltracker-button" type="button" data-action="reset-settings">Reset Settings</button>
          </div>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Prompt Injection</span>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-setting="enabled"${checked(state.settings.injection.enabled)}>
              Enable LTracker injection
            </label>
            <label class="ltracker-field">
              Mode
              <select data-setting="mode">
                <option value="latest_chat_snapshot"${selected(state.settings.injection.mode === "latest_chat_snapshot")}>Latest chat snapshot</option>
                <option value="latest_message_snapshot"${selected(state.settings.injection.mode === "latest_message_snapshot")}>Latest message snapshot</option>
              </select>
            </label>
            <label class="ltracker-field">
              Format
              <select data-setting="format">
                <option value="compact"${selected(state.settings.injection.format === "compact")}>Compact</option>
                <option value="pretty_json"${selected(state.settings.injection.format === "pretty_json")}>Pretty JSON</option>
                <option value="minimal"${selected(state.settings.injection.format === "minimal")}>Minimal</option>
              </select>
            </label>
            <label class="ltracker-field">
              Max injected chars
              <input type="number" min="500" max="20000" step="250" data-setting="maxInjectedChars" value="${escapeHtml(String(state.settings.injection.maxInjectedChars))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="includeHeader"${checked(state.settings.injection.includeHeader)}>
              Include header
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="includeTimestamp"${checked(state.settings.injection.includeTimestamp)}>
              Include timestamp
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="includeSourceMessageId"${checked(state.settings.injection.includeSourceMessageId)}>
              Include source message id
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="onlyInjectWhenSnapshotExists"${checked(state.settings.injection.onlyInjectWhenSnapshotExists)}>
              Only inject when snapshot exists
            </label>
          </div>
          <p class="ltracker-note">Injection uses cached snapshots only. It does not generate a tracker by itself, and no snapshot means nothing is injected.</p>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="copy-injection-preview" ${disabled(!state.injectionPreview)}>
              Copy Injection Preview
            </button>
          </div>
          <details class="ltracker-details" open>
            <summary>Current injection preview</summary>
            <pre class="ltracker-text">${escapeHtml(injectionPreviewText)}</pre>
          </details>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Rendered Tracker Preview</span>
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
              Max rendered chars
              <input type="number" min="1000" max="200000" step="1000" data-renderer-setting="maxRenderedChars" value="${escapeHtml(String(state.settings.renderer.maxRenderedChars))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-renderer-setting="allowInlineStyles"${checked(state.settings.renderer.allowInlineStyles)}>
              Allow sanitized inline styles
            </label>
          </div>
          <p class="ltracker-note">HTML templates render only in this drawer preview. They never mutate chat messages and are not used for context injection.</p>
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

        <section class="ltracker-panel">
          <span class="ltracker-label">Schema Presets</span>
          <p class="ltracker-note">zTracker-style layout: Schema Box 1 is active JSON Schema, Schema Box 2 is sanitized drawer-preview HTML, and Prompt Box instructions guide tracker extraction.</p>
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
            <label class="ltracker-field ltracker-field-wide">
              Schema Box 1 - JSON Schema
              <textarea data-preset-field="jsonSchema"${disabled(activePresetIsBuiltIn)}>${escapeHtml(presetSchemaText)}</textarea>
            </label>
            <label class="ltracker-field ltracker-field-wide">
              Schema Box 2 - HTML Template (Sanitized drawer preview only)
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
            <label class="ltracker-field ltracker-field-wide">
              Import Preset JSON
              <textarea data-preset-import placeholder="Paste exported ltracker_schema_preset JSON here"></textarea>
            </label>
          </div>
          <p class="ltracker-note">${escapeHtml(presetHtmlWarning)}</p>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="render-template" ${disabled(!state.chatId)}>
              Render With Latest Snapshot
            </button>
            <button class="ltracker-button" type="button" data-action="save-preset-new">Save As New Preset</button>
            <button class="ltracker-button" type="button" data-action="duplicate-preset">Duplicate Preset</button>
            <button class="ltracker-button" type="button" data-action="update-preset" ${disabled(activePresetIsBuiltIn)}>Update Current Preset</button>
            <button class="ltracker-button" type="button" data-action="delete-preset" ${disabled(activePresetIsBuiltIn)}>Delete Preset</button>
            <button class="ltracker-button" type="button" data-action="reset-preset">Reset To Default Preset</button>
            <button class="ltracker-button" type="button" data-action="export-preset">Export Selected Preset</button>
            <button class="ltracker-button" type="button" data-action="import-preset">Import Preset JSON</button>
            <button class="ltracker-button" type="button" data-action="validate-preset">Validate Preset</button>
          </div>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Diagnostics</span>
          <div class="ltracker-grid">
            ${renderRow("Extension version", state.version)}
            ${renderRow("Active chat id", state.chatId)}
            ${renderRow("Current status", state.status)}
            ${renderRow("Auto mode", autoStatus)}
            ${renderRow("Permission status", permissionText)}
            ${renderRow("Injection enabled", diagnostics.injectionEnabled ? "yes" : "no")}
            ${renderRow("Last injection at", diagnostics.lastInjectionAt)}
            ${renderRow("Last injection mode", diagnostics.lastInjectionMode)}
            ${renderRow("Last injection format", diagnostics.lastInjectionFormat)}
            ${renderRow("Last injected chars", diagnostics.lastInjectedChars)}
            ${renderRow("Last injection skipped", diagnostics.lastInjectionSkippedReason)}
            ${renderRow("Last injection snapshot", diagnostics.lastInjectionSnapshotCreatedAt)}
            ${renderRow("Last injection source message", diagnostics.lastInjectionSourceMessageId)}
            ${renderRow("Selected preset id", diagnostics.selectedPresetId ?? activePreset.id)}
            ${renderRow("Selected preset name", diagnostics.selectedPresetName ?? activePreset.name)}
            ${renderRow("Last preset fallback", diagnostics.lastPresetFallbackReason)}
            ${renderRow("Last preset validation error", diagnostics.lastPresetValidationError)}
            ${renderRow("Last prompt preset id", diagnostics.lastPromptUsedPresetId)}
            ${renderRow("Last prompt preset name", diagnostics.lastPromptUsedPresetName)}
            ${renderRow("Last render at", diagnostics.lastRenderAt)}
            ${renderRow("Last render preset id", diagnostics.lastRenderPresetId)}
            ${renderRow("Last render preset name", diagnostics.lastRenderPresetName)}
            ${renderRow("Last render snapshot", diagnostics.lastRenderSnapshotCreatedAt)}
            ${renderRow("Last render source", diagnostics.lastRenderSource)}
            ${renderRow("Last render status", diagnostics.lastRenderStatus)}
            ${renderRow("Last sanitized HTML chars", diagnostics.lastSanitizedHtmlChars)}
            ${renderRow("Last fallback text chars", diagnostics.lastFallbackTextChars)}
            ${renderRow("Last render warnings", diagnostics.lastRenderWarnings.join(", "))}
            ${renderRow("Last render errors", diagnostics.lastRenderErrors.join(", "))}
            ${renderRow("Last generation source", diagnostics.lastGenerationSource)}
            ${renderRow("Last generation started", diagnostics.lastGenerationStartedAt)}
            ${renderRow("Last generation completed", diagnostics.lastGenerationCompletedAt)}
            ${renderRow("Last duration ms", diagnostics.lastGenerationDurationMs)}
            ${renderRow("Last auto event", diagnostics.lastAutoEventAt)}
            ${renderRow("Last auto event type", diagnostics.lastAutoEventType)}
            ${renderRow("Last auto scheduled", diagnostics.lastAutoScheduledAt)}
            ${renderRow("Last auto triggered", diagnostics.lastAutoTriggeredAt)}
            ${renderRow("Last auto skipped", diagnostics.lastAutoSkippedReason)}
            ${renderRow("Last auto source message", diagnostics.lastAutoSourceMessageId)}
            ${renderRow("Last auto source index", diagnostics.lastAutoSourceMessageIndex)}
            ${renderRow("Last auto generation id", diagnostics.lastAutoGenerationId)}
            ${renderRow("Latest attached message", diagnostics.latestAttachedMessageId)}
            ${renderRow("Latest attached index", diagnostics.latestAttachedMessageIndex)}
            ${renderRow("Latest attached at", diagnostics.latestAttachedSnapshotAt)}
            ${renderRow("Latest attached storage key", diagnostics.latestAttachedSnapshotStorageKey)}
            ${renderRow("Messages read", diagnostics.lastMessagesRead)}
            ${renderRow("Source message range", diagnostics.lastSourceMessageRange)}
            ${renderRow("Source message ids", diagnostics.lastSourceMessageIds.join(", "))}
            ${renderRow("Storage key", diagnostics.storageKey)}
            ${renderRow("Last job id", diagnostics.lastJobId)}
            ${renderRow("Last request id", diagnostics.lastRequestId)}
            ${renderRow("Last cancellation", diagnostics.lastCancellation ? `${diagnostics.lastCancellation.jobId}: ${diagnostics.lastCancellation.reason}` : null)}
            ${renderRow("Build target", diagnostics.buildInfo.buildTarget)}
            ${renderRow("Spindle types", diagnostics.buildInfo.spindleTypesVersion)}
            ${renderRow("Storage schema", diagnostics.buildInfo.storageSchemaVersion)}
            ${renderRow("Settings schema", diagnostics.buildInfo.settingsSchemaVersion)}
          </div>
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
  }

  const onClick = (event: Event): void => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>("[data-action]")
      : null;
    const action = target?.dataset.action;
    if (action === "generate") generateTracker();
    if (action === "refresh") requestState();
    if (action === "clear-snapshot") clearSnapshot();
    if (action === "save-settings") saveSettings();
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
    if (action === "copy-injection-preview") void copyText(state.injectionPreview, "injection preview");
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
    if (action === "save-preset-new") savePresetAsNew();
    if (action === "duplicate-preset") duplicatePreset();
    if (action === "update-preset") updatePreset();
    if (action === "delete-preset") deletePreset();
    if (action === "reset-preset") resetPreset();
    if (action === "import-preset") importPreset();
    if (action === "validate-preset") validatePreset();
    if (action === "export-preset") {
      void copyText(JSON.stringify(exportTrackerPreset(state.activePreset), null, 2), "selected preset export");
    }
  };

  tab.root.addEventListener("click", onClick);
  cleanups.push(() => tab.root.removeEventListener("click", onClick));

  const onChange = (event: Event): void => {
    const target = event.target instanceof HTMLSelectElement
      ? event.target.closest<HTMLSelectElement>("[data-preset-select]")
      : null;
    if (target) selectPreset(target.value);
  };

  tab.root.addEventListener("change", onChange);
  cleanups.push(() => tab.root.removeEventListener("change", onChange));

  cleanups.push(tab.onActivate(requestState));
  cleanups.push(inputAction.onClick(generateTracker));
  cleanups.push(ctx.onBackendMessage((payload) => {
    if (!isBackendMessage(payload)) return;
    if (payload.type === "state") {
      state = payload.state;
      render();
    }
    if (payload.type === "error") {
      state = payload.state ?? {
        ...state,
        status: "error",
        error: emptyError(payload.message),
      };
      render();
    }
  }));
  cleanups.push(() => inputAction.destroy());
  cleanups.push(() => tab.destroy());

  render();
  send({ type: "ready", chatId: activeChatId() });

  return () => {
    disposed = true;
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  };
}
