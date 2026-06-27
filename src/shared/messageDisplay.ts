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

interface RenderMessageTrackerInput {
  messageId: string;
  messageIndex: number | null;
  attachedSnapshot: MessageAttachedSnapshot | null;
  latestChatSnapshot: TrackerSnapshot | null;
  preset: TrackerSchemaPreset;
  settings: LTrackerMessageDisplaySettings;
}

interface BuildMessageTrackerHistoryInput {
  index: MessageSnapshotIndexEntry[];
  snapshots: Array<MessageAttachedSnapshot | null>;
  latestChatSnapshot: TrackerSnapshot | null;
  preset: TrackerSchemaPreset;
  settings: LTrackerMessageDisplaySettings;
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
    data: snapshot.data,
  }, null, 2), settings.maxRenderedChars);
}

function safeScriptJson(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003C");
}

function buildWidgetHtml(
  rendered: Omit<RenderedMessageTracker, "widgetHtml">,
  settings: LTrackerMessageDisplaySettings,
): string {
  const titleParts = [
    "LTracker",
    settings.showPresetName && rendered.presetName ? rendered.presetName : null,
    settings.showTimestamp && rendered.snapshotCreatedAt ? rendered.snapshotCreatedAt : null,
  ].filter((item): item is string => Boolean(item));
  const meta = [
    rendered.messageIndex !== null ? `message #${rendered.messageIndex}` : null,
    `id ${rendered.messageId}`,
  ].filter((item): item is string => Boolean(item)).join(" / ");
  const body = rendered.html || `<pre class="ltr-pre">${escapeHtml(rendered.textFallback)}</pre>`;
  const copyButtons = settings.showCopyButton
    ? `
      <div class="ltr-actions">
        <button type="button" data-copy="json">Copy JSON</button>
        <button type="button" data-copy="html">Copy HTML</button>
        <button type="button" data-copy="text">Copy Text</button>
      </div>
      <script>
      (() => {
        const payloads = {
          json: ${safeScriptJson(rendered.json)},
          html: ${safeScriptJson(rendered.html)},
          text: ${safeScriptJson(rendered.textFallback)}
        };
        document.addEventListener("click", async (event) => {
          const button = event.target && event.target.closest ? event.target.closest("[data-copy]") : null;
          if (!button) return;
          const value = payloads[button.dataset.copy] || "";
          if (!value || !navigator.clipboard) return;
          const original = button.textContent;
          try {
            await navigator.clipboard.writeText(value);
            button.textContent = "Copied";
            setTimeout(() => { button.textContent = original; }, 1200);
          } catch {
            button.textContent = "Copy failed";
            setTimeout(() => { button.textContent = original; }, 1200);
          }
        });
      })();
      </script>`
    : "";
  const open = settings.collapsedByDefault ? "" : " open";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; color: inherit; font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .ltr-card { border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; padding: 8px 10px; background: color-mix(in srgb, currentColor 5%, transparent); }
    summary { cursor: pointer; list-style-position: outside; }
    .ltr-summary { display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
    .ltr-title { font-weight: 700; }
    .ltr-meta { opacity: .72; font-size: 12px; }
    .ltr-body { margin-top: 8px; overflow-wrap: anywhere; }
    .ltr-pre { white-space: pre-wrap; word-break: break-word; margin: 0; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .ltr-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    button { border: 1px solid color-mix(in srgb, currentColor 24%, transparent); border-radius: 7px; background: color-mix(in srgb, currentColor 8%, transparent); color: inherit; cursor: pointer; min-height: 28px; padding: 4px 8px; font: inherit; }
  </style>
</head>
<body>
  <section class="ltr-card" data-ltracker-message-id="${escapeHtml(rendered.messageId)}">
    <details${open}>
      <summary>
        <span class="ltr-summary">
          <span class="ltr-title">${escapeHtml(titleParts.join(" - "))}</span>
          <span class="ltr-meta">${escapeHtml(meta)}</span>
        </span>
      </summary>
      <div class="ltr-body">${body}</div>
      ${copyButtons}
    </details>
  </section>
</body>
</html>`;
}

export function renderMessageTracker(input: RenderMessageTrackerInput): RenderedMessageTracker {
  const snapshot = snapshotForDisplay(input);
  const metadata = metadataFromSnapshot(input.attachedSnapshot, snapshot);
  if (!snapshot) {
    const textFallback = "No tracker snapshot is available for this message.";
    const base = {
      messageId: input.messageId,
      messageIndex: input.messageIndex,
      ...metadata,
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
