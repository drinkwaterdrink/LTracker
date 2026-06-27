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

// src/frontend.ts
var ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1.45.9L12 17.62 5.45 20.9A1 1 0 0 1 4 20V4a1 1 0 0 1 1-1Zm1 2v13.38l5.55-2.78a1 1 0 0 1 .9 0L18 18.38V5H6Zm3 3h6v2H9V8Zm0 4h5v2H9v-2Z"/></svg>`;
var STYLES = `
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
.ltracker-field input[type="number"] {
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, currentColor 6%, transparent);
  color: inherit;
  font: inherit;
  min-height: 34px;
  padding: 6px 8px;
}
.ltracker-check {
  align-items: center;
  display: flex;
  gap: 8px;
  min-height: 34px;
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
function emptyError(message) {
  return {
    stage: "unknown",
    message,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function emptyState() {
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
      chatMutation: false
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
        buildTarget: "es2022"
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
      latestAttachedSnapshotStorageKey: null
    }
  };
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isBackendMessage(payload) {
  return isRecord(payload) && typeof payload.type === "string";
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function checked(value) {
  return value ? " checked" : "";
}
function disabled(value) {
  return value ? " disabled" : "";
}
function labelForStatus(status) {
  if (status === "generating") return "generating";
  if (status === "error") return "error";
  return "idle";
}
function renderRow(label, value) {
  return `
    <div class="ltracker-key">${escapeHtml(label)}</div>
    <div class="ltracker-value">${escapeHtml(value === null || value === "" ? "None" : String(value))}</div>
  `;
}
function renderError(error) {
  if (!error) return "None";
  const detail = error.detail ? `

${error.detail}` : "";
  return `[${error.stage}] ${error.message}${detail}`;
}
function renderJson(value, fallback) {
  if (value === null || value === void 0) return fallback;
  return JSON.stringify(value, null, 2);
}
function requestId(prefix) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
function setup(ctx) {
  const cleanups = [];
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
    iconSvg: ICON
  });
  tab.root.classList.add("ltracker-root");
  const inputAction = ctx.ui.registerInputBarAction({
    id: "ltracker-generate-tracker",
    label: "Generate Tracker",
    subtitle: "Update LTracker snapshot",
    iconSvg: ICON
  });
  function activeChatId() {
    return ctx.getActiveChat().chatId;
  }
  function send(message) {
    if (!disposed) ctx.sendToBackend(message);
  }
  function requestState() {
    send({ type: "refresh_state", chatId: activeChatId() });
  }
  function generateTracker() {
    send({
      type: "generate_tracker",
      chatId: activeChatId(),
      requestId: requestId("generate")
    });
  }
  function clearSnapshot() {
    send({
      type: "clear_snapshot",
      chatId: activeChatId(),
      requestId: requestId("clear")
    });
  }
  function readSettings() {
    const numberValue = (name) => {
      const input = tab.root.querySelector(`[data-setting="${name}"]`);
      return input ? Number(input.value) : state.settings[name];
    };
    const booleanValue = (name) => {
      const input = tab.root.querySelector(`[data-setting="${name}"]`);
      return input ? input.checked : state.settings[name];
    };
    const autoNumberValue = (name) => {
      const input = tab.root.querySelector(`[data-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.auto[name];
    };
    const autoBooleanValue = (name) => {
      const input = tab.root.querySelector(`[data-setting="${name}"]`);
      return input ? input.checked : state.settings.auto[name];
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
        onlyWhenChatActive: autoBooleanValue("onlyWhenChatActive")
      }
    };
  }
  function saveSettings() {
    send({
      type: "save_settings",
      chatId: activeChatId(),
      settings: readSettings(),
      requestId: requestId("settings")
    });
  }
  function resetSettings() {
    send({
      type: "reset_settings",
      chatId: activeChatId(),
      requestId: requestId("settings-reset")
    });
  }
  async function copyText(value, label) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state = {
        ...state,
        status: "error",
        error: emptyError(`Could not copy ${label}: ${message}`)
      };
      render();
    }
  }
  function render() {
    inputAction.setEnabled(state.status !== "generating");
    const canGenerate = state.status !== "generating";
    const snapshotText = state.snapshot ? JSON.stringify(state.snapshot.data, null, 2) : "No tracker snapshot saved for this chat yet.";
    const diagnostics = state.diagnostics;
    const rawOutput = diagnostics.lastRawOutput;
    const prompt = diagnostics.lastPromptPreview;
    const parsedTracker = diagnostics.lastParsedTracker;
    const error = state.error ?? diagnostics.lastError;
    const autoStatus = state.settings.auto.autoModeEnabled ? diagnostics.autoSubscriptionActive ? "Armed" : "Enabled, listener inactive" : "Disabled";
    const latestMessageSnapshotText = state.latestMessageSnapshot ? JSON.stringify(state.latestMessageSnapshot, null, 2) : "No message-attached tracker snapshot saved yet.";
    const permissionText = [
      state.permissions.generation ? "generation granted" : "generation missing",
      state.permissions.chats ? "chats granted" : "chats missing",
      state.permissions.chatMutation ? "chat_mutation granted" : "chat_mutation missing"
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
          <span class="ltracker-label">Diagnostics</span>
          <div class="ltracker-grid">
            ${renderRow("Extension version", state.version)}
            ${renderRow("Active chat id", state.chatId)}
            ${renderRow("Current status", state.status)}
            ${renderRow("Auto mode", autoStatus)}
            ${renderRow("Permission status", permissionText)}
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
  const onClick = (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
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
        "message snapshot"
      );
    }
  };
  tab.root.addEventListener("click", onClick);
  cleanups.push(() => tab.root.removeEventListener("click", onClick));
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
        error: emptyError(payload.message)
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
export {
  setup
};
