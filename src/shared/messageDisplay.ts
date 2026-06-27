import {
  escapeHtml,
  formatTemplateTextFallback,
  renderHtmlTemplate,
} from "./htmlTemplateRenderer";
import { formatSnapshotForInjection, truncateSafe } from "./snapshotFormat";
import type {
  LTrackerInjectionSettings,
  LTrackerMessageDisplaySettings,
  MessageAttachedSnapshot,
  MessageSnapshotIndexEntry,
  MessageTrackerHistoryEntry,
  RenderedMessageTracker,
  TrackerSchemaPreset,
  TrackerSnapshot,
} from "./types";

export const MESSAGE_LOCAL_UI_SUPPORTED = true;
export const MESSAGE_LOCAL_UI_FALLBACK_REASON: string | null = null;
export const MESSAGE_WIDGET_ID = "ltracker-message-tracker";
export const MESSAGE_WIDGET_PLACEMENT_REASON =
  "lumiverse-spindle-types@0.5.21 exposes ctx.messages.renderWidget() as a below-message widget surface and does not expose a top-placement option.";

interface RenderMessageTrackerInput {
  messageId: string;
  messageIndex: number | null;
  attachedSnapshot: MessageAttachedSnapshot | null;
  latestChatSnapshot: TrackerSnapshot | null;
  preset: TrackerSchemaPreset;
  settings: LTrackerMessageDisplaySettings;
  isRegenerating?: boolean;
  activeJobId?: string | null;
  activeJobStartedAt?: string | null;
}

interface BuildMessageTrackerHistoryInput {
  index: MessageSnapshotIndexEntry[];
  snapshots: Array<MessageAttachedSnapshot | null>;
  latestChatSnapshot: TrackerSnapshot | null;
  preset: TrackerSchemaPreset;
  settings: LTrackerMessageDisplaySettings;
  activeWidgetJobs?: Record<string, { jobId: string; startedAt: string | null }>;
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

function injectionSettings(settings: LTrackerMessageDisplaySettings): LTrackerInjectionSettings {
  return {
    enabled: true,
    mode: "latest_message_snapshot",
    format: "compact",
    maxInjectedChars: settings.maxRenderedChars,
    includeHeader: false,
    includeTimestamp: false,
    includeSourceMessageId: false,
    onlyInjectWhenSnapshotExists: true,
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

function currentRunningDuration(startedAt: string | null): string | null {
  if (!startedAt) return null;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return null;
  return formatDurationMs(Date.now() - startedMs);
}

function buildWidgetHtml(
  rendered: Omit<RenderedMessageTracker, "widgetHtml">,
  settings: LTrackerMessageDisplaySettings,
): string {
  const duration = settings.showGenerationDuration
    ? formatDurationMs(rendered.generationDurationMs)
    : null;
  const runningSince = rendered.isRegenerating ? rendered.generationStartedAt : null;
  const actionLabel = rendered.isRegenerating ? "Cancel tracker generation" : "Regenerate tracker";
  const meta = [
    settings.showPresetName && rendered.presetName ? rendered.presetName : null,
    settings.showTimestamp && rendered.snapshotCreatedAt ? rendered.snapshotCreatedAt : null,
  ].filter((item): item is string => Boolean(item)).join(" / ");
  const body = rendered.html || `<pre class="ltr-pre">${escapeHtml(rendered.textFallback)}</pre>`;
  const regenerateButton = settings.showWidgetRegenerateButton
    ? `
      <button
        class="ltr-icon-button${rendered.isRegenerating ? " ltr-spinning" : ""}"
        type="button"
        data-ltracker-action="regenerate"
        data-message-id="${escapeHtml(rendered.messageId)}"
        data-job-id="${escapeHtml(rendered.activeJobId ?? "")}"
        title="${escapeHtml(actionLabel)}"
        aria-label="${escapeHtml(actionLabel)}"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M17.7 6.3A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.67 4.22 1.76L13 11h8V3l-3.3 3.3Z"/>
        </svg>
      </button>
      <script>
      (() => {
        const messageId = ${safeScriptJson(rendered.messageId)};
        const jobId = ${safeScriptJson(rendered.activeJobId ?? "")};
        document.addEventListener("click", (event) => {
          const button = event.target && event.target.closest ? event.target.closest("[data-ltracker-action='regenerate']") : null;
          if (!button) return;
          window.parent.postMessage({
            type: "ltracker_widget_action",
            action: "toggle_regenerate",
            messageId,
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
  const statusMarkup = rendered.isRegenerating ? `<span class="ltr-pill">generating</span>` : "";
  const metaMarkup = meta ? `<span class="ltr-meta">${escapeHtml(meta)}</span>` : "";
  const open = settings.collapsedByDefault ? "" : " open";
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
      <div class="ltr-body">${body}</div>
    </details>
  </section>
</body>
</html>`;
}

export function renderMessageTracker(input: RenderMessageTrackerInput): RenderedMessageTracker {
  const snapshot = snapshotForDisplay(input);
  const metadata = metadataFromSnapshot(input.attachedSnapshot, snapshot);
  const generationMetadata = generationMetadataFromSnapshot(snapshot, input);
  if (!snapshot) {
    const textFallback = "No tracker snapshot is available for this message.";
    const base = {
      messageId: input.messageId,
      messageIndex: input.messageIndex,
      ...metadata,
      ...generationMetadata,
      renderMode: input.settings.renderMode,
      html: "",
      textFallback,
      json: "",
      warnings: [],
      errors: [textFallback],
    };
    return {
      ...base,
      widgetHtml: buildWidgetHtml(base, input.settings),
    };
  }

  const warnings: string[] = [];
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
  } else {
    const template = input.preset.htmlTemplate ?? "";
    const result = renderHtmlTemplate({
      template,
      snapshotData: snapshot.data,
      presetId: input.preset.id,
      presetName: input.preset.name,
    }, {
      missingValuePlaceholder: "",
      maxRenderedChars: input.settings.maxRenderedChars,
      allowInlineStyles: false,
    });
    warnings.push(...result.warnings);
    errors.push(...result.errors);
    textFallback = result.textFallback;
    html = result.html || `<pre class="ltr-pre">${escapeHtml(result.textFallback)}</pre>`;
  }

  const base = {
    messageId: input.messageId,
    messageIndex: input.messageIndex,
    ...metadata,
    ...generationMetadata,
    renderMode: input.settings.renderMode,
    html,
    textFallback,
    json,
    warnings,
    errors,
  };
  return {
    ...base,
    widgetHtml: buildWidgetHtml(base, input.settings),
  };
}

export function buildMessageTrackerHistory(input: BuildMessageTrackerHistoryInput): MessageTrackerHistoryEntry[] {
  return input.index.map((entry, index) => {
    const snapshot = input.snapshots[index] ?? null;
    const activeJob = input.activeWidgetJobs?.[entry.messageId] ?? null;
    return {
      indexEntry: entry,
      snapshot,
      rendered: renderMessageTracker({
        messageId: entry.messageId,
        messageIndex: entry.messageIndex,
        attachedSnapshot: snapshot,
        latestChatSnapshot: input.latestChatSnapshot,
        preset: input.preset,
        settings: input.settings,
        isRegenerating: Boolean(activeJob),
        activeJobId: activeJob?.jobId ?? null,
        activeJobStartedAt: activeJob?.startedAt ?? null,
      }),
    };
  });
}

export function claimMessageWidget(registry: Set<string>, messageId: string): boolean {
  const key = `${messageId}:${MESSAGE_WIDGET_ID}`;
  if (registry.has(key)) return false;
  registry.add(key);
  return true;
}
