import {
  escapeHtml,
  formatTemplateTextFallback,
  renderHtmlTemplate,
} from "./htmlTemplateRenderer";
import { formatSnapshotForInjection, truncateSafe } from "./snapshotFormat";
import {
  resolvePresetForSnapshot,
  type SnapshotPresetResolution,
} from "./presetRenderLock";
import type {
  LTrackerInjectionSettings,
  LTrackerMessageDisplaySettings,
  MessageAttachedSnapshot,
  MessageSnapshotIndexEntry,
  MessageTrackerControlState,
  MessageTrackerHistoryEntry,
  RenderedMessageTracker,
  SwipeTrackerIdentity,
  TrackerSchemaPreset,
  TrackerSnapshot,
} from "./types";
import {
  DEFAULT_SWIPE_KEY,
  defaultSwipeIdentity,
  swipeIdentityKey,
} from "./swipeIdentity";

export const MESSAGE_LOCAL_UI_SUPPORTED = true;
export const MESSAGE_LOCAL_UI_FALLBACK_REASON: string | null = null;
export const MESSAGE_WIDGET_ID = "ltracker-message-tracker";
export const MESSAGE_WIDGET_PLACEMENT_REASON =
  "lumiverse-spindle-types@0.5.21 exposes ctx.messages.renderWidget() as a below-message widget surface and does not expose a top-placement option.";
export const MESSAGE_DOM_INJECTION_REASON =
  "lumiverse-spindle-types@0.5.21 exposes ctx.dom.inject() with InsertPosition, so LTracker uses afterbegin for top placement.";
export const MESSAGE_NATIVE_TOOLBAR_SUPPORTED = false;
export const MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON =
  "lumiverse-spindle-types@0.5.21 exposes message DOM helpers, message widgets, message tags, and message_footer mounting, but no per-message toolbar action slot.";

export const LTRACKER_DOM_TRACKER_CSS = `
.ltracker-dom-tracker { margin: 0 0 4px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 8px; background: color-mix(in srgb, currentColor 3%, transparent); color: inherit; font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 100%; }
.ltracker-dom-tracker.ltd-chat-width { width: 100%; max-width: min(var(--ltracker-expanded-width, 1100px), 100%); box-sizing: border-box; margin-left: 0; margin-right: 0; }
.ltracker-dom-tracker.ltd-surface-inline-contained { width: 100%; max-width: 100%; }
.ltracker-dom-tracker.ltd-overlay-shell { display: inline-block; width: auto; max-width: 100%; }
.ltracker-dom-tracker.ltd-overlay-shell .ltd-body, .ltracker-dom-tracker.ltd-overlay-shell .ltd-footer-actions { display: none !important; }
.ltracker-dom-tracker.ltd-missing-tracker { display: inline-flex; border-radius: 999px; background: color-mix(in srgb, currentColor 5%, transparent); }
.ltracker-dom-tracker details { margin: 0; min-width: 0; }
.ltracker-dom-tracker summary { cursor: pointer; list-style: none; min-height: 26px; padding: 3px 5px; }
.ltracker-dom-tracker summary::-webkit-details-marker { display: none; }
.ltd-summary { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.ltd-head { display: flex; align-items: center; gap: 4px 6px; flex-wrap: wrap; min-width: 0; }
.ltd-title { font-weight: 700; letter-spacing: 0; }
.ltd-control-icon { width: 18px; height: 18px; display: inline-grid; place-items: center; border-radius: 999px; background: color-mix(in srgb, currentColor 8%, transparent); }
.ltd-control-icon svg { width: 13px; height: 13px; transition: transform .15s ease; }
.ltracker-dom-tracker details[open] .ltd-control-icon svg { transform: rotate(180deg); }
.ltd-missing-tracker .ltd-control-icon svg, .ltd-spinning svg { transform: none; }
.ltd-meta { opacity: .68; overflow-wrap: anywhere; }
.ltd-pill { border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 999px; padding: 1px 5px; opacity: .8; }
.ltd-warning { color: #f59e0b; }
.ltd-actions { display: inline-flex; align-items: center; gap: 4px; }
.ltd-icon-button { width: 24px; height: 24px; display: inline-grid; place-items: center; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 7px; background: color-mix(in srgb, currentColor 6%, transparent); color: inherit; cursor: pointer; padding: 0; }
.ltd-comfortable .ltd-icon-button { width: 28px; height: 28px; }
.ltd-icon-button svg { width: 14px; height: 14px; }
.ltd-icon-button:hover, .ltd-icon-button:focus-visible { background: color-mix(in srgb, currentColor 12%, transparent); outline: 2px solid color-mix(in srgb, currentColor 30%, transparent); }
.ltd-spinning svg { animation: ltd-spin .9s linear infinite; }
.ltd-body { border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent); padding: 7px; overflow-wrap: anywhere; max-height: min(var(--ltracker-expanded-max-height, 56vh), 900px); overflow: auto; }
.ltd-pre { white-space: pre-wrap; word-break: break-word; margin: 0; font: 12px/1.42 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.ltracker-dom-tracker details:not([open]) { min-height: 0; }
.ltracker-dom-tracker details:not([open]) .ltd-body { display: none; }
@keyframes ltd-spin { to { transform: rotate(360deg); } }
@media (max-width: 520px) { .ltd-meta { display: none; } .ltd-summary { gap: 4px; } .ltd-icon-button { width: 28px; height: 28px; } .ltd-body { max-height: 48vh; } }
`;

interface RenderMessageTrackerInput {
  messageId: string;
  messageIndex: number | null;
  attachedSnapshot: MessageAttachedSnapshot | null;
  latestChatSnapshot: TrackerSnapshot | null;
  preset: TrackerSchemaPreset | null;
  presets?: TrackerSchemaPreset[];
  activePreset?: TrackerSchemaPreset;
  presetResolution?: SnapshotPresetResolution | null;
  settings: LTrackerMessageDisplaySettings;
  swipeIdentity?: SwipeTrackerIdentity | null;
  isRegenerating?: boolean;
  activeJobId?: string | null;
  activeJobStartedAt?: string | null;
}

interface BuildMessageTrackerHistoryInput {
  index: MessageSnapshotIndexEntry[];
  snapshots: Array<MessageAttachedSnapshot | null>;
  latestChatSnapshot: TrackerSnapshot | null;
  preset: TrackerSchemaPreset;
  presets?: TrackerSchemaPreset[];
  settings: LTrackerMessageDisplaySettings;
  activeWidgetJobs?: Record<string, { jobId: string; startedAt: string | null }>;
  selectedSwipeIdentities?: Record<string, SwipeTrackerIdentity>;
}

export interface MessageTrackerHistoryGroupingResult {
  entries: MessageTrackerHistoryEntry[];
  groupedCount: number;
  duplicateCount: number;
}

function snapshotForDisplay(input: RenderMessageTrackerInput): TrackerSnapshot | null {
  if (input.settings.source === "latest_chat_snapshot" && input.latestChatSnapshot) return input.latestChatSnapshot;
  return input.attachedSnapshot?.snapshot ?? null;
}

function metadataFromSnapshot(
  attachedSnapshot: MessageAttachedSnapshot | null,
  snapshot: TrackerSnapshot | null,
): Pick<RenderedMessageTracker, "presetId" | "presetName" | "presetVersion" | "snapshotCreatedAt" | "attachedAt"> {
  return {
    presetId: attachedSnapshot?.presetId ?? snapshot?.presetId ?? null,
    presetName: attachedSnapshot?.presetName ?? snapshot?.presetName ?? null,
    presetVersion: attachedSnapshot?.presetVersion ?? snapshot?.presetVersion ?? null,
    snapshotCreatedAt: snapshot?.createdAt ?? null,
    attachedAt: attachedSnapshot?.attachedAt ?? null,
  };
}

function identityFromInput(input: RenderMessageTrackerInput): SwipeTrackerIdentity {
  if (input.swipeIdentity) return input.swipeIdentity;
  if (input.attachedSnapshot) {
    return {
      chatId: input.attachedSnapshot.chatId,
      messageId: input.messageId,
      swipeKey: input.attachedSnapshot.swipeKey ?? DEFAULT_SWIPE_KEY,
      swipeIndex: input.attachedSnapshot.swipeIndex ?? null,
      swipeId: input.attachedSnapshot.swipeId ?? null,
      swipeContentHash: input.attachedSnapshot.swipeContentHash ?? null,
      swipeKeySource: input.attachedSnapshot.swipeKeySource ?? "unknown",
    };
  }
  return defaultSwipeIdentity(input.latestChatSnapshot?.chatId ?? "", input.messageId);
}

function generationMetadataFromSnapshot(
  snapshot: TrackerSnapshot | null,
  input: RenderMessageTrackerInput,
): Pick<
  RenderedMessageTracker,
  | "generationStartedAt"
  | "generationCompletedAt"
  | "generationDurationMs"
  | "generationCancelledAt"
  | "generationStatus"
  | "isRegenerating"
  | "activeJobId"
> {
  return {
    generationStartedAt: input.activeJobStartedAt ?? snapshot?.generationStartedAt ?? null,
    generationCompletedAt: snapshot?.generationCompletedAt ?? null,
    generationDurationMs: typeof snapshot?.generationDurationMs === "number" && Number.isFinite(snapshot.generationDurationMs)
      ? Math.max(0, Math.round(snapshot.generationDurationMs))
      : null,
    generationCancelledAt: snapshot?.generationCancelledAt ?? null,
    generationStatus: snapshot?.generationStatus ?? null,
    isRegenerating: input.isRegenerating === true,
    activeJobId: input.activeJobId ?? null,
  };
}

function renderPresetResolution(input: RenderMessageTrackerInput, snapshot: TrackerSnapshot | null): SnapshotPresetResolution | null {
  if (!snapshot) return null;
  if (input.presetResolution) return input.presetResolution;
  const activePreset = input.activePreset ?? input.preset ?? input.presets?.[0] ?? null;
  if (!activePreset) return null;
  const installedPresets = input.presets ?? (input.preset ? [input.preset] : [activePreset]);
  const source = input.settings.source === "latest_chat_snapshot"
    ? snapshot
    : input.attachedSnapshot ?? snapshot;
  return resolvePresetForSnapshot(source, installedPresets, activePreset);
}

function injectionSettings(settings: LTrackerMessageDisplaySettings): LTrackerInjectionSettings {
  return {
    enabled: true,
    retainCount: 1,
    format: "compact_text",
    injectionPlacement: "append_to_last_assistant",
    includeOnlyIfMissingFromPrompt: true,
    stripOlderTrackerBlocks: true,
    maxInjectedChars: settings.maxRenderedChars,
    roleFallback: "system",
    includeHeader: false,
    header: "LTracker Recent State",
  };
}

function displayJson(
  messageId: string,
  messageIndex: number | null,
  attachedSnapshot: MessageAttachedSnapshot | null,
  snapshot: TrackerSnapshot,
  settings: LTrackerMessageDisplaySettings,
): string {
  return truncateSafe(JSON.stringify({
    messageId,
    messageIndex,
    attachedAt: attachedSnapshot?.attachedAt ?? null,
    snapshotCreatedAt: snapshot.createdAt,
    presetId: attachedSnapshot?.presetId ?? snapshot.presetId ?? null,
    presetName: attachedSnapshot?.presetName ?? snapshot.presetName ?? null,
    presetVersion: attachedSnapshot?.presetVersion ?? snapshot.presetVersion ?? null,
    generationStartedAt: snapshot.generationStartedAt ?? null,
    generationCompletedAt: snapshot.generationCompletedAt ?? null,
    generationDurationMs: snapshot.generationDurationMs ?? null,
    generationCancelledAt: snapshot.generationCancelledAt ?? null,
    generationStatus: snapshot.generationStatus ?? null,
    editedAt: snapshot.editedAt ?? null,
    editedByUser: snapshot.editedByUser === true,
    data: snapshot.data,
  }, null, 2), settings.maxRenderedChars);
}

function safeScriptJson(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003C");
}

export function formatDurationMs(durationMs: number | null | undefined): string | null {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return null;
  if (durationMs < 1_000) return `${Math.round(durationMs)}ms`;
  const seconds = durationMs / 1_000;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}

export function currentRunningDuration(startedAt: string | null): string | null {
  if (!startedAt) return null;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return null;
  return formatDurationMs(Date.now() - startedMs);
}

type RenderedMessageTrackerBase = Omit<RenderedMessageTracker, "widgetHtml" | "domHtml" | "controlState">;
type RenderedMessageTrackerRenderable = RenderedMessageTrackerBase & { controlState: MessageTrackerControlState };

function debugSwipeLabel(
  rendered: Pick<RenderedMessageTrackerBase, "swipeKey" | "swipeIndex" | "swipeId" | "swipeKeySource">,
  settings: LTrackerMessageDisplaySettings,
): string | null {
  if (!settings.showDebugSwipeKey) return null;
  const parts = [`swipe ${rendered.swipeKey}`];
  if (rendered.swipeIndex !== null) parts.push(`index ${rendered.swipeIndex}`);
  if (rendered.swipeId) parts.push(`id ${rendered.swipeId}`);
  if (rendered.swipeKeySource !== "unknown") parts.push(rendered.swipeKeySource);
  return parts.join(" / ");
}

function controlGenerationStatus(
  rendered: Pick<RenderedMessageTrackerBase, "isRegenerating" | "generationStatus">,
  hasTracker: boolean,
): MessageTrackerControlState["generationStatus"] {
  if (rendered.isRegenerating) return "generating";
  if (rendered.generationStatus === "completed" || rendered.generationStatus === "cancelled" || rendered.generationStatus === "failed") {
    return rendered.generationStatus;
  }
  return hasTracker ? "completed" : "idle";
}

function buildControlState(
  rendered: RenderedMessageTrackerBase,
  settings: LTrackerMessageDisplaySettings,
  hasTracker: boolean,
  errors: string[],
): MessageTrackerControlState {
  const status = controlGenerationStatus(rendered, hasTracker);
  return {
    messageId: rendered.messageId,
    swipeKey: rendered.swipeKey,
    hasTracker,
    isExpanded: hasTracker && !settings.collapsedByDefault,
    isGenerating: rendered.isRegenerating,
    generationStartedAt: rendered.generationStartedAt,
    generationDurationMs: rendered.generationDurationMs,
    generationStatus: status,
    error: status === "failed" ? errors[0] ?? "Tracker generation failed." : null,
    debugSwipeLabel: debugSwipeLabel(rendered, settings),
  };
}

function buildWidgetHtml(
  rendered: RenderedMessageTrackerRenderable,
  settings: LTrackerMessageDisplaySettings,
): string {
  if (!rendered.controlState.hasTracker && !settings.showGenerateButtonForMissingTracker) return "";
  const duration = settings.showGenerationDuration
    ? formatDurationMs(rendered.generationDurationMs)
    : null;
  const runningSince = rendered.isRegenerating ? rendered.generationStartedAt : null;
  const actionLabel = rendered.isRegenerating
    ? "Cancel tracker generation"
    : rendered.controlState.hasTracker ? "Regenerate tracker" : "Generate tracker";
  const action = rendered.controlState.hasTracker ? "toggle_regenerate" : "generate";
  const actionKind = rendered.isRegenerating
    ? "stop"
    : rendered.controlState.hasTracker ? "refresh" : "generate";
  const meta = [
    settings.showPresetName && rendered.presetName ? rendered.presetName : null,
    settings.showTimestamp && rendered.snapshotCreatedAt ? rendered.snapshotCreatedAt : null,
    rendered.controlState.debugSwipeLabel,
  ].filter((item): item is string => Boolean(item)).join(" / ");
  const body = rendered.controlState.hasTracker
    ? rendered.html || `<pre class="ltr-pre">${escapeHtml(rendered.textFallback)}</pre>`
    : "";
  const regenerateButton = settings.showWidgetRegenerateButton
    ? `
      <button
        class="ltr-icon-button${rendered.isRegenerating ? " ltr-spinning" : ""}"
        type="button"
        data-ltracker-action="${escapeHtml(action)}"
        data-message-id="${escapeHtml(rendered.messageId)}"
        data-swipe-key="${escapeHtml(rendered.swipeKey)}"
        data-job-id="${escapeHtml(rendered.activeJobId ?? "")}"
        title="${escapeHtml(actionLabel)}"
        aria-label="${escapeHtml(actionLabel)}"
      >
        ${iconSvg(actionKind)}
      </button>
      <script>
      (() => {
        const messageId = ${safeScriptJson(rendered.messageId)};
        const jobId = ${safeScriptJson(rendered.activeJobId ?? "")};
        document.addEventListener("click", (event) => {
          const button = event.target && event.target.closest ? event.target.closest("[data-ltracker-action]") : null;
          if (!button) return;
          window.parent.postMessage({
            type: "ltracker_widget_action",
            action: button.getAttribute("data-ltracker-action"),
            messageId,
            swipeKey: button.getAttribute("data-swipe-key"),
            jobId
          }, "*");
        });
        const elapsed = document.querySelector("[data-elapsed]");
        const startedAt = ${safeScriptJson(runningSince ?? "")};
        if (elapsed && startedAt) {
          const started = Date.parse(startedAt);
          const tick = () => {
            const ms = Date.now() - started;
            elapsed.textContent = ms < 1000 ? Math.max(0, Math.round(ms)) + "ms" : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + "s";
          };
          tick();
          const timer = setInterval(tick, 250);
          window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
        }
      })();
      </script>`
    : "";
  const elapsedMarkup = settings.showGenerationDuration
    ? rendered.isRegenerating && rendered.generationStartedAt
      ? `<span class="ltr-pill" data-elapsed>${escapeHtml(currentRunningDuration(rendered.generationStartedAt) ?? "0ms")}</span>`
      : duration ? `<span class="ltr-pill">${escapeHtml(duration)}</span>` : ""
    : "";
  const statusMarkup = rendered.isRegenerating ? `<span class="ltr-pill">generating</span>` : rendered.controlState.error ? `<span class="ltr-pill">warning</span>` : "";
  const metaMarkup = meta ? `<span class="ltr-meta">${escapeHtml(meta)}</span>` : "";
  const open = settings.collapsedByDefault ? "" : " open";
  const bodyMarkup = rendered.controlState.hasTracker
    ? `<div class="ltr-body">${body}</div>`
    : "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; color: inherit; font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .ltr-card { border: 1px solid color-mix(in srgb, currentColor 15%, transparent); border-radius: 8px; padding: 6px 8px; background: color-mix(in srgb, currentColor 4%, transparent); }
    details { min-width: 0; }
    summary { cursor: pointer; list-style-position: outside; }
    .ltr-summary { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; width: 100%; }
    .ltr-head { display: flex; min-width: 0; flex-wrap: wrap; gap: 5px 7px; align-items: center; }
    .ltr-title { font-weight: 700; }
    .ltr-meta { opacity: .7; overflow-wrap: anywhere; }
    .ltr-pill { border: 1px solid color-mix(in srgb, currentColor 16%, transparent); border-radius: 999px; padding: 1px 6px; opacity: .78; }
    .ltr-icon-button { width: 26px; height: 26px; display: inline-grid; place-items: center; border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 999px; background: color-mix(in srgb, currentColor 7%, transparent); color: inherit; cursor: pointer; padding: 0; }
    .ltr-icon-button svg { width: 15px; height: 15px; }
    .ltr-icon-button:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
    .ltr-spinning svg { animation: ltr-spin .9s linear infinite; }
    .ltr-body { margin-top: 7px; overflow-wrap: anywhere; }
    .ltr-pre { white-space: pre-wrap; word-break: break-word; margin: 0; font: 12px/1.42 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    @keyframes ltr-spin { to { transform: rotate(360deg); } }
    @media (max-width: 520px) {
      .ltr-card { padding: 5px 7px; }
      .ltr-meta { display: none; }
    }
  </style>
</head>
<body>
  <section class="ltr-card" data-ltracker-message-id="${escapeHtml(rendered.messageId)}">
    <details${open}>
      <summary>
        <span class="ltr-summary">
          <span class="ltr-head">
            <span class="ltr-title">LTracker</span>
            ${metaMarkup}
            ${elapsedMarkup}
            ${statusMarkup}
          </span>
          ${regenerateButton}
        </span>
      </summary>
      ${bodyMarkup}
    </details>
  </section>
</body>
</html>`;
}

export function iconSvg(kind: "refresh" | "stop" | "edit" | "delete" | "generate" | "warning" | "chevron" | "reader"): string {
  if (kind === "stop") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 7h10v10H7z"/></svg>`;
  }
  if (kind === "generate") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Zm6.5 10 1 2.5L22 15.5l-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5ZM5.5 13l1.1 3.1L10 17.2l-3.4 1.2-1.1 3.1-1.1-3.1L1 17.2l3.4-1.1L5.5 13Z"/></svg>`;
  }
  if (kind === "warning") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 1 21h22L12 2Zm1 15h-2v2h2v-2Zm0-8h-2v6h2V9Z"/></svg>`;
  }
  if (kind === "chevron") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m8.6 9.4 3.4 3.4 3.4-3.4L17 11l-5 5-5-5 1.6-1.6Z"/></svg>`;
  }
  if (kind === "edit") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m5 16.2 9.9-9.9 2.8 2.8-9.9 9.9H5v-2.8Zm11.3-11.3 1.1-1.1a1.5 1.5 0 0 1 2.1 0l.7.7a1.5 1.5 0 0 1 0 2.1l-1.1 1.1-2.8-2.8Z"/></svg>`;
  }
  if (kind === "delete") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Zm3 2 .2 7h1.6l-.2-7H10Zm3.4 0-.2 7h1.6l.2-7h-1.6Z"/></svg>`;
  }
  if (kind === "reader") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm0 16H5V5h14v14ZM17 7h-4v2h4V7Zm0 4h-8v2h8v-2Zm0 4H7v2h10v-2Z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.7 6.3A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.67 4.22 1.76L13 11h8V3l-3.3 3.3Z"/></svg>`;
}

function domButton(action: string, label: string, icon: "refresh" | "stop" | "edit" | "delete" | "generate" | "reader", enabled: boolean, extraClass = ""): string {
  if (!enabled) return "";
  return `<button class="ltd-icon-button${extraClass}" type="button" data-ltracker-dom-action="${escapeHtml(action)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${iconSvg(icon)}</button>`;
}

function buildDomHtml(
  rendered: RenderedMessageTrackerRenderable,
  settings: LTrackerMessageDisplaySettings,
): string {
  if (!rendered.controlState.hasTracker && !settings.showGenerateButtonForMissingTracker) return "";
  const duration = settings.showGenerationDuration
    ? formatDurationMs(rendered.generationDurationMs)
    : null;
  const meta = [
    settings.showPresetName && rendered.presetName ? rendered.presetName : null,
    settings.showTimestamp && rendered.snapshotCreatedAt ? rendered.snapshotCreatedAt : null,
    rendered.controlState.debugSwipeLabel,
  ].filter((item): item is string => Boolean(item)).join(" / ");
  const elapsedMarkup = settings.showGenerationDuration
    ? rendered.isRegenerating && rendered.generationStartedAt
      ? `<span class="ltd-pill" data-ltracker-elapsed data-started-at="${escapeHtml(rendered.generationStartedAt)}">${escapeHtml(currentRunningDuration(rendered.generationStartedAt) ?? "0ms")}</span>`
      : duration ? `<span class="ltd-pill">${escapeHtml(duration)}</span>` : ""
    : "";
  const statusMarkup = rendered.isRegenerating
    ? `<span class="ltd-pill" data-ltracker-status>generating</span>`
    : rendered.controlState.error ? `<span class="ltd-pill ltd-warning" data-ltracker-status>warning</span>` : "";
  const editedMarkup = rendered.json.includes("\"editedByUser\": true") ? `<span class="ltd-pill">edited</span>` : "";
  const body = rendered.controlState.hasTracker
    ? rendered.html || `<pre class="ltd-pre">${escapeHtml(rendered.textFallback)}</pre>`
    : "";
  const primaryAction = rendered.isRegenerating
    ? "toggle_regenerate"
    : rendered.controlState.hasTracker ? "toggle_regenerate" : "generate";
  const actionLabel = rendered.isRegenerating
    ? "Cancel tracker generation"
    : rendered.controlState.hasTracker ? "Regenerate tracker" : "Generate tracker";
  const actionKind = rendered.isRegenerating
    ? "stop"
    : rendered.controlState.hasTracker ? "refresh" : "generate";
  const open = settings.collapsedByDefault ? "" : " open";
  const compactClass = settings.compactCollapsedHeader ? " ltd-compact" : "";
  const densityClass = settings.controlDensity === "comfortable" ? " ltd-comfortable" : " ltd-compact-density";
  const placementClass = settings.controlPlacement === "inside_tracker_header" ? " ltd-inside-header" : " ltd-message-header";
  const hasTrackerClass = rendered.controlState.hasTracker ? " ltd-has-tracker" : " ltd-missing-tracker";
  const surfaceClass = settings.displaySurface === "inline_wide"
    ? " ltd-surface-inline-wide ltd-chat-width"
    : settings.displaySurface === "inline_contained"
      ? " ltd-surface-inline-contained"
      : settings.displaySurface === "anchored_popover"
        ? " ltd-surface-popover ltd-overlay-shell"
        : settings.displaySurface === "fullscreen_reader"
          ? " ltd-surface-reader ltd-overlay-shell"
          : " ltd-surface-drawer-only";
  const expandedActions = settings.showExpandedHeaderActions || !rendered.controlState.hasTracker;
  const bodyMarkup = rendered.controlState.hasTracker ? `<div class="ltd-body" style="overflow-x: auto; max-width: 100%;">${body}</div>` : "";
  const footerActions = settings.showBottomActionsInInlineTracker && rendered.controlState.hasTracker
    ? `<div class="ltd-footer-actions" style="display: flex; gap: 4px; justify-content: flex-end; border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent); padding: 5px 7px;">
        ${domButton("toggle_regenerate", actionLabel, actionKind, settings.showWidgetRegenerateButton, rendered.isRegenerating ? " ltd-spinning" : "")}
        ${domButton("edit", "View or edit tracker", "edit", settings.showEditButton)}
        ${domButton("delete", "Delete tracker", "delete", settings.showDeleteButton)}
      </div>`
    : "";
  const titleIcon = rendered.isRegenerating
    ? `<span class="ltd-control-icon ltd-spinning">${iconSvg("refresh")}</span>`
    : rendered.controlState.error
      ? `<span class="ltd-control-icon ltd-warning">${iconSvg("warning")}</span>`
      : `<span class="ltd-control-icon">${rendered.controlState.hasTracker ? iconSvg("chevron") : iconSvg("generate")}</span>`;
  const title = rendered.controlState.hasTracker ? "L" : "";
  const readerButton = rendered.controlState.hasTracker
    ? domButton("reader", "Open fullscreen reader", "reader", true)
    : "";
  return `
<section class="ltracker-dom-tracker${compactClass}${densityClass}${placementClass}${hasTrackerClass}${surfaceClass}" data-ltracker-message-id="${escapeHtml(rendered.messageId)}" data-ltracker-swipe-key="${escapeHtml(rendered.swipeKey)}" data-ltracker-display-surface="${escapeHtml(settings.displaySurface)}" data-ltracker-control-state="${escapeHtml(rendered.controlState.generationStatus)}">
  <details${open}>
    <summary>
      <span class="ltd-summary">
        <span class="ltd-head">
          ${titleIcon}
          ${title ? `<span class="ltd-title">${escapeHtml(title)}</span>` : ""}
          ${meta ? `<span class="ltd-meta">${escapeHtml(meta)}</span>` : ""}
          ${elapsedMarkup}
          ${statusMarkup}
          ${editedMarkup}
        </span>
        <span class="ltd-actions">
          ${readerButton}
          ${domButton(primaryAction, actionLabel, actionKind, settings.showWidgetRegenerateButton || !rendered.controlState.hasTracker, rendered.isRegenerating ? " ltd-spinning" : "")}
          ${rendered.controlState.hasTracker && expandedActions ? domButton("edit", "View or edit tracker", "edit", settings.showEditButton) : ""}
          ${rendered.controlState.hasTracker && expandedActions ? domButton("delete", "Delete tracker", "delete", settings.showDeleteButton) : ""}
        </span>
      </span>
    </summary>
    ${bodyMarkup}
    ${footerActions}
  </details>
</section>`;
}

export function renderMessageTracker(input: RenderMessageTrackerInput): RenderedMessageTracker {
  const snapshot = snapshotForDisplay(input);
  const metadata = metadataFromSnapshot(input.attachedSnapshot, snapshot);
  const generationMetadata = generationMetadataFromSnapshot(snapshot, input);
  const identity = identityFromInput(input);
  const presetResolution = renderPresetResolution(input, snapshot);
  const renderPreset = presetResolution?.preset ?? (snapshot ? null : input.preset);
  const renderPresetFields = {
    renderPresetSource: presetResolution?.source ?? null,
    renderPresetWarning: presetResolution?.warning ?? null,
    renderPresetFallbackReason: presetResolution?.fallbackReason ?? null,
    renderPresetMismatchDetected: presetResolution?.mismatchDetected ?? false,
    renderLockedPresetId: presetResolution?.lockedPresetId ?? null,
    renderLockedPresetName: presetResolution?.lockedPresetName ?? null,
    renderLockedPresetVersion: presetResolution?.lockedPresetVersion ?? null,
  };
  if (!snapshot) {
    const textFallback = "No tracker snapshot is available for this message.";
    const base = {
      messageId: input.messageId,
      messageIndex: input.messageIndex,
      swipeKey: identity.swipeKey,
      swipeIndex: identity.swipeIndex,
      swipeId: identity.swipeId,
      swipeContentHash: identity.swipeContentHash,
      swipeKeySource: identity.swipeKeySource,
      ...metadata,
      ...renderPresetFields,
      ...generationMetadata,
      renderMode: input.settings.renderMode,
      html: "",
      textFallback,
      json: "",
      warnings: [],
      errors: [textFallback],
    };
    const renderable = {
      ...base,
      controlState: buildControlState(base, input.settings, false, []),
    };
    return {
      ...renderable,
      widgetHtml: buildWidgetHtml(renderable, input.settings),
      domHtml: buildDomHtml(renderable, input.settings),
    };
  }

  const warnings: string[] = presetResolution?.warning ? [presetResolution.warning] : [];
  const errors: string[] = [];
  const json = displayJson(input.messageId, input.messageIndex, input.attachedSnapshot, snapshot, input.settings);
  let html = "";
  let textFallback = truncateSafe(formatTemplateTextFallback(snapshot.data), input.settings.maxRenderedChars);

  if (input.settings.renderMode === "pretty_json") {
    textFallback = json;
    html = `<pre class="ltr-pre">${escapeHtml(json)}</pre>`;
  } else if (input.settings.renderMode === "compact_text") {
    const source = input.attachedSnapshot ?? snapshot;
    textFallback = formatSnapshotForInjection(source, injectionSettings(input.settings));
    html = `<pre class="ltr-pre">${escapeHtml(textFallback)}</pre>`;
  } else if (!renderPreset) {
    textFallback = json;
    html = `<pre class="ltr-pre">${escapeHtml(json)}</pre>`;
  } else {
    const template = renderPreset.htmlTemplate ?? "";
    const result = renderHtmlTemplate({
      template,
      snapshotData: snapshot.data,
      presetId: renderPreset.id,
      presetName: renderPreset.name,
    }, {
      missingValuePlaceholder: "",
      maxRenderedChars: input.settings.maxRenderedChars,
      allowInlineStyles: input.settings.allowInlineStyles,
      templateTrustMode: input.settings.allowInlineStyles ? "trusted" : "safe",
      deduplicateWarnings: input.settings.deduplicateRenderWarnings,
      maxWarnings: input.settings.showRenderWarningsInDiagnosticsOnly ? 8 : 20,
    });
    warnings.push(...result.warnings);
    errors.push(...result.errors);
    textFallback = result.textFallback;
    html = result.html || `<pre class="ltr-pre">${escapeHtml(result.textFallback)}</pre>`;
  }

  const base = {
    messageId: input.messageId,
    messageIndex: input.messageIndex,
    swipeKey: identity.swipeKey,
    swipeIndex: identity.swipeIndex,
    swipeId: identity.swipeId,
    swipeContentHash: identity.swipeContentHash,
    swipeKeySource: identity.swipeKeySource,
    ...metadata,
    ...renderPresetFields,
    ...generationMetadata,
    renderMode: input.settings.renderMode,
    html,
    textFallback,
    json,
    warnings,
    errors,
  };
  const renderable = {
    ...base,
    controlState: buildControlState(base, input.settings, true, errors),
  };
  return {
    ...renderable,
    widgetHtml: buildWidgetHtml(renderable, input.settings),
    domHtml: buildDomHtml(renderable, input.settings),
  };
}

export function buildMessageTrackerHistory(input: BuildMessageTrackerHistoryInput): MessageTrackerHistoryEntry[] {
  const filteredIndex = input.selectedSwipeIdentities
    ? input.index.filter((entry) => {
        const selected = input.selectedSwipeIdentities?.[entry.messageId];
        return !selected || selected.swipeKey === entry.swipeKey;
      })
    : input.index;
  return filteredIndex.map((entry) => {
    const originalIndex = input.index.findIndex((item) => swipeIdentityKey(item) === swipeIdentityKey(entry));
    const snapshot = input.snapshots[originalIndex] ?? null;
    const activeJob = input.activeWidgetJobs?.[swipeIdentityKey(entry)] ?? null;
    return {
      indexEntry: entry,
      snapshot,
      rendered: renderMessageTracker({
        messageId: entry.messageId,
        messageIndex: entry.messageIndex,
        attachedSnapshot: snapshot,
        latestChatSnapshot: input.latestChatSnapshot,
        preset: input.preset,
        presets: input.presets ?? [input.preset],
        activePreset: input.preset,
        settings: input.settings,
        swipeIdentity: {
          chatId: snapshot?.chatId ?? input.latestChatSnapshot?.chatId ?? "",
          messageId: entry.messageId,
          swipeKey: entry.swipeKey,
          swipeIndex: entry.swipeIndex,
          swipeId: entry.swipeId,
          swipeContentHash: entry.swipeContentHash,
          swipeKeySource: entry.swipeKeySource,
        },
        isRegenerating: Boolean(activeJob),
        activeJobId: activeJob?.jobId ?? null,
        activeJobStartedAt: activeJob?.startedAt ?? null,
      }),
    };
  });
}

function historyEntryTime(entry: MessageTrackerHistoryEntry): number {
  const value = entry.snapshot?.attachedAt
    ?? entry.snapshot?.snapshot.createdAt
    ?? entry.indexEntry.createdAt;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function groupMessageTrackerHistory(
  entries: MessageTrackerHistoryEntry[],
  showDuplicates = false,
): MessageTrackerHistoryGroupingResult {
  const groups = new Map<string, MessageTrackerHistoryEntry[]>();
  for (const entry of entries) {
    const key = swipeIdentityKey(entry.indexEntry);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  let duplicateCount = 0;
  const grouped: MessageTrackerHistoryEntry[] = [];
  for (const group of groups.values()) {
    const sorted = group.sort((left, right) => historyEntryTime(right) - historyEntryTime(left));
    duplicateCount += Math.max(0, sorted.length - 1);
    if (showDuplicates) {
      grouped.push(...sorted);
    } else if (sorted[0]) {
      grouped.push(sorted[0]);
    }
  }
  grouped.sort((left, right) => {
    if (left.indexEntry.messageIndex !== null && right.indexEntry.messageIndex !== null && left.indexEntry.messageIndex !== right.indexEntry.messageIndex) {
      return left.indexEntry.messageIndex - right.indexEntry.messageIndex;
    }
    return historyEntryTime(right) - historyEntryTime(left);
  });
  return {
    entries: grouped,
    groupedCount: groups.size,
    duplicateCount,
  };
}

export function claimMessageWidget(registry: Set<string>, messageId: string): boolean {
  const key = `${messageId}:${MESSAGE_WIDGET_ID}`;
  if (registry.has(key)) return false;
  registry.add(key);
  return true;
}
