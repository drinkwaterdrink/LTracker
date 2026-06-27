import type {
  ChatMessageDTO,
  LlmMessageDTO,
  SpindleAPI,
} from "lumiverse-spindle-types";
import { parseTrackerJson } from "./shared/parser";
import { snapshotPath } from "./shared/storageKeys";
import {
  buildCompactTranscript,
  buildTrackerPrompt,
} from "./shared/trackerPrompt";
import {
  EXTENSION_VERSION,
  STORAGE_SCHEMA_VERSION,
  type BackendMessage,
  type FrontendMessage,
  type FrontendState,
  type PermissionState,
  type TrackerSnapshot,
  type TranscriptMessage,
} from "./shared/types";

declare const spindle: SpindleAPI;

const RECENT_MESSAGE_LIMIT = 24;
const GENERATION_TIMEOUT_MS = 45_000;
const activeJobs = new Map<string, AbortController>();
let disposed = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFrontendMessage(payload: unknown): payload is FrontendMessage {
  if (!isRecord(payload) || typeof payload.type !== "string") return false;
  if (!["ready", "refresh_state", "generate_tracker"].includes(payload.type)) return false;
  if ("chatId" in payload && payload.chatId !== null && typeof payload.chatId !== "string") return false;
  if (payload.type === "generate_tracker" && typeof payload.requestId !== "string") return false;
  return true;
}

function permissionState(): PermissionState {
  return {
    generation: spindle.permissions.has("generation"),
    chats: spindle.permissions.has("chats"),
    chatMutation: spindle.permissions.has("chat_mutation"),
  };
}

function send(payload: BackendMessage, userId: string): void {
  if (!disposed) spindle.sendToFrontend(payload, userId);
}

async function loadSnapshot(chatId: string | null, userId: string): Promise<TrackerSnapshot | null> {
  if (!chatId) return null;
  return spindle.userStorage.getJson<TrackerSnapshot | null>(snapshotPath(chatId), {
    fallback: null,
    userId,
  });
}

async function buildState(
  chatId: string | null,
  userId: string,
  status: FrontendState["status"],
  error: string | null,
): Promise<FrontendState> {
  return {
    version: EXTENSION_VERSION,
    status,
    chatId,
    snapshot: await loadSnapshot(chatId, userId),
    error,
    permissions: permissionState(),
  };
}

async function sendState(
  chatId: string | null,
  userId: string,
  status: FrontendState["status"] = "idle",
  error: string | null = null,
  requestId?: string,
): Promise<void> {
  const message: BackendMessage = {
    type: "state",
    state: await buildState(chatId, userId, status, error),
  };
  if (requestId) message.requestId = requestId;
  send(message, userId);
}

function ensurePermission(permission: keyof PermissionState, label: string): void {
  if (!permissionState()[permission]) {
    throw new Error(`Missing permission: ${label}.`);
  }
}

async function resolveActiveChatId(chatId: string | null, userId: string): Promise<string> {
  if (chatId) return chatId;
  ensurePermission("chats", "chats is required to resolve the active chat");
  if (!spindle.chats?.getActive) {
    throw new Error("Lumiverse active chat API is unavailable.");
  }
  const active = await spindle.chats.getActive(userId);
  if (!active?.id) throw new Error("No active chat is open.");
  return active.id;
}

async function getRecentMessages(chatId: string): Promise<ChatMessageDTO[]> {
  ensurePermission("chatMutation", "chat_mutation is required to read recent chat messages");
  if (!spindle.chat?.getMessages) {
    throw new Error("Lumiverse chat message API is unavailable.");
  }
  const messages = await spindle.chat.getMessages(chatId);
  return messages.slice(-RECENT_MESSAGE_LIMIT);
}

function normalizeMessages(messages: ChatMessageDTO[]): TranscriptMessage[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      index: message.index_in_chat,
      role: message.is_user ? "user" : "assistant",
      name: message.name ?? "",
      content: message.content,
    }));
}

function normalizeGenerationText(result: unknown): string {
  if (typeof result === "string" && result.trim()) return result;
  if (!isRecord(result)) {
    throw new Error("Lumiverse generation returned an unsupported response.");
  }

  for (const key of ["content", "text", "output", "response"]) {
    const value = result[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  const message = result.message;
  if (typeof message === "string" && message.trim()) return message;
  if (isRecord(message) && typeof message.content === "string" && message.content.trim()) {
    return message.content;
  }

  throw new Error("Lumiverse generation completed without textual content.");
}

async function runTrackerGeneration(messages: LlmMessageDTO[], userId: string): Promise<string> {
  ensurePermission("generation", "generation is required to call the active/default model");
  if (!spindle.generate?.quiet) {
    throw new Error("Lumiverse quiet generation API is unavailable.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  try {
    const result = await spindle.generate.quiet({
      type: "quiet",
      messages,
      reasoning: { source: "off" },
      userId,
      signal: controller.signal,
    });
    return normalizeGenerationText(result);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Tracker generation timed out after ${Math.round(GENERATION_TIMEOUT_MS / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function saveSnapshot(snapshot: TrackerSnapshot, userId: string): Promise<void> {
  await spindle.userStorage.setJson(snapshotPath(snapshot.chatId), snapshot, {
    indent: 2,
    userId,
  });
}

async function generateTracker(chatId: string | null, userId: string, requestId: string): Promise<void> {
  const resolvedChatId = await resolveActiveChatId(chatId, userId);

  const existing = activeJobs.get(resolvedChatId);
  existing?.abort();

  const job = new AbortController();
  activeJobs.set(resolvedChatId, job);

  try {
    await sendState(resolvedChatId, userId, "generating", null, requestId);
    const rawMessages = await getRecentMessages(resolvedChatId);
    const transcriptMessages = normalizeMessages(rawMessages);
    if (transcriptMessages.length === 0) {
      throw new Error("This chat has no readable messages to track.");
    }

    const transcript = buildCompactTranscript(transcriptMessages);
    const prompt = buildTrackerPrompt(transcript);
    const rawOutput = await runTrackerGeneration(prompt, userId);

    if (job.signal.aborted) return;

    const data = parseTrackerJson(rawOutput);
    const snapshot: TrackerSnapshot = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      extensionVersion: EXTENSION_VERSION,
      chatId: resolvedChatId,
      createdAt: new Date().toISOString(),
      messageCount: transcriptMessages.length,
      sourceMessageIds: rawMessages.map((message) => message.id),
      data,
    };

    await saveSnapshot(snapshot, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId);
  } finally {
    if (activeJobs.get(resolvedChatId) === job) activeJobs.delete(resolvedChatId);
  }
}

spindle.onFrontendMessage((payload, userId) => {
  if (!isFrontendMessage(payload)) return;

  const chatId = payload.chatId;
  const requestId = payload.type === "generate_tracker" ? payload.requestId : undefined;

  void (async () => {
    try {
      if (payload.type === "generate_tracker") {
        await generateTracker(chatId, userId, payload.requestId);
      } else {
        const resolvedChatId = chatId ? chatId : await resolveActiveChatId(chatId, userId).catch(() => null);
        await sendState(resolvedChatId, userId, "idle", null, requestId);
      }
    } catch (error) {
      const message = errorMessage(error);
      spindle.log.warn(`LTracker request failed: ${message}`);
      const state = await buildState(chatId, userId, "error", message);
      const response: BackendMessage = { type: "error", message, state };
      if (requestId) response.requestId = requestId;
      send(response, userId);
    }
  })();
});

spindle.log.info("LTracker backend loaded.");
