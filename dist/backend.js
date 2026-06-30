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
function metadataLines(snapshot, sourceMessageId, _settings) {
  const lines = [];
  lines.push(`Generated: ${snapshot.createdAt}`);
  if (sourceMessageId) lines.push(`Source message: ${sourceMessageId}`);
  return lines;
}
function formatCompact(snapshot, sourceMessageId, settings) {
  const lines = [];
  if (settings.includeHeader) lines.push(`[${settings.header || "LTracker Snapshot"}]`);
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
  if (settings.includeHeader) lines.push(`[${settings.header || "LTracker Snapshot JSON"}]`);
  lines.push(...metadataLines(snapshot, sourceMessageId, settings));
  lines.push(JSON.stringify(payload, null, 2));
  return lines.join("\n");
}
function formatMinimal(snapshot, sourceMessageId, settings) {
  const lines = [];
  if (settings.includeHeader) lines.push(`[${settings.header || "LTracker Mini-State"}]`);
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
  const raw = settings.format === "embedded_tag" ? `<ltracker type="state">
${JSON.stringify(snapshot.data, null, 2)}
</ltracker>` : settings.format === "pretty_json" ? formatPrettyJson(source, snapshot, sourceMessageId, settings) : settings.format === "minimal" ? formatMinimal(snapshot, sourceMessageId, settings) : formatCompact(snapshot, sourceMessageId, settings);
  return truncateSafe(raw, settings.maxInjectedChars);
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

// src/shared/budget.ts
var CHARS_PER_ESTIMATED_TOKEN = 4;
var NORMAL_BUDGET_DEFAULTS = {
  recentMessageBudgetTokens: 16e3,
  perMessageBudgetTokens: 12e3,
  trackerMemoryBudgetTokens: 12e3,
  promptInjectionBudgetTokens: 12e3,
  maxTrackerOutputTokens: 8e3,
  promptPreviewBudgetTokens: 16e3,
  renderedHtmlMaxChars: 25e4,
  rawOutputMaxChars: 25e4,
  presetImportMaxChars: 1e7
};
var ULTRA_BUDGET_DEFAULTS = {
  recentMessageBudgetTokens: 128e3,
  perMessageBudgetTokens: 4e4,
  trackerMemoryBudgetTokens: 64e3,
  promptInjectionBudgetTokens: 64e3,
  maxTrackerOutputTokens: 64e3,
  promptPreviewBudgetTokens: 128e3,
  renderedHtmlMaxChars: 2e6,
  rawOutputMaxChars: 2e6,
  presetImportMaxChars: 5e7
};
function estimateTokensFromChars(chars) {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars / CHARS_PER_ESTIMATED_TOKEN);
}
function estimateCharsFromTokens(tokens) {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;
  return Math.round(tokens * CHARS_PER_ESTIMATED_TOKEN);
}
function tokenBudgetToChars(tokens, fallbackChars) {
  const chars = estimateCharsFromTokens(tokens);
  return chars > 0 ? chars : fallbackChars;
}
function budgetDefaults(ultraModeEnabled) {
  return ultraModeEnabled ? ULTRA_BUDGET_DEFAULTS : NORMAL_BUDGET_DEFAULTS;
}
function effectivePerMessageChars(settings) {
  if (settings.budget.mode === "estimated_tokens") {
    return tokenBudgetToChars(settings.budget.perMessageBudgetTokens, settings.maxMessageChars);
  }
  return settings.maxMessageChars;
}
function effectiveRecentTranscriptChars(settings) {
  if (settings.budget.mode === "estimated_tokens") {
    return tokenBudgetToChars(settings.budget.recentMessageBudgetTokens, settings.maxMessageChars * settings.recentMessageLimit);
  }
  return Math.max(settings.maxMessageChars, settings.maxMessageChars * settings.recentMessageLimit);
}
function effectiveTrackerMemoryChars(settings) {
  if (settings.budget.mode === "estimated_tokens") {
    return tokenBudgetToChars(settings.budget.trackerMemoryBudgetTokens, settings.memory.maxMemoryChars);
  }
  return settings.memory.maxMemoryChars;
}
function effectivePromptInjectionChars(settings) {
  if (settings.budget.mode === "estimated_tokens") {
    return tokenBudgetToChars(settings.budget.promptInjectionBudgetTokens, settings.injection.maxInjectedChars);
  }
  return settings.injection.maxInjectedChars;
}
function effectivePromptPreviewChars(settings) {
  if (settings.budget.mode === "estimated_tokens") {
    return tokenBudgetToChars(settings.budget.promptPreviewBudgetTokens, 64e3);
  }
  return 64e3;
}
function effectiveTrackerOutputTokens(settings) {
  return Math.max(256, Math.round(settings.budget.maxTrackerOutputTokens));
}

// src/shared/contextFilters.ts
function normalize(value, caseSensitive) {
  return caseSensitive ? value : value.toLowerCase();
}
function listMatches(value, patterns, caseSensitive, exact) {
  if (!value.trim() || patterns.length === 0) return null;
  const compared = normalize(value.trim(), caseSensitive);
  for (const pattern of patterns) {
    const cleaned = pattern.trim();
    if (!cleaned) continue;
    const next = normalize(cleaned, caseSensitive);
    if (exact ? compared === next : compared.includes(next) || next.includes(compared)) {
      return cleaned;
    }
  }
  return null;
}
function textPatternMatches(value, patterns, caseSensitive) {
  if (!value.trim() || patterns.length === 0) return null;
  const compared = normalize(value, caseSensitive);
  for (const pattern of patterns) {
    const cleaned = pattern.trim();
    if (!cleaned) continue;
    if (compared.includes(normalize(cleaned, caseSensitive))) return cleaned;
  }
  return null;
}
function looksSystemLikeMessage(message) {
  const head = message.content.trim().slice(0, 80).toLowerCase();
  const name = message.name.trim().toLowerCase();
  return name === "system" || name === "narrator" || head.startsWith("system:") || head.startsWith("[system") || head.startsWith("<system") || head.startsWith("ooc:") || head.startsWith("(ooc") || head.startsWith("[ooc") || head.startsWith("meta:") || head.startsWith("[meta");
}
function exclusionReasonForMessage(message, filters) {
  if (!filters.enabled) return null;
  if (message.role === "user" && filters.excludeUserMessages) return "user messages disabled";
  if (message.role === "assistant" && filters.excludeAssistantMessages) return "assistant messages disabled";
  if (filters.excludeSystemLikeMessages && looksSystemLikeMessage(message)) return "system/OOC-like message";
  const nameMatch = listMatches(
    message.name,
    filters.excludedCharacterNames,
    filters.caseSensitiveExclusions,
    filters.requireExactCharacterNameMatch
  );
  if (nameMatch) return `excluded name: ${nameMatch}`;
  const patternMatch = textPatternMatches(
    `${message.name}
${message.content}`,
    filters.excludedMessageNamePatterns,
    filters.caseSensitiveExclusions
  );
  if (patternMatch) return `excluded text pattern: ${patternMatch}`;
  return null;
}
function applyContextFiltersToTranscript(messages, filters) {
  const originalMessages = messages.map((message) => ({ ...message }));
  if (!filters.enabled) {
    return {
      enabled: false,
      originalMessages,
      includedMessages: originalMessages,
      excludedMessages: [],
      messageCount: originalMessages.length,
      includedCount: originalMessages.length,
      excludedCount: 0,
      excludedNames: [],
      reasons: [],
      warning: null
    };
  }
  if (!filters.includeChatMessages) {
    return {
      enabled: true,
      originalMessages,
      includedMessages: [],
      excludedMessages: originalMessages.map((message) => ({
        index: message.index,
        role: message.role,
        name: message.name,
        reason: "chat messages disabled"
      })),
      messageCount: originalMessages.length,
      includedCount: 0,
      excludedCount: originalMessages.length,
      excludedNames: Array.from(new Set(originalMessages.map((message) => message.name).filter(Boolean))),
      reasons: ["chat messages disabled"],
      warning: "Context filters excluded every chat message."
    };
  }
  const includedMessages = [];
  const excludedMessages = [];
  const reasons = /* @__PURE__ */ new Set();
  const excludedNames = /* @__PURE__ */ new Set();
  for (const message of originalMessages) {
    const reason = exclusionReasonForMessage(message, filters);
    if (!reason) {
      includedMessages.push({ ...message });
      continue;
    }
    excludedMessages.push({
      index: message.index,
      role: message.role,
      name: message.name,
      reason
    });
    reasons.add(reason);
    if (message.name.trim()) excludedNames.add(message.name.trim());
  }
  return {
    enabled: true,
    originalMessages,
    includedMessages,
    excludedMessages,
    messageCount: originalMessages.length,
    includedCount: includedMessages.length,
    excludedCount: excludedMessages.length,
    excludedNames: Array.from(excludedNames).sort((a, b) => a.localeCompare(b)),
    reasons: Array.from(reasons).sort((a, b) => a.localeCompare(b)),
    warning: originalMessages.length > 0 && includedMessages.length === 0 ? "Context filters excluded every chat message." : null
  };
}
function autoSkipReasonForContextFilters(input) {
  const filters = input.settings.contextFilters;
  if (!filters.enabled) return null;
  const synthetic = {
    index: 0,
    role: input.role,
    name: input.name,
    content: input.content
  };
  const reason = exclusionReasonForMessage(synthetic, filters);
  if (!reason) return null;
  if (reason.startsWith("excluded name") && !filters.disableAutoForExcludedNames) return null;
  if (!filters.disableAutoWhenSourceFiltered && !reason.startsWith("excluded name")) return null;
  return `Auto skipped by context filters: ${reason}.`;
}
function formatContextFilterReport(result) {
  if (!result.enabled) return "Context filters disabled. All readable chat messages were eligible.";
  const lines = [
    `Messages considered: ${result.messageCount}`,
    `Messages included: ${result.includedCount}`,
    `Messages skipped: ${result.excludedCount}`
  ];
  if (result.excludedNames.length > 0) lines.push(`Skipped names: ${result.excludedNames.join(", ")}`);
  if (result.reasons.length > 0) lines.push(`Skip reasons: ${result.reasons.join("; ")}`);
  if (result.warning) lines.push(`Warning: ${result.warning}`);
  return lines.join("\n");
}
function contextBudgetPreview(buckets) {
  const normalized = buckets.map((bucket) => {
    const chars = bucket.text.length;
    return {
      key: bucket.key,
      label: bucket.label,
      chars,
      estimatedTokens: estimateTokensFromChars(chars)
    };
  });
  return {
    buckets: normalized,
    totalChars: normalized.reduce((sum, bucket) => sum + bucket.chars, 0),
    totalEstimatedTokens: normalized.reduce((sum, bucket) => sum + bucket.estimatedTokens, 0)
  };
}
function formatContextBudgetPreview(preview) {
  const lines = preview.buckets.map((bucket) => `${bucket.label}: ~${bucket.estimatedTokens} tokens (${bucket.chars} chars)`);
  lines.push(`Total: ~${preview.totalEstimatedTokens} tokens (${preview.totalChars} chars)`);
  return lines.join("\n");
}

// src/shared/contextHandlerRuntime.ts
var CONTEXT_HANDLER_EXPERIMENTAL_ENABLED = false;
var CONTEXT_HANDLER_DISABLED_REASON = "Context handler injection remains disabled in 0.16; safe normal prompt injection uses the Lumiverse interceptor path instead.";

// src/shared/types.ts
var EXTENSION_VERSION = "0.26";
var STORAGE_SCHEMA_VERSION = 1;
var SETTINGS_SCHEMA_VERSION = 1;
var SPINDLE_TYPES_VERSION = "0.5.21";

// src/shared/embeddedTrackerTag.ts
var LTRACKER_TAG_NAME = "ltracker";
var LTRACKER_TAG_TYPE = "state";
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function normalizeAttrValue(value) {
  return value.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function parseTagAttributes(raw) {
  const attrs = {};
  const pattern = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    const key = match[1]?.toLowerCase();
    if (!key) continue;
    attrs[key] = normalizeAttrValue(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}
function buildLTrackerTag(jsonText, swipeKey, version = EXTENSION_VERSION) {
  return `<${LTRACKER_TAG_NAME} type="${LTRACKER_TAG_TYPE}" version="${escapeAttribute(version)}" swipe="${escapeAttribute(swipeKey)}">
${jsonText.trim()}
</${LTRACKER_TAG_NAME}>`;
}
function findLTrackerTags(content) {
  const tag = escapeRegex(LTRACKER_TAG_NAME);
  const pattern = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const matches = [];
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const body = (match[2] ?? "").trim();
    if (body.toLowerCase().includes(`<${LTRACKER_TAG_NAME}`)) {
      continue;
    }
    const attrs = parseTagAttributes(match[1] ?? "");
    if (attrs.type && attrs.type !== LTRACKER_TAG_TYPE) continue;
    matches.push({
      fullMatch: match[0],
      content: body,
      attrs,
      start: match.index,
      end: match.index + match[0].length
    });
  }
  return matches;
}
function findLTrackerTagForSwipe(content, swipeKey) {
  return findLTrackerTags(content).find((tag) => (tag.attrs.swipe || "default") === swipeKey) ?? null;
}
function upsertLTrackerTag(content, jsonText, swipeKey, placement = "append") {
  const tag = buildLTrackerTag(jsonText, swipeKey);
  const existing = findLTrackerTagForSwipe(content, swipeKey);
  if (existing) {
    return {
      content: `${content.slice(0, existing.start)}${tag}${content.slice(existing.end)}`,
      inserted: false,
      replaced: true
    };
  }
  const trimmed = content.trimEnd();
  return {
    content: placement === "prepend" ? `${tag}

${content.trimStart()}` : `${trimmed}${trimmed ? "\n\n" : ""}${tag}`,
    inserted: true,
    replaced: false
  };
}
function removeLTrackerTag(content, swipeKey) {
  const existing = findLTrackerTagForSwipe(content, swipeKey);
  if (!existing) return { content, removed: false };
  const next = `${content.slice(0, existing.start)}${content.slice(existing.end)}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  return { content: next, removed: true };
}

// src/shared/htmlTemplateRenderer.ts
var TEMPLATE_TOKEN_PATTERN = /\{\{\s*([\s\S]*?)\s*\}\}/g;
var ALLOWED_TAGS = /* @__PURE__ */ new Set([
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "span",
  "p",
  "br",
  "hr",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "small",
  "h1",
  "h2",
  "h3",
  "h4",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "details",
  "summary",
  "button",
  "code",
  "pre"
]);
var SVG_DEFS_TAG = String.fromCharCode(100, 101, 102, 115);
var SVG_OFFSET_ATTRIBUTE = String.fromCharCode(111, 102, 102, 115, 101, 116);
var ALLOWED_SVG_TAGS = /* @__PURE__ */ new Set([
  "svg",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "g",
  SVG_DEFS_TAG,
  "lineargradient",
  "radialgradient",
  "stop"
]);
var VOID_TAGS = /* @__PURE__ */ new Set(["br", "hr"]);
var ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set(["class", "title", "aria-label", "data-ltracker-section", "role", "aria-hidden", "type"]);
var OWNER_POWER_ACTION_ATTRIBUTES = /* @__PURE__ */ new Set([
  "data-ltracker-power-action",
  "data-target",
  "data-class",
  "data-path",
  "data-text",
  "data-ltracker-power-panel"
]);
var SVG_ATTRIBUTES = /* @__PURE__ */ new Set([
  "viewbox",
  "fill",
  "stroke",
  "stroke-width",
  "d",
  "cx",
  "cy",
  "r",
  "x",
  "y",
  "width",
  "height",
  "points",
  "x1",
  "x2",
  "y1",
  "y2",
  SVG_OFFSET_ATTRIBUTE,
  "stop-color",
  "stop-opacity",
  "opacity",
  "class",
  "aria-hidden",
  "role"
]);
var DANGEROUS_CONTAINER_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "form",
  "input",
  "textarea",
  "select",
  "foreignobject",
  "image",
  "math"
];
var SAFE_STYLE_PROPERTIES = /* @__PURE__ */ new Set([
  "color",
  "background",
  "background-color",
  "background-image",
  "border",
  "border-top",
  "border-bottom",
  "border-left",
  "border-right",
  "border-color",
  "border-radius",
  "border-width",
  "box-shadow",
  "box-sizing",
  "padding",
  "padding-top",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "margin",
  "margin-top",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "font-size",
  "font-weight",
  "font-style",
  "font-family",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "display",
  "gap",
  "row-gap",
  "column-gap",
  "grid-template-columns",
  "grid-template-rows",
  "grid-template-areas",
  "grid-auto-flow",
  "flex",
  "flex-wrap",
  "flex-direction",
  "align-items",
  "align-content",
  "justify-content",
  "justify-items",
  "width",
  "max-width",
  "min-width",
  "height",
  "max-height",
  "min-height",
  "overflow",
  "overflow-x",
  "overflow-y",
  "overflow-wrap",
  "word-break",
  "white-space",
  "opacity",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "inset",
  "aspect-ratio",
  "transform",
  "transform-origin",
  "transition",
  "transition-property",
  "transition-duration",
  "transition-timing-function",
  "animation",
  "animation-name",
  "animation-duration",
  "animation-timing-function",
  "animation-iteration-count",
  "filter",
  "place-items",
  "place-content",
  "justify-self",
  "align-self",
  "text-overflow",
  "isolation",
  "contain",
  "pointer-events",
  "user-select",
  "backdrop-filter",
  "-webkit-backdrop-filter"
]);
var INLINE_HELPERS = /* @__PURE__ */ new Set([
  "default",
  "percent",
  "json",
  "eq",
  "gt",
  "lt",
  "and",
  "or",
  "not",
  "class",
  "safeClass",
  "lower",
  "upper",
  "truncate",
  "length",
  "join",
  "pluck",
  "pluckJoin",
  "get",
  "coalesce",
  "isArray",
  "isObject",
  "isEmpty",
  "notEmpty",
  "clamp",
  "meterWidth",
  "nl2br",
  "chip",
  "chipList",
  "fieldChip",
  "fieldChipList"
]);
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function safeHtml(html) {
  return { __ltrackerSafeHtml: true, html };
}
function isSafeHtmlValue(value) {
  return isRecord2(value) && value.__ltrackerSafeHtml === true && typeof value.html === "string";
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function truncateSafe2(value, maxChars) {
  const chars = Array.from(value);
  if (chars.length <= maxChars) return { value, truncated: false };
  const suffix = "\n[truncated]";
  const suffixChars = Array.from(suffix);
  if (maxChars <= 0) return { value: "", truncated: true };
  if (maxChars <= suffixChars.length) {
    return { value: suffixChars.slice(0, maxChars).join(""), truncated: true };
  }
  const keep = Math.max(0, maxChars - suffixChars.length);
  return { value: `${chars.slice(0, keep).join("")}${suffix}`, truncated: true };
}
function valueAtPath(source, path) {
  if (!path) return source;
  let current = source;
  for (const segment of path.split(".")) {
    if (!segment) continue;
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
    } else if (isRecord2(current)) {
      current = current[segment];
    } else {
      return void 0;
    }
  }
  return current;
}
function resolvePath(ctx, path) {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "." || trimmed === "this") return ctx.current;
  if (trimmed === "@index") return ctx.index ?? 0;
  if (trimmed === "@first") return (ctx.index ?? 0) === 0;
  if (trimmed === "@last") return typeof ctx.index === "number" && typeof ctx.length === "number" ? ctx.index === ctx.length - 1 : false;
  if (trimmed === "@root") return ctx.root;
  if (trimmed.startsWith("@root.")) return valueAtPath(ctx.root, trimmed.slice(6));
  if (trimmed.startsWith("this.")) return valueAtPath(ctx.current, trimmed.slice(5));
  if (trimmed.startsWith("data.")) return valueAtPath(ctx.root, trimmed.slice(5));
  let relative = trimmed;
  let targetCtx = ctx;
  while (relative.startsWith("../")) {
    targetCtx = targetCtx.parent ?? targetCtx;
    relative = relative.slice(3);
  }
  if (relative !== trimmed) {
    if (!relative || relative === "." || relative === "this") return targetCtx.current;
    if (relative.startsWith("this.")) return valueAtPath(targetCtx.current, relative.slice(5));
    const parentValue = valueAtPath(targetCtx.current, relative);
    if (parentValue !== void 0) return parentValue;
    return valueAtPath(targetCtx.root, relative);
  }
  const currentValue = valueAtPath(ctx.current, trimmed);
  if (currentValue !== void 0) return currentValue;
  return valueAtPath(ctx.root, trimmed);
}
function valueToText(value, placeholder) {
  if (value === void 0 || value === null) return placeholder;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value, null, 2) ?? placeholder;
}
function truthy(value) {
  if (value === false || value === null || value === void 0 || value === "" || value === 0) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
function tokenizeExpression(expression) {
  const tokens = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|[^\s]+/g;
  let match;
  while ((match = pattern.exec(expression)) !== null) {
    if (match[1] !== void 0) tokens.push(`"${match[1].replace(/\\"/g, '"')}"`);
    else if (match[2] !== void 0) tokens.push(`'${match[2].replace(/\\'/g, "'")}'`);
    else tokens.push(match[0] ?? "");
  }
  return tokens.filter(Boolean);
}
function literalOrPath(ctx, token) {
  if (token === "true") return true;
  if (token === "false") return false;
  if (token === "null") return null;
  if (token.startsWith('"') && token.endsWith('"') || token.startsWith("'") && token.endsWith("'")) {
    return token.slice(1, -1);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(token)) return Number(token);
  return resolvePath(ctx, token);
}
function compareNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function sanitizeClass(value) {
  return valueToText(value, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
function arrayFromUnknown(value) {
  return Array.isArray(value) ? value : [];
}
function valueLength(value) {
  if (Array.isArray(value) || typeof value === "string") return value.length;
  if (isRecord2(value)) return Object.keys(value).length;
  return truthy(value) ? 1 : 0;
}
function isEmptyValue(value) {
  if (value === false || value === null || value === void 0 || value === "" || value === 0) return true;
  if (Array.isArray(value) || typeof value === "string") return value.length === 0;
  if (isRecord2(value)) return Object.keys(value).length === 0;
  return false;
}
function fieldValue(value, field) {
  const path = valueToText(field, "").trim();
  if (!path) return void 0;
  return valueAtPath(value, path);
}
function joinValues(values, separator, placeholder) {
  const sep = valueToText(separator ?? ", ", ", ");
  return values.map((value) => valueToText(value, placeholder)).filter(Boolean).join(sep);
}
function chipMarkup(label, content) {
  const labelText = valueToText(label, "").trim();
  const contentText = valueToText(content, "").trim();
  if (!labelText && !contentText) return "";
  const className = sanitizeClass(labelText || contentText);
  const extraClass = className ? ` ltracker-template-chip-${escapeHtml(className)}` : "";
  const body = contentText ? `<b>${escapeHtml(labelText || contentText)}</b><span>${escapeHtml(contentText)}</span>` : `<span>${escapeHtml(labelText)}</span>`;
  return `<span class="ltracker-template-chip${extraClass}">${body}</span>`;
}
function fieldChipListMarkup(value, labelField, contentField) {
  return arrayFromUnknown(value).map((item) => chipMarkup(fieldValue(item, labelField), fieldValue(item, contentField))).filter(Boolean).join("");
}
function evalExpression(ctx, expression, placeholder) {
  const tokens = tokenizeExpression(expression);
  if (tokens.length === 0) return void 0;
  const helper = tokens[0] ?? "";
  if (!INLINE_HELPERS.has(helper) || tokens.length === 1) return literalOrPath(ctx, tokens[0] ?? "");
  const args = tokens.slice(1).map((token) => literalOrPath(ctx, token));
  if (helper === "default") return truthy(args[0]) ? args[0] : args[1] ?? placeholder;
  if (helper === "percent") {
    const numeric = compareNumber(args[0]);
    if (numeric === null) return placeholder;
    const percent = Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
    return `${Math.round(percent)}%`;
  }
  if (helper === "json") return args[0] === void 0 ? placeholder : JSON.stringify(args[0], null, 2) ?? placeholder;
  if (helper === "eq") return args[0] === args[1];
  if (helper === "gt") {
    const left = compareNumber(args[0]);
    const right = compareNumber(args[1]);
    return left !== null && right !== null && left > right;
  }
  if (helper === "lt") {
    const left = compareNumber(args[0]);
    const right = compareNumber(args[1]);
    return left !== null && right !== null && left < right;
  }
  if (helper === "and") return args.every(truthy);
  if (helper === "or") return args.some(truthy);
  if (helper === "not") return !truthy(args[0]);
  if (helper === "class" || helper === "safeClass") return sanitizeClass(args[0]);
  if (helper === "lower") return valueToText(args[0], placeholder).toLowerCase();
  if (helper === "upper") return valueToText(args[0], placeholder).toUpperCase();
  if (helper === "truncate") {
    const text = valueToText(args[0], placeholder);
    const limit = compareNumber(args[1]) ?? 80;
    return Array.from(text).slice(0, Math.max(0, Math.round(limit))).join("");
  }
  if (helper === "length") return valueLength(args[0]);
  if (helper === "join") return joinValues(arrayFromUnknown(args[0]), args[1] ?? ", ", placeholder);
  if (helper === "pluck") return arrayFromUnknown(args[0]).map((item) => fieldValue(item, args[1]));
  if (helper === "pluckJoin") return joinValues(arrayFromUnknown(args[0]).map((item) => fieldValue(item, args[1])), args[2] ?? ", ", placeholder);
  if (helper === "get") return fieldValue(args[0], args[1]);
  if (helper === "coalesce") return args.find((arg) => !isEmptyValue(arg)) ?? placeholder;
  if (helper === "isArray") return Array.isArray(args[0]);
  if (helper === "isObject") return isRecord2(args[0]);
  if (helper === "isEmpty") return isEmptyValue(args[0]);
  if (helper === "notEmpty") return !isEmptyValue(args[0]);
  if (helper === "clamp") {
    const value = compareNumber(args[0]);
    const min = compareNumber(args[1]) ?? 0;
    const max = compareNumber(args[2]) ?? 100;
    if (value === null) return placeholder;
    return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));
  }
  if (helper === "meterWidth") {
    const value = compareNumber(args[0]);
    if (value === null) return placeholder;
    const percent = Math.abs(value) <= 1 ? value * 100 : value;
    return `${Math.round(Math.min(100, Math.max(0, percent)))}%`;
  }
  if (helper === "nl2br") {
    return safeHtml(escapeHtml(valueToText(args[0], placeholder)).replace(/\r?\n/g, "<br>"));
  }
  if (helper === "chip") return safeHtml(chipMarkup(args[0]));
  if (helper === "chipList") {
    return safeHtml(arrayFromUnknown(args[0]).map((item) => chipMarkup(item)).filter(Boolean).join(""));
  }
  if (helper === "fieldChip") return safeHtml(chipMarkup(fieldValue(args[0], args[1]), fieldValue(args[0], args[2])));
  if (helper === "fieldChipList") return safeHtml(fieldChipListMarkup(args[0], args[1], args[2]));
  return void 0;
}
function activeNodes(frame) {
  return frame.target === "inverse" ? frame.inverse : frame.body;
}
function parseTemplate(template) {
  const root = { kind: "root", expression: "", body: [], inverse: [], target: "body" };
  const stack = [root];
  const currentFrame = () => stack[stack.length - 1] ?? root;
  TEMPLATE_TOKEN_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match;
  while ((match = TEMPLATE_TOKEN_PATTERN.exec(template)) !== null) {
    const before = template.slice(lastIndex, match.index);
    if (before) activeNodes(currentFrame()).push({ type: "text", value: before });
    const expression = (match[1] ?? "").trim();
    if (expression.startsWith("#")) {
      const [kindToken, ...rest] = tokenizeExpression(expression.slice(1));
      if (kindToken === "each" || kindToken === "if" || kindToken === "unless" || kindToken === "with") {
        stack.push({ kind: kindToken, expression: rest.join(" "), body: [], inverse: [], target: "body" });
      } else {
        activeNodes(currentFrame()).push({ type: "mustache", expression });
      }
    } else if (expression === "else") {
      if (stack.length > 1) currentFrame().target = "inverse";
    } else if (expression.startsWith("/")) {
      const closing = expression.slice(1).trim();
      const frame = stack.length > 1 ? stack.pop() : null;
      if (frame && frame.kind !== "root" && frame.kind === closing) {
        activeNodes(currentFrame()).push({
          type: "block",
          kind: frame.kind,
          expression: frame.expression,
          body: frame.body,
          inverse: frame.inverse
        });
      }
    } else {
      activeNodes(currentFrame()).push({ type: "mustache", expression });
    }
    lastIndex = TEMPLATE_TOKEN_PATTERN.lastIndex;
  }
  const after = template.slice(lastIndex);
  if (after) activeNodes(currentFrame()).push({ type: "text", value: after });
  while (stack.length > 1) {
    const frame = stack.pop();
    if (!frame || frame.kind === "root") break;
    activeNodes(currentFrame()).push({
      type: "block",
      kind: frame.kind,
      expression: frame.expression,
      body: frame.body,
      inverse: frame.inverse
    });
  }
  return root.body;
}
function renderNodes(nodes, ctx, placeholder) {
  let output = "";
  for (const node of nodes) {
    if (node.type === "text") {
      output += node.value;
      continue;
    }
    if (node.type === "mustache") {
      const value2 = evalExpression(ctx, node.expression, placeholder);
      output += isSafeHtmlValue(value2) ? value2.html : escapeHtml(valueToText(value2, placeholder));
      continue;
    }
    const value = evalExpression(ctx, node.expression, placeholder);
    if (node.kind === "each") {
      if (Array.isArray(value) && value.length > 0) {
        output += value.map((item, index) => renderNodes(node.body, {
          root: ctx.root,
          current: item,
          parent: ctx,
          index,
          length: value.length
        }, placeholder)).join("");
      } else {
        output += renderNodes(node.inverse, ctx, placeholder);
      }
      continue;
    }
    if (node.kind === "with") {
      output += truthy(value) ? renderNodes(node.body, { root: ctx.root, current: value, parent: ctx }, placeholder) : renderNodes(node.inverse, ctx, placeholder);
      continue;
    }
    const condition = truthy(value);
    if (node.kind === "if") output += renderNodes(condition ? node.body : node.inverse, ctx, placeholder);
    if (node.kind === "unless") output += renderNodes(condition ? node.inverse : node.body, ctx, placeholder);
  }
  return output;
}
function renderTemplate(template, snapshotData, placeholder) {
  return renderNodes(parseTemplate(template), { root: snapshotData, current: snapshotData }, placeholder);
}
function primitiveToString2(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}
function recordSummary2(value) {
  const preferred = ["name", "title", "status", "role", "emotional_state", "physical_state", "current_goal"];
  const direct = preferred.map((key) => primitiveToString2(value[key])).filter((item) => Boolean(item));
  if (direct.length > 0) return direct.join(" - ");
  const fragments = Object.entries(value).map(([key, entry]) => {
    const rendered = primitiveToString2(entry);
    return rendered ? `${key}: ${rendered}` : null;
  }).filter((item) => Boolean(item));
  return fragments.length > 0 ? fragments.slice(0, 4).join("; ") : null;
}
function listFromUnknown2(value) {
  const primitive = primitiveToString2(value);
  if (primitive) return [primitive];
  if (Array.isArray(value)) {
    return value.map((item) => {
      const rendered = primitiveToString2(item);
      if (rendered) return rendered;
      return isRecord2(item) ? recordSummary2(item) : null;
    }).filter((item) => Boolean(item));
  }
  if (isRecord2(value)) {
    const summary = recordSummary2(value);
    return summary ? [summary] : [];
  }
  return [];
}
function stringAt2(data, path) {
  let current = data;
  for (const key of path) {
    if (!isRecord2(current)) return null;
    current = current[key];
  }
  return primitiveToString2(current);
}
function formatTemplateTextFallback(data) {
  const lines = [];
  const scene = [
    stringAt2(data, ["scene", "location"]),
    stringAt2(data, ["scene", "date"]) ?? stringAt2(data, ["scene", "time"]),
    stringAt2(data, ["scene", "mood"])
  ].filter((item) => Boolean(item));
  if (scene.length > 0) lines.push(`Scene: ${scene.join(", ")}`);
  const present = listFromUnknown2(data.characters_present).map((item) => item.split(" - ")[0]?.trim() ?? item.trim()).filter(Boolean);
  if (present.length > 0) lines.push(`Present characters: ${present.join("; ")}`);
  const facts = listFromUnknown2(data.important_facts).slice(0, 8);
  if (facts.length > 0) {
    lines.push("Important facts:");
    lines.push(...facts.map((item) => `- ${item}`));
  }
  const threads = listFromUnknown2(data.active_threads).slice(0, 8);
  if (threads.length > 0) {
    lines.push("Active threads:");
    lines.push(...threads.map((item) => `- ${item}`));
  }
  const continuity = listFromUnknown2(data.unresolved_continuity).slice(0, 8);
  if (continuity.length > 0) {
    lines.push("Unresolved continuity:");
    lines.push(...continuity.map((item) => `- ${item}`));
  }
  const pressure = listFromUnknown2(data.next_scene_pressure).slice(0, 4);
  if (pressure.length > 0) {
    lines.push("Next scene pressure:");
    lines.push(...pressure.map((item) => `- ${item}`));
  }
  if (lines.length > 0) return lines.join("\n");
  const fragments = Object.entries(data).map(([key, value]) => {
    const list = listFromUnknown2(value);
    return list.length > 0 ? `${key}: ${list.slice(0, 3).join("; ")}` : null;
  }).filter((item) => Boolean(item));
  return fragments.length > 0 ? fragments.slice(0, 8).join("\n") : "No tracker fields are available.";
}
function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function detectJavaScriptLike(value) {
  return /<\s*script\b|on[a-z]+\s*=|javascript:|<\s*(?:iframe|object|embed|form|input|textarea|select)\b/i.test(value);
}
function stripStyleBlocks(html, warnings) {
  return html.replace(/<\s*style\b[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, () => {
    warnings.push("Removed unsafe <style> element.");
    return "";
  });
}
function extractStyleBlocks(html) {
  const styles = [];
  const withoutStyles = html.replace(/<\s*style\b[^>]*>([\s\S]*?)<\s*\/\s*style\s*>/gi, (_match, css) => {
    styles.push(css);
    return "";
  });
  return { html: withoutStyles, styles };
}
function stripDangerousContainers(html, warnings, trustMode) {
  let result = html;
  const tags = trustMode === "safe" ? [...DANGEROUS_CONTAINER_TAGS, "svg"] : DANGEROUS_CONTAINER_TAGS;
  for (const tag of tags) {
    const paired = new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*/\\s*${tag}\\s*>`, "gi");
    result = result.replace(paired, () => {
      if (tag === "script") {
        warnings.push("Removed unsafe <script> element.");
        warnings.push("JavaScript requires Dev Mode and was not executed.");
      } else {
        warnings.push(`Removed unsafe <${tag}> element.`);
      }
      return "";
    });
    const single = new RegExp(`<\\s*/?\\s*${tag}\\b[^>]*>`, "gi");
    result = result.replace(single, () => {
      warnings.push(`Removed unsafe <${tag}> tag.`);
      return "";
    });
  }
  return result;
}
function attributePairs(raw) {
  const result = [];
  const pattern = /([^\s=/"'<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    const name = match[1] ?? "";
    const lowerName = name.toLowerCase();
    if (!lowerName) continue;
    result.push({ name, lowerName, value: match[2] ?? match[3] ?? match[4] ?? "" });
  }
  return result;
}
function unsafeStyleValue(value) {
  const lowerValue = value.toLowerCase();
  return value.includes("\\") || lowerValue.includes("url(") || lowerValue.includes("expression") || lowerValue.includes("@import") || lowerValue.includes("javascript:") || lowerValue.includes("data:") || lowerValue.includes("behavior:") || lowerValue.includes("-moz-binding") || /[<>{}]/.test(value);
}
function sanitizeStyle(value, warnings) {
  const declarations = [];
  for (const part of value.split(";")) {
    const separator = part.indexOf(":");
    if (separator <= 0) continue;
    const property = part.slice(0, separator).trim().toLowerCase();
    const rawValue = part.slice(separator + 1).trim();
    if (!property || !rawValue) continue;
    if (!property.startsWith("--") && !SAFE_STYLE_PROPERTIES.has(property)) {
      warnings.push(`Removed unsupported style property ${property}.`);
      continue;
    }
    if (unsafeStyleValue(rawValue)) {
      warnings.push(`Removed unsafe style value for ${property}.`);
      continue;
    }
    if (!/^[\w\s#.,%()+\-/*:'"!]+$/.test(rawValue)) {
      warnings.push(`Removed unsupported style value for ${property}.`);
      continue;
    }
    declarations.push(`${property}: ${rawValue}`);
  }
  return declarations.length > 0 ? declarations.join("; ") : null;
}
function matchingBrace(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
function collectKeyframeNames(css) {
  const names = /* @__PURE__ */ new Map();
  const pattern = /@keyframes\s+([A-Za-z_][\w-]*)/gi;
  let match;
  while ((match = pattern.exec(css)) !== null) {
    const name = match[1] ?? "";
    if (name) names.set(name, "");
  }
  return names;
}
function rewriteAnimationNames(value, keyframes) {
  let rewritten = value;
  for (const [name, scoped] of keyframes) {
    if (!scoped) continue;
    rewritten = rewritten.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), scoped);
  }
  return rewritten;
}
function sanitizeCssDeclarations(body, warnings, keyframes) {
  const rewritten = rewriteAnimationNames(body, keyframes);
  return sanitizeStyle(rewritten, warnings) ?? "";
}
function selectorCanBeScoped(selector) {
  if (!selector.trim()) return false;
  if (/(^|[\s>+~,(])(?:html|body|:root)\b/i.test(selector)) return false;
  if (/<|>|@|javascript:/i.test(selector)) return false;
  return true;
}
function scopeSelectorList(selector, scopeClass, warnings) {
  const scoped = selector.split(",").map((part) => {
    const trimmed = part.trim();
    if (!selectorCanBeScoped(trimmed)) {
      warnings.push(`Removed stylesheet selector that could target the host: ${trimmed}.`);
      return null;
    }
    if (trimmed === ":host") return `.${scopeClass}`;
    if (trimmed.startsWith(`.${scopeClass}`)) return trimmed;
    return `.${scopeClass} ${trimmed}`;
  }).filter((item) => Boolean(item));
  return scoped.length > 0 ? scoped.join(", ") : null;
}
function sanitizeKeyframes(name, body, warnings, keyframes, scopeClass) {
  const scopedName = `${scopeClass}-${name}`;
  keyframes.set(name, scopedName);
  const frames = [];
  let cursor = 0;
  while (cursor < body.length) {
    const open = body.indexOf("{", cursor);
    if (open < 0) break;
    const selector = body.slice(cursor, open).trim();
    const close = matchingBrace(body, open);
    if (close < 0) break;
    const declarations = body.slice(open + 1, close);
    if (/^(from|to|\d+(?:\.\d+)?%)$/i.test(selector)) {
      const safe = sanitizeCssDeclarations(declarations, warnings, keyframes);
      if (safe) frames.push(`${selector}{${safe}}`);
    } else {
      warnings.push(`Removed unsafe keyframe selector ${selector}.`);
    }
    cursor = close + 1;
  }
  return frames.length > 0 ? `@keyframes ${scopedName}{${frames.join("")}}` : null;
}
function sanitizeCssBlocks(css, scopeClass, warnings, keyframes) {
  const output = [];
  let cursor = 0;
  while (cursor < css.length) {
    const open = css.indexOf("{", cursor);
    if (open < 0) break;
    const selector = css.slice(cursor, open).trim();
    const close = matchingBrace(css, open);
    if (close < 0) break;
    const body = css.slice(open + 1, close);
    const lowerSelector = selector.toLowerCase();
    if (lowerSelector.startsWith("@media")) {
      if (/url\s*\(|javascript:|@import/i.test(selector)) {
        warnings.push("Removed unsafe @media rule.");
      } else {
        const inner = sanitizeCssBlocks(body, scopeClass, warnings, keyframes);
        if (inner) output.push(`${selector}{${inner}}`);
      }
    } else if (lowerSelector.startsWith("@keyframes")) {
      const name = selector.match(/@keyframes\s+([A-Za-z_][\w-]*)/i)?.[1];
      if (name) {
        const safe = sanitizeKeyframes(name, body, warnings, keyframes, scopeClass);
        if (safe) output.push(safe);
      }
    } else if (lowerSelector.startsWith("@font-face") || lowerSelector.startsWith("@")) {
      warnings.push(`Removed unsupported stylesheet rule ${selector}.`);
    } else {
      const safeSelector = scopeSelectorList(selector, scopeClass, warnings);
      const safeBody = sanitizeCssDeclarations(body, warnings, keyframes);
      if (safeSelector && safeBody) output.push(`${safeSelector}{${safeBody}}`);
    }
    cursor = close + 1;
  }
  return output.join("\n");
}
function sanitizeCss(css, scopeClass, warnings) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import[^;]+;/gi, () => {
    warnings.push("Removed unsafe @import rule.");
    return "";
  }).replace(/@font-face\s*{[\s\S]*?}/gi, () => {
    warnings.push("Removed remote font rule.");
    return "";
  });
  if (/url\s*\(|javascript:|data:|behavior:|-moz-binding/i.test(stripped)) {
    warnings.push("Removed unsafe stylesheet URL or script-like content.");
  }
  const keyframes = collectKeyframeNames(stripped);
  for (const name of keyframes.keys()) keyframes.set(name, `${scopeClass}-${name}`);
  return sanitizeCssBlocks(stripped, scopeClass, warnings, keyframes);
}
function summarizeWarnings(warnings, maxWarnings = 20) {
  const counts = /* @__PURE__ */ new Map();
  for (const warning of warnings) {
    counts.set(warning, (counts.get(warning) ?? 0) + 1);
  }
  const summarized = [...counts.entries()].map(([warning, count]) => count > 1 ? `${warning} x ${count}` : warning);
  if (summarized.length <= maxWarnings) return summarized;
  return [
    ...summarized.slice(0, Math.max(0, maxWarnings)),
    `${summarized.length - maxWarnings} more render warnings hidden.`
  ];
}
function svgAttributeName(name) {
  if (name === "viewbox") return "viewBox";
  return name;
}
function safeSvgUrlReference(value) {
  return /^url\(#[-_A-Za-z0-9]+\)$/.test(value.trim());
}
function sanitizeAttributes(raw, tag, options, warnings) {
  const attributes = [];
  const isSvg = ALLOWED_SVG_TAGS.has(tag);
  for (const attribute of attributePairs(raw)) {
    if (attribute.lowerName.startsWith("on")) {
      warnings.push(`Removed event attribute ${attribute.lowerName}.`);
      continue;
    }
    if (attribute.lowerName === "href" || attribute.lowerName === "src" || attribute.lowerName === "srcdoc" || attribute.lowerName === "xlink:href") {
      warnings.push(`Removed URL-bearing attribute ${attribute.lowerName}.`);
      continue;
    }
    if (attribute.lowerName === "style") {
      if (!options.allowInlineStyles || isSvg) {
        warnings.push("Removed inline style attribute.");
        continue;
      }
      const style = sanitizeStyle(attribute.value, warnings);
      if (style) attributes.push(`style="${escapeHtml(style)}"`);
      continue;
    }
    if (attribute.lowerName === "open") {
      if (tag === "details") {
        attributes.push("open");
      } else {
        warnings.push("Removed unsupported attribute open.");
      }
      continue;
    }
    if (isSvg) {
      if (!options.allowSvg || !SVG_ATTRIBUTES.has(attribute.lowerName)) {
        warnings.push(`Removed unsupported SVG attribute ${attribute.lowerName}.`);
        continue;
      }
      if (/url\s*\(/i.test(attribute.value) && !safeSvgUrlReference(attribute.value)) {
        warnings.push(`Removed unsafe SVG reference in ${attribute.lowerName}.`);
        continue;
      }
      if (/javascript:|data:|<|>/i.test(attribute.value)) {
        warnings.push(`Removed unsafe SVG attribute ${attribute.lowerName}.`);
        continue;
      }
      attributes.push(`${svgAttributeName(attribute.lowerName)}="${escapeHtml(attribute.value)}"`);
      continue;
    }
    if (OWNER_POWER_ACTION_ATTRIBUTES.has(attribute.lowerName)) {
      if (!options.allowActionHooks) {
        warnings.push(`Removed Owner Power action attribute ${attribute.lowerName}.`);
        continue;
      }
      if (/javascript:|data:|<|>/i.test(attribute.value)) {
        warnings.push(`Removed unsafe Owner Power action attribute ${attribute.lowerName}.`);
        continue;
      }
      attributes.push(`${attribute.lowerName}="${escapeHtml(attribute.value)}"`);
      continue;
    }
    if (!ALLOWED_ATTRIBUTES.has(attribute.lowerName)) {
      warnings.push(`Removed unsupported attribute ${attribute.lowerName}.`);
      continue;
    }
    if (attribute.lowerName === "type" && tag === "button") {
      const buttonType = attribute.value === "button" || attribute.value === "reset" ? attribute.value : "button";
      attributes.push(`type="${buttonType}"`);
      continue;
    }
    attributes.push(`${attribute.lowerName}="${escapeHtml(attribute.value)}"`);
  }
  return attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
}
function sanitizeHtml(html, options = {}) {
  const warnings = [];
  const trustMode = options.templateTrustMode ?? (options.allowInlineStyles === true ? "trusted" : "safe");
  const trusted = trustMode === "trusted" || trustMode === "dev";
  const allowInlineStyles = trusted && options.allowInlineStyles === true;
  const allowActionHooks = trusted;
  if (detectJavaScriptLike(html)) {
    warnings.push("JavaScript requires Dev Mode and was not executed.");
  }
  const extracted = trusted ? extractStyleBlocks(html) : { html: stripStyleBlocks(html, warnings), styles: [] };
  const scopeClass = `ltracker-preset-scope-${hashString(extracted.html + extracted.styles.join("\n"))}`;
  const scopedStyles = trusted ? extracted.styles.map((css) => sanitizeCss(css, scopeClass, warnings)).filter(Boolean).join("\n") : "";
  const withoutDangerousContainers = stripDangerousContainers(extracted.html, warnings, trustMode);
  const sanitized = withoutDangerousContainers.replace(
    /<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)([^>]*)>/g,
    (_match, closing, rawTag, rawAttributes) => {
      const tag = rawTag.toLowerCase();
      const allowedHtml = ALLOWED_TAGS.has(tag);
      const allowedSvg = trusted && ALLOWED_SVG_TAGS.has(tag);
      if (!allowedHtml && !allowedSvg) {
        warnings.push(`Removed unsupported <${tag}> tag.`);
        return "";
      }
      if (closing) return `</${tag}>`;
      if (VOID_TAGS.has(tag)) return `<${tag}>`;
      return `<${tag}${sanitizeAttributes(rawAttributes, tag, { allowInlineStyles, allowSvg: allowedSvg, allowActionHooks }, warnings)}>`;
    }
  );
  const htmlWithScopedCss = scopedStyles ? `<div class="${scopeClass}" data-ltracker-template-root><style>${scopedStyles}</style>${sanitized}</div>` : sanitized;
  return {
    html: htmlWithScopedCss,
    warnings: options.deduplicateWarnings === true ? summarizeWarnings(warnings, options.maxWarnings) : warnings
  };
}
function detectTemplateRendererRequirements(template) {
  const usesScopedCss = /<\s*style\b/i.test(template);
  const usesInlineStyles = /\sstyle\s*=/i.test(template);
  const usesInlineSvg = /<\s*svg\b/i.test(template);
  const usesConditionals = /\{\{\s*#(?:if|unless|with)\b|\{\{\s*else\s*\}\}/i.test(template);
  const helperPattern = new RegExp(`\\{\\{\\s*(?:${[...INLINE_HELPERS].map((helper) => helper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  const usesHelpers = helperPattern.test(template);
  const usesNestedLoops = /\{\{\s*#each\b[\s\S]*\{\{\s*#each\b/i.test(template);
  const usesDeclarativeActions = /data-ltracker-power-action\s*=/i.test(template);
  const hasJavaScriptLikeContent = detectJavaScriptLike(template);
  const features = [
    usesScopedCss ? "Scoped CSS" : null,
    usesInlineStyles ? "Inline styles" : null,
    usesInlineSvg ? "Inline SVG" : null,
    usesConditionals ? "Conditionals" : null,
    usesNestedLoops ? "Nested loops" : null,
    usesHelpers ? "Template helpers" : null,
    usesDeclarativeActions ? "Declarative actions" : null
  ].filter((item) => Boolean(item));
  const warnings = hasJavaScriptLikeContent ? ["This preset contains JavaScript-like content. JavaScript will be stripped unless Dev Mode is explicitly enabled in a future phase."] : [];
  const recommendedMode2 = hasJavaScriptLikeContent ? "dev" : usesScopedCss || usesInlineStyles || usesInlineSvg || usesConditionals || usesHelpers ? "trusted" : "safe";
  return {
    usesScopedCss,
    usesInlineStyles,
    usesInlineSvg,
    usesConditionals,
    usesHelpers,
    hasJavaScriptLikeContent,
    recommendedMode: recommendedMode2,
    features,
    warnings
  };
}
function renderHtmlTemplate(input, options = {}) {
  const warnings = [];
  const errors = [];
  const placeholder = options.missingValuePlaceholder ?? "";
  const maxRenderedChars = Math.max(1, options.maxRenderedChars ?? 5e4);
  const textFallback = formatTemplateTextFallback(input.snapshotData);
  try {
    if (!input.template.trim()) {
      return {
        ok: true,
        html: "",
        textFallback,
        errors,
        warnings: ["No HTML template is stored for this preset; using the text fallback."],
        usedFallback: true
      };
    }
    const rendered = renderTemplate(input.template, input.snapshotData, placeholder);
    const trustMode = options.templateTrustMode ?? (options.allowInlineStyles === true ? "trusted" : "safe");
    const sanitizeOptions = {
      allowInlineStyles: options.allowInlineStyles === true,
      templateTrustMode: trustMode === "dev" ? "trusted" : trustMode,
      deduplicateWarnings: options.deduplicateWarnings === true
    };
    if (typeof options.maxWarnings === "number") sanitizeOptions.maxWarnings = options.maxWarnings;
    const sanitized = sanitizeHtml(rendered, sanitizeOptions);
    warnings.push(...sanitized.warnings);
    const truncatedHtml = truncateSafe2(sanitized.html, maxRenderedChars);
    if (truncatedHtml.truncated) warnings.push("Sanitized HTML preview was truncated.");
    const truncatedFallback = truncateSafe2(textFallback, maxRenderedChars);
    if (truncatedFallback.truncated) warnings.push("Text fallback preview was truncated.");
    return {
      ok: true,
      html: truncatedHtml.value,
      textFallback: truncatedFallback.value,
      errors,
      warnings,
      usedFallback: false
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Renderer failed safely: ${message}`);
    const truncatedFallback = truncateSafe2(textFallback, maxRenderedChars);
    if (truncatedFallback.truncated) warnings.push("Text fallback preview was truncated.");
    return {
      ok: false,
      html: "",
      textFallback: truncatedFallback.value,
      errors,
      warnings,
      usedFallback: true
    };
  }
}

// src/shared/presetRenderLock.ts
var MAX_LOCKED_SCHEMA_CHARS = 5e4;
var MAX_LOCKED_PROMPT_CHARS = 4e4;
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}
function schemaTitle(schema) {
  return typeof schema.title === "string" && schema.title.trim() ? schema.title : null;
}
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value;
  const parts = Object.keys(record).sort((left, right) => left.localeCompare(right)).filter((key) => record[key] !== void 0).map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${parts.join(",")}}`;
}
function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `fnv1a32-${hash.toString(16).padStart(8, "0")}`;
}
function copyJsonSchema(schema) {
  const text = stableStringify(schema);
  if (text.length > MAX_LOCKED_SCHEMA_CHARS) return null;
  try {
    return JSON.parse(JSON.stringify(schema));
  } catch {
    return null;
  }
}
function capturePresetRenderLock(preset, capturedAt) {
  const schemaText = stableStringify(preset.jsonSchema);
  const htmlTemplate = preset.htmlTemplate ?? "";
  const promptInstructions = preset.promptInstructions ?? "";
  return {
    presetId: preset.id,
    presetName: preset.name,
    presetVersion: preset.version,
    schemaTitle: schemaTitle(preset.jsonSchema),
    schemaHash: hashText(schemaText),
    htmlTemplateHash: hashText(htmlTemplate),
    promptInstructionsHash: hashText(promptInstructions),
    htmlTemplate,
    jsonSchema: copyJsonSchema(preset.jsonSchema),
    promptInstructions: promptInstructions.length <= MAX_LOCKED_PROMPT_CHARS ? promptInstructions : null,
    capturedAt
  };
}
function normalizePresetRenderLock(value) {
  if (!isRecord3(value)) return null;
  const schema = isRecord3(value.jsonSchema) ? value.jsonSchema : null;
  return {
    presetId: stringOrNull(value.presetId),
    presetName: stringOrNull(value.presetName),
    presetVersion: stringOrNull(value.presetVersion),
    schemaTitle: stringOrNull(value.schemaTitle),
    schemaHash: stringOrNull(value.schemaHash),
    htmlTemplateHash: stringOrNull(value.htmlTemplateHash),
    promptInstructionsHash: stringOrNull(value.promptInstructionsHash),
    htmlTemplate: stringOrNull(value.htmlTemplate),
    jsonSchema: schema,
    promptInstructions: stringOrNull(value.promptInstructions),
    capturedAt: typeof value.capturedAt === "string" ? value.capturedAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function snapshotFromSource(source) {
  if (!source) return null;
  if ("snapshot" in source) return source.snapshot;
  return source;
}
function attachedMetadata(source) {
  const snapshot = snapshotFromSource(source);
  return {
    presetId: ("snapshot" in (source ?? {}) ? source.presetId : null) ?? snapshot?.presetId ?? null,
    presetName: ("snapshot" in (source ?? {}) ? source.presetName : null) ?? snapshot?.presetName ?? null,
    presetVersion: ("snapshot" in (source ?? {}) ? source.presetVersion : null) ?? snapshot?.presetVersion ?? null
  };
}
function renderOnlyPresetFromLock(lock) {
  return {
    id: lock.presetId ?? "snapshot-render-lock",
    name: lock.presetName ?? "Snapshot locked preset",
    description: "Render-only preset captured with a generated tracker snapshot.",
    version: lock.presetVersion ?? "unknown",
    createdAt: lock.capturedAt,
    updatedAt: lock.capturedAt,
    jsonSchema: lock.jsonSchema ?? {},
    promptInstructions: lock.promptInstructions ?? "",
    htmlTemplate: lock.htmlTemplate ?? "",
    origin: "user_imported"
  };
}
function findByNameVersion(presets, presetName2, presetVersion) {
  if (!presetName2 || !presetVersion) return null;
  return presets.find((preset) => preset.name === presetName2 && preset.version === presetVersion) ?? null;
}
function resolvePresetForSnapshot(source, installedPresets, activePreset) {
  const snapshot = snapshotFromSource(source);
  const metadata = attachedMetadata(source);
  const lock = normalizePresetRenderLock(snapshot?.presetRenderLock);
  const snapshotHasMetadata = Boolean(metadata.presetId || metadata.presetName || metadata.presetVersion);
  const activeMismatch = (id) => Boolean(id && id !== activePreset.id);
  if (lock?.htmlTemplate !== null && lock?.htmlTemplate !== void 0) {
    return {
      preset: renderOnlyPresetFromLock(lock),
      source: "snapshot_render_lock",
      warning: null,
      fallbackReason: null,
      mismatchDetected: activeMismatch(lock.presetId),
      lockedPresetId: lock.presetId,
      lockedPresetName: lock.presetName,
      lockedPresetVersion: lock.presetVersion
    };
  }
  if (metadata.presetId) {
    const byId = installedPresets.find((preset) => preset.id === metadata.presetId) ?? null;
    if (byId) {
      return {
        preset: byId,
        source: "installed_preset_id",
        warning: "Legacy snapshot rendered with installed preset id match.",
        fallbackReason: null,
        mismatchDetected: activeMismatch(byId.id),
        lockedPresetId: metadata.presetId,
        lockedPresetName: metadata.presetName,
        lockedPresetVersion: metadata.presetVersion
      };
    }
  }
  const byNameVersion = findByNameVersion(installedPresets, metadata.presetName, metadata.presetVersion);
  if (byNameVersion) {
    return {
      preset: byNameVersion,
      source: "installed_preset_name_version",
      warning: "Legacy snapshot rendered with installed preset name/version match.",
      fallbackReason: null,
      mismatchDetected: activeMismatch(byNameVersion.id),
      lockedPresetId: metadata.presetId,
      lockedPresetName: metadata.presetName,
      lockedPresetVersion: metadata.presetVersion
    };
  }
  if (!snapshotHasMetadata) {
    return {
      preset: activePreset,
      source: "active_preset_legacy_fallback",
      warning: "Legacy snapshot has no preset lock; rendered with active preset fallback.",
      fallbackReason: "Legacy snapshot has no preset identity or render lock.",
      mismatchDetected: false,
      lockedPresetId: null,
      lockedPresetName: null,
      lockedPresetVersion: null
    };
  }
  return {
    preset: null,
    source: "json_fallback_original_preset_missing",
    warning: "Original preset unavailable. Showing JSON fallback.",
    fallbackReason: "Original preset metadata did not match an installed preset and no snapshot render lock was present.",
    mismatchDetected: true,
    lockedPresetId: metadata.presetId,
    lockedPresetName: metadata.presetName,
    lockedPresetVersion: metadata.presetVersion
  };
}

// src/shared/swipeIdentity.ts
var DEFAULT_SWIPE_KEY = "default";
function isRecord4(value) {
  return typeof value === "object" && value !== null;
}
function normalizeKeyPart(value) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80) || DEFAULT_SWIPE_KEY;
}
function numberOrNull(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}
function stringOrNumberAsString(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.max(0, Math.round(value)));
  return null;
}
function officialSwipeId(message) {
  const direct = stringOrNumberAsString(message.swipeId) ?? stringOrNumberAsString(message.activeSwipeId) ?? stringOrNumberAsString(message.selectedSwipeId);
  if (direct) return direct;
  if (!isRecord4(message.extra)) return null;
  return stringOrNumberAsString(message.extra.swipeId) ?? stringOrNumberAsString(message.extra.activeSwipeId) ?? stringOrNumberAsString(message.extra.selectedSwipeId) ?? stringOrNumberAsString(message.extra.swipe_id);
}
function hashSwipeContent(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function deriveSwipeTrackerIdentity(chatId, message) {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  const swipeIndex = numberOrNull(typeof message.swipe_id === "number" ? message.swipe_id : null);
  const activeContent = swipeIndex !== null && typeof swipes[swipeIndex] === "string" ? swipes[swipeIndex] : typeof message.content === "string" ? message.content : "";
  const swipeContentHash = activeContent ? hashSwipeContent(activeContent) : null;
  const swipeId = officialSwipeId(message);
  if (swipeId) {
    return {
      chatId,
      messageId: message.id,
      swipeKey: `id-${normalizeKeyPart(swipeId)}`,
      swipeIndex,
      swipeId,
      swipeContentHash,
      swipeKeySource: "swipe_id"
    };
  }
  if (swipeIndex !== null) {
    return {
      chatId,
      messageId: message.id,
      swipeKey: `index-${swipeIndex}`,
      swipeIndex,
      swipeId: null,
      swipeContentHash,
      swipeKeySource: "swipe_index"
    };
  }
  if (swipeContentHash) {
    return {
      chatId,
      messageId: message.id,
      swipeKey: `hash-${swipeContentHash}`,
      swipeIndex: null,
      swipeId: null,
      swipeContentHash,
      swipeKeySource: "content_hash"
    };
  }
  return defaultSwipeIdentity(chatId, message.id);
}
function defaultSwipeIdentity(chatId, messageId) {
  return {
    chatId,
    messageId,
    swipeKey: DEFAULT_SWIPE_KEY,
    swipeIndex: null,
    swipeId: null,
    swipeContentHash: null,
    swipeKeySource: "unknown"
  };
}
function swipeIdentityKey(identity) {
  return `${identity.messageId}:${identity.swipeKey}`;
}
function swipeKeySourceOrUnknown(value) {
  return value === "swipe_id" || value === "swipe_index" || value === "content_hash" || value === "unknown" ? value : "unknown";
}

// src/shared/messageDisplay.ts
var MESSAGE_LOCAL_UI_SUPPORTED = true;
var MESSAGE_LOCAL_UI_FALLBACK_REASON = null;
var MESSAGE_WIDGET_PLACEMENT_REASON = "lumiverse-spindle-types@0.5.21 exposes ctx.messages.renderWidget() as a below-message widget surface and does not expose a top-placement option.";
var MESSAGE_NATIVE_TOOLBAR_SUPPORTED = false;
var MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON = "lumiverse-spindle-types@0.5.21 exposes message DOM helpers, message widgets, message tags, and message_footer mounting, but no per-message toolbar action slot.";
function snapshotForDisplay(input) {
  if (input.settings.source === "latest_chat_snapshot" && input.latestChatSnapshot) return input.latestChatSnapshot;
  return input.attachedSnapshot?.snapshot ?? null;
}
function metadataFromSnapshot(attachedSnapshot, snapshot) {
  return {
    presetId: attachedSnapshot?.presetId ?? snapshot?.presetId ?? null,
    presetName: attachedSnapshot?.presetName ?? snapshot?.presetName ?? null,
    presetVersion: attachedSnapshot?.presetVersion ?? snapshot?.presetVersion ?? null,
    snapshotCreatedAt: snapshot?.createdAt ?? null,
    attachedAt: attachedSnapshot?.attachedAt ?? null
  };
}
function identityFromInput(input) {
  if (input.swipeIdentity) return input.swipeIdentity;
  if (input.attachedSnapshot) {
    return {
      chatId: input.attachedSnapshot.chatId,
      messageId: input.messageId,
      swipeKey: input.attachedSnapshot.swipeKey ?? DEFAULT_SWIPE_KEY,
      swipeIndex: input.attachedSnapshot.swipeIndex ?? null,
      swipeId: input.attachedSnapshot.swipeId ?? null,
      swipeContentHash: input.attachedSnapshot.swipeContentHash ?? null,
      swipeKeySource: input.attachedSnapshot.swipeKeySource ?? "unknown"
    };
  }
  return defaultSwipeIdentity(input.latestChatSnapshot?.chatId ?? "", input.messageId);
}
function generationMetadataFromSnapshot(snapshot, input) {
  return {
    generationStartedAt: input.activeJobStartedAt ?? snapshot?.generationStartedAt ?? null,
    generationCompletedAt: snapshot?.generationCompletedAt ?? null,
    generationDurationMs: typeof snapshot?.generationDurationMs === "number" && Number.isFinite(snapshot.generationDurationMs) ? Math.max(0, Math.round(snapshot.generationDurationMs)) : null,
    generationCancelledAt: snapshot?.generationCancelledAt ?? null,
    generationStatus: snapshot?.generationStatus ?? null,
    isRegenerating: input.isRegenerating === true,
    activeJobId: input.activeJobId ?? null
  };
}
function renderPresetResolution(input, snapshot) {
  if (!snapshot) return null;
  if (input.presetResolution) return input.presetResolution;
  const activePreset = input.activePreset ?? input.preset ?? input.presets?.[0] ?? null;
  if (!activePreset) return null;
  const installedPresets = input.presets ?? (input.preset ? [input.preset] : [activePreset]);
  const source = input.settings.source === "latest_chat_snapshot" ? snapshot : input.attachedSnapshot ?? snapshot;
  return resolvePresetForSnapshot(source, installedPresets, activePreset);
}
function injectionSettings(settings) {
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
    header: "LTracker Recent State"
  };
}
function displayJson(messageId, messageIndex, attachedSnapshot, snapshot, settings) {
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
    data: snapshot.data
  }, null, 2), settings.maxRenderedChars);
}
function safeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003C");
}
function formatDurationMs(durationMs) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return null;
  if (durationMs < 1e3) return `${Math.round(durationMs)}ms`;
  const seconds = durationMs / 1e3;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}
function currentRunningDuration(startedAt) {
  if (!startedAt) return null;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return null;
  return formatDurationMs(Date.now() - startedMs);
}
function debugSwipeLabel(rendered, settings) {
  if (!settings.showDebugSwipeKey) return null;
  const parts = [`swipe ${rendered.swipeKey}`];
  if (rendered.swipeIndex !== null) parts.push(`index ${rendered.swipeIndex}`);
  if (rendered.swipeId) parts.push(`id ${rendered.swipeId}`);
  if (rendered.swipeKeySource !== "unknown") parts.push(rendered.swipeKeySource);
  return parts.join(" / ");
}
function controlGenerationStatus(rendered, hasTracker) {
  if (rendered.isRegenerating) return "generating";
  if (rendered.generationStatus === "completed" || rendered.generationStatus === "cancelled" || rendered.generationStatus === "failed") {
    return rendered.generationStatus;
  }
  return hasTracker ? "completed" : "idle";
}
function buildControlState(rendered, settings, hasTracker, errors) {
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
    debugSwipeLabel: debugSwipeLabel(rendered, settings)
  };
}
function buildWidgetHtml(rendered, settings) {
  if (!rendered.controlState.hasTracker && !settings.showGenerateButtonForMissingTracker) return "";
  const duration = settings.showGenerationDuration ? formatDurationMs(rendered.generationDurationMs) : null;
  const runningSince = rendered.isRegenerating ? rendered.generationStartedAt : null;
  const actionLabel = rendered.isRegenerating ? "Cancel tracker generation" : rendered.controlState.hasTracker ? "Regenerate tracker" : "Generate tracker";
  const action = rendered.controlState.hasTracker ? "toggle_regenerate" : "generate";
  const actionKind = rendered.isRegenerating ? "stop" : rendered.controlState.hasTracker ? "refresh" : "generate";
  const meta = [
    settings.showPresetName && rendered.presetName ? rendered.presetName : null,
    settings.showTimestamp && rendered.snapshotCreatedAt ? rendered.snapshotCreatedAt : null,
    rendered.controlState.debugSwipeLabel
  ].filter((item) => Boolean(item)).join(" / ");
  const body = rendered.controlState.hasTracker ? rendered.html || `<pre class="ltr-pre">${escapeHtml(rendered.textFallback)}</pre>` : "";
  const regenerateButton = settings.showWidgetRegenerateButton ? `
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
      <\/script>` : "";
  const elapsedMarkup = settings.showGenerationDuration ? rendered.isRegenerating && rendered.generationStartedAt ? `<span class="ltr-pill" data-elapsed>${escapeHtml(currentRunningDuration(rendered.generationStartedAt) ?? "0ms")}</span>` : duration ? `<span class="ltr-pill">${escapeHtml(duration)}</span>` : "" : "";
  const statusMarkup = rendered.isRegenerating ? `<span class="ltr-pill">generating</span>` : rendered.controlState.error ? `<span class="ltr-pill">warning</span>` : "";
  const metaMarkup = meta ? `<span class="ltr-meta">${escapeHtml(meta)}</span>` : "";
  const open = settings.collapsedByDefault ? "" : " open";
  const bodyMarkup = rendered.controlState.hasTracker ? `<div class="ltr-body">${body}</div>` : "";
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
function iconSvg(kind) {
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
function domButton(action, label, icon, enabled, extraClass = "") {
  if (!enabled) return "";
  return `<button class="ltd-icon-button${extraClass}" type="button" data-ltracker-dom-action="${escapeHtml(action)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${iconSvg(icon)}</button>`;
}
function buildDomHtml(rendered, settings) {
  if (!rendered.controlState.hasTracker && !settings.showGenerateButtonForMissingTracker) return "";
  const duration = settings.showGenerationDuration ? formatDurationMs(rendered.generationDurationMs) : null;
  const meta = [
    settings.showPresetName && rendered.presetName ? rendered.presetName : null,
    settings.showTimestamp && rendered.snapshotCreatedAt ? rendered.snapshotCreatedAt : null,
    rendered.controlState.debugSwipeLabel
  ].filter((item) => Boolean(item)).join(" / ");
  const elapsedMarkup = settings.showGenerationDuration ? rendered.isRegenerating && rendered.generationStartedAt ? `<span class="ltd-pill" data-ltracker-elapsed data-started-at="${escapeHtml(rendered.generationStartedAt)}">${escapeHtml(currentRunningDuration(rendered.generationStartedAt) ?? "0ms")}</span>` : duration ? `<span class="ltd-pill">${escapeHtml(duration)}</span>` : "" : "";
  const statusMarkup = rendered.isRegenerating ? `<span class="ltd-pill" data-ltracker-status>generating</span>` : rendered.controlState.error ? `<span class="ltd-pill ltd-warning" data-ltracker-status>warning</span>` : "";
  const editedMarkup = rendered.json.includes('"editedByUser": true') ? `<span class="ltd-pill">edited</span>` : "";
  const body = rendered.controlState.hasTracker ? rendered.html || `<pre class="ltd-pre">${escapeHtml(rendered.textFallback)}</pre>` : "";
  const primaryAction = rendered.isRegenerating ? "toggle_regenerate" : rendered.controlState.hasTracker ? "toggle_regenerate" : "generate";
  const actionLabel = rendered.isRegenerating ? "Cancel tracker generation" : rendered.controlState.hasTracker ? "Regenerate tracker" : "Generate tracker";
  const actionKind = rendered.isRegenerating ? "stop" : rendered.controlState.hasTracker ? "refresh" : "generate";
  const open = settings.collapsedByDefault ? "" : " open";
  const compactClass = settings.compactCollapsedHeader ? " ltd-compact" : "";
  const densityClass = settings.controlDensity === "comfortable" ? " ltd-comfortable" : " ltd-compact-density";
  const placementClass = settings.controlPlacement === "inside_tracker_header" ? " ltd-inside-header" : " ltd-message-header";
  const hasTrackerClass = rendered.controlState.hasTracker ? " ltd-has-tracker" : " ltd-missing-tracker";
  const surfaceClass = settings.displaySurface === "inline_wide" ? " ltd-surface-inline-wide ltd-chat-width" : settings.displaySurface === "inline_contained" ? " ltd-surface-inline-contained" : settings.displaySurface === "anchored_popover" ? " ltd-surface-popover ltd-overlay-shell" : settings.displaySurface === "fullscreen_reader" ? " ltd-surface-reader ltd-overlay-shell" : " ltd-surface-drawer-only";
  const expandedActions = settings.showExpandedHeaderActions || !rendered.controlState.hasTracker;
  const bodyMarkup = rendered.controlState.hasTracker ? `<div class="ltd-body" style="overflow-x: auto; max-width: 100%;">${body}</div>` : "";
  const footerActions = settings.showBottomActionsInInlineTracker && rendered.controlState.hasTracker ? `<div class="ltd-footer-actions" style="display: flex; gap: 4px; justify-content: flex-end; border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent); padding: 5px 7px;">
        ${domButton("toggle_regenerate", actionLabel, actionKind, settings.showWidgetRegenerateButton, rendered.isRegenerating ? " ltd-spinning" : "")}
        ${domButton("edit", "View or edit tracker", "edit", settings.showEditButton)}
        ${domButton("delete", "Delete tracker", "delete", settings.showDeleteButton)}
      </div>` : "";
  const titleIcon = rendered.isRegenerating ? `<span class="ltd-control-icon ltd-spinning">${iconSvg("refresh")}</span>` : rendered.controlState.error ? `<span class="ltd-control-icon ltd-warning">${iconSvg("warning")}</span>` : `<span class="ltd-control-icon">${rendered.controlState.hasTracker ? iconSvg("chevron") : iconSvg("generate")}</span>`;
  const title = rendered.controlState.hasTracker ? "L" : "";
  const readerButton = rendered.controlState.hasTracker ? domButton("reader", "Open fullscreen reader", "reader", true) : "";
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
function renderMessageTracker(input) {
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
    renderLockedPresetVersion: presetResolution?.lockedPresetVersion ?? null
  };
  if (!snapshot) {
    const textFallback2 = "No tracker snapshot is available for this message.";
    const base2 = {
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
      textFallback: textFallback2,
      json: "",
      warnings: [],
      errors: [textFallback2]
    };
    const renderable2 = {
      ...base2,
      controlState: buildControlState(base2, input.settings, false, [])
    };
    return {
      ...renderable2,
      widgetHtml: buildWidgetHtml(renderable2, input.settings),
      domHtml: buildDomHtml(renderable2, input.settings)
    };
  }
  const warnings = presetResolution?.warning ? [presetResolution.warning] : [];
  const errors = [];
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
      presetName: renderPreset.name
    }, {
      missingValuePlaceholder: "",
      maxRenderedChars: input.settings.maxRenderedChars,
      allowInlineStyles: input.settings.allowInlineStyles,
      templateTrustMode: input.settings.allowInlineStyles ? "trusted" : "safe",
      deduplicateWarnings: input.settings.deduplicateRenderWarnings,
      maxWarnings: input.settings.showRenderWarningsInDiagnosticsOnly ? 8 : 20
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
    errors
  };
  const renderable = {
    ...base,
    controlState: buildControlState(base, input.settings, true, errors)
  };
  return {
    ...renderable,
    widgetHtml: buildWidgetHtml(renderable, input.settings),
    domHtml: buildDomHtml(renderable, input.settings)
  };
}
function buildMessageTrackerHistory(input) {
  const filteredIndex = input.selectedSwipeIdentities ? input.index.filter((entry) => {
    const selected = input.selectedSwipeIdentities?.[entry.messageId];
    return !selected || selected.swipeKey === entry.swipeKey;
  }) : input.index;
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
          swipeKeySource: entry.swipeKeySource
        },
        isRegenerating: Boolean(activeJob),
        activeJobId: activeJob?.jobId ?? null,
        activeJobStartedAt: activeJob?.startedAt ?? null
      })
    };
  });
}
function historyEntryTime(entry) {
  const value = entry.snapshot?.attachedAt ?? entry.snapshot?.snapshot.createdAt ?? entry.indexEntry.createdAt;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function groupMessageTrackerHistory(entries, showDuplicates = false) {
  const groups = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const key = swipeIdentityKey(entry.indexEntry);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  let duplicateCount = 0;
  const grouped = [];
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
    duplicateCount
  };
}

// src/shared/autoTiming.ts
function stableContentHash(content) {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function shouldCancelPendingSwipe(pending, next, settings) {
  return settings.cancelPendingOnSwipeChange && pending.messageId === next.messageId && pending.swipeKey !== next.swipeKey;
}
function evaluateStableSwipeContent(first, second, settings) {
  if (!first || !second) {
    return {
      passed: false,
      contentHash: null,
      skippedReason: "Assistant message was not found during finalization."
    };
  }
  const firstContent = first.content.trim();
  const secondContent = second.content.trim();
  if (!secondContent) {
    return {
      passed: false,
      contentHash: null,
      skippedReason: "Final assistant swipe content is empty."
    };
  }
  if (first.messageId !== second.messageId || first.swipeKey !== second.swipeKey) {
    return {
      passed: false,
      contentHash: stableContentHash(secondContent),
      skippedReason: "Selected swipe changed before tracker generation."
    };
  }
  const firstHash = stableContentHash(firstContent);
  const secondHash = stableContentHash(secondContent);
  if (settings.requireStableSwipeContent && firstHash !== secondHash) {
    return {
      passed: false,
      contentHash: secondHash,
      skippedReason: "Assistant swipe content changed during stable-content check."
    };
  }
  return {
    passed: true,
    contentHash: secondHash,
    skippedReason: null
  };
}

// src/shared/messageSnapshotIndex.ts
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringOrNull2(value) {
  return typeof value === "string" ? value : null;
}
function messageIndexOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}
function swipeKeyOrDefault(value) {
  return typeof value === "string" && value.trim() ? value : DEFAULT_SWIPE_KEY;
}
function repairIndexEntry(value) {
  if (!isRecord5(value) || typeof value.messageId !== "string" || typeof value.storageKey !== "string") {
    return null;
  }
  return {
    messageId: value.messageId,
    messageIndex: messageIndexOrNull(value.messageIndex),
    swipeKey: swipeKeyOrDefault(value.swipeKey),
    swipeIndex: messageIndexOrNull(value.swipeIndex),
    swipeId: stringOrNull2(value.swipeId),
    swipeContentHash: stringOrNull2(value.swipeContentHash),
    swipeKeySource: swipeKeySourceOrUnknown(value.swipeKeySource),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    presetId: stringOrNull2(value.presetId),
    presetName: stringOrNull2(value.presetName),
    storageKey: value.storageKey
  };
}
function repairMessageSnapshotIndex(value) {
  if (!Array.isArray(value)) return [];
  const seen = /* @__PURE__ */ new Set();
  const repaired = [];
  for (const item of value) {
    const entry = repairIndexEntry(item);
    if (!entry) continue;
    const key = swipeIdentityKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    repaired.push(entry);
  }
  return sortMessageSnapshotIndex(repaired);
}
function newerIndexEntry(left, right) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime > rightTime ? left : right;
  }
  if (left.createdAt !== right.createdAt) return left.createdAt > right.createdAt ? left : right;
  return left.storageKey >= right.storageKey ? left : right;
}
function repairMessageSnapshotIndexKeepingNewest(value) {
  if (!Array.isArray(value)) return { index: [], duplicateCount: 0, invalidCount: value === void 0 || value === null ? 0 : 1 };
  const byKey = /* @__PURE__ */ new Map();
  let duplicateCount = 0;
  let invalidCount = 0;
  for (const item of value) {
    const entry = repairIndexEntry(item);
    if (!entry) {
      invalidCount += 1;
      continue;
    }
    const key = swipeIdentityKey(entry);
    const existing = byKey.get(key);
    if (existing) {
      duplicateCount += 1;
      byKey.set(key, newerIndexEntry(existing, entry));
    } else {
      byKey.set(key, entry);
    }
  }
  return {
    index: sortMessageSnapshotIndex([...byKey.values()]),
    duplicateCount,
    invalidCount
  };
}
function filterMessageSnapshotIndexByStorageKeys(index, existingStorageKeys) {
  const filtered = index.filter((entry) => existingStorageKeys.has(entry.storageKey));
  return {
    index: sortMessageSnapshotIndex(filtered),
    removedCount: Math.max(0, index.length - filtered.length)
  };
}
function sortMessageSnapshotIndex(index) {
  return [...index].sort((left, right) => {
    if (left.messageIndex !== null && right.messageIndex !== null && left.messageIndex !== right.messageIndex) {
      return left.messageIndex - right.messageIndex;
    }
    if (left.messageIndex !== null && right.messageIndex === null) return -1;
    if (left.messageIndex === null && right.messageIndex !== null) return 1;
    if (left.messageId !== right.messageId) return left.messageId.localeCompare(right.messageId);
    if (left.swipeIndex !== null && right.swipeIndex !== null && left.swipeIndex !== right.swipeIndex) {
      return left.swipeIndex - right.swipeIndex;
    }
    if (left.swipeIndex !== null && right.swipeIndex === null) return -1;
    if (left.swipeIndex === null && right.swipeIndex !== null) return 1;
    const created = left.createdAt.localeCompare(right.createdAt);
    return created !== 0 ? created : left.swipeKey.localeCompare(right.swipeKey);
  });
}
function upsertMessageSnapshotIndexEntry(index, entry) {
  const next = index.filter((item) => swipeIdentityKey(item) !== swipeIdentityKey(entry));
  next.push(entry);
  return sortMessageSnapshotIndex(next);
}
function removeMessageSnapshotIndexEntry(index, messageId, swipeKey) {
  return sortMessageSnapshotIndex(index.filter((item) => item.messageId !== messageId || item.swipeKey !== swipeKey));
}
function normalizeTrackerSnapshotPresetMetadata(snapshot) {
  return {
    ...snapshot,
    presetId: snapshot.presetId ?? null,
    presetName: snapshot.presetName ?? null,
    presetVersion: snapshot.presetVersion ?? null,
    generationStartedAt: snapshot.generationStartedAt ?? null,
    generationCompletedAt: snapshot.generationCompletedAt ?? null,
    generationDurationMs: typeof snapshot.generationDurationMs === "number" && Number.isFinite(snapshot.generationDurationMs) ? Math.max(0, Math.round(snapshot.generationDurationMs)) : null,
    generationCancelledAt: snapshot.generationCancelledAt ?? null,
    generationStatus: snapshot.generationStatus === "completed" || snapshot.generationStatus === "cancelled" || snapshot.generationStatus === "failed" ? snapshot.generationStatus : null,
    editedAt: snapshot.editedAt ?? null,
    editedByUser: snapshot.editedByUser === true,
    presetRenderLock: normalizePresetRenderLock(snapshot.presetRenderLock)
  };
}
function normalizeMessageAttachedSnapshotPresetMetadata(snapshot) {
  const normalizedSnapshot = normalizeTrackerSnapshotPresetMetadata(snapshot.snapshot);
  return {
    ...snapshot,
    swipeKey: snapshot.swipeKey ?? DEFAULT_SWIPE_KEY,
    swipeIndex: snapshot.swipeIndex ?? null,
    swipeId: snapshot.swipeId ?? null,
    swipeContentHash: snapshot.swipeContentHash ?? null,
    swipeKeySource: swipeKeySourceOrUnknown(snapshot.swipeKeySource),
    presetId: snapshot.presetId ?? normalizedSnapshot.presetId ?? null,
    presetName: snapshot.presetName ?? normalizedSnapshot.presetName ?? null,
    presetVersion: snapshot.presetVersion ?? normalizedSnapshot.presetVersion ?? null,
    snapshot: normalizedSnapshot
  };
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

// src/shared/ownerPower.ts
var OWNER_POWER_SCRIPT_TYPE = "application/ltracker-owner-power";
var OWNER_POWER_SCRIPT_PATTERN = /<\s*script\b([^>]*)>([\s\S]*?)<\s*\/\s*script\s*>/gi;
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function optionalString(value, maxLength = 64e3) {
  return typeof value === "string" ? value.slice(0, maxLength) : void 0;
}
function boolValue(value) {
  return typeof value === "boolean" ? value : void 0;
}
function scriptType(rawAttributes) {
  const match = rawAttributes.match(/\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim().toLowerCase() || null;
}
function extractOwnerPowerScriptsFromHtml(html) {
  const scripts = [];
  const warnings = [];
  const stripped = html.replace(OWNER_POWER_SCRIPT_PATTERN, (_match, rawAttributes, body) => {
    if (scriptType(rawAttributes) === OWNER_POWER_SCRIPT_TYPE) {
      scripts.push(body.trim());
      warnings.push("Owner Power script source was imported inertly and will not run unless Owner Power Mode is enabled.");
    } else {
      warnings.push("Normal script content was stripped from sanitized rendering.");
    }
    return "";
  });
  return { html: stripped, scripts, warnings };
}
function repairOwnerPowerManifest(value) {
  if (!isRecord6(value)) return void 0;
  const version = typeof value.version === "number" && Number.isFinite(value.version) ? Math.max(1, Math.round(value.version)) : 1;
  const manifest = { version };
  const entry = optionalString(value.entry, 200);
  if (entry) manifest.entry = entry;
  const usesRuntime = boolValue(value.usesRuntime);
  if (usesRuntime !== void 0) manifest.usesRuntime = usesRuntime;
  if (value.requiredMode === "owner_power") manifest.requiredMode = "owner_power";
  if (Array.isArray(value.capabilities)) {
    const capabilities = value.capabilities.filter((item) => typeof item === "string").map((item) => item.trim().slice(0, 80)).filter(Boolean).slice(0, 40);
    if (capabilities.length > 0) manifest.capabilities = capabilities;
  }
  const notes = optionalString(value.notes, 2e3);
  if (notes) manifest.notes = notes;
  return manifest;
}
function ownerPowerRequestedByPreset(preset) {
  return preset.ownerPowerManifest?.requiredMode === "owner_power" || preset.ownerPowerManifest?.usesRuntime === true || /application\/ltracker-owner-power/i.test(preset.htmlTemplate ?? "");
}
function ownerPowerFeatureSummary(preset) {
  const extracted = extractOwnerPowerScriptsFromHtml(preset.htmlTemplate ?? "");
  const explicitScript = typeof preset.ownerPowerScript === "string" ? preset.ownerPowerScript : "";
  const scriptChars = explicitScript.length + extracted.scripts.reduce((sum, script) => sum + script.length, 0);
  const hasScript = scriptChars > 0;
  const requested = ownerPowerRequestedByPreset(preset) || hasScript;
  const warnings = [
    ...extracted.warnings,
    hasScript ? "Preset contains Owner Power runtime source; it remains inert until manually enabled." : null,
    requested ? "Preset packs cannot enable Owner Power Mode automatically." : null
  ].filter((item) => Boolean(item));
  return {
    requested,
    hasScript,
    scriptChars,
    manifest: preset.ownerPowerManifest ?? null,
    warnings
  };
}
function stripOwnerPowerRecommendedSettings(value) {
  const warnings = [];
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === "ownerPowerMode") {
      warnings.push("Recommended settings that attempted to enable Owner Power Mode were stripped.");
      continue;
    }
    if (key === "renderer" && isRecord6(nested)) {
      const renderer = { ...nested };
      if (renderer.templateTrustMode === "dev") {
        renderer.templateTrustMode = "trusted";
        warnings.push("Recommended renderer Dev Mode was downgraded to Trusted; Owner Power must be enabled manually.");
      }
      output[key] = renderer;
      continue;
    }
    output[key] = nested;
  }
  return { value: output, warnings };
}

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
  },
  recommendedConnection: {
    mode: "active_quiet",
    temperature: 0.2,
    max_tokens: 8e3,
    reasoning: {
      source: "inherit",
      effort: "auto"
    },
    notes: "Start with active quiet mode, low temperature, and inherited reasoning. Use a selected raw tracker profile after confirming it returns strict JSON."
  }
};
function isRecord7(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function optionalString2(value) {
  return typeof value === "string" ? value : void 0;
}
function validOrigin(value) {
  return value === "built_in" || value === "user_imported" || value === "user_created";
}
function recommendedMode(value) {
  return value === "active_quiet" || value === "selected_connection_quiet" || value === "selected_connection_raw" ? value : void 0;
}
function recommendedReasoningSource(value) {
  return value === "inherit" || value === "off" || value === "custom" ? value : void 0;
}
function boundedNumber(value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return void 0;
  return Math.min(max, Math.max(min, value));
}
function repairCapabilities(value) {
  if (!isRecord7(value)) return void 0;
  const result = {};
  if (typeof value.supportsHtmlTemplate === "boolean") result.supportsHtmlTemplate = value.supportsHtmlTemplate;
  if (typeof value.supportsPartialRegeneration === "boolean") result.supportsPartialRegeneration = value.supportsPartialRegeneration;
  if (typeof value.supportsSequentialGeneration === "boolean") result.supportsSequentialGeneration = value.supportsSequentialGeneration;
  return Object.keys(result).length > 0 ? result : void 0;
}
function repairRecommendedConnection(value) {
  if (!isRecord7(value)) return void 0;
  const result = {};
  const mode = recommendedMode(value.mode);
  if (mode) result.mode = mode;
  const temperature = boundedNumber(value.temperature, 0, 2);
  if (temperature !== void 0) result.temperature = temperature;
  const maxTokens = boundedNumber(value.max_tokens, 256, 64e3);
  if (maxTokens !== void 0) result.max_tokens = Math.round(maxTokens);
  const reasoning = isRecord7(value.reasoning) ? value.reasoning : null;
  if (reasoning) {
    const source = recommendedReasoningSource(reasoning.source);
    const effort = typeof reasoning.effort === "string" ? reasoning.effort : void 0;
    if (source || effort) {
      result.reasoning = {};
      if (source) result.reasoning.source = source;
      if (effort) result.reasoning.effort = effort;
    }
  }
  const notes = optionalString2(value.notes);
  if (notes !== void 0) result.notes = notes;
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
  if (!isRecord7(value)) {
    return { ok: false, error: "JSON Schema must be a JSON object." };
  }
  return { ok: true, error: null };
}
function validateTrackerPreset(value) {
  if (!isRecord7(value)) return { ok: false, error: "Preset must be a JSON object." };
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
  if ("ownerPowerScript" in value && value.ownerPowerScript !== void 0 && typeof value.ownerPowerScript !== "string") {
    return { ok: false, error: "Owner Power script source must be text." };
  }
  if ("ownerPowerManifest" in value && value.ownerPowerManifest !== void 0 && !isRecord7(value.ownerPowerManifest)) {
    return { ok: false, error: "Owner Power manifest must be an object." };
  }
  if ("recommendedConnection" in value && value.recommendedConnection !== void 0 && !isRecord7(value.recommendedConnection)) {
    return { ok: false, error: "Recommended connection must be an object." };
  }
  return { ok: true, error: null };
}
function repairTrackerPreset(value) {
  if (!isRecord7(value)) return null;
  const origin = validOrigin(value.origin) ? value.origin : null;
  if (!origin) return null;
  const preset = {
    id: sanitizePresetId(stringValue(value.id)),
    name: stringValue(value.name).trim(),
    description: stringValue(value.description),
    version: stringValue(value.version, "1.0"),
    createdAt: stringValue(value.createdAt, (/* @__PURE__ */ new Date()).toISOString()),
    updatedAt: stringValue(value.updatedAt, (/* @__PURE__ */ new Date()).toISOString()),
    jsonSchema: isRecord7(value.jsonSchema) ? value.jsonSchema : {},
    promptInstructions: stringValue(value.promptInstructions),
    origin
  };
  const htmlTemplate = optionalString2(value.htmlTemplate);
  if (htmlTemplate !== void 0) preset.htmlTemplate = htmlTemplate;
  const ownerPowerScript = optionalString2(value.ownerPowerScript);
  if (ownerPowerScript !== void 0) preset.ownerPowerScript = ownerPowerScript;
  const ownerPowerManifest = repairOwnerPowerManifest(value.ownerPowerManifest);
  if (ownerPowerManifest) preset.ownerPowerManifest = ownerPowerManifest;
  const notes = optionalString2(value.notes);
  if (notes !== void 0) preset.notes = notes;
  const capabilities = repairCapabilities(value.capabilities);
  if (capabilities) preset.capabilities = capabilities;
  const recommendedConnection = repairRecommendedConnection(value.recommendedConnection);
  if (recommendedConnection) preset.recommendedConnection = recommendedConnection;
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
  if (draft.ownerPowerScript !== void 0) preset.ownerPowerScript = draft.ownerPowerScript;
  if (draft.ownerPowerManifest !== void 0) preset.ownerPowerManifest = draft.ownerPowerManifest;
  if (draft.notes !== void 0) preset.notes = draft.notes;
  if (draft.capabilities) preset.capabilities = draft.capabilities;
  if (draft.recommendedConnection) preset.recommendedConnection = draft.recommendedConnection;
  return preset;
}
function importTrackerPresetEnvelope(value, existingIds, now) {
  if (!isRecord7(value)) return { ok: false, preset: null, error: "Import must be a JSON object." };
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
function estimatePresetStats(preset) {
  const schemaJson = JSON.stringify(preset.jsonSchema, null, 2);
  const instructions = preset.promptInstructions ?? "";
  const presetContentLength = schemaJson.length + instructions.length + preset.name.length + preset.id.length;
  const estimatedTokens = Math.max(10, Math.ceil(presetContentLength / 4));
  const templateLength = (preset.htmlTemplate ?? "").length;
  const estimatedRenderedChars = templateLength > 0 ? templateLength + 4e3 : 1e4;
  return { estimatedTokens, estimatedRenderedChars };
}

// src/shared/presetPack.ts
var PRESET_PACK_KIND = "ltracker_preset_pack";
var PRESET_PACK_FORMAT_VERSION = 1;
function isRecord8(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue2(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
var REAL_CREDENTIAL_KEY_NAMES = /* @__PURE__ */ new Set([
  "apikey",
  "authkey",
  "authtoken",
  "bearer",
  "bearertoken",
  "credential",
  "credentials",
  "clientsecret",
  "password",
  "secret",
  "privatekey",
  "secretkey",
  "token",
  "accesskey"
]);
function credentialKeyName(key) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
function isRealCredentialKey(key) {
  return REAL_CREDENTIAL_KEY_NAMES.has(credentialKeyName(key));
}
function stripRecommendedSettingCredentials(obj, path, strippedPaths, depth = 0) {
  if (depth > 10) return {};
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const nextPath = `${path}.${key}`;
    if (isRealCredentialKey(key)) {
      strippedPaths.push(nextPath);
      continue;
    }
    if (isRecord8(value)) {
      result[key] = stripRecommendedSettingCredentials(value, nextPath, strippedPaths, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}
function exportPresetPack(preset, options) {
  const presetStats = estimatePresetStats(preset);
  const schemaKeys = isRecord8(preset.jsonSchema) ? Object.keys(preset.jsonSchema) : [];
  const pack = {
    kind: PRESET_PACK_KIND,
    formatVersion: PRESET_PACK_FORMAT_VERSION,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    appCompatibility: {
      extension: "LTracker",
      minVersion: "0.17",
      recommendedVersion: EXTENSION_VERSION
    },
    preset: {
      id: preset.id,
      name: preset.name,
      description: preset.description || "",
      version: preset.version,
      jsonSchema: preset.jsonSchema,
      htmlTemplate: preset.htmlTemplate ?? "",
      promptInstructions: preset.promptInstructions,
      notes: preset.notes || "",
      origin: preset.origin
    },
    validation: {
      expectedRootFields: schemaKeys,
      estimatedTokens: presetStats.estimatedTokens,
      estimatedRenderedChars: presetStats.estimatedRenderedChars
    }
  };
  if (options?.author) {
    pack.exportedBy = options.author;
    pack.preset.author = options.author;
  }
  if (preset.ownerPowerScript) {
    pack.preset.ownerPowerScript = preset.ownerPowerScript;
  }
  if (preset.ownerPowerManifest) {
    pack.preset.ownerPowerManifest = preset.ownerPowerManifest;
  }
  if (options?.includeRecommendedSettings && options.settings) {
    const settings = options.settings;
    const recommended = {};
    const connRec = {
      mode: settings.connection.mode,
      parameters: { ...settings.connection.parameters },
      reasoning: { ...settings.connection.reasoning }
    };
    recommended.connection = connRec;
    recommended.memory = {
      enabled: settings.memory.enabled,
      includeInTrackerGeneration: settings.memory.includeInTrackerGeneration,
      retainCount: settings.memory.retainCount,
      fullSnapshotCount: settings.memory.fullSnapshotCount,
      compactOlderSnapshots: settings.memory.compactOlderSnapshots,
      maxMemoryChars: settings.memory.maxMemoryChars,
      source: settings.memory.source,
      order: settings.memory.order
    };
    recommended.injection = {
      enabled: settings.injection.enabled,
      format: settings.injection.format,
      retainCount: settings.injection.retainCount,
      injectionPlacement: settings.injection.injectionPlacement,
      maxInjectedChars: settings.injection.maxInjectedChars
    };
    recommended.renderer = {
      enabled: settings.renderer.enabled,
      previewSource: settings.renderer.previewSource,
      maxRenderedChars: settings.renderer.maxRenderedChars,
      allowInlineStyles: settings.renderer.allowInlineStyles,
      templateTrustMode: settings.renderer.templateTrustMode
    };
    recommended.messageDisplay = {
      enabled: settings.messageDisplay.enabled,
      useDomInjection: settings.messageDisplay.useDomInjection,
      displayMode: settings.messageDisplay.displayMode,
      displaySurface: settings.messageDisplay.displaySurface,
      placement: settings.messageDisplay.placement,
      renderMode: settings.messageDisplay.renderMode,
      allowInlineStyles: settings.messageDisplay.allowInlineStyles,
      showTimestamp: settings.messageDisplay.showTimestamp,
      showPresetName: settings.messageDisplay.showPresetName,
      showGenerationDuration: settings.messageDisplay.showGenerationDuration,
      maxRenderedChars: settings.messageDisplay.maxRenderedChars
    };
    recommended.expandedWidth = {
      expandedWidthMode: settings.expandedWidth.expandedWidthMode,
      maxExpandedWidthPx: settings.expandedWidth.maxExpandedWidthPx,
      mobileHorizontalMarginPx: settings.expandedWidth.mobileHorizontalMarginPx,
      expandedContentMaxHeightVh: settings.expandedWidth.expandedContentMaxHeightVh
    };
    recommended.budget = {
      mode: settings.budget.mode,
      ultraModeEnabled: settings.budget.ultraModeEnabled,
      maxTrackerOutputTokens: settings.budget.maxTrackerOutputTokens,
      renderedHtmlMaxChars: settings.budget.renderedHtmlMaxChars
    };
    pack.recommendedSettings = recommended;
  }
  if (options?.exampleSnapshot && isRecord8(options.exampleSnapshot)) {
    pack.exampleSnapshot = options.exampleSnapshot;
  }
  return pack;
}
function validatePackRecommendedSettings(value) {
  if (!isRecord8(value)) return { settings: null, warnings: [] };
  const ownerPowerStripped = stripOwnerPowerRecommendedSettings(value);
  const safeValue = ownerPowerStripped.value;
  const result = {};
  const strippedPaths = [];
  if (isRecord8(safeValue.connection)) {
    result.connection = stripRecommendedSettingCredentials(
      safeValue.connection,
      "recommendedSettings.connection",
      strippedPaths
    );
  }
  if (isRecord8(safeValue.memory)) result.memory = safeValue.memory;
  if (isRecord8(safeValue.injection)) result.injection = safeValue.injection;
  if (isRecord8(safeValue.renderer)) result.renderer = safeValue.renderer;
  if (isRecord8(safeValue.messageDisplay)) result.messageDisplay = safeValue.messageDisplay;
  if (isRecord8(safeValue.expandedWidth)) result.expandedWidth = safeValue.expandedWidth;
  if (isRecord8(safeValue.budget)) result.budget = safeValue.budget;
  for (const [key, nestedValue] of Object.entries(safeValue)) {
    if (key !== "connection" && key !== "memory" && key !== "injection" && key !== "renderer" && key !== "messageDisplay" && key !== "expandedWidth" && key !== "budget" && isRecord8(nestedValue)) {
      stripRecommendedSettingCredentials(nestedValue, `recommendedSettings.${key}`, strippedPaths);
    }
  }
  const warnings = [
    ...ownerPowerStripped.warnings,
    ...strippedPaths.map((path) => `Removed credential-like recommended setting field: ${path}`)
  ];
  return { settings: Object.keys(result).length > 0 ? result : null, warnings };
}
function importPresetPack(value, existingIds, now) {
  if (!isRecord8(value)) {
    return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Import must be a JSON object.", warnings: [], packMeta: null };
  }
  if (value.kind === PRESET_PACK_KIND) {
    if (value.formatVersion !== PRESET_PACK_FORMAT_VERSION) {
      return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: `Unsupported preset pack format version: ${value.formatVersion}. Expected ${PRESET_PACK_FORMAT_VERSION}.`, warnings: [], packMeta: null };
    }
    const presetData = isRecord8(value.preset) ? value.preset : null;
    if (!presetData) {
      return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Import preset data is missing or invalid.", warnings: [], packMeta: null };
    }
    const compat = isRecord8(value.appCompatibility) ? value.appCompatibility : null;
    const warnings = [];
    const existing = new Set(existingIds);
    const rawId = sanitizePresetId(stringValue2(presetData.id, stringValue2(presetData.name, "imported")));
    const id = existing.has(rawId) || rawId === DEFAULT_TRACKER_PRESET_ID ? createPresetId(stringValue2(presetData.name, "Imported Preset"), existing) : rawId;
    const htmlExtraction = extractOwnerPowerScriptsFromHtml(typeof presetData.htmlTemplate === "string" ? presetData.htmlTemplate : "");
    const explicitOwnerPowerScript = typeof presetData.ownerPowerScript === "string" ? presetData.ownerPowerScript : "";
    const ownerPowerScript = [explicitOwnerPowerScript.trim(), ...htmlExtraction.scripts].filter(Boolean).join("\n\n");
    const ownerPowerManifest = repairOwnerPowerManifest(presetData.ownerPowerManifest);
    const preset = {
      id,
      name: stringValue2(presetData.name, "Imported Preset").trim() || "Imported Preset",
      description: stringValue2(presetData.description),
      version: stringValue2(presetData.version, "1.0"),
      createdAt: now,
      updatedAt: now,
      jsonSchema: isRecord8(presetData.jsonSchema) ? presetData.jsonSchema : {},
      promptInstructions: stringValue2(presetData.promptInstructions),
      htmlTemplate: htmlExtraction.html,
      notes: typeof presetData.notes === "string" ? presetData.notes : "",
      origin: "user_imported",
      capabilities: {
        supportsHtmlTemplate: typeof presetData.htmlTemplate === "string" && presetData.htmlTemplate.trim().length > 0
      }
    };
    if (ownerPowerScript) preset.ownerPowerScript = ownerPowerScript;
    if (ownerPowerManifest) preset.ownerPowerManifest = ownerPowerManifest;
    const ownerPowerSummary = ownerPowerFeatureSummary(preset);
    warnings.push(...htmlExtraction.warnings);
    if (ownerPowerSummary.requested) {
      warnings.push("This preset requests Owner Power Mode. It was imported inertly and will not run until Owner Power Mode is enabled manually.");
      warnings.push("Preset packs cannot enable Owner Power Mode automatically.");
    }
    if (!preset.name.trim()) {
      return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Imported preset name is empty.", warnings, packMeta: null };
    }
    if (Object.keys(preset.jsonSchema).length === 0) {
      warnings.push("Imported preset has an empty JSON schema.");
    }
    if (!preset.promptInstructions.trim()) {
      warnings.push("Imported preset has empty prompt instructions.");
    }
    const recommendedSettingsResult = validatePackRecommendedSettings(value.recommendedSettings);
    warnings.push(...recommendedSettingsResult.warnings);
    const recommendedSettings = recommendedSettingsResult.settings;
    const exampleSnapshot = isRecord8(value.exampleSnapshot) ? value.exampleSnapshot : null;
    const tags = Array.isArray(presetData.tags) ? presetData.tags.filter((t) => typeof t === "string") : [];
    const packMeta = {
      kind: PRESET_PACK_KIND,
      formatVersion: PRESET_PACK_FORMAT_VERSION,
      exportedAt: stringValue2(value.exportedAt, ""),
      minVersion: compat ? stringValue2(compat.minVersion) : null,
      recommendedVersion: compat ? stringValue2(compat.recommendedVersion) : null,
      tags,
      author: stringValue2(value.exportedBy) || stringValue2(presetData.author) || null
    };
    return { ok: true, preset, recommendedSettings, exampleSnapshot, error: null, warnings, packMeta };
  }
  if (value.kind === PRESET_EXPORT_KIND) {
    const oldResult = importTrackerPresetEnvelope(value, existingIds, now);
    if (!oldResult.ok || !oldResult.preset) {
      return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: oldResult.error ?? "Invalid legacy preset import.", warnings: [], packMeta: null };
    }
    return {
      ok: true,
      preset: oldResult.preset,
      recommendedSettings: null,
      exampleSnapshot: null,
      error: null,
      warnings: ["Imported using legacy ltracker_schema_preset format."],
      packMeta: { kind: PRESET_EXPORT_KIND, formatVersion: PRESET_EXPORT_FORMAT_VERSION, exportedAt: null, minVersion: null, recommendedVersion: null, tags: [], author: null }
    };
  }
  if (isRecord8(value) && isRecord8(value.jsonSchema) && typeof value.promptInstructions === "string") {
    const repaired = repairTrackerPreset({
      ...value,
      origin: value.origin ?? "user_imported",
      id: value.id ?? sanitizePresetId(stringValue2(value.name, "imported"))
    });
    if (!repaired) {
      return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Raw preset object could not be repaired.", warnings: [], packMeta: null };
    }
    const existing = new Set(existingIds);
    const id = existing.has(repaired.id) || repaired.id === DEFAULT_TRACKER_PRESET_ID ? createPresetId(repaired.name, existing) : repaired.id;
    return {
      ok: true,
      preset: { ...repaired, id, origin: "user_imported", createdAt: now, updatedAt: now },
      recommendedSettings: null,
      exampleSnapshot: null,
      error: null,
      warnings: ["Imported as raw preset object (no pack envelope)."],
      packMeta: null
    };
  }
  return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Unrecognized import format. Expected ltracker_preset_pack, ltracker_schema_preset, or a raw preset object with jsonSchema and promptInstructions.", warnings: [], packMeta: null };
}
var SAMPLE_MAX_DEPTH = 5;
var SAMPLE_MAX_ARRAY_LENGTH = 2;
var FIELD_HEURISTICS = [
  [/^name$/i, () => "Example Name"],
  [/^(full|display|character)[-_]?name$/i, () => "Aria Voss"],
  [/^location$/i, () => "Example Location"],
  [/^(current[-_]?)?scene$/i, () => "A dimly lit study"],
  [/^mood$/i, () => "tense"],
  [/^emotion$/i, () => "curious"],
  [/^status$/i, () => "active"],
  [/^(health|hp)$/i, () => 85],
  [/^(mana|mp|energy)$/i, () => 60],
  [/^percent(age)?$|^progress$/i, () => 66],
  [/^level$/i, () => 5],
  [/^(color|colour)$/i, () => "#75f4e8"],
  [/^(background[-_]?)?color$/i, () => "#1a1a2e"],
  [/^description$/i, () => "A brief description of the current state."],
  [/^notes?$/i, () => "No special notes."],
  [/^time$/i, () => "Late evening"],
  [/^weather$/i, () => "Overcast"],
  [/^(score|rating)$/i, () => 7],
  [/^(count|total|number)$/i, () => 3],
  [/^(title|heading)$/i, () => "Sample Title"],
  [/^(summary|overview)$/i, () => "Brief summary of events."],
  [/^(goal|objective)$/i, () => "Investigate the strange noises."],
  [/^(threat|danger)[-_]?level$/i, () => "moderate"],
  [/^(relationship|bond)$/i, () => "cautious ally"],
  [/^(attitude|disposition)$/i, () => "neutral"],
  [/^(class|role|type)$/i, () => "Researcher"],
  [/^(item|weapon|tool)$/i, () => "Brass compass"],
  [/^(gold|money|currency|coins?)$/i, () => 150],
  [/^(strength|dexterity|intelligence|wisdom|charisma|constitution)$/i, () => 14],
  [/^(active|enabled|visible|alive|conscious)$/i, () => true],
  [/^(dead|unconscious|hidden|disabled)$/i, () => false],
  [/url$/i, () => "https://example.com"],
  [/^id$/i, () => "sample-001"]
];
function sampleValueForField(fieldName, depth) {
  for (const [pattern, generator] of FIELD_HEURISTICS) {
    if (pattern.test(fieldName)) return generator();
  }
  if (fieldName.endsWith("s") && depth < SAMPLE_MAX_DEPTH) {
    return `Example ${fieldName}`;
  }
  return `Example ${fieldName.replace(/[-_]/g, " ")}`;
}
function generateSampleFromSchema(schema, depth = 0) {
  if (depth > SAMPLE_MAX_DEPTH) return "[max depth]";
  if (!isRecord8(schema)) {
    return "sample value";
  }
  const schemaType = stringValue2(schema.type, "object");
  if (schemaType === "object" || schema.properties && isRecord8(schema.properties)) {
    const properties = isRecord8(schema.properties) ? schema.properties : schema;
    const result = {};
    for (const [key, value] of Object.entries(properties)) {
      if (key === "type" || key === "properties" || key === "required" || key === "description" || key === "items" || key === "default" || key === "enum") continue;
      if (isRecord8(value)) {
        result[key] = generateSampleForProperty(key, value, depth + 1);
      } else {
        result[key] = sampleValueForField(key, depth);
      }
    }
    if (Object.keys(result).length === 0 && !schema.properties) {
      for (const key of Object.keys(schema)) {
        if (isRecord8(schema[key])) {
          result[key] = generateSampleFromSchema(schema[key], depth + 1);
        } else {
          result[key] = sampleValueForField(key, depth);
        }
      }
    }
    return result;
  }
  if (schemaType === "array") {
    const items = isRecord8(schema.items) ? schema.items : null;
    const sample = items ? generateSampleFromSchema(items, depth + 1) : "sample item";
    return Array.from(
      { length: Math.min(SAMPLE_MAX_ARRAY_LENGTH, 2) },
      () => isRecord8(sample) ? { ...sample } : sample
    );
  }
  if (schemaType === "string") {
    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      return schema.enum[0];
    }
    if (typeof schema.default === "string") return schema.default;
    return "sample text";
  }
  if (schemaType === "number" || schemaType === "integer") {
    if (typeof schema.default === "number") return schema.default;
    return 42;
  }
  if (schemaType === "boolean") {
    if (typeof schema.default === "boolean") return schema.default;
    return true;
  }
  return "sample value";
}
function generateSampleForProperty(fieldName, prop, depth) {
  if (depth > SAMPLE_MAX_DEPTH) return "[max depth]";
  if (typeof prop.default !== "undefined") return prop.default;
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0];
  const propType = stringValue2(prop.type, "");
  if (propType === "object" || isRecord8(prop.properties)) {
    return generateSampleFromSchema(prop, depth);
  }
  if (propType === "array") {
    const items = isRecord8(prop.items) ? prop.items : null;
    const itemSample = items ? generateSampleFromSchema(items, depth + 1) : sampleValueForField(fieldName, depth);
    return Array.from(
      { length: SAMPLE_MAX_ARRAY_LENGTH },
      () => isRecord8(itemSample) ? { ...itemSample } : itemSample
    );
  }
  if (propType === "number" || propType === "integer") {
    const heuristic = sampleValueForField(fieldName, depth);
    return typeof heuristic === "number" ? heuristic : 42;
  }
  if (propType === "boolean") {
    const heuristic = sampleValueForField(fieldName, depth);
    return typeof heuristic === "boolean" ? heuristic : true;
  }
  return sampleValueForField(fieldName, depth);
}
function trackerStressData(mode) {
  const longWord = "HyperAdministrativelyOverInstrumentalizedContinuityCheckpoint";
  const commonCast = [
    {
      name: "Cecelia Voss",
      role: "Political liaison",
      desc: "Composed, watchful, and tracking every private reaction in the room.",
      rel: [
        { t: "Liaison", c: "Cecelia Voss" },
        { t: "Trust", c: "Cautious but rising" }
      ],
      pockets: [
        { t: "cigarettes", c: "right hand" },
        { t: "folded writ", c: "inside coat" }
      ]
    },
    {
      name: mode === "mobile_torture" ? `Maximilian-${longWord}` : "Mara Ell",
      role: "Witness",
      desc: mode === "mobile_torture" ? `A long visual description with ${longWord} and several clauses that should reveal cramped mobile layouts.` : "Nervous but attentive, with one unresolved answer still hidden.",
      rel: [
        { t: mode === "mobile_torture" ? `LongRelationLabel-${longWord}` : "Pressure", c: "Knows more than she admits" }
      ],
      pockets: [
        { t: mode === "mobile_torture" ? `Pocket-${longWord}` : "silver key", c: "left pocket" }
      ]
    }
  ];
  const worldItems = [
    { t: "storm lantern", c: "low oil" },
    { t: "sealed contract", c: "unsigned" },
    { t: "weather", c: "rain pressing against the windows" }
  ];
  const base = {
    time: { clock: "23:18", day: "Thursday", pressure: 72 },
    loc: {
      name: mode === "mobile_torture" ? `Northwestern-${longWord}-Observation Balcony` : "North Gallery",
      weather: "Hard rain, amber lamps, glass fogging at the edges."
    },
    scene: {
      location: mode === "mobile_torture" ? `Northwestern-${longWord}-Observation Balcony` : "North Gallery",
      time: "late night",
      mood: "charged but contained",
      alert: mode === "mobile_torture" ? `Very long alert: ${longWord} ${longWord} ${longWord}.` : "A promised answer is overdue."
    },
    cast: commonCast,
    rel: commonCast[0]?.rel ?? [],
    relations: commonCast[0]?.rel ?? [],
    pockets: commonCast[0]?.pockets ?? [],
    world: {
      items: worldItems,
      alerts: [
        { t: "Door", c: "Unlocked from the wrong side" },
        { t: "Ledger", c: "Missing final page" }
      ]
    },
    meters: {
      danger: 63,
      intimacy: 41,
      suspicion: 78
    },
    notes: [
      "One optional field is intentionally absent in some samples.",
      mode === "mobile_torture" ? `Long unbroken token ${longWord}${longWord}` : "Use this to test wrapping."
    ],
    empty_list: [],
    missing_optional_demo: null
  };
  if (mode === "minimal") {
    return {
      time: { clock: "09:00" },
      loc: { name: "Small room" },
      scene: { location: "Small room", time: "morning" },
      cast: [commonCast[0]],
      rel: [],
      pockets: []
    };
  }
  if (mode === "cast_heavy") {
    return {
      ...base,
      cast: [
        ...commonCast,
        {
          name: "Tamsin Vale",
          role: "Guard captain",
          desc: "Scanning exits and counting lies.",
          rel: [{ t: "Command", c: "Controls the room" }],
          pockets: [{ t: "brass whistle", c: "belt" }]
        },
        {
          name: "Oren Pike",
          role: "Messenger",
          desc: "Carrying a letter he has not read.",
          rel: [{ t: "Risk", c: "May bolt if pressed" }],
          pockets: [{ t: "sealed letter", c: "satchel" }]
        }
      ]
    };
  }
  if (mode === "world_heavy") {
    return {
      ...base,
      world: {
        items: [
          ...worldItems,
          { t: "north door", c: "barred" },
          { t: "old bell", c: "rings without being touched" },
          { t: "ledger ink", c: "fresh" }
        ],
        factions: [
          { t: "Wardens", c: "watching" },
          { t: "Archivists", c: "withholding records" }
        ]
      }
    };
  }
  if (mode === "stress" || mode === "mobile_torture") {
    return {
      ...base,
      cast: [
        ...commonCast,
        {
          name: "Dr. Halden Cross",
          role: "Archivist",
          desc: "Carries the last known map and refuses to say who drew it.",
          rel: [
            { t: "Debt", c: "Owes Cecelia a dangerous favor" },
            { t: "Fear", c: "The map names him" }
          ],
          pockets: [
            { t: "map tube", c: "under arm" },
            { t: "burnt match", c: "waistcoat" }
          ]
        }
      ]
    };
  }
  return base;
}
function mergeSampleModeData(base, mode) {
  const modeData = trackerStressData(mode);
  if (mode === "normal") {
    return {
      ...modeData,
      ...base,
      cast: Array.isArray(base.cast) ? base.cast : modeData.cast,
      rel: Array.isArray(base.rel) ? base.rel : modeData.rel,
      relations: Array.isArray(base.relations) ? base.relations : modeData.relations,
      pockets: Array.isArray(base.pockets) ? base.pockets : modeData.pockets,
      world: isRecord8(base.world) ? { ...modeData.world, ...base.world } : modeData.world
    };
  }
  return {
    ...base,
    ...modeData,
    world: isRecord8(base.world) && isRecord8(modeData.world) ? { ...base.world, ...modeData.world } : modeData.world
  };
}
function generateSampleSnapshot(jsonSchema, mode = "normal") {
  const result = generateSampleFromSchema(jsonSchema, 0);
  const base = isRecord8(result) ? result : { data: result };
  return mergeSampleModeData(base, mode);
}
var SCHEMA_META_KEYS = /* @__PURE__ */ new Set(["type", "properties", "required", "description", "items", "default", "enum"]);
var TEMPLATE_HELPERS = /* @__PURE__ */ new Set([
  "default",
  "percent",
  "json",
  "eq",
  "gt",
  "lt",
  "and",
  "or",
  "not",
  "class",
  "safeClass",
  "lower",
  "upper",
  "truncate",
  "length",
  "join",
  "pluck",
  "pluckJoin",
  "get",
  "coalesce",
  "isArray",
  "isObject",
  "isEmpty",
  "notEmpty",
  "clamp",
  "meterWidth",
  "nl2br",
  "chip",
  "chipList",
  "fieldChip",
  "fieldChipList"
]);
function valueAtTemplatePath(source, path) {
  if (!path) return source;
  let current = source;
  for (const part of path.split(".")) {
    if (!part) continue;
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[Number(part)];
    } else if (isRecord8(current)) {
      current = current[part];
    } else {
      return void 0;
    }
  }
  return current;
}
function collectSchemaFieldNames(schema, prefix = "", depth = 0) {
  if (depth > 5) return [];
  if (isRecord8(schema.properties)) {
    return collectSchemaFieldNames(schema.properties, prefix, depth);
  }
  const fields = [];
  for (const key of Object.keys(schema)) {
    if (SCHEMA_META_KEYS.has(key)) continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    fields.push(fullKey);
    const val = schema[key];
    if (isRecord8(val)) {
      if (isRecord8(val.properties)) {
        fields.push(...collectSchemaFieldNames(val.properties, fullKey, depth + 1));
      } else if (val.type === "array" && isRecord8(val.items)) {
        const item = val.items;
        if (isRecord8(item.properties)) {
          fields.push(...collectSchemaFieldNames(item.properties, fullKey, depth + 1));
        } else if (isRecord8(item)) {
          fields.push(...collectSchemaFieldNames(item, fullKey, depth + 1));
        }
      } else if (val.type !== "string" && val.type !== "number" && val.type !== "boolean" && val.type !== "integer" && val.type !== "array") {
        fields.push(...collectSchemaFieldNames(val, fullKey, depth + 1));
      }
    }
  }
  return [...new Set(fields)];
}
function expressionTokens(expression) {
  const tokens = [];
  const pattern = /"[^"]*"|'[^']*'|[^\s]+/g;
  let match;
  while ((match = pattern.exec(expression)) !== null) tokens.push(match[0] ?? "");
  return tokens;
}
function isLiteralToken(token) {
  return token === "true" || token === "false" || token === "null" || /^-?\d+(?:\.\d+)?$/.test(token) || /^".*"$/.test(token) || /^'.*'$/.test(token);
}
function normalizeTemplatePath(path, contextStack) {
  const trimmed = path.trim();
  if (!trimmed || isLiteralToken(trimmed)) return null;
  if (TEMPLATE_HELPERS.has(trimmed)) return null;
  if (trimmed.startsWith("@root.")) return trimmed.slice(6);
  if (trimmed === "@root") return null;
  if (trimmed === "@index" || trimmed === "@first" || trimmed === "@last") return null;
  if (trimmed.startsWith("data.")) return trimmed.slice(5);
  let withoutData = trimmed;
  let contextIndex = contextStack.length - 1;
  while (withoutData.startsWith("../")) {
    withoutData = withoutData.slice(3);
    contextIndex -= 1;
  }
  const currentContext = contextStack[Math.max(0, contextIndex)] ?? "";
  if (withoutData === "this" || withoutData === ".") return currentContext || null;
  if (withoutData.startsWith("this.")) {
    return currentContext ? `${currentContext}.${withoutData.slice(5)}` : withoutData.slice(5);
  }
  const root = withoutData.split(".")[0] ?? "";
  if (currentContext && root && !withoutData.includes(".") && root !== currentContext.split(".")[0]) {
    return `${currentContext}.${withoutData}`;
  }
  if (currentContext && root && !withoutData.startsWith(`${currentContext}.`) && root !== currentContext.split(".")[0]) {
    return `${currentContext}.${withoutData}`;
  }
  return withoutData;
}
function addTemplateExpressionPaths(expression, contextStack, placeholders) {
  const tokens = expressionTokens(expression);
  if (tokens.length === 0) return;
  const relevant = TEMPLATE_HELPERS.has(tokens[0] ?? "") ? tokens.slice(1) : tokens;
  for (const token of relevant) {
    const normalized = normalizeTemplatePath(token, contextStack);
    if (normalized) placeholders.add(normalized);
  }
}
function findTemplatePlaceholders(template) {
  const placeholders = /* @__PURE__ */ new Set();
  const contextStack = [];
  const pattern = /\{\{\s*([\s\S]*?)\s*\}\}/g;
  let match;
  while ((match = pattern.exec(template)) !== null) {
    const expression = (match[1] ?? "").trim();
    if (!expression || expression === "else") continue;
    if (expression.startsWith("/")) {
      const closing = expression.slice(1).trim();
      if (closing === "each" || closing === "with") contextStack.pop();
      continue;
    }
    if (expression.startsWith("#")) {
      const [block, ...rest] = expressionTokens(expression.slice(1));
      const blockExpression = rest.join(" ");
      if (blockExpression) addTemplateExpressionPaths(blockExpression, contextStack, placeholders);
      if (block === "each" || block === "with") {
        const normalized = normalizeTemplatePath(blockExpression, contextStack);
        if (normalized) contextStack.push(normalized);
      }
      continue;
    }
    addTemplateExpressionPaths(expression, contextStack, placeholders);
  }
  return [...placeholders];
}
function findDirectInterpolatedPaths(template) {
  const direct = /* @__PURE__ */ new Set();
  const contextStack = [];
  const pattern = /\{\{\s*([\s\S]*?)\s*\}\}/g;
  let match;
  while ((match = pattern.exec(template)) !== null) {
    const expression = (match[1] ?? "").trim();
    if (!expression || expression === "else") continue;
    if (expression.startsWith("/")) {
      const closing = expression.slice(1).trim();
      if (closing === "each" || closing === "with") contextStack.pop();
      continue;
    }
    if (expression.startsWith("#")) {
      const [block, ...rest] = expressionTokens(expression.slice(1));
      const blockExpression = rest.join(" ");
      if (block === "each" || block === "with") {
        const normalized2 = normalizeTemplatePath(blockExpression, contextStack);
        if (normalized2) contextStack.push(normalized2);
      }
      continue;
    }
    const tokens = expressionTokens(expression);
    if (tokens.length !== 1 || TEMPLATE_HELPERS.has(tokens[0] ?? "")) continue;
    const normalized = normalizeTemplatePath(tokens[0] ?? "", contextStack);
    if (normalized) direct.add(normalized);
  }
  return [...direct];
}
function collectTemplateAuthoringWarnings(template, sampleData) {
  const rawObjectInterpolationPaths = [];
  const rawArrayInterpolationPaths = [];
  for (const path of findDirectInterpolatedPaths(template)) {
    const value = valueAtTemplatePath(sampleData, path);
    if (Array.isArray(value)) rawArrayInterpolationPaths.push(path);
    else if (isRecord8(value)) rawObjectInterpolationPaths.push(path);
  }
  const mobileRiskWarnings = [];
  const verticalTextRiskWarnings = [];
  const styleText = template.replace(/\s+/g, " ");
  const fixedWidthPattern = /\b(?:width|min-width)\s*:\s*(\d{3,5})px/gi;
  let widthMatch;
  while ((widthMatch = fixedWidthPattern.exec(styleText)) !== null) {
    const width = Number(widthMatch[1]);
    if (Number.isFinite(width) && width > 360) {
      mobileRiskWarnings.push(`Possible mobile overflow: fixed/min width ${width}px may exceed common phone viewport.`);
    }
    if (Number.isFinite(width) && width > 0 && width <= 72) {
      verticalTextRiskWarnings.push(`Possible vertical text wrapping: narrow fixed width ${width}px can force letter-by-letter wrapping.`);
    }
  }
  if (/grid-template-columns\s*:[^;]*(?:\d+px[^;]*){3,}/i.test(styleText)) {
    mobileRiskWarnings.push("Possible mobile overflow: grid uses several fixed pixel columns.");
  }
  if (/white-space\s*:\s*nowrap/i.test(styleText)) {
    mobileRiskWarnings.push("Possible mobile overflow: white-space nowrap can push long tracker content off screen.");
  }
  if (/\bposition\s*:\s*(?:absolute|fixed)\b/i.test(styleText)) {
    mobileRiskWarnings.push("Possible mobile overflow: absolute/fixed positioning inside a template can escape small preview shells.");
  }
  if (/<svg\b[^>]*(?:width|height)\s*=\s*["']?(\d{3,5})/i.test(template)) {
    mobileRiskWarnings.push("Possible mobile overflow: SVG has a large fixed width or height.");
  }
  if (/writing-mode\s*:/i.test(styleText)) {
    verticalTextRiskWarnings.push("Possible vertical text wrapping: writing-mode is set in template CSS.");
  }
  if (/word-break\s*:\s*(?:break-all|break-word)/i.test(styleText)) {
    verticalTextRiskWarnings.push("Possible vertical text wrapping: aggressive word-break can create letter-by-letter columns.");
  }
  if (/grid-template-columns\s*:[^;]*(?:\b\d{1,2}px\b|minmax\(\s*0\s*,\s*\d{1,2}px\s*\))/i.test(styleText)) {
    verticalTextRiskWarnings.push("Possible vertical text wrapping: a very narrow grid column may squeeze labels.");
  }
  return {
    rawObjectInterpolationPaths: [...new Set(rawObjectInterpolationPaths)],
    rawArrayInterpolationPaths: [...new Set(rawArrayInterpolationPaths)],
    mobileRiskWarnings: [...new Set(mobileRiskWarnings)],
    verticalTextRiskWarnings: [...new Set(verticalTextRiskWarnings)]
  };
}
function presetName(preset) {
  return preset.name ?? "";
}
function presetId(preset) {
  return "id" in preset && typeof preset.id === "string" ? preset.id : "validation_target";
}
function validatePresetReport(preset, options) {
  const entries = [];
  const missingPlaceholders = [];
  const unusedSchemaFields = [];
  const rawObjectInterpolationPaths = [];
  const rawArrayInterpolationPaths = [];
  const mobileRiskWarnings = [];
  const verticalTextRiskWarnings = [];
  const sanitizerWarningGroups = [];
  const rendererRequirements = detectTemplateRendererRequirements(preset.htmlTemplate ?? "");
  let sampleRenderResult = null;
  if (preset.name?.trim()) {
    entries.push({ severity: "pass", category: "Metadata", message: "Preset name exists." });
  } else {
    entries.push({ severity: "error", category: "Metadata", message: "Preset name is empty." });
  }
  if (preset.version?.trim()) {
    entries.push({ severity: "pass", category: "Metadata", message: "Preset version exists." });
  } else {
    entries.push({ severity: "error", category: "Metadata", message: "Preset version is missing." });
  }
  if (isRecord8(preset.jsonSchema)) {
    const rootKeys = Object.keys(preset.jsonSchema);
    if (rootKeys.length > 0) {
      entries.push({ severity: "pass", category: "Schema", message: `JSON schema has ${rootKeys.length} root field(s): ${rootKeys.slice(0, 10).join(", ")}${rootKeys.length > 10 ? "..." : ""}.` });
    } else {
      entries.push({ severity: "error", category: "Schema", message: "JSON schema is empty (no root fields)." });
    }
    const schemaJson = JSON.stringify(preset.jsonSchema, null, 2);
    const schemaSize = schemaJson.length;
    if (schemaSize > 5e4) {
      entries.push({ severity: "warning", category: "Schema", message: `JSON schema is very large (${schemaSize.toLocaleString()} chars). Consider simplifying.` });
    } else {
      entries.push({ severity: "info", category: "Schema", message: `JSON schema size: ${schemaSize.toLocaleString()} chars.` });
    }
    const schemaObj = preset.jsonSchema;
    if (Array.isArray(schemaObj.required)) {
      const requiredFields = schemaObj.required.filter((f) => typeof f === "string");
      const invalidRequired = requiredFields.filter((f) => !rootKeys.includes(f) && !(isRecord8(schemaObj.properties) && f in schemaObj.properties));
      if (invalidRequired.length > 0) {
        entries.push({ severity: "warning", category: "Schema", message: `Required fields not in schema properties: ${invalidRequired.join(", ")}.` });
      }
    }
  } else {
    entries.push({ severity: "error", category: "Schema", message: "JSON schema is not a valid object." });
  }
  const prompt = preset.promptInstructions ?? "";
  if (prompt.trim()) {
    entries.push({ severity: "pass", category: "Prompt", message: "Prompt instructions exist." });
    const promptTokens = Math.ceil(prompt.length / 4);
    entries.push({ severity: "info", category: "Prompt", message: `Estimated prompt tokens: ~${promptTokens.toLocaleString()}.` });
    if (promptTokens > 8e3) {
      entries.push({ severity: "warning", category: "Prompt", message: `Prompt is very large (~${promptTokens.toLocaleString()} tokens). Consider reducing if generation is slow.` });
    }
    const hasJsonInstruction = /json[\s-]*only|respond[\s]*(?:only[\s]*)?(?:with|in)[\s]*json|output[\s]*(?:must[\s]*be[\s]*)?json|no[\s]*(?:markdown|prose|explanation)/i.test(prompt);
    if (!hasJsonInstruction) {
      entries.push({ severity: "warning", category: "Prompt", message: "Prompt may not contain a clear JSON-only instruction. Consider adding 'Respond only with JSON' to prevent prose around the tracker output." });
    }
  } else {
    entries.push({ severity: "error", category: "Prompt", message: "Prompt instructions are empty." });
  }
  const template = preset.htmlTemplate ?? "";
  if (template.trim()) {
    entries.push({ severity: "pass", category: "Template", message: "HTML template exists." });
    entries.push({ severity: "info", category: "Template", message: `Template size: ${template.length.toLocaleString()} chars.` });
    if (rendererRequirements.features.length > 0) {
      entries.push({
        severity: rendererRequirements.recommendedMode === "dev" ? "warning" : "info",
        category: "Renderer",
        message: `Template uses ${rendererRequirements.features.join(", ")}. Recommended mode: ${rendererRequirements.recommendedMode === "dev" ? "Trusted now; future Dev Mode for JavaScript-like content" : "Trusted"}.`
      });
    }
    for (const warning of rendererRequirements.warnings) {
      entries.push({ severity: "warning", category: "Renderer", message: warning });
    }
    const sampleData = isRecord8(preset.jsonSchema) ? generateSampleSnapshot(preset.jsonSchema, options?.sampleMode ?? "normal") : {};
    const authoringWarnings = collectTemplateAuthoringWarnings(template, sampleData);
    rawObjectInterpolationPaths.push(...authoringWarnings.rawObjectInterpolationPaths);
    rawArrayInterpolationPaths.push(...authoringWarnings.rawArrayInterpolationPaths);
    mobileRiskWarnings.push(...authoringWarnings.mobileRiskWarnings);
    verticalTextRiskWarnings.push(...authoringWarnings.verticalTextRiskWarnings);
    for (const path of rawArrayInterpolationPaths) {
      entries.push({
        severity: "warning",
        category: "Template Lint",
        message: `This path appears to be an array and may render as raw JSON: ${path}. Use {{#each ${path}}}...{{/each}} or a chip/list helper.`
      });
    }
    for (const path of rawObjectInterpolationPaths) {
      entries.push({
        severity: "warning",
        category: "Template Lint",
        message: `This path appears to be an object and may render as raw JSON: ${path}. Use {{#with ${path}}}...{{/with}}, {{json ${path}}}, or a field helper.`
      });
    }
    for (const warning of mobileRiskWarnings) {
      entries.push({ severity: "warning", category: "Mobile QA", message: warning });
    }
    for (const warning of verticalTextRiskWarnings) {
      entries.push({ severity: "warning", category: "Mobile QA", message: warning });
    }
    if (isRecord8(preset.jsonSchema)) {
      const schemaFields = collectSchemaFieldNames(preset.jsonSchema);
      const templatePlaceholders = findTemplatePlaceholders(template);
      for (const placeholder of templatePlaceholders) {
        const rootField = placeholder.split(".")[0];
        if (!schemaFields.some((f) => f === placeholder || f.startsWith(placeholder + ".") || f === rootField)) {
          missingPlaceholders.push(placeholder);
        }
      }
      if (missingPlaceholders.length > 0) {
        entries.push({ severity: "warning", category: "Template", message: `Template references fields not in schema: ${missingPlaceholders.join(", ")}.` });
      }
      for (const field of schemaFields) {
        const rootField = field.split(".")[0];
        if (!templatePlaceholders.some((p) => p === field || p === rootField || field.startsWith(p + ".") || p.startsWith(field + "."))) {
          unusedSchemaFields.push(field);
        }
      }
      if (unusedSchemaFields.length > 0 && unusedSchemaFields.length <= 20) {
        entries.push({ severity: "info", category: "Template", message: `Schema fields not referenced in template: ${unusedSchemaFields.join(", ")}.` });
      }
    }
    sampleRenderResult = renderHtmlTemplate(
      { template, snapshotData: sampleData, presetId: presetId(preset), presetName: presetName(preset) },
      {
        allowInlineStyles: options?.allowInlineStyles ?? true,
        templateTrustMode: options?.allowInlineStyles === false ? "safe" : "trusted",
        maxRenderedChars: options?.maxRenderedChars ?? 5e5,
        deduplicateWarnings: true,
        maxWarnings: 50
      }
    );
    if (sampleRenderResult.ok) {
      entries.push({ severity: "pass", category: "Template", message: "Template renders successfully with sample data." });
      const renderedSize = sampleRenderResult.html.length;
      entries.push({ severity: "info", category: "Template", message: `Rendered HTML size: ${renderedSize.toLocaleString()} chars.` });
      if (renderedSize > 1e5) {
        entries.push({ severity: "warning", category: "Template", message: "Rendered output is very large. May be slow on mobile devices." });
      }
    } else {
      entries.push({ severity: "warning", category: "Template", message: `Template render failed with sample data: ${sampleRenderResult.errors.join("; ")}` });
    }
    if (sampleRenderResult && sampleRenderResult.warnings.length > 0) {
      const warningGroups = /* @__PURE__ */ new Map();
      for (const w of sampleRenderResult.warnings) {
        const key = w.replace(/["'][^"']*["']/g, "...").replace(/\d+/g, "N");
        warningGroups.set(key, (warningGroups.get(key) ?? 0) + 1);
      }
      for (const [group, count] of warningGroups) {
        const label = count > 1 ? `(\xD7${count}) ${group}` : group;
        sanitizerWarningGroups.push(label);
      }
      if (sanitizerWarningGroups.length > 0) {
        entries.push({ severity: "warning", category: "Sanitizer", message: `${sanitizerWarningGroups.length} sanitizer warning group(s).` });
      }
    }
  } else {
    entries.push({ severity: "info", category: "Template", message: "No HTML template. Text fallback will be used for display." });
  }
  const schemaPreset = {
    id: presetId(preset),
    name: preset.name ?? "",
    description: "description" in preset && typeof preset.description === "string" ? preset.description : "",
    version: preset.version ?? "1.0",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    jsonSchema: isRecord8(preset.jsonSchema) ? preset.jsonSchema : {},
    promptInstructions: preset.promptInstructions ?? "",
    htmlTemplate: preset.htmlTemplate ?? "",
    notes: preset.notes ?? "",
    origin: "origin" in preset && typeof preset.origin === "string" ? preset.origin : "user_created"
  };
  const stats = estimatePresetStats(schemaPreset);
  const packSizeEstimate = JSON.stringify(preset).length;
  const errorCount = entries.filter((e) => e.severity === "error").length;
  const warningCount = entries.filter((e) => e.severity === "warning").length;
  const passCount = entries.filter((e) => e.severity === "pass").length;
  return {
    ok: errorCount === 0,
    entries,
    errorCount,
    warningCount,
    passCount,
    estimatedPromptTokens: stats.estimatedTokens,
    estimatedRenderedChars: stats.estimatedRenderedChars,
    estimatedPackSizeChars: packSizeEstimate,
    missingPlaceholders,
    unusedSchemaFields,
    rawObjectInterpolationPaths,
    rawArrayInterpolationPaths,
    mobileRiskWarnings,
    verticalTextRiskWarnings,
    sanitizerWarningGroups,
    rendererRequirements,
    sampleRenderResult
  };
}
function sanitizePackFileName(presetName2, presetVersion) {
  const name = (presetName2 ?? "").trim().replace(/[^a-zA-Z0-9_\- ]+/g, "").replace(/\s+/g, "-").replace(/^-+|-+$/g, "") || "preset";
  const version = (presetVersion ?? "").trim().replace(/[^a-zA-Z0-9._-]+/g, "") || "1.0";
  return `${name}-${version}.ltracker.json`;
}

// src/shared/generationRequest.ts
var TRACKER_CONNECTION_DEFAULT_TEST_PROMPT = "Return a compact JSON object with ok true and a short status.";
var TRACKER_CONNECTION_PARAMETER_LIMITS = {
  temperature: { min: 0, max: 2, default: 0.2 },
  max_tokens: { min: 256, max: 64e3, default: 8e3 },
  top_p: { min: 0, max: 1, default: null },
  frequency_penalty: { min: -2, max: 2, default: null },
  presence_penalty: { min: -2, max: 2, default: null }
};
var DEFAULT_TRACKER_CONNECTION_PARAMETERS = {
  temperature: TRACKER_CONNECTION_PARAMETER_LIMITS.temperature.default,
  max_tokens: TRACKER_CONNECTION_PARAMETER_LIMITS.max_tokens.default,
  top_p: null,
  frequency_penalty: null,
  presence_penalty: null
};
function finiteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function cleanParameterValue(value, limits, integer = false) {
  if (value === null || value === void 0 || value === "") return null;
  const numeric = finiteNumber(value);
  if (numeric === null) return null;
  const clamped = clamp(numeric, limits.min, limits.max);
  return integer ? Math.round(clamped) : clamped;
}
function cleanTrackerGenerationParameters(parameters) {
  if (!parameters) return null;
  const result = {};
  const temperature = cleanParameterValue(parameters.temperature, TRACKER_CONNECTION_PARAMETER_LIMITS.temperature);
  const maxTokens = cleanParameterValue(parameters.max_tokens, TRACKER_CONNECTION_PARAMETER_LIMITS.max_tokens, true);
  const topP = cleanParameterValue(parameters.top_p, TRACKER_CONNECTION_PARAMETER_LIMITS.top_p);
  const frequencyPenalty = cleanParameterValue(
    parameters.frequency_penalty,
    TRACKER_CONNECTION_PARAMETER_LIMITS.frequency_penalty
  );
  const presencePenalty = cleanParameterValue(
    parameters.presence_penalty,
    TRACKER_CONNECTION_PARAMETER_LIMITS.presence_penalty
  );
  if (temperature !== null) result.temperature = temperature;
  if (maxTokens !== null) result.max_tokens = maxTokens;
  if (topP !== null) result.top_p = topP;
  if (frequencyPenalty !== null) result.frequency_penalty = frequencyPenalty;
  if (presencePenalty !== null) result.presence_penalty = presencePenalty;
  return Object.keys(result).length > 0 ? result : null;
}
function buildTrackerReasoningOverride(reasoning) {
  if (!reasoning || reasoning.source === "inherit") return null;
  if (reasoning.source === "off") {
    return {
      source: "off",
      apiReasoning: false
    };
  }
  return {
    source: "custom",
    apiReasoning: reasoning.apiReasoning,
    effort: reasoning.effort,
    thinkingDisplay: reasoning.thinkingDisplay
  };
}
function activeQuietResult(messages, signal, parametersUsed, reasoningOverrideUsed, fallbackReason) {
  const request = {
    type: "quiet",
    messages
  };
  if (parametersUsed) request.parameters = parametersUsed;
  if (reasoningOverrideUsed) request.reasoning = reasoningOverrideUsed;
  if (signal) request.signal = signal;
  return {
    request,
    modeUsed: "active_quiet",
    connectionIdUsed: null,
    connectionNameUsed: null,
    fallbackReason,
    parametersUsed,
    reasoningOverrideUsed
  };
}
function buildTrackerGenerationRequest(input) {
  const connectionSettings = input.settings.connection;
  const quietSupportsConnectionId = input.quietSupportsConnectionId !== false;
  const parametersUsed = cleanTrackerGenerationParameters({
    ...connectionSettings.parameters,
    max_tokens: effectiveTrackerOutputTokens(input.settings)
  });
  const reasoningOverrideUsed = buildTrackerReasoningOverride(connectionSettings.reasoning);
  if (connectionSettings.mode === "active_quiet") {
    return activeQuietResult(input.messages, input.signal, parametersUsed, reasoningOverrideUsed, null);
  }
  if (!connectionSettings.selectedConnectionId) {
    return activeQuietResult(
      input.messages,
      input.signal,
      parametersUsed,
      reasoningOverrideUsed,
      "No tracker profile selected. LTracker will use the active roleplay connection until one is selected."
    );
  }
  if (!input.selectedConnection) {
    return activeQuietResult(
      input.messages,
      input.signal,
      parametersUsed,
      reasoningOverrideUsed,
      "Selected tracker connection profile is missing or unavailable."
    );
  }
  const request = {
    type: connectionSettings.mode === "selected_connection_raw" || !quietSupportsConnectionId ? "raw" : "quiet",
    messages: input.messages,
    connection_id: input.selectedConnection.id
  };
  if (parametersUsed) request.parameters = parametersUsed;
  if (reasoningOverrideUsed) request.reasoning = reasoningOverrideUsed;
  if (input.signal) request.signal = input.signal;
  return {
    request,
    modeUsed: request.type === "raw" ? "selected_connection_raw" : "selected_connection_quiet",
    connectionIdUsed: input.selectedConnection.id,
    connectionNameUsed: input.selectedConnection.name,
    fallbackReason: connectionSettings.mode === "selected_connection_quiet" && !quietSupportsConnectionId ? "Quiet generation does not support connection_id in this Lumiverse build; using raw generation." : null,
    parametersUsed,
    reasoningOverrideUsed
  };
}

// src/shared/settings.ts
var SETTINGS_LIMITS = {
  recentMessageLimit: { min: 1, max: 200, default: 24 },
  maxMessageChars: { min: 500, max: 512e3, default: estimateCharsFromTokens(NORMAL_BUDGET_DEFAULTS.perMessageBudgetTokens) },
  generationTimeoutMs: { min: 1e4, max: 18e4, default: 45e3 },
  autoDebounceMs: { min: 250, max: 3e4, default: 1500 },
  skipFirstMessages: { min: 0, max: 100, default: 2 },
  postCompletionSettleMs: { min: 0, max: 1e4, default: 750 },
  stableContentCheckMs: { min: 0, max: 5e3, default: 400 },
  memoryRetainCount: { min: 0, max: 10, default: 3 },
  memoryFullSnapshotCount: { min: 0, max: 10, default: 3 },
  maxMemoryChars: { min: 1e3, max: 512e3, default: estimateCharsFromTokens(NORMAL_BUDGET_DEFAULTS.trackerMemoryBudgetTokens) },
  injectionRetainCount: { min: 0, max: 10, default: 3 },
  maxInjectedChars: { min: 1e3, max: 512e3, default: estimateCharsFromTokens(NORMAL_BUDGET_DEFAULTS.promptInjectionBudgetTokens) },
  maxRenderedChars: { min: 1e3, max: 2e6, default: NORMAL_BUDGET_DEFAULTS.renderedHtmlMaxChars },
  maxMessageDisplayRenderedChars: { min: 1e3, max: 2e6, default: NORMAL_BUDGET_DEFAULTS.renderedHtmlMaxChars },
  minimizedMaxHeightPx: { min: 0, max: 400, default: 0 },
  budgetTokens: { min: 256, max: 128e3 },
  trackerOutputTokens: { min: 256, max: 64e3 },
  renderedHtmlMaxChars: { min: 1e3, max: 2e6 },
  rawOutputMaxChars: { min: 1e3, max: 2e6 },
  presetImportMaxChars: { min: 1e4, max: 1e8 },
  maxExpandedWidthPx: { min: 320, max: 1800, default: 1100 },
  mobileHorizontalMarginPx: { min: 0, max: 32, default: 6 },
  expandedContentMaxHeightVh: { min: 30, max: 95, default: 80 },
  maxWorldLoreChars: { min: 0, max: 512e3, default: 12e3 },
  maxCharacterContextChars: { min: 0, max: 512e3, default: 12e3 },
  maxPersonaContextChars: { min: 0, max: 256e3, default: 6e3 },
  maxOwnerPowerScriptChars: { min: 0, max: 2e5, default: 5e4 },
  maxOwnerPowerRuntimeErrors: { min: 1, max: 50, default: 5 },
  ownerPowerCrashDisableThreshold: { min: 1, max: 20, default: 3 }
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
  autoTiming: {
    waitForAssistantFinalization: true,
    postCompletionSettleMs: SETTINGS_LIMITS.postCompletionSettleMs.default,
    stableContentCheckMs: SETTINGS_LIMITS.stableContentCheckMs.default,
    requireStableSwipeContent: true,
    cancelPendingOnSwipeChange: true
  },
  budget: {
    mode: "estimated_tokens",
    ultraModeEnabled: false,
    ...NORMAL_BUDGET_DEFAULTS
  },
  memory: {
    enabled: true,
    includeInTrackerGeneration: true,
    retainCount: SETTINGS_LIMITS.memoryRetainCount.default,
    fullSnapshotCount: SETTINGS_LIMITS.memoryFullSnapshotCount.default,
    compactOlderSnapshots: false,
    maxMemoryChars: SETTINGS_LIMITS.maxMemoryChars.default,
    source: "hybrid",
    excludeTargetMessage: true,
    order: "oldest_to_newest",
    requireSamePreset: false,
    requireSameSwipeWhenAvailable: false
  },
  injection: {
    enabled: false,
    retainCount: SETTINGS_LIMITS.injectionRetainCount.default,
    format: "embedded_tag",
    injectionPlacement: "append_to_last_assistant",
    includeOnlyIfMissingFromPrompt: true,
    stripOlderTrackerBlocks: true,
    maxInjectedChars: SETTINGS_LIMITS.maxInjectedChars.default,
    roleFallback: "system",
    includeHeader: true,
    header: "LTracker Recent State"
  },
  renderer: {
    enabled: true,
    previewSource: "latest_chat_snapshot",
    missingValuePlaceholder: "",
    maxRenderedChars: SETTINGS_LIMITS.maxRenderedChars.default,
    allowInlineStyles: true,
    templateTrustMode: "trusted"
  },
  messageDisplay: {
    enabled: true,
    useDomInjection: true,
    fallbackToIframeWidget: false,
    attachmentMode: "sidecar_snapshot",
    displayMode: "inline_full",
    displaySurface: "inline_wide",
    placement: "top",
    source: "message_attached_snapshot",
    renderMode: "html_template",
    allowInlineStyles: true,
    deduplicateRenderWarnings: true,
    showRenderWarningsInDiagnosticsOnly: true,
    showDebugSwipeKey: false,
    showGenerateButtonForMissingTracker: true,
    controlDensity: "compact",
    controlPlacement: "message_header",
    showExpandedHeaderActions: true,
    showBottomActionsInInlineTracker: false,
    collapsedByDefault: true,
    compactCollapsedHeader: true,
    showTimestamp: true,
    showPresetName: true,
    showDebugCopyButtonsInHistory: true,
    showWidgetRegenerateButton: true,
    showEditButton: true,
    showDeleteButton: true,
    showNoTrackerForSwipe: false,
    showGenerationDuration: true,
    minimizedMaxHeightPx: SETTINGS_LIMITS.minimizedMaxHeightPx.default,
    maxRenderedChars: SETTINGS_LIMITS.maxMessageDisplayRenderedChars.default
  },
  expandedWidth: {
    expandedWidthMode: "wide",
    maxExpandedWidthPx: SETTINGS_LIMITS.maxExpandedWidthPx.default,
    mobileHorizontalMarginPx: SETTINGS_LIMITS.mobileHorizontalMarginPx.default,
    expandedContentMaxHeightVh: SETTINGS_LIMITS.expandedContentMaxHeightVh.default,
    preferFullscreenOnMobile: true,
    fullscreenBreakpointPx: 640,
    popoverBackdrop: true,
    closeOnBackdropClick: true,
    closeOnEscape: true
  },
  connection: {
    mode: "selected_connection_raw",
    selectedConnectionId: null,
    selectedConnectionName: null,
    refreshConnectionsOnDrawerOpen: true,
    parameters: DEFAULT_TRACKER_CONNECTION_PARAMETERS,
    reasoning: {
      source: "inherit",
      apiReasoning: true,
      effort: "auto",
      thinkingDisplay: "auto"
    },
    testPrompt: TRACKER_CONNECTION_DEFAULT_TEST_PROMPT
  },
  contextFilters: {
    enabled: false,
    includeChatMessages: true,
    includeTrackerMemory: true,
    includeEmbeddedTrackerTags: true,
    includeWorldLoreContext: false,
    includeCharacterContext: false,
    includePersonaContext: false,
    excludeUserMessages: false,
    excludeAssistantMessages: false,
    excludeSystemLikeMessages: false,
    maxWorldLoreChars: SETTINGS_LIMITS.maxWorldLoreChars.default,
    maxCharacterContextChars: SETTINGS_LIMITS.maxCharacterContextChars.default,
    maxPersonaContextChars: SETTINGS_LIMITS.maxPersonaContextChars.default,
    excludedCharacterNames: [],
    excludedMessageNamePatterns: [],
    excludedLoreKeywords: [],
    loreAllowlistKeywords: [],
    requireExactCharacterNameMatch: true,
    caseSensitiveExclusions: false,
    showContextFilterDiagnostics: true,
    disableAutoForExcludedNames: true,
    disableAutoWhenSourceFiltered: true,
    includeOnlyMatchedLore: false,
    manualWorldLoreContext: "",
    manualCharacterContext: "",
    manualPersonaContext: ""
  },
  ownerPowerMode: {
    enabled: false,
    allowRenderLabRuntime: false,
    allowInstalledPresetRuntime: false,
    allowScriptBlocks: false,
    allowTemplateActionHooks: true,
    allowExternalUrls: false,
    allowNetwork: false,
    allowHostDomAccess: false,
    maxScriptChars: SETTINGS_LIMITS.maxOwnerPowerScriptChars.default,
    maxRuntimeErrors: SETTINGS_LIMITS.maxOwnerPowerRuntimeErrors.default,
    crashDisableThreshold: SETTINGS_LIMITS.ownerPowerCrashDisableThreshold.default,
    autoDisableOnCrash: true
  },
  history: {
    pageSize: 25,
    showDuplicates: false
  },
  storageMaintenance: {
    enabled: false,
    maxSnapshotsPerChat: 500,
    cleanupDuplicatesOnly: true
  }
};
function isRecord9(value) {
  return typeof value === "object" && value !== null;
}
function clampNumber(value, fallback, min, max) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() ? Number(value) : fallback;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}
function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}
function memorySource(value) {
  return value === "message_history" || value === "sidecar_index" || value === "embedded_tags" || value === "hybrid" ? value : DEFAULT_SETTINGS.memory.source;
}
function memoryOrder(value) {
  return value === "oldest_to_newest" || value === "newest_to_oldest" ? value : DEFAULT_SETTINGS.memory.order;
}
function budgetMode(value) {
  return value === "characters" || value === "estimated_tokens" ? value : DEFAULT_SETTINGS.budget.mode;
}
function templateTrustMode(value) {
  return value === "safe" || value === "trusted" || value === "dev" ? value : null;
}
function expandedWidthMode(value) {
  return value === "contained" || value === "wide" || value === "full_mobile" || value === "popover" ? value : DEFAULT_SETTINGS.expandedWidth.expandedWidthMode;
}
function displaySurface(value) {
  return value === "inline_contained" || value === "inline_wide" || value === "anchored_popover" || value === "fullscreen_reader" || value === "drawer_only" ? value : null;
}
function migrateDisplaySurface(displayMode, widthMode) {
  if (displayMode === "drawer_history_only") return "drawer_only";
  if (displayMode === "inline_button_popover") return "anchored_popover";
  if (displayMode === "inline_full") {
    if (widthMode === "contained") return "inline_contained";
    if (widthMode === "popover") return "anchored_popover";
    return "inline_wide";
  }
  return DEFAULT_SETTINGS.messageDisplay.displaySurface;
}
function displayModeForSurface(surface) {
  if (surface === "drawer_only") return "drawer_history_only";
  if (surface === "anchored_popover") return "inline_button_popover";
  return "inline_full";
}
function injectionFormat(value) {
  if (value === "compact") return "compact_text";
  return value === "embedded_tag" || value === "compact_text" || value === "pretty_json" || value === "minimal" ? value : DEFAULT_SETTINGS.injection.format;
}
function injectionPlacement(value) {
  return value === "append_to_last_assistant" || value === "system_before_last" || value === "system_after_history" ? value : DEFAULT_SETTINGS.injection.injectionPlacement;
}
function injectionRoleFallback(value) {
  return value === "system" || value === "assistant" ? value : DEFAULT_SETTINGS.injection.roleFallback;
}
function stringOrNull3(value) {
  return typeof value === "string" && value.trim() ? value : null;
}
function stringValue3(value, fallback = "", maxLength = 64e3) {
  if (typeof value !== "string") return fallback;
  return value.slice(0, maxLength);
}
function stringList(value, maxItems = 100) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n|,/) : [];
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of values) {
    if (typeof item !== "string") continue;
    const cleaned = item.trim().slice(0, 200);
    if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
    seen.add(cleaned.toLowerCase());
    result.push(cleaned);
    if (result.length >= maxItems) break;
  }
  return result;
}
function repairOwnerPowerMode(source) {
  const defaults = DEFAULT_SETTINGS.ownerPowerMode;
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : defaults.enabled,
    allowRenderLabRuntime: typeof source.allowRenderLabRuntime === "boolean" ? source.allowRenderLabRuntime : defaults.allowRenderLabRuntime,
    allowInstalledPresetRuntime: typeof source.allowInstalledPresetRuntime === "boolean" ? source.allowInstalledPresetRuntime : defaults.allowInstalledPresetRuntime,
    allowScriptBlocks: typeof source.allowScriptBlocks === "boolean" ? source.allowScriptBlocks : defaults.allowScriptBlocks,
    allowTemplateActionHooks: typeof source.allowTemplateActionHooks === "boolean" ? source.allowTemplateActionHooks : defaults.allowTemplateActionHooks,
    allowExternalUrls: typeof source.allowExternalUrls === "boolean" ? source.allowExternalUrls : defaults.allowExternalUrls,
    allowNetwork: typeof source.allowNetwork === "boolean" ? source.allowNetwork : defaults.allowNetwork,
    allowHostDomAccess: typeof source.allowHostDomAccess === "boolean" ? source.allowHostDomAccess : defaults.allowHostDomAccess,
    maxScriptChars: clampNumber(
      source.maxScriptChars,
      defaults.maxScriptChars,
      SETTINGS_LIMITS.maxOwnerPowerScriptChars.min,
      SETTINGS_LIMITS.maxOwnerPowerScriptChars.max
    ),
    maxRuntimeErrors: clampNumber(
      source.maxRuntimeErrors,
      defaults.maxRuntimeErrors,
      SETTINGS_LIMITS.maxOwnerPowerRuntimeErrors.min,
      SETTINGS_LIMITS.maxOwnerPowerRuntimeErrors.max
    ),
    crashDisableThreshold: clampNumber(
      source.crashDisableThreshold,
      defaults.crashDisableThreshold,
      SETTINGS_LIMITS.ownerPowerCrashDisableThreshold.min,
      SETTINGS_LIMITS.ownerPowerCrashDisableThreshold.max
    ),
    autoDisableOnCrash: typeof source.autoDisableOnCrash === "boolean" ? source.autoDisableOnCrash : defaults.autoDisableOnCrash
  };
}
function repairContextFilters(source) {
  const defaults = DEFAULT_SETTINGS.contextFilters;
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : defaults.enabled,
    includeChatMessages: typeof source.includeChatMessages === "boolean" ? source.includeChatMessages : defaults.includeChatMessages,
    includeTrackerMemory: typeof source.includeTrackerMemory === "boolean" ? source.includeTrackerMemory : defaults.includeTrackerMemory,
    includeEmbeddedTrackerTags: typeof source.includeEmbeddedTrackerTags === "boolean" ? source.includeEmbeddedTrackerTags : defaults.includeEmbeddedTrackerTags,
    includeWorldLoreContext: typeof source.includeWorldLoreContext === "boolean" ? source.includeWorldLoreContext : defaults.includeWorldLoreContext,
    includeCharacterContext: typeof source.includeCharacterContext === "boolean" ? source.includeCharacterContext : defaults.includeCharacterContext,
    includePersonaContext: typeof source.includePersonaContext === "boolean" ? source.includePersonaContext : defaults.includePersonaContext,
    excludeUserMessages: typeof source.excludeUserMessages === "boolean" ? source.excludeUserMessages : defaults.excludeUserMessages,
    excludeAssistantMessages: typeof source.excludeAssistantMessages === "boolean" ? source.excludeAssistantMessages : defaults.excludeAssistantMessages,
    excludeSystemLikeMessages: typeof source.excludeSystemLikeMessages === "boolean" ? source.excludeSystemLikeMessages : defaults.excludeSystemLikeMessages,
    maxWorldLoreChars: clampNumber(source.maxWorldLoreChars, defaults.maxWorldLoreChars, SETTINGS_LIMITS.maxWorldLoreChars.min, SETTINGS_LIMITS.maxWorldLoreChars.max),
    maxCharacterContextChars: clampNumber(source.maxCharacterContextChars, defaults.maxCharacterContextChars, SETTINGS_LIMITS.maxCharacterContextChars.min, SETTINGS_LIMITS.maxCharacterContextChars.max),
    maxPersonaContextChars: clampNumber(source.maxPersonaContextChars, defaults.maxPersonaContextChars, SETTINGS_LIMITS.maxPersonaContextChars.min, SETTINGS_LIMITS.maxPersonaContextChars.max),
    excludedCharacterNames: stringList(source.excludedCharacterNames),
    excludedMessageNamePatterns: stringList(source.excludedMessageNamePatterns),
    excludedLoreKeywords: stringList(source.excludedLoreKeywords),
    loreAllowlistKeywords: stringList(source.loreAllowlistKeywords),
    requireExactCharacterNameMatch: typeof source.requireExactCharacterNameMatch === "boolean" ? source.requireExactCharacterNameMatch : defaults.requireExactCharacterNameMatch,
    caseSensitiveExclusions: typeof source.caseSensitiveExclusions === "boolean" ? source.caseSensitiveExclusions : defaults.caseSensitiveExclusions,
    showContextFilterDiagnostics: typeof source.showContextFilterDiagnostics === "boolean" ? source.showContextFilterDiagnostics : defaults.showContextFilterDiagnostics,
    disableAutoForExcludedNames: typeof source.disableAutoForExcludedNames === "boolean" ? source.disableAutoForExcludedNames : defaults.disableAutoForExcludedNames,
    disableAutoWhenSourceFiltered: typeof source.disableAutoWhenSourceFiltered === "boolean" ? source.disableAutoWhenSourceFiltered : defaults.disableAutoWhenSourceFiltered,
    includeOnlyMatchedLore: typeof source.includeOnlyMatchedLore === "boolean" ? source.includeOnlyMatchedLore : defaults.includeOnlyMatchedLore,
    manualWorldLoreContext: stringValue3(source.manualWorldLoreContext, defaults.manualWorldLoreContext, SETTINGS_LIMITS.maxWorldLoreChars.max),
    manualCharacterContext: stringValue3(source.manualCharacterContext, defaults.manualCharacterContext, SETTINGS_LIMITS.maxCharacterContextChars.max),
    manualPersonaContext: stringValue3(source.manualPersonaContext, defaults.manualPersonaContext, SETTINGS_LIMITS.maxPersonaContextChars.max)
  };
}
function clampNullableNumber(source, key, fallback, min, max, integer = false) {
  if (!hasOwn(source, key)) return fallback;
  const value = source[key];
  if (value === null || value === void 0 || value === "") return null;
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() ? Number(value) : null;
  if (numeric === null || !Number.isFinite(numeric)) return null;
  const clamped = Math.min(max, Math.max(min, numeric));
  return integer ? Math.round(clamped) : clamped;
}
function clampTokenBudget(value, fallback, max = SETTINGS_LIMITS.budgetTokens.max) {
  return clampNumber(value, fallback, SETTINGS_LIMITS.budgetTokens.min, max);
}
function clampCharBudget(value, fallback, limit) {
  return clampNumber(value, fallback, limit.min, limit.max);
}
function connectionMode(value) {
  return value === "active_quiet" || value === "selected_connection_quiet" || value === "selected_connection_raw" ? value : DEFAULT_SETTINGS.connection.mode;
}
function reasoningSource(value) {
  return value === "inherit" || value === "off" || value === "custom" ? value : DEFAULT_SETTINGS.connection.reasoning.source;
}
function reasoningEffort(value) {
  return value === "auto" || value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "max" || value === "xhigh" ? value : DEFAULT_SETTINGS.connection.reasoning.effort;
}
function thinkingDisplay(value) {
  return value === "auto" || value === "summarized" || value === "omitted" ? value : DEFAULT_SETTINGS.connection.reasoning.thinkingDisplay;
}
function repairSettings(value) {
  const source = isRecord9(value) ? value : {};
  const autoSource = isRecord9(source.auto) ? source.auto : {};
  const historySource = isRecord9(source.history) ? source.history : {};
  const storageMaintenanceSource = isRecord9(source.storageMaintenance) ? source.storageMaintenance : {};
  const autoTimingSource = isRecord9(source.autoTiming) ? source.autoTiming : {};
  const budgetSource = isRecord9(source.budget) ? source.budget : {};
  const memorySourceObject = isRecord9(source.memory) ? source.memory : {};
  const injectionSource = isRecord9(source.injection) ? source.injection : {};
  const rendererSource = isRecord9(source.renderer) ? source.renderer : {};
  const messageDisplaySource = isRecord9(source.messageDisplay) ? source.messageDisplay : {};
  const expandedWidthSource = isRecord9(source.expandedWidth) ? source.expandedWidth : {};
  const connectionSource = isRecord9(source.connection) ? source.connection : {};
  const contextFiltersSource = isRecord9(source.contextFilters) ? source.contextFilters : {};
  const ownerPowerModeSource = isRecord9(source.ownerPowerMode) ? source.ownerPowerMode : {};
  const connectionParameterSource = isRecord9(connectionSource.parameters) ? connectionSource.parameters : {};
  const connectionReasoningSource = isRecord9(connectionSource.reasoning) ? connectionSource.reasoning : {};
  const previewSource = rendererSource.previewSource === "latest_message_snapshot" || rendererSource.previewSource === "latest_chat_snapshot" ? rendererSource.previewSource : DEFAULT_SETTINGS.renderer.previewSource;
  const messageDisplayPlacement = messageDisplaySource.placement === "bottom" || messageDisplaySource.placement === "top" ? messageDisplaySource.placement : DEFAULT_SETTINGS.messageDisplay.placement;
  const messageDisplaySourceSetting = messageDisplaySource.source === "latest_chat_snapshot" || messageDisplaySource.source === "message_attached_snapshot" ? messageDisplaySource.source : DEFAULT_SETTINGS.messageDisplay.source;
  const messageDisplayRenderMode = messageDisplaySource.renderMode === "compact_text" || messageDisplaySource.renderMode === "pretty_json" || messageDisplaySource.renderMode === "html_template" ? messageDisplaySource.renderMode : DEFAULT_SETTINGS.messageDisplay.renderMode;
  const messageDisplayAttachmentMode = messageDisplaySource.attachmentMode === "embedded_tracker_tag" || messageDisplaySource.attachmentMode === "both" || messageDisplaySource.attachmentMode === "sidecar_snapshot" ? messageDisplaySource.attachmentMode : DEFAULT_SETTINGS.messageDisplay.attachmentMode;
  const messageDisplaySurface = displaySurface(messageDisplaySource.displaySurface) ?? migrateDisplaySurface(messageDisplaySource.displayMode, expandedWidthSource.expandedWidthMode);
  const repairedMessageDisplayDisplayMode = displayModeForSurface(messageDisplaySurface);
  const messageDisplayControlDensity = messageDisplaySource.controlDensity === "comfortable" || messageDisplaySource.controlDensity === "compact" ? messageDisplaySource.controlDensity : DEFAULT_SETTINGS.messageDisplay.controlDensity;
  const messageDisplayControlPlacement = messageDisplaySource.controlPlacement === "inside_tracker_header" || messageDisplaySource.controlPlacement === "message_header" ? messageDisplaySource.controlPlacement : DEFAULT_SETTINGS.messageDisplay.controlPlacement;
  const repairedBudgetUltra = typeof budgetSource.ultraModeEnabled === "boolean" ? budgetSource.ultraModeEnabled : DEFAULT_SETTINGS.budget.ultraModeEnabled;
  const budgetDefaultSet = budgetDefaults(repairedBudgetUltra);
  const ultraDefaultValue = (key) => {
    const value2 = budgetSource[key];
    return repairedBudgetUltra && (value2 === void 0 || value2 === NORMAL_BUDGET_DEFAULTS[key]) ? budgetDefaultSet[key] : value2;
  };
  const explicitTrustMode = templateTrustMode(rendererSource.templateTrustMode);
  const migratedTrustMode = explicitTrustMode ?? (rendererSource.allowInlineStyles === false && messageDisplaySource.allowInlineStyles === false ? "safe" : "trusted");
  const trustAllowsInlineStyles = migratedTrustMode !== "safe";
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
    autoTiming: {
      waitForAssistantFinalization: typeof autoTimingSource.waitForAssistantFinalization === "boolean" ? autoTimingSource.waitForAssistantFinalization : DEFAULT_SETTINGS.autoTiming.waitForAssistantFinalization,
      postCompletionSettleMs: clampNumber(
        autoTimingSource.postCompletionSettleMs,
        SETTINGS_LIMITS.postCompletionSettleMs.default,
        SETTINGS_LIMITS.postCompletionSettleMs.min,
        SETTINGS_LIMITS.postCompletionSettleMs.max
      ),
      stableContentCheckMs: clampNumber(
        autoTimingSource.stableContentCheckMs,
        SETTINGS_LIMITS.stableContentCheckMs.default,
        SETTINGS_LIMITS.stableContentCheckMs.min,
        SETTINGS_LIMITS.stableContentCheckMs.max
      ),
      requireStableSwipeContent: typeof autoTimingSource.requireStableSwipeContent === "boolean" ? autoTimingSource.requireStableSwipeContent : DEFAULT_SETTINGS.autoTiming.requireStableSwipeContent,
      cancelPendingOnSwipeChange: typeof autoTimingSource.cancelPendingOnSwipeChange === "boolean" ? autoTimingSource.cancelPendingOnSwipeChange : DEFAULT_SETTINGS.autoTiming.cancelPendingOnSwipeChange
    },
    budget: {
      mode: budgetMode(budgetSource.mode),
      ultraModeEnabled: repairedBudgetUltra,
      recentMessageBudgetTokens: clampTokenBudget(
        ultraDefaultValue("recentMessageBudgetTokens"),
        budgetDefaultSet.recentMessageBudgetTokens
      ),
      perMessageBudgetTokens: clampTokenBudget(
        ultraDefaultValue("perMessageBudgetTokens"),
        budgetDefaultSet.perMessageBudgetTokens
      ),
      trackerMemoryBudgetTokens: clampTokenBudget(
        ultraDefaultValue("trackerMemoryBudgetTokens"),
        budgetDefaultSet.trackerMemoryBudgetTokens
      ),
      promptInjectionBudgetTokens: clampTokenBudget(
        ultraDefaultValue("promptInjectionBudgetTokens"),
        budgetDefaultSet.promptInjectionBudgetTokens
      ),
      maxTrackerOutputTokens: clampTokenBudget(
        ultraDefaultValue("maxTrackerOutputTokens") ?? connectionParameterSource.max_tokens,
        budgetDefaultSet.maxTrackerOutputTokens,
        SETTINGS_LIMITS.trackerOutputTokens.max
      ),
      promptPreviewBudgetTokens: clampTokenBudget(
        ultraDefaultValue("promptPreviewBudgetTokens"),
        budgetDefaultSet.promptPreviewBudgetTokens
      ),
      renderedHtmlMaxChars: clampCharBudget(
        ultraDefaultValue("renderedHtmlMaxChars") ?? rendererSource.maxRenderedChars ?? messageDisplaySource.maxRenderedChars,
        budgetDefaultSet.renderedHtmlMaxChars,
        SETTINGS_LIMITS.renderedHtmlMaxChars
      ),
      rawOutputMaxChars: clampCharBudget(
        ultraDefaultValue("rawOutputMaxChars"),
        budgetDefaultSet.rawOutputMaxChars,
        SETTINGS_LIMITS.rawOutputMaxChars
      ),
      presetImportMaxChars: clampCharBudget(
        ultraDefaultValue("presetImportMaxChars"),
        budgetDefaultSet.presetImportMaxChars,
        SETTINGS_LIMITS.presetImportMaxChars
      )
    },
    memory: {
      enabled: typeof memorySourceObject.enabled === "boolean" ? memorySourceObject.enabled : DEFAULT_SETTINGS.memory.enabled,
      includeInTrackerGeneration: typeof memorySourceObject.includeInTrackerGeneration === "boolean" ? memorySourceObject.includeInTrackerGeneration : DEFAULT_SETTINGS.memory.includeInTrackerGeneration,
      retainCount: clampNumber(
        memorySourceObject.retainCount,
        SETTINGS_LIMITS.memoryRetainCount.default,
        SETTINGS_LIMITS.memoryRetainCount.min,
        SETTINGS_LIMITS.memoryRetainCount.max
      ),
      fullSnapshotCount: clampNumber(
        memorySourceObject.fullSnapshotCount,
        SETTINGS_LIMITS.memoryFullSnapshotCount.default,
        SETTINGS_LIMITS.memoryFullSnapshotCount.min,
        SETTINGS_LIMITS.memoryFullSnapshotCount.max
      ),
      compactOlderSnapshots: typeof memorySourceObject.compactOlderSnapshots === "boolean" ? memorySourceObject.compactOlderSnapshots : DEFAULT_SETTINGS.memory.compactOlderSnapshots,
      maxMemoryChars: clampNumber(
        memorySourceObject.maxMemoryChars,
        SETTINGS_LIMITS.maxMemoryChars.default,
        SETTINGS_LIMITS.maxMemoryChars.min,
        SETTINGS_LIMITS.maxMemoryChars.max
      ),
      source: memorySource(memorySourceObject.source),
      excludeTargetMessage: typeof memorySourceObject.excludeTargetMessage === "boolean" ? memorySourceObject.excludeTargetMessage : DEFAULT_SETTINGS.memory.excludeTargetMessage,
      order: memoryOrder(memorySourceObject.order),
      requireSamePreset: typeof memorySourceObject.requireSamePreset === "boolean" ? memorySourceObject.requireSamePreset : DEFAULT_SETTINGS.memory.requireSamePreset,
      requireSameSwipeWhenAvailable: typeof memorySourceObject.requireSameSwipeWhenAvailable === "boolean" ? memorySourceObject.requireSameSwipeWhenAvailable : DEFAULT_SETTINGS.memory.requireSameSwipeWhenAvailable
    },
    injection: {
      enabled: typeof injectionSource.enabled === "boolean" ? injectionSource.enabled : DEFAULT_SETTINGS.injection.enabled,
      retainCount: clampNumber(
        injectionSource.retainCount,
        SETTINGS_LIMITS.injectionRetainCount.default,
        SETTINGS_LIMITS.injectionRetainCount.min,
        SETTINGS_LIMITS.injectionRetainCount.max
      ),
      format: injectionFormat(injectionSource.format),
      injectionPlacement: injectionPlacement(injectionSource.injectionPlacement),
      includeOnlyIfMissingFromPrompt: typeof injectionSource.includeOnlyIfMissingFromPrompt === "boolean" ? injectionSource.includeOnlyIfMissingFromPrompt : DEFAULT_SETTINGS.injection.includeOnlyIfMissingFromPrompt,
      stripOlderTrackerBlocks: typeof injectionSource.stripOlderTrackerBlocks === "boolean" ? injectionSource.stripOlderTrackerBlocks : DEFAULT_SETTINGS.injection.stripOlderTrackerBlocks,
      maxInjectedChars: clampNumber(
        injectionSource.maxInjectedChars,
        SETTINGS_LIMITS.maxInjectedChars.default,
        SETTINGS_LIMITS.maxInjectedChars.min,
        SETTINGS_LIMITS.maxInjectedChars.max
      ),
      roleFallback: injectionRoleFallback(injectionSource.roleFallback),
      includeHeader: typeof injectionSource.includeHeader === "boolean" ? injectionSource.includeHeader : DEFAULT_SETTINGS.injection.includeHeader,
      header: typeof injectionSource.header === "string" && injectionSource.header.trim() ? injectionSource.header.trim().slice(0, 120) : DEFAULT_SETTINGS.injection.header
    },
    renderer: {
      enabled: typeof rendererSource.enabled === "boolean" ? rendererSource.enabled : DEFAULT_SETTINGS.renderer.enabled,
      previewSource,
      missingValuePlaceholder: typeof rendererSource.missingValuePlaceholder === "string" ? rendererSource.missingValuePlaceholder : DEFAULT_SETTINGS.renderer.missingValuePlaceholder,
      maxRenderedChars: clampNumber(
        rendererSource.maxRenderedChars ?? budgetSource.renderedHtmlMaxChars,
        repairedBudgetUltra ? ULTRA_BUDGET_DEFAULTS.renderedHtmlMaxChars : SETTINGS_LIMITS.maxRenderedChars.default,
        SETTINGS_LIMITS.maxRenderedChars.min,
        SETTINGS_LIMITS.maxRenderedChars.max
      ),
      allowInlineStyles: trustAllowsInlineStyles,
      templateTrustMode: migratedTrustMode
    },
    messageDisplay: {
      enabled: typeof messageDisplaySource.enabled === "boolean" ? messageDisplaySource.enabled : DEFAULT_SETTINGS.messageDisplay.enabled,
      useDomInjection: typeof messageDisplaySource.useDomInjection === "boolean" ? messageDisplaySource.useDomInjection : DEFAULT_SETTINGS.messageDisplay.useDomInjection,
      fallbackToIframeWidget: typeof messageDisplaySource.fallbackToIframeWidget === "boolean" ? messageDisplaySource.fallbackToIframeWidget : DEFAULT_SETTINGS.messageDisplay.fallbackToIframeWidget,
      attachmentMode: messageDisplayAttachmentMode,
      displayMode: repairedMessageDisplayDisplayMode,
      displaySurface: messageDisplaySurface,
      placement: messageDisplayPlacement,
      source: messageDisplaySourceSetting,
      renderMode: messageDisplayRenderMode,
      allowInlineStyles: trustAllowsInlineStyles,
      deduplicateRenderWarnings: typeof messageDisplaySource.deduplicateRenderWarnings === "boolean" ? messageDisplaySource.deduplicateRenderWarnings : DEFAULT_SETTINGS.messageDisplay.deduplicateRenderWarnings,
      showRenderWarningsInDiagnosticsOnly: typeof messageDisplaySource.showRenderWarningsInDiagnosticsOnly === "boolean" ? messageDisplaySource.showRenderWarningsInDiagnosticsOnly : DEFAULT_SETTINGS.messageDisplay.showRenderWarningsInDiagnosticsOnly,
      showDebugSwipeKey: typeof messageDisplaySource.showDebugSwipeKey === "boolean" ? messageDisplaySource.showDebugSwipeKey : DEFAULT_SETTINGS.messageDisplay.showDebugSwipeKey,
      showGenerateButtonForMissingTracker: typeof messageDisplaySource.showGenerateButtonForMissingTracker === "boolean" ? messageDisplaySource.showGenerateButtonForMissingTracker : DEFAULT_SETTINGS.messageDisplay.showGenerateButtonForMissingTracker,
      controlDensity: messageDisplayControlDensity,
      controlPlacement: messageDisplayControlPlacement,
      showExpandedHeaderActions: typeof messageDisplaySource.showExpandedHeaderActions === "boolean" ? messageDisplaySource.showExpandedHeaderActions : DEFAULT_SETTINGS.messageDisplay.showExpandedHeaderActions,
      showBottomActionsInInlineTracker: typeof messageDisplaySource.showBottomActionsInInlineTracker === "boolean" ? messageDisplaySource.showBottomActionsInInlineTracker : DEFAULT_SETTINGS.messageDisplay.showBottomActionsInInlineTracker,
      collapsedByDefault: typeof messageDisplaySource.collapsedByDefault === "boolean" ? messageDisplaySource.collapsedByDefault : DEFAULT_SETTINGS.messageDisplay.collapsedByDefault,
      compactCollapsedHeader: typeof messageDisplaySource.compactCollapsedHeader === "boolean" ? messageDisplaySource.compactCollapsedHeader : DEFAULT_SETTINGS.messageDisplay.compactCollapsedHeader,
      showTimestamp: typeof messageDisplaySource.showTimestamp === "boolean" ? messageDisplaySource.showTimestamp : DEFAULT_SETTINGS.messageDisplay.showTimestamp,
      showPresetName: typeof messageDisplaySource.showPresetName === "boolean" ? messageDisplaySource.showPresetName : DEFAULT_SETTINGS.messageDisplay.showPresetName,
      showDebugCopyButtonsInHistory: typeof messageDisplaySource.showDebugCopyButtonsInHistory === "boolean" ? messageDisplaySource.showDebugCopyButtonsInHistory : typeof messageDisplaySource.showCopyButton === "boolean" ? messageDisplaySource.showCopyButton : DEFAULT_SETTINGS.messageDisplay.showDebugCopyButtonsInHistory,
      showWidgetRegenerateButton: typeof messageDisplaySource.showWidgetRegenerateButton === "boolean" ? messageDisplaySource.showWidgetRegenerateButton : DEFAULT_SETTINGS.messageDisplay.showWidgetRegenerateButton,
      showEditButton: typeof messageDisplaySource.showEditButton === "boolean" ? messageDisplaySource.showEditButton : DEFAULT_SETTINGS.messageDisplay.showEditButton,
      showDeleteButton: typeof messageDisplaySource.showDeleteButton === "boolean" ? messageDisplaySource.showDeleteButton : DEFAULT_SETTINGS.messageDisplay.showDeleteButton,
      showNoTrackerForSwipe: typeof messageDisplaySource.showNoTrackerForSwipe === "boolean" ? messageDisplaySource.showNoTrackerForSwipe : DEFAULT_SETTINGS.messageDisplay.showNoTrackerForSwipe,
      showGenerationDuration: true,
      minimizedMaxHeightPx: clampNumber(
        messageDisplaySource.minimizedMaxHeightPx,
        SETTINGS_LIMITS.minimizedMaxHeightPx.default,
        SETTINGS_LIMITS.minimizedMaxHeightPx.min,
        SETTINGS_LIMITS.minimizedMaxHeightPx.max
      ),
      maxRenderedChars: clampNumber(
        messageDisplaySource.maxRenderedChars ?? budgetSource.renderedHtmlMaxChars,
        repairedBudgetUltra ? ULTRA_BUDGET_DEFAULTS.renderedHtmlMaxChars : SETTINGS_LIMITS.maxMessageDisplayRenderedChars.default,
        SETTINGS_LIMITS.maxMessageDisplayRenderedChars.min,
        SETTINGS_LIMITS.maxMessageDisplayRenderedChars.max
      )
    },
    expandedWidth: {
      expandedWidthMode: expandedWidthMode(expandedWidthSource.expandedWidthMode),
      maxExpandedWidthPx: clampNumber(
        expandedWidthSource.maxExpandedWidthPx,
        SETTINGS_LIMITS.maxExpandedWidthPx.default,
        SETTINGS_LIMITS.maxExpandedWidthPx.min,
        SETTINGS_LIMITS.maxExpandedWidthPx.max
      ),
      mobileHorizontalMarginPx: clampNumber(
        expandedWidthSource.mobileHorizontalMarginPx,
        SETTINGS_LIMITS.mobileHorizontalMarginPx.default,
        SETTINGS_LIMITS.mobileHorizontalMarginPx.min,
        SETTINGS_LIMITS.mobileHorizontalMarginPx.max
      ),
      expandedContentMaxHeightVh: clampNumber(
        expandedWidthSource.expandedContentMaxHeightVh,
        SETTINGS_LIMITS.expandedContentMaxHeightVh.default,
        SETTINGS_LIMITS.expandedContentMaxHeightVh.min,
        SETTINGS_LIMITS.expandedContentMaxHeightVh.max
      ),
      preferFullscreenOnMobile: typeof expandedWidthSource.preferFullscreenOnMobile === "boolean" ? expandedWidthSource.preferFullscreenOnMobile : DEFAULT_SETTINGS.expandedWidth.preferFullscreenOnMobile,
      fullscreenBreakpointPx: clampNumber(
        expandedWidthSource.fullscreenBreakpointPx,
        DEFAULT_SETTINGS.expandedWidth.fullscreenBreakpointPx,
        320,
        1800
      ),
      popoverBackdrop: typeof expandedWidthSource.popoverBackdrop === "boolean" ? expandedWidthSource.popoverBackdrop : DEFAULT_SETTINGS.expandedWidth.popoverBackdrop,
      closeOnBackdropClick: typeof expandedWidthSource.closeOnBackdropClick === "boolean" ? expandedWidthSource.closeOnBackdropClick : DEFAULT_SETTINGS.expandedWidth.closeOnBackdropClick,
      closeOnEscape: typeof expandedWidthSource.closeOnEscape === "boolean" ? expandedWidthSource.closeOnEscape : DEFAULT_SETTINGS.expandedWidth.closeOnEscape
    },
    connection: {
      mode: connectionMode(connectionSource.mode),
      selectedConnectionId: stringOrNull3(connectionSource.selectedConnectionId),
      selectedConnectionName: stringOrNull3(connectionSource.selectedConnectionName),
      refreshConnectionsOnDrawerOpen: typeof connectionSource.refreshConnectionsOnDrawerOpen === "boolean" ? connectionSource.refreshConnectionsOnDrawerOpen : DEFAULT_SETTINGS.connection.refreshConnectionsOnDrawerOpen,
      parameters: {
        temperature: clampNullableNumber(
          connectionParameterSource,
          "temperature",
          TRACKER_CONNECTION_PARAMETER_LIMITS.temperature.default,
          TRACKER_CONNECTION_PARAMETER_LIMITS.temperature.min,
          TRACKER_CONNECTION_PARAMETER_LIMITS.temperature.max
        ),
        max_tokens: clampNullableNumber(
          connectionParameterSource,
          "max_tokens",
          TRACKER_CONNECTION_PARAMETER_LIMITS.max_tokens.default,
          TRACKER_CONNECTION_PARAMETER_LIMITS.max_tokens.min,
          TRACKER_CONNECTION_PARAMETER_LIMITS.max_tokens.max,
          true
        ),
        top_p: clampNullableNumber(
          connectionParameterSource,
          "top_p",
          null,
          TRACKER_CONNECTION_PARAMETER_LIMITS.top_p.min,
          TRACKER_CONNECTION_PARAMETER_LIMITS.top_p.max
        ),
        frequency_penalty: clampNullableNumber(
          connectionParameterSource,
          "frequency_penalty",
          null,
          TRACKER_CONNECTION_PARAMETER_LIMITS.frequency_penalty.min,
          TRACKER_CONNECTION_PARAMETER_LIMITS.frequency_penalty.max
        ),
        presence_penalty: clampNullableNumber(
          connectionParameterSource,
          "presence_penalty",
          null,
          TRACKER_CONNECTION_PARAMETER_LIMITS.presence_penalty.min,
          TRACKER_CONNECTION_PARAMETER_LIMITS.presence_penalty.max
        )
      },
      reasoning: {
        source: reasoningSource(connectionReasoningSource.source),
        apiReasoning: typeof connectionReasoningSource.apiReasoning === "boolean" ? connectionReasoningSource.apiReasoning : DEFAULT_SETTINGS.connection.reasoning.apiReasoning,
        effort: reasoningEffort(connectionReasoningSource.effort),
        thinkingDisplay: thinkingDisplay(connectionReasoningSource.thinkingDisplay)
      },
      testPrompt: typeof connectionSource.testPrompt === "string" && connectionSource.testPrompt.trim() ? connectionSource.testPrompt : TRACKER_CONNECTION_DEFAULT_TEST_PROMPT
    },
    contextFilters: repairContextFilters(contextFiltersSource),
    ownerPowerMode: repairOwnerPowerMode(ownerPowerModeSource),
    history: {
      pageSize: clampNumber(
        historySource.pageSize,
        25,
        10,
        200
      ),
      showDuplicates: typeof historySource.showDuplicates === "boolean" ? historySource.showDuplicates : DEFAULT_SETTINGS.history.showDuplicates
    },
    storageMaintenance: {
      enabled: typeof storageMaintenanceSource.enabled === "boolean" ? storageMaintenanceSource.enabled : DEFAULT_SETTINGS.storageMaintenance.enabled,
      maxSnapshotsPerChat: clampNumber(
        storageMaintenanceSource.maxSnapshotsPerChat,
        500,
        50,
        1e4
      ),
      cleanupDuplicatesOnly: typeof storageMaintenanceSource.cleanupDuplicatesOnly === "boolean" ? storageMaintenanceSource.cleanupDuplicatesOnly : DEFAULT_SETTINGS.storageMaintenance.cleanupDuplicatesOnly
    }
  };
}

// src/shared/promptInjection.ts
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function cloneMessages(messages) {
  return messages.map((message) => ({ ...message }));
}
function stringContent(message) {
  return typeof message.content === "string" ? message.content : null;
}
function countTrackerBlocks(messages) {
  return messages.reduce((count, message) => {
    const content = stringContent(message);
    return content ? count + findLTrackerTags(content).length : count;
  }, 0);
}
function trackerBlockRanges(messages) {
  const ranges = [];
  messages.forEach((message, messageIndex) => {
    const content = stringContent(message);
    if (!content) return;
    for (const tag of findLTrackerTags(content)) {
      ranges.push({ messageIndex, start: tag.start, end: tag.end });
    }
  });
  return ranges.sort((left, right) => {
    if (left.messageIndex !== right.messageIndex) return left.messageIndex - right.messageIndex;
    return left.start - right.start;
  });
}
function stripTrackerBlocks(messages, retainCount) {
  const ranges = trackerBlockRanges(messages);
  if (ranges.length === 0) return { messages, strippedCount: 0 };
  const keepCount = Math.max(0, retainCount);
  const removeCount = Math.max(0, ranges.length - keepCount);
  if (removeCount === 0) return { messages, strippedCount: 0 };
  const remove = ranges.slice(0, removeCount);
  const byMessage = /* @__PURE__ */ new Map();
  for (const range of remove) {
    const list = byMessage.get(range.messageIndex) ?? [];
    list.push(range);
    byMessage.set(range.messageIndex, list);
  }
  const next = cloneMessages(messages);
  for (const [messageIndex, messageRanges] of byMessage.entries()) {
    const current = next[messageIndex];
    if (!current) continue;
    const content = stringContent(current);
    if (content === null) continue;
    let output = "";
    let cursor = 0;
    for (const range of messageRanges.sort((left, right) => left.start - right.start)) {
      output += content.slice(cursor, range.start);
      cursor = range.end;
    }
    output += content.slice(cursor);
    next[messageIndex] = {
      ...current,
      content: output.replace(/\n{3,}/g, "\n\n").trimEnd()
    };
  }
  return { messages: next, strippedCount: removeCount };
}
function compactPayload(payload) {
  const scene = payload.scene && typeof payload.scene === "object" && !Array.isArray(payload.scene) ? payload.scene : {};
  const location = typeof scene.location === "string" ? scene.location : null;
  const time = typeof scene.time === "string" ? scene.time : typeof scene.date === "string" ? scene.date : null;
  const cast = Array.isArray(payload.characters_present) ? payload.characters_present.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const name = item.name;
      return typeof name === "string" ? name : null;
    }
    return null;
  }).filter((item) => Boolean(item)).slice(0, 6).join("; ") : null;
  const threads = Array.isArray(payload.active_threads) ? payload.active_threads.filter((item) => typeof item === "string").slice(0, 4).join("; ") : null;
  return [
    location ? `Location: ${location}` : null,
    time ? `Time: ${time}` : null,
    cast ? `Present: ${cast}` : null,
    threads ? `Threads: ${threads}` : null
  ].filter((item) => Boolean(item)).join("\n") || JSON.stringify(payload).slice(0, 500);
}
function minimalPayload(payload) {
  const compact = compactPayload(payload).replace(/\n/g, "; ");
  return compact || "Tracker state available.";
}
function formatEntry(entry, settings) {
  if (settings.format === "embedded_tag") {
    return `<${LTRACKER_TAG_NAME} type="${LTRACKER_TAG_TYPE}">
${JSON.stringify(entry.payload, null, 2)}
</${LTRACKER_TAG_NAME}>`;
  }
  if (settings.format === "pretty_json") {
    return JSON.stringify({
      messageId: entry.messageId,
      messageIndex: entry.messageIndex,
      swipeKey: entry.swipeKey,
      presetId: entry.presetId,
      createdAt: entry.createdAt,
      data: entry.payload
    }, null, 2);
  }
  if (settings.format === "minimal") return minimalPayload(entry.payload);
  return compactPayload(entry.payload);
}
function formatTrackerInjectionBlock(entries, settings) {
  const retained = entries.slice(-settings.retainCount);
  const body = retained.map((entry, index) => {
    const label = index === retained.length - 1 ? "Most recent" : `${retained.length - index} turns ago`;
    return `--- ${label} ---
${formatEntry(entry, settings)}`;
  }).join("\n\n");
  const header = settings.includeHeader ? `${settings.header || "LTracker Recent State"}
` : "";
  return truncateSafe(`${header}${body}`.trim(), settings.maxInjectedChars);
}
function insertSystemMessage(messages, content, placement, fallbackRole) {
  const role = fallbackRole;
  const injected = { role, content };
  const next = cloneMessages(messages);
  if (placement === "system_before_last" && next.length > 0) {
    const index = Math.max(0, next.length - 1);
    next.splice(index, 0, injected);
    return { messages: next, messageIndex: index };
  }
  if (placement === "system_after_history") {
    const lastHistoryIndex = next.reduce((last, message, index2) => message.__isChatHistory ? index2 : last, -1);
    const index = lastHistoryIndex >= 0 ? lastHistoryIndex + 1 : next.length;
    next.splice(index, 0, injected);
    return { messages: next, messageIndex: index };
  }
  next.push(injected);
  return { messages: next, messageIndex: next.length - 1 };
}
function appendToLastAssistant(messages, content, fallbackRole) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || typeof message.content !== "string") continue;
    const next = cloneMessages(messages);
    const existing = message.content.trimEnd();
    next[index] = {
      ...message,
      content: `${existing}${existing ? "\n\n" : ""}${content}`
    };
    return { messages: next, messageIndex: index };
  }
  return insertSystemMessage(messages, content, "system_after_history", fallbackRole);
}
function applyPromptInjectionUnsafe(input) {
  if (input.simulateError) throw new Error("Simulated interceptor failure.");
  const before = countTrackerBlocks(input.messages);
  if (!input.settings.enabled) {
    return {
      messages: input.messages,
      breakdown: [],
      injectedCount: 0,
      injectedChars: 0,
      strippedCount: 0,
      skippedReason: "Prompt injection is disabled.",
      error: null,
      promptTrackerCountBefore: before,
      promptTrackerCountAfter: before
    };
  }
  let working = cloneMessages(input.messages);
  let strippedCount = 0;
  if (input.settings.stripOlderTrackerBlocks) {
    const stripped = stripTrackerBlocks(working, input.settings.retainCount);
    working = stripped.messages;
    strippedCount = stripped.strippedCount;
  }
  const afterStripCount = countTrackerBlocks(working);
  if (input.settings.retainCount <= 0) {
    return {
      messages: working,
      breakdown: [],
      injectedCount: 0,
      injectedChars: 0,
      strippedCount,
      skippedReason: "Prompt injection retain count is 0.",
      error: null,
      promptTrackerCountBefore: before,
      promptTrackerCountAfter: afterStripCount
    };
  }
  if (input.settings.includeOnlyIfMissingFromPrompt && afterStripCount >= input.settings.retainCount) {
    return {
      messages: working,
      breakdown: [],
      injectedCount: 0,
      injectedChars: 0,
      strippedCount,
      skippedReason: "Prompt already contains retained tracker blocks.",
      error: null,
      promptTrackerCountBefore: before,
      promptTrackerCountAfter: afterStripCount
    };
  }
  const entries = input.entries.slice(-input.settings.retainCount);
  if (entries.length === 0) {
    return {
      messages: working,
      breakdown: [],
      injectedCount: 0,
      injectedChars: 0,
      strippedCount,
      skippedReason: "No tracker memory entries available for injection.",
      error: null,
      promptTrackerCountBefore: before,
      promptTrackerCountAfter: afterStripCount
    };
  }
  const block = formatTrackerInjectionBlock(entries, input.settings);
  const inserted = input.settings.injectionPlacement === "append_to_last_assistant" ? appendToLastAssistant(working, block, input.settings.roleFallback) : insertSystemMessage(working, block, input.settings.injectionPlacement, input.settings.roleFallback);
  const after = countTrackerBlocks(inserted.messages);
  return {
    messages: inserted.messages,
    breakdown: [{ messageIndex: inserted.messageIndex, name: input.settings.header || "LTracker Recent State" }],
    injectedCount: entries.length,
    injectedChars: Array.from(block).length,
    strippedCount,
    skippedReason: null,
    error: null,
    promptTrackerCountBefore: before,
    promptTrackerCountAfter: after
  };
}
function applyPromptInjection(input) {
  try {
    return applyPromptInjectionUnsafe(input);
  } catch (error) {
    const before = countTrackerBlocks(input.messages);
    return {
      messages: input.messages,
      breakdown: [],
      injectedCount: 0,
      injectedChars: 0,
      strippedCount: 0,
      skippedReason: "Prompt injection failed safely.",
      error: errorMessage(error),
      promptTrackerCountBefore: before,
      promptTrackerCountAfter: before
    };
  }
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
function legacyMessageSnapshotPath(chatId, messageId) {
  return `${messageSnapshotsPrefix(chatId)}${encodeStorageSegment(messageId)}/tracker-snapshot.json`;
}
function messageSnapshotPath(chatId, messageId, swipeKey = "default") {
  return `${messageSnapshotsPrefix(chatId)}${encodeStorageSegment(messageId)}/swipes/${encodeStorageSegment(swipeKey)}/tracker-snapshot.json`;
}
function messageSnapshotIndexPath(chatId) {
  return `chats/${encodeStorageSegment(chatId)}/message-snapshots/index.json`;
}
function diagnosticsPath(chatId) {
  return `chats/${encodeStorageSegment(chatId)}/diagnostics.json`;
}
function activePresetPath(chatId) {
  return `chats/${encodeStorageSegment(chatId)}/active-preset.json`;
}
function presetPath(presetId2) {
  return `presets/${encodeStorageSegment(presetId2)}.json`;
}
var PRESETS_INDEX_PATH = "presets/index.json";
var SETTINGS_PATH = "settings.json";

// src/shared/trackerPrompt.ts
var DEFAULT_MAX_MESSAGE_CHARS = 8e3;
function buildCompactTranscript(messages, maxMessageChars = DEFAULT_MAX_MESSAGE_CHARS, maxTranscriptChars = Number.POSITIVE_INFINITY) {
  const blocks = [];
  let remaining = Number.isFinite(maxTranscriptChars) ? Math.max(0, maxTranscriptChars) : Number.POSITIVE_INFINITY;
  for (const message of messages) {
    if (remaining <= 0) break;
    const role = message.role === "user" ? "USER" : "ASSISTANT";
    const name = message.name ? ` ${message.name}` : "";
    const limit = Math.min(maxMessageChars, remaining);
    const content = message.content.trim().slice(0, limit);
    const block = `[${message.index} ${role}${name}]
${content}`;
    blocks.push(block);
    remaining -= block.length + 2;
  }
  if (blocks.length < messages.length) {
    blocks.unshift(`[LTracker omitted ${messages.length - blocks.length} earlier message${messages.length - blocks.length === 1 ? "" : "s"} because the prompt budget was reached.]`);
  }
  return blocks.join("\n\n");
}
function buildTrackerPrompt(transcript, preset = DEFAULT_TRACKER_PRESET, memory = null, options = {}) {
  const hasMemory = Boolean(memory?.renderedText.trim());
  const contextBlocks = (options.contextBlocks ?? []).filter((block) => block.text.trim());
  const hasContextBlocks = contextBlocks.length > 0;
  const filterSummary = options.filterSummary?.trim() ?? "";
  return [
    {
      role: "system",
      content: [
        "You extract the current state of an ongoing roleplay or story chat.",
        "Return JSON only. Do not wrap the JSON in Markdown.",
        "Do not invent facts unsupported by the transcript.",
        "The current transcript has higher priority than any prior tracker memory.",
        "If prior tracker memory contradicts the current transcript, the current transcript wins.",
        hasContextBlocks ? "Additional context sections are background references only. The current transcript still wins if sources disagree." : null,
        hasMemory ? "Use the most recent prior tracker state as the baseline. Mutate only fields that the new transcript actually changes. Preserve stable identity anchors, names, ongoing threads, counters, and continuity fields unless the current transcript clearly updates them." : null,
        hasMemory ? "Do not resurrect characters who left the immediate scene unless the current transcript brings them back. Preserve arrays/items by stable id/name where possible." : null,
        "Preset prompt instructions are lower priority than these safety and integrity requirements.",
        "Preserve character names exactly when possible.",
        "Summarize only the current and relevant state, not every past event.",
        'Use empty strings, empty arrays, or "unknown" for unknown fields.'
      ].filter(Boolean).join("\n")
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
        hasMemory ? memory?.renderedText ?? "" : null,
        hasMemory ? "" : null,
        hasContextBlocks ? "Additional context sources:" : null,
        ...contextBlocks.flatMap((block) => [
          hasContextBlocks ? `[${block.title}]` : null,
          block.text.trim(),
          ""
        ]),
        filterSummary ? "Context filter summary:" : null,
        filterSummary || null,
        filterSummary ? "" : null,
        "Recent conversation:",
        transcript,
        "",
        "Return only a JSON object matching the selected schema shape.",
        "Never include Markdown, commentary, or HTML."
      ].filter((part) => typeof part === "string").join("\n")
    }
  ];
}

// src/shared/trackerMemory.ts
var EMPTY_MEMORY = {
  entries: [],
  renderedText: "",
  totalChars: 0,
  truncated: false,
  skippedReason: null
};
function isRecord10(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function primitiveToString3(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord10(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function hashPayload(payload) {
  const value = stableJson(payload);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function entrySort(left, right) {
  if (left.messageIndex !== null && right.messageIndex !== null && left.messageIndex !== right.messageIndex) {
    return left.messageIndex - right.messageIndex;
  }
  if (left.messageIndex !== null && right.messageIndex === null) return -1;
  if (left.messageIndex === null && right.messageIndex !== null) return 1;
  const created = left.createdAt.localeCompare(right.createdAt);
  if (created !== 0) return created;
  const leftMessage = left.messageId ?? "";
  const rightMessage = right.messageId ?? "";
  if (leftMessage !== rightMessage) return leftMessage.localeCompare(rightMessage);
  return (left.swipeKey ?? "").localeCompare(right.swipeKey ?? "");
}
function sourceAllowed(source, setting) {
  if (setting === "hybrid") return true;
  if (setting === "sidecar_index") return source === "sidecar_snapshot" || source === "latest_chat_snapshot";
  if (setting === "embedded_tags") return source === "embedded_tag";
  return source === "history_scan";
}
function shouldExcludeTarget(entry, options) {
  if (!options.targetMessageId) return false;
  if (entry.messageId !== options.targetMessageId) return false;
  if (!options.targetSwipeKey) return true;
  return (entry.swipeKey ?? "default") === options.targetSwipeKey;
}
function compactValue(value) {
  const primitive = primitiveToString3(value);
  if (primitive) return primitive;
  if (Array.isArray(value)) {
    const rendered = value.map((item) => {
      const itemPrimitive = primitiveToString3(item);
      if (itemPrimitive) return itemPrimitive;
      if (isRecord10(item)) {
        return primitiveToString3(item.name) ?? primitiveToString3(item.title) ?? primitiveToString3(item.id);
      }
      return null;
    }).filter((item) => Boolean(item));
    return rendered.length > 0 ? rendered.slice(0, 5).join("; ") : null;
  }
  if (isRecord10(value)) {
    for (const key of ["location", "time", "date", "mood", "status", "name", "title", "summary"]) {
      const rendered = primitiveToString3(value[key]);
      if (rendered) return rendered;
    }
  }
  return null;
}
function compactPayloadSummary(payload) {
  const scene = isRecord10(payload.scene) ? payload.scene : null;
  const sceneParts = [
    scene ? compactValue(scene.location) : null,
    scene ? compactValue(scene.time) ?? compactValue(scene.date) : null,
    scene ? compactValue(scene.mood) : null
  ].filter((item) => Boolean(item));
  const characters = compactValue(payload.characters_present ?? payload.characters ?? payload.present_characters);
  const threads = compactValue(payload.active_threads ?? payload.unresolved_continuity ?? payload.important_facts);
  const parts = [
    sceneParts.length > 0 ? `scene ${sceneParts.join(", ")}` : null,
    characters ? `present ${characters}` : null,
    threads ? `threads ${threads}` : null
  ].filter((item) => Boolean(item));
  return parts.length > 0 ? parts.join(" | ") : JSON.stringify(payload).slice(0, 240);
}
function entryText(entry, compact) {
  if (compact) return compactPayloadSummary(entry.payload);
  if (entry.text.trim()) return entry.text.trim();
  return JSON.stringify(entry.payload, null, 2);
}
function labelForEntry(index, total) {
  if (index === total - 1) return "Most recent";
  const turnsAgo = total - index;
  return `${turnsAgo} turns ago`;
}
function buildTrackerMemoryResult(rawEntries, settings, options = {}) {
  if (!settings.enabled) return { ...EMPTY_MEMORY, skippedReason: "Tracker memory is disabled." };
  if (settings.retainCount <= 0) return { ...EMPTY_MEMORY, skippedReason: "Tracker memory retain count is 0." };
  let candidates = rawEntries.filter((entry) => sourceAllowed(entry.source, settings.source)).filter((entry) => !settings.excludeTargetMessage || !shouldExcludeTarget(entry, options));
  if (settings.requireSamePreset && options.activePreset) {
    candidates = candidates.filter((entry) => entry.presetId === options.activePreset?.id);
  }
  if (settings.requireSameSwipeWhenAvailable && options.targetSwipeKey) {
    const sameSwipe = candidates.filter((entry) => (entry.swipeKey ?? "default") === options.targetSwipeKey);
    if (sameSwipe.length > 0) candidates = sameSwipe;
  }
  const deduped = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of candidates.sort(entrySort)) {
    const key = hashPayload(entry.payload);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  if (deduped.length === 0) return { ...EMPTY_MEMORY, skippedReason: "No prior tracker snapshots found." };
  const retained = deduped.slice(-settings.retainCount);
  const oldestToNewest = retained.sort(entrySort);
  const renderOrder = settings.order === "newest_to_oldest" ? [...oldestToNewest].reverse() : oldestToNewest;
  const fullCount = Math.min(settings.fullSnapshotCount, renderOrder.length);
  const fullStart = Math.max(0, renderOrder.length - fullCount);
  const renderedEntries = [];
  const blocks = [];
  let omittedOlder = 0;
  renderOrder.forEach((entry, index) => {
    const isFull = index >= fullStart;
    if (!isFull && !settings.compactOlderSnapshots) {
      omittedOlder += 1;
      return;
    }
    renderedEntries.push(entry);
    blocks.push(`--- ${labelForEntry(index, renderOrder.length)} ---
${entryText(entry, !isFull)}`);
  });
  if (blocks.length === 0) {
    return { ...EMPTY_MEMORY, skippedReason: "Tracker memory sunset omitted all retained entries." };
  }
  const warning = omittedOlder > 0 ? `
[${omittedOlder} older tracker snapshot${omittedOlder === 1 ? "" : "s"} omitted by sunset settings.]` : "";
  const rawText = `Previous tracker states:
${blocks.join("\n\n")}${warning}`;
  const renderedText = truncateSafe(rawText, settings.maxMemoryChars);
  return {
    entries: renderedEntries,
    renderedText,
    totalChars: Array.from(renderedText).length,
    truncated: renderedText !== rawText,
    skippedReason: null
  };
}
function trackerMemorySourceSummary(entries) {
  if (entries.length === 0) return null;
  const counts = /* @__PURE__ */ new Map();
  for (const entry of entries) counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  return [...counts.entries()].map(([source, count]) => `${source}:${count}`).join(", ");
}
function memoryOptionsFromTrigger(trigger, activePreset) {
  if (trigger.kind === "manual") {
    return { activePreset };
  }
  return {
    activePreset,
    targetMessageId: trigger.sourceMessageId,
    targetMessageIndex: trigger.sourceMessageIndex,
    targetSwipeKey: trigger.swipeKey
  };
}
function selectTrackerMemoryCandidates(index, settings, options = {}) {
  if (!settings.enabled || settings.retainCount <= 0) return [];
  let filtered = index.filter((entry) => {
    if (settings.excludeTargetMessage && options.targetMessageId) {
      if (entry.messageId === options.targetMessageId) {
        if (!options.targetSwipeKey || entry.swipeKey === options.targetSwipeKey) {
          return false;
        }
      }
    }
    if (settings.requireSamePreset && options.activePreset && entry.presetId) {
      if (entry.presetId !== options.activePreset.id) return false;
    }
    if (settings.requireSameSwipeWhenAvailable && options.targetSwipeKey && entry.swipeKey) {
      if (entry.swipeKey !== options.targetSwipeKey) return false;
    }
    return true;
  });
  const dedupedMap = /* @__PURE__ */ new Map();
  for (const entry of filtered) {
    const key = `${entry.messageId}:${entry.swipeKey}`;
    const existing = dedupedMap.get(key);
    if (!existing || entry.createdAt.localeCompare(existing.createdAt) > 0) {
      dedupedMap.set(key, entry);
    }
  }
  const deduped = Array.from(dedupedMap.values());
  const sortedNewestToOldest = deduped.sort((left, right) => {
    if (left.messageIndex !== null && right.messageIndex !== null && left.messageIndex !== right.messageIndex) {
      return right.messageIndex - left.messageIndex;
    }
    if (left.messageIndex !== null && right.messageIndex === null) return 1;
    if (left.messageIndex === null && right.messageIndex !== null) return -1;
    return right.createdAt.localeCompare(left.createdAt);
  });
  const targetRetain = Math.max(settings.retainCount, settings.fullSnapshotCount ?? 3, 1);
  const candidateWindowSize = Math.min(
    sortedNewestToOldest.length,
    Math.max(targetRetain * 6 + 10, targetRetain + 20)
  );
  const selectedCandidates = sortedNewestToOldest.slice(0, candidateWindowSize);
  return selectedCandidates.sort((left, right) => {
    if (left.messageIndex !== null && right.messageIndex !== null && left.messageIndex !== right.messageIndex) {
      return left.messageIndex - right.messageIndex;
    }
    if (left.messageIndex !== null && right.messageIndex === null) return -1;
    if (left.messageIndex === null && right.messageIndex !== null) return 1;
    return left.createdAt.localeCompare(right.createdAt);
  });
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
var pendingAutoFinalizations = /* @__PURE__ */ new Map();
var connectionProfilesByUser = /* @__PURE__ */ new Map();
var connectionTestJobs = /* @__PURE__ */ new Map();
var activeChatByUser = /* @__PURE__ */ new Map();
var usersByChat = /* @__PURE__ */ new Map();
var eventCleanups = [];
var autoSubscriptionsActive = false;
var contextHandlerRegistered = false;
var interceptorRegistered = false;
var internalTrackerGenerationDepth = 0;
var disposed = false;
function sweepStaleJobs(userId) {
  const now = Date.now();
  const maxAgeMs = 12e4;
  for (const [key, job] of activeJobs.entries()) {
    const started = Date.parse(job.startedAt);
    if (Number.isFinite(started) && now - started > maxAgeMs) {
      spindle.log.warn(`LTracker: Evicting stale job ${job.jobId} for chat ${job.chatId}`);
      job.cancelReason = "Evicted as a stale job.";
      job.controller.abort();
      activeJobs.delete(key);
      void (async () => {
        const diags = await loadDiagnostics(job.chatId, userId);
        await tryPersistDiagnostics({
          ...diags,
          staleJobsEvictedCount: (diags.staleJobsEvictedCount ?? 0) + 1,
          lastJobTimeoutAt: nowIso(),
          lastJobTimeoutJobId: job.jobId,
          lastJobTimeoutMessageId: job.sourceMessageId ?? null,
          lastJobTimeoutSwipeKey: job.swipeKey ?? null
        }, userId).catch(() => {
        });
      })();
    }
  }
}
var recentlyDeletedSnapshots = /* @__PURE__ */ new Map();
var UNDO_TIMEOUT_MS = 3e4;
function cleanRecentlyDeletedSnapshots() {
  const now = Date.now();
  for (const [key, val] of recentlyDeletedSnapshots.entries()) {
    if (now - val.deletedAt > UNDO_TIMEOUT_MS) {
      recentlyDeletedSnapshots.delete(key);
    }
  }
}
function isRecord11(value) {
  return typeof value === "object" && value !== null;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
function errorDetail(error) {
  if (error instanceof Error && error.stack) return error.stack;
  return void 0;
}
function stageError(stage, error) {
  if (error instanceof LTrackerStageError) throw error;
  throw new LTrackerStageError(stage, errorMessage2(error), errorDetail(error));
}
function diagnosticError(error, fallbackStage) {
  const stage = error instanceof LTrackerStageError ? error.stage : fallbackStage;
  const detail = error instanceof LTrackerStageError ? error.detail : errorDetail(error);
  const result = {
    stage,
    message: errorMessage2(error),
    createdAt: nowIso()
  };
  if (detail) result.detail = detail;
  return result;
}
function isFrontendMessage(payload) {
  if (!isRecord11(payload) || typeof payload.type !== "string") return false;
  if (![
    "ready",
    "refresh_state",
    "refresh_connections",
    "generate_tracker",
    "test_tracker_connection",
    "cancel_connection_test",
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
    "validate_preset",
    "render_template",
    "generate_message_tracker",
    "regenerate_message_tracker",
    "cancel_tracker_generation",
    "delete_message_tracker",
    "save_edited_message_tracker",
    "cleanup_duplicate_history",
    "embedded_tracker_tag_intercepted",
    "restore_deleted_tracker",
    "run_storage_maintenance_scan",
    "cleanup_missing_index_entries",
    "run_health_check",
    "repair_settings",
    "repair_snapshot_index",
    "repair_preset_render_locks",
    "clean_orphan_snapshots",
    "clean_broken_embedded_tags",
    "disable_owner_power",
    "reset_owner_power_settings",
    "clear_owner_power_crashes",
    "import_preset_pack",
    "export_preset_pack",
    "validate_preset_report",
    "generate_sample_snapshot"
  ].includes(payload.type)) return false;
  if ("chatId" in payload && payload.chatId !== null && typeof payload.chatId !== "string") return false;
  if ([
    "generate_tracker",
    "refresh_connections",
    "test_tracker_connection",
    "cancel_connection_test",
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
    "validate_preset",
    "render_template",
    "generate_message_tracker",
    "regenerate_message_tracker",
    "cancel_tracker_generation",
    "delete_message_tracker",
    "save_edited_message_tracker",
    "cleanup_duplicate_history",
    "embedded_tracker_tag_intercepted",
    "restore_deleted_tracker",
    "run_storage_maintenance_scan",
    "cleanup_missing_index_entries",
    "run_health_check",
    "repair_settings",
    "repair_snapshot_index",
    "repair_preset_render_locks",
    "clean_orphan_snapshots",
    "clean_broken_embedded_tags",
    "disable_owner_power",
    "reset_owner_power_settings",
    "clear_owner_power_crashes",
    "import_preset_pack",
    "export_preset_pack",
    "validate_preset_report",
    "generate_sample_snapshot"
  ].includes(payload.type) && typeof payload.requestId !== "string") return false;
  if (payload.type === "save_settings" && !isRecord11(payload.settings)) return false;
  if (payload.type === "test_tracker_connection" && "settings" in payload && payload.settings !== void 0 && !isRecord11(payload.settings)) return false;
  if (["save_preset_as_new", "duplicate_preset", "update_preset", "validate_preset", "validate_preset_report"].includes(payload.type) && !isRecord11(payload.preset)) return false;
  if (["select_preset", "update_preset", "delete_preset"].includes(payload.type) && typeof payload.presetId !== "string") return false;
  if (["import_preset", "import_preset_pack"].includes(payload.type) && typeof payload.importText !== "string") return false;
  if (payload.type === "regenerate_message_tracker" && (typeof payload.messageId !== "string" || "swipeKey" in payload && payload.swipeKey !== null && payload.swipeKey !== void 0 && typeof payload.swipeKey !== "string")) return false;
  if (payload.type === "generate_message_tracker" && (typeof payload.messageId !== "string" || "swipeKey" in payload && payload.swipeKey !== null && payload.swipeKey !== void 0 && typeof payload.swipeKey !== "string")) return false;
  if (payload.type === "cancel_tracker_generation" && ("jobId" in payload && payload.jobId !== null && payload.jobId !== void 0 && typeof payload.jobId !== "string")) return false;
  if (payload.type === "cancel_tracker_generation" && ("messageId" in payload && payload.messageId !== null && payload.messageId !== void 0 && typeof payload.messageId !== "string")) return false;
  if (payload.type === "cancel_tracker_generation" && ("swipeKey" in payload && payload.swipeKey !== null && payload.swipeKey !== void 0 && typeof payload.swipeKey !== "string")) return false;
  if (payload.type === "delete_message_tracker" && (typeof payload.messageId !== "string" || typeof payload.swipeKey !== "string")) return false;
  if (payload.type === "restore_deleted_tracker" && (typeof payload.messageId !== "string" || typeof payload.swipeKey !== "string")) return false;
  if (payload.type === "save_edited_message_tracker" && (typeof payload.messageId !== "string" || typeof payload.swipeKey !== "string" || typeof payload.jsonText !== "string")) return false;
  if (payload.type === "embedded_tracker_tag_intercepted" && ("messageId" in payload && payload.messageId !== null && typeof payload.messageId !== "string" || "swipeKey" in payload && payload.swipeKey !== null && typeof payload.swipeKey !== "string" || typeof payload.jsonText !== "string")) return false;
  if (payload.type === "render_template" && "source" in payload && payload.source !== void 0 && payload.source !== "latest_chat_snapshot" && payload.source !== "latest_message_snapshot") return false;
  return true;
}
function permissionState() {
  return {
    generation: spindle.permissions.has("generation"),
    chats: spindle.permissions.has("chats"),
    chatMutation: spindle.permissions.has("chat_mutation"),
    contextHandler: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED && spindle.permissions.has("context_handler"),
    interceptor: spindle.permissions.has("interceptor"),
    worldBooks: spindle.permissions.has("world_books"),
    characters: spindle.permissions.has("characters"),
    personas: spindle.permissions.has("personas")
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
    lastContextFilterMessageCount: 0,
    lastContextFilterIncludedCount: 0,
    lastContextFilterExcludedCount: 0,
    lastContextFilterExcludedNames: [],
    lastContextFilterReasons: [],
    lastContextFilterWarning: null,
    lastIncludedContextChars: 0,
    lastIncludedContextTokens: 0,
    lastContextIncludedSourceSummary: null,
    lastIncludedContextPreview: null,
    lastContextExclusionReport: null,
    worldLoreApiAvailable: Boolean(spindle.world_books?.getActivated),
    worldLorePermissionDeclared: spindle.permissions.has("world_books"),
    lastWorldLoreReadStatus: null,
    lastWorldLoreEntriesConsidered: 0,
    lastWorldLoreEntriesIncluded: 0,
    lastWorldLoreCharsIncluded: 0,
    lastWorldLoreSkippedReason: null,
    lastWorldLoreContextPreview: null,
    characterApiAvailable: Boolean(spindle.characters?.get),
    characterPermissionDeclared: spindle.permissions.has("characters"),
    lastCharacterContextReadStatus: null,
    lastCharacterContextCharsIncluded: 0,
    lastCharacterContextSkippedReason: null,
    personaApiAvailable: Boolean(spindle.personas?.getActive),
    personaPermissionDeclared: spindle.permissions.has("personas"),
    lastPersonaContextReadStatus: null,
    lastPersonaContextCharsIncluded: 0,
    lastPersonaContextSkippedReason: null,
    interceptorRegistered,
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
    contextHandlerRegistered,
    contextHandlerDisabledReason: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED ? null : CONTEXT_HANDLER_DISABLED_REASON,
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
    messageLocalUiSupported: MESSAGE_LOCAL_UI_SUPPORTED,
    messageLocalUiFallbackReason: MESSAGE_LOCAL_UI_FALLBACK_REASON,
    messageSnapshotIndexCount: 0,
    lastWidgetRegenerateMessageId: null,
    lastWidgetRegenerateStartedAt: null,
    lastWidgetRegenerateCompletedAt: null,
    lastWidgetRegenerateDurationMs: null,
    lastWidgetRegenerateCancelledAt: null,
    lastWidgetRegenerateError: null,
    activeWidgetRegenerationCount: 0,
    messageWidgetPlacementResolved: "host_default",
    messageWidgetPlacementReason: MESSAGE_WIDGET_PLACEMENT_REASON,
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
    selectedConnectionId: DEFAULT_SETTINGS.connection.selectedConnectionId,
    selectedConnectionName: DEFAULT_SETTINGS.connection.selectedConnectionName,
    selectedConnectionAvailable: false,
    connectionListCount: 0,
    connectionProfileSelected: false,
    effectiveTrackerConnectionMode: null,
    effectiveTrackerConnectionReason: null,
    lastSelectedConnectionFallbackReason: null,
    lastTrackerProfileMissingAt: null,
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
    lastDisplaySurface: null,
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
    ownerPowerModeEnabled: DEFAULT_SETTINGS.ownerPowerMode.enabled,
    renderLabRuntimeEnabled: DEFAULT_SETTINGS.ownerPowerMode.allowRenderLabRuntime,
    installedPresetRuntimeEnabled: DEFAULT_SETTINGS.ownerPowerMode.allowInstalledPresetRuntime,
    declarativeHooksEnabled: DEFAULT_SETTINGS.ownerPowerMode.allowTemplateActionHooks,
    activePresetRequestedOwnerPower: false,
    activePresetHasOwnerPowerScript: false,
    lastOwnerPowerRuntimeMode: "static",
    lastOwnerPowerMountedAt: null,
    lastOwnerPowerDestroyedAt: null,
    lastOwnerPowerError: null,
    lastOwnerPowerEvent: null,
    ownerPowerCrashCount: 0,
    ownerPowerDisabledReason: null,
    lastOwnerPowerSanitizerAction: null,
    lastOwnerPowerImportWarning: null,
    lastHealthCheckAt: null,
    lastHealthCheckStatus: null,
    lastMaintenanceActionAt: null,
    lastMaintenanceAction: null,
    lastMaintenanceReport: null
  };
}
function stringOrNull4(value) {
  return typeof value === "string" ? value : null;
}
function numberOrNull2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function nonNegativeInteger(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function maintenanceSeverityOrNull(value) {
  return value === "ok" || value === "warning" || value === "repairable" || value === "error" ? value : null;
}
function maintenanceReportOrNull(value) {
  if (!isRecord11(value)) return null;
  const counts = isRecord11(value.counts) ? value.counts : {};
  const items = Array.isArray(value.items) ? value.items.filter(isRecord11).map((item) => {
    const severity = maintenanceSeverityOrNull(item.severity);
    if (!severity || typeof item.category !== "string" || typeof item.message !== "string") return null;
    return {
      severity,
      category: item.category,
      message: item.message,
      suggestedFix: stringOrNull4(item.suggestedFix),
      repairActionId: stringOrNull4(item.repairActionId)
    };
  }).filter((item) => item !== null) : [];
  return {
    createdAt: typeof value.createdAt === "string" ? value.createdAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    chatId: stringOrNull4(value.chatId),
    status: maintenanceSeverityOrNull(value.status) ?? "ok",
    summary: typeof value.summary === "string" ? value.summary : "No maintenance report available.",
    items,
    counts: {
      ok: nonNegativeInteger(counts.ok) ?? 0,
      warning: nonNegativeInteger(counts.warning) ?? 0,
      repairable: nonNegativeInteger(counts.repairable) ?? 0,
      error: nonNegativeInteger(counts.error) ?? 0
    },
    duplicateIndexEntries: nonNegativeInteger(value.duplicateIndexEntries) ?? 0,
    missingSidecarIndexEntries: nonNegativeInteger(value.missingSidecarIndexEntries) ?? 0,
    orphanSidecarSnapshots: nonNegativeInteger(value.orphanSidecarSnapshots) ?? 0,
    snapshotsWithoutPresetLocks: nonNegativeInteger(value.snapshotsWithoutPresetLocks) ?? 0,
    snapshotsWithIncompletePresetLocks: nonNegativeInteger(value.snapshotsWithIncompletePresetLocks) ?? 0,
    snapshotsWithUnavailableOriginalPreset: nonNegativeInteger(value.snapshotsWithUnavailableOriginalPreset) ?? 0,
    brokenEmbeddedTags: nonNegativeInteger(value.brokenEmbeddedTags) ?? 0,
    malformedEmbeddedTags: nonNegativeInteger(value.malformedEmbeddedTags) ?? 0,
    repairedCount: nonNegativeInteger(value.repairedCount) ?? 0,
    deletedCount: nonNegativeInteger(value.deletedCount) ?? 0,
    limitationNotes: stringArray(value.limitationNotes)
  };
}
function recordOrNull(value) {
  return isRecord11(value) && !Array.isArray(value) ? value : null;
}
function sourceKindOrNull(value) {
  return value === "manual" || value === "auto" || value === "widget" ? value : null;
}
function autoEventTypeOrNull(value) {
  return value === "GENERATION_ENDED" || value === "MESSAGE_SENT" ? value : null;
}
function injectionModeOrNull(value) {
  return value === "latest_chat_snapshot" || value === "latest_message_snapshot" ? value : null;
}
function injectionFormatOrNull(value) {
  return value === "embedded_tag" || value === "compact_text" || value === "pretty_json" || value === "minimal" ? value : null;
}
function renderSourceOrNull(value) {
  return value === "latest_chat_snapshot" || value === "latest_message_snapshot" ? value : null;
}
function renderStatusOrNull(value) {
  return value === "rendered" || value === "fallback" || value === "no_template" || value === "no_snapshot" || value === "error" ? value : null;
}
function renderPresetSourceOrNull(value) {
  return value === "snapshot_render_lock" || value === "installed_preset_id" || value === "installed_preset_name_version" || value === "active_preset_legacy_fallback" || value === "json_fallback_original_preset_missing" ? value : null;
}
function messageDisplayModeOrNull(value) {
  return value === "dom_injection" || value === "message_widget" || value === "drawer_history" || value === "disabled" ? value : null;
}
function messageDisplayPlacementOrNull(value) {
  return value === "top" || value === "bottom" ? value : null;
}
function displaySurfaceOrNull(value) {
  return value === "inline_contained" || value === "inline_wide" || value === "anchored_popover" || value === "fullscreen_reader" || value === "drawer_only" ? value : null;
}
function displaySurfaceKindOrNull(value) {
  return value === "inline" || value === "overlay" || value === "drawer_only" ? value : null;
}
function messageWidgetPlacementResolved(value) {
  return value === "top" || value === "bottom" || value === "host_default" || value === "unsupported" ? value : MESSAGE_LOCAL_UI_SUPPORTED ? "host_default" : "unsupported";
}
function messageDisplayRenderer(value) {
  return value === "dom_injection" || value === "iframe_widget" || value === "drawer_history" ? value : "drawer_history";
}
function mountPointStrategy(value) {
  return value === "official_message_body" || value === "official_message_element" || value === "bubble_adapter" || value === "wide_message_row" || value === "wide_message_element" || value === "wide_bubble_fallback" || value === "widget_fallback" || value === "drawer_only" ? value : null;
}
function inlineActionOrNull(value) {
  return value === "generate" || value === "regenerate" || value === "cancel" || value === "edit" || value === "delete" || value === "toggle" ? value : null;
}
function connectionTestStatus(value) {
  return value === "idle" || value === "running" || value === "success" || value === "error" || value === "cancelled" ? value : "idle";
}
function activeTrackerJobsOrEmpty(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => {
    return isRecord11(item) && typeof item.jobId === "string" && typeof item.messageId === "string" && typeof item.swipeKey === "string" && typeof item.startedAt === "string";
  });
}
function errorOrNull(value) {
  if (!isRecord11(value) || typeof value.stage !== "string" || typeof value.message !== "string") return null;
  const error = {
    stage: value.stage,
    message: value.message,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso()
  };
  if (typeof value.detail === "string") error.detail = value.detail;
  return error;
}
function cancellationOrNull(value) {
  if (!isRecord11(value) || typeof value.jobId !== "string" || typeof value.requestId !== "string" || typeof value.reason !== "string") return null;
  return {
    jobId: value.jobId,
    requestId: value.requestId,
    reason: value.reason,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso()
  };
}
function repairDiagnostics(value, chatId) {
  const base = defaultDiagnostics(chatId);
  if (!isRecord11(value)) return base;
  return {
    ...base,
    status: value.status === "generating" || value.status === "error" ? value.status : "idle",
    lastJobId: stringOrNull4(value.lastJobId),
    lastRequestId: stringOrNull4(value.lastRequestId),
    lastGenerationSource: sourceKindOrNull(value.lastGenerationSource),
    lastGenerationStartedAt: stringOrNull4(value.lastGenerationStartedAt),
    lastGenerationCompletedAt: stringOrNull4(value.lastGenerationCompletedAt),
    lastGenerationDurationMs: numberOrNull2(value.lastGenerationDurationMs),
    lastMessagesRead: typeof value.lastMessagesRead === "number" && Number.isFinite(value.lastMessagesRead) ? Math.max(0, Math.round(value.lastMessagesRead)) : 0,
    lastSourceMessageIds: stringArray(value.lastSourceMessageIds),
    lastSourceMessageRange: stringOrNull4(value.lastSourceMessageRange),
    lastRawOutput: stringOrNull4(value.lastRawOutput),
    lastParsedTracker: recordOrNull(value.lastParsedTracker),
    lastPromptPreview: stringOrNull4(value.lastPromptPreview),
    lastError: errorOrNull(value.lastError),
    lastCancellation: cancellationOrNull(value.lastCancellation),
    autoSubscriptionActive: autoSubscriptionsActive,
    lastAutoEventAt: stringOrNull4(value.lastAutoEventAt),
    lastAutoEventType: autoEventTypeOrNull(value.lastAutoEventType),
    lastAutoSkippedReason: stringOrNull4(value.lastAutoSkippedReason),
    lastAutoScheduledAt: stringOrNull4(value.lastAutoScheduledAt),
    lastAutoTriggeredAt: stringOrNull4(value.lastAutoTriggeredAt),
    lastAutoSourceMessageId: stringOrNull4(value.lastAutoSourceMessageId),
    lastAutoSourceMessageIndex: nonNegativeInteger(value.lastAutoSourceMessageIndex),
    lastAutoGenerationId: stringOrNull4(value.lastAutoGenerationId),
    lastAutoFinalizationState: stringOrNull4(value.lastAutoFinalizationState),
    lastAutoWaitingMessageId: stringOrNull4(value.lastAutoWaitingMessageId),
    lastAutoWaitingSwipeKey: stringOrNull4(value.lastAutoWaitingSwipeKey),
    lastAutoFinalizedAt: stringOrNull4(value.lastAutoFinalizedAt),
    lastAutoStableCheckAt: stringOrNull4(value.lastAutoStableCheckAt),
    lastAutoStableCheckPassed: typeof value.lastAutoStableCheckPassed === "boolean" ? value.lastAutoStableCheckPassed : null,
    lastAutoContentStableHash: stringOrNull4(value.lastAutoContentStableHash),
    lastAutoFinalizationSkippedReason: stringOrNull4(value.lastAutoFinalizationSkippedReason),
    pendingAutoFinalizationCount: typeof value.pendingAutoFinalizationCount === "number" && Number.isFinite(value.pendingAutoFinalizationCount) ? Math.max(0, Math.round(value.pendingAutoFinalizationCount)) : 0,
    lastSwipeChangeCancelledPendingJob: typeof value.lastSwipeChangeCancelledPendingJob === "boolean" ? value.lastSwipeChangeCancelledPendingJob : false,
    latestAttachedMessageId: stringOrNull4(value.latestAttachedMessageId),
    latestAttachedMessageIndex: nonNegativeInteger(value.latestAttachedMessageIndex),
    latestAttachedSnapshotAt: stringOrNull4(value.latestAttachedSnapshotAt),
    latestAttachedSnapshotStorageKey: stringOrNull4(value.latestAttachedSnapshotStorageKey),
    injectionEnabled: typeof value.injectionEnabled === "boolean" ? value.injectionEnabled : false,
    lastInjectionAt: stringOrNull4(value.lastInjectionAt),
    lastInjectionMode: injectionModeOrNull(value.lastInjectionMode),
    lastInjectionFormat: injectionFormatOrNull(value.lastInjectionFormat),
    lastInjectedChars: typeof value.lastInjectedChars === "number" && Number.isFinite(value.lastInjectedChars) ? Math.max(0, Math.round(value.lastInjectedChars)) : 0,
    lastInjectionSkippedReason: stringOrNull4(value.lastInjectionSkippedReason),
    lastInjectionSnapshotCreatedAt: stringOrNull4(value.lastInjectionSnapshotCreatedAt),
    lastInjectionSourceMessageId: stringOrNull4(value.lastInjectionSourceMessageId),
    lastMemoryEntryCount: typeof value.lastMemoryEntryCount === "number" && Number.isFinite(value.lastMemoryEntryCount) ? Math.max(0, Math.round(value.lastMemoryEntryCount)) : 0,
    lastMemoryChars: typeof value.lastMemoryChars === "number" && Number.isFinite(value.lastMemoryChars) ? Math.max(0, Math.round(value.lastMemoryChars)) : 0,
    lastMemoryTruncated: typeof value.lastMemoryTruncated === "boolean" ? value.lastMemoryTruncated : false,
    lastMemorySourceSummary: stringOrNull4(value.lastMemorySourceSummary),
    lastMemorySkippedReason: stringOrNull4(value.lastMemorySkippedReason),
    lastPromptIncludedMemory: typeof value.lastPromptIncludedMemory === "boolean" ? value.lastPromptIncludedMemory : false,
    lastContextFilterMessageCount: typeof value.lastContextFilterMessageCount === "number" && Number.isFinite(value.lastContextFilterMessageCount) ? Math.max(0, Math.round(value.lastContextFilterMessageCount)) : 0,
    lastContextFilterIncludedCount: typeof value.lastContextFilterIncludedCount === "number" && Number.isFinite(value.lastContextFilterIncludedCount) ? Math.max(0, Math.round(value.lastContextFilterIncludedCount)) : 0,
    lastContextFilterExcludedCount: typeof value.lastContextFilterExcludedCount === "number" && Number.isFinite(value.lastContextFilterExcludedCount) ? Math.max(0, Math.round(value.lastContextFilterExcludedCount)) : 0,
    lastContextFilterExcludedNames: stringArray(value.lastContextFilterExcludedNames),
    lastContextFilterReasons: stringArray(value.lastContextFilterReasons),
    lastContextFilterWarning: stringOrNull4(value.lastContextFilterWarning),
    lastIncludedContextChars: typeof value.lastIncludedContextChars === "number" && Number.isFinite(value.lastIncludedContextChars) ? Math.max(0, Math.round(value.lastIncludedContextChars)) : 0,
    lastIncludedContextTokens: typeof value.lastIncludedContextTokens === "number" && Number.isFinite(value.lastIncludedContextTokens) ? Math.max(0, Math.round(value.lastIncludedContextTokens)) : 0,
    lastContextIncludedSourceSummary: stringOrNull4(value.lastContextIncludedSourceSummary),
    lastIncludedContextPreview: stringOrNull4(value.lastIncludedContextPreview),
    lastContextExclusionReport: stringOrNull4(value.lastContextExclusionReport),
    worldLoreApiAvailable: Boolean(spindle.world_books?.getActivated),
    worldLorePermissionDeclared: spindle.permissions.has("world_books"),
    lastWorldLoreReadStatus: stringOrNull4(value.lastWorldLoreReadStatus),
    lastWorldLoreEntriesConsidered: typeof value.lastWorldLoreEntriesConsidered === "number" && Number.isFinite(value.lastWorldLoreEntriesConsidered) ? Math.max(0, Math.round(value.lastWorldLoreEntriesConsidered)) : 0,
    lastWorldLoreEntriesIncluded: typeof value.lastWorldLoreEntriesIncluded === "number" && Number.isFinite(value.lastWorldLoreEntriesIncluded) ? Math.max(0, Math.round(value.lastWorldLoreEntriesIncluded)) : 0,
    lastWorldLoreCharsIncluded: typeof value.lastWorldLoreCharsIncluded === "number" && Number.isFinite(value.lastWorldLoreCharsIncluded) ? Math.max(0, Math.round(value.lastWorldLoreCharsIncluded)) : 0,
    lastWorldLoreSkippedReason: stringOrNull4(value.lastWorldLoreSkippedReason),
    lastWorldLoreContextPreview: stringOrNull4(value.lastWorldLoreContextPreview),
    characterApiAvailable: Boolean(spindle.characters?.get),
    characterPermissionDeclared: spindle.permissions.has("characters"),
    lastCharacterContextReadStatus: stringOrNull4(value.lastCharacterContextReadStatus),
    lastCharacterContextCharsIncluded: typeof value.lastCharacterContextCharsIncluded === "number" && Number.isFinite(value.lastCharacterContextCharsIncluded) ? Math.max(0, Math.round(value.lastCharacterContextCharsIncluded)) : 0,
    lastCharacterContextSkippedReason: stringOrNull4(value.lastCharacterContextSkippedReason),
    personaApiAvailable: Boolean(spindle.personas?.getActive),
    personaPermissionDeclared: spindle.permissions.has("personas"),
    lastPersonaContextReadStatus: stringOrNull4(value.lastPersonaContextReadStatus),
    lastPersonaContextCharsIncluded: typeof value.lastPersonaContextCharsIncluded === "number" && Number.isFinite(value.lastPersonaContextCharsIncluded) ? Math.max(0, Math.round(value.lastPersonaContextCharsIncluded)) : 0,
    lastPersonaContextSkippedReason: stringOrNull4(value.lastPersonaContextSkippedReason),
    interceptorRegistered,
    lastInterceptorAt: stringOrNull4(value.lastInterceptorAt),
    lastInterceptorInjectedCount: typeof value.lastInterceptorInjectedCount === "number" && Number.isFinite(value.lastInterceptorInjectedCount) ? Math.max(0, Math.round(value.lastInterceptorInjectedCount)) : 0,
    lastInterceptorInjectedChars: typeof value.lastInterceptorInjectedChars === "number" && Number.isFinite(value.lastInterceptorInjectedChars) ? Math.max(0, Math.round(value.lastInterceptorInjectedChars)) : 0,
    lastInterceptorStrippedCount: typeof value.lastInterceptorStrippedCount === "number" && Number.isFinite(value.lastInterceptorStrippedCount) ? Math.max(0, Math.round(value.lastInterceptorStrippedCount)) : 0,
    lastInterceptorSkippedReason: stringOrNull4(value.lastInterceptorSkippedReason),
    lastInterceptorError: stringOrNull4(value.lastInterceptorError),
    lastInterceptorPromptTrackerCountBefore: typeof value.lastInterceptorPromptTrackerCountBefore === "number" && Number.isFinite(value.lastInterceptorPromptTrackerCountBefore) ? Math.max(0, Math.round(value.lastInterceptorPromptTrackerCountBefore)) : 0,
    lastInterceptorPromptTrackerCountAfter: typeof value.lastInterceptorPromptTrackerCountAfter === "number" && Number.isFinite(value.lastInterceptorPromptTrackerCountAfter) ? Math.max(0, Math.round(value.lastInterceptorPromptTrackerCountAfter)) : 0,
    selectedPresetId: stringOrNull4(value.selectedPresetId),
    selectedPresetName: stringOrNull4(value.selectedPresetName),
    lastPresetFallbackReason: stringOrNull4(value.lastPresetFallbackReason),
    lastPresetValidationError: stringOrNull4(value.lastPresetValidationError),
    lastPromptUsedPresetId: stringOrNull4(value.lastPromptUsedPresetId),
    lastPromptUsedPresetName: stringOrNull4(value.lastPromptUsedPresetName),
    lastRenderAt: stringOrNull4(value.lastRenderAt),
    lastRenderPresetId: stringOrNull4(value.lastRenderPresetId),
    lastRenderPresetName: stringOrNull4(value.lastRenderPresetName),
    lastRenderPresetSource: renderPresetSourceOrNull(value.lastRenderPresetSource),
    lastRenderLockedPresetId: stringOrNull4(value.lastRenderLockedPresetId),
    lastRenderLockedPresetName: stringOrNull4(value.lastRenderLockedPresetName),
    lastRenderLockedPresetVersion: stringOrNull4(value.lastRenderLockedPresetVersion),
    lastRenderPresetMismatchDetected: typeof value.lastRenderPresetMismatchDetected === "boolean" ? value.lastRenderPresetMismatchDetected : null,
    lastRenderPresetFallbackReason: stringOrNull4(value.lastRenderPresetFallbackReason),
    lastRenderSnapshotCreatedAt: stringOrNull4(value.lastRenderSnapshotCreatedAt),
    lastRenderSource: renderSourceOrNull(value.lastRenderSource),
    lastRenderStatus: renderStatusOrNull(value.lastRenderStatus),
    lastRenderWarnings: stringArray(value.lastRenderWarnings),
    lastRenderErrors: stringArray(value.lastRenderErrors),
    lastSanitizedHtmlChars: typeof value.lastSanitizedHtmlChars === "number" && Number.isFinite(value.lastSanitizedHtmlChars) ? Math.max(0, Math.round(value.lastSanitizedHtmlChars)) : 0,
    lastFallbackTextChars: typeof value.lastFallbackTextChars === "number" && Number.isFinite(value.lastFallbackTextChars) ? Math.max(0, Math.round(value.lastFallbackTextChars)) : 0,
    contextHandlerRegistered,
    contextHandlerDisabledReason: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED ? stringOrNull4(value.contextHandlerDisabledReason) : CONTEXT_HANDLER_DISABLED_REASON,
    lastContextHandlerError: stringOrNull4(value.lastContextHandlerError),
    messageDisplayEnabled: typeof value.messageDisplayEnabled === "boolean" ? value.messageDisplayEnabled : base.messageDisplayEnabled,
    messageDisplayMode: messageDisplayModeOrNull(value.messageDisplayMode),
    messageDisplayPlacement: messageDisplayPlacementOrNull(value.messageDisplayPlacement),
    messageDisplayHydratedCount: typeof value.messageDisplayHydratedCount === "number" && Number.isFinite(value.messageDisplayHydratedCount) ? Math.max(0, Math.round(value.messageDisplayHydratedCount)) : 0,
    lastMessageDisplayHydratedAt: stringOrNull4(value.lastMessageDisplayHydratedAt),
    lastMessageDisplayError: stringOrNull4(value.lastMessageDisplayError),
    selectedDisplaySurface: displaySurfaceOrNull(value.selectedDisplaySurface) ?? DEFAULT_SETTINGS.messageDisplay.displaySurface,
    resolvedDisplaySurface: displaySurfaceOrNull(value.resolvedDisplaySurface) ?? DEFAULT_SETTINGS.messageDisplay.displaySurface,
    displaySurfaceKind: displaySurfaceKindOrNull(value.displaySurfaceKind) ?? "inline",
    displaySurfaceMountStrategy: mountPointStrategy(value.displaySurfaceMountStrategy),
    displaySurfaceParentWidthConstrained: typeof value.displaySurfaceParentWidthConstrained === "boolean" ? value.displaySurfaceParentWidthConstrained : null,
    displaySurfaceFallbackReason: stringOrNull4(value.displaySurfaceFallbackReason),
    lastDisplaySurfaceRehydratedAt: stringOrNull4(value.lastDisplaySurfaceRehydratedAt),
    lastDisplayPreviewAction: stringOrNull4(value.lastDisplayPreviewAction),
    lastDisplayPreviewResult: stringOrNull4(value.lastDisplayPreviewResult),
    lastDisplayPreviewReason: stringOrNull4(value.lastDisplayPreviewReason),
    messageLocalUiSupported: typeof value.messageLocalUiSupported === "boolean" ? value.messageLocalUiSupported : MESSAGE_LOCAL_UI_SUPPORTED,
    messageLocalUiFallbackReason: stringOrNull4(value.messageLocalUiFallbackReason) ?? MESSAGE_LOCAL_UI_FALLBACK_REASON,
    messageSnapshotIndexCount: typeof value.messageSnapshotIndexCount === "number" && Number.isFinite(value.messageSnapshotIndexCount) ? Math.max(0, Math.round(value.messageSnapshotIndexCount)) : 0,
    lastWidgetRegenerateMessageId: stringOrNull4(value.lastWidgetRegenerateMessageId),
    lastWidgetRegenerateStartedAt: stringOrNull4(value.lastWidgetRegenerateStartedAt),
    lastWidgetRegenerateCompletedAt: stringOrNull4(value.lastWidgetRegenerateCompletedAt),
    lastWidgetRegenerateDurationMs: numberOrNull2(value.lastWidgetRegenerateDurationMs),
    lastWidgetRegenerateCancelledAt: stringOrNull4(value.lastWidgetRegenerateCancelledAt),
    lastWidgetRegenerateError: stringOrNull4(value.lastWidgetRegenerateError),
    activeWidgetRegenerationCount: typeof value.activeWidgetRegenerationCount === "number" && Number.isFinite(value.activeWidgetRegenerationCount) ? Math.max(0, Math.round(value.activeWidgetRegenerationCount)) : 0,
    messageWidgetPlacementResolved: messageWidgetPlacementResolved(value.messageWidgetPlacementResolved),
    messageWidgetPlacementReason: stringOrNull4(value.messageWidgetPlacementReason) ?? MESSAGE_WIDGET_PLACEMENT_REASON,
    messageDisplayRenderer: messageDisplayRenderer(value.messageDisplayRenderer),
    lastDomInjectionAt: stringOrNull4(value.lastDomInjectionAt),
    lastDomInjectionError: stringOrNull4(value.lastDomInjectionError),
    lastUninjectAt: stringOrNull4(value.lastUninjectAt),
    lastDeletedTrackerMessageId: stringOrNull4(value.lastDeletedTrackerMessageId),
    lastDeletedTrackerSwipeKey: stringOrNull4(value.lastDeletedTrackerSwipeKey),
    lastEditedTrackerMessageId: stringOrNull4(value.lastEditedTrackerMessageId),
    lastEditedTrackerSwipeKey: stringOrNull4(value.lastEditedTrackerSwipeKey),
    lastSwipeDetectedMessageId: stringOrNull4(value.lastSwipeDetectedMessageId),
    lastSwipeKey: stringOrNull4(value.lastSwipeKey),
    lastSwipeKeySource: stringOrNull4(value.lastSwipeKeySource),
    swipeTrackerIndexCount: typeof value.swipeTrackerIndexCount === "number" && Number.isFinite(value.swipeTrackerIndexCount) ? Math.max(0, Math.round(value.swipeTrackerIndexCount)) : 0,
    activeTrackerJobs: activeTrackerJobsOrEmpty(value.activeTrackerJobs),
    lastPlacementRequested: messageDisplayPlacementOrNull(value.lastPlacementRequested),
    lastPlacementResolved: messageDisplayPlacementOrNull(value.lastPlacementResolved),
    lastPlacementRenderAttemptAt: stringOrNull4(value.lastPlacementRenderAttemptAt),
    lastPlacementRenderResult: stringOrNull4(value.lastPlacementRenderResult),
    lastPlacementError: stringOrNull4(value.lastPlacementError),
    lastMountPointStrategy: mountPointStrategy(value.lastMountPointStrategy),
    lastEmbeddedTagWriteAt: stringOrNull4(value.lastEmbeddedTagWriteAt),
    lastEmbeddedTagWriteMessageId: stringOrNull4(value.lastEmbeddedTagWriteMessageId),
    lastEmbeddedTagWriteSwipeKey: stringOrNull4(value.lastEmbeddedTagWriteSwipeKey),
    lastEmbeddedTagError: stringOrNull4(value.lastEmbeddedTagError),
    lastTagInterceptAt: stringOrNull4(value.lastTagInterceptAt),
    lastTagInterceptMessageId: stringOrNull4(value.lastTagInterceptMessageId),
    lastTagInterceptSwipeKey: stringOrNull4(value.lastTagInterceptSwipeKey),
    lastTagInterceptError: stringOrNull4(value.lastTagInterceptError),
    lastMessageControlRenderAt: stringOrNull4(value.lastMessageControlRenderAt),
    lastMessageControlMessageId: stringOrNull4(value.lastMessageControlMessageId),
    lastMessageControlSwipeKey: stringOrNull4(value.lastMessageControlSwipeKey),
    lastMessageControlState: stringOrNull4(value.lastMessageControlState),
    lastGenerateButtonMessageId: stringOrNull4(value.lastGenerateButtonMessageId),
    lastGenerateButtonClickedAt: stringOrNull4(value.lastGenerateButtonClickedAt),
    lastInlineActionClicked: inlineActionOrNull(value.lastInlineActionClicked),
    lastInlineActionAt: stringOrNull4(value.lastInlineActionAt),
    lastInlineActionError: stringOrNull4(value.lastInlineActionError),
    nativeToolbarSupported: MESSAGE_NATIVE_TOOLBAR_SUPPORTED,
    nativeToolbarFallbackReason: MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON,
    connectionMode: typeof value.connectionMode === "string" ? value.connectionMode : base.connectionMode,
    selectedConnectionId: stringOrNull4(value.selectedConnectionId),
    selectedConnectionName: stringOrNull4(value.selectedConnectionName),
    selectedConnectionAvailable: typeof value.selectedConnectionAvailable === "boolean" ? value.selectedConnectionAvailable : base.selectedConnectionAvailable,
    connectionListCount: typeof value.connectionListCount === "number" && Number.isFinite(value.connectionListCount) ? Math.max(0, Math.round(value.connectionListCount)) : 0,
    connectionProfileSelected: typeof value.connectionProfileSelected === "boolean" ? value.connectionProfileSelected : base.connectionProfileSelected,
    effectiveTrackerConnectionMode: stringOrNull4(value.effectiveTrackerConnectionMode),
    effectiveTrackerConnectionReason: stringOrNull4(value.effectiveTrackerConnectionReason),
    lastSelectedConnectionFallbackReason: stringOrNull4(value.lastSelectedConnectionFallbackReason),
    lastTrackerProfileMissingAt: stringOrNull4(value.lastTrackerProfileMissingAt),
    lastConnectionRefreshAt: stringOrNull4(value.lastConnectionRefreshAt),
    lastConnectionRefreshError: stringOrNull4(value.lastConnectionRefreshError),
    lastGenerationConnectionModeUsed: stringOrNull4(value.lastGenerationConnectionModeUsed),
    lastGenerationConnectionIdUsed: stringOrNull4(value.lastGenerationConnectionIdUsed),
    lastGenerationConnectionNameUsed: stringOrNull4(value.lastGenerationConnectionNameUsed),
    lastGenerationConnectionFallbackReason: stringOrNull4(value.lastGenerationConnectionFallbackReason),
    lastGenerationParametersUsed: recordOrNull(value.lastGenerationParametersUsed),
    lastReasoningOverrideUsed: recordOrNull(value.lastReasoningOverrideUsed),
    lastConnectionTestAt: stringOrNull4(value.lastConnectionTestAt),
    lastConnectionTestStatus: connectionTestStatus(value.lastConnectionTestStatus),
    lastConnectionTestDurationMs: numberOrNull2(value.lastConnectionTestDurationMs),
    lastConnectionTestError: stringOrNull4(value.lastConnectionTestError),
    lastConnectionTestOutputPreview: stringOrNull4(value.lastConnectionTestOutputPreview),
    lastConnectionTestFinishReason: stringOrNull4(value.lastConnectionTestFinishReason),
    lastConnectionTestUsage: recordOrNull(value.lastConnectionTestUsage),
    drawerActiveSection: stringOrNull4(value.drawerActiveSection),
    lastDrawerRefreshAt: stringOrNull4(value.lastDrawerRefreshAt),
    lastHistoryGroupedCount: typeof value.lastHistoryGroupedCount === "number" && Number.isFinite(value.lastHistoryGroupedCount) ? Math.max(0, Math.round(value.lastHistoryGroupedCount)) : 0,
    lastHistoryDuplicateCount: typeof value.lastHistoryDuplicateCount === "number" && Number.isFinite(value.lastHistoryDuplicateCount) ? Math.max(0, Math.round(value.lastHistoryDuplicateCount)) : 0,
    lastHistoryCleanupAt: stringOrNull4(value.lastHistoryCleanupAt),
    expandedWidthModeResolved: stringOrNull4(value.expandedWidthModeResolved),
    lastExpandedTrackerWidthPx: numberOrNull2(value.lastExpandedTrackerWidthPx),
    lastDisplaySurface: displaySurfaceOrNull(value.lastDisplaySurface),
    lastPopoverOpenedAt: stringOrNull4(value.lastPopoverOpenedAt),
    lastPopoverMessageId: stringOrNull4(value.lastPopoverMessageId),
    lastPopoverSwipeKey: stringOrNull4(value.lastPopoverSwipeKey),
    lastPopoverWidthPx: numberOrNull2(value.lastPopoverWidthPx),
    lastPopoverHeightPx: numberOrNull2(value.lastPopoverHeightPx),
    lastReaderOpenedAt: stringOrNull4(value.lastReaderOpenedAt),
    lastReaderMessageId: stringOrNull4(value.lastReaderMessageId),
    lastReaderSwipeKey: stringOrNull4(value.lastReaderSwipeKey),
    lastResolvedViewportWidth: numberOrNull2(value.lastResolvedViewportWidth),
    lastResolvedViewportHeight: numberOrNull2(value.lastResolvedViewportHeight),
    lastWidthModeResolved: stringOrNull4(value.lastWidthModeResolved),
    lastWidthConstraintReason: stringOrNull4(value.lastWidthConstraintReason),
    lastWidthOverflowDetected: typeof value.lastWidthOverflowDetected === "boolean" ? value.lastWidthOverflowDetected : null,
    templateTrustMode: value.templateTrustMode === "safe" || value.templateTrustMode === "trusted" || value.templateTrustMode === "dev" ? value.templateTrustMode : base.templateTrustMode,
    ultraModeEnabled: typeof value.ultraModeEnabled === "boolean" ? value.ultraModeEnabled : base.ultraModeEnabled,
    estimatedPromptTokensLastRun: numberOrNull2(value.estimatedPromptTokensLastRun),
    estimatedMemoryTokensLastRun: numberOrNull2(value.estimatedMemoryTokensLastRun),
    iframeFallbackVisibleInMainUi: typeof value.iframeFallbackVisibleInMainUi === "boolean" ? value.iframeFallbackVisibleInMainUi : false,
    lastMemoryIndexCount: typeof value.lastMemoryIndexCount === "number" && Number.isFinite(value.lastMemoryIndexCount) ? Math.max(0, Math.round(value.lastMemoryIndexCount)) : 0,
    lastMemoryCandidateCount: typeof value.lastMemoryCandidateCount === "number" && Number.isFinite(value.lastMemoryCandidateCount) ? Math.max(0, Math.round(value.lastMemoryCandidateCount)) : 0,
    lastMemoryLoadedSnapshotCount: typeof value.lastMemoryLoadedSnapshotCount === "number" && Number.isFinite(value.lastMemoryLoadedSnapshotCount) ? Math.max(0, Math.round(value.lastMemoryLoadedSnapshotCount)) : 0,
    lastMemoryLoadDurationMs: typeof value.lastMemoryLoadDurationMs === "number" && Number.isFinite(value.lastMemoryLoadDurationMs) ? Math.max(0, Math.round(value.lastMemoryLoadDurationMs)) : 0,
    lastMemoryLoadSkippedCount: typeof value.lastMemoryLoadSkippedCount === "number" && Number.isFinite(value.lastMemoryLoadSkippedCount) ? Math.max(0, Math.round(value.lastMemoryLoadSkippedCount)) : 0,
    lastJobTimeoutAt: stringOrNull4(value.lastJobTimeoutAt),
    lastJobTimeoutJobId: stringOrNull4(value.lastJobTimeoutJobId),
    lastJobTimeoutMessageId: stringOrNull4(value.lastJobTimeoutMessageId),
    lastJobTimeoutSwipeKey: stringOrNull4(value.lastJobTimeoutSwipeKey),
    staleJobsEvictedCount: typeof value.staleJobsEvictedCount === "number" && Number.isFinite(value.staleJobsEvictedCount) ? Math.max(0, Math.round(value.staleJobsEvictedCount)) : 0,
    lastHistoryOrphanCount: typeof value.lastHistoryOrphanCount === "number" && Number.isFinite(value.lastHistoryOrphanCount) ? Math.max(0, Math.round(value.lastHistoryOrphanCount)) : 0,
    lastPresetEstimatedTokens: numberOrNull2(value.lastPresetEstimatedTokens),
    lastPresetEstimatedRenderedChars: numberOrNull2(value.lastPresetEstimatedRenderedChars),
    lastPresetPackImportAt: stringOrNull4(value.lastPresetPackImportAt),
    lastPresetPackImportStatus: stringOrNull4(value.lastPresetPackImportStatus),
    lastPresetPackImportError: stringOrNull4(value.lastPresetPackImportError),
    lastPresetPackImportSizeChars: numberOrNull2(value.lastPresetPackImportSizeChars),
    lastPresetPackImportEstimatedTokens: numberOrNull2(value.lastPresetPackImportEstimatedTokens),
    lastPresetPackExportAt: stringOrNull4(value.lastPresetPackExportAt),
    lastPresetPackExportName: stringOrNull4(value.lastPresetPackExportName),
    lastPresetValidationAt: stringOrNull4(value.lastPresetValidationAt),
    lastPresetValidationStatus: stringOrNull4(value.lastPresetValidationStatus),
    lastPresetValidationErrorCount: typeof value.lastPresetValidationErrorCount === "number" && Number.isFinite(value.lastPresetValidationErrorCount) ? Math.max(0, Math.round(value.lastPresetValidationErrorCount)) : 0,
    lastPresetValidationWarningCount: typeof value.lastPresetValidationWarningCount === "number" && Number.isFinite(value.lastPresetValidationWarningCount) ? Math.max(0, Math.round(value.lastPresetValidationWarningCount)) : 0,
    lastPresetValidationEstimatedTokens: numberOrNull2(value.lastPresetValidationEstimatedTokens),
    lastPresetValidationEstimatedRenderedChars: numberOrNull2(value.lastPresetValidationEstimatedRenderedChars),
    lastPresetLintAt: stringOrNull4(value.lastPresetLintAt),
    lastPresetLintWarningCount: typeof value.lastPresetLintWarningCount === "number" && Number.isFinite(value.lastPresetLintWarningCount) ? Math.max(0, Math.round(value.lastPresetLintWarningCount)) : 0,
    lastPresetLintErrorCount: typeof value.lastPresetLintErrorCount === "number" && Number.isFinite(value.lastPresetLintErrorCount) ? Math.max(0, Math.round(value.lastPresetLintErrorCount)) : 0,
    lastPresetLintRawObjectPaths: stringArray(value.lastPresetLintRawObjectPaths),
    lastPresetLintMobileRiskCount: typeof value.lastPresetLintMobileRiskCount === "number" && Number.isFinite(value.lastPresetLintMobileRiskCount) ? Math.max(0, Math.round(value.lastPresetLintMobileRiskCount)) : 0,
    lastPresetRenderLabViewport: value.lastPresetRenderLabViewport === "phone_narrow" || value.lastPresetRenderLabViewport === "phone_large" || value.lastPresetRenderLabViewport === "tablet" || value.lastPresetRenderLabViewport === "desktop" || value.lastPresetRenderLabViewport === "custom" ? value.lastPresetRenderLabViewport : null,
    lastPresetRenderLabSurface: value.lastPresetRenderLabSurface === "inline_contained" || value.lastPresetRenderLabSurface === "inline_wide" || value.lastPresetRenderLabSurface === "popover_body" || value.lastPresetRenderLabSurface === "fullscreen_reader_body" ? value.lastPresetRenderLabSurface : null,
    lastPresetRenderLabResult: stringOrNull4(value.lastPresetRenderLabResult),
    lastPresetRenderLabRenderedChars: numberOrNull2(value.lastPresetRenderLabRenderedChars),
    lastPresetRenderLabWarnings: stringArray(value.lastPresetRenderLabWarnings),
    ownerPowerModeEnabled: typeof value.ownerPowerModeEnabled === "boolean" ? value.ownerPowerModeEnabled : base.ownerPowerModeEnabled,
    renderLabRuntimeEnabled: typeof value.renderLabRuntimeEnabled === "boolean" ? value.renderLabRuntimeEnabled : base.renderLabRuntimeEnabled,
    installedPresetRuntimeEnabled: typeof value.installedPresetRuntimeEnabled === "boolean" ? value.installedPresetRuntimeEnabled : base.installedPresetRuntimeEnabled,
    declarativeHooksEnabled: typeof value.declarativeHooksEnabled === "boolean" ? value.declarativeHooksEnabled : base.declarativeHooksEnabled,
    activePresetRequestedOwnerPower: typeof value.activePresetRequestedOwnerPower === "boolean" ? value.activePresetRequestedOwnerPower : base.activePresetRequestedOwnerPower,
    activePresetHasOwnerPowerScript: typeof value.activePresetHasOwnerPowerScript === "boolean" ? value.activePresetHasOwnerPowerScript : base.activePresetHasOwnerPowerScript,
    lastOwnerPowerRuntimeMode: stringOrNull4(value.lastOwnerPowerRuntimeMode),
    lastOwnerPowerMountedAt: stringOrNull4(value.lastOwnerPowerMountedAt),
    lastOwnerPowerDestroyedAt: stringOrNull4(value.lastOwnerPowerDestroyedAt),
    lastOwnerPowerError: stringOrNull4(value.lastOwnerPowerError),
    lastOwnerPowerEvent: stringOrNull4(value.lastOwnerPowerEvent),
    ownerPowerCrashCount: typeof value.ownerPowerCrashCount === "number" && Number.isFinite(value.ownerPowerCrashCount) ? Math.max(0, Math.round(value.ownerPowerCrashCount)) : 0,
    ownerPowerDisabledReason: stringOrNull4(value.ownerPowerDisabledReason),
    lastOwnerPowerSanitizerAction: stringOrNull4(value.lastOwnerPowerSanitizerAction),
    lastOwnerPowerImportWarning: stringOrNull4(value.lastOwnerPowerImportWarning),
    lastHealthCheckAt: stringOrNull4(value.lastHealthCheckAt),
    lastHealthCheckStatus: maintenanceSeverityOrNull(value.lastHealthCheckStatus),
    lastMaintenanceActionAt: stringOrNull4(value.lastMaintenanceActionAt),
    lastMaintenanceAction: stringOrNull4(value.lastMaintenanceAction),
    lastMaintenanceReport: maintenanceReportOrNull(value.lastMaintenanceReport)
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
async function loadUserPreset(presetId2, userId) {
  const raw = await spindle.userStorage.getJson(presetPath(presetId2), {
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
  if (!isRecord11(raw) || typeof raw.selectedPresetId !== "string") {
    return defaultActivePresetState();
  }
  return {
    selectedPresetId: raw.selectedPresetId,
    selectedAt: typeof raw.selectedAt === "string" ? raw.selectedAt : nowIso()
  };
}
async function saveActivePresetState(chatId, presetId2, userId) {
  const state = {
    selectedPresetId: presetId2,
    selectedAt: nowIso()
  };
  await spindle.userStorage.setJson(activePresetPath(chatId), state, { indent: 2, userId });
  return state;
}
function presetById(presets, presetId2) {
  return presets.find((preset) => preset.id === presetId2) ?? null;
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
async function deleteUserPreset(presetId2, userId) {
  if (presetId2 === DEFAULT_TRACKER_PRESET_ID) throw new Error("Built-in presets cannot be deleted.");
  const ids = await loadPresetIndex(userId);
  if (await spindle.userStorage.exists(presetPath(presetId2), userId)) {
    await spindle.userStorage.delete(presetPath(presetId2), userId);
  }
  await savePresetIndex(ids.filter((id) => id !== presetId2), userId);
}
async function loadSnapshot(chatId, userId) {
  if (!chatId) return null;
  const snapshot = await spindle.userStorage.getJson(snapshotPath(chatId), {
    fallback: null,
    userId
  });
  return snapshot ? normalizeTrackerSnapshotPresetMetadata(snapshot) : null;
}
async function loadMessageSnapshot(chatId, messageId, userId, swipeKey = DEFAULT_SWIPE_KEY) {
  if (!chatId || !messageId) return null;
  const snapshot = await spindle.userStorage.getJson(messageSnapshotPath(chatId, messageId, swipeKey), {
    fallback: null,
    userId
  });
  if (snapshot) return normalizeMessageAttachedSnapshotPresetMetadata(snapshot);
  if (swipeKey !== DEFAULT_SWIPE_KEY) return null;
  const legacy = await spindle.userStorage.getJson(legacyMessageSnapshotPath(chatId, messageId), {
    fallback: null,
    userId
  });
  return legacy ? normalizeMessageAttachedSnapshotPresetMetadata(legacy) : null;
}
async function loadMessageSnapshotIndex(chatId, userId) {
  if (!chatId) return [];
  const raw = await spindle.userStorage.getJson(messageSnapshotIndexPath(chatId), {
    fallback: [],
    userId
  });
  const repaired = repairMessageSnapshotIndex(raw);
  if (JSON.stringify(raw) !== JSON.stringify(repaired)) {
    await spindle.userStorage.setJson(messageSnapshotIndexPath(chatId), repaired, { indent: 2, userId });
  }
  return repaired;
}
async function saveMessageSnapshotIndex(chatId, index, userId) {
  await spindle.userStorage.setJson(messageSnapshotIndexPath(chatId), repairMessageSnapshotIndex(index), {
    indent: 2,
    userId
  });
}
function messageIndexFromChatMessage(message) {
  return typeof message.index_in_chat === "number" && Number.isFinite(message.index_in_chat) ? Math.max(0, Math.round(message.index_in_chat)) : null;
}
function trackerPayloadText(payload) {
  return JSON.stringify(payload, null, 2);
}
function memoryEntryFromAttachedSnapshot(snapshot, source = "sidecar_snapshot") {
  return {
    messageId: snapshot.messageId,
    messageIndex: snapshot.messageIndex,
    swipeKey: snapshot.swipeKey,
    presetId: snapshot.presetId ?? snapshot.snapshot.presetId,
    presetName: snapshot.presetName ?? snapshot.snapshot.presetName,
    createdAt: snapshot.snapshot.createdAt || snapshot.attachedAt,
    source,
    payload: snapshot.snapshot.data,
    text: trackerPayloadText(snapshot.snapshot.data)
  };
}
function memoryEntryFromChatSnapshot(snapshot) {
  return {
    messageId: null,
    messageIndex: null,
    swipeKey: null,
    presetId: snapshot.presetId,
    presetName: snapshot.presetName,
    createdAt: snapshot.createdAt,
    source: "latest_chat_snapshot",
    payload: snapshot.data,
    text: trackerPayloadText(snapshot.data)
  };
}
function parseEmbeddedMemoryEntriesFromContent(content, message, source) {
  const tags = findLTrackerTags(content);
  const entries = [];
  for (const tag of tags) {
    try {
      const payload = parseTrackerJson(tag.content);
      entries.push({
        messageId: message.id,
        messageIndex: messageIndexFromChatMessage(message),
        swipeKey: tag.attrs.swipe || null,
        presetId: null,
        presetName: null,
        createdAt: nowIso(),
        source,
        payload,
        text: trackerPayloadText(payload)
      });
    } catch {
    }
  }
  return entries;
}
async function embeddedMemoryEntriesFromMessages(chatId, settings) {
  if (settings.memory.source !== "hybrid" && settings.memory.source !== "embedded_tags" && settings.memory.source !== "message_history") return [];
  const messages = await readChatMessages(chatId).catch(() => []);
  const source = settings.memory.source === "message_history" ? "history_scan" : "embedded_tag";
  const entries = [];
  for (const message of messages.slice(-Math.max(settings.recentMessageLimit, 24))) {
    if (typeof message.content === "string") {
      entries.push(...parseEmbeddedMemoryEntriesFromContent(message.content, message, source));
    }
    const swipes = Array.isArray(message.swipes) ? message.swipes : [];
    for (const swipeContent of swipes) {
      if (typeof swipeContent !== "string" || swipeContent === message.content) continue;
      entries.push(...parseEmbeddedMemoryEntriesFromContent(swipeContent, message, source));
    }
  }
  return entries;
}
async function loadSnapshotCandidatesWithLimit(candidates, chatId, userId, concurrencyLimit = 4) {
  const results = new Array(candidates.length);
  let currentIndex = 0;
  async function worker() {
    while (currentIndex < candidates.length) {
      const index = currentIndex++;
      const cand = candidates[index];
      if (!cand) continue;
      try {
        const snap = await loadMessageSnapshot(chatId, cand.messageId, userId, cand.swipeKey);
        if (snap) {
          results[index] = snap;
        }
      } catch (err) {
      }
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(concurrencyLimit, candidates.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results.filter(Boolean);
}
async function sidecarMemoryEntriesFromIndex(chatId, userId, index, settings, activePreset, trigger, diagnosticsAccumulator) {
  const options = trigger ? memoryOptionsFromTrigger(trigger, activePreset) : { activePreset };
  const candidates = selectTrackerMemoryCandidates(index, settings.memory, options);
  if (diagnosticsAccumulator) {
    diagnosticsAccumulator.lastMemoryIndexCount = index.length;
    diagnosticsAccumulator.lastMemoryCandidateCount = candidates.length;
  }
  const startTime = Date.now();
  const loaded = await loadSnapshotCandidatesWithLimit(candidates, chatId, userId, 4);
  const duration = Date.now() - startTime;
  if (diagnosticsAccumulator) {
    diagnosticsAccumulator.lastMemoryLoadedSnapshotCount = loaded.length;
    diagnosticsAccumulator.lastMemoryLoadDurationMs = duration;
    diagnosticsAccumulator.lastMemoryLoadSkippedCount = Math.max(0, candidates.length - loaded.length);
  }
  let filteredLoaded = loaded.filter((attached) => {
    if (settings.memory.requireSamePreset && activePreset) {
      if (attached.presetId !== activePreset.id && attached.snapshot.presetId !== activePreset.id) {
        return false;
      }
    }
    if (settings.memory.requireSameSwipeWhenAvailable && trigger && trigger.kind !== "manual") {
      if (attached.swipeKey !== trigger.swipeKey) return false;
    }
    return true;
  });
  const finalRetained = filteredLoaded.slice(-settings.memory.retainCount);
  const entries = [];
  for (const attached of finalRetained) {
    entries.push(memoryEntryFromAttachedSnapshot(attached));
  }
  return entries;
}
async function collectTrackerMemory(chatId, userId, settings, activePreset, trigger, diagnosticsAccumulator) {
  const memorySettings = {
    ...settings.memory,
    maxMemoryChars: effectiveTrackerMemoryChars(settings)
  };
  if (!settings.memory.enabled || settings.memory.retainCount <= 0) {
    return buildTrackerMemoryResult([], memorySettings, trigger ? memoryOptionsFromTrigger(trigger, activePreset) : { activePreset });
  }
  const entries = [];
  const index = await loadMessageSnapshotIndex(chatId, userId);
  if (settings.memory.source === "hybrid" || settings.memory.source === "sidecar_index") {
    entries.push(...await sidecarMemoryEntriesFromIndex(chatId, userId, index, settings, activePreset, trigger, diagnosticsAccumulator));
  }
  if (settings.memory.source === "hybrid" || settings.memory.source === "embedded_tags" || settings.memory.source === "message_history") {
    entries.push(...await embeddedMemoryEntriesFromMessages(chatId, settings));
  }
  if (entries.length === 0 && (settings.memory.source === "hybrid" || settings.memory.source === "sidecar_index")) {
    const latestSnapshot = await loadSnapshot(chatId, userId);
    if (latestSnapshot) entries.push(memoryEntryFromChatSnapshot(latestSnapshot));
  }
  return buildTrackerMemoryResult(entries, memorySettings, trigger ? memoryOptionsFromTrigger(trigger, activePreset) : { activePreset });
}
function chatJobKey(chatId) {
  return `chat:${chatId}`;
}
function trackerJobKey(chatId, messageId, swipeKey) {
  return `tracker:${chatId}:${messageId}:${swipeKey}`;
}
function jobKeyForTrigger(chatId, trigger) {
  return trigger.kind === "manual" ? chatJobKey(chatId) : trackerJobKey(chatId, trigger.sourceMessageId, trigger.swipeKey);
}
function jobsForChat(chatId) {
  return [...activeJobs.values()].filter((job) => job.chatId === chatId);
}
function hasActiveJobForChat(chatId) {
  return jobsForChat(chatId).length > 0;
}
function abortJobsForChat(chatId, reason) {
  for (const job of jobsForChat(chatId)) {
    job.cancelReason = reason;
    job.controller.abort();
  }
}
function activeWidgetJobsForChat(chatId) {
  if (!chatId) return {};
  const result = {};
  for (const job of jobsForChat(chatId)) {
    if (!job.sourceMessageId || !job.swipeKey) continue;
    result[swipeIdentityKey({ messageId: job.sourceMessageId, swipeKey: job.swipeKey })] = {
      jobId: job.jobId,
      startedAt: job.startedAt
    };
  }
  return result;
}
function activeTrackerJobDiagnostics(chatId) {
  if (!chatId) return [];
  return jobsForChat(chatId).filter((job) => job.sourceMessageId && job.swipeKey).map((job) => ({
    jobId: job.jobId,
    messageId: job.sourceMessageId ?? "",
    swipeKey: job.swipeKey ?? DEFAULT_SWIPE_KEY,
    startedAt: job.startedAt
  }));
}
async function buildMessageControlCandidates(chatId, settings, latestChatSnapshot, preset, messageSnapshotIndex, activeWidgetJobs, selectedSwipeIdentities) {
  if (!chatId || !settings.messageDisplay.showGenerateButtonForMissingTracker) return [];
  const messages = await readChatMessages(chatId);
  const existingKeys = new Set(messageSnapshotIndex.map((entry) => swipeIdentityKey(entry)));
  const recent = messages.slice(-Math.max(settings.recentMessageLimit, 12));
  const entries = [];
  for (const message of recent) {
    if (message.is_user) continue;
    const identity = selectedSwipeIdentities[message.id] ?? deriveSwipeTrackerIdentity(chatId, message);
    const key = swipeIdentityKey(identity);
    if (existingKeys.has(key)) continue;
    const activeJob = activeWidgetJobs[key] ?? null;
    const indexEntry = {
      messageId: message.id,
      messageIndex: typeof message.index_in_chat === "number" && Number.isFinite(message.index_in_chat) ? Math.round(message.index_in_chat) : null,
      swipeKey: identity.swipeKey,
      swipeIndex: identity.swipeIndex,
      swipeId: identity.swipeId,
      swipeContentHash: identity.swipeContentHash,
      swipeKeySource: identity.swipeKeySource,
      createdAt: nowIso(),
      presetId: preset.id,
      presetName: preset.name,
      storageKey: `missing:${chatId}:${message.id}:${identity.swipeKey}`
    };
    entries.push({
      indexEntry,
      snapshot: null,
      rendered: renderMessageTracker({
        messageId: message.id,
        messageIndex: indexEntry.messageIndex,
        attachedSnapshot: null,
        latestChatSnapshot,
        preset,
        settings: settings.messageDisplay,
        swipeIdentity: identity,
        isRegenerating: Boolean(activeJob),
        activeJobId: activeJob?.jobId ?? null,
        activeJobStartedAt: activeJob?.startedAt ?? null
      })
    });
  }
  return entries;
}
function resolveMessageWidgetPlacement(requested, settings) {
  if (settings?.messageDisplay.useDomInjection) {
    return {
      resolved: requested,
      reason: requested === "top" ? null : "DOM injection uses beforeend for bottom placement."
    };
  }
  if (!MESSAGE_LOCAL_UI_SUPPORTED) {
    return { resolved: "unsupported", reason: MESSAGE_LOCAL_UI_FALLBACK_REASON ?? MESSAGE_WIDGET_PLACEMENT_REASON };
  }
  if (requested === "bottom") return { resolved: "host_default", reason: null };
  return { resolved: "host_default", reason: MESSAGE_WIDGET_PLACEMENT_REASON };
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
    spindle.log.warn(`LTracker could not save diagnostics: ${errorMessage2(error)}`);
  }
}
function summarizeConnectionProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    provider: typeof profile.provider === "string" ? profile.provider : null,
    model: typeof profile.model === "string" ? profile.model : null,
    has_api_key: typeof profile.has_api_key === "boolean" ? profile.has_api_key : null,
    is_default: typeof profile.is_default === "boolean" ? profile.is_default : null,
    reasoning_bindings: recordOrNull(profile.reasoning_bindings),
    updated_at: typeof profile.updated_at === "string" ? profile.updated_at : null
  };
}
function connectionCacheForUser(userId) {
  return connectionProfilesByUser.get(userId) ?? {
    profiles: [],
    refreshedAt: null,
    error: null
  };
}
async function refreshConnectionProfiles(userId, chatId) {
  ensurePermission("generation", "generation is required to list connection profiles");
  if (!spindle.connections?.list) {
    throw new Error("Lumiverse connection profile list API is unavailable.");
  }
  const refreshedAt = nowIso();
  try {
    const profiles = (await spindle.connections.list(userId)).map(summarizeConnectionProfile);
    connectionProfilesByUser.set(userId, { profiles, refreshedAt, error: null });
    if (chatId) {
      const settings = await getSettings(userId);
      const diagnostics = {
        ...await loadDiagnostics(chatId, userId),
        connectionMode: settings.connection.mode,
        selectedConnectionId: settings.connection.selectedConnectionId,
        selectedConnectionName: settings.connection.selectedConnectionName,
        selectedConnectionAvailable: Boolean(settings.connection.selectedConnectionId && profiles.some((profile) => profile.id === settings.connection.selectedConnectionId)),
        connectionListCount: profiles.length,
        lastConnectionRefreshAt: refreshedAt,
        lastConnectionRefreshError: null
      };
      await tryPersistDiagnostics(diagnostics, userId);
    }
    return profiles;
  } catch (error) {
    const message = errorMessage2(error);
    const previous = connectionCacheForUser(userId);
    connectionProfilesByUser.set(userId, { ...previous, refreshedAt, error: message });
    if (chatId) {
      const settings = await getSettings(userId);
      const diagnostics = {
        ...await loadDiagnostics(chatId, userId),
        connectionMode: settings.connection.mode,
        selectedConnectionId: settings.connection.selectedConnectionId,
        selectedConnectionName: settings.connection.selectedConnectionName,
        selectedConnectionAvailable: Boolean(settings.connection.selectedConnectionId && previous.profiles.some((profile) => profile.id === settings.connection.selectedConnectionId)),
        connectionListCount: previous.profiles.length,
        lastConnectionRefreshAt: refreshedAt,
        lastConnectionRefreshError: message
      };
      await tryPersistDiagnostics(diagnostics, userId);
    }
    throw error;
  }
}
async function getSelectedConnectionProfile(settings, userId) {
  const selectedId = settings.connection.selectedConnectionId;
  if (!selectedId) return null;
  const cached = connectionCacheForUser(userId).profiles.find((profile) => profile.id === selectedId);
  if (cached) return cached;
  if (!spindle.connections?.get) return null;
  try {
    const profile = await spindle.connections.get(selectedId, userId);
    return profile ? summarizeConnectionProfile(profile) : null;
  } catch (error) {
    spindle.log.warn(`LTracker could not fetch selected tracker connection: ${errorMessage2(error)}`);
    return null;
  }
}
async function buildState(chatId, userId, status, error = null, renderPreview = null, historyLimit) {
  const settings = await getSettings(userId);
  const diagnostics = await loadDiagnostics(chatId, userId);
  const connectionCache = connectionCacheForUser(userId);
  const selectedConnectionAvailable = Boolean(
    settings.connection.selectedConnectionId && connectionCache.profiles.some((profile) => profile.id === settings.connection.selectedConnectionId)
  );
  const presetState = await resolveActivePreset(chatId, userId);
  const presetStats = estimatePresetStats(presetState.activePreset);
  const snapshot = await loadSnapshot(chatId, userId);
  const activeWidgetJobs = activeWidgetJobsForChat(chatId);
  const messageSnapshotIndex = await loadMessageSnapshotIndex(chatId, userId);
  const selectedSwipeIdentities = await selectedSwipeIdentitiesForChat(chatId);
  const limit = Math.max(10, historyLimit ?? settings.history?.pageSize ?? 25);
  const sortedNewestFirst = [...messageSnapshotIndex].sort((left, right) => {
    if (left.messageIndex !== null && right.messageIndex !== null && left.messageIndex !== right.messageIndex) {
      return right.messageIndex - left.messageIndex;
    }
    if (left.messageIndex !== null && right.messageIndex === null) return 1;
    if (left.messageIndex === null && right.messageIndex !== null) return -1;
    return right.createdAt.localeCompare(right.createdAt);
  });
  const dedupedMap = /* @__PURE__ */ new Map();
  for (const entry of sortedNewestFirst) {
    const key = `${entry.messageId}:${entry.swipeKey}`;
    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, entry);
    }
  }
  const dedupedIndex = Array.from(dedupedMap.values());
  const slicedIndex = dedupedIndex.slice(0, limit);
  const historySnapshots = await loadSnapshotCandidatesWithLimit(slicedIndex, chatId ?? "", userId, 4);
  const rawMessageSnapshotHistory = buildMessageTrackerHistory({
    index: slicedIndex,
    snapshots: historySnapshots,
    latestChatSnapshot: snapshot,
    preset: presetState.activePreset,
    presets: presetState.presets,
    settings: settings.messageDisplay,
    activeWidgetJobs,
    selectedSwipeIdentities
  });
  const historyGrouping = groupMessageTrackerHistory(rawMessageSnapshotHistory, false);
  const messageSnapshotHistory = rawMessageSnapshotHistory;
  const latestMessageSnapshotHistory = historyGrouping.entries;
  const messageControlCandidates = await buildMessageControlCandidates(
    chatId,
    settings,
    snapshot,
    presetState.activePreset,
    messageSnapshotIndex,
    activeWidgetJobs,
    selectedSwipeIdentities
  ).catch((error2) => {
    spindle.log.warn(`LTracker could not build message control candidates: ${errorMessage2(error2)}`);
    return [];
  });
  const latestMessageSnapshot = await loadMessageSnapshot(
    chatId,
    diagnostics.latestAttachedMessageId,
    userId,
    diagnostics.lastSwipeKey ?? DEFAULT_SWIPE_KEY
  );
  const messageDisplayMode = !settings.messageDisplay.enabled ? "disabled" : settings.messageDisplay.useDomInjection ? "dom_injection" : settings.messageDisplay.fallbackToIframeWidget && MESSAGE_LOCAL_UI_SUPPORTED ? "message_widget" : "drawer_history";
  const messageDisplayRenderer2 = !settings.messageDisplay.enabled ? "drawer_history" : settings.messageDisplay.useDomInjection ? "dom_injection" : settings.messageDisplay.fallbackToIframeWidget && MESSAGE_LOCAL_UI_SUPPORTED ? "iframe_widget" : "drawer_history";
  const messageDisplayHydratedCount = settings.messageDisplay.enabled ? latestMessageSnapshotHistory.filter((entry) => entry.snapshot !== null).length : 0;
  const placement = resolveMessageWidgetPlacement(settings.messageDisplay.placement, settings);
  const activeWidgetRegenerationCount = Object.keys(activeWidgetJobs).length;
  const memoryPreviewResult = chatId ? await collectTrackerMemory(chatId, userId, settings, presetState.activePreset).catch((error2) => {
    spindle.log.warn(`LTracker could not build tracker memory preview: ${errorMessage2(error2)}`);
    return null;
  }) : null;
  const memoryPreview = memoryPreviewResult?.renderedText.trim() ? memoryPreviewResult.renderedText : null;
  const injectionSettings2 = {
    ...settings.injection,
    maxInjectedChars: effectivePromptInjectionChars(settings)
  };
  const injectionPreview = memoryPreviewResult?.entries.length ? formatTrackerInjectionBlock(memoryPreviewResult.entries, injectionSettings2) : null;
  const stateError = error ?? diagnostics.lastError;
  const ownerPowerSummary = ownerPowerFeatureSummary(presetState.activePreset);
  return {
    version: EXTENSION_VERSION,
    status: status ?? diagnostics.status,
    chatId,
    snapshot,
    latestMessageSnapshot,
    memoryPreview,
    injectionPreview,
    renderPreview,
    messageSnapshotHistory,
    messageControlCandidates,
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
      connectionMode: settings.connection.mode,
      selectedConnectionId: settings.connection.selectedConnectionId,
      selectedConnectionName: settings.connection.selectedConnectionName,
      selectedConnectionAvailable,
      connectionListCount: connectionCache.profiles.length,
      lastConnectionRefreshAt: connectionCache.refreshedAt ?? diagnostics.lastConnectionRefreshAt,
      lastConnectionRefreshError: connectionCache.error ?? diagnostics.lastConnectionRefreshError,
      drawerActiveSection: diagnostics.drawerActiveSection ?? "dashboard",
      lastDrawerRefreshAt: nowIso(),
      pendingAutoFinalizationCount: pendingAutoFinalizations.size,
      autoSubscriptionActive: autoSubscriptionsActive,
      injectionEnabled: settings.injection.enabled && interceptorRegistered,
      lastMemoryEntryCount: memoryPreviewResult?.entries.length ?? diagnostics.lastMemoryEntryCount,
      lastMemoryChars: memoryPreviewResult?.totalChars ?? diagnostics.lastMemoryChars,
      lastMemoryTruncated: memoryPreviewResult?.truncated ?? diagnostics.lastMemoryTruncated,
      lastMemorySourceSummary: memoryPreviewResult ? trackerMemorySourceSummary(memoryPreviewResult.entries) : diagnostics.lastMemorySourceSummary,
      lastMemorySkippedReason: memoryPreviewResult?.skippedReason ?? diagnostics.lastMemorySkippedReason,
      selectedPresetId: presetState.activePreset.id,
      selectedPresetName: presetState.activePreset.name,
      lastPresetFallbackReason: presetState.fallbackReason ?? diagnostics.lastPresetFallbackReason,
      contextHandlerRegistered,
      interceptorRegistered,
      contextHandlerDisabledReason: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED ? diagnostics.contextHandlerDisabledReason : CONTEXT_HANDLER_DISABLED_REASON,
      messageDisplayEnabled: settings.messageDisplay.enabled,
      messageDisplayMode,
      messageDisplayPlacement: settings.messageDisplay.placement,
      messageDisplayHydratedCount,
      selectedDisplaySurface: settings.messageDisplay.displaySurface,
      resolvedDisplaySurface: settings.messageDisplay.displaySurface,
      displaySurfaceKind: settings.messageDisplay.displaySurface === "drawer_only" ? "drawer_only" : settings.messageDisplay.displaySurface === "anchored_popover" || settings.messageDisplay.displaySurface === "fullscreen_reader" ? "overlay" : "inline",
      lastMessageDisplayHydratedAt: messageDisplayHydratedCount > 0 ? nowIso() : diagnostics.lastMessageDisplayHydratedAt,
      messageLocalUiSupported: MESSAGE_LOCAL_UI_SUPPORTED,
      messageLocalUiFallbackReason: MESSAGE_LOCAL_UI_FALLBACK_REASON,
      messageSnapshotIndexCount: messageSnapshotIndex.length,
      lastHistoryGroupedCount: dedupedIndex.length,
      lastHistoryDuplicateCount: Math.max(0, messageSnapshotIndex.length - dedupedIndex.length),
      swipeTrackerIndexCount: messageSnapshotIndex.length,
      activeWidgetRegenerationCount,
      activeTrackerJobs: activeTrackerJobDiagnostics(chatId),
      messageWidgetPlacementResolved: placement.resolved,
      messageWidgetPlacementReason: placement.reason,
      messageDisplayRenderer: messageDisplayRenderer2,
      nativeToolbarSupported: MESSAGE_NATIVE_TOOLBAR_SUPPORTED,
      nativeToolbarFallbackReason: MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON,
      templateTrustMode: settings.renderer.templateTrustMode,
      ultraModeEnabled: settings.budget.ultraModeEnabled,
      iframeFallbackVisibleInMainUi: false,
      expandedWidthModeResolved: settings.expandedWidth.expandedWidthMode,
      lastPresetEstimatedTokens: presetStats.estimatedTokens,
      lastPresetEstimatedRenderedChars: presetStats.estimatedRenderedChars,
      ownerPowerModeEnabled: settings.ownerPowerMode.enabled,
      renderLabRuntimeEnabled: settings.ownerPowerMode.allowRenderLabRuntime,
      installedPresetRuntimeEnabled: settings.ownerPowerMode.allowInstalledPresetRuntime,
      declarativeHooksEnabled: settings.ownerPowerMode.allowTemplateActionHooks,
      activePresetRequestedOwnerPower: ownerPowerSummary.requested,
      activePresetHasOwnerPowerScript: ownerPowerSummary.hasScript,
      lastOwnerPowerRuntimeMode: settings.ownerPowerMode.allowTemplateActionHooks ? "declarative_hooks" : diagnostics.lastOwnerPowerRuntimeMode
    },
    connectionProfiles: connectionCache.profiles
  };
}
async function sendState(chatId, userId, status, error = null, requestId, renderPreview = null, historyLimit) {
  const message = {
    type: "state",
    state: await buildState(chatId, userId, status, error, renderPreview, historyLimit)
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
async function selectedSwipeIdentitiesForChat(chatId) {
  if (!chatId) return {};
  try {
    const messages = await readChatMessages(chatId);
    const result = {};
    for (const message of messages) {
      if (message.is_user) continue;
      result[message.id] = deriveSwipeTrackerIdentity(chatId, message);
    }
    return result;
  } catch (error) {
    spindle.log.warn(`LTracker could not read selected swipes: ${errorMessage2(error)}`);
    return {};
  }
}
async function getMessagesForTrigger(chatId, settings, trigger) {
  if (trigger.kind !== "widget") return getRecentMessages(chatId, settings);
  const messages = await readChatMessages(chatId);
  const targetIndex = messages.findIndex((message) => message.id === trigger.sourceMessageId);
  if (targetIndex < 0) {
    throw new LTrackerStageError("read_messages", "The selected message was not found for regeneration.");
  }
  return messages.slice(0, targetIndex + 1).slice(-settings.recentMessageLimit);
}
function normalizeMessages(messages) {
  return messages.filter((message) => message.content.trim().length > 0).map((message) => ({
    index: message.index_in_chat,
    role: message.is_user ? "user" : "assistant",
    name: message.name ?? "",
    content: message.content
  }));
}
function limitContextText(value, maxChars) {
  const normalized = value.trim();
  if (maxChars <= 0) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 24)).trimEnd()}
[context truncated]`;
}
function keywordMatches(text, keywords, caseSensitive) {
  if (keywords.length === 0) return false;
  const haystack = caseSensitive ? text : text.toLowerCase();
  return keywords.some((keyword) => {
    const needle = caseSensitive ? keyword : keyword.toLowerCase();
    return needle.trim() ? haystack.includes(needle.trim()) : false;
  });
}
function contextObjectString(value, key) {
  return isRecord11(value) && typeof value[key] === "string" ? value[key].trim() : "";
}
function contextObjectStringArray(value, key) {
  if (!isRecord11(value) || !Array.isArray(value[key])) return [];
  return value[key].filter((item) => typeof item === "string" && item.trim().length > 0);
}
async function collectWorldLoreContext(chatId, userId, settings) {
  const filters = settings.contextFilters;
  const apiAvailable = Boolean(spindle.world_books?.getActivated);
  const permission = spindle.permissions.has("world_books");
  const lines = [];
  let considered = 0;
  let included = 0;
  let status = null;
  let skippedReason = null;
  if (!filters.enabled || !filters.includeWorldLoreContext) {
    skippedReason = "World/lore context is disabled.";
  } else {
    const manual = limitContextText(filters.manualWorldLoreContext, filters.maxWorldLoreChars);
    if (manual) {
      lines.push("[Manual extra lore context]", manual);
      included += 1;
    }
  }
  if (filters.enabled && filters.includeWorldLoreContext) {
    if (!apiAvailable) {
      skippedReason = "Lumiverse world/lore API is unavailable in this runtime.";
    } else if (!permission) {
      skippedReason = "world_books permission is not granted.";
    } else {
      try {
        const entries = await spindle.world_books.getActivated(chatId, userId);
        considered = Array.isArray(entries) ? entries.length : 0;
        const nativeLines = [];
        for (const entry of Array.isArray(entries) ? entries : []) {
          const comment = contextObjectString(entry, "comment");
          const keys = contextObjectStringArray(entry, "keys");
          const source = contextObjectString(entry, "source");
          const score = isRecord11(entry) && typeof entry.score === "number" ? ` score=${entry.score}` : "";
          const rendered = [
            comment ? `Entry: ${comment}` : "Entry: activated world/lore item",
            keys.length ? `Keys: ${keys.join(", ")}` : null,
            source ? `Source: ${source}${score}` : null
          ].filter(Boolean).join(" | ");
          if (filters.excludedLoreKeywords.length > 0 && keywordMatches(rendered, filters.excludedLoreKeywords, filters.caseSensitiveExclusions)) continue;
          if (filters.includeOnlyMatchedLore && filters.loreAllowlistKeywords.length > 0 && !keywordMatches(rendered, filters.loreAllowlistKeywords, filters.caseSensitiveExclusions)) continue;
          nativeLines.push(rendered);
        }
        if (nativeLines.length > 0) {
          lines.push("[Activated world/lore entries]", nativeLines.join("\n"));
          included += nativeLines.length;
        }
        status = `read ${nativeLines.length}/${considered} activated world/lore entries`;
      } catch (error) {
        skippedReason = `World/lore read failed: ${errorMessage2(error)}`;
      }
    }
  }
  const text = limitContextText(lines.join("\n"), filters.maxWorldLoreChars);
  return {
    block: text ? { title: "World / Lore Context", text } : null,
    status,
    skippedReason: text ? skippedReason : skippedReason ?? (filters.includeWorldLoreContext ? "No world/lore context matched filters." : "World/lore context is disabled."),
    considered,
    included,
    chars: text.length,
    preview: text || null
  };
}
async function collectCharacterContext(chatId, userId, settings) {
  const filters = settings.contextFilters;
  const apiAvailable = Boolean(spindle.characters?.get);
  const permission = spindle.permissions.has("characters");
  const lines = [];
  let status = null;
  let skippedReason = null;
  if (!filters.enabled || !filters.includeCharacterContext) {
    skippedReason = "Character context is disabled.";
  } else {
    const manual = limitContextText(filters.manualCharacterContext, filters.maxCharacterContextChars);
    if (manual) lines.push("[Manual character notes]", manual);
  }
  if (filters.enabled && filters.includeCharacterContext) {
    if (!apiAvailable) {
      skippedReason = "Lumiverse character API is unavailable in this runtime.";
    } else if (!permission) {
      skippedReason = "characters permission is not granted.";
    } else {
      try {
        const chat = await spindle.chats?.get?.(chatId, userId);
        const characterId = isRecord11(chat) && typeof chat.character_id === "string" ? chat.character_id : null;
        if (!characterId) {
          skippedReason = "Active chat has no character id.";
        } else {
          const character = await spindle.characters.get(characterId, userId);
          const name = contextObjectString(character, "name");
          const excluded = name && settings.contextFilters.excludedCharacterNames.some((item) => settings.contextFilters.caseSensitiveExclusions ? item === name : item.toLowerCase() === name.toLowerCase());
          if (excluded) {
            skippedReason = `Active character "${name}" is excluded.`;
          } else if (character) {
            const parts = [
              name ? `Name: ${name}` : null,
              contextObjectString(character, "description") ? `Description: ${contextObjectString(character, "description")}` : null,
              contextObjectString(character, "personality") ? `Personality: ${contextObjectString(character, "personality")}` : null,
              contextObjectString(character, "scenario") ? `Scenario: ${contextObjectString(character, "scenario")}` : null,
              contextObjectString(character, "creator_notes") ? `Creator notes: ${contextObjectString(character, "creator_notes")}` : null,
              contextObjectString(character, "system_prompt") ? `System prompt: ${contextObjectString(character, "system_prompt")}` : null,
              contextObjectString(character, "post_history_instructions") ? `Post-history instructions: ${contextObjectString(character, "post_history_instructions")}` : null
            ].filter(Boolean).join("\n");
            if (parts) lines.push("[Active character card]", parts);
            status = `read active character${name ? `: ${name}` : ""}`;
          }
        }
      } catch (error) {
        skippedReason = `Character read failed: ${errorMessage2(error)}`;
      }
    }
  }
  const text = limitContextText(lines.join("\n"), filters.maxCharacterContextChars);
  return {
    block: text ? { title: "Character Context", text } : null,
    status,
    skippedReason: text ? skippedReason : skippedReason ?? (filters.includeCharacterContext ? "No character context was available." : "Character context is disabled."),
    considered: status ? 1 : 0,
    included: text ? 1 : 0,
    chars: text.length,
    preview: text || null
  };
}
async function collectPersonaContext(userId, settings) {
  const filters = settings.contextFilters;
  const apiAvailable = Boolean(spindle.personas?.getActive);
  const permission = spindle.permissions.has("personas");
  const lines = [];
  let status = null;
  let skippedReason = null;
  if (!filters.enabled || !filters.includePersonaContext) {
    skippedReason = "Persona context is disabled.";
  } else {
    const manual = limitContextText(filters.manualPersonaContext, filters.maxPersonaContextChars);
    if (manual) lines.push("[Manual persona notes]", manual);
  }
  if (filters.enabled && filters.includePersonaContext) {
    if (!apiAvailable) {
      skippedReason = "Lumiverse persona API is unavailable in this runtime.";
    } else if (!permission) {
      skippedReason = "personas permission is not granted.";
    } else {
      try {
        const persona = await spindle.personas.getActive(userId);
        const name = contextObjectString(persona, "name");
        const title = contextObjectString(persona, "title");
        const description = contextObjectString(persona, "description");
        const text2 = [
          name ? `Name: ${name}` : null,
          title ? `Title: ${title}` : null,
          description ? `Description: ${description}` : null
        ].filter(Boolean).join("\n");
        if (text2) lines.push("[Active persona]", text2);
        status = persona ? `read active persona${name ? `: ${name}` : ""}` : "no active persona";
      } catch (error) {
        skippedReason = `Persona read failed: ${errorMessage2(error)}`;
      }
    }
  }
  const text = limitContextText(lines.join("\n"), filters.maxPersonaContextChars);
  return {
    block: text ? { title: "Persona Context", text } : null,
    status,
    skippedReason: text ? skippedReason : skippedReason ?? (filters.includePersonaContext ? "No persona context was available." : "Persona context is disabled."),
    considered: status ? 1 : 0,
    included: text ? 1 : 0,
    chars: text.length,
    preview: text || null
  };
}
function memorySettingsForContextFilters(settings) {
  if (!settings.contextFilters.enabled) return settings;
  return {
    ...settings,
    memory: {
      ...settings.memory,
      includeInTrackerGeneration: settings.memory.includeInTrackerGeneration && settings.contextFilters.includeTrackerMemory,
      source: settings.contextFilters.includeEmbeddedTrackerTags ? settings.memory.source : settings.memory.source === "embedded_tags" ? "sidecar_index" : settings.memory.source === "hybrid" ? "sidecar_index" : settings.memory.source
    }
  };
}
function contextFilterDiagnostics(result) {
  return {
    lastContextFilterMessageCount: result.messageCount,
    lastContextFilterIncludedCount: result.includedCount,
    lastContextFilterExcludedCount: result.excludedCount,
    lastContextFilterExcludedNames: result.excludedNames,
    lastContextFilterReasons: result.reasons,
    lastContextFilterWarning: result.warning,
    lastContextExclusionReport: formatContextFilterReport(result)
  };
}
function normalizeGenerationText(result) {
  if (typeof result === "string" && result.trim()) return result;
  if (!isRecord11(result)) {
    throw new Error("Lumiverse generation returned an unsupported response.");
  }
  for (const key of ["content", "text", "output", "response"]) {
    const value = result[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const message = result.message;
  if (typeof message === "string" && message.trim()) return message;
  if (isRecord11(message) && typeof message.content === "string" && message.content.trim()) {
    return message.content;
  }
  throw new Error("Lumiverse generation completed without textual content.");
}
function generationFinishReason(result) {
  if (!isRecord11(result)) return null;
  for (const key of ["finish_reason", "finishReason", "stop_reason", "stopReason"]) {
    const value = result[key];
    if (typeof value === "string") return value;
  }
  const choice = Array.isArray(result.choices) ? result.choices[0] : null;
  if (isRecord11(choice)) {
    for (const key of ["finish_reason", "finishReason"]) {
      const value = choice[key];
      if (typeof value === "string") return value;
    }
  }
  return null;
}
function generationUsage(result) {
  if (!isRecord11(result)) return null;
  const usage = result.usage ?? result.token_usage ?? result.tokenUsage;
  return recordOrNull(usage);
}
async function runTrackerGeneration(messages, userId, settings, parentSignal) {
  ensurePermission("generation", "generation is required to call the tracker model");
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
    const selectedConnection = await getSelectedConnectionProfile(settings, userId);
    const requestDiagnostics = buildTrackerGenerationRequest({
      messages,
      settings,
      selectedConnection,
      quietSupportsConnectionId: true,
      signal: controller.signal
    });
    const request = {
      ...requestDiagnostics.request,
      userId
    };
    if (requestDiagnostics.request.type === "raw" && !spindle.generate?.raw) {
      throw new Error("Lumiverse raw generation API is unavailable.");
    }
    if (requestDiagnostics.request.type === "quiet" && !spindle.generate?.quiet) {
      throw new Error("Lumiverse quiet generation API is unavailable.");
    }
    internalTrackerGenerationDepth += 1;
    const response = requestDiagnostics.request.type === "raw" ? await spindle.generate.raw(request) : await spindle.generate.quiet(request);
    return {
      text: normalizeGenerationText(response),
      response,
      requestDiagnostics
    };
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
  await spindle.userStorage.setJson(messageSnapshotPath(snapshot.chatId, snapshot.messageId, snapshot.swipeKey), snapshot, {
    indent: 2,
    userId
  });
}
async function saveMessageAttachedSnapshotWithIndex(snapshot, userId) {
  await saveMessageAttachedSnapshot(snapshot, userId);
  const storageKey = messageSnapshotPath(snapshot.chatId, snapshot.messageId, snapshot.swipeKey);
  const index = await loadMessageSnapshotIndex(snapshot.chatId, userId);
  const nextIndex = upsertMessageSnapshotIndexEntry(index, {
    messageId: snapshot.messageId,
    messageIndex: snapshot.messageIndex,
    swipeKey: snapshot.swipeKey,
    swipeIndex: snapshot.swipeIndex,
    swipeId: snapshot.swipeId,
    swipeContentHash: snapshot.swipeContentHash,
    swipeKeySource: snapshot.swipeKeySource,
    createdAt: snapshot.attachedAt,
    presetId: snapshot.presetId,
    presetName: snapshot.presetName,
    storageKey
  });
  await saveMessageSnapshotIndex(snapshot.chatId, nextIndex, userId);
  return nextIndex;
}
function shouldSaveSidecarSnapshot(settings) {
  return settings.messageDisplay.attachmentMode === "sidecar_snapshot" || settings.messageDisplay.attachmentMode === "both";
}
function shouldWriteEmbeddedTrackerTag(settings) {
  return settings.messageDisplay.attachmentMode === "embedded_tracker_tag" || settings.messageDisplay.attachmentMode === "both";
}
function resolveSwipeContentIndex(message, swipeKey) {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  const activeIndex = typeof message.swipe_id === "number" && Number.isInteger(message.swipe_id) ? Math.max(0, message.swipe_id) : 0;
  const activeIdentity = deriveSwipeTrackerIdentity(message.chat_id, message);
  if (activeIdentity.swipeKey === swipeKey) return Math.min(activeIndex, Math.max(0, swipes.length - 1));
  const indexMatch = /^index-(\d+)$/.exec(swipeKey);
  if (indexMatch) {
    const index = Number(indexMatch[1]);
    if (Number.isInteger(index) && index >= 0 && index < swipes.length) return index;
  }
  const hashMatch = /^hash-(.+)$/.exec(swipeKey);
  if (hashMatch) {
    const hash = hashMatch[1];
    const found = swipes.findIndex((content) => hashSwipeContent(content) === hash);
    if (found >= 0) return found;
  }
  return Math.min(activeIndex, Math.max(0, swipes.length - 1));
}
async function updateMessageSwipeContent(chatId, messageId, swipeKey, mutate) {
  const messages = await readChatMessages(chatId);
  const message = messages.find((item) => item.id === messageId);
  if (!message) throw new LTrackerStageError("read_messages", "Message not found for embedded tracker update.");
  if (message.is_user) throw new LTrackerStageError("read_messages", "Embedded tracker tags can only be written to assistant messages.");
  const swipes = Array.isArray(message.swipes) && message.swipes.length > 0 ? [...message.swipes] : [message.content ?? ""];
  const swipeIndex = resolveSwipeContentIndex(message, swipeKey);
  const current = swipes[swipeIndex] ?? message.content ?? "";
  const next = mutate(current);
  if (!next.changed || next.content === current) return { changed: false, swipeIndex };
  swipes[swipeIndex] = next.content;
  const patchSwipeIndex = typeof message.swipe_id === "number" && Number.isInteger(message.swipe_id) && message.swipe_id >= 0 && message.swipe_id < swipes.length ? message.swipe_id : swipeIndex;
  await spindle.chat.updateMessage(chatId, messageId, {
    swipes,
    swipe_id: patchSwipeIndex,
    skipChunkRebuild: true
  });
  return { changed: true, swipeIndex };
}
async function writeEmbeddedTrackerTag(attachedSnapshot, userId) {
  const jsonText = JSON.stringify(attachedSnapshot.snapshot.data, null, 2);
  await updateMessageSwipeContent(
    attachedSnapshot.chatId,
    attachedSnapshot.messageId,
    attachedSnapshot.swipeKey,
    (content) => {
      const next = upsertLTrackerTag(content, jsonText, attachedSnapshot.swipeKey, "append");
      return { content: next.content, changed: next.inserted || next.replaced };
    }
  );
  const diagnostics = {
    ...await loadDiagnostics(attachedSnapshot.chatId, userId),
    lastEmbeddedTagWriteAt: nowIso(),
    lastEmbeddedTagWriteMessageId: attachedSnapshot.messageId,
    lastEmbeddedTagWriteSwipeKey: attachedSnapshot.swipeKey,
    lastEmbeddedTagError: null
  };
  await tryPersistDiagnostics(diagnostics, userId);
}
async function removeEmbeddedTrackerTag(chatId, messageId, swipeKey, userId) {
  const result = await updateMessageSwipeContent(chatId, messageId, swipeKey, (content) => {
    const next = removeLTrackerTag(content, swipeKey);
    return { content: next.content, changed: next.removed };
  });
  if (!result.changed) return;
  const diagnostics = {
    ...await loadDiagnostics(chatId, userId),
    lastEmbeddedTagWriteAt: nowIso(),
    lastEmbeddedTagWriteMessageId: messageId,
    lastEmbeddedTagWriteSwipeKey: swipeKey,
    lastEmbeddedTagError: null
  };
  await tryPersistDiagnostics(diagnostics, userId);
}
function promptPreview(messages, maxChars = 64e3) {
  const rendered = messages.map((message) => {
    const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content, null, 2);
    return `## ${message.role}
${content}`;
  }).join("\n\n");
  return rendered.length > maxChars ? `${rendered.slice(0, Math.max(0, maxChars - 12))}
[truncated]` : rendered;
}
function sourceRange(ids) {
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0] ?? null;
  return `${ids[0]} -> ${ids[ids.length - 1]}`;
}
function newJobId() {
  return `job:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
function isCurrentJob(jobKey, jobId) {
  return activeJobs.get(jobKey)?.jobId === jobId;
}
function userChatKey(userId, chatId) {
  return `${userId}:${chatId}`;
}
function autoFinalizationKey(userId, chatId, messageId, swipeKey) {
  return `${userId}:${chatId}:${messageId}:${swipeKey}`;
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
function messageRole(message) {
  return message.is_user ? "user" : "assistant";
}
function createManualTrigger(requestId) {
  return { kind: "manual", requestId };
}
function createAutoTrigger(input) {
  const identity = deriveSwipeTrackerIdentity(input.message.chat_id, input.message);
  return {
    kind: "auto",
    requestId: input.requestId,
    eventType: input.eventType,
    sourceMessageId: input.message.id,
    sourceMessageIndex: input.message.index_in_chat,
    generationId: input.generationId ?? null,
    generationType: input.generationType ?? null,
    swipeKey: identity.swipeKey,
    swipeIndex: identity.swipeIndex,
    swipeId: identity.swipeId,
    swipeContentHash: identity.swipeContentHash,
    swipeKeySource: identity.swipeKeySource
  };
}
function createWidgetTrigger(input) {
  const identity = deriveSwipeTrackerIdentity(input.message.chat_id, input.message);
  if (input.swipeKey && input.swipeKey !== identity.swipeKey) {
    throw new LTrackerStageError("read_messages", "The selected swipe changed before tracker regeneration started.");
  }
  return {
    kind: "widget",
    requestId: input.requestId,
    sourceMessageId: input.message.id,
    sourceMessageIndex: input.message.index_in_chat,
    swipeKey: identity.swipeKey,
    swipeIndex: identity.swipeIndex,
    swipeId: identity.swipeId,
    swipeContentHash: identity.swipeContentHash,
    swipeKeySource: identity.swipeKeySource
  };
}
async function markAutoSkipped(chatId, userId, trigger, reason, eventAt = null) {
  const diagnostics = {
    ...await loadDiagnostics(chatId, userId),
    status: hasActiveJobForChat(chatId) ? "generating" : "idle",
    lastAutoEventAt: eventAt ?? nowIso(),
    lastAutoEventType: trigger.eventType,
    lastAutoSkippedReason: reason,
    lastAutoScheduledAt: null,
    lastAutoTriggeredAt: null,
    lastAutoSourceMessageId: trigger.sourceMessageId,
    lastAutoSourceMessageIndex: trigger.sourceMessageIndex,
    lastAutoGenerationId: trigger.generationId,
    lastAutoFinalizationSkippedReason: reason,
    pendingAutoFinalizationCount: pendingAutoFinalizations.size
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
    void markAutoSkipped(pending.chatId, pending.userId, pending.trigger, reason, pending.scheduledAt).catch((error) => spindle.log.warn(`LTracker could not record auto cancellation: ${errorMessage2(error)}`));
  }
}
function cancelPendingAutoFinalizationForChat(chatId, userId, reason) {
  for (const [key, pending] of pendingAutoFinalizations) {
    if (pending.chatId !== chatId) continue;
    if (userId && pending.userId !== userId) continue;
    clearTimeout(pending.timer);
    pendingAutoFinalizations.delete(key);
    void markAutoSkipped(pending.chatId, pending.userId, pending.trigger, reason, pending.scheduledAt).catch((error) => spindle.log.warn(`LTracker could not record auto finalization cancellation: ${errorMessage2(error)}`));
  }
}
async function cancelPendingAutoFinalizationForSwipeChange(input) {
  let cancelled = false;
  for (const [key, pending] of pendingAutoFinalizations) {
    if (pending.chatId !== input.chatId || pending.userId !== input.userId) continue;
    if (!shouldCancelPendingSwipe(
      { messageId: pending.messageId, swipeKey: pending.swipeKey },
      { messageId: input.messageId, swipeKey: input.nextSwipeKey },
      input.settings.autoTiming
    )) continue;
    clearTimeout(pending.timer);
    pendingAutoFinalizations.delete(key);
    cancelled = true;
  }
  if (cancelled) {
    const diagnostics = {
      ...await loadDiagnostics(input.chatId, input.userId),
      lastAutoFinalizationState: "cancelled_on_swipe_change",
      lastAutoFinalizationSkippedReason: "Selected swipe changed before tracker generation.",
      pendingAutoFinalizationCount: pendingAutoFinalizations.size,
      lastSwipeChangeCancelledPendingJob: true
    };
    await tryPersistDiagnostics(diagnostics, input.userId);
  }
  return cancelled;
}
function abortAutoJobForChat(chatId, reason) {
  for (const job of jobsForChat(chatId)) {
    if (job.sourceKind !== "auto") continue;
    job.cancelReason = reason;
    job.controller.abort();
  }
}
function rememberActiveChat(userId, chatId) {
  const previous = activeChatByUser.get(userId) ?? null;
  if (previous === chatId) return;
  if (previous) {
    const users = usersByChat.get(previous);
    users?.delete(userId);
    if (users?.size === 0) usersByChat.delete(previous);
    cancelPendingAutoForChat(previous, userId, "Chat changed before the auto timer fired.");
    cancelPendingAutoFinalizationForChat(previous, userId, "Chat changed before the auto tracker finalized.");
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
  return isRecord11(value) && typeof value.id === "string" && typeof value.chat_id === "string" && typeof value.index_in_chat === "number" && typeof value.is_user === "boolean" && typeof value.content === "string";
}
function messageFromEventPayload(payload) {
  if (isChatMessage(payload)) return payload;
  if (isRecord11(payload) && isChatMessage(payload.message)) return payload.message;
  return null;
}
async function queueAutoDebounce(input) {
  const key = userChatKey(input.userId, input.chatId);
  const existing = pendingAutoJobs.get(key);
  if (existing) clearTimeout(existing.timer);
  const scheduledAt = nowIso();
  const timer = setTimeout(() => {
    void runPendingAuto(key).catch((error) => {
      spindle.log.warn(`LTracker auto job failed: ${errorMessage2(error)}`);
    });
  }, input.settings.auto.autoDebounceMs);
  pendingAutoJobs.set(key, {
    timer,
    chatId: input.chatId,
    userId: input.userId,
    requestId: input.trigger.requestId,
    trigger: input.trigger,
    scheduledAt
  });
  const diagnostics = {
    ...await loadDiagnostics(input.chatId, input.userId),
    lastAutoEventAt: input.eventAt,
    lastAutoEventType: input.trigger.eventType,
    lastAutoSkippedReason: null,
    lastAutoScheduledAt: scheduledAt,
    lastAutoTriggeredAt: null,
    lastAutoSourceMessageId: input.trigger.sourceMessageId,
    lastAutoSourceMessageIndex: input.trigger.sourceMessageIndex,
    lastAutoGenerationId: input.trigger.generationId,
    lastAutoFinalizationState: input.finalizationState ?? "scheduled_after_finalization",
    lastAutoFinalizedAt: input.finalizationState ? nowIso() : null,
    lastAutoStableCheckAt: input.stablePassed === null || input.stablePassed === void 0 ? null : nowIso(),
    lastAutoStableCheckPassed: input.stablePassed ?? null,
    lastAutoContentStableHash: input.stableHash ?? null,
    lastAutoFinalizationSkippedReason: null,
    pendingAutoFinalizationCount: pendingAutoFinalizations.size
  };
  await tryPersistDiagnostics(diagnostics, input.userId);
  await sendState(input.chatId, input.userId, diagnostics.status, null, input.trigger.requestId);
}
async function readFinalizationTarget(chatId, messageId) {
  const messages = await readChatMessages(chatId);
  const message = messages.find((item) => item.id === messageId);
  if (!message) return null;
  const identity = deriveSwipeTrackerIdentity(chatId, message);
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  const activeIndex = typeof message.swipe_id === "number" && Number.isFinite(message.swipe_id) ? Math.max(0, Math.round(message.swipe_id)) : 0;
  const content = swipes[activeIndex] ?? message.content ?? "";
  return {
    message,
    snapshot: {
      messageId: message.id,
      swipeKey: identity.swipeKey,
      content
    }
  };
}
async function runAutoFinalization(key) {
  const pending = pendingAutoFinalizations.get(key);
  if (!pending) return;
  const settings = await getSettings(pending.userId);
  const markState = async (state, extra = {}) => {
    const diagnostics = {
      ...await loadDiagnostics(pending.chatId, pending.userId),
      lastAutoFinalizationState: state,
      lastAutoWaitingMessageId: pending.messageId,
      lastAutoWaitingSwipeKey: pending.swipeKey,
      pendingAutoFinalizationCount: pendingAutoFinalizations.size,
      ...extra
    };
    await tryPersistDiagnostics(diagnostics, pending.userId);
    await sendState(pending.chatId, pending.userId, diagnostics.status, null, pending.requestId);
  };
  await markState("settling_after_finalization");
  await delay(settings.autoTiming.postCompletionSettleMs);
  if (pendingAutoFinalizations.get(key) !== pending) return;
  const first = await readFinalizationTarget(pending.chatId, pending.messageId);
  await markState("stable_check");
  await delay(settings.autoTiming.stableContentCheckMs);
  if (pendingAutoFinalizations.get(key) !== pending) return;
  const second = await readFinalizationTarget(pending.chatId, pending.messageId);
  const decision = evaluateStableSwipeContent(first?.snapshot ?? null, second?.snapshot ?? null, settings.autoTiming);
  pendingAutoFinalizations.delete(key);
  if (!decision.passed || !second) {
    const diagnostics = {
      ...await loadDiagnostics(pending.chatId, pending.userId),
      lastAutoFinalizationState: "skipped",
      lastAutoStableCheckAt: nowIso(),
      lastAutoStableCheckPassed: false,
      lastAutoContentStableHash: decision.contentHash,
      lastAutoFinalizationSkippedReason: decision.skippedReason,
      lastAutoSkippedReason: decision.skippedReason,
      pendingAutoFinalizationCount: pendingAutoFinalizations.size
    };
    await tryPersistDiagnostics(diagnostics, pending.userId);
    await sendState(pending.chatId, pending.userId, diagnostics.status, null, pending.requestId);
    return;
  }
  const finalizedTrigger = createAutoTrigger({
    eventType: pending.trigger.eventType,
    requestId: pending.trigger.requestId,
    message: second.message,
    generationId: pending.trigger.generationId,
    generationType: pending.trigger.generationType
  });
  await queueAutoDebounce({
    chatId: pending.chatId,
    userId: pending.userId,
    eventAt: pending.eventAt,
    settings,
    trigger: finalizedTrigger,
    finalizationState: "finalized",
    stableHash: decision.contentHash,
    stablePassed: true
  });
}
async function queueAutoFinalization(input) {
  const key = autoFinalizationKey(input.userId, input.chatId, input.trigger.sourceMessageId, input.trigger.swipeKey);
  const existing = pendingAutoFinalizations.get(key);
  if (existing) clearTimeout(existing.timer);
  const scheduledAt = nowIso();
  const initialContent = input.message.content ?? "";
  const timer = setTimeout(() => {
    void runAutoFinalization(key).catch((error) => {
      spindle.log.warn(`LTracker auto finalization failed: ${errorMessage2(error)}`);
    });
  }, 0);
  pendingAutoFinalizations.set(key, {
    timer,
    chatId: input.chatId,
    userId: input.userId,
    requestId: input.trigger.requestId,
    trigger: input.trigger,
    scheduledAt,
    eventAt: input.eventAt,
    state: "waiting_for_message_finalization",
    messageId: input.trigger.sourceMessageId,
    swipeKey: input.trigger.swipeKey,
    initialContentHash: initialContent.trim() ? stableContentHash(initialContent) : null
  });
  const diagnostics = {
    ...await loadDiagnostics(input.chatId, input.userId),
    lastAutoEventAt: input.eventAt,
    lastAutoEventType: input.trigger.eventType,
    lastAutoSkippedReason: null,
    lastAutoScheduledAt: null,
    lastAutoTriggeredAt: null,
    lastAutoSourceMessageId: input.trigger.sourceMessageId,
    lastAutoSourceMessageIndex: input.trigger.sourceMessageIndex,
    lastAutoGenerationId: input.trigger.generationId,
    lastAutoFinalizationState: "waiting_for_message_finalization",
    lastAutoWaitingMessageId: input.trigger.sourceMessageId,
    lastAutoWaitingSwipeKey: input.trigger.swipeKey,
    lastAutoFinalizedAt: null,
    lastAutoStableCheckAt: null,
    lastAutoStableCheckPassed: null,
    lastAutoContentStableHash: stableContentHash(initialContent),
    lastAutoFinalizationSkippedReason: null,
    pendingAutoFinalizationCount: pendingAutoFinalizations.size,
    lastSwipeChangeCancelledPendingJob: false
  };
  await tryPersistDiagnostics(diagnostics, input.userId);
  await sendState(input.chatId, input.userId, diagnostics.status, null, input.trigger.requestId);
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
  const contextSkipReason = autoSkipReasonForContextFilters({
    settings,
    role: messageRole(sourceMessage),
    name: sourceMessage.name ?? "",
    content: sourceMessage.content ?? ""
  });
  if (contextSkipReason) {
    await markAutoSkipped(input.chatId, input.userId, trigger, contextSkipReason, input.eventAt);
    return;
  }
  const decision = shouldScheduleAutoTracker({
    settings,
    role: messageRole(sourceMessage),
    messageCount: messages.length,
    chatId: input.chatId,
    activeChatId: activeChatByUser.get(input.userId) ?? null,
    trackerGenerationRunning: hasActiveJobForChat(input.chatId)
  });
  if (!decision.shouldSchedule) {
    await markAutoSkipped(input.chatId, input.userId, trigger, decision.reason, input.eventAt);
    return;
  }
  if (settings.autoTiming.waitForAssistantFinalization && !sourceMessage.is_user) {
    await queueAutoFinalization({
      chatId: input.chatId,
      userId: input.userId,
      eventAt: input.eventAt,
      settings,
      trigger,
      message: sourceMessage
    });
    return;
  }
  await queueAutoDebounce({
    chatId: input.chatId,
    userId: input.userId,
    eventAt: input.eventAt,
    settings,
    trigger,
    finalizationState: null,
    stableHash: null,
    stablePassed: null
  });
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
  if (hasActiveJobForChat(pending.chatId)) {
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
async function handleGenerationStarted(payload, userId) {
  if (isQuietGenerationType(payload.generationType)) return;
  const users = targetUsersForChat(payload.chatId, userId);
  const eventAt = nowIso();
  for (const targetUserId of users) {
    const settings = await getSettings(targetUserId);
    if (!settings.auto.autoModeEnabled || !settings.autoTiming.waitForAssistantFinalization) continue;
    const targetMessageId = typeof payload.targetMessageId === "string" ? payload.targetMessageId : null;
    const diagnostics = {
      ...await loadDiagnostics(payload.chatId, targetUserId),
      lastAutoEventAt: eventAt,
      lastAutoGenerationId: payload.generationId,
      lastAutoFinalizationState: "waiting_for_message_finalization",
      lastAutoWaitingMessageId: targetMessageId,
      lastAutoWaitingSwipeKey: null,
      lastAutoFinalizationSkippedReason: null,
      pendingAutoFinalizationCount: pendingAutoFinalizations.size
    };
    await tryPersistDiagnostics(diagnostics, targetUserId);
    await sendState(payload.chatId, targetUserId, diagnostics.status, null);
  }
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
      const identity = defaultSwipeIdentity(payload.chatId, payload.messageId);
      const trigger = {
        kind: "auto",
        requestId: `auto:GENERATION_ENDED:${payload.messageId}:${Date.now()}`,
        eventType: "GENERATION_ENDED",
        sourceMessageId: payload.messageId,
        sourceMessageIndex: null,
        generationId: payload.generationId,
        generationType: payload.generationType ?? null,
        swipeKey: identity.swipeKey,
        swipeIndex: identity.swipeIndex,
        swipeId: identity.swipeId,
        swipeContentHash: identity.swipeContentHash,
        swipeKeySource: identity.swipeKeySource
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
async function handleMessageSwiped(payload, userId) {
  if (!isRecord11(payload) || !isChatMessage(payload.message) || typeof payload.chatId !== "string") return;
  const message = payload.message;
  const identity = deriveSwipeTrackerIdentity(payload.chatId, message);
  const users = targetUsersForChat(payload.chatId, userId);
  const eventAt = nowIso();
  for (const targetUserId of users) {
    const settings = await getSettings(targetUserId);
    const cancelledPending = await cancelPendingAutoFinalizationForSwipeChange({
      chatId: payload.chatId,
      userId: targetUserId,
      messageId: message.id,
      nextSwipeKey: identity.swipeKey,
      settings
    });
    const diagnostics = {
      ...await loadDiagnostics(payload.chatId, targetUserId),
      lastSwipeDetectedMessageId: message.id,
      lastSwipeKey: identity.swipeKey,
      lastSwipeKeySource: identity.swipeKeySource,
      lastSwipeChangeCancelledPendingJob: cancelledPending
    };
    await tryPersistDiagnostics(diagnostics, targetUserId);
    const action = typeof payload.action === "string" ? payload.action : null;
    if (!message.is_user && (action === "added" || action === "updated")) {
      await scheduleAutoForMessage({
        chatId: payload.chatId,
        userId: targetUserId,
        eventType: "GENERATION_ENDED",
        eventAt,
        message,
        generationId: null,
        generationType: "swipe"
      });
    } else {
      await sendState(payload.chatId, targetUserId, diagnostics.status, null);
    }
  }
}
async function handleSwipeEdited(payload, userId) {
  if (!isRecord11(payload) || !isChatMessage(payload.message) || typeof payload.chatId !== "string") return;
  await handleMessageSwiped({
    chatId: payload.chatId,
    message: payload.message,
    action: "updated"
  }, userId);
}
function handleChatSwitched(payload, userId) {
  if (!userId || !isRecord11(payload)) return;
  const chatId = typeof payload.chatId === "string" ? payload.chatId : null;
  rememberActiveChat(userId, chatId);
}
function stringAtPath2(value, path) {
  let current = value;
  for (const segment of path) {
    if (!isRecord11(current)) return null;
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
async function recordInterceptorDiagnostics(chatId, userId, settings, result) {
  const currentDiagnostics = await loadDiagnostics(chatId, userId);
  await tryPersistDiagnostics({
    ...currentDiagnostics,
    injectionEnabled: settings.injection.enabled,
    lastInjectionAt: result.injectedCount > 0 ? nowIso() : currentDiagnostics.lastInjectionAt,
    lastInjectionMode: null,
    lastInjectionFormat: settings.injection.format,
    lastInjectedChars: result.injectedChars,
    lastInjectionSkippedReason: result.skippedReason,
    interceptorRegistered,
    lastInterceptorAt: nowIso(),
    lastInterceptorInjectedCount: result.injectedCount,
    lastInterceptorInjectedChars: result.injectedChars,
    lastInterceptorStrippedCount: result.strippedCount,
    lastInterceptorSkippedReason: result.skippedReason,
    lastInterceptorError: result.error,
    lastInterceptorPromptTrackerCountBefore: result.promptTrackerCountBefore,
    lastInterceptorPromptTrackerCountAfter: result.promptTrackerCountAfter
  }, userId);
}
async function recordInterceptorSkipped(chatId, userId, reason, error = null) {
  if (!chatId || !userId) return;
  const currentDiagnostics = await loadDiagnostics(chatId, userId);
  await tryPersistDiagnostics({
    ...currentDiagnostics,
    interceptorRegistered,
    lastInterceptorAt: nowIso(),
    lastInterceptorInjectedCount: 0,
    lastInterceptorInjectedChars: 0,
    lastInterceptorStrippedCount: 0,
    lastInterceptorSkippedReason: reason,
    lastInterceptorError: error
  }, userId);
}
function promptMessagesForInjection(messages) {
  return messages.map((message) => ({ ...message }));
}
function ltrackerMessagesFromPrompt(messages) {
  return messages.map((message) => ({ ...message }));
}
function injectionMemorySettings(settings) {
  return {
    ...settings,
    memory: {
      ...settings.memory,
      enabled: true,
      includeInTrackerGeneration: true,
      retainCount: settings.injection.retainCount,
      fullSnapshotCount: settings.injection.retainCount,
      compactOlderSnapshots: false,
      maxMemoryChars: effectivePromptInjectionChars(settings),
      source: settings.memory.source,
      excludeTargetMessage: settings.memory.excludeTargetMessage,
      order: "oldest_to_newest",
      requireSamePreset: settings.memory.requireSamePreset,
      requireSameSwipeWhenAvailable: settings.memory.requireSameSwipeWhenAvailable
    }
  };
}
async function handlePromptInterceptor(messages, context) {
  if (disposed) return messages;
  if (shouldSkipContextForInternalGeneration(context, internalTrackerGenerationDepth > 0)) {
    const contextUser2 = contextUserId(context);
    const contextChat2 = contextChatId(context);
    await recordInterceptorSkipped(contextChat2, knownUserForContext(contextUser2, contextChat2), "Skipped quiet or internal LTracker generation.");
    return messages;
  }
  const contextUser = contextUserId(context);
  const contextChat = contextChatId(context);
  const userId = knownUserForContext(contextUser, contextChat);
  if (!userId) return messages;
  const chatId = await resolveContextChatId(context, userId);
  if (!chatId) return messages;
  rememberActiveChat(userId, chatId);
  try {
    const settings = await getSettings(userId);
    const presetState = await resolveActivePreset(chatId, userId);
    const injectionSettings2 = {
      ...settings.injection,
      maxInjectedChars: effectivePromptInjectionChars(settings)
    };
    if (!settings.injection.enabled) {
      const result2 = applyPromptInjection({
        messages: promptMessagesForInjection(messages),
        entries: [],
        settings: injectionSettings2
      });
      await recordInterceptorDiagnostics(chatId, userId, settings, result2);
      return messages;
    }
    const memorySettings = injectionMemorySettings(settings);
    const memory = await collectTrackerMemory(chatId, userId, memorySettings, presetState.activePreset);
    const result = applyPromptInjection({
      messages: promptMessagesForInjection(messages),
      entries: memory.entries,
      settings: injectionSettings2
    });
    await recordInterceptorDiagnostics(chatId, userId, settings, result);
    if (result.error) return messages;
    const response = {
      messages: ltrackerMessagesFromPrompt(result.messages)
    };
    if (result.breakdown.length > 0) response.breakdown = result.breakdown;
    return response;
  } catch (error) {
    await recordInterceptorSkipped(chatId, userId, "Prompt injection failed safely.", errorMessage2(error));
    return messages;
  }
}
async function handlePromptInterceptorFailSafe(messages, context) {
  try {
    const result = await withContextTimeout(handlePromptInterceptor(messages, context), 750);
    if (!result.timedOut) return result.value;
    const contextUser = contextUserId(context);
    const contextChat = contextChatId(context);
    await recordInterceptorSkipped(contextChat, knownUserForContext(contextUser, contextChat), "Prompt injection timed out.");
    return messages;
  } catch (error) {
    spindle.log.warn(`LTracker prompt interceptor failed safely: ${errorMessage2(error)}`);
    return messages;
  }
}
async function generateTracker(chatId, userId, trigger) {
  sweepStaleJobs(userId);
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
    abortJobsForChat(resolvedChatId, "Manual generation superseded this tracker job.");
  }
  if (trigger.kind === "auto" && hasActiveJobForChat(resolvedChatId)) {
    await markAutoSkipped(
      resolvedChatId,
      userId,
      trigger,
      "A tracker generation is already running for this chat.",
      nowIso()
    );
    return;
  }
  const jobKey = jobKeyForTrigger(resolvedChatId, trigger);
  if (trigger.kind === "widget") {
    const running = activeJobs.get(jobKey);
    if (running) {
      running.cancelReason = "Widget regeneration was cancelled.";
      running.controller.abort();
      return;
    }
  }
  const existing = activeJobs.get(jobKey);
  const lastCancellation = existing ? {
    jobId: existing.jobId,
    requestId: existing.requestId,
    reason: "Cancelled by a newer Generate Tracker request.",
    createdAt: nowIso()
  } : null;
  existing?.controller.abort();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const job = {
    controller: new AbortController(),
    chatId: resolvedChatId,
    jobKey,
    jobId: newJobId(),
    requestId,
    sourceKind: trigger.kind,
    startedAt
  };
  if (trigger.kind === "auto" || trigger.kind === "widget") {
    job.sourceMessageId = trigger.sourceMessageId;
    job.sourceMessageIndex = trigger.sourceMessageIndex;
    job.swipeKey = trigger.swipeKey;
    job.swipeIndex = trigger.swipeIndex;
    job.swipeId = trigger.swipeId;
    job.swipeContentHash = trigger.swipeContentHash;
    job.swipeKeySource = trigger.swipeKeySource;
  }
  const timeoutMs = Math.max(1e4, settings.generationTimeoutMs ?? 45e3);
  const timeoutId = setTimeout(() => {
    const running = activeJobs.get(jobKey);
    if (running && running.jobId === job.jobId) {
      running.cancelReason = "Tracker generation timed out.";
      void (async () => {
        const diags = await loadDiagnostics(resolvedChatId, userId);
        await tryPersistDiagnostics({
          ...diags,
          lastJobTimeoutAt: nowIso(),
          lastJobTimeoutJobId: job.jobId,
          lastJobTimeoutMessageId: trigger.kind === "manual" ? null : trigger.sourceMessageId,
          lastJobTimeoutSwipeKey: trigger.kind === "manual" ? null : trigger.swipeKey
        }, userId).catch(() => {
        });
      })();
      running.controller.abort();
    }
  }, timeoutMs);
  activeJobs.set(jobKey, job);
  let diagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    status: "generating",
    lastJobId: job.jobId,
    lastRequestId: requestId,
    lastGenerationSource: trigger.kind,
    lastGenerationStartedAt: startedAt,
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
    lastAutoTriggeredAt: trigger.kind === "auto" ? startedAt : null,
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
      lastAutoGenerationId: trigger.generationId,
      lastSwipeDetectedMessageId: trigger.sourceMessageId,
      lastSwipeKey: trigger.swipeKey,
      lastSwipeKeySource: trigger.swipeKeySource,
      activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId)
    };
  }
  if (trigger.kind === "widget") {
    diagnostics = {
      ...diagnostics,
      lastWidgetRegenerateMessageId: trigger.sourceMessageId,
      lastWidgetRegenerateStartedAt: startedAt,
      lastWidgetRegenerateCompletedAt: null,
      lastWidgetRegenerateDurationMs: null,
      lastWidgetRegenerateCancelledAt: null,
      lastWidgetRegenerateError: null,
      activeWidgetRegenerationCount: 1,
      lastSwipeDetectedMessageId: trigger.sourceMessageId,
      lastSwipeKey: trigger.swipeKey,
      lastSwipeKeySource: trigger.swipeKeySource,
      activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId)
    };
  }
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, "generating", null, requestId);
  try {
    stage = "read_messages";
    const rawMessages = await getMessagesForTrigger(resolvedChatId, settings, trigger);
    const transcriptMessages = normalizeMessages(rawMessages);
    if (transcriptMessages.length === 0) {
      throw new LTrackerStageError("read_messages", "This chat has no readable messages to track.");
    }
    const filterResult = applyContextFiltersToTranscript(transcriptMessages, settings.contextFilters);
    const filterExcludedEverything = settings.contextFilters.enabled && settings.contextFilters.includeChatMessages && filterResult.messageCount > 0 && filterResult.includedCount === 0;
    if (filterExcludedEverything && trigger.kind === "auto") {
      const skippedAt = nowIso();
      diagnostics = {
        ...diagnostics,
        status: "idle",
        lastGenerationCompletedAt: skippedAt,
        lastGenerationDurationMs: Date.now() - startedAtMs,
        lastAutoSkippedReason: "Context filters left no eligible chat messages.",
        lastError: null,
        ...contextFilterDiagnostics(filterResult),
        activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId)
      };
      if (isCurrentJob(jobKey, job.jobId)) activeJobs.delete(jobKey);
      await persistDiagnostics(diagnostics, userId);
      await sendState(resolvedChatId, userId, "idle", null, requestId);
      return;
    }
    const promptTranscriptMessages = filterExcludedEverything ? transcriptMessages : filterResult.includedMessages;
    const filterWarning = filterExcludedEverything ? "Context filters excluded every message; manual generation used the unfiltered transcript fallback." : filterResult.warning;
    const sourceMessageIds = rawMessages.map((message) => message.id);
    diagnostics = {
      ...diagnostics,
      lastMessagesRead: rawMessages.length,
      lastSourceMessageIds: sourceMessageIds,
      lastSourceMessageRange: sourceRange(sourceMessageIds),
      ...contextFilterDiagnostics({
        ...filterResult,
        warning: filterWarning
      })
    };
    stage = "prompt";
    const transcript = buildCompactTranscript(
      promptTranscriptMessages,
      effectivePerMessageChars(settings),
      effectiveRecentTranscriptChars(settings)
    );
    const memDiags = {};
    const contextAwareSettings = memorySettingsForContextFilters(settings);
    const memory = contextAwareSettings.memory.enabled && contextAwareSettings.memory.includeInTrackerGeneration ? await collectTrackerMemory(resolvedChatId, userId, contextAwareSettings, presetState.activePreset, trigger, memDiags) : {
      entries: [],
      renderedText: "",
      totalChars: 0,
      truncated: false,
      skippedReason: contextAwareSettings.memory.enabled ? "Tracker memory is not included in tracker generation." : "Tracker memory is disabled."
    };
    const worldLore = await collectWorldLoreContext(resolvedChatId, userId, settings);
    const characterContext = await collectCharacterContext(resolvedChatId, userId, settings);
    const personaContext = await collectPersonaContext(userId, settings);
    const contextBlocks = [worldLore.block, characterContext.block, personaContext.block].filter((block) => Boolean(block));
    const contextBudget = contextBudgetPreview([
      { key: "messages", label: "Chat transcript", text: transcript },
      { key: "memory", label: "Tracker memory", text: memory.renderedText },
      { key: "lore", label: "World/lore", text: worldLore.preview ?? "" },
      { key: "character", label: "Character context", text: characterContext.preview ?? "" },
      { key: "persona", label: "Persona/manual notes", text: personaContext.preview ?? "" }
    ]);
    const contextSummary = [
      formatContextFilterReport({ ...filterResult, warning: filterWarning }),
      "",
      "Context budget preview:",
      formatContextBudgetPreview(contextBudget),
      "",
      "Skipped source summary:",
      worldLore.skippedReason ? `World/lore: ${worldLore.skippedReason}` : null,
      characterContext.skippedReason ? `Character: ${characterContext.skippedReason}` : null,
      personaContext.skippedReason ? `Persona: ${personaContext.skippedReason}` : null
    ].filter((line) => typeof line === "string").join("\n");
    const promptMessages = buildTrackerPrompt(
      transcript,
      presetState.activePreset,
      memory.renderedText ? memory : null,
      {
        contextBlocks,
        filterSummary: contextSummary
      }
    );
    diagnostics = {
      ...diagnostics,
      lastPromptUsedPresetId: presetState.activePreset.id,
      lastPromptUsedPresetName: presetState.activePreset.name,
      lastMemoryIndexCount: memDiags.lastMemoryIndexCount ?? 0,
      lastMemoryCandidateCount: memDiags.lastMemoryCandidateCount ?? 0,
      lastMemoryLoadedSnapshotCount: memDiags.lastMemoryLoadedSnapshotCount ?? 0,
      lastMemoryLoadDurationMs: memDiags.lastMemoryLoadDurationMs ?? 0,
      lastMemoryLoadSkippedCount: memDiags.lastMemoryLoadSkippedCount ?? 0,
      lastMemoryEntryCount: memory.entries.length,
      lastMemoryChars: memory.totalChars,
      lastMemoryTruncated: memory.truncated,
      lastMemorySourceSummary: trackerMemorySourceSummary(memory.entries),
      lastMemorySkippedReason: memory.skippedReason,
      lastPromptIncludedMemory: Boolean(memory.renderedText),
      estimatedMemoryTokensLastRun: estimateTokensFromChars(memory.totalChars),
      lastIncludedContextChars: contextBudget.totalChars,
      lastIncludedContextTokens: contextBudget.totalEstimatedTokens,
      lastContextIncludedSourceSummary: contextSummary,
      lastIncludedContextPreview: contextBlocks.map((block) => `[${block.title}]
${block.text}`).join("\n\n") || null,
      worldLoreApiAvailable: Boolean(spindle.world_books?.getActivated),
      worldLorePermissionDeclared: spindle.permissions.has("world_books"),
      lastWorldLoreReadStatus: worldLore.status,
      lastWorldLoreEntriesConsidered: worldLore.considered,
      lastWorldLoreEntriesIncluded: worldLore.included,
      lastWorldLoreCharsIncluded: worldLore.chars,
      lastWorldLoreSkippedReason: worldLore.skippedReason,
      lastWorldLoreContextPreview: worldLore.preview,
      characterApiAvailable: Boolean(spindle.characters?.get),
      characterPermissionDeclared: spindle.permissions.has("characters"),
      lastCharacterContextReadStatus: characterContext.status,
      lastCharacterContextCharsIncluded: characterContext.chars,
      lastCharacterContextSkippedReason: characterContext.skippedReason,
      personaApiAvailable: Boolean(spindle.personas?.getActive),
      personaPermissionDeclared: spindle.permissions.has("personas"),
      lastPersonaContextReadStatus: personaContext.status,
      lastPersonaContextCharsIncluded: personaContext.chars,
      lastPersonaContextSkippedReason: personaContext.skippedReason,
      lastPromptPreview: settings.savePromptPreview ? promptPreview(promptMessages, effectivePromptPreviewChars(settings)) : "[Prompt preview saving disabled]"
    };
    diagnostics = {
      ...diagnostics,
      estimatedPromptTokensLastRun: settings.savePromptPreview ? estimateTokensFromChars((diagnostics.lastPromptPreview ?? "").length) : null
    };
    await tryPersistDiagnostics(diagnostics, userId);
    stage = "generation";
    const generation = await runTrackerGeneration(promptMessages, userId, settings, job.controller.signal);
    const rawOutput = generation.text;
    if (!isCurrentJob(jobKey, job.jobId)) return;
    const profileSelected = Boolean(settings.connection.selectedConnectionId);
    const modeUsed = generation.requestDiagnostics.modeUsed;
    const fallbackReason = generation.requestDiagnostics.fallbackReason;
    const cache = connectionProfilesByUser.get(userId) ?? { profiles: [] };
    const selectedAvailable = profileSelected && cache.profiles.some((p) => p.id === settings.connection.selectedConnectionId);
    let reason = "selected_profile_raw";
    if (!profileSelected) {
      reason = "fallback_active_no_selected_profile";
    } else if (!selectedAvailable) {
      reason = "fallback_active_selected_profile_missing";
    } else if (fallbackReason) {
      reason = "fallback_quiet_raw_unavailable";
    }
    const trackerProfileMissingAt = !selectedAvailable && profileSelected ? (/* @__PURE__ */ new Date()).toISOString() : diagnostics.lastTrackerProfileMissingAt ?? null;
    diagnostics = {
      ...diagnostics,
      lastRawOutput: settings.saveRawOutput ? rawOutput.slice(0, settings.budget.rawOutputMaxChars) : "[Raw output saving disabled]",
      lastGenerationConnectionModeUsed: generation.requestDiagnostics.modeUsed,
      lastGenerationConnectionIdUsed: generation.requestDiagnostics.connectionIdUsed,
      lastGenerationConnectionNameUsed: generation.requestDiagnostics.connectionNameUsed,
      lastGenerationConnectionFallbackReason: generation.requestDiagnostics.fallbackReason,
      lastGenerationParametersUsed: generation.requestDiagnostics.parametersUsed,
      lastReasoningOverrideUsed: generation.requestDiagnostics.reasoningOverrideUsed,
      connectionProfileSelected: profileSelected,
      effectiveTrackerConnectionMode: modeUsed,
      effectiveTrackerConnectionReason: reason,
      lastSelectedConnectionFallbackReason: fallbackReason,
      lastTrackerProfileMissingAt: trackerProfileMissingAt
    };
    stage = "parse";
    const data = parseTrackerJson(rawOutput);
    if (!isCurrentJob(jobKey, job.jobId)) return;
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
      if (isCurrentJob(jobKey, job.jobId)) activeJobs.delete(jobKey);
      diagnostics = {
        ...diagnostics,
        activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId)
      };
      await persistDiagnostics(diagnostics, userId);
      await sendState(resolvedChatId, userId, "idle", null, requestId);
      return;
    }
    const completedAtMs = Date.now();
    const completedAt = new Date(completedAtMs).toISOString();
    const presetRenderLock = capturePresetRenderLock(presetState.activePreset, completedAt);
    const snapshot = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      extensionVersion: EXTENSION_VERSION,
      chatId: resolvedChatId,
      createdAt: completedAt,
      messageCount: promptTranscriptMessages.length,
      sourceMessageIds,
      presetId: presetState.activePreset.id,
      presetName: presetState.activePreset.name,
      presetVersion: presetState.activePreset.version,
      generationStartedAt: startedAt,
      generationCompletedAt: completedAt,
      generationDurationMs: completedAtMs - startedAtMs,
      generationCancelledAt: null,
      generationStatus: "completed",
      presetRenderLock,
      data
    };
    stage = "storage";
    if (trigger.kind !== "widget") {
      await saveSnapshot(snapshot, userId);
    }
    diagnostics = {
      ...diagnostics,
      status: "idle",
      lastGenerationCompletedAt: completedAt,
      lastGenerationDurationMs: completedAtMs - startedAtMs,
      lastParsedTracker: data,
      lastError: null
    };
    if (trigger.kind === "auto" && settings.auto.attachSnapshotToMessage || trigger.kind === "widget") {
      const attachedAt = nowIso();
      const storageKey = messageSnapshotPath(resolvedChatId, trigger.sourceMessageId, trigger.swipeKey);
      const attachedSnapshot = {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        extensionVersion: EXTENSION_VERSION,
        chatId: resolvedChatId,
        messageId: trigger.sourceMessageId,
        messageIndex: trigger.sourceMessageIndex,
        swipeKey: trigger.swipeKey,
        swipeIndex: trigger.swipeIndex,
        swipeId: trigger.swipeId,
        swipeContentHash: trigger.swipeContentHash,
        swipeKeySource: trigger.swipeKeySource,
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name,
        presetVersion: presetState.activePreset.version,
        trigger,
        snapshot,
        attachedAt
      };
      let embeddedTagWriteAt = null;
      const index = shouldSaveSidecarSnapshot(settings) ? await saveMessageAttachedSnapshotWithIndex(attachedSnapshot, userId) : await loadMessageSnapshotIndex(resolvedChatId, userId);
      if (shouldWriteEmbeddedTrackerTag(settings)) {
        try {
          await writeEmbeddedTrackerTag(attachedSnapshot, userId);
          embeddedTagWriteAt = nowIso();
        } catch (error) {
          diagnostics = {
            ...diagnostics,
            lastEmbeddedTagError: errorMessage2(error)
          };
        }
      }
      diagnostics = {
        ...diagnostics,
        latestAttachedMessageId: trigger.sourceMessageId,
        latestAttachedMessageIndex: trigger.sourceMessageIndex,
        latestAttachedSnapshotAt: attachedAt,
        latestAttachedSnapshotStorageKey: shouldSaveSidecarSnapshot(settings) ? storageKey : null,
        messageSnapshotIndexCount: index.length,
        swipeTrackerIndexCount: index.length,
        lastSwipeDetectedMessageId: trigger.sourceMessageId,
        lastSwipeKey: trigger.swipeKey,
        lastSwipeKeySource: trigger.swipeKeySource,
        lastEmbeddedTagWriteAt: embeddedTagWriteAt ?? diagnostics.lastEmbeddedTagWriteAt,
        lastEmbeddedTagWriteMessageId: shouldWriteEmbeddedTrackerTag(settings) ? trigger.sourceMessageId : diagnostics.lastEmbeddedTagWriteMessageId,
        lastEmbeddedTagWriteSwipeKey: shouldWriteEmbeddedTrackerTag(settings) ? trigger.swipeKey : diagnostics.lastEmbeddedTagWriteSwipeKey,
        activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId)
      };
      if (trigger.kind === "widget") {
        diagnostics = {
          ...diagnostics,
          lastWidgetRegenerateMessageId: trigger.sourceMessageId,
          lastWidgetRegenerateCompletedAt: completedAt,
          lastWidgetRegenerateDurationMs: completedAtMs - startedAtMs,
          lastWidgetRegenerateCancelledAt: null,
          lastWidgetRegenerateError: null,
          activeWidgetRegenerationCount: 0,
          activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId)
        };
      }
    }
    if (isCurrentJob(jobKey, job.jobId)) activeJobs.delete(jobKey);
    diagnostics = {
      ...diagnostics,
      activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId)
    };
    await persistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId);
  } catch (error) {
    if (!isCurrentJob(jobKey, job.jobId)) return;
    if (job.controller.signal.aborted && job.cancelReason) {
      const completedAtMs2 = Date.now();
      const cancelledAt = new Date(completedAtMs2).toISOString();
      diagnostics = {
        ...diagnostics,
        status: "idle",
        lastGenerationCompletedAt: cancelledAt,
        lastGenerationDurationMs: completedAtMs2 - startedAtMs,
        lastCancellation: {
          jobId: job.jobId,
          requestId,
          reason: job.cancelReason,
          createdAt: cancelledAt
        },
        lastError: null
      };
      if (trigger.kind === "auto") {
        diagnostics = {
          ...diagnostics,
          lastAutoSkippedReason: job.cancelReason
        };
      }
      if (trigger.kind === "widget") {
        diagnostics = {
          ...diagnostics,
          lastWidgetRegenerateMessageId: trigger.sourceMessageId,
          lastWidgetRegenerateCompletedAt: null,
          lastWidgetRegenerateDurationMs: completedAtMs2 - startedAtMs,
          lastWidgetRegenerateCancelledAt: cancelledAt,
          lastWidgetRegenerateError: null,
          activeWidgetRegenerationCount: 0,
          activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId)
        };
      }
      if (isCurrentJob(jobKey, job.jobId)) activeJobs.delete(jobKey);
      diagnostics = {
        ...diagnostics,
        activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId)
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
    if (trigger.kind === "widget") {
      diagnostics = {
        ...diagnostics,
        lastWidgetRegenerateMessageId: trigger.sourceMessageId,
        lastWidgetRegenerateCompletedAt: new Date(completedAtMs).toISOString(),
        lastWidgetRegenerateDurationMs: completedAtMs - startedAtMs,
        lastWidgetRegenerateCancelledAt: null,
        lastWidgetRegenerateError: currentError.message,
        activeWidgetRegenerationCount: 0,
        activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId)
      };
    }
    if (isCurrentJob(jobKey, job.jobId)) activeJobs.delete(jobKey);
    diagnostics = {
      ...diagnostics,
      activeTrackerJobs: activeTrackerJobDiagnostics(resolvedChatId)
    };
    await tryPersistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "error", currentError, requestId);
  } finally {
    clearTimeout(timeoutId);
    if (isCurrentJob(jobKey, job.jobId)) activeJobs.delete(jobKey);
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
function textLength(value) {
  return Array.from(value).length;
}
async function renderTemplatePreview(chatId, userId, requestId, requestedSource) {
  const resolvedChatId = await resolveActiveChatId(chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  try {
    const settings = await getSettings(userId);
    const source = requestedSource ?? settings.renderer.previewSource;
    const diagnostics = await loadDiagnostics(resolvedChatId, userId);
    const presetState = await resolveActivePreset(resolvedChatId, userId);
    const snapshotSource = source === "latest_message_snapshot" ? await loadMessageSnapshot(resolvedChatId, diagnostics.latestAttachedMessageId, userId) : await loadSnapshot(resolvedChatId, userId);
    const snapshot = snapshotSource && "snapshot" in snapshotSource ? snapshotSource.snapshot : snapshotSource;
    const presetResolution = snapshot ? resolvePresetForSnapshot(snapshotSource, presetState.presets, presetState.activePreset) : null;
    const renderPreset = presetResolution?.preset ?? presetState.activePreset;
    if (!snapshot) {
      const preview2 = {
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name,
        snapshotCreatedAt: null,
        source,
        status: "no_snapshot",
        html: "",
        textFallback: "No tracker snapshot is available for the selected preview source.",
        warnings: [],
        errors: ["No tracker snapshot is available for the selected preview source."]
      };
      const updatedDiagnostics2 = {
        ...diagnostics,
        lastRenderAt: nowIso(),
        lastRenderPresetId: preview2.presetId,
        lastRenderPresetName: preview2.presetName,
        lastRenderPresetSource: null,
        lastRenderLockedPresetId: null,
        lastRenderLockedPresetName: null,
        lastRenderLockedPresetVersion: null,
        lastRenderPresetMismatchDetected: null,
        lastRenderPresetFallbackReason: null,
        lastRenderSnapshotCreatedAt: null,
        lastRenderSource: source,
        lastRenderStatus: preview2.status,
        lastRenderWarnings: preview2.warnings,
        lastRenderErrors: preview2.errors,
        lastSanitizedHtmlChars: 0,
        lastFallbackTextChars: textLength(preview2.textFallback)
      };
      await persistDiagnostics(updatedDiagnostics2, userId);
      await sendState(resolvedChatId, userId, "idle", null, requestId, preview2);
      return;
    }
    const template = renderPreset.htmlTemplate ?? "";
    const fallback = formatTemplateTextFallback(snapshot.data);
    let preview;
    if (!settings.renderer.enabled) {
      preview = {
        presetId: renderPreset.id,
        presetName: renderPreset.name,
        snapshotCreatedAt: snapshot.createdAt,
        source,
        status: "fallback",
        html: "",
        textFallback: fallback,
        warnings: [
          ...presetResolution?.warning ? [presetResolution.warning] : [],
          "Renderer preview is disabled in settings; showing text fallback."
        ],
        errors: []
      };
    } else if (!presetResolution?.preset && presetResolution?.source === "json_fallback_original_preset_missing") {
      preview = {
        presetId: presetResolution.lockedPresetId ?? "original-preset-unavailable",
        presetName: presetResolution.lockedPresetName ?? "Original preset unavailable",
        snapshotCreatedAt: snapshot.createdAt,
        source,
        status: "fallback",
        html: "",
        textFallback: fallback,
        warnings: [presetResolution.warning ?? "Original preset unavailable. Showing JSON fallback."],
        errors: []
      };
    } else {
      const result = renderHtmlTemplate({
        template,
        snapshotData: snapshot.data,
        presetId: renderPreset.id,
        presetName: renderPreset.name
      }, {
        missingValuePlaceholder: settings.renderer.missingValuePlaceholder,
        maxRenderedChars: settings.renderer.maxRenderedChars,
        allowInlineStyles: settings.renderer.allowInlineStyles,
        templateTrustMode: settings.renderer.templateTrustMode
      });
      const status = !template.trim() ? "no_template" : result.ok ? "rendered" : "error";
      preview = {
        presetId: renderPreset.id,
        presetName: renderPreset.name,
        snapshotCreatedAt: snapshot.createdAt,
        source,
        status,
        html: result.html,
        textFallback: result.textFallback,
        warnings: [
          ...presetResolution?.warning ? [presetResolution.warning] : [],
          ...result.warnings
        ],
        errors: result.errors
      };
    }
    const updatedDiagnostics = {
      ...diagnostics,
      lastRenderAt: nowIso(),
      lastRenderPresetId: preview.presetId,
      lastRenderPresetName: preview.presetName,
      lastRenderPresetSource: presetResolution?.source ?? null,
      lastRenderLockedPresetId: presetResolution?.lockedPresetId ?? null,
      lastRenderLockedPresetName: presetResolution?.lockedPresetName ?? null,
      lastRenderLockedPresetVersion: presetResolution?.lockedPresetVersion ?? null,
      lastRenderPresetMismatchDetected: presetResolution?.mismatchDetected ?? null,
      lastRenderPresetFallbackReason: presetResolution?.fallbackReason ?? null,
      lastRenderSnapshotCreatedAt: preview.snapshotCreatedAt,
      lastRenderSource: source,
      lastRenderStatus: preview.status,
      lastRenderWarnings: preview.warnings,
      lastRenderErrors: preview.errors,
      lastSanitizedHtmlChars: textLength(preview.html),
      lastFallbackTextChars: textLength(preview.textFallback)
    };
    await persistDiagnostics(updatedDiagnostics, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId, preview);
  } catch (error) {
    stageError("storage", error);
  }
}
function normalizePresetDraft(value) {
  const draft = {
    name: typeof value.name === "string" ? value.name : "",
    description: typeof value.description === "string" ? value.description : "",
    version: typeof value.version === "string" ? value.version : "1.0",
    jsonSchema: isRecord11(value.jsonSchema) && !Array.isArray(value.jsonSchema) ? value.jsonSchema : {},
    promptInstructions: typeof value.promptInstructions === "string" ? value.promptInstructions : ""
  };
  if (typeof value.id === "string") draft.id = value.id;
  if (typeof value.htmlTemplate === "string") draft.htmlTemplate = value.htmlTemplate;
  if (typeof value.ownerPowerScript === "string") draft.ownerPowerScript = value.ownerPowerScript;
  const ownerPowerManifest = repairOwnerPowerManifest(value.ownerPowerManifest);
  if (ownerPowerManifest) draft.ownerPowerManifest = ownerPowerManifest;
  if (typeof value.notes === "string") draft.notes = value.notes;
  if (isRecord11(value.capabilities)) {
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
async function selectPreset(chatId, userId, presetId2, requestId) {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  const presets = await loadPresetCatalog(userId);
  const selected = presetById(presets, presetId2);
  if (!selected) throw new Error(`Preset ${presetId2} was not found.`);
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
async function deletePreset(chatId, userId, presetId2, requestId) {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  const presets = await loadPresetCatalog(userId);
  const preset = presetById(presets, presetId2);
  if (!preset) throw new Error("Preset to delete was not found.");
  if (!canModifyPreset(preset)) throw new Error("Built-in presets cannot be deleted.");
  await deleteUserPreset(presetId2, userId);
  const active = await loadActivePresetState(resolvedChatId, userId);
  if (active.selectedPresetId === presetId2) {
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
  const settings = await getSettings(userId);
  if (importText.length > settings.budget.presetImportMaxChars) {
    const message = `Import payload size (${importText.length} characters) exceeds the size limit of ${settings.budget.presetImportMaxChars} characters.`;
    await recordPresetDiagnostic(resolvedChatId, userId, {
      lastPresetValidationError: message,
      lastPresetFallbackReason: null
    });
    throw new Error(message);
  }
  let parsed;
  try {
    parsed = JSON.parse(importText);
  } catch (error) {
    const message = `Import JSON is invalid: ${errorMessage2(error)}`;
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
async function exportPresetPackHandler(chatId, userId, options, requestId) {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  const presets = await loadPresetCatalog(userId);
  const activeState = await loadActivePresetState(resolvedChatId, userId);
  const activePreset = presetById(presets, activeState.selectedPresetId) ?? DEFAULT_TRACKER_PRESET;
  const settings = await getSettings(userId);
  const now = nowIso();
  let exampleSnapshot;
  if (options.includeExampleSnapshot) {
    const latestSnapshot = await loadSnapshot(resolvedChatId, userId);
    if (latestSnapshot && latestSnapshot.data) {
      exampleSnapshot = latestSnapshot.data;
    }
  }
  const exportOpts = {};
  if (options.includeRecommendedSettings !== void 0) {
    exportOpts.includeRecommendedSettings = options.includeRecommendedSettings;
  }
  if (settings !== void 0) {
    exportOpts.settings = settings;
  }
  if (exampleSnapshot !== void 0) {
    exportOpts.exampleSnapshot = exampleSnapshot;
  }
  const pack = exportPresetPack(activePreset, exportOpts);
  const jsonStr = JSON.stringify(pack, null, 2);
  const fileName = sanitizePackFileName(activePreset.name, activePreset.version);
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetPackExportAt: now,
    lastPresetPackExportName: fileName
  });
  const response = {
    type: "preset_pack_export_ready",
    json: jsonStr,
    fileName,
    requestId
  };
  send(response, userId);
}
async function importPresetPackHandler(chatId, userId, importText, options, requestId) {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  const settings = await getSettings(userId);
  const now = nowIso();
  if (importText.length > settings.budget.presetImportMaxChars) {
    const errorMsg = `Import payload size (${importText.length} characters) exceeds the size limit of ${settings.budget.presetImportMaxChars} characters.`;
    await recordPresetDiagnostic(resolvedChatId, userId, {
      lastPresetValidationError: errorMsg,
      lastPresetFallbackReason: null,
      lastPresetPackImportAt: now,
      lastPresetPackImportStatus: "error",
      lastPresetPackImportError: errorMsg,
      lastPresetPackImportSizeChars: importText.length,
      lastPresetPackImportEstimatedTokens: null
    });
    throw new Error(errorMsg);
  }
  let parsed;
  try {
    parsed = JSON.parse(importText);
  } catch (error) {
    const errorMsg = `Import JSON is invalid: ${error instanceof Error ? error.message : String(error)}`;
    await recordPresetDiagnostic(resolvedChatId, userId, {
      lastPresetValidationError: errorMsg,
      lastPresetFallbackReason: null,
      lastPresetPackImportAt: now,
      lastPresetPackImportStatus: "error",
      lastPresetPackImportError: errorMsg,
      lastPresetPackImportSizeChars: importText.length,
      lastPresetPackImportEstimatedTokens: null
    });
    throw new Error(errorMsg);
  }
  const presets = await loadPresetCatalog(userId);
  const existingIds = presets.map((p) => p.id);
  const result = importPresetPack(parsed, existingIds, now);
  if (!result.ok || !result.preset) {
    const errorMsg = result.error ?? "Imported preset is invalid.";
    await recordPresetDiagnostic(resolvedChatId, userId, {
      lastPresetValidationError: errorMsg,
      lastPresetFallbackReason: null,
      lastPresetPackImportAt: now,
      lastPresetPackImportStatus: "error",
      lastPresetPackImportError: errorMsg,
      lastPresetPackImportSizeChars: importText.length,
      lastPresetPackImportEstimatedTokens: null
    });
    throw new Error(errorMsg);
  }
  const importedPreset = result.preset;
  const importedOwnerPowerSummary = ownerPowerFeatureSummary(importedPreset);
  const ownerPowerImportWarning = result.warnings.find((warning) => /Owner Power|script|Dev Mode/i.test(warning)) ?? null;
  if (options.presetName && options.presetName.trim()) {
    importedPreset.name = options.presetName.trim();
  }
  if (options.overwritePresetId) {
    if (options.overwritePresetId === DEFAULT_TRACKER_PRESET_ID) {
      throw new Error("Built-in presets cannot be overwritten.");
    }
    const toOverwrite = presets.find((p) => p.id === options.overwritePresetId);
    if (!toOverwrite) {
      throw new Error(`Preset to overwrite was not found: ${options.overwritePresetId}`);
    }
    if (toOverwrite.origin === "built_in") {
      throw new Error("Built-in presets cannot be overwritten.");
    }
    importedPreset.id = options.overwritePresetId;
  }
  if (options.trustMode === "trusted" || options.trustMode === "safe") {
    settings.renderer.templateTrustMode = options.trustMode;
    await saveSettings(settings, userId);
  }
  if (options.applyRecommendedSettings && result.recommendedSettings) {
    const rec = result.recommendedSettings;
    if (rec.connection) {
      const conn = rec.connection;
      if (conn.mode) settings.connection.mode = conn.mode;
      if (typeof conn.parameters?.temperature === "number") settings.connection.parameters.temperature = conn.parameters.temperature;
      if (typeof conn.parameters?.max_tokens === "number") settings.connection.parameters.max_tokens = conn.parameters.max_tokens;
      if (conn.reasoning) {
        if (conn.reasoning.source) settings.connection.reasoning.source = conn.reasoning.source;
        if (conn.reasoning.effort) settings.connection.reasoning.effort = conn.reasoning.effort;
      }
    }
    if (rec.memory) {
      const mem = rec.memory;
      if (typeof mem.enabled === "boolean") settings.memory.enabled = mem.enabled;
      if (typeof mem.includeInTrackerGeneration === "boolean") settings.memory.includeInTrackerGeneration = mem.includeInTrackerGeneration;
      if (typeof mem.retainCount === "number") settings.memory.retainCount = mem.retainCount;
      if (typeof mem.fullSnapshotCount === "number") settings.memory.fullSnapshotCount = mem.fullSnapshotCount;
      if (typeof mem.compactOlderSnapshots === "boolean") settings.memory.compactOlderSnapshots = mem.compactOlderSnapshots;
      if (typeof mem.maxMemoryChars === "number") settings.memory.maxMemoryChars = mem.maxMemoryChars;
      if (mem.source) settings.memory.source = mem.source;
      if (mem.order) settings.memory.order = mem.order;
    }
    if (rec.injection) {
      const inj = rec.injection;
      if (typeof inj.enabled === "boolean") settings.injection.enabled = inj.enabled;
      if (inj.format) settings.injection.format = inj.format;
      if (typeof inj.retainCount === "number") settings.injection.retainCount = inj.retainCount;
      if (inj.injectionPlacement) settings.injection.injectionPlacement = inj.injectionPlacement;
      if (typeof inj.maxInjectedChars === "number") settings.injection.maxInjectedChars = inj.maxInjectedChars;
    }
    if (rec.renderer) {
      const ren = rec.renderer;
      if (typeof ren.enabled === "boolean") settings.renderer.enabled = ren.enabled;
      if (ren.previewSource) settings.renderer.previewSource = ren.previewSource;
      if (typeof ren.maxRenderedChars === "number") settings.renderer.maxRenderedChars = ren.maxRenderedChars;
    }
    if (rec.messageDisplay) {
      const disp = rec.messageDisplay;
      if (typeof disp.enabled === "boolean") settings.messageDisplay.enabled = disp.enabled;
      if (typeof disp.useDomInjection === "boolean") settings.messageDisplay.useDomInjection = disp.useDomInjection;
      if (disp.displayMode) settings.messageDisplay.displayMode = disp.displayMode;
      if (disp.displaySurface) settings.messageDisplay.displaySurface = disp.displaySurface;
      if (disp.placement) settings.messageDisplay.placement = disp.placement;
      if (disp.renderMode) settings.messageDisplay.renderMode = disp.renderMode;
      if (typeof disp.showTimestamp === "boolean") settings.messageDisplay.showTimestamp = disp.showTimestamp;
      if (typeof disp.showPresetName === "boolean") settings.messageDisplay.showPresetName = disp.showPresetName;
      settings.messageDisplay.showGenerationDuration = true;
      if (typeof disp.maxRenderedChars === "number") settings.messageDisplay.maxRenderedChars = disp.maxRenderedChars;
    }
    if (rec.expandedWidth) {
      const w = rec.expandedWidth;
      if (w.expandedWidthMode) settings.expandedWidth.expandedWidthMode = w.expandedWidthMode;
      if (typeof w.maxExpandedWidthPx === "number") settings.expandedWidth.maxExpandedWidthPx = w.maxExpandedWidthPx;
      if (typeof w.mobileHorizontalMarginPx === "number") settings.expandedWidth.mobileHorizontalMarginPx = w.mobileHorizontalMarginPx;
      if (typeof w.expandedContentMaxHeightVh === "number") settings.expandedWidth.expandedContentMaxHeightVh = w.expandedContentMaxHeightVh;
    }
    if (rec.budget) {
      const b = rec.budget;
      if (b.mode) settings.budget.mode = b.mode;
      if (typeof b.ultraModeEnabled === "boolean") settings.budget.ultraModeEnabled = b.ultraModeEnabled;
      if (typeof b.maxTrackerOutputTokens === "number") settings.budget.maxTrackerOutputTokens = b.maxTrackerOutputTokens;
      if (typeof b.renderedHtmlMaxChars === "number") settings.budget.renderedHtmlMaxChars = b.renderedHtmlMaxChars;
    }
    await saveSettings(settings, userId);
  }
  await saveUserPreset(importedPreset, userId);
  await saveActivePresetState(resolvedChatId, importedPreset.id, userId);
  const stats = estimatePresetStats(importedPreset);
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetValidationError: null,
    lastPresetFallbackReason: null,
    lastPresetPackImportAt: now,
    lastPresetPackImportStatus: "success",
    lastPresetPackImportError: null,
    lastPresetPackImportSizeChars: importText.length,
    lastPresetPackImportEstimatedTokens: stats.estimatedTokens,
    activePresetRequestedOwnerPower: importedOwnerPowerSummary.requested,
    activePresetHasOwnerPowerScript: importedOwnerPowerSummary.hasScript,
    lastOwnerPowerImportWarning: ownerPowerImportWarning,
    lastOwnerPowerSanitizerAction: importedOwnerPowerSummary.hasScript ? "Owner Power script source imported inertly; sanitized rendering remains script-free." : null
  });
  await sendState(resolvedChatId, userId, "idle", null, requestId);
}
async function validatePresetReportHandler(chatId, userId, draftValue, requestId) {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  const draft = normalizePresetDraft(draftValue);
  const settings = await getSettings(userId);
  const report = validatePresetReport(draft, {
    allowInlineStyles: settings.renderer.allowInlineStyles,
    maxRenderedChars: settings.renderer.maxRenderedChars
  });
  const now = nowIso();
  const errorMsg = report.ok ? null : "Preset validation failed.";
  await recordPresetDiagnostic(resolvedChatId, userId, {
    lastPresetValidationError: errorMsg,
    lastPresetFallbackReason: null,
    lastPresetValidationAt: now,
    lastPresetValidationStatus: report.ok ? "success" : "error",
    lastPresetValidationErrorCount: report.errorCount,
    lastPresetValidationWarningCount: report.warningCount,
    lastPresetValidationEstimatedTokens: report.estimatedPromptTokens,
    lastPresetValidationEstimatedRenderedChars: report.estimatedRenderedChars,
    lastPresetLintAt: now,
    lastPresetLintWarningCount: report.warningCount,
    lastPresetLintErrorCount: report.errorCount,
    lastPresetLintRawObjectPaths: [...report.rawObjectInterpolationPaths, ...report.rawArrayInterpolationPaths],
    lastPresetLintMobileRiskCount: report.mobileRiskWarnings.length + report.verticalTextRiskWarnings.length
  });
  const response = {
    type: "preset_pack_validation_report",
    report,
    requestId
  };
  send(response, userId);
}
async function generateSampleSnapshotHandler(chatId, userId, sampleMode, requestId) {
  const resolvedChatId = await presetOperationChatId(chatId, userId);
  const presets = await loadPresetCatalog(userId);
  const activeState = await loadActivePresetState(resolvedChatId, userId);
  const activePreset = presetById(presets, activeState.selectedPresetId) ?? DEFAULT_TRACKER_PRESET;
  const settings = await getSettings(userId);
  const snapshotData = generateSampleSnapshot(activePreset.jsonSchema, sampleMode ?? "normal");
  let renderResult = null;
  if (activePreset.htmlTemplate?.trim()) {
    renderResult = renderHtmlTemplate(
      {
        template: activePreset.htmlTemplate,
        snapshotData,
        presetId: activePreset.id,
        presetName: activePreset.name
      },
      {
        allowInlineStyles: settings.renderer.allowInlineStyles,
        templateTrustMode: settings.renderer.templateTrustMode,
        maxRenderedChars: settings.renderer.maxRenderedChars,
        deduplicateWarnings: true
      }
    );
  }
  const response = {
    type: "sample_snapshot_ready",
    snapshot: snapshotData,
    renderResult,
    requestId
  };
  send(response, userId);
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
  await sendState(resolvedChatId, userId, void 0, null, void 0, null, payload.historyLimit);
}
async function handleConnectionRefresh(payload, userId) {
  const resolvedChatId = payload.chatId ? payload.chatId : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  try {
    await refreshConnectionProfiles(userId, resolvedChatId);
  } catch (error) {
    spindle.log.warn(`LTracker connection refresh failed: ${errorMessage2(error)}`);
  }
  await sendState(resolvedChatId, userId, void 0, null, payload.requestId);
}
async function testTrackerConnection(payload, userId) {
  const resolvedChatId = payload.chatId ? payload.chatId : await resolveActiveChatId(payload.chatId, userId).catch(() => activeChatByUser.get(userId) ?? null);
  rememberActiveChat(userId, resolvedChatId);
  const existing = connectionTestJobs.get(userId);
  existing?.controller.abort();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const job = {
    controller: new AbortController(),
    requestId: payload.requestId,
    startedAtMs
  };
  connectionTestJobs.set(userId, job);
  const settings = payload.settings ? await saveSettings(payload.settings, userId) : await getSettings(userId);
  let diagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    lastConnectionTestAt: startedAt,
    lastConnectionTestStatus: "running",
    lastConnectionTestDurationMs: null,
    lastConnectionTestError: null,
    lastConnectionTestOutputPreview: null,
    lastConnectionTestFinishReason: null,
    lastConnectionTestUsage: null,
    connectionMode: settings.connection.mode,
    selectedConnectionId: settings.connection.selectedConnectionId,
    selectedConnectionName: settings.connection.selectedConnectionName
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, void 0, null, payload.requestId);
  try {
    const prompt = settings.connection.testPrompt.trim() || TRACKER_CONNECTION_DEFAULT_TEST_PROMPT;
    const generation = await runTrackerGeneration([
      {
        role: "user",
        content: prompt
      }
    ], userId, settings, job.controller.signal);
    if (connectionTestJobs.get(userId) !== job) return;
    const completedAtMs = Date.now();
    const profileSelected = Boolean(settings.connection.selectedConnectionId);
    const modeUsed = generation.requestDiagnostics.modeUsed;
    const fallbackReason = generation.requestDiagnostics.fallbackReason;
    const cache = connectionProfilesByUser.get(userId) ?? { profiles: [] };
    const selectedAvailable = profileSelected && cache.profiles.some((p) => p.id === settings.connection.selectedConnectionId);
    let reason = "selected_profile_raw";
    if (!profileSelected) {
      reason = "fallback_active_no_selected_profile";
    } else if (!selectedAvailable) {
      reason = "fallback_active_selected_profile_missing";
    } else if (fallbackReason) {
      reason = "fallback_quiet_raw_unavailable";
    }
    const trackerProfileMissingAt = !selectedAvailable && profileSelected ? (/* @__PURE__ */ new Date()).toISOString() : diagnostics.lastTrackerProfileMissingAt ?? null;
    diagnostics = {
      ...diagnostics,
      lastConnectionTestAt: new Date(completedAtMs).toISOString(),
      lastConnectionTestStatus: "success",
      lastConnectionTestDurationMs: completedAtMs - startedAtMs,
      lastConnectionTestError: null,
      lastConnectionTestOutputPreview: generation.text.slice(0, 500),
      lastConnectionTestFinishReason: generationFinishReason(generation.response),
      lastConnectionTestUsage: generationUsage(generation.response),
      lastGenerationConnectionModeUsed: generation.requestDiagnostics.modeUsed,
      lastGenerationConnectionIdUsed: generation.requestDiagnostics.connectionIdUsed,
      lastGenerationConnectionNameUsed: generation.requestDiagnostics.connectionNameUsed,
      lastGenerationConnectionFallbackReason: generation.requestDiagnostics.fallbackReason,
      lastGenerationParametersUsed: generation.requestDiagnostics.parametersUsed,
      lastReasoningOverrideUsed: generation.requestDiagnostics.reasoningOverrideUsed,
      connectionProfileSelected: profileSelected,
      effectiveTrackerConnectionMode: modeUsed,
      effectiveTrackerConnectionReason: reason,
      lastSelectedConnectionFallbackReason: fallbackReason,
      lastTrackerProfileMissingAt: trackerProfileMissingAt
    };
    await tryPersistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, void 0, null, payload.requestId);
  } catch (error) {
    if (connectionTestJobs.get(userId) !== job) return;
    const completedAtMs = Date.now();
    const cancelled = job.controller.signal.aborted;
    diagnostics = {
      ...diagnostics,
      lastConnectionTestAt: new Date(completedAtMs).toISOString(),
      lastConnectionTestStatus: cancelled ? "cancelled" : "error",
      lastConnectionTestDurationMs: completedAtMs - startedAtMs,
      lastConnectionTestError: cancelled ? null : errorMessage2(error)
    };
    await tryPersistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, void 0, null, payload.requestId);
  } finally {
    if (connectionTestJobs.get(userId) === job) connectionTestJobs.delete(userId);
  }
}
async function cancelConnectionTest(payload, userId) {
  const resolvedChatId = payload.chatId ? payload.chatId : await resolveActiveChatId(payload.chatId, userId).catch(() => activeChatByUser.get(userId) ?? null);
  rememberActiveChat(userId, resolvedChatId);
  const job = connectionTestJobs.get(userId);
  if (job) job.controller.abort();
  await sendState(resolvedChatId, userId, void 0, null, payload.requestId);
}
async function regenerateMessageTracker(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const messages = await readChatMessages(resolvedChatId);
  const message = messages.find((item) => item.id === payload.messageId);
  if (!message) {
    throw new LTrackerStageError("read_messages", "The selected message was not found for regeneration.");
  }
  if (message.is_user) {
    throw new LTrackerStageError("read_messages", "Message tracker regeneration is only available for assistant messages.");
  }
  await generateTracker(resolvedChatId, userId, createWidgetTrigger({
    requestId: payload.requestId,
    message,
    swipeKey: payload.swipeKey ?? null
  }));
}
async function deleteMessageTracker(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  let existingSnapshot = null;
  let embeddedTagContent = null;
  try {
    existingSnapshot = await loadMessageSnapshot(resolvedChatId, payload.messageId, userId, payload.swipeKey);
    const messages = await readChatMessages(resolvedChatId);
    const msg = messages.find((m) => m.id === payload.messageId);
    if (msg) {
      const swipeIndex = resolveSwipeContentIndex(msg, payload.swipeKey);
      const swipeContent = msg.swipes?.[swipeIndex] ?? null;
      if (swipeContent) {
        const matches = findLTrackerTags(swipeContent);
        const match = matches[0];
        if (match) {
          embeddedTagContent = match.fullMatch;
        }
      }
    }
  } catch (err) {
  }
  if (existingSnapshot) {
    const key = `${userId}:${resolvedChatId}:${payload.messageId}:${payload.swipeKey}`;
    recentlyDeletedSnapshots.set(key, {
      snapshot: existingSnapshot,
      embeddedTagContent,
      deletedAt: Date.now()
    });
    cleanRecentlyDeletedSnapshots();
  }
  const path = messageSnapshotPath(resolvedChatId, payload.messageId, payload.swipeKey);
  if (await spindle.userStorage.exists(path, userId)) {
    await spindle.userStorage.delete(path, userId);
  }
  if (payload.swipeKey === DEFAULT_SWIPE_KEY) {
    const legacyPath = legacyMessageSnapshotPath(resolvedChatId, payload.messageId);
    if (await spindle.userStorage.exists(legacyPath, userId)) {
      await spindle.userStorage.delete(legacyPath, userId);
    }
  }
  const index = await loadMessageSnapshotIndex(resolvedChatId, userId);
  const nextIndex = removeMessageSnapshotIndexEntry(index, payload.messageId, payload.swipeKey);
  await saveMessageSnapshotIndex(resolvedChatId, nextIndex, userId);
  const settings = await getSettings(userId);
  if (shouldWriteEmbeddedTrackerTag(settings)) {
    try {
      await removeEmbeddedTrackerTag(resolvedChatId, payload.messageId, payload.swipeKey, userId);
    } catch (error) {
      await tryPersistDiagnostics({
        ...await loadDiagnostics(resolvedChatId, userId),
        lastEmbeddedTagError: errorMessage2(error)
      }, userId);
    }
  }
  const diagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    lastDeletedTrackerMessageId: payload.messageId,
    lastDeletedTrackerSwipeKey: payload.swipeKey,
    messageSnapshotIndexCount: nextIndex.length,
    swipeTrackerIndexCount: nextIndex.length,
    lastError: null
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function cleanupDuplicateHistory(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const rawIndex = await spindle.userStorage.getJson(messageSnapshotIndexPath(resolvedChatId), { fallback: [], userId });
  const repaired = repairMessageSnapshotIndexKeepingNewest(rawIndex);
  await saveMessageSnapshotIndex(resolvedChatId, repaired.index, userId);
  const report = await buildMaintenanceReport(resolvedChatId, userId);
  const diagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    lastHistoryCleanupAt: nowIso(),
    lastHistoryGroupedCount: repaired.index.length,
    lastHistoryDuplicateCount: repaired.duplicateCount,
    messageSnapshotIndexCount: repaired.index.length,
    swipeTrackerIndexCount: repaired.index.length,
    lastHealthCheckAt: report.createdAt,
    lastHealthCheckStatus: report.status,
    lastMaintenanceActionAt: report.createdAt,
    lastMaintenanceAction: "cleanup_duplicate_history",
    lastMaintenanceReport: {
      ...report,
      repairedCount: repaired.duplicateCount
    },
    lastError: null
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
function maintenanceSeverityRank(severity) {
  if (severity === "error") return 3;
  if (severity === "repairable") return 2;
  if (severity === "warning") return 1;
  return 0;
}
function possibleSwipeKeysForMessage(chatId, message) {
  const keys = /* @__PURE__ */ new Set([DEFAULT_SWIPE_KEY, deriveSwipeTrackerIdentity(chatId, message).swipeKey]);
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  for (let index = 0; index < swipes.length; index += 1) {
    keys.add(`index-${index}`);
    const content = swipes[index];
    if (typeof content === "string" && content) keys.add(`hash-${hashSwipeContent(content)}`);
  }
  return [...keys];
}
function presetMatchForSnapshot(snapshot, presets) {
  const presetId2 = snapshot.presetId ?? snapshot.snapshot.presetId;
  if (presetId2) {
    const byId = presets.find((preset) => preset.id === presetId2) ?? null;
    if (byId) return byId;
  }
  const presetName2 = snapshot.presetName ?? snapshot.snapshot.presetName;
  const presetVersion = snapshot.presetVersion ?? snapshot.snapshot.presetVersion;
  if (!presetName2 || !presetVersion) return null;
  return presets.find((preset) => preset.name === presetName2 && preset.version === presetVersion) ?? null;
}
function buildMaintenanceSummary(report) {
  if (report.counts.error > 0) return `${report.counts.error} error(s), ${report.counts.repairable} repairable item(s), ${report.counts.warning} warning(s).`;
  if (report.counts.repairable > 0) return `${report.counts.repairable} repairable item(s), ${report.counts.warning} warning(s).`;
  if (report.counts.warning > 0) return `${report.counts.warning} warning(s).`;
  return "No LTracker maintenance issues found.";
}
function createMaintenanceReport(input) {
  const counts = {
    ok: input.items.filter((item) => item.severity === "ok").length,
    warning: input.items.filter((item) => item.severity === "warning").length,
    repairable: input.items.filter((item) => item.severity === "repairable").length,
    error: input.items.filter((item) => item.severity === "error").length
  };
  const status = input.items.reduce((current, item) => {
    return maintenanceSeverityRank(item.severity) > maintenanceSeverityRank(current) ? item.severity : current;
  }, "ok");
  const report = {
    createdAt: nowIso(),
    chatId: input.chatId,
    status,
    summary: "",
    items: input.items.length > 0 ? input.items : [{
      severity: "ok",
      category: "Status",
      message: "No LTracker maintenance issues found.",
      suggestedFix: null,
      repairActionId: null
    }],
    counts,
    duplicateIndexEntries: input.duplicateIndexEntries,
    missingSidecarIndexEntries: input.missingSidecarIndexEntries,
    orphanSidecarSnapshots: input.orphanSidecarSnapshots,
    snapshotsWithoutPresetLocks: input.snapshotsWithoutPresetLocks,
    snapshotsWithIncompletePresetLocks: input.snapshotsWithIncompletePresetLocks,
    snapshotsWithUnavailableOriginalPreset: input.snapshotsWithUnavailableOriginalPreset,
    brokenEmbeddedTags: input.brokenEmbeddedTags,
    malformedEmbeddedTags: input.malformedEmbeddedTags,
    repairedCount: input.repairedCount ?? 0,
    deletedCount: input.deletedCount ?? 0,
    limitationNotes: input.limitationNotes ?? []
  };
  report.summary = buildMaintenanceSummary(report);
  return report;
}
async function persistMaintenanceReport(chatId, userId, report, action) {
  await tryPersistDiagnostics({
    ...await loadDiagnostics(chatId, userId),
    lastHealthCheckAt: report.createdAt,
    lastHealthCheckStatus: report.status,
    lastMaintenanceActionAt: report.createdAt,
    lastMaintenanceAction: action,
    lastMaintenanceReport: report,
    lastHistoryDuplicateCount: report.duplicateIndexEntries,
    lastHistoryOrphanCount: report.orphanSidecarSnapshots + report.missingSidecarIndexEntries,
    lastHistoryCleanupAt: report.repairedCount > 0 || report.deletedCount > 0 ? report.createdAt : (await loadDiagnostics(chatId, userId)).lastHistoryCleanupAt,
    lastError: null
  }, userId);
}
async function buildMaintenanceReport(chatId, userId, options = {}) {
  const items = [];
  const limitationNotes = ["Full orphan sidecar deletion requires a storage listing API; this scan checks known chat message and index paths only."];
  let repairedCount = 0;
  const rawSettings = await spindle.userStorage.getJson(SETTINGS_PATH, { fallback: DEFAULT_SETTINGS, userId });
  const repairedSettings = repairSettings(rawSettings);
  const settingsChanged = JSON.stringify(rawSettings) !== JSON.stringify(repairedSettings);
  const settings = repairedSettings;
  if (settingsChanged) {
    items.push({
      severity: "repairable",
      category: "Settings",
      message: "Settings contain stale, invalid, or out-of-range values.",
      suggestedFix: "Run Repair Settings to rewrite the repaired settings object.",
      repairActionId: "repair_settings"
    });
  }
  const presetState = await resolveActivePreset(chatId, userId);
  if (presetState.fallbackReason) {
    items.push({
      severity: "repairable",
      category: "Presets",
      message: "The selected preset could not be resolved and LTracker used a fallback preset.",
      suggestedFix: "Choose an installed preset or reset the built-in preset.",
      repairActionId: "repair_settings"
    });
  }
  for (const preset of presetState.presets) {
    if (Object.keys(preset.jsonSchema ?? {}).length === 0) {
      items.push({
        severity: "warning",
        category: "Presets",
        message: `Preset "${preset.name}" has an empty JSON schema.`,
        suggestedFix: "Edit or re-import the preset with a JSON schema.",
        repairActionId: null
      });
    }
    if (!preset.promptInstructions.trim()) {
      items.push({
        severity: "warning",
        category: "Presets",
        message: `Preset "${preset.name}" has empty prompt instructions.`,
        suggestedFix: "Edit or re-import the preset with prompt instructions.",
        repairActionId: null
      });
    }
  }
  const activeValidation = validatePresetReport(presetState.activePreset, {
    allowInlineStyles: settings.renderer.allowInlineStyles,
    maxRenderedChars: settings.budget.renderedHtmlMaxChars
  });
  if (settings.renderer.templateTrustMode === "safe" && activeValidation.rendererRequirements.recommendedMode !== "safe") {
    items.push({
      severity: "repairable",
      category: "Renderer",
      message: "The active preset needs Trusted renderer features, but Safe Mode is active.",
      suggestedFix: "Switch the renderer trust mode to Trusted for this user-authored preset.",
      repairActionId: "repair_settings"
    });
  }
  if (settings.messageDisplay.maxRenderedChars < Math.min(settings.budget.renderedHtmlMaxChars, activeValidation.estimatedRenderedChars)) {
    items.push({
      severity: "warning",
      category: "Renderer",
      message: "Message display render limit may be lower than the active preset needs.",
      suggestedFix: "Increase Message render chars or use popover/fullscreen display.",
      repairActionId: null
    });
  }
  const activeOwnerPower = ownerPowerFeatureSummary(presetState.activePreset);
  if (settings.ownerPowerMode.enabled) {
    items.push({
      severity: "warning",
      category: "Owner Power",
      message: "Owner Power Mode is enabled for this local install.",
      suggestedFix: "Keep it enabled only for your own approved presets; use Disable Owner Power if the drawer becomes unstable.",
      repairActionId: "disable_owner_power"
    });
  }
  if (settings.ownerPowerMode.allowInstalledPresetRuntime) {
    items.push({
      severity: "warning",
      category: "Owner Power",
      message: "Installed preset runtime is enabled; interactive behavior can run outside Render Lab surfaces.",
      suggestedFix: "Keep installed runtime off unless you are actively testing a preset you authored.",
      repairActionId: "disable_owner_power"
    });
  }
  if (activeOwnerPower.hasScript && !settings.ownerPowerMode.enabled) {
    items.push({
      severity: "warning",
      category: "Owner Power",
      message: "The active preset contains Owner Power runtime source, but Owner Power Mode is disabled.",
      suggestedFix: "Use Render Lab static preview, or enable Owner Power manually for this local preset.",
      repairActionId: null
    });
  }
  if (settings.ownerPowerMode.allowExternalUrls || settings.ownerPowerMode.allowNetwork || settings.ownerPowerMode.allowHostDomAccess) {
    items.push({
      severity: "warning",
      category: "Owner Power",
      message: "One or more high-risk Owner Power capability flags are enabled.",
      suggestedFix: "Reset Owner Power settings unless a specific local preset requires them.",
      repairActionId: "reset_owner_power_settings"
    });
  }
  const currentDiagnostics = await loadDiagnostics(chatId, userId);
  if (currentDiagnostics.ownerPowerCrashCount >= settings.ownerPowerMode.crashDisableThreshold) {
    items.push({
      severity: "repairable",
      category: "Owner Power",
      message: "Owner Power runtime crash count has reached the disable threshold.",
      suggestedFix: "Clear crash counters after reviewing the preset, or reset Owner Power settings.",
      repairActionId: "clear_owner_power_crashes"
    });
  }
  const cache = connectionCacheForUser(userId);
  if (settings.connection.selectedConnectionId && !cache.profiles.some((profile) => profile.id === settings.connection.selectedConnectionId)) {
    items.push({
      severity: "warning",
      category: "Connections",
      message: "Selected tracker profile is not available in the current connection list.",
      suggestedFix: "Refresh tracker profiles or select a different tracker profile.",
      repairActionId: null
    });
  }
  if (!settings.connection.selectedConnectionId) {
    items.push({
      severity: "warning",
      category: "Connections",
      message: "No dedicated tracker profile is selected; LTracker will fall back to the active roleplay connection.",
      suggestedFix: "Open Connection and select a tracker profile.",
      repairActionId: null
    });
  }
  if (settings.contextFilters.enabled) {
    const anyGenerationSource = settings.contextFilters.includeChatMessages || settings.contextFilters.includeTrackerMemory || settings.contextFilters.includeWorldLoreContext || settings.contextFilters.includeCharacterContext || settings.contextFilters.includePersonaContext || Boolean(settings.contextFilters.manualWorldLoreContext.trim()) || Boolean(settings.contextFilters.manualCharacterContext.trim()) || Boolean(settings.contextFilters.manualPersonaContext.trim());
    if (!anyGenerationSource) {
      items.push({
        severity: "repairable",
        category: "Context Filters",
        message: "Context filters are enabled but every generation context source is disabled.",
        suggestedFix: "Reset context filters to defaults or enable chat messages.",
        repairActionId: "repair_settings"
      });
    }
    if (settings.contextFilters.excludeUserMessages && settings.contextFilters.excludeAssistantMessages) {
      items.push({
        severity: "warning",
        category: "Context Filters",
        message: "Both user and assistant messages are excluded; recent chat context may become empty.",
        suggestedFix: "Keep at least one message role enabled unless you are relying on manual notes only.",
        repairActionId: null
      });
    }
  }
  if (settings.contextFilters.includeWorldLoreContext && (!spindle.world_books?.getActivated || !spindle.permissions.has("world_books"))) {
    items.push({
      severity: "warning",
      category: "Context Filters",
      message: "World/lore context is enabled, but the read-only world_books API or permission is unavailable.",
      suggestedFix: "Disable native world/lore context or use Extra Lore Context until Lumiverse grants the API.",
      repairActionId: null
    });
  }
  if (settings.contextFilters.includeCharacterContext && (!spindle.characters?.get || !spindle.permissions.has("characters"))) {
    items.push({
      severity: "warning",
      category: "Context Filters",
      message: "Character context is enabled, but the read-only characters API or permission is unavailable.",
      suggestedFix: "Disable native character context or use Manual Character Notes.",
      repairActionId: null
    });
  }
  if (settings.contextFilters.includePersonaContext && (!spindle.personas?.getActive || !spindle.permissions.has("personas"))) {
    items.push({
      severity: "warning",
      category: "Context Filters",
      message: "Persona context is enabled, but the read-only personas API or permission is unavailable.",
      suggestedFix: "Disable native persona context or use Manual Persona Notes.",
      repairActionId: null
    });
  }
  const addedContextBudget = settings.contextFilters.maxWorldLoreChars + settings.contextFilters.maxCharacterContextChars + settings.contextFilters.maxPersonaContextChars;
  if (settings.contextFilters.enabled && addedContextBudget > Math.max(64e3, settings.maxMessageChars * 3)) {
    items.push({
      severity: "warning",
      category: "Context Filters",
      message: "Additional context budgets are high compared with the recent chat budget.",
      suggestedFix: "Reduce lore/character/persona budgets if tracker generations become slow or unfocused.",
      repairActionId: null
    });
  }
  const rawIndex = await spindle.userStorage.getJson(messageSnapshotIndexPath(chatId), { fallback: [], userId });
  const indexRepair = repairMessageSnapshotIndexKeepingNewest(rawIndex);
  if (indexRepair.invalidCount > 0) {
    items.push({
      severity: "repairable",
      category: "Storage / History",
      message: `Found ${indexRepair.invalidCount} invalid snapshot index row(s).`,
      suggestedFix: "Run Repair Snapshot Index.",
      repairActionId: "repair_snapshot_index"
    });
  }
  if (indexRepair.duplicateCount > 0) {
    items.push({
      severity: "repairable",
      category: "Storage / History",
      message: `Found ${indexRepair.duplicateCount} duplicate history entr${indexRepair.duplicateCount === 1 ? "y" : "ies"}.`,
      suggestedFix: "Run Clean Duplicate Index Entries or Repair Snapshot Index.",
      repairActionId: "cleanup_duplicate_history"
    });
  }
  const existingStorageKeys = /* @__PURE__ */ new Set();
  const snapshots = [];
  let missingSidecarIndexEntries = 0;
  for (const entry of indexRepair.index) {
    const exists = await spindle.userStorage.exists(entry.storageKey, userId).catch(() => false);
    if (!exists) {
      missingSidecarIndexEntries += 1;
      continue;
    }
    existingStorageKeys.add(entry.storageKey);
    const snapshot = await spindle.userStorage.getJson(entry.storageKey, {
      fallback: null,
      userId
    }).catch(() => null);
    if (snapshot) snapshots.push(normalizeMessageAttachedSnapshotPresetMetadata(snapshot));
  }
  if (missingSidecarIndexEntries > 0) {
    items.push({
      severity: "repairable",
      category: "Storage / History",
      message: `Found ${missingSidecarIndexEntries} index entr${missingSidecarIndexEntries === 1 ? "y" : "ies"} pointing to missing sidecar snapshots.`,
      suggestedFix: "Run Repair Snapshot Index or Clean Missing Index Entries.",
      repairActionId: "cleanup_missing_index_entries"
    });
  }
  let snapshotsWithoutPresetLocks = 0;
  let snapshotsWithIncompletePresetLocks = 0;
  let snapshotsWithUnavailableOriginalPreset = 0;
  if (options.repairPresetLocks) {
    for (const snapshot of snapshots) {
      const lock = snapshot.snapshot.presetRenderLock;
      if (lock?.htmlTemplate !== null && lock?.htmlTemplate !== void 0 && lock.htmlTemplateHash && lock.schemaHash && lock.promptInstructionsHash) continue;
      const preset = presetMatchForSnapshot(snapshot, presetState.presets);
      if (!preset) continue;
      const capturedAt = snapshot.snapshot.createdAt || snapshot.attachedAt || nowIso();
      const repairedSnapshot = {
        ...snapshot,
        presetId: snapshot.presetId ?? preset.id,
        presetName: snapshot.presetName ?? preset.name,
        presetVersion: snapshot.presetVersion ?? preset.version,
        snapshot: {
          ...snapshot.snapshot,
          presetId: snapshot.snapshot.presetId ?? preset.id,
          presetName: snapshot.snapshot.presetName ?? preset.name,
          presetVersion: snapshot.snapshot.presetVersion ?? preset.version,
          presetRenderLock: capturePresetRenderLock(preset, capturedAt)
        }
      };
      await saveMessageAttachedSnapshot(repairedSnapshot, userId);
      repairedCount += 1;
    }
  }
  for (const snapshot of snapshots) {
    const lock = snapshot.snapshot.presetRenderLock;
    const hasLockTemplate = lock?.htmlTemplate !== null && lock?.htmlTemplate !== void 0;
    if (!hasLockTemplate) {
      snapshotsWithoutPresetLocks += 1;
      const preset = presetMatchForSnapshot(snapshot, presetState.presets);
      if (!preset) snapshotsWithUnavailableOriginalPreset += 1;
    } else if (!lock?.htmlTemplateHash || !lock.schemaHash || !lock.promptInstructionsHash) {
      snapshotsWithIncompletePresetLocks += 1;
    }
  }
  if (snapshotsWithoutPresetLocks > 0) {
    items.push({
      severity: snapshotsWithUnavailableOriginalPreset > 0 ? "warning" : "repairable",
      category: "Preset Render Locks",
      message: `Found ${snapshotsWithoutPresetLocks} snapshot(s) without preset render locks.`,
      suggestedFix: snapshotsWithUnavailableOriginalPreset > 0 ? "Install the original preset when available; do not silently rebind to the active preset." : "Run Repair Preset Render Locks.",
      repairActionId: snapshotsWithUnavailableOriginalPreset > 0 ? null : "repair_preset_render_locks"
    });
  }
  if (snapshotsWithIncompletePresetLocks > 0) {
    items.push({
      severity: "repairable",
      category: "Preset Render Locks",
      message: `Found ${snapshotsWithIncompletePresetLocks} snapshot(s) with incomplete preset lock metadata.`,
      suggestedFix: "Run Repair Preset Render Locks if the matching installed preset is still available.",
      repairActionId: "repair_preset_render_locks"
    });
  }
  const messages = await readChatMessages(chatId).catch(() => []);
  const indexKeys = new Set(indexRepair.index.map((entry) => swipeIdentityKey(entry)));
  const orphansToReindex = [];
  let orphanSidecarSnapshots = 0;
  let brokenEmbeddedTags = 0;
  let malformedEmbeddedTags = 0;
  for (const message of messages) {
    for (const swipeKey of possibleSwipeKeysForMessage(chatId, message)) {
      const storageKey = messageSnapshotPath(chatId, message.id, swipeKey);
      if (!indexKeys.has(`${message.id}:${swipeKey}`) && await spindle.userStorage.exists(storageKey, userId).catch(() => false)) {
        orphanSidecarSnapshots += 1;
        const snapshot = await loadMessageSnapshot(chatId, message.id, userId, swipeKey);
        if (snapshot) {
          orphansToReindex.push({
            messageId: message.id,
            messageIndex: messageIndexFromChatMessage(message),
            swipeKey,
            swipeIndex: snapshot.swipeIndex,
            swipeId: snapshot.swipeId,
            swipeContentHash: snapshot.swipeContentHash,
            swipeKeySource: snapshot.swipeKeySource,
            presetId: snapshot.presetId,
            presetName: snapshot.presetName,
            createdAt: snapshot.attachedAt,
            storageKey
          });
        }
      }
    }
    const contents = [message.content, ...Array.isArray(message.swipes) ? message.swipes : []].filter((content) => typeof content === "string");
    for (const content of contents) {
      const completeTags = findLTrackerTags(content);
      const tagOpenCount = (content.match(/<ltracker\b/gi) ?? []).length;
      malformedEmbeddedTags += Math.max(0, tagOpenCount - completeTags.length);
      for (const tag of completeTags) {
        try {
          parseTrackerJson(tag.content);
        } catch {
          brokenEmbeddedTags += 1;
        }
      }
    }
  }
  if (options.reindexOrphans && orphansToReindex.length > 0) {
    let nextIndex = indexRepair.index;
    for (const orphan of orphansToReindex) {
      nextIndex = upsertMessageSnapshotIndexEntry(nextIndex, orphan);
    }
    await saveMessageSnapshotIndex(chatId, nextIndex, userId);
    repairedCount += orphansToReindex.length;
  }
  if (orphanSidecarSnapshots > 0) {
    items.push({
      severity: "repairable",
      category: "Storage / History",
      message: `Found ${orphanSidecarSnapshots} discoverable sidecar snapshot(s) not referenced by the index.`,
      suggestedFix: "Run Clean Orphan Snapshots to reindex discoverable sidecars.",
      repairActionId: "clean_orphan_snapshots"
    });
  }
  if (brokenEmbeddedTags > 0 || malformedEmbeddedTags > 0) {
    items.push({
      severity: brokenEmbeddedTags > 0 ? "repairable" : "warning",
      category: "Embedded Tags",
      message: `Found ${brokenEmbeddedTags} broken complete tag(s) and ${malformedEmbeddedTags} malformed tag marker(s).`,
      suggestedFix: brokenEmbeddedTags > 0 ? "Run Clean Broken Embedded Tags to remove complete LTracker tags with invalid JSON." : "Review malformed tag markers manually.",
      repairActionId: brokenEmbeddedTags > 0 ? "clean_broken_embedded_tags" : null
    });
  }
  return createMaintenanceReport({
    chatId,
    items,
    duplicateIndexEntries: indexRepair.duplicateCount,
    missingSidecarIndexEntries,
    orphanSidecarSnapshots,
    snapshotsWithoutPresetLocks,
    snapshotsWithIncompletePresetLocks,
    snapshotsWithUnavailableOriginalPreset,
    brokenEmbeddedTags,
    malformedEmbeddedTags,
    repairedCount,
    limitationNotes
  });
}
async function saveEditedMessageTracker(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const existing = await loadMessageSnapshot(resolvedChatId, payload.messageId, userId, payload.swipeKey);
  if (!existing) {
    throw new LTrackerStageError("storage", "No tracker snapshot exists for this message swipe.");
  }
  const parsed = parseTrackerJson(payload.jsonText);
  const editedAt = nowIso();
  const edited = {
    ...existing,
    extensionVersion: EXTENSION_VERSION,
    attachedAt: editedAt,
    snapshot: {
      ...existing.snapshot,
      extensionVersion: EXTENSION_VERSION,
      data: parsed,
      editedAt,
      editedByUser: true
    }
  };
  const index = await saveMessageAttachedSnapshotWithIndex(edited, userId);
  const settings = await getSettings(userId);
  if (shouldWriteEmbeddedTrackerTag(settings)) {
    try {
      await writeEmbeddedTrackerTag(edited, userId);
    } catch (error) {
      await tryPersistDiagnostics({
        ...await loadDiagnostics(resolvedChatId, userId),
        lastEmbeddedTagError: errorMessage2(error)
      }, userId);
    }
  }
  const diagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    lastEditedTrackerMessageId: payload.messageId,
    lastEditedTrackerSwipeKey: payload.swipeKey,
    latestAttachedMessageId: payload.messageId,
    latestAttachedMessageIndex: existing.messageIndex,
    latestAttachedSnapshotAt: editedAt,
    latestAttachedSnapshotStorageKey: messageSnapshotPath(resolvedChatId, payload.messageId, payload.swipeKey),
    messageSnapshotIndexCount: index.length,
    swipeTrackerIndexCount: index.length,
    lastParsedTracker: parsed,
    lastError: null
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function cancelTrackerGeneration(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const job = [...activeJobs.values()].find((item) => {
    if (payload.jobId && item.jobId === payload.jobId) return true;
    return Boolean(payload.messageId && payload.swipeKey && item.sourceMessageId === payload.messageId && item.swipeKey === payload.swipeKey);
  });
  if (!job || job.chatId !== resolvedChatId) {
    await sendState(resolvedChatId, userId, void 0, null, payload.requestId);
    return;
  }
  job.cancelReason = job.sourceKind === "widget" ? "Widget regeneration was cancelled." : "Tracker generation was cancelled.";
  job.controller.abort();
  await sendState(resolvedChatId, userId, "generating", null, payload.requestId);
}
async function handleEmbeddedTrackerTagIntercepted(payload, userId) {
  if (payload.isStreaming) return;
  const resolvedChatId = payload.chatId ? payload.chatId : await resolveActiveChatId(payload.chatId, userId).catch(() => null);
  rememberActiveChat(userId, resolvedChatId);
  const messageId = payload.messageId;
  const swipeKey = payload.swipeKey || DEFAULT_SWIPE_KEY;
  let parsed = null;
  try {
    parsed = parseTrackerJson(payload.jsonText);
  } catch (error) {
    if (resolvedChatId) {
      await tryPersistDiagnostics({
        ...await loadDiagnostics(resolvedChatId, userId),
        lastTagInterceptAt: nowIso(),
        lastTagInterceptMessageId: messageId,
        lastTagInterceptSwipeKey: swipeKey,
        lastTagInterceptError: errorMessage2(error)
      }, userId);
    }
    return;
  }
  if (!resolvedChatId || !messageId) return;
  const settings = await getSettings(userId);
  const presetState = await resolveActivePreset(resolvedChatId, userId);
  let index = await loadMessageSnapshotIndex(resolvedChatId, userId);
  if (settings.messageDisplay.attachmentMode === "both") {
    const attachedAt = nowIso();
    const presetRenderLock = capturePresetRenderLock(presetState.activePreset, attachedAt);
    const attachedSnapshot = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      extensionVersion: EXTENSION_VERSION,
      chatId: resolvedChatId,
      messageId,
      messageIndex: null,
      swipeKey,
      swipeIndex: null,
      swipeId: null,
      swipeContentHash: null,
      swipeKeySource: "unknown",
      presetId: presetState.activePreset.id,
      presetName: presetState.activePreset.name,
      presetVersion: presetState.activePreset.version,
      trigger: {
        kind: "widget",
        requestId: payload.requestId,
        sourceMessageId: messageId,
        sourceMessageIndex: null,
        swipeKey,
        swipeIndex: null,
        swipeId: null,
        swipeContentHash: null,
        swipeKeySource: "unknown"
      },
      snapshot: {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        extensionVersion: EXTENSION_VERSION,
        chatId: resolvedChatId,
        createdAt: attachedAt,
        messageCount: 1,
        sourceMessageIds: [messageId],
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name,
        presetVersion: presetState.activePreset.version,
        presetRenderLock,
        data: parsed
      },
      attachedAt
    };
    index = await saveMessageAttachedSnapshotWithIndex(attachedSnapshot, userId);
  }
  await tryPersistDiagnostics({
    ...await loadDiagnostics(resolvedChatId, userId),
    lastTagInterceptAt: nowIso(),
    lastTagInterceptMessageId: messageId,
    lastTagInterceptSwipeKey: swipeKey,
    lastTagInterceptError: null,
    messageSnapshotIndexCount: index.length,
    swipeTrackerIndexCount: index.length
  }, userId);
}
function disposeBackend() {
  if (disposed) return;
  disposed = true;
  for (const pending of pendingAutoJobs.values()) clearTimeout(pending.timer);
  pendingAutoJobs.clear();
  for (const pending of pendingAutoFinalizations.values()) clearTimeout(pending.timer);
  pendingAutoFinalizations.clear();
  for (const job of activeJobs.values()) job.controller.abort();
  activeJobs.clear();
  for (const job of connectionTestJobs.values()) job.controller.abort();
  connectionTestJobs.clear();
  for (const cleanup of eventCleanups.splice(0).reverse()) cleanup();
  autoSubscriptionsActive = false;
  contextHandlerRegistered = false;
  interceptorRegistered = false;
}
function registerEventListeners() {
  eventCleanups.push(spindle.on("GENERATION_STARTED", (payload, userId) => {
    void handleGenerationStarted(payload, userId).catch((error) => {
      spindle.log.warn(`LTracker generation-started handler failed: ${errorMessage2(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("GENERATION_ENDED", (payload, userId) => {
    void handleGenerationEnded(payload, userId).catch((error) => {
      spindle.log.warn(`LTracker generation-ended handler failed: ${errorMessage2(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("MESSAGE_SENT", (payload, userId) => {
    void handleMessageSent(payload, userId).catch((error) => {
      spindle.log.warn(`LTracker message-sent handler failed: ${errorMessage2(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("MESSAGE_SWIPED", (payload, userId) => {
    void handleMessageSwiped(payload, userId).catch((error) => {
      spindle.log.warn(`LTracker message-swiped handler failed: ${errorMessage2(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("SWIPE_EDITED", (payload, userId) => {
    void handleSwipeEdited(payload, userId).catch((error) => {
      spindle.log.warn(`LTracker swipe-edited handler failed: ${errorMessage2(error)}`);
    });
  }));
  eventCleanups.push(spindle.on("CHAT_SWITCHED", handleChatSwitched));
  eventCleanups.push(spindle.on("EXTENSION_UNLOADED", disposeBackend));
  autoSubscriptionsActive = true;
}
function registerContextInjection() {
  if (contextHandlerRegistered) return;
  if (!CONTEXT_HANDLER_EXPERIMENTAL_ENABLED) {
    spindle.log.warn(CONTEXT_HANDLER_DISABLED_REASON);
    return;
  }
  spindle.log.warn("LTracker context injection stayed disabled because no verified Lumiverse context handler DTO is available.");
}
function registerSafePromptInterceptor() {
  if (interceptorRegistered) return;
  if (!spindle.permissions.has("interceptor")) {
    spindle.log.warn("LTracker prompt injection is unavailable until the interceptor permission is granted.");
    return;
  }
  if (!spindle.registerInterceptor) {
    spindle.log.warn("LTracker prompt injection is unavailable because registerInterceptor is missing.");
    return;
  }
  spindle.registerInterceptor(async (messages, context) => handlePromptInterceptorFailSafe(messages, context), 0);
  interceptorRegistered = true;
}
async function restoreDeletedTracker(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const key = `${userId}:${resolvedChatId}:${payload.messageId}:${payload.swipeKey}`;
  const deletedInfo = recentlyDeletedSnapshots.get(key);
  if (!deletedInfo) {
    throw new LTrackerStageError("storage", "Deleted tracker snapshot not found or expired.");
  }
  await saveMessageAttachedSnapshot(deletedInfo.snapshot, userId);
  const index = await loadMessageSnapshotIndex(resolvedChatId, userId);
  const updatedIndex = upsertMessageSnapshotIndexEntry(index, {
    messageId: payload.messageId,
    messageIndex: deletedInfo.snapshot.messageIndex,
    swipeKey: payload.swipeKey,
    swipeIndex: deletedInfo.snapshot.swipeIndex,
    swipeId: deletedInfo.snapshot.swipeId,
    swipeContentHash: deletedInfo.snapshot.swipeContentHash,
    swipeKeySource: deletedInfo.snapshot.swipeKeySource,
    createdAt: deletedInfo.snapshot.attachedAt,
    presetId: deletedInfo.snapshot.presetId,
    presetName: deletedInfo.snapshot.presetName,
    storageKey: messageSnapshotPath(resolvedChatId, payload.messageId, payload.swipeKey)
  });
  await saveMessageSnapshotIndex(resolvedChatId, updatedIndex, userId);
  if (deletedInfo.embeddedTagContent) {
    try {
      const messages = await readChatMessages(resolvedChatId);
      const msg = messages.find((m) => m.id === payload.messageId);
      if (msg) {
        const swipeIndex = resolveSwipeContentIndex(msg, payload.swipeKey);
        const content = msg.swipes?.[swipeIndex] ?? null;
        if (content) {
          const matches = findLTrackerTags(content);
          if (matches.length === 0) {
            const nextContent = `${content}
${deletedInfo.embeddedTagContent}`;
            const nextSwipes = [...msg.swipes];
            nextSwipes[swipeIndex] = nextContent;
            await spindle.chat.updateMessage(resolvedChatId, payload.messageId, { swipes: nextSwipes });
          }
        }
      }
    } catch (error) {
      spindle.log.error("LTracker restore tag error: " + error);
    }
  }
  recentlyDeletedSnapshots.delete(key);
  const diagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    messageSnapshotIndexCount: updatedIndex.length,
    swipeTrackerIndexCount: updatedIndex.length,
    lastError: null
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function runStorageMaintenanceScan(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const report = await buildMaintenanceReport(resolvedChatId, userId, { reindexOrphans: true });
  await persistMaintenanceReport(resolvedChatId, userId, report, "run_storage_maintenance_scan");
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function cleanupMissingIndexEntries(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const rawIndex = await spindle.userStorage.getJson(messageSnapshotIndexPath(resolvedChatId), { fallback: [], userId });
  const repaired = repairMessageSnapshotIndexKeepingNewest(rawIndex);
  const existingStorageKeys = /* @__PURE__ */ new Set();
  for (const entry of repaired.index) {
    if (await spindle.userStorage.exists(entry.storageKey, userId).catch(() => false)) {
      existingStorageKeys.add(entry.storageKey);
    }
  }
  const filtered = filterMessageSnapshotIndexByStorageKeys(repaired.index, existingStorageKeys);
  await saveMessageSnapshotIndex(resolvedChatId, filtered.index, userId);
  const report = await buildMaintenanceReport(resolvedChatId, userId);
  const diagnostics = {
    ...await loadDiagnostics(resolvedChatId, userId),
    lastHistoryCleanupAt: nowIso(),
    messageSnapshotIndexCount: filtered.index.length,
    swipeTrackerIndexCount: filtered.index.length,
    lastHealthCheckAt: report.createdAt,
    lastHealthCheckStatus: report.status,
    lastMaintenanceActionAt: report.createdAt,
    lastMaintenanceAction: "cleanup_missing_index_entries",
    lastMaintenanceReport: {
      ...report,
      repairedCount: filtered.removedCount
    },
    lastError: null
  };
  await tryPersistDiagnostics(diagnostics, userId);
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function runHealthCheck(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const report = await buildMaintenanceReport(resolvedChatId, userId);
  await persistMaintenanceReport(resolvedChatId, userId, report, "run_health_check");
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function repairSettingsAction(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const raw = await spindle.userStorage.getJson(SETTINGS_PATH, { fallback: DEFAULT_SETTINGS, userId });
  const repaired = repairSettings(raw);
  const changed = JSON.stringify(raw) !== JSON.stringify(repaired);
  if (changed) await spindle.userStorage.setJson(SETTINGS_PATH, repaired, { indent: 2, userId });
  const report = await buildMaintenanceReport(resolvedChatId, userId);
  await persistMaintenanceReport(resolvedChatId, userId, {
    ...report,
    repairedCount: report.repairedCount + (changed ? 1 : 0),
    summary: changed ? "Settings were repaired and saved." : report.summary
  }, "repair_settings");
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function disableOwnerPowerAction(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const settings = await getSettings(userId);
  settings.ownerPowerMode = {
    ...settings.ownerPowerMode,
    enabled: false,
    allowRenderLabRuntime: false,
    allowInstalledPresetRuntime: false,
    allowScriptBlocks: false,
    allowTemplateActionHooks: false,
    allowExternalUrls: false,
    allowNetwork: false,
    allowHostDomAccess: false
  };
  await saveSettings(settings, userId);
  const diagnostics = await loadDiagnostics(resolvedChatId, userId);
  await tryPersistDiagnostics({
    ...diagnostics,
    ownerPowerModeEnabled: false,
    renderLabRuntimeEnabled: false,
    installedPresetRuntimeEnabled: false,
    declarativeHooksEnabled: false,
    ownerPowerDisabledReason: "Owner Power Mode was disabled by maintenance action.",
    lastOwnerPowerRuntimeMode: "static",
    lastOwnerPowerEvent: "disabled",
    lastOwnerPowerError: null
  }, userId);
  const report = await buildMaintenanceReport(resolvedChatId, userId);
  await persistMaintenanceReport(resolvedChatId, userId, {
    ...report,
    repairedCount: report.repairedCount + 1,
    summary: "Owner Power Mode was disabled and runtime capability flags were cleared."
  }, "disable_owner_power");
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function resetOwnerPowerSettingsAction(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const settings = await getSettings(userId);
  settings.ownerPowerMode = { ...DEFAULT_SETTINGS.ownerPowerMode };
  await saveSettings(settings, userId);
  const diagnostics = await loadDiagnostics(resolvedChatId, userId);
  await tryPersistDiagnostics({
    ...diagnostics,
    ownerPowerModeEnabled: DEFAULT_SETTINGS.ownerPowerMode.enabled,
    renderLabRuntimeEnabled: DEFAULT_SETTINGS.ownerPowerMode.allowRenderLabRuntime,
    installedPresetRuntimeEnabled: DEFAULT_SETTINGS.ownerPowerMode.allowInstalledPresetRuntime,
    declarativeHooksEnabled: DEFAULT_SETTINGS.ownerPowerMode.allowTemplateActionHooks,
    ownerPowerCrashCount: 0,
    ownerPowerDisabledReason: null,
    lastOwnerPowerRuntimeMode: "static",
    lastOwnerPowerEvent: "reset",
    lastOwnerPowerError: null
  }, userId);
  const report = await buildMaintenanceReport(resolvedChatId, userId);
  await persistMaintenanceReport(resolvedChatId, userId, {
    ...report,
    repairedCount: report.repairedCount + 1,
    summary: "Owner Power settings were reset to safe defaults."
  }, "reset_owner_power_settings");
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function clearOwnerPowerCrashesAction(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const diagnostics = await loadDiagnostics(resolvedChatId, userId);
  await tryPersistDiagnostics({
    ...diagnostics,
    ownerPowerCrashCount: 0,
    ownerPowerDisabledReason: null,
    lastOwnerPowerError: null,
    lastOwnerPowerEvent: "crash_counters_cleared"
  }, userId);
  const report = await buildMaintenanceReport(resolvedChatId, userId);
  await persistMaintenanceReport(resolvedChatId, userId, {
    ...report,
    repairedCount: report.repairedCount + 1,
    summary: "Owner Power crash counters were cleared."
  }, "clear_owner_power_crashes");
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function repairSnapshotIndexAction(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const rawIndex = await spindle.userStorage.getJson(messageSnapshotIndexPath(resolvedChatId), { fallback: [], userId });
  const repaired = repairMessageSnapshotIndexKeepingNewest(rawIndex);
  const existingStorageKeys = /* @__PURE__ */ new Set();
  for (const entry of repaired.index) {
    if (await spindle.userStorage.exists(entry.storageKey, userId).catch(() => false)) {
      existingStorageKeys.add(entry.storageKey);
    }
  }
  const filtered = filterMessageSnapshotIndexByStorageKeys(repaired.index, existingStorageKeys);
  await saveMessageSnapshotIndex(resolvedChatId, filtered.index, userId);
  const report = await buildMaintenanceReport(resolvedChatId, userId);
  await persistMaintenanceReport(resolvedChatId, userId, {
    ...report,
    repairedCount: repaired.duplicateCount + repaired.invalidCount + filtered.removedCount,
    summary: `Repaired snapshot index: ${repaired.duplicateCount} duplicate(s), ${repaired.invalidCount} invalid row(s), ${filtered.removedCount} missing sidecar reference(s).`
  }, "repair_snapshot_index");
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function repairPresetRenderLocksAction(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const report = await buildMaintenanceReport(resolvedChatId, userId, { repairPresetLocks: true });
  await persistMaintenanceReport(resolvedChatId, userId, report, "repair_preset_render_locks");
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
async function cleanOrphanSnapshotsAction(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const report = await buildMaintenanceReport(resolvedChatId, userId, { reindexOrphans: true });
  await persistMaintenanceReport(resolvedChatId, userId, report, "clean_orphan_snapshots");
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
function removeBrokenCompleteTags(content) {
  const tags = findLTrackerTags(content);
  let removed = 0;
  const bad = tags.filter((tag) => {
    try {
      parseTrackerJson(tag.content);
      return false;
    } catch {
      return true;
    }
  });
  let next = content;
  for (const tag of bad.sort((left, right) => right.start - left.start)) {
    next = `${next.slice(0, tag.start)}${next.slice(tag.end)}`.replace(/\n{3,}/g, "\n\n").trimEnd();
    removed += 1;
  }
  const malformed = Math.max(0, (content.match(/<ltracker\b/gi) ?? []).length - tags.length);
  return { content: next, removed, malformed };
}
async function cleanBrokenEmbeddedTagsAction(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const messages = await readChatMessages(resolvedChatId);
  let removed = 0;
  let malformed = 0;
  for (const message of messages) {
    if (message.is_user || typeof message.id !== "string" || !message.id) continue;
    const swipes = Array.isArray(message.swipes) && message.swipes.length > 0 ? [...message.swipes] : [message.content ?? ""];
    let changed = false;
    for (let index = 0; index < swipes.length; index += 1) {
      const swipeContent = swipes[index];
      const current = typeof swipeContent === "string" ? swipeContent : "";
      const cleaned = removeBrokenCompleteTags(current);
      removed += cleaned.removed;
      malformed += cleaned.malformed;
      if (cleaned.content !== current) {
        swipes[index] = cleaned.content;
        changed = true;
      }
    }
    if (changed) {
      await spindle.chat.updateMessage(resolvedChatId, message.id, { swipes });
    }
  }
  const report = await buildMaintenanceReport(resolvedChatId, userId);
  await persistMaintenanceReport(resolvedChatId, userId, {
    ...report,
    brokenEmbeddedTags: report.brokenEmbeddedTags + removed,
    malformedEmbeddedTags: report.malformedEmbeddedTags + malformed,
    repairedCount: report.repairedCount + removed,
    summary: `Removed ${removed} broken complete embedded LTracker tag(s). ${malformed} malformed marker(s) require manual review.`
  }, "clean_broken_embedded_tags");
  await sendState(resolvedChatId, userId, "idle", null, payload.requestId);
}
registerEventListeners();
registerSafePromptInterceptor();
registerContextInjection();
spindle.onFrontendMessage((payload, userId) => {
  if (!isFrontendMessage(payload)) return;
  const requestId = "requestId" in payload ? payload.requestId : void 0;
  const chatId = payload.chatId;
  const historyLimit = "historyLimit" in payload ? payload.historyLimit : void 0;
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
      if (payload.type === "refresh_connections") {
        await handleConnectionRefresh(payload, userId);
        return;
      }
      if (payload.type === "test_tracker_connection") {
        await testTrackerConnection(payload, userId);
        return;
      }
      if (payload.type === "cancel_connection_test") {
        await cancelConnectionTest(payload, userId);
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
      if (payload.type === "import_preset_pack") {
        const importOpts = {};
        if (payload.presetName !== void 0) importOpts.presetName = payload.presetName;
        if (payload.overwritePresetId !== void 0) importOpts.overwritePresetId = payload.overwritePresetId;
        if (payload.trustMode !== void 0) importOpts.trustMode = payload.trustMode;
        if (payload.applyRecommendedSettings !== void 0) importOpts.applyRecommendedSettings = payload.applyRecommendedSettings;
        await importPresetPackHandler(
          chatId,
          userId,
          payload.importText,
          importOpts,
          payload.requestId
        );
        return;
      }
      if (payload.type === "export_preset_pack") {
        const exportOpts = {};
        if (payload.includeRecommendedSettings !== void 0) exportOpts.includeRecommendedSettings = payload.includeRecommendedSettings;
        if (payload.includeExampleSnapshot !== void 0) exportOpts.includeExampleSnapshot = payload.includeExampleSnapshot;
        await exportPresetPackHandler(
          chatId,
          userId,
          exportOpts,
          payload.requestId
        );
        return;
      }
      if (payload.type === "validate_preset") {
        await validatePreset(chatId, userId, payload.preset, payload.requestId);
        return;
      }
      if (payload.type === "validate_preset_report") {
        await validatePresetReportHandler(chatId, userId, payload.preset, payload.requestId);
        return;
      }
      if (payload.type === "generate_sample_snapshot") {
        await generateSampleSnapshotHandler(chatId, userId, payload.sampleMode, payload.requestId);
        return;
      }
      if (payload.type === "render_template") {
        await renderTemplatePreview(chatId, userId, payload.requestId, payload.source);
        return;
      }
      if (payload.type === "generate_message_tracker") {
        await regenerateMessageTracker(payload, userId);
        return;
      }
      if (payload.type === "regenerate_message_tracker") {
        await regenerateMessageTracker(payload, userId);
        return;
      }
      if (payload.type === "cancel_tracker_generation") {
        await cancelTrackerGeneration(payload, userId);
        return;
      }
      if (payload.type === "delete_message_tracker") {
        await deleteMessageTracker(payload, userId);
        return;
      }
      if (payload.type === "cleanup_duplicate_history") {
        await cleanupDuplicateHistory(payload, userId);
        return;
      }
      if (payload.type === "save_edited_message_tracker") {
        await saveEditedMessageTracker(payload, userId);
        return;
      }
      if (payload.type === "embedded_tracker_tag_intercepted") {
        await handleEmbeddedTrackerTagIntercepted(payload, userId);
        return;
      }
      if (payload.type === "restore_deleted_tracker") {
        await restoreDeletedTracker(payload, userId);
        return;
      }
      if (payload.type === "run_storage_maintenance_scan") {
        await runStorageMaintenanceScan(payload, userId);
        return;
      }
      if (payload.type === "cleanup_missing_index_entries") {
        await cleanupMissingIndexEntries(payload, userId);
        return;
      }
      if (payload.type === "run_health_check") {
        await runHealthCheck(payload, userId);
        return;
      }
      if (payload.type === "repair_settings") {
        await repairSettingsAction(payload, userId);
        return;
      }
      if (payload.type === "disable_owner_power") {
        await disableOwnerPowerAction(payload, userId);
        return;
      }
      if (payload.type === "reset_owner_power_settings") {
        await resetOwnerPowerSettingsAction(payload, userId);
        return;
      }
      if (payload.type === "clear_owner_power_crashes") {
        await clearOwnerPowerCrashesAction(payload, userId);
        return;
      }
      if (payload.type === "repair_snapshot_index") {
        await repairSnapshotIndexAction(payload, userId);
        return;
      }
      if (payload.type === "repair_preset_render_locks") {
        await repairPresetRenderLocksAction(payload, userId);
        return;
      }
      if (payload.type === "clean_orphan_snapshots") {
        await cleanOrphanSnapshotsAction(payload, userId);
        return;
      }
      if (payload.type === "clean_broken_embedded_tags") {
        await cleanBrokenEmbeddedTagsAction(payload, userId);
        return;
      }
      await handleRefresh(payload, userId);
    } catch (error) {
      const currentError = diagnosticError(error, "unknown");
      spindle.log.warn(`LTracker request failed: ${currentError.message}`);
      const state = await buildState(chatId, userId, "error", currentError, null, historyLimit);
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
