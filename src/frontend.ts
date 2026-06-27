import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type {
  BackendMessage,
  FrontendMessage,
  FrontendState,
} from "./shared/types";
import { EXTENSION_VERSION } from "./shared/types";

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
.ltracker-actions {
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
  cursor: wait;
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
.ltracker-json {
  margin: 0;
  max-height: 52vh;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.82rem;
  line-height: 1.45;
}
@media (max-width: 520px) {
  .ltracker-shell {
    padding: 10px;
  }
  .ltracker-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .ltracker-actions {
    width: 100%;
  }
  .ltracker-button {
    flex: 1 1 140px;
  }
}
`;

function emptyState(): FrontendState {
  return {
    version: EXTENSION_VERSION,
    status: "idle",
    chatId: null,
    snapshot: null,
    error: null,
    permissions: {
      generation: false,
      chats: false,
      chatMutation: false,
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

function labelForStatus(status: FrontendState["status"]): string {
  if (status === "generating") return "generating";
  if (status === "error") return "error";
  return "idle";
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
    const chatId = activeChatId();
    send({
      type: "generate_tracker",
      chatId,
      requestId: `generate:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    });
  }

  function render(): void {
    inputAction.setEnabled(state.status !== "generating");
    const canGenerate = state.status !== "generating";
    const snapshot = state.snapshot
      ? JSON.stringify(state.snapshot.data, null, 2)
      : "No tracker snapshot saved for this chat yet.";
    const error = state.error ? escapeHtml(state.error) : "None";
    const permissionText = [
      state.permissions.generation ? "generation granted" : "generation missing",
      state.permissions.chats ? "chats granted" : "chats missing",
      state.permissions.chatMutation ? "chat_mutation granted" : "chat_mutation missing",
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
          <button class="ltracker-button" type="button" data-action="generate" ${canGenerate ? "" : "disabled"}>
            Generate Tracker
          </button>
          <button class="ltracker-button" type="button" data-action="refresh">
            Refresh
          </button>
        </div>

        <section class="ltracker-panel">
          <span class="ltracker-label">Active chat</span>
          <div>${state.chatId ? escapeHtml(state.chatId) : "No active chat"}</div>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Permissions</span>
          <div>${escapeHtml(permissionText)}</div>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Latest error</span>
          <div class="ltracker-error">${error}</div>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Latest tracker snapshot</span>
          <pre class="ltracker-json">${escapeHtml(snapshot)}</pre>
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
        error: payload.message,
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
