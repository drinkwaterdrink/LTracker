// src/shared/parser.ts
function normalizeJsonText(raw) {
  return raw.trim().replace(/^\uFEFF/, "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}
function stripCodeFence(raw) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}
function removeTrailingCommas(raw) {
  return raw.replace(/,\s*([}\]])/g, "$1");
}
function extractBalancedObject(raw) {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return raw.slice(start, index + 1);
    }
  }
  return null;
}
function parseObject(candidate) {
  const parsed = JSON.parse(candidate);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Tracker output must be a JSON object.");
  }
  return parsed;
}
function parseTrackerJson(raw) {
  if (!raw.trim()) throw new Error("Tracker generation returned empty output.");
  const candidates = [
    normalizeJsonText(raw),
    stripCodeFence(normalizeJsonText(raw)),
    extractBalancedObject(stripCodeFence(normalizeJsonText(raw))) ?? ""
  ].filter((candidate) => candidate.trim().length > 0);
  const repaired = candidates.flatMap((candidate) => [
    candidate,
    removeTrailingCommas(candidate)
  ]);
  let lastError = null;
  for (const candidate of repaired) {
    try {
      return parseObject(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Tracker output was not valid JSON after basic repair. ${detail}`);
}

// src/shared/storageKeys.ts
function encodeStorageSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => {
    return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}
function snapshotPath(chatId) {
  return `chats/${encodeStorageSegment(chatId)}/latest-snapshot.json`;
}

// src/shared/defaultSchema.ts
var DEFAULT_TRACKER_SCHEMA = {
  scene: {
    time: "",
    date: "",
    location: "",
    weather: "",
    mood: "",
    danger_level: ""
  },
  characters_present: [
    {
      name: "",
      role: "",
      physical_state: "",
      emotional_state: "",
      outfit: "",
      current_goal: "",
      secrets_or_tension: ""
    }
  ],
  relationships: [
    {
      a: "",
      b: "",
      status: "",
      recent_change: ""
    }
  ],
  inventory_and_assets: [],
  active_threads: [],
  unresolved_continuity: [],
  important_facts: [],
  next_scene_pressure: ""
};
function defaultTrackerSchemaJson() {
  return JSON.stringify(DEFAULT_TRACKER_SCHEMA, null, 2);
}

// src/shared/trackerPrompt.ts
var MAX_MESSAGE_CHARS = 8e3;
function buildCompactTranscript(messages) {
  return messages.map((message) => {
    const role = message.role === "user" ? "USER" : "ASSISTANT";
    const name = message.name ? ` ${message.name}` : "";
    const content = message.content.trim().slice(0, MAX_MESSAGE_CHARS);
    return `[${message.index} ${role}${name}]
${content}`;
  }).join("\n\n");
}
function buildTrackerPrompt(transcript) {
  return [
    {
      role: "system",
      content: [
        "You extract the current state of an ongoing roleplay or story chat.",
        "Return JSON only. Do not wrap the JSON in Markdown.",
        "Do not invent facts unsupported by the transcript.",
        "Preserve character names exactly when possible.",
        "Summarize only the current and relevant state, not every past event.",
        'Use empty strings, empty arrays, or "unknown" for unknown fields.'
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "Fill this tracker schema from the transcript.",
        "",
        "Tracker schema:",
        defaultTrackerSchemaJson(),
        "",
        "Transcript:",
        transcript,
        "",
        "Return only a JSON object matching the schema shape."
      ].join("\n")
    }
  ];
}

// src/shared/types.ts
var EXTENSION_VERSION = "0.01";
var STORAGE_SCHEMA_VERSION = 1;

// src/backend.ts
var RECENT_MESSAGE_LIMIT = 24;
var GENERATION_TIMEOUT_MS = 45e3;
var activeJobs = /* @__PURE__ */ new Map();
var disposed = false;
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function isFrontendMessage(payload) {
  if (!isRecord(payload) || typeof payload.type !== "string") return false;
  if (!["ready", "refresh_state", "generate_tracker"].includes(payload.type)) return false;
  if ("chatId" in payload && payload.chatId !== null && typeof payload.chatId !== "string") return false;
  if (payload.type === "generate_tracker" && typeof payload.requestId !== "string") return false;
  return true;
}
function permissionState() {
  return {
    generation: spindle.permissions.has("generation"),
    chats: spindle.permissions.has("chats"),
    chatMutation: spindle.permissions.has("chat_mutation")
  };
}
function send(payload, userId) {
  if (!disposed) spindle.sendToFrontend(payload, userId);
}
async function loadSnapshot(chatId, userId) {
  if (!chatId) return null;
  return spindle.userStorage.getJson(snapshotPath(chatId), {
    fallback: null,
    userId
  });
}
async function buildState(chatId, userId, status, error) {
  return {
    version: EXTENSION_VERSION,
    status,
    chatId,
    snapshot: await loadSnapshot(chatId, userId),
    error,
    permissions: permissionState()
  };
}
async function sendState(chatId, userId, status = "idle", error = null, requestId) {
  const message = {
    type: "state",
    state: await buildState(chatId, userId, status, error)
  };
  if (requestId) message.requestId = requestId;
  send(message, userId);
}
function ensurePermission(permission, label) {
  if (!permissionState()[permission]) {
    throw new Error(`Missing permission: ${label}.`);
  }
}
async function resolveActiveChatId(chatId, userId) {
  if (chatId) return chatId;
  ensurePermission("chats", "chats is required to resolve the active chat");
  if (!spindle.chats?.getActive) {
    throw new Error("Lumiverse active chat API is unavailable.");
  }
  const active = await spindle.chats.getActive(userId);
  if (!active?.id) throw new Error("No active chat is open.");
  return active.id;
}
async function getRecentMessages(chatId) {
  ensurePermission("chatMutation", "chat_mutation is required to read recent chat messages");
  if (!spindle.chat?.getMessages) {
    throw new Error("Lumiverse chat message API is unavailable.");
  }
  const messages = await spindle.chat.getMessages(chatId);
  return messages.slice(-RECENT_MESSAGE_LIMIT);
}
function normalizeMessages(messages) {
  return messages.filter((message) => message.content.trim().length > 0).map((message) => ({
    index: message.index_in_chat,
    role: message.is_user ? "user" : "assistant",
    name: message.name ?? "",
    content: message.content
  }));
}
function normalizeGenerationText(result) {
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
async function runTrackerGeneration(messages, userId) {
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
      signal: controller.signal
    });
    return normalizeGenerationText(result);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Tracker generation timed out after ${Math.round(GENERATION_TIMEOUT_MS / 1e3)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function saveSnapshot(snapshot, userId) {
  await spindle.userStorage.setJson(snapshotPath(snapshot.chatId), snapshot, {
    indent: 2,
    userId
  });
}
async function generateTracker(chatId, userId, requestId) {
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
    const snapshot = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      extensionVersion: EXTENSION_VERSION,
      chatId: resolvedChatId,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      messageCount: transcriptMessages.length,
      sourceMessageIds: rawMessages.map((message) => message.id),
      data
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
  const requestId = payload.type === "generate_tracker" ? payload.requestId : void 0;
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
      const response = { type: "error", message, state };
      if (requestId) response.requestId = requestId;
      send(response, userId);
    }
  })();
});
spindle.log.info("LTracker backend loaded.");
