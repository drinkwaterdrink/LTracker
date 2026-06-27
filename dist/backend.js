// src/shared/auto.ts
function isQuietGenerationType(generationType) {
  return typeof generationType === "string" && generationType.toLowerCase() === "quiet";
}
function shouldScheduleAutoTracker(input) {
  const { settings, role } = input;
  if (!settings.auto.autoModeEnabled) {
    return { shouldSchedule: false, reason: "Auto mode is disabled." };
  }
  if (input.trackerGenerationRunning) {
    return { shouldSchedule: false, reason: "A tracker generation is already running for this chat." };
  }
  if (input.messageCount <= settings.auto.skipFirstMessages) {
    return { shouldSchedule: false, reason: `Skipped before message ${settings.auto.skipFirstMessages + 1}.` };
  }
  if (settings.auto.onlyWhenChatActive && input.activeChatId !== input.chatId) {
    return { shouldSchedule: false, reason: "Chat is not the active chat." };
  }
  if (role === "assistant" && !settings.auto.triggerAfterAssistantMessages) {
    return { shouldSchedule: false, reason: "Assistant-message auto trigger is disabled." };
  }
  if (role === "user" && !settings.auto.triggerAfterUserMessages) {
    return { shouldSchedule: false, reason: "User-message auto trigger is disabled." };
  }
  return { shouldSchedule: true };
}

// src/shared/snapshotFormat.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isMessageAttachedSnapshot(value) {
  return "snapshot" in value && isRecord(value.snapshot);
}
function normalizeSnapshot(value) {
  if (isMessageAttachedSnapshot(value)) {
    return {
      snapshot: value.snapshot,
      sourceMessageId: value.messageId
    };
  }
  return {
    snapshot: value,
    sourceMessageId: null
  };
}
function sanitizePromptText(value) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function truncateSafe(value, maxChars) {
  const chars = Array.from(value);
  if (chars.length <= maxChars) return value;
  const suffix = "\n[truncated]";
  if (maxChars <= 0) return "";
  const suffixChars = Array.from(suffix);
  if (maxChars <= suffixChars.length) return suffixChars.slice(0, maxChars).join("");
  const keep = Math.max(0, maxChars - suffixChars.length);
  return `${chars.slice(0, keep).join("")}${suffix}`;
}
function primitiveToString(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}
function recordSummary(value) {
  const preferred = ["name", "title", "status", "recent_change", "current_goal", "emotional_state", "physical_state"];
  const direct = preferred.map((key) => primitiveToString(value[key])).filter((item) => Boolean(item));
  if (direct.length > 0) return direct.join(" - ");
  const fragments = Object.entries(value).map(([key, entry]) => {
    const rendered = primitiveToString(entry);
    return rendered ? `${key}: ${rendered}` : null;
  }).filter((item) => Boolean(item));
  return fragments.length > 0 ? fragments.slice(0, 4).join("; ") : null;
}
function listFromUnknown(value) {
  const primitive = primitiveToString(value);
  if (primitive) return [primitive];
  if (Array.isArray(value)) {
    return value.map((item) => {
      const rendered = primitiveToString(item);
      if (rendered) return rendered;
      return isRecord(item) ? recordSummary(item) : null;
    }).filter((item) => Boolean(item));
  }
  if (isRecord(value)) {
    const summary = recordSummary(value);
    return summary ? [summary] : [];
  }
  return [];
}
function stringAt(data, path) {
  let current = data;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return primitiveToString(current);
}
function sceneLine(data) {
  const parts = [
    stringAt(data, ["scene", "location"]),
    stringAt(data, ["scene", "date"]) ?? stringAt(data, ["scene", "time"]),
    stringAt(data, ["scene", "mood"]),
    stringAt(data, ["scene", "danger_level"])
  ].filter((item) => Boolean(item));
  return parts.length > 0 ? parts.join(", ") : null;
}
function characterNames(data) {
  return listFromUnknown(data.characters_present).map((item) => item.split(" - ")[0]?.trim() ?? item.trim()).filter(Boolean);
}
function importantState(data) {
  const facts = listFromUnknown(data.important_facts);
  const continuity = listFromUnknown(data.unresolved_continuity);
  const pressure = listFromUnknown(data.next_scene_pressure);
  return [...facts, ...continuity, ...pressure].slice(0, 8);
}
function openThreads(data) {
  return listFromUnknown(data.active_threads).slice(0, 8);
}
function fallbackSummary(data) {
  const fragments = Object.entries(data).map(([key, value]) => {
    if (isRecord(value)) return `${key}: ${recordSummary(value) ?? "set"}`;
    const list = listFromUnknown(value);
    if (list.length > 0) return `${key}: ${list.slice(0, 2).join("; ")}`;
    return null;
  }).filter((item) => Boolean(item));
  return fragments.slice(0, 6).join("\n");
}
function metadataLines(snapshot, sourceMessageId, settings) {
  const lines = [];
  if (settings.includeTimestamp) lines.push(`Generated: ${snapshot.createdAt}`);
  if (settings.includeSourceMessageId && sourceMessageId) lines.push(`Source message: ${sourceMessageId}`);
  return lines;
}
function formatCompact(snapshot, sourceMessageId, settings) {
  const lines = [];
  if (settings.includeHeader) lines.push("[LTracker Snapshot]");
  lines.push(...metadataLines(snapshot, sourceMessageId, settings));
  const scene = sceneLine(snapshot.data);
  if (scene) lines.push(`Scene: ${scene}`);
  const present = characterNames(snapshot.data);
  if (present.length > 0) lines.push(`Present: ${present.join("; ")}`);
  const state = importantState(snapshot.data);
  if (state.length > 0) {
    lines.push("Important state:");
    lines.push(...state.map((item) => `- ${item}`));
  }
  const threads = openThreads(snapshot.data);
  if (threads.length > 0) {
    lines.push("Open threads:");
    lines.push(...threads.map((item) => `- ${item}`));
  }
  if (lines.length === 0 || settings.includeHeader && lines.length === 1) {
    lines.push(fallbackSummary(snapshot.data));
  }
  return lines.filter(Boolean).join("\n");
}
function formatPrettyJson(source, snapshot, sourceMessageId, settings) {
  const payload = isMessageAttachedSnapshot(source) ? {
    messageId: source.messageId,
    messageIndex: source.messageIndex,
    attachedAt: source.attachedAt,
    snapshotCreatedAt: snapshot.createdAt,
    data: snapshot.data
  } : {
    snapshotCreatedAt: snapshot.createdAt,
    data: snapshot.data
  };
  const lines = [];
  if (settings.includeHeader) lines.push("[LTracker Snapshot JSON]");
  lines.push(...metadataLines(snapshot, sourceMessageId, settings));
  lines.push(JSON.stringify(payload, null, 2));
  return lines.join("\n");
}
function formatMinimal(snapshot, sourceMessageId, settings) {
  const lines = [];
  if (settings.includeHeader) lines.push("[LTracker Mini-State]");
  lines.push(...metadataLines(snapshot, sourceMessageId, settings));
  lines.push(`Location: ${stringAt(snapshot.data, ["scene", "location"]) ?? "Unknown"}`);
  const cast = characterNames(snapshot.data);
  lines.push(`Cast: ${cast.length > 0 ? cast.join("; ") : "Unknown"}`);
  const continuity = [
    ...importantState(snapshot.data),
    ...openThreads(snapshot.data)
  ];
  lines.push(`Continuity: ${continuity.length > 0 ? continuity.slice(0, 4).join("; ") : "No cached continuity details."}`);
  return lines.join("\n");
}
function formatSnapshotForInjection(source, settings) {
  const { snapshot, sourceMessageId } = normalizeSnapshot(source);
  const raw = settings.format === "pretty_json" ? formatPrettyJson(source, snapshot, sourceMessageId, settings) : settings.format === "minimal" ? formatMinimal(snapshot, sourceMessageId, settings) : formatCompact(snapshot, sourceMessageId, settings);
  return truncateSafe(sanitizePromptText(raw), settings.maxInjectedChars);
}

// src/shared/contextInjection.ts
function shouldSkipContextForInternalGeneration(context, internalTrackerGeneration) {
  if (internalTrackerGeneration) return true;
  return pathMatches(context, [
    ["type"],
    ["generationType"],
    ["request", "type"],
    ["input", "type"],
    ["generation", "type"],
    ["generation", "generationType"]
  ], "quiet") || pathMatches(context, [
    ["source"],
    ["metadata", "source"],
    ["request", "source"],
    ["request", "metadata", "source"],
    ["input", "source"],
    ["input", "metadata", "source"]
  ], "ltracker");
}
function buildInjectionDecision(input) {
  if (input.internalTrackerGeneration) {
    return emptyDecision("Internal LTracker tracker generation.");
  }
  if (!input.settings.injection.enabled) {
    return emptyDecision("Injection is disabled.");
  }
  const selected = input.settings.injection.mode === "latest_message_snapshot" ? input.messageSnapshot : input.chatSnapshot;
  if (!selected) {
    return emptyDecision(input.settings.injection.onlyInjectWhenSnapshotExists ? "No cached tracker snapshot exists." : "No cached tracker snapshot exists.");
  }
  const text = formatSnapshotForInjection(selected, input.settings.injection);
  const snapshotCreatedAt = "snapshot" in selected ? selected.snapshot.createdAt : selected.createdAt;
  const sourceMessageId = "snapshot" in selected ? selected.messageId : null;
  return {
    text,
    skippedReason: null,
    snapshotCreatedAt,
    sourceMessageId,
    injectedChars: Array.from(text).length
  };
}
function toContextHandlerResult(text) {
  return text && text.trim() ? text : null;
}
function emptyDecision(skippedReason) {
  return {
    text: null,
    skippedReason,
    snapshotCreatedAt: null,
    sourceMessageId: null,
    injectedChars: 0
  };
}
function pathMatches(value, paths, expected) {
  return paths.some((path) => stringAtPath(value, path)?.toLowerCase() === expected);
}
function stringAtPath(value, path) {
  let current = value;
  for (const segment of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return null;
    current = current[segment];
  }
  return typeof current === "string" ? current : null;
}

// src/shared/parser.ts
function normalizeJsonText(raw) {
  return raw.trim().replace(/^\uFEFF/, "").replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
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

// src/shared/presets.ts
var DEFAULT_TRACKER_PRESET_ID = "default_scene_tracker";
var PRESET_EXPORT_KIND = "ltracker_schema_preset";
var PRESET_EXPORT_FORMAT_VERSION = 1;
var DEFAULT_PRESET_PROMPT_INSTRUCTIONS = [
  "Fill the tracker from the transcript using the requested schema.",
  "Track current scene state, present characters, relationships, assets, active threads, unresolved continuity, important facts, and next-scene pressure.",
  "Prefer concise values that help future roleplay continuity."
].join("\n");
var DEFAULT_TRACKER_PRESET = {
  id: DEFAULT_TRACKER_PRESET_ID,
  name: "Default Scene Tracker",
  description: "Built-in LTracker scene, character, relationship, continuity, and thread tracker.",
  version: "1.0",
  createdAt: "2026-06-27T00:00:00.000Z",
  updatedAt: "2026-06-27T00:00:00.000Z",
  jsonSchema: DEFAULT_TRACKER_SCHEMA,
  promptInstructions: DEFAULT_PRESET_PROMPT_INSTRUCTIONS,
  htmlTemplate: "",
  notes: "Equivalent to LTracker's original default tracker shape.",
  origin: "built_in",
  capabilities: {
    supportsHtmlTemplate: false,
    supportsPartialRegeneration: false,
    supportsSequentialGeneration: false
  }
};
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function optionalString(value) {
  return typeof value === "string" ? value : void 0;
}
function validOrigin(value) {
  return value === "built_in" || value === "user_imported" || value === "user_created";
}
function repairCapabilities(value) {
  if (!isRecord2(value)) return void 0;
  const result = {};
  if (typeof value.supportsHtmlTemplate === "boolean") result.supportsHtmlTemplate = value.supportsHtmlTemplate;
  if (typeof value.supportsPartialRegeneration === "boolean") result.supportsPartialRegeneration = value.supportsPartialRegeneration;
  if (typeof value.supportsSequentialGeneration === "boolean") result.supportsSequentialGeneration = value.supportsSequentialGeneration;
  return Object.keys(result).length > 0 ? result : void 0;
}
function sanitizePresetId(value) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || "preset";
}
function createPresetId(name, existingIds) {
  const existing = new Set(existingIds);
  const base = sanitizePresetId(name);
  if (!existing.has(base) && base !== DEFAULT_TRACKER_PRESET_ID) return base;
  for (let index = 2; index < 1e4; index += 1) {
    const candidate = `${base}_${index}`;
    if (!existing.has(candidate) && candidate !== DEFAULT_TRACKER_PRESET_ID) return candidate;
  }
  return `${base}_${Date.now()}`;
}
function validateJsonSchema(value) {
  if (!isRecord2(value)) {
    return { ok: false, error: "JSON Schema must be a JSON object." };
  }
  return { ok: true, error: null };
}
function validateTrackerPreset(value) {
  if (!isRecord2(value)) return { ok: false, error: "Preset must be a JSON object." };
  if (typeof value.id !== "string" || !sanitizePresetId(value.id)) {
    return { ok: false, error: "Preset id is required." };
  }
  if (typeof value.name !== "string" || !value.name.trim()) {
    return { ok: false, error: "Preset name is required." };
  }
  if (typeof value.version !== "string" || !value.version.trim()) {
    return { ok: false, error: "Preset version is required." };
  }
  const schemaValidation = validateJsonSchema(value.jsonSchema);
  if (!schemaValidation.ok) return schemaValidation;
  if (typeof value.promptInstructions !== "string" || !value.promptInstructions.trim()) {
    return { ok: false, error: "Prompt instructions are required." };
  }
  if (!validOrigin(value.origin)) {
    return { ok: false, error: "Preset origin is invalid." };
  }
  if ("htmlTemplate" in value && typeof value.htmlTemplate !== "string") {
    return { ok: false, error: "HTML template must be text." };
  }
  return { ok: true, error: null };
}
function repairTrackerPreset(value) {
  if (!isRecord2(value)) return null;
  const origin = validOrigin(value.origin) ? value.origin : null;
  if (!origin) return null;
  const preset = {
    id: sanitizePresetId(stringValue(value.id)),
    name: stringValue(value.name).trim(),
    description: stringValue(value.description),
    version: stringValue(value.version, "1.0"),
    createdAt: stringValue(value.createdAt, (/* @__PURE__ */ new Date()).toISOString()),
    updatedAt: stringValue(value.updatedAt, (/* @__PURE__ */ new Date()).toISOString()),
    jsonSchema: isRecord2(value.jsonSchema) ? value.jsonSchema : {},
    promptInstructions: stringValue(value.promptInstructions),
    origin
  };
  const htmlTemplate = optionalString(value.htmlTemplate);
  if (htmlTemplate !== void 0) preset.htmlTemplate = htmlTemplate;
  const notes = optionalString(value.notes);
  if (notes !== void 0) preset.notes = notes;
  const capabilities = repairCapabilities(value.capabilities);
  if (capabilities) preset.capabilities = capabilities;
  return validateTrackerPreset(preset).ok ? preset : null;
}
function draftToPreset(draft, options) {
  const preset = {
    id: sanitizePresetId(options.id),
    name: draft.name.trim() || "Untitled Preset",
    description: draft.description,
    version: draft.version.trim() || "1.0",
    createdAt: options.existing?.createdAt ?? options.now,
    updatedAt: options.now,
    jsonSchema: draft.jsonSchema,
    promptInstructions: draft.promptInstructions,
    origin: options.origin
  };
  if (draft.htmlTemplate !== void 0) preset.htmlTemplate = draft.htmlTemplate;
  if (draft.notes !== void 0) preset.notes = draft.notes;
  if (draft.capabilities) preset.capabilities = draft.capabilities;
  return preset;
}
function importTrackerPresetEnvelope(value, existingIds, now) {
  if (!isRecord2(value)) return { ok: false, preset: null, error: "Import must be a JSON object." };
  if (value.kind !== PRESET_EXPORT_KIND) {
    return { ok: false, preset: null, error: "Import kind must be ltracker_schema_preset." };
  }
  if (value.formatVersion !== PRESET_EXPORT_FORMAT_VERSION) {
    return { ok: false, preset: null, error: "Unsupported preset format version." };
  }
  const repaired = repairTrackerPreset(value.preset);
  if (!repaired) return { ok: false, preset: null, error: "Imported preset is invalid." };
  const existing = new Set(existingIds);
  const importedId = sanitizePresetId(repaired.id);
  const id = existing.has(importedId) || importedId === DEFAULT_TRACKER_PRESET_ID ? createPresetId(repaired.name, existing) : importedId;
  return {
    ok: true,
    error: null,
    preset: {
      ...repaired,
      id,
      origin: "user_imported",
      createdAt: now,
      updatedAt: now
    }
  };
}
function canModifyPreset(preset) {
  return preset.origin !== "built_in";
}
function resolveSelectedPreset(presets, selectedPresetId) {
  const selected = presets.find((preset) => preset.id === selectedPresetId);
  if (selected) return { preset: selected, fallbackReason: null };
  return {
    preset: DEFAULT_TRACKER_PRESET,
    fallbackReason: `Selected preset ${selectedPresetId} was not found; using Default Scene Tracker.`
  };
}

// src/shared/types.ts
var EXTENSION_VERSION = "0.05";
var STORAGE_SCHEMA_VERSION = 1;
var SETTINGS_SCHEMA_VERSION = 1;
var SPINDLE_TYPES_VERSION = "0.5.21";

// src/shared/settings.ts
var SETTINGS_LIMITS = {
  recentMessageLimit: { min: 1, max: 200, default: 24 },
  maxMessageChars: { min: 500, max: 5e4, default: 8e3 },
  generationTimeoutMs: { min: 1e4, max: 18e4, default: 45e3 },
  autoDebounceMs: { min: 250, max: 3e4, default: 1500 },
  skipFirstMessages: { min: 0, max: 100, default: 2 },
  maxInjectedChars: { min: 500, max: 2e4, default: 3e3 }
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
  },
  injection: {
    enabled: false,
    mode: "latest_chat_snapshot",
    format: "compact",
    maxInjectedChars: SETTINGS_LIMITS.maxInjectedChars.default,
    includeHeader: true,
    includeTimestamp: true,
    includeSourceMessageId: false,
    onlyInjectWhenSnapshotExists: true
  }
};
function isRecord3(value) {
  return typeof value === "object" && value !== null;
}
function clampNumber(value, fallback, min, max) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() ? Number(value) : fallback;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}
function repairSettings(value) {
  const source = isRecord3(value) ? value : {};
  const autoSource = isRecord3(source.auto) ? source.auto : {};
  const injectionSource = isRecord3(source.injection) ? source.injection : {};
  const mode = injectionSource.mode === "latest_message_snapshot" || injectionSource.mode === "latest_chat_snapshot" ? injectionSource.mode : DEFAULT_SETTINGS.injection.mode;
  const format = injectionSource.format === "pretty_json" || injectionSource.format === "minimal" || injectionSource.format === "compact" ? injectionSource.format : DEFAULT_SETTINGS.injection.format;
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    recentMessageLimit: clampNumber(
      source.recentMessageLimit,
      SETTINGS_LIMITS.recentMessageLimit.default,
      SETTINGS_LIMITS.recentMessageLimit.min,
      SETTINGS_LIMITS.recentMessageLimit.max
    ),
    maxMessageChars: clampNumber(
      source.maxMessageChars,
      SETTINGS_LIMITS.maxMessageChars.default,
      SETTINGS_LIMITS.maxMessageChars.min,
      SETTINGS_LIMITS.maxMessageChars.max
    ),
    generationTimeoutMs: clampNumber(
      source.generationTimeoutMs,
      SETTINGS_LIMITS.generationTimeoutMs.default,
      SETTINGS_LIMITS.generationTimeoutMs.min,
      SETTINGS_LIMITS.generationTimeoutMs.max
    ),
    saveRawOutput: typeof source.saveRawOutput === "boolean" ? source.saveRawOutput : DEFAULT_SETTINGS.saveRawOutput,
    savePromptPreview: typeof source.savePromptPreview === "boolean" ? source.savePromptPreview : DEFAULT_SETTINGS.savePromptPreview,
    auto: {
      autoModeEnabled: typeof autoSource.autoModeEnabled === "boolean" ? autoSource.autoModeEnabled : DEFAULT_SETTINGS.auto.autoModeEnabled,
      autoDebounceMs: clampNumber(
        autoSource.autoDebounceMs,
        SETTINGS_LIMITS.autoDebounceMs.default,
        SETTINGS_LIMITS.autoDebounceMs.min,
        SETTINGS_LIMITS.autoDebounceMs.max
      ),
      skipFirstMessages: clampNumber(
        autoSource.skipFirstMessages,
        SETTINGS_LIMITS.skipFirstMessages.default,
        SETTINGS_LIMITS.skipFirstMessages.min,
        SETTINGS_LIMITS.skipFirstMessages.max
      ),
      triggerAfterAssistantMessages: typeof autoSource.triggerAfterAssistantMessages === "boolean" ? autoSource.triggerAfterAssistantMessages : DEFAULT_SETTINGS.auto.triggerAfterAssistantMessages,
      triggerAfterUserMessages: typeof autoSource.triggerAfterUserMessages === "boolean" ? autoSource.triggerAfterUserMessages : DEFAULT_SETTINGS.auto.triggerAfterUserMessages,
      attachSnapshotToMessage: typeof autoSource.attachSnapshotToMessage === "boolean" ? autoSource.attachSnapshotToMessage : DEFAULT_SETTINGS.auto.attachSnapshotToMessage,
      onlyWhenChatActive: typeof autoSource.onlyWhenChatActive === "boolean" ? autoSource.onlyWhenChatActive : DEFAULT_SETTINGS.auto.onlyWhenChatActive
    },
    injection: {
      enabled: typeof injectionSource.enabled === "boolean" ? injectionSource.enabled : DEFAULT_SETTINGS.injection.enabled,
      mode,
      format,
      maxInjectedChars: clampNumber(
        injectionSource.maxInjectedChars,
        SETTINGS_LIMITS.maxInjectedChars.default,
        SETTINGS_LIMITS.maxInjectedChars.min,
        SETTINGS_LIMITS.maxInjectedChars.max
      ),
      includeHeader: typeof injectionSource.includeHeader === "boolean" ? injectionSource.includeHeader : DEFAULT_SETTINGS.injection.includeHeader,
      includeTimestamp: typeof injectionSource.includeTimestamp === "boolean" ? injectionSource.includeTimestamp : DEFAULT_SETTINGS.injection.includeTimestamp,
      includeSourceMessageId: typeof injectionSource.includeSourceMessageId === "boolean" ? injectionSource.includeSourceMessageId : DEFAULT_SETTINGS.injection.includeSourceMessageId,
      onlyInjectWhenSnapshotExists: typeof injectionSource.onlyInjectWhenSnapshotExists === "boolean" ? injectionSource.onlyInjectWhenSnapshotExists : DEFAULT_SETTINGS.injection.onlyInjectWhenSnapshotExists
    }
  };
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
function messageSnapshotsPrefix(chatId) {
  return `chats/${encodeStorageSegment(chatId)}/messages/`;
}
function messageSnapshotPath(chatId, messageId) {
  return `${messageSnapshotsPrefix(chatId)}${encodeStorageSegment(messageId)}/tracker-snapshot.json`;
}
function diagnosticsPath(chatId) {
  return `chats/${encodeStorageSegment(chatId)}/diagnostics.json`;
}
function activePresetPath(chatId) {
  return `chats/${encodeStorageSegment(chatId)}/active-preset.json`;
}
function presetPath(presetId) {
  return `presets/${encodeStorageSegment(presetId)}.json`;
}
var PRESETS_INDEX_PATH = "presets/index.json";
var SETTINGS_PATH = "settings.json";

// src/shared/trackerPrompt.ts
var DEFAULT_MAX_MESSAGE_CHARS = 8e3;
function buildCompactTranscript(messages, maxMessageChars = DEFAULT_MAX_MESSAGE_CHARS) {
  return messages.map((message) => {
    const role = message.role === "user" ? "USER" : "ASSISTANT";
    const name = message.name ? ` ${message.name}` : "";
    const content = message.content.trim().slice(0, maxMessageChars);
    return `[${message.index} ${role}${name}]
${content}`;
  }).join("\n\n");
}
function buildTrackerPrompt(transcript, preset = DEFAULT_TRACKER_PRESET) {
  return [
    {
      role: "system",
      content: [
        "You extract the current state of an ongoing roleplay or story chat.",
        "Return JSON only. Do not wrap the JSON in Markdown.",
        "Do not invent facts unsupported by the transcript.",
        "Preset prompt instructions are lower priority than these safety and integrity requirements.",
        "Preserve character names exactly when possible.",
        "Summarize only the current and relevant state, not every past event.",
        'Use empty strings, empty arrays, or "unknown" for unknown fields.'
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Selected tracker preset: ${preset.name} (${preset.id})`,
        "",
        "Preset prompt instructions:",
        preset.promptInstructions,
        "",
        "Tracker JSON schema:",
        JSON.stringify(preset.jsonSchema, null, 2),
        "",
        "Transcript:",
        transcript,
        "",
        "Return only a JSON object matching the selected schema shape.",
        "Never include Markdown, commentary, or HTML."
      ].join("\n")
    }
  ];
}

// src/backend.ts
var LTrackerStageError = class extends Error {
  stage;
  detail;
  constructor(stage, message, detail) {
    super(message);
    this.name = "LTrackerStageError";
    this.stage = stage;
    if (detail) this.detail = detail;
  }
};
var BUILD_INFO = {
  extensionVersion: EXTENSION_VERSION,
  storageSchemaVersion: STORAGE_SCHEMA_VERSION,
  settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
  spindleTypesVersion: SPINDLE_TYPES_VERSION,
  buildTarget: "es2022"
};
var activeJobs = /* @__PURE__ */ new Map();
var pendingAutoJobs = /* @__PURE__ */ new Map();
var activeChatByUser = /* @__PURE__ */ new Map();
var usersByChat = /* @__PURE__ */ new Map();
var eventCleanups = [];
var autoSubscriptionsActive = false;
var contextHandlerRegistered = false;
var internalTrackerGenerationDepth = 0;
var disposed = false;
function isRecord4(value) {
  return typeof value === "object" && value !== null;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function errorDetail(error) {
  if (error instanceof Error && error.stack) return error.stack;
  return void 0;
}
function stageError(stage, error) {
  if (error instanceof LTrackerStageError) throw error;
  throw new LTrackerStageError(stage, errorMessage(error), errorDetail(error));
}
function diagnosticError(error, fallbackStage) {
  const stage = error instanceof LTrackerStageError ? error.stage : fallbackStage;
  const detail = error instanceof LTrackerStageError ? error.detail : errorDetail(error);
  const result = {
    stage,
    message: errorMessage(error),
    createdAt: nowIso()
  };
  if (detail) result.detail = detail;
  return result;
}
function isFrontendMessage(payload) {
  if (!isRecord4(payload) || typeof payload.type !== "string") return false;
  if (![
    "ready",
    "refresh_state",
    "generate_tracker",
    "clear_snapshot",
    "save_settings",
    "reset_settings",
    "select_preset",
    "save_preset_as_new",
    "duplicate_preset",
    "update_preset",
    "delete_preset",
    "reset_preset",
    "import_preset",
    "validate_preset"
  ].includes(payload.type)) return false;
  if ("chatId" in payload && payload.chatId !== null && typeof payload.chatId !== "string") return false;
  if ([
    "generate_tracker",
    "clear_snapshot",
    "save_settings",
    "reset_settings",
    "select_preset",
    "save_preset_as_new",
    "duplicate_preset",
    "update_preset",
    "delete_preset",
    "reset_preset",
    "import_preset",
    "validate_preset"
  ].includes(payload.type) && typeof payload.requestId !== "string") return false;
  if (payload.type === "save_settings" && !isRecord4(payload.settings)) return false;
  if (["save_preset_as_new", "duplicate_preset", "update_preset", "validate_preset"].includes(payload.type) && !isRecord4(payload.preset)) return false;
  if (["select_preset", "update_preset", "delete_preset"].includes(payload.type) && typeof payload.presetId !== "string") return false;
  if (payload.type === "import_preset" && typeof payload.importText !== "string") return false;
  return true;
}
function permissionState() {
  return {
    generation: spindle.permissions.has("generation"),
    chats: spindle.permissions.has("chats"),
    chatMutation: spindle.permissions.has("chat_mutation"),
    contextHandler: spindle.permissions.has("context_handler")
  };
}
function send(payload, userId) {
  if (!disposed) spindle.sendToFrontend(payload, userId);
}
function defaultDiagnostics(chatId) {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    extensionVersion: EXTENSION_VERSION,
    chatId,
    status: "idle",
    storageKey: chatId ? snapshotPath(chatId) : null,
    buildInfo: BUILD_INFO,
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
    autoSubscriptionActive: autoSubscriptionsActive,
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
    lastPromptUsedPresetName: null
  };
}
function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}
function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function nonNegativeInteger(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function recordOrNull(value) {
  return isRecord4(value) && !Array.isArray(value) ? value : null;
}
function sourceKindOrNull(value) {
  return value === "manual" || value === "auto" ? value : null;
}
function autoEventTypeOrNull(value) {
  return value === "GENERATION_ENDED" || value === "MESSAGE_SENT" ? value : null;
}
function injectionModeOrNull(value) {
  return value === "latest_chat_snapshot" || value === "latest_message_snapshot" ? value : null;
}
function injectionFormatOrNull(value) {
  return value === "compact" || value === "pretty_json" || value === "minimal" ? value : null;
}
function errorOrNull(value) {
  if (!isRecord4(value) || typeof value.stage !== "string" || typeof value.message !== "string") return null;
  const error = {
    stage: value.stage,
    message: value.message,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso()
  };
  if (typeof value.detail === "string") error.detail = value.detail;
  return error;
}
function cancellationOrNull(value) {
  if (!isRecord4(value) || typeof value.jobId !== "string" || typeof value.requestId !== "string" || typeof value.reason !== "string") return null;
  return {
    jobId: value.jobId,
    requestId: value.requestId,
    reason: value.reason,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso()
  };
}
function repairDiagnostics(value, chatId) {
  const base = defaultDiagnostics(chatId);
  if (!isRecord4(value)) return base;
  return {
    ...base,
    status: value.status === "generating" || value.status === "error" ? value.status : "idle",
    lastJobId: stringOrNull(value.lastJobId),
    lastRequestId: stringOrNull(value.lastRequestId),
    lastGenerationSource: sourceKindOrNull(value.lastGenerationSource),
    lastGenerationStartedAt: stringOrNull(value.lastGenerationStartedAt),
    lastGenerationCompletedAt: stringOrNull(value.lastGenerationCompletedAt),
    lastGenerationDurationMs: numberOrNull(value.lastGenerationDurationMs),
    lastMessagesRead: typeof value.lastMessagesRead === "number" && Number.isFinite(value.lastMessagesRead) ? Math.max(0, Math.round(value.lastMessagesRead)) : 0,
    lastSourceMessageIds: stringArray(value.lastSourceMessageIds),
    lastSourceMessageRange: stringOrNull(value.lastSourceMessageRange),
    lastRawOutput: stringOrNull(value.lastRawOutput),
    lastParsedTracker: recordOrNull(value.lastParsedTracker),
    lastPromptPreview: stringOrNull(value.lastPromptPreview),
    lastError: errorOrNull(value.lastError),
    lastCancellation: cancellationOrNull(value.lastCancellation),
    autoSubscriptionActive: autoSubscriptionsActive,
    lastAutoEventAt: stringOrNull(value.lastAutoEventAt),
    lastAutoEventType: autoEventTypeOrNull(value.lastAutoEventType),
    lastAutoSkippedReason: stringOrNull(value.lastAutoSkippedReason),
    lastAutoScheduledAt: stringOrNull(value.lastAutoScheduledAt),
    lastAutoTriggeredAt: stringOrNull(value.lastAutoTriggeredAt),
    lastAutoSourceMessageId: stringOrNull(value.lastAutoSourceMessageId),
    lastAutoSourceMessageIndex: nonNegativeInteger(value.lastAutoSourceMessageIndex),
    lastAutoGenerationId: stringOrNull(value.lastAutoGenerationId),
    latestAttachedMessageId: stringOrNull(value.latestAttachedMessageId),
    latestAttachedMessageIndex: nonNegativeInteger(value.latestAttachedMessageIndex),
    latestAttachedSnapshotAt: stringOrNull(value.latestAttachedSnapshotAt),
    latestAttachedSnapshotStorageKey: stringOrNull(value.latestAttachedSnapshotStorageKey),
    injectionEnabled: typeof value.injectionEnabled === "boolean" ? value.injectionEnabled : false,
    lastInjectionAt: stringOrNull(value.lastInjectionAt),
    lastInjectionMode: injectionModeOrNull(value.lastInjectionMode),
    lastInjectionFormat: injectionFormatOrNull(value.lastInjectionFormat),
    lastInjectedChars: typeof value.lastInjectedChars === "number" && Number.isFinite(value.lastInjectedChars) ? Math.max(0, Math.round(value.lastInjectedChars)) : 0,
    lastInjectionSkippedReason: stringOrNull(value.lastInjectionSkippedReason),
    lastInjectionSnapshotCreatedAt: stringOrNull(value.lastInjectionSnapshotCreatedAt),
    lastInjectionSourceMessageId: stringOrNull(value.lastInjectionSourceMessageId),
    selectedPresetId: stringOrNull(value.selectedPresetId),
    selectedPresetName: stringOrNull(value.selectedPresetName),
    lastPresetFallbackReason: stringOrNull(value.lastPresetFallbackReason),
    lastPresetValidationError: stringOrNull(value.lastPresetValidationError),
    lastPromptUsedPresetId: stringOrNull(value.lastPromptUsedPresetId),
    lastPromptUsedPresetName: stringOrNull(value.lastPromptUsedPresetName)
  };
}
async function getSettings(userId) {
  const raw = await spindle.userStorage.getJson(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS,
    userId
  });
  const repaired = repairSettings(raw);
  if (JSON.stringify(raw) !== JSON.stringify(repaired)) {
    await spindle.userStorage.setJson(SETTINGS_PATH, repaired, { indent: 2, userId });
  }
  return repaired;
}
async function saveSettings(settings, userId) {
  const repaired = repairSettings(settings);
  await spindle.userStorage.setJson(SETTINGS_PATH, repaired, { indent: 2, userId });
  return repaired;
}
async function resetSettings(userId) {
  await spindle.userStorage.setJson(SETTINGS_PATH, DEFAULT_SETTINGS, { indent: 2, userId });
  return DEFAULT_SETTINGS;
}
async function loadPresetIndex(userId) {
  const raw = await spindle.userStorage.getJson(PRESETS_INDEX_PATH, {
    fallback: [],
    userId
  });
  const ids = Array.isArray(raw) ? raw.filter((item) => typeof item === "string" && item !== DEFAULT_TRACKER_PRESET_ID) : [];
  if (JSON.stringify(raw) !== JSON.stringify(ids)) {
    await spindle.userStorage.setJson(PRESETS_INDEX_PATH, ids, { indent: 2, userId });
  }
  return ids;
}
async function savePresetIndex(ids, userId) {
  const unique = [...new Set(ids.filter((id) => id !== DEFAULT_TRACKER_PRESET_ID))];
  await spindle.userStorage.setJson(PRESETS_INDEX_PATH, unique, { indent: 2, userId });
}
async function loadUserPreset(presetId, userId) {
  const raw = await spindle.userStorage.getJson(presetPath(presetId), {
    fallback: null,
    userId
  });
  const repaired = repairTrackerPreset(raw);
  if (!repaired || repaired.origin === "built_in") return null;
  return repaired;
}
async function loadPresetCatalog(userId) {
  const ids = await loadPresetIndex(userId);
  const loaded = await Promise.all(ids.map((id) => loadUserPreset(id, userId)));
  return [
    DEFAULT_TRACKER_PRESET,
    ...loaded.filter((preset) => Boolean(preset))
  ];
}
function defaultActivePresetState() {
  return {
    selectedPresetId: DEFAULT_TRACKER_PRESET_ID,
    selectedAt: (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
async function loadActivePresetState(chatId, userId) {
  if (!chatId) return defaultActivePresetState();
  const raw = await spindle.userStorage.getJson(activePresetPath(chatId), {
    fallback: null,
    userId
  });
  if (!isRecord4(raw) || typeof raw.selectedPresetId !== "string") {
    return defaultActivePresetState();
  }
  return {
    selectedPresetId: raw.selectedPresetId,
    selectedAt: typeof raw.selectedAt === "string" ? raw.selectedAt : nowIso()
  };
}
async function saveActivePresetState(chatId, presetId, userId) {
  const state = {
    selectedPresetId: presetId,
    selectedAt: nowIso()
  };
  await spindle.userStorage.setJson(activePresetPath(chatId), state, { indent: 2, userId });
  return state;
}
function presetById(presets, presetId) {
  return presets.find((preset) => preset.id === presetId) ?? null;
}
async function resolveActivePreset(chatId, userId) {
  const presets = await loadPresetCatalog(userId);
  const activePresetState = await loadActivePresetState(chatId, userId);
  const resolved = resolveSelectedPreset(presets, activePresetState.selectedPresetId);
  return {
    presets,
    activePreset: resolved.preset,
    activePresetState: {
      ...activePresetState,
      selectedPresetId: resolved.preset.id
    },
    fallbackReason: resolved.fallbackReason
  };
}
async function saveUserPreset(preset, userId) {
  const validation = validateTrackerPreset(preset);
  if (!validation.ok) throw new Error(validation.error ?? "Preset is invalid.");
  if (!canModifyPreset(preset)) throw new Error("Built-in presets cannot be overwritten.");
  await spindle.userStorage.setJson(presetPath(preset.id), preset, { indent: 2, userId });
  const ids = await loadPresetIndex(userId);
  if (!ids.includes(preset.id)) await savePresetIndex([...ids, preset.id], userId);
}
async function deleteUserPreset(presetId, userId) {
  if (presetId === DEFAULT_TRACKER_PRESET_ID) throw new Error("Built-in presets cannot be deleted.");
  const ids = await loadPresetIndex(userId);
  if (await spindle.userStorage.exists(presetPath(presetId), userId)) {
    await spindle.userStorage.delete(presetPath(presetId), userId);
  }
  await savePresetIndex(ids.filter((id) => id !== presetId), userId);
}
async function loadSnapshot(chatId, userId) {
  if (!chatId) return null;
  return spindle.userStorage.getJson(snapshotPath(chatId), {
    fallback: null,
    userId
  });
}
async function loadMessageSnapshot(chatId, messageId, userId) {
  if (!chatId || !messageId) return null;
  return spindle.userStorage.getJson(messageSnapshotPath(chatId, messageId), {
    fallback: null,
    userId
  });
}
async function loadDiagnostics(chatId, userId) {
  if (!chatId) return defaultDiagnostics(null);
  const raw = await spindle.userStorage.getJson(diagnosticsPath(chatId), {
    fallback: null,
    userId
  });
  return repairDiagnostics(raw, chatId);
}
async function persistDiagnostics(diagnostics, userId) {
  if (!diagnostics.chatId) return;
  await spindle.userStorage.setJson(diagnosticsPath(diagnostics.chatId), {
    ...diagnostics,
    autoSubscriptionActive: autoSubscriptionsActive
  }, {
    indent: 2,
    userId
  });
}
async function tryPersistDiagnostics(diagnostics, userId) {
  try {
    await persistDiagnostics(diagnostics, userId);
  } catch (error) {
    spindle.log.warn(`LTracker could not save diagnostics: ${errorMessage(error)}`);
  }
}
async function buildState(chatId, userId, status, error = null) {
  const settings = await getSettings(userId);
  const diagnostics = await loadDiagnostics(chatId, userId);
  const presetState = await resolveActivePreset(chatId, userId);
  const snapshot = await loadSnapshot(chatId, userId);
  const latestMessageSnapshot = await loadMessageSnapshot(
    chatId,
    diagnostics.latestAttachedMessageId,
    userId
  );
  const injectionPreview = buildInjectionDecision({
    settings,
    chatSnapshot: snapshot,
    messageSnapshot: latestMessageSnapshot,
    internalTrackerGeneration: false
  }).text;
  const stateError = error ?? diagnostics.lastError;
  return {
    version: EXTENSION_VERSION,
    status: status ?? diagnostics.status,
    chatId,
    snapshot,
    latestMessageSnapshot,
    injectionPreview,
    presets: presetState.presets,
    activePreset: presetState.activePreset,
    activePresetState: presetState.activePresetState,
    error: stateError,
    permissions: permissionState(),
    settings,
    diagnostics: {
      ...diagnostics,
      status: status ?? diagnostics.status,
      lastError: stateError,
      autoSubscriptionActive: autoSubscriptionsActive,
      injectionEnabled: settings.injection.enabled,
      selectedPresetId: presetState.activePreset.id,
      selectedPresetName: presetState.activePreset.name,
      lastPresetFallbackReason: presetState.fallbackReason ?? diagnostics.lastPresetFallbackReason
    }
  };
}
async function sendState(chatId, userId, status, error = null, requestId) {
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
async function readChatMessages(chatId) {
  ensurePermission("chatMutation", "chat_mutation is required to read chat messages");
  if (!spindle.chat?.getMessages) {
    throw new Error("Lumiverse chat message API is unavailable.");
  }
  return spindle.chat.getMessages(chatId);
}
async function getRecentMessages(chatId, settings) {
  const messages = await readChatMessages(chatId);
  return messages.slice(-settings.recentMessageLimit);
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
  if (!isRecord4(result)) {
    throw new Error("Lumiverse generation returned an unsupported response.");
  }
  for (const key of ["content", "text", "output", "response"]) {
    const value = result[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const message = result.message;
  if (typeof message === "string" && message.trim()) return message;
  if (isRecord4(message) && typeof message.content === "string" && message.content.trim()) {
    return message.content;
  }
  throw new Error("Lumiverse generation completed without textual content.");
}
async function runTrackerGeneration(messages, userId, settings, parentSignal) {
  ensurePermission("generation", "generation is required to call the active/default model");
  if (!spindle.generate?.quiet) {
    throw new Error("Lumiverse quiet generation API is unavailable.");
  }
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, settings.generationTimeoutMs);
  parentSignal.addEventListener("abort", onParentAbort, { once: true });
  if (parentSignal.aborted) controller.abort();
  try {
    internalTrackerGenerationDepth += 1;
    const result = await spindle.generate.quiet({
      type: "quiet",
      messages,
      reasoning: { source: "off" },
      userId,
      signal: controller.signal
    });
    return normalizeGenerationText(result);
  } catch (error) {
    if (parentSignal.aborted) {
      throw new Error("Tracker generation was cancelled by a newer request.");
    }
    if (timedOut) {
      throw new Error(`Tracker generation timed out after ${Math.round(settings.generationTimeoutMs / 1e3)} seconds.`);
    }
    throw error;
  } finally {
    internalTrackerGenerationDepth = Math.max(0, internalTrackerGenerationDepth - 1);
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", onParentAbort);
  }
}
async function saveSnapshot(snapshot, userId) {
  await spindle.userStorage.setJson(snapshotPath(snapshot.chatId), snapshot, {
    indent: 2,
    userId
  });
}
async function saveMessageAttachedSnapshot(snapshot, userId) {
  await spindle.userStorage.setJson(messageSnapshotPath(snapshot.chatId, snapshot.messageId), snapshot, {
    indent: 2,
    userId
  });
}
function promptPreview(messages) {
  return messages.map((message) => {
    const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content, null, 2);
    return `## ${message.role}
${content}`;
  }).join("\n\n");
}
function sourceRange(ids) {
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0] ?? null;
  return `${ids[0]} -> ${ids[ids.length - 1]}`;
}
function newJobId() {
  return `job:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
function isCurrentJob(chatId, jobId) {
  return activeJobs.get(chatId)?.jobId === jobId;
}
function userChatKey(userId, chatId) {
  return `${userId}:${chatId}`;
}
function messageRole(message) {
  return message.is_user ? "user" : "assistant";
}
function createManualTrigger(requestId) {
  return { kind: "manual", requestId };
}
function createAutoTrigger(input) {
  return {
    kind: "auto",
    requestId: input.requestId,
    eventType: input.eventType,
    sourceMessageId: input.message.id,
    sourceMessageIndex: input.message.index_in_chat,
    generationId: input.generationId ?? null,
    generationType: input.generationType ?? null
  };
}
async function markAutoSkipped(chatId, userId, trigger, reason, eventAt = null) {
  const diagnostics = {
    ...await loadDiagnostics(chatId, userId),
    status: activeJobs.has(chatId) ? "generating" : "idle",
    lastAutoEventAt: eventAt ?? nowIso(),
    lastAutoEventType: trigger.eventType,
    lastAutoSkippedReason: reason,
    lastAutoScheduledAt: null,
    lastAutoTriggeredAt: null,
    lastAutoSourceMessageId: trigger.sourceMessageId,
    lastAutoSourceMessageIndex: trigger.sourceMessageIndex,
    lastAutoGenerationId: trigger.generationId
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(chatId, userId, diagnostics.status, null, trigger.requestId);
}
function cancelPendingAutoForChat(chatId, userId, reason) {
  for (const [key, pending] of pendingAutoJobs) {
    if (pending.chatId !== chatId) continue;
    if (userId && pending.userId !== userId) continue;
    clearTimeout(pending.timer);
    pendingAutoJobs.delete(key);
    void markAutoSkipped(pending.chatId, pending.userId, pending.trigger, reason, pending.scheduledAt).catch((error) => spindle.log.warn(`LTracker could not record auto cancellation: ${errorMessage(error)}`));
  }
}
function abortAutoJobForChat(chatId, reason) {
  const job = activeJobs.get(chatId);
  if (!job || job.sourceKind !== "auto") return;
  job.cancelReason = reason;
  job.controller.abort();
}
function rememberActiveChat(userId, chatId) {
  const previous = activeChatByUser.get(userId) ?? null;
  if (previous === chatId) return;
  if (previous) {
    const users = usersByChat.get(previous);
    users?.delete(userId);
    if (users?.size === 0) usersByChat.delete(previous);
    cancelPendingAutoForChat(previous, userId, "Chat changed before the auto timer fired.");
    abortAutoJobForChat(previous, "Chat changed before the auto tracker result was saved.");
  }
  if (chatId) {
    activeChatByUser.set(userId, chatId);
    const users = usersByChat.get(chatId) ?? /* @__PURE__ */ new Set();
    users.add(userId);
    usersByChat.set(chatId, users);
  } else {
    activeChatByUser.delete(userId);
  }
}
function targetUsersForChat(chatId, userId) {
  if (userId) return [userId];
  return [...usersByChat.get(chatId) ?? []];
}
function isChatMessage(value) {
  return isRecord4(value) && typeof value.id === "string" && typeof value.chat_id === "string" && typeof value.index_in_chat === "number" && typeof value.is_user === "boolean" && typeof value.content === "string";
}
function messageFromEventPayload(payload) {
  if (isChatMessage(payload)) return payload;
  if (isRecord4(payload) && isChatMessage(payload.message)) return payload.message;
  return null;
}
async function scheduleAutoForMessage(input) {
  if (isQuietGenerationType(input.generationType)) return;
  const settings = await getSettings(input.userId);
  if (!settings.auto.autoModeEnabled) return;
  const messages = await readChatMessages(input.chatId);
  const sourceMessage = messages.find((message) => message.id === input.message.id) ?? input.message;
  const requestId = `auto:${input.eventType}:${sourceMessage.id}:${Date.now()}`;
  const trigger = createAutoTrigger({
    eventType: input.eventType,
    requestId,
    message: sourceMessage,
    generationId: input.generationId,
    generationType: input.generationType
  });
  const decision = shouldScheduleAutoTracker({
    settings,
    role: messageRole(sourceMessage),
    messageCount: messages.length,
    chatId: input.chatId,
    activeChatId: activeChatByUser.get(input.userId) ?? null,
    trackerGenerationRunning: activeJobs.has(input.chatId)
  });
  if (!decision.shouldSchedule) {
    await markAutoSkipped(input.chatId, input.userId, trigger, decision.reason, input.eventAt);
    return;
  }
  const key = userChatKey(input.userId, input.chatId);
  const existing = pendingAutoJobs.get(key);
  if (existing) {
    clearTimeout(existing.timer);
  }
  const scheduledAt = nowIso();
  const timer = setTimeout(() => {
    void runPendingAuto(key).catch((error) => {
      spindle.log.warn(`LTracker auto job failed: ${errorMessage(error)}`);
    });
  }, settings.auto.autoDebounceMs);
  pendingAutoJobs.set(key, {
    timer,
    chatId: input.chatId,
    userId: input.userId,
    requestId,
    trigger,
    scheduledAt
  });
  const diagnostics = {
    ...await loadDiagnostics(input.chatId, input.userId),
    lastAutoEventAt: input.eventAt,
    lastAutoEventType: input.eventType,
    lastAutoSkippedReason: null,
    lastAutoScheduledAt: scheduledAt,
    lastAutoTriggeredAt: null,
    lastAutoSourceMessageId: sourceMessage.id,
    lastAutoSourceMessageIndex: sourceMessage.index_in_chat,
    lastAutoGenerationId: input.generationId
  };
  await tryPersistDiagnostics(diagnostics, input.userId);
  await sendState(input.chatId, input.userId, diagnostics.status, null, requestId);
}
async function runPendingAuto(key) {
  const pending = pendingAutoJobs.get(key);
  if (!pending) return;
  pendingAutoJobs.delete(key);
  const settings = await getSettings(pending.userId);
  if (settings.auto.onlyWhenChatActive && activeChatByUser.get(pending.userId) !== pending.chatId) {
    await markAutoSkipped(
      pending.chatId,
      pending.userId,
      pending.trigger,
      "Chat changed before the auto timer fired.",
      pending.scheduledAt
    );
    return;
  }
  if (activeJobs.has(pending.chatId)) {
    await markAutoSkipped(
      pending.chatId,
      pending.userId,
      pending.trigger,
      "A tracker generation is already running for this chat.",
      pending.scheduledAt
    );
    return;
  }
  await generateTracker(pending.chatId, pending.userId, pending.trigger);
}
async function handleGenerationEnded(payload, userId) {
  if (payload.error || !payload.messageId || isQuietGenerationType(payload.generationType)) return;
  const users = targetUsersForChat(payload.chatId, userId);
  if (users.length === 0) {
    spindle.log.warn(`LTracker ignored auto event without a known user for chat ${payload.chatId}.`);
    return;
  }
  const eventAt = nowIso();
  for (const targetUserId of users) {
    const settings = await getSettings(targetUserId);
    if (!settings.auto.autoModeEnabled) continue;
    const messages = await readChatMessages(payload.chatId);
    const message = messages.find((item) => item.id === payload.messageId);
    if (!message) {
      const trigger = {
        kind: "auto",
        requestId: `auto:GENERATION_ENDED:${payload.messageId}:${Date.now()}`,
        eventType: "GENERATION_ENDED",
        sourceMessageId: payload.messageId,
        sourceMessageIndex: null,
        generationId: payload.generationId,
        generationType: payload.generationType ?? null
      };
      await markAutoSkipped(payload.chatId, targetUserId, trigger, "Generated message was not found.", eventAt);
      continue;
    }
    if (message.is_user) {
      const trigger = createAutoTrigger({
        eventType: "GENERATION_ENDED",
        requestId: `auto:GENERATION_ENDED:${message.id}:${Date.now()}`,
        message,
        generationId: payload.generationId,
        generationType: payload.generationType ?? null
      });
      await markAutoSkipped(payload.chatId, targetUserId, trigger, "Generation ended on a user message.", eventAt);
      continue;
    }
    await scheduleAutoForMessage({
      chatId: payload.chatId,
      userId: targetUserId,
      eventType: "GENERATION_ENDED",
      eventAt,
      message,
      generationId: payload.generationId,
      generationType: payload.generationType ?? null
    });
  }
}
async function handleMessageSent(payload, userId) {
  const message = messageFromEventPayload(payload);
  if (!message || !message.is_user) return;
  const chatId = message.chat_id;
  const users = targetUsersForChat(chatId, userId);
  const eventAt = nowIso();
  for (const targetUserId of users) {
    await scheduleAutoForMessage({
      chatId,
      userId: targetUserId,
      eventType: "MESSAGE_SENT",
      eventAt,
      message,
      generationId: null,
      generationType: null
    });
  }
}
function handleChatSwitched(payload, userId) {
  if (!userId || !isRecord4(payload)) return;
  const chatId = typeof payload.chatId === "string" ? payload.chatId : null;
  rememberActiveChat(userId, chatId);
}
function stringAtPath2(value, path) {
  let current = value;
  for (const segment of path) {
    if (!isRecord4(current)) return null;
    current = current[segment];
  }
  return typeof current === "string" && current.trim() ? current : null;
}
function firstStringAtPath(value, paths) {
  for (const path of paths) {
    const result = stringAtPath2(value, path);
    if (result) return result;
  }
  return null;
}
function contextChatId(context) {
  return firstStringAtPath(context, [
    ["chatId"],
    ["chat_id"],
    ["chat", "id"],
    ["request", "chatId"],
    ["request", "chat_id"],
    ["request", "chat", "id"],
    ["input", "chatId"],
    ["input", "chat_id"],
    ["generation", "chatId"],
    ["generation", "chat_id"],
    ["metadata", "chatId"]
  ]);
}
function contextUserId(context) {
  return firstStringAtPath(context, [
    ["userId"],
    ["user_id"],
    ["operatorUserId"],
    ["request", "userId"],
    ["request", "user_id"],
    ["input", "userId"],
    ["generation", "userId"],
    ["metadata", "userId"]
  ]);
}
function knownUserForContext(userId, chatId) {
  if (userId) return userId;
  if (chatId) {
    const users = targetUsersForChat(chatId);
    if (users.length === 1) return users[0] ?? null;
  }
  if (activeChatByUser.size === 1) {
    return activeChatByUser.keys().next().value ?? null;
  }
  return null;
}
async function resolveContextChatId(context, userId) {
  const fromContext = contextChatId(context);
  if (fromContext) return fromContext;
  return resolveActiveChatId(null, userId).catch(() => null);
}
async function withContextTimeout(operation, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      operation.then((value) => ({ timedOut: false, value })),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true, value: null }), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function recordInjectionDiagnostics(chatId, userId, settings, decision, baseDiagnostics) {
  const currentDiagnostics = baseDiagnostics ?? await loadDiagnostics(chatId, userId);
  const diagnostics = {
    ...currentDiagnostics,
    injectionEnabled: settings.injection.enabled,
    lastInjectionAt: decision.text ? nowIso() : currentDiagnostics.lastInjectionAt,
    lastInjectionMode: settings.injection.mode,
    lastInjectionFormat: settings.injection.format,
    lastInjectedChars: decision.injectedChars,
    lastInjectionSkippedReason: decision.skippedReason,
    lastInjectionSnapshotCreatedAt: decision.snapshotCreatedAt,
    lastInjectionSourceMessageId: decision.sourceMessageId
  };
  await tryPersistDiagnostics(diagnostics, userId);
}
async function handleContextInjection(context) {
  const contextUser = contextUserId(context);
  const contextChat = contextChatId(context);
  const userId = knownUserForContext(contextUser, contextChat);
  if (!userId) return null;
  const chatId = await resolveContextChatId(context, userId);
  if (!chatId) return null;
  rememberActiveChat(userId, chatId);
  let storageResult;
  try {
    storageResult = await withContextTimeout((async () => {
      const settings2 = await getSettings(userId);
      const skipInternal = shouldSkipContextForInternalGeneration(context, internalTrackerGenerationDepth > 0);
      const diagnostics = await loadDiagnostics(chatId, userId);
      const snapshot = settings2.injection.mode === "latest_chat_snapshot" ? await loadSnapshot(chatId, userId) : null;
      const messageSnapshot = settings2.injection.mode === "latest_message_snapshot" ? await loadMessageSnapshot(chatId, diagnostics.latestAttachedMessageId, userId) : null;
      const decision = buildInjectionDecision({
        settings: settings2,
        chatSnapshot: snapshot,
        messageSnapshot,
        internalTrackerGeneration: skipInternal
      });
      await recordInjectionDiagnostics(chatId, userId, settings2, decision, diagnostics);
      return toContextHandlerResult(decision.text);
    })(), 750);
  } catch (error) {
    spindle.log.warn(`LTracker context injection skipped after storage error: ${errorMessage(error)}`);
    return null;
  }
  if (!storageResult.timedOut) return storageResult.value;
  const settings = await getSettings(userId).catch(() => null);
  if (settings) {
    await recordInjectionDiagnostics(chatId, userId, settings, {
      text: null,
      skippedReason: "Context handler storage lookup timed out.",
      snapshotCreatedAt: null,
      sourceMessageId: null,
      injectedChars: 0
    }).catch((error) => {
      spindle.log.warn(`LTracker could not record context timeout: ${errorMessage(error)}`);
    });
  }
  return null;
}
async function generateTracker(chatId, userId, trigger) {
  let stage = "active_chat";
  const requestId = trigger.requestId;
  const resolvedChatId = await resolveActiveChatId(chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const settings = await getSettings(userId).catch((error) => {
    stageError("storage", error);
  });
  const presetState = await resolveActivePreset(resolvedChatId, userId).catch((error) => {
    stageError("storage", error);
  });
  if (trigger.kind === "manual") {
    cancelPendingAutoForChat(resolvedChatId, userId, "Manual generation superseded the pending auto job.");
  }
  if (trigger.kind === "auto" && activeJobs.has(resolvedChatId)) {
    await markAutoSkipped(
      resolvedChatId,
      userId,
      trigger,
      "A tracker generation is already running for this chat.",
      nowIso()
    );
    return;
  }
  const existing = activeJobs.get(resolvedChatId);
  const lastCancellation = existing ? {
    jobId: existing.jobId,
    requestId: existing.requestId,
    reason: "Cancelled by a newer Generate Tracker request.",
    createdAt: nowIso()
  } : null;
  existing?.controller.abort();
  const job = {
    controller: new AbortController(),
    jobId: newJobId(),
    requestId,
    sourceKind: trigger.kind
  };
  activeJobs.set(resolvedChatId, job);
  const startedAtMs = Date.now();
  let diagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    status: "generating",
    lastJobId: job.jobId,
    lastRequestId: requestId,
    lastGenerationSource: trigger.kind,
    lastGenerationStartedAt: new Date(startedAtMs).toISOString(),
    lastGenerationCompletedAt: null,
    lastGenerationDurationMs: null,
    lastMessagesRead: 0,
    lastSourceMessageIds: [],
    lastSourceMessageRange: null,
    lastRawOutput: null,
    lastParsedTracker: null,
    lastPromptPreview: null,
    lastError: null,
    lastCancellation,
    lastAutoTriggeredAt: trigger.kind === "auto" ? new Date(startedAtMs).toISOString() : null,
    selectedPresetId: presetState.activePreset.id,
    selectedPresetName: presetState.activePreset.name,
    lastPresetFallbackReason: presetState.fallbackReason,
    lastPresetValidationError: null,
    lastPromptUsedPresetId: null,
    lastPromptUsedPresetName: null
  };
  if (trigger.kind === "auto") {
    diagnostics = {
      ...diagnostics,
      lastAutoEventType: trigger.eventType,
      lastAutoSkippedReason: null,
      lastAutoSourceMessageId: trigger.sourceMessageId,
      lastAutoSourceMessageIndex: trigger.sourceMessageIndex,
      lastAutoGenerationId: trigger.generationId
    };
  }
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, "generating", null, requestId);
  try {
    stage = "read_messages";
    const rawMessages = await getRecentMessages(resolvedChatId, settings);
    const transcriptMessages = normalizeMessages(rawMessages);
    if (transcriptMessages.length === 0) {
      throw new LTrackerStageError("read_messages", "This chat has no readable messages to track.");
    }
    const sourceMessageIds = rawMessages.map((message) => message.id);
    diagnostics = {
      ...diagnostics,
      lastMessagesRead: rawMessages.length,
      lastSourceMessageIds: sourceMessageIds,
      lastSourceMessageRange: sourceRange(sourceMessageIds)
    };
    stage = "prompt";
    const transcript = buildCompactTranscript(transcriptMessages, settings.maxMessageChars);
    const promptMessages = buildTrackerPrompt(transcript, presetState.activePreset);
    diagnostics = {
      ...diagnostics,
      lastPromptUsedPresetId: presetState.activePreset.id,
      lastPromptUsedPresetName: presetState.activePreset.name,
      lastPromptPreview: settings.savePromptPreview ? promptPreview(promptMessages) : "[Prompt preview saving disabled]"
    };
    await tryPersistDiagnostics(diagnostics, userId);
    stage = "generation";
    const rawOutput = await runTrackerGeneration(promptMessages, userId, settings, job.controller.signal);
    if (!isCurrentJob(resolvedChatId, job.jobId)) return;
    diagnostics = {
      ...diagnostics,
      lastRawOutput: settings.saveRawOutput ? rawOutput : "[Raw output saving disabled]"
    };
    stage = "parse";
    const data = parseTrackerJson(rawOutput);
    if (!isCurrentJob(resolvedChatId, job.jobId)) return;
    if (trigger.kind === "auto" && settings.auto.onlyWhenChatActive && activeChatByUser.get(userId) !== resolvedChatId) {
      const completedAtMs2 = Date.now();
      diagnostics = {
        ...diagnostics,
        status: "idle",
        lastGenerationCompletedAt: new Date(completedAtMs2).toISOString(),
        lastGenerationDurationMs: completedAtMs2 - startedAtMs,
        lastAutoSkippedReason: "Chat changed before the auto tracker result was saved.",
        lastError: null
      };
      await persistDiagnostics(diagnostics, userId);
      await sendState(resolvedChatId, userId, "idle", null, requestId);
      return;
    }
    const completedAtMs = Date.now();
    const completedAt = new Date(completedAtMs).toISOString();
    const snapshot = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      extensionVersion: EXTENSION_VERSION,
      chatId: resolvedChatId,
      createdAt: completedAt,
      messageCount: transcriptMessages.length,
      sourceMessageIds,
      data
    };
    stage = "storage";
    await saveSnapshot(snapshot, userId);
    diagnostics = {
      ...diagnostics,
      status: "idle",
      lastGenerationCompletedAt: completedAt,
      lastGenerationDurationMs: completedAtMs - startedAtMs,
      lastParsedTracker: data,
      lastError: null
    };
    if (trigger.kind === "auto" && settings.auto.attachSnapshotToMessage) {
      const attachedAt = nowIso();
      const storageKey = messageSnapshotPath(resolvedChatId, trigger.sourceMessageId);
      const attachedSnapshot = {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        extensionVersion: EXTENSION_VERSION,
        chatId: resolvedChatId,
        messageId: trigger.sourceMessageId,
        messageIndex: trigger.sourceMessageIndex,
        trigger,
        snapshot,
        attachedAt
      };
      await saveMessageAttachedSnapshot(attachedSnapshot, userId);
      diagnostics = {
        ...diagnostics,
        latestAttachedMessageId: trigger.sourceMessageId,
        latestAttachedMessageIndex: trigger.sourceMessageIndex,
        latestAttachedSnapshotAt: attachedAt,
        latestAttachedSnapshotStorageKey: storageKey
      };
    }
    await persistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId);
  } catch (error) {
    if (!isCurrentJob(resolvedChatId, job.jobId)) return;
    if (trigger.kind === "auto" && job.controller.signal.aborted && job.cancelReason) {
      const completedAtMs2 = Date.now();
      diagnostics = {
        ...diagnostics,
        status: "idle",
        lastGenerationCompletedAt: new Date(completedAtMs2).toISOString(),
        lastGenerationDurationMs: completedAtMs2 - startedAtMs,
        lastCancellation: {
          jobId: job.jobId,
          requestId,
          reason: job.cancelReason,
          createdAt: nowIso()
        },
        lastAutoSkippedReason: job.cancelReason,
        lastError: null
      };
      await tryPersistDiagnostics(diagnostics, userId);
      await sendState(resolvedChatId, userId, "idle", null, requestId);
      return;
    }
    const currentError = diagnosticError(error, stage);
    const completedAtMs = Date.now();
    diagnostics = {
      ...diagnostics,
      status: "error",
      lastGenerationCompletedAt: new Date(completedAtMs).toISOString(),
      lastGenerationDurationMs: completedAtMs - startedAtMs,
      lastError: currentError
    };
    await tryPersistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "error", currentError, requestId);
  } finally {
    if (isCurrentJob(resolvedChatId, job.jobId)) activeJobs.delete(resolvedChatId);
  }
}
async function clearSnapshot(chatId, userId, requestId) {
  const resolvedChatId = await resolveActiveChatId(chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const path = snapshotPath(resolvedChatId);
  try {
    if (await spindle.userStorage.exists(path, userId)) {
      await spindle.userStorage.delete(path, userId);
    }
    const diagnostics = {
      ...await loadDiagnostics(resolvedChatId, userId),
      status: "idle",
      lastParsedTracker: null,
      lastError: null
    };
    await persistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId);
  } catch (error) {
    stageError("storage", error);
  }
}
function normalizePresetDraft(value) {
  const draft = {
    name: typeof value.name === "string" ? value.name : "",
    description: typeof value.description === "string" ? value.description : "",
    version: typeof value.version === "string" ? value.version : "1.0",
    jsonSchema: isRecord4(value.jsonSchema) && !Array.isArray(value.jsonSchema) ? value.jsonSchema : {},
    promptInstructions: typeof value.promptInstructions === "string" ? value.promptInstructions : ""
  };
  if (typeof value.id === "string") draft.id = value.id;
  if (typeof value.htmlTemplate === "string") draft.htmlTemplate = value.htmlTemplate;
  if (typeof value.notes === "string") draft.notes = value.notes;
  if (isRecord4(value.capabilities)) {
    const capabilities = {};
    if (typeof value.capabilities.supportsHtmlTemplate === "boolean") {
      capabilities.supportsHtmlTemplate = value.capabilities.supportsHtmlTemplate;
    }
    if (typeof value.capabilities.supportsPartialRegeneration === "boolean") {
      capabilities.supportsPartialRegeneration = value.capabilities.supportsPartialRegeneration;
    }
    if (typeof value.capabilities.supportsSequentialGeneration === "boolean") {
      capabilities.supportsSequentialGeneration = value.capabilities.supportsSequentialGeneration;
    }
    if (Object.keys(capabilities).length > 0) draft.capabilities = capabilities;
  }
  return draft;
}
function validatePresetDraft(draft) {
  const schemaValidation = validateJsonSchema(draft.jsonSchema);
  if (!schemaValidation.ok) return schemaValidation.error;
  if (!draft.name.trim()) return "Preset name is required.";
  if (!draft.version.trim()) return "Preset version is required.";
  if (!draft.promptInstructions.trim()) return "Prompt instructions are required.";
  return null;
}
async function presetOperationChatId(chatId, userId) {
  return resolveActiveChatId(chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
}
async function recordPresetDiagnostic(chatId, userId, fields) {
  const diagnostics = {
    ...await loadDiagnostics(chatId, userId),
    ...fields
  };
  await tryPersistDiagnostics(diagnostics, userId);
}
async function selectPreset(chatId, userId, presetId, requestId) {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  const presets = await loadPresetCatalog(userId);
  const selected = presetById(presets, presetId);
  if (!selected) throw new Error(`Preset ${presetId} was not found.`);
  await saveActivePresetState(resolvedChatId, selected.id, userId);
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetValidationError: null,
    lastPresetFallbackReason: null
  });
  await sendState(resolvedChatId, userId, "idle", null, requestId);
}
async function savePresetFromDraft(input) {
  const resolvedChatId = await presetOperationChatId(input.chatId, input.userId);
  const draft = normalizePresetDraft(input.draft);
  const validationError = validatePresetDraft(draft);
  if (validationError) {
    await recordPresetDiagnostic(resolvedChatId, input.userId, {
      lastPresetValidationError: validationError,
      lastPresetFallbackReason: null
    });
    throw new Error(validationError);
  }
  const presets = await loadPresetCatalog(input.userId);
  const existingIds = presets.map((preset2) => preset2.id);
  const now = nowIso();
  const existing = input.presetId ? presetById(presets, input.presetId) : null;
  if (input.mode === "update") {
    if (!existing) throw new Error("Preset to update was not found.");
    if (!canModifyPreset(existing)) throw new Error("Built-in presets cannot be overwritten.");
  }
  const id = input.mode === "update" && input.presetId ? input.presetId : createPresetId(draft.name, existingIds);
  const preset = draftToPreset(draft, {
    id,
    origin: existing?.origin === "user_imported" && input.mode === "update" ? "user_imported" : "user_created",
    now,
    existing: input.mode === "update" ? existing : null
  });
  await saveUserPreset(preset, input.userId);
  await saveActivePresetState(resolvedChatId, preset.id, input.userId);
  await recordPresetDiagnostic(resolvedChatId, input.userId, {
    lastPresetValidationError: null,
    lastPresetFallbackReason: null
  });
  await sendState(resolvedChatId, input.userId, "idle", null, input.requestId);
}
async function deletePreset(chatId, userId, presetId, requestId) {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  const presets = await loadPresetCatalog(userId);
  const preset = presetById(presets, presetId);
  if (!preset) throw new Error("Preset to delete was not found.");
  if (!canModifyPreset(preset)) throw new Error("Built-in presets cannot be deleted.");
  await deleteUserPreset(presetId, userId);
  const active = await loadActivePresetState(resolvedChatId, userId);
  if (active.selectedPresetId === presetId) {
    await saveActivePresetState(resolvedChatId, DEFAULT_TRACKER_PRESET_ID, userId);
  }
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetValidationError: null,
    lastPresetFallbackReason: null
  });
  await sendState(resolvedChatId, userId, "idle", null, requestId);
}
async function resetPreset(chatId, userId, requestId) {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  await saveActivePresetState(resolvedChatId, DEFAULT_TRACKER_PRESET_ID, userId);
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetValidationError: null,
    lastPresetFallbackReason: null
  });
  await sendState(resolvedChatId, userId, "idle", null, requestId);
}
async function importPreset(chatId, userId, importText, requestId) {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  let parsed;
  try {
    parsed = JSON.parse(importText);
  } catch (error) {
    const message = `Import JSON is invalid: ${errorMessage(error)}`;
    await recordPresetDiagnostic(resolvedChatId, userId, {
      lastPresetValidationError: message,
      lastPresetFallbackReason: null
    });
    throw new Error(message);
  }
  const presets = await loadPresetCatalog(userId);
  const imported = importTrackerPresetEnvelope(parsed, presets.map((preset) => preset.id), nowIso());
  if (!imported.ok || !imported.preset) {
    const message = imported.error ?? "Imported preset is invalid.";
    await recordPresetDiagnostic(resolvedChatId, userId, {
      lastPresetValidationError: message,
      lastPresetFallbackReason: null
    });
    throw new Error(message);
  }
  await saveUserPreset(imported.preset, userId);
  await saveActivePresetState(resolvedChatId, imported.preset.id, userId);
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetValidationError: null,
    lastPresetFallbackReason: null
  });
  await sendState(resolvedChatId, userId, "idle", null, requestId);
}
async function validatePreset(chatId, userId, draftValue, requestId) {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  const draft = normalizePresetDraft(draftValue);
  const validationError = validatePresetDraft(draft);
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetValidationError: validationError,
    lastPresetFallbackReason: null
  });
  if (validationError) throw new Error(validationError);
  await sendState(resolvedChatId, userId, "idle", null, requestId);
}
async function handleSettingsSave(payload, userId) {
  const settings = await saveSettings(payload.settings, userId).catch((error) => {
    stageError("storage", error);
  });
  const resolvedChatId = payload.chatId ? payload.chatId : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  if (!settings.auto.autoModeEnabled && resolvedChatId) {
    cancelPendingAutoForChat(resolvedChatId, userId, "Auto mode was disabled.");
    abortAutoJobForChat(resolvedChatId, "Auto mode was disabled before the tracker result was saved.");
  }
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function handleSettingsReset(payload, userId) {
  await resetSettings(userId).catch((error) => {
    stageError("storage", error);
  });
  const resolvedChatId = payload.chatId ? payload.chatId : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  if (resolvedChatId) {
    cancelPendingAutoForChat(resolvedChatId, userId, "Settings were reset.");
    abortAutoJobForChat(resolvedChatId, "Settings were reset before the auto tracker result was saved.");
  }
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function handleRefresh(payload, userId) {
  const resolvedChatId = payload.chatId ? payload.chatId : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  await sendState(resolvedChatId, userId, void 0, null);
}
function disposeBackend() {
  if (disposed) return;
  disposed = true;
  for (const pending of pendingAutoJobs.values()) clearTimeout(pending.timer);
  pendingAutoJobs.clear();
  for (const job of activeJobs.values()) job.controller.abort();
  activeJobs.clear();
  for (const cleanup of eventCleanups.splice(0).reverse()) cleanup();
  autoSubscriptionsActive = false;
  contextHandlerRegistered = false;
}
function registerEventListeners() {
  eventCleanups.push(spindle.on("GENERATION_ENDED", (payload, userId) => {
    void handleGenerationEnded(payload, userId).catch((error) => {
      spindle.log.warn(`LTracker generation-ended handler failed: ${errorMessage(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("MESSAGE_SENT", (payload, userId) => {
    void handleMessageSent(payload, userId).catch((error) => {
      spindle.log.warn(`LTracker message-sent handler failed: ${errorMessage(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("CHAT_SWITCHED", handleChatSwitched));
  eventCleanups.push(spindle.on("EXTENSION_UNLOADED", disposeBackend));
  autoSubscriptionsActive = true;
}
function registerContextInjection() {
  if (contextHandlerRegistered) return;
  if (!permissionState().contextHandler) {
    spindle.log.warn("LTracker context injection is unavailable because context_handler permission is missing.");
    return;
  }
  spindle.registerContextHandler(handleContextInjection, 40);
  contextHandlerRegistered = true;
}
registerEventListeners();
registerContextInjection();
spindle.onFrontendMessage((payload, userId) => {
  if (!isFrontendMessage(payload)) return;
  const requestId = "requestId" in payload ? payload.requestId : void 0;
  const chatId = payload.chatId;
  if (chatId) rememberActiveChat(userId, chatId);
  void (async () => {
    try {
      if (payload.type === "generate_tracker") {
        await generateTracker(chatId, userId, createManualTrigger(payload.requestId));
        return;
      }
      if (payload.type === "clear_snapshot") {
        await clearSnapshot(chatId, userId, payload.requestId);
        return;
      }
      if (payload.type === "save_settings") {
        await handleSettingsSave(payload, userId);
        return;
      }
      if (payload.type === "reset_settings") {
        await handleSettingsReset(payload, userId);
        return;
      }
      if (payload.type === "select_preset") {
        await selectPreset(chatId, userId, payload.presetId, payload.requestId);
        return;
      }
      if (payload.type === "save_preset_as_new") {
        await savePresetFromDraft({
          chatId,
          userId,
          requestId: payload.requestId,
          draft: payload.preset,
          mode: "new"
        });
        return;
      }
      if (payload.type === "duplicate_preset") {
        await savePresetFromDraft({
          chatId,
          userId,
          requestId: payload.requestId,
          draft: payload.preset,
          mode: "duplicate"
        });
        return;
      }
      if (payload.type === "update_preset") {
        await savePresetFromDraft({
          chatId,
          userId,
          requestId: payload.requestId,
          draft: payload.preset,
          mode: "update",
          presetId: payload.presetId
        });
        return;
      }
      if (payload.type === "delete_preset") {
        await deletePreset(chatId, userId, payload.presetId, payload.requestId);
        return;
      }
      if (payload.type === "reset_preset") {
        await resetPreset(chatId, userId, payload.requestId);
        return;
      }
      if (payload.type === "import_preset") {
        await importPreset(chatId, userId, payload.importText, payload.requestId);
        return;
      }
      if (payload.type === "validate_preset") {
        await validatePreset(chatId, userId, payload.preset, payload.requestId);
        return;
      }
      await handleRefresh(payload, userId);
    } catch (error) {
      const currentError = diagnosticError(error, "unknown");
      spindle.log.warn(`LTracker request failed: ${currentError.message}`);
      const state = await buildState(chatId, userId, "error", currentError);
      const response = {
        type: "error",
        message: currentError.message,
        state
      };
      if (requestId) response.requestId = requestId;
      send(response, userId);
    }
  })();
});
spindle.log.info("LTracker backend loaded.");
