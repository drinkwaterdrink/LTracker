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
function isRecord(value) {
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
  if (!isRecord(value)) return void 0;
  const result = {};
  if (typeof value.supportsHtmlTemplate === "boolean") result.supportsHtmlTemplate = value.supportsHtmlTemplate;
  if (typeof value.supportsPartialRegeneration === "boolean") result.supportsPartialRegeneration = value.supportsPartialRegeneration;
  if (typeof value.supportsSequentialGeneration === "boolean") result.supportsSequentialGeneration = value.supportsSequentialGeneration;
  return Object.keys(result).length > 0 ? result : void 0;
}
function repairRecommendedConnection(value) {
  if (!isRecord(value)) return void 0;
  const result = {};
  const mode = recommendedMode(value.mode);
  if (mode) result.mode = mode;
  const temperature = boundedNumber(value.temperature, 0, 2);
  if (temperature !== void 0) result.temperature = temperature;
  const maxTokens = boundedNumber(value.max_tokens, 256, 64e3);
  if (maxTokens !== void 0) result.max_tokens = Math.round(maxTokens);
  const reasoning = isRecord(value.reasoning) ? value.reasoning : null;
  if (reasoning) {
    const source = recommendedReasoningSource(reasoning.source);
    const effort = typeof reasoning.effort === "string" ? reasoning.effort : void 0;
    if (source || effort) {
      result.reasoning = {};
      if (source) result.reasoning.source = source;
      if (effort) result.reasoning.effort = effort;
    }
  }
  const notes = optionalString(value.notes);
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
  if (!isRecord(value)) {
    return { ok: false, error: "JSON Schema must be a JSON object." };
  }
  return { ok: true, error: null };
}
function validateTrackerPreset(value) {
  if (!isRecord(value)) return { ok: false, error: "Preset must be a JSON object." };
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
  if ("recommendedConnection" in value && value.recommendedConnection !== void 0 && !isRecord(value.recommendedConnection)) {
    return { ok: false, error: "Recommended connection must be an object." };
  }
  return { ok: true, error: null };
}
function repairTrackerPreset(value) {
  if (!isRecord(value)) return null;
  const origin = validOrigin(value.origin) ? value.origin : null;
  if (!origin) return null;
  const preset = {
    id: sanitizePresetId(stringValue(value.id)),
    name: stringValue(value.name).trim(),
    description: stringValue(value.description),
    version: stringValue(value.version, "1.0"),
    createdAt: stringValue(value.createdAt, (/* @__PURE__ */ new Date()).toISOString()),
    updatedAt: stringValue(value.updatedAt, (/* @__PURE__ */ new Date()).toISOString()),
    jsonSchema: isRecord(value.jsonSchema) ? value.jsonSchema : {},
    promptInstructions: stringValue(value.promptInstructions),
    origin
  };
  const htmlTemplate = optionalString(value.htmlTemplate);
  if (htmlTemplate !== void 0) preset.htmlTemplate = htmlTemplate;
  const notes = optionalString(value.notes);
  if (notes !== void 0) preset.notes = notes;
  const capabilities = repairCapabilities(value.capabilities);
  if (capabilities) preset.capabilities = capabilities;
  const recommendedConnection = repairRecommendedConnection(value.recommendedConnection);
  if (recommendedConnection) preset.recommendedConnection = recommendedConnection;
  return validateTrackerPreset(preset).ok ? preset : null;
}
function exportTrackerPreset(preset) {
  return {
    kind: PRESET_EXPORT_KIND,
    formatVersion: PRESET_EXPORT_FORMAT_VERSION,
    preset
  };
}
function importTrackerPresetEnvelope(value, existingIds, now) {
  if (!isRecord(value)) return { ok: false, preset: null, error: "Import must be a JSON object." };
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
function estimatePresetStats(preset) {
  const schemaJson = JSON.stringify(preset.jsonSchema, null, 2);
  const instructions = preset.promptInstructions ?? "";
  const presetContentLength = schemaJson.length + instructions.length + preset.name.length + preset.id.length;
  const estimatedTokens = Math.max(10, Math.ceil(presetContentLength / 4));
  const templateLength = (preset.htmlTemplate ?? "").length;
  const estimatedRenderedChars = templateLength > 0 ? templateLength + 4e3 : 1e4;
  return { estimatedTokens, estimatedRenderedChars };
}

// src/shared/types.ts
var EXTENSION_VERSION = "0.19.1";
var STORAGE_SCHEMA_VERSION = 1;
var SETTINGS_SCHEMA_VERSION = 1;
var SPINDLE_TYPES_VERSION = "0.5.21";

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
var ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set(["class", "title", "aria-label", "data-ltracker-section", "role", "aria-hidden"]);
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
  "button",
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
  "filter"
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
  "lower",
  "upper",
  "truncate"
]);
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function truncateSafe(value, maxChars) {
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
  if (trimmed.startsWith("this.")) return valueAtPath(ctx.current, trimmed.slice(5));
  if (trimmed.startsWith("data.")) return valueAtPath(ctx.root, trimmed.slice(5));
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
  if (helper === "class") return sanitizeClass(args[0]);
  if (helper === "lower") return valueToText(args[0], placeholder).toLowerCase();
  if (helper === "upper") return valueToText(args[0], placeholder).toUpperCase();
  if (helper === "truncate") {
    const text = valueToText(args[0], placeholder);
    const limit = compareNumber(args[1]) ?? 80;
    return Array.from(text).slice(0, Math.max(0, Math.round(limit))).join("");
  }
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
      output += escapeHtml(valueToText(evalExpression(ctx, node.expression, placeholder), placeholder));
      continue;
    }
    const value = evalExpression(ctx, node.expression, placeholder);
    if (node.kind === "each") {
      if (Array.isArray(value) && value.length > 0) {
        output += value.map((item) => renderNodes(node.body, { root: ctx.root, current: item }, placeholder)).join("");
      } else {
        output += renderNodes(node.inverse, ctx, placeholder);
      }
      continue;
    }
    if (node.kind === "with") {
      output += truthy(value) ? renderNodes(node.body, { root: ctx.root, current: value }, placeholder) : renderNodes(node.inverse, ctx, placeholder);
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
function primitiveToString(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}
function recordSummary(value) {
  const preferred = ["name", "title", "status", "role", "emotional_state", "physical_state", "current_goal"];
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
      return isRecord2(item) ? recordSummary(item) : null;
    }).filter((item) => Boolean(item));
  }
  if (isRecord2(value)) {
    const summary = recordSummary(value);
    return summary ? [summary] : [];
  }
  return [];
}
function stringAt(data, path) {
  let current = data;
  for (const key of path) {
    if (!isRecord2(current)) return null;
    current = current[key];
  }
  return primitiveToString(current);
}
function formatTemplateTextFallback(data) {
  const lines = [];
  const scene = [
    stringAt(data, ["scene", "location"]),
    stringAt(data, ["scene", "date"]) ?? stringAt(data, ["scene", "time"]),
    stringAt(data, ["scene", "mood"])
  ].filter((item) => Boolean(item));
  if (scene.length > 0) lines.push(`Scene: ${scene.join(", ")}`);
  const present = listFromUnknown(data.characters_present).map((item) => item.split(" - ")[0]?.trim() ?? item.trim()).filter(Boolean);
  if (present.length > 0) lines.push(`Present characters: ${present.join("; ")}`);
  const facts = listFromUnknown(data.important_facts).slice(0, 8);
  if (facts.length > 0) {
    lines.push("Important facts:");
    lines.push(...facts.map((item) => `- ${item}`));
  }
  const threads = listFromUnknown(data.active_threads).slice(0, 8);
  if (threads.length > 0) {
    lines.push("Active threads:");
    lines.push(...threads.map((item) => `- ${item}`));
  }
  const continuity = listFromUnknown(data.unresolved_continuity).slice(0, 8);
  if (continuity.length > 0) {
    lines.push("Unresolved continuity:");
    lines.push(...continuity.map((item) => `- ${item}`));
  }
  const pressure = listFromUnknown(data.next_scene_pressure).slice(0, 4);
  if (pressure.length > 0) {
    lines.push("Next scene pressure:");
    lines.push(...pressure.map((item) => `- ${item}`));
  }
  if (lines.length > 0) return lines.join("\n");
  const fragments = Object.entries(data).map(([key, value]) => {
    const list = listFromUnknown(value);
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
  return /<\s*script\b|on[a-z]+\s*=|javascript:|<\s*(?:iframe|object|embed|form|input|button|textarea|select)\b/i.test(value);
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
    if (!ALLOWED_ATTRIBUTES.has(attribute.lowerName)) {
      warnings.push(`Removed unsupported attribute ${attribute.lowerName}.`);
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
      return `<${tag}${sanitizeAttributes(rawAttributes, tag, { allowInlineStyles, allowSvg: allowedSvg }, warnings)}>`;
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
  const usesHelpers = /\{\{\s*(?:default|percent|json|eq|gt|lt|and|or|not|class|lower|upper|truncate)\b/i.test(template);
  const hasJavaScriptLikeContent = detectJavaScriptLike(template);
  const features = [
    usesScopedCss ? "Scoped CSS" : null,
    usesInlineStyles ? "Inline styles" : null,
    usesInlineSvg ? "Inline SVG" : null,
    usesConditionals ? "Conditionals" : null,
    usesHelpers ? "Template helpers" : null
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
    const truncatedHtml = truncateSafe(sanitized.html, maxRenderedChars);
    if (truncatedHtml.truncated) warnings.push("Sanitized HTML preview was truncated.");
    const truncatedFallback = truncateSafe(textFallback, maxRenderedChars);
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
    const truncatedFallback = truncateSafe(textFallback, maxRenderedChars);
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

// src/shared/presetPack.ts
var PRESET_PACK_KIND = "ltracker_preset_pack";
var PRESET_PACK_FORMAT_VERSION = 1;
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue2(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
var SECRET_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token(?!s$)/i,
  /auth[_-]?bearer/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /credential/i
];
function containsSecretKeys(obj, depth = 0) {
  if (depth > 10 || !isRecord3(obj)) return false;
  for (const key of Object.keys(obj)) {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(key))) return true;
    if (isRecord3(obj[key]) && containsSecretKeys(obj[key], depth + 1)) return true;
  }
  return false;
}
function stripSecretKeys(obj, depth = 0) {
  if (depth > 10) return {};
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(key))) continue;
    if (isRecord3(value)) {
      result[key] = stripSecretKeys(value, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}
function exportPresetPack(preset, options) {
  const presetStats = estimatePresetStats(preset);
  const schemaKeys = isRecord3(preset.jsonSchema) ? Object.keys(preset.jsonSchema) : [];
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
  if (options?.exampleSnapshot && isRecord3(options.exampleSnapshot)) {
    pack.exampleSnapshot = options.exampleSnapshot;
  }
  return pack;
}
function validatePackRecommendedSettings(value) {
  if (!isRecord3(value)) return null;
  const result = {};
  if (isRecord3(value.connection)) result.connection = stripSecretKeys(value.connection);
  if (isRecord3(value.memory)) result.memory = value.memory;
  if (isRecord3(value.injection)) result.injection = value.injection;
  if (isRecord3(value.renderer)) result.renderer = value.renderer;
  if (isRecord3(value.messageDisplay)) result.messageDisplay = value.messageDisplay;
  if (isRecord3(value.expandedWidth)) result.expandedWidth = value.expandedWidth;
  if (isRecord3(value.budget)) result.budget = stripSecretKeys(value.budget);
  return Object.keys(result).length > 0 ? result : null;
}
function importPresetPack(value, existingIds, now) {
  if (!isRecord3(value)) {
    return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Import must be a JSON object.", warnings: [], packMeta: null };
  }
  if (value.kind === PRESET_PACK_KIND) {
    if (value.formatVersion !== PRESET_PACK_FORMAT_VERSION) {
      return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: `Unsupported preset pack format version: ${value.formatVersion}. Expected ${PRESET_PACK_FORMAT_VERSION}.`, warnings: [], packMeta: null };
    }
    if (containsSecretKeys(value)) {
      return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Import rejected: pack contains potential secret/API key fields.", warnings: [], packMeta: null };
    }
    const presetData = isRecord3(value.preset) ? value.preset : null;
    if (!presetData) {
      return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Import preset data is missing or invalid.", warnings: [], packMeta: null };
    }
    const compat = isRecord3(value.appCompatibility) ? value.appCompatibility : null;
    const warnings = [];
    const existing = new Set(existingIds);
    const rawId = sanitizePresetId(stringValue2(presetData.id, stringValue2(presetData.name, "imported")));
    const id = existing.has(rawId) || rawId === DEFAULT_TRACKER_PRESET_ID ? createPresetId(stringValue2(presetData.name, "Imported Preset"), existing) : rawId;
    const preset = {
      id,
      name: stringValue2(presetData.name, "Imported Preset").trim() || "Imported Preset",
      description: stringValue2(presetData.description),
      version: stringValue2(presetData.version, "1.0"),
      createdAt: now,
      updatedAt: now,
      jsonSchema: isRecord3(presetData.jsonSchema) ? presetData.jsonSchema : {},
      promptInstructions: stringValue2(presetData.promptInstructions),
      htmlTemplate: typeof presetData.htmlTemplate === "string" ? presetData.htmlTemplate : "",
      notes: typeof presetData.notes === "string" ? presetData.notes : "",
      origin: "user_imported",
      capabilities: {
        supportsHtmlTemplate: typeof presetData.htmlTemplate === "string" && presetData.htmlTemplate.trim().length > 0
      }
    };
    if (!preset.name.trim()) {
      return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Imported preset name is empty.", warnings, packMeta: null };
    }
    if (Object.keys(preset.jsonSchema).length === 0) {
      warnings.push("Imported preset has an empty JSON schema.");
    }
    if (!preset.promptInstructions.trim()) {
      warnings.push("Imported preset has empty prompt instructions.");
    }
    const recommendedSettings = validatePackRecommendedSettings(value.recommendedSettings);
    const exampleSnapshot = isRecord3(value.exampleSnapshot) ? value.exampleSnapshot : null;
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
  if (isRecord3(value) && isRecord3(value.jsonSchema) && typeof value.promptInstructions === "string") {
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

// src/shared/snapshotFormat.ts
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isMessageAttachedSnapshot(value) {
  return "snapshot" in value && isRecord4(value.snapshot);
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
function truncateSafe2(value, maxChars) {
  const chars = Array.from(value);
  if (chars.length <= maxChars) return value;
  const suffix = "\n[truncated]";
  if (maxChars <= 0) return "";
  const suffixChars = Array.from(suffix);
  if (maxChars <= suffixChars.length) return suffixChars.slice(0, maxChars).join("");
  const keep = Math.max(0, maxChars - suffixChars.length);
  return `${chars.slice(0, keep).join("")}${suffix}`;
}
function primitiveToString2(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}
function recordSummary2(value) {
  const preferred = ["name", "title", "status", "recent_change", "current_goal", "emotional_state", "physical_state"];
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
      return isRecord4(item) ? recordSummary2(item) : null;
    }).filter((item) => Boolean(item));
  }
  if (isRecord4(value)) {
    const summary = recordSummary2(value);
    return summary ? [summary] : [];
  }
  return [];
}
function stringAt2(data, path) {
  let current = data;
  for (const key of path) {
    if (!isRecord4(current)) return null;
    current = current[key];
  }
  return primitiveToString2(current);
}
function sceneLine(data) {
  const parts = [
    stringAt2(data, ["scene", "location"]),
    stringAt2(data, ["scene", "date"]) ?? stringAt2(data, ["scene", "time"]),
    stringAt2(data, ["scene", "mood"]),
    stringAt2(data, ["scene", "danger_level"])
  ].filter((item) => Boolean(item));
  return parts.length > 0 ? parts.join(", ") : null;
}
function characterNames(data) {
  return listFromUnknown2(data.characters_present).map((item) => item.split(" - ")[0]?.trim() ?? item.trim()).filter(Boolean);
}
function importantState(data) {
  const facts = listFromUnknown2(data.important_facts);
  const continuity = listFromUnknown2(data.unresolved_continuity);
  const pressure = listFromUnknown2(data.next_scene_pressure);
  return [...facts, ...continuity, ...pressure].slice(0, 8);
}
function openThreads(data) {
  return listFromUnknown2(data.active_threads).slice(0, 8);
}
function fallbackSummary(data) {
  const fragments = Object.entries(data).map(([key, value]) => {
    if (isRecord4(value)) return `${key}: ${recordSummary2(value) ?? "set"}`;
    const list = listFromUnknown2(value);
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
  lines.push(`Location: ${stringAt2(snapshot.data, ["scene", "location"]) ?? "Unknown"}`);
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
  return truncateSafe2(raw, settings.maxInjectedChars);
}

// src/shared/swipeIdentity.ts
var DEFAULT_SWIPE_KEY = "default";
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

// src/shared/messageDisplay.ts
var MESSAGE_WIDGET_ID = "ltracker-message-tracker";
var MESSAGE_NATIVE_TOOLBAR_SUPPORTED = false;
var MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON = "lumiverse-spindle-types@0.5.21 exposes message DOM helpers, message widgets, message tags, and message_footer mounting, but no per-message toolbar action slot.";
var LTRACKER_DOM_TRACKER_CSS = `
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
  return truncateSafe2(JSON.stringify({
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
  const warnings = [];
  const errors = [];
  const json = displayJson(input.messageId, input.messageIndex, input.attachedSnapshot, snapshot, input.settings);
  let html = "";
  let textFallback = truncateSafe2(formatTemplateTextFallback(snapshot.data), input.settings.maxRenderedChars);
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
      presetName: input.preset.name
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

// src/shared/embeddedTrackerTag.ts
var LTRACKER_TAG_NAME = "ltracker";
var LTRACKER_TAG_TYPE = "state";

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
function estimateTokensFromChars(chars) {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars / CHARS_PER_ESTIMATED_TOKEN);
}
function estimateCharsFromTokens(tokens) {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;
  return Math.round(tokens * CHARS_PER_ESTIMATED_TOKEN);
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
  expandedContentMaxHeightVh: { min: 30, max: 95, default: 80 }
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
.ltracker-section-nav,
.ltracker-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ltracker-nav-chip,
.ltracker-chip {
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 999px;
  color: inherit;
  display: inline-flex;
  font-size: 0.78rem;
  line-height: 1.2;
  min-height: 28px;
  padding: 5px 8px;
  text-decoration: none;
}
.ltracker-nav-chip {
  background: color-mix(in srgb, currentColor 5%, transparent);
}
.ltracker-section {
  scroll-margin-top: 12px;
}
.ltracker-section-title {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
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
.ltracker-reader-fixed-close {
  align-items: center;
  background: #ea4335;
  border: 1px solid #ff8a80;
  border-radius: 999px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  font: 700 22px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  height: 44px;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  padding: 0;
  position: fixed;
  right: max(10px, env(safe-area-inset-right));
  top: max(10px, env(safe-area-inset-top));
  width: 44px;
  z-index: 1000002;
}
.ltracker-display-preview-overlay {
  inset: 0;
  pointer-events: none;
  position: fixed;
  z-index: 999998;
}
.ltracker-display-preview-panel {
  background: #161616;
  border: 1px solid #333;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  color: #eee;
  display: flex;
  flex-direction: column;
  font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  max-height: 76vh;
  overflow: hidden;
  pointer-events: auto;
  position: fixed;
}
.ltracker-display-preview-header {
  align-items: center;
  border-bottom: 1px solid #333;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
  padding: 9px 12px;
}
.ltracker-display-preview-body {
  overflow: auto;
  padding: 12px;
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
.ltracker-save-status {
  align-items: center;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 999px;
  display: inline-flex;
  min-height: 34px;
  opacity: 0.78;
  padding: 6px 10px;
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
.ltracker-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ltracker-editor-textarea {
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, currentColor 6%, transparent);
  color: inherit;
  font: 12px/1.42 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  min-height: 220px;
  padding: 8px;
  resize: vertical;
  width: 100%;
}
.ltracker-editor-error {
  color: #ff6b6b;
  min-height: 1em;
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
.ltracker-history-list {
  display: grid;
  gap: 10px;
}
.ltracker-history-entry {
  border: 1px solid color-mix(in srgb, currentColor 13%, transparent);
  border-radius: 8px;
  padding: 9px;
}
.ltracker-history-entry summary {
  cursor: pointer;
  font-weight: 650;
}
.ltracker-history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 4px;
  opacity: 0.74;
  font-size: 0.78rem;
}
.ltr-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.ltracker-dom-popover {
  margin: 0 0 6px;
}
.ltracker-dom-popover summary {
  cursor: pointer;
  list-style: none;
}
.ltracker-dom-popover summary::-webkit-details-marker {
  display: none;
}
.ltracker-dom-popover-button {
  align-items: center;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 8px;
  display: inline-flex;
  gap: 7px;
  min-height: 30px;
  padding: 4px 8px;
}
.ltracker-dom-popover-panel {
  border: 1px solid color-mix(in srgb, currentColor 13%, transparent);
  border-radius: 8px;
  margin-top: 6px;
  max-height: 52vh;
  overflow: auto;
  padding: 8px;
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
.ltracker-undo-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: color-mix(in srgb, currentColor 8%, transparent);
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 0.85rem;
}
.ltracker-undo-banner button {
  background: #3b82f6;
  color: #fff;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}
.ltracker-undo-banner button:hover {
  opacity: 0.9;
}
.ltracker-confirm-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.ltracker-confirm-dialog {
  background: var(--ltracker-bg, #1e1e1e);
  color: var(--ltracker-fg, #ffffff);
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 12px;
  padding: 20px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}
.ltracker-confirm-dialog h3 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 1.15rem;
}
.ltracker-confirm-dialog p {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 0.92rem;
  line-height: 1.4;
  opacity: 0.85;
}
.ltracker-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.ltd-danger {
  background: #ef4444 !important;
  color: #fff !important;
  border-color: #ef4444 !important;
}
.ltd-danger:hover {
  background: #dc2626 !important;
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
      chatMutation: false,
      contextHandler: false,
      interceptor: false
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
      interceptorRegistered: false,
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
      lastRenderSnapshotCreatedAt: null,
      lastRenderSource: null,
      lastRenderStatus: null,
      lastRenderWarnings: [],
      lastRenderErrors: [],
      lastSanitizedHtmlChars: 0,
      lastFallbackTextChars: 0,
      contextHandlerRegistered: false,
      contextHandlerDisabledReason: "Context handler injection remains disabled in 0.15; safe normal prompt injection uses the Lumiverse interceptor path instead.",
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
      messageLocalUiSupported: false,
      messageLocalUiFallbackReason: null,
      messageSnapshotIndexCount: 0,
      lastWidgetRegenerateMessageId: null,
      lastWidgetRegenerateStartedAt: null,
      lastWidgetRegenerateCompletedAt: null,
      lastWidgetRegenerateDurationMs: null,
      lastWidgetRegenerateCancelledAt: null,
      lastWidgetRegenerateError: null,
      activeWidgetRegenerationCount: 0,
      messageWidgetPlacementResolved: "host_default",
      messageWidgetPlacementReason: null,
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
      selectedConnectionId: null,
      selectedConnectionName: null,
      selectedConnectionAvailable: false,
      connectionListCount: 0,
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
      connectionProfileSelected: false,
      effectiveTrackerConnectionMode: "active_quiet",
      effectiveTrackerConnectionReason: "default",
      lastSelectedConnectionFallbackReason: null,
      lastTrackerProfileMissingAt: null,
      lastDisplaySurface: "inline_contained",
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
      lastWidthOverflowDetected: null
    },
    memoryPreview: null,
    injectionPreview: null,
    renderPreview: null,
    messageSnapshotHistory: [],
    messageControlCandidates: [],
    presets: [DEFAULT_TRACKER_PRESET],
    activePreset: DEFAULT_TRACKER_PRESET,
    activePresetState: {
      selectedPresetId: DEFAULT_TRACKER_PRESET.id,
      selectedAt: (/* @__PURE__ */ new Date(0)).toISOString()
    },
    connectionProfiles: []
  };
}
function isRecord5(value) {
  return typeof value === "object" && value !== null;
}
function isBackendMessage(payload) {
  return isRecord5(payload) && typeof payload.type === "string";
}
function escapeHtml2(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function checked(value) {
  return value ? " checked" : "";
}
function disabled(value) {
  return value ? " disabled" : "";
}
function selected(value) {
  return value ? " selected" : "";
}
function labelForStatus(status) {
  if (status === "generating") return "generating";
  if (status === "error") return "error";
  return "idle";
}
function renderRow(label, value) {
  return `
    <div class="ltracker-key">${escapeHtml2(label)}</div>
    <div class="ltracker-value">${escapeHtml2(value === null || value === "" ? "None" : String(value))}</div>
  `;
}
function numberInputValue(value) {
  return value === null ? "" : String(value);
}
function compactRecord(value) {
  if (!value) return null;
  return JSON.stringify(value);
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
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function formatDurationMs2(durationMs) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return null;
  if (durationMs < 1e3) return `${Math.round(durationMs)}ms`;
  const seconds = durationMs / 1e3;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}
function budgetHint(tokens) {
  return `~${estimateCharsFromTokens(tokens).toLocaleString()} chars`;
}
function charLimitHint(chars) {
  return `~${estimateTokensFromChars(chars).toLocaleString()} tokens`;
}
function requestId(prefix) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
function setup(ctx) {
  const cleanups = [];
  let state = emptyState();
  let disposed = false;
  const widgetCleanups = /* @__PURE__ */ new Map();
  const widgetSignatures = /* @__PURE__ */ new Map();
  const domInjections = /* @__PURE__ */ new Map();
  const domSignatures = /* @__PURE__ */ new Map();
  const embeddedTagEntries = /* @__PURE__ */ new Map();
  const optimisticJobs = /* @__PURE__ */ new Map();
  let settingsAutosaveTimer = null;
  let settingsSaveStatus = "saved";
  let historyFilterText = "";
  let historyShowDuplicates = false;
  let historyCurrentMessageOnly = false;
  let historyErrorsOnly = false;
  let historyCurrentPresetOnly = false;
  let historySelectedSwipeOnly = false;
  let currentHistoryLimit = 25;
  let recentlyDeletedBanner = null;
  let stagedImportPack = null;
  let stagedImportRawText = "";
  let stagedValidationReport = null;
  let stagedSampleSnapshot = null;
  let stagedSampleRenderResult = null;
  let activePopoverElement = null;
  let activePopoverEntry = null;
  let activeReaderElement = null;
  let activeDisplayPreviewElement = null;
  const removeStyle = ctx.dom.addStyle(STYLES);
  cleanups.push(removeStyle);
  if (!document.getElementById("ltracker-dom-style")) {
    const styleTag = document.createElement("style");
    styleTag.id = "ltracker-dom-style";
    styleTag.textContent = LTRACKER_DOM_TRACKER_CSS;
    document.head.appendChild(styleTag);
  }
  const handleGlobalKeyDown = (e) => {
    if (e.key === "Escape") {
      if (state.settings.expandedWidth.closeOnEscape) {
        if (activePopoverElement) {
          closePopover();
        }
        if (activeReaderElement) {
          closeFullscreenReader();
        }
        if (activeDisplayPreviewElement) {
          closeDisplayPreview();
        }
      }
    }
  };
  document.addEventListener("keydown", handleGlobalKeyDown);
  cleanups.push(() => document.removeEventListener("keydown", handleGlobalKeyDown));
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
  const elapsedTimer = setInterval(updateElapsedTimers, 250);
  cleanups.push(() => clearInterval(elapsedTimer));
  function activeChatId() {
    return ctx.getActiveChat().chatId;
  }
  function currentChatId() {
    return state.chatId ?? activeChatId();
  }
  function send(message) {
    if (disposed) return;
    if (message.type === "ready" || message.type === "refresh_state") {
      message.historyLimit = currentHistoryLimit;
    }
    ctx.sendToBackend(message);
  }
  function trackerEntryKey(messageId, swipeKey) {
    return `${messageId}:${swipeKey}`;
  }
  function stateActiveJob(messageId, swipeKey) {
    return state.diagnostics.activeTrackerJobs.find((job) => job.messageId === messageId && job.swipeKey === swipeKey) ?? null;
  }
  function activeJobFor(messageId, swipeKey) {
    const key = trackerEntryKey(messageId, swipeKey);
    const optimistic = optimisticJobs.get(key) ?? null;
    const active = stateActiveJob(messageId, swipeKey);
    return {
      isActive: Boolean(optimistic || active),
      jobId: active?.jobId ?? optimistic?.jobId ?? null,
      startedAt: optimistic?.startedAt ?? active?.startedAt ?? null
    };
  }
  function beginOptimisticJob(messageId, swipeKey) {
    optimisticJobs.set(trackerEntryKey(messageId, swipeKey), {
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      jobId: null
    });
  }
  function endOptimisticJob(messageId, swipeKey) {
    optimisticJobs.delete(trackerEntryKey(messageId, swipeKey));
  }
  function syncOptimisticJobsFromState(nextState) {
    const activeKeys = new Set(nextState.diagnostics.activeTrackerJobs.map((job) => trackerEntryKey(job.messageId, job.swipeKey)));
    for (const key of Array.from(optimisticJobs.keys())) {
      if (activeKeys.has(key) || nextState.status !== "generating") optimisticJobs.delete(key);
    }
  }
  function noteInlineAction(action, messageId, swipeKey, error = null) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    localDiagnostics({
      lastInlineActionClicked: action,
      lastInlineActionAt: now,
      lastInlineActionError: error,
      lastMessageControlMessageId: messageId,
      lastMessageControlSwipeKey: swipeKey
    });
    if (action === "generate") {
      localDiagnostics({
        lastGenerateButtonMessageId: messageId,
        lastGenerateButtonClickedAt: now
      });
    }
  }
  function settingsSaveStatusLabel() {
    if (settingsSaveStatus === "saving") return "Saving...";
    if (settingsSaveStatus === "failed") return "Save failed";
    return "Saved";
  }
  function setSettingsSaveStatus(status) {
    settingsSaveStatus = status;
    const label = settingsSaveStatusLabel();
    for (const element of Array.from(tab.root.querySelectorAll("[data-settings-save-status]"))) {
      element.textContent = label;
    }
  }
  function clearSettingsAutosaveTimer() {
    if (!settingsAutosaveTimer) return;
    clearTimeout(settingsAutosaveTimer);
    settingsAutosaveTimer = null;
  }
  function scheduleSettingsAutosave() {
    clearSettingsAutosaveTimer();
    setSettingsSaveStatus("saving");
    settingsAutosaveTimer = setTimeout(() => {
      settingsAutosaveTimer = null;
      saveSettings("settings-auto");
    }, 650);
  }
  function isSettingsControl(target) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("[data-setting], [data-auto-timing-setting], [data-budget-setting], [data-memory-setting], [data-injection-setting], [data-renderer-setting], [data-message-display-setting], [data-expanded-width-setting], [data-connection-setting], [data-connection-parameter], [data-connection-reasoning]"));
  }
  function isDisplaySurfaceControl(target) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('[data-message-display-setting="displaySurface"], [data-expanded-width-setting]'));
  }
  function applyDisplaySettingsOptimistically(renderAfter = false) {
    state = {
      ...state,
      settings: readSettings()
    };
    hydrateMessageWidgets();
    localDiagnostics({
      selectedDisplaySurface: state.settings.messageDisplay.displaySurface,
      resolvedDisplaySurface: resolveDisplaySurface(state.settings),
      displaySurfaceKind: displaySurfaceKind(resolveDisplaySurface(state.settings)),
      lastDisplaySurfaceRehydratedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (renderAfter) render();
  }
  function localDiagnostics(update) {
    state = {
      ...state,
      diagnostics: {
        ...state.diagnostics,
        ...update
      }
    };
  }
  function rerenderHistoryEntry(entry) {
    const active = activeJobFor(entry.indexEntry.messageId, entry.indexEntry.swipeKey);
    const wasRegenerating = entry.rendered.isRegenerating;
    const chatId = entry.snapshot?.chatId ?? state.chatId ?? activeChatId() ?? "";
    return {
      ...entry,
      rendered: renderMessageTracker({
        messageId: entry.indexEntry.messageId,
        messageIndex: entry.indexEntry.messageIndex,
        attachedSnapshot: entry.snapshot,
        latestChatSnapshot: state.snapshot,
        preset: state.activePreset,
        settings: state.settings.messageDisplay,
        swipeIdentity: {
          chatId,
          messageId: entry.indexEntry.messageId,
          swipeKey: entry.indexEntry.swipeKey,
          swipeIndex: entry.indexEntry.swipeIndex,
          swipeId: entry.indexEntry.swipeId,
          swipeContentHash: entry.indexEntry.swipeContentHash,
          swipeKeySource: entry.indexEntry.swipeKeySource
        },
        isRegenerating: active.isActive || wasRegenerating,
        activeJobId: active.jobId ?? entry.rendered.activeJobId,
        activeJobStartedAt: active.startedAt ?? (wasRegenerating ? entry.rendered.generationStartedAt : null)
      })
    };
  }
  function allIndexedHistoryEntries() {
    const active = currentChatId();
    const entries = [];
    for (const entry of state.messageSnapshotHistory) {
      if (active && entry.snapshot?.chatId && entry.snapshot.chatId !== active) continue;
      entries.push(rerenderHistoryEntry(entry));
    }
    for (const entry of embeddedTagEntries.values()) {
      if (active && entry.snapshot?.chatId && entry.snapshot.chatId !== active) continue;
      entries.push(rerenderHistoryEntry(entry));
    }
    return entries;
  }
  function allRenderableEntries() {
    const entries = /* @__PURE__ */ new Map();
    for (const entry of groupMessageTrackerHistory(allIndexedHistoryEntries(), false).entries) {
      entries.set(trackerEntryKey(entry.indexEntry.messageId, entry.indexEntry.swipeKey), entry);
    }
    for (const entry of state.messageControlCandidates) {
      const key = trackerEntryKey(entry.indexEntry.messageId, entry.indexEntry.swipeKey);
      if (entries.has(key)) continue;
      entries.set(key, rerenderHistoryEntry(entry));
    }
    return Array.from(entries.values());
  }
  function findHistoryEntry(messageId, swipeKey = null) {
    if (!messageId) return null;
    return allRenderableEntries().find((entry) => {
      return entry.indexEntry.messageId === messageId && (!swipeKey || entry.indexEntry.swipeKey === swipeKey);
    }) ?? null;
  }
  function activeWidgetJobId(messageId, swipeKey) {
    const active = activeJobFor(messageId, swipeKey);
    return active.jobId ?? findHistoryEntry(messageId, swipeKey)?.rendered.activeJobId ?? null;
  }
  function generateMessageTracker(messageId, swipeKey) {
    beginOptimisticJob(messageId, swipeKey);
    noteInlineAction("generate", messageId, swipeKey);
    hydrateMessageWidgets();
    send({
      type: "generate_message_tracker",
      chatId: activeChatId(),
      messageId,
      swipeKey,
      requestId: requestId("widget-generate")
    });
  }
  function toggleMessageRegeneration(messageId, swipeKey, jobId = null) {
    const active = activeJobFor(messageId, swipeKey);
    const activeJobId = jobId || active.jobId || activeWidgetJobId(messageId, swipeKey);
    if (active.isActive || activeJobId) {
      endOptimisticJob(messageId, swipeKey);
      noteInlineAction("cancel", messageId, swipeKey);
      hydrateMessageWidgets();
      send({
        type: "cancel_tracker_generation",
        chatId: activeChatId(),
        jobId: activeJobId,
        messageId,
        swipeKey,
        requestId: requestId("widget-cancel")
      });
      return;
    }
    beginOptimisticJob(messageId, swipeKey);
    noteInlineAction("regenerate", messageId, swipeKey);
    hydrateMessageWidgets();
    send({
      type: "regenerate_message_tracker",
      chatId: activeChatId(),
      messageId,
      swipeKey,
      requestId: requestId("widget-regenerate")
    });
  }
  function handleWidgetPayload(expectedMessageId, expectedSwipeKey, payload) {
    if (!isRecord5(payload) || payload.type !== "ltracker_widget_action" || payload.action !== "toggle_regenerate" && payload.action !== "generate" || payload.messageId !== expectedMessageId) return;
    if ("swipeKey" in payload && payload.swipeKey !== expectedSwipeKey) return;
    const jobId = typeof payload.jobId === "string" && payload.jobId ? payload.jobId : null;
    if (payload.action === "generate") generateMessageTracker(expectedMessageId, expectedSwipeKey);
    else toggleMessageRegeneration(expectedMessageId, expectedSwipeKey, jobId);
  }
  function cleanupMessageWidgets(keepKeys = /* @__PURE__ */ new Set()) {
    for (const [key, cleanup] of widgetCleanups) {
      if (keepKeys.has(key)) continue;
      cleanup();
      widgetCleanups.delete(key);
      widgetSignatures.delete(key);
    }
  }
  function cleanupDomInjections(keepKeys = /* @__PURE__ */ new Set()) {
    for (const [key, record] of domInjections) {
      if (keepKeys.has(key)) continue;
      record.cleanup();
      domInjections.delete(key);
      domSignatures.delete(key);
    }
  }
  function markInjectedTrackerGenerating(root) {
    const startedAt = (/* @__PURE__ */ new Date()).toISOString();
    const button = root.querySelector("[data-ltracker-dom-action='toggle_regenerate'], [data-ltracker-dom-action='generate']");
    button?.classList.add("ltd-spinning");
    button?.setAttribute("data-ltracker-dom-action", "toggle_regenerate");
    button?.setAttribute("title", "Cancel tracker generation");
    button?.setAttribute("aria-label", "Cancel tracker generation");
    const status = root.querySelector("[data-ltracker-status]");
    if (status) status.textContent = "generating";
    const elapsed = root.querySelector("[data-ltracker-elapsed]");
    if (elapsed) {
      elapsed.dataset.startedAt = startedAt;
      elapsed.textContent = "0ms";
    }
  }
  function updateElapsedTimers() {
    const now = Date.now();
    for (const element of ctx.dom.queryAll("[data-ltracker-elapsed]")) {
      if (!(element instanceof HTMLElement)) continue;
      const startedAt = element.dataset.startedAt;
      if (!startedAt) continue;
      const startedMs = Date.parse(startedAt);
      if (!Number.isFinite(startedMs)) continue;
      element.textContent = formatDurationMs2(now - startedMs) ?? "0ms";
    }
  }
  function handleDomTrackerAction(event) {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-ltracker-dom-action]") : null;
    if (!target) return;
    const tracker = target.closest("[data-ltracker-message-id][data-ltracker-swipe-key]");
    if (!tracker) return;
    const messageId = ctx.dom.getMessageId(target) ?? tracker.dataset.ltrackerMessageId;
    const swipeKey = tracker.dataset.ltrackerSwipeKey;
    if (!messageId || !swipeKey) return;
    const action = target.dataset.ltrackerDomAction;
    const entry = findHistoryEntry(messageId, swipeKey);
    if (action === "generate") {
      markInjectedTrackerGenerating(tracker);
      generateMessageTracker(messageId, swipeKey);
    }
    if (action === "toggle_regenerate") {
      markInjectedTrackerGenerating(tracker);
      toggleMessageRegeneration(messageId, swipeKey, entry?.rendered.activeJobId ?? null);
    }
    if (action === "reader" && entry) {
      event.preventDefault();
      openFullscreenReader(entry);
    }
    if (action === "edit" && entry) {
      noteInlineAction("edit", messageId, swipeKey);
      openTrackerEditor(entry);
    }
    if (action === "delete") {
      noteInlineAction("delete", messageId, swipeKey);
      void deleteMessageTracker(messageId, swipeKey);
    }
  }
  function renderInlineTrackerHtml(entry) {
    return entry.rendered.domHtml;
  }
  function queryMountPoint(root, selector) {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }
  function displaySurfaceKind(surface) {
    if (surface === "drawer_only") return "drawer_only";
    if (surface === "anchored_popover" || surface === "fullscreen_reader") return "overlay";
    return "inline";
  }
  function elementWidth(element) {
    if (!(element instanceof HTMLElement)) return 0;
    return element.getBoundingClientRect().width || element.clientWidth || 0;
  }
  function findWideMessageRow(messageElement) {
    const doc = messageElement.ownerDocument || document;
    const viewWidth = doc.defaultView?.innerWidth ?? 0;
    let best = messageElement;
    let bestWidth = elementWidth(messageElement);
    let current = messageElement.parentElement;
    let hops = 0;
    while (current && current !== doc.body && hops < 7) {
      const width = elementWidth(current);
      if (width > bestWidth + 24) {
        best = current;
        bestWidth = width;
      }
      if (viewWidth > 0 && width >= viewWidth * 0.72) break;
      current = current.parentElement;
      hops += 1;
    }
    return best;
  }
  function resolveTrackerMountPoint(messageElement, surface) {
    if (surface === "inline_wide") {
      const wideTarget = findWideMessageRow(messageElement);
      if (wideTarget && wideTarget !== messageElement) {
        return { target: wideTarget, strategy: "wide_message_row", fallbackReason: null };
      }
      return { target: messageElement, strategy: "wide_message_element", fallbackReason: wideTarget ? null : "wide row search returned no usable parent" };
    }
    const officialBody = queryMountPoint(
      messageElement,
      "[data-lumiverse-message-body], [data-message-body], [data-message-content], [data-chat-message-content]"
    );
    if (officialBody) {
      return { target: officialBody, strategy: "official_message_body", fallbackReason: null };
    }
    const scopedBubble = queryMountPoint(messageElement, ":scope > div[class*='bubble']");
    if (scopedBubble) {
      return { target: scopedBubble, strategy: "bubble_adapter", fallbackReason: null };
    }
    const nestedBubble = queryMountPoint(messageElement, "div[class*='bubble']");
    if (nestedBubble) {
      return { target: nestedBubble, strategy: "bubble_adapter", fallbackReason: null };
    }
    return { target: messageElement, strategy: "official_message_element", fallbackReason: null };
  }
  function positionForPlacement(placement) {
    return placement === "top" ? "afterbegin" : "beforeend";
  }
  function resolveDisplaySurface(settings) {
    if (settings.messageDisplay.displaySurface) return settings.messageDisplay.displaySurface;
    const displayMode = settings.messageDisplay.displayMode;
    const widthMode = settings.expandedWidth.expandedWidthMode;
    if (displayMode === "drawer_history_only") return "drawer_only";
    if (displayMode === "inline_button_popover") return "anchored_popover";
    if (displayMode === "inline_full") {
      if (widthMode === "contained") return "inline_contained";
      if (widthMode === "wide" || widthMode === "full_mobile") return "inline_wide";
      if (widthMode === "popover") return "anchored_popover";
    }
    return "inline_contained";
  }
  function displayModeForSurface(surface) {
    if (surface === "drawer_only") return "drawer_history_only";
    if (surface === "anchored_popover") return "inline_button_popover";
    return "inline_full";
  }
  function togglePopover(entry, anchorElement) {
    if (activePopoverEntry && activePopoverEntry.indexEntry.messageId === entry.indexEntry.messageId && activePopoverEntry.indexEntry.swipeKey === entry.indexEntry.swipeKey) {
      closePopover();
    } else {
      openPopover(entry, anchorElement);
    }
  }
  function openPopover(entry, anchorElement, preview = false) {
    closePopover();
    closeFullscreenReader();
    closeDisplayPreview();
    const doc = anchorElement.ownerDocument || document;
    const overlay = doc.createElement("div");
    overlay.className = "ltracker-popover-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "999999",
      pointerEvents: "none"
    });
    const backdrop = doc.createElement("div");
    backdrop.className = "ltracker-popover-backdrop";
    Object.assign(backdrop.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: state.settings.expandedWidth.popoverBackdrop ? "rgba(0,0,0,0.55)" : "transparent",
      pointerEvents: "auto"
    });
    if (state.settings.expandedWidth.closeOnBackdropClick) {
      backdrop.addEventListener("click", closePopover);
    }
    overlay.appendChild(backdrop);
    const panel = doc.createElement("div");
    panel.className = "ltracker-popover-panel";
    const width = state.settings.expandedWidth;
    const body = entry.rendered.html || `<pre class="ltd-pre" style="white-space: pre-wrap; word-break: break-word;">${escapeHtml2(entry.rendered.textFallback)}</pre>`;
    const meta = [
      entry.rendered.presetName ? entry.rendered.presetName : null,
      entry.rendered.snapshotCreatedAt ? entry.rendered.snapshotCreatedAt : null,
      entry.rendered.controlState.debugSwipeLabel
    ].filter((item) => Boolean(item)).join(" / ");
    const duration = state.settings.messageDisplay.showGenerationDuration ? formatDurationMs2(entry.rendered.generationDurationMs) : null;
    const elapsedMarkup = state.settings.messageDisplay.showGenerationDuration ? entry.rendered.isRegenerating && entry.rendered.generationStartedAt ? `<span class="ltd-pill" data-started-at="${escapeHtml2(entry.rendered.generationStartedAt)}">${escapeHtml2(currentRunningDuration(entry.rendered.generationStartedAt) ?? "0ms")}</span>` : duration ? `<span class="ltd-pill">${escapeHtml2(duration)}</span>` : "" : "";
    const statusMarkup = entry.rendered.isRegenerating ? `<span class="ltd-pill" data-ltracker-status>generating</span>` : entry.rendered.controlState.error ? `<span class="ltd-pill ltd-warning" data-ltracker-status>warning</span>` : "";
    panel.innerHTML = `
      <div class="ltd-popover-header" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; min-width: 0; border-bottom: 1px solid #333; padding: 8px 10px 8px 12px; background: #222; border-top-left-radius: 8px; border-top-right-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; font-family: sans-serif; min-width: 0; flex: 1 1 auto; flex-wrap: wrap;">
          <span style="font-weight: bold; color: #9b5cff; font-size: 13px;">${preview ? "LTracker Popover Preview" : "LTracker Popover"}</span>
          <span style="font-size: 11px; color: #aaa; min-width: 0; max-width: min(42vw, 250px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml2(meta)}</span>
          ${elapsedMarkup}
          ${statusMarkup}
        </div>
        <div class="ltd-popover-actions" style="display: flex; gap: 4px; align-items: center; flex: 0 0 auto;">
          <button class="ltd-icon-button" data-popover-action="reader" title="Open fullscreen reader" style="width: 22px; height: 22px; padding: 0;">${iconSvg("reader")}</button>
          <button class="ltd-icon-button" data-popover-action="toggle_regenerate" title="Regenerate" style="width: 22px; height: 22px; padding: 0;">${iconSvg(entry.rendered.isRegenerating ? "stop" : "refresh")}</button>
          <button class="ltd-icon-button" data-popover-action="edit" title="Edit" style="width: 22px; height: 22px; padding: 0;">${iconSvg("edit")}</button>
          <button class="ltd-icon-button" data-popover-action="delete" title="Delete" style="width: 22px; height: 22px; padding: 0;">${iconSvg("delete")}</button>
          <button class="ltd-icon-button" data-popover-action="close" title="Close" style="background: #ea4335; border-color: #ea4335; color: #fff; min-width: 44px; min-height: 44px; width: 44px; height: 44px; padding: 0; font-weight: bold; font-size: 20px; line-height: 1;">&times;</button>
        </div>
      </div>
      <div class="ltd-popover-body" style="padding: 12px; overflow-y: auto; background: #161616; flex: 1; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; overflow-x: auto; max-width: 100%;">
        ${body}
      </div>
    `;
    Object.assign(panel.style, {
      position: "absolute",
      background: "#161616",
      border: "1px solid #333",
      borderRadius: "8px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
      color: "#eee",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "12px",
      pointerEvents: "auto",
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
      maxWidth: "calc(100vw - max(20px, env(safe-area-inset-left) + env(safe-area-inset-right)))",
      maxHeight: "calc(100vh - max(20px, env(safe-area-inset-top) + env(safe-area-inset-bottom)))",
      overflow: "hidden"
    });
    const anchorRect = anchorElement.getBoundingClientRect();
    const isMobile = doc.defaultView ? doc.defaultView.innerWidth < width.fullscreenBreakpointPx : false;
    const viewWidth = doc.defaultView ? doc.defaultView.innerWidth : 800;
    const viewHeight = doc.defaultView ? doc.defaultView.innerHeight : 600;
    if (isMobile || width.preferFullscreenOnMobile && isMobile) {
      Object.assign(panel.style, {
        width: `calc(100vw - ${Math.max(8, width.mobileHorizontalMarginPx * 2)}px)`,
        height: `${width.expandedContentMaxHeightVh}vh`,
        bottom: `max(${Math.max(4, width.mobileHorizontalMarginPx)}px, env(safe-area-inset-bottom))`,
        left: `max(${Math.max(4, width.mobileHorizontalMarginPx)}px, env(safe-area-inset-left))`,
        right: `max(${Math.max(4, width.mobileHorizontalMarginPx)}px, env(safe-area-inset-right))`,
        position: "fixed"
      });
    } else {
      const panelWidth = Math.min(width.maxExpandedWidthPx, viewWidth - 40);
      const panelHeight = Math.min(viewHeight * width.expandedContentMaxHeightVh / 100, 800);
      Object.assign(panel.style, {
        width: `${panelWidth}px`,
        height: `${panelHeight}px`
      });
      const top = anchorRect.bottom + (doc.defaultView?.scrollY ?? 0);
      const left = Math.max(10, Math.min(viewWidth - panelWidth - 20, anchorRect.left + (doc.defaultView?.scrollX ?? 0)));
      if (top + panelHeight > viewHeight + (doc.defaultView?.scrollY ?? 0)) {
        const topAbove = anchorRect.top + (doc.defaultView?.scrollY ?? 0) - panelHeight - 10;
        if (topAbove > 10) {
          panel.style.top = `${topAbove}px`;
        } else {
          panel.style.top = "50%";
          panel.style.left = "50%";
          panel.style.transform = "translate(-50%, -50%)";
          panel.style.position = "fixed";
        }
      } else {
        panel.style.top = `${top}px`;
      }
      if (panel.style.position !== "fixed") {
        panel.style.left = `${left}px`;
      }
    }
    panel.addEventListener("click", (e) => {
      const btn = e.target instanceof HTMLElement ? e.target.closest("[data-popover-action]") : null;
      if (!btn) return;
      const action = btn.dataset.popoverAction;
      const messageId = entry.indexEntry.messageId;
      const swipeKey = entry.indexEntry.swipeKey;
      if (action === "close") {
        closePopover();
      }
      if (action === "reader") {
        closePopover();
        openFullscreenReader(entry);
      }
      if (action === "toggle_regenerate") {
        toggleMessageRegeneration(messageId, swipeKey, entry.rendered.activeJobId ?? null);
        closePopover();
      }
      if (action === "edit") {
        closePopover();
        openTrackerEditor(entry);
      }
      if (action === "delete") {
        closePopover();
        void deleteMessageTracker(messageId, swipeKey);
      }
    });
    overlay.appendChild(panel);
    doc.body.appendChild(overlay);
    activePopoverElement = overlay;
    activePopoverEntry = entry;
    localDiagnostics({
      lastDisplaySurface: "anchored_popover",
      lastPopoverOpenedAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastPopoverMessageId: entry.indexEntry.messageId,
      lastPopoverSwipeKey: entry.indexEntry.swipeKey,
      lastPopoverWidthPx: panel.offsetWidth || null,
      lastPopoverHeightPx: panel.offsetHeight || null,
      lastResolvedViewportWidth: viewWidth,
      lastResolvedViewportHeight: viewHeight,
      lastDisplayPreviewAction: preview ? "popover" : state.diagnostics.lastDisplayPreviewAction,
      lastDisplayPreviewResult: preview ? "opened" : state.diagnostics.lastDisplayPreviewResult,
      lastDisplayPreviewReason: preview ? "Opened detached popover preview." : state.diagnostics.lastDisplayPreviewReason
    });
  }
  function closePopover() {
    if (activePopoverElement) {
      activePopoverElement.remove();
      activePopoverElement = null;
      activePopoverEntry = null;
    }
  }
  function openFullscreenReader(entry, preview = false) {
    closePopover();
    closeFullscreenReader();
    closeDisplayPreview();
    const doc = document;
    const overlay = doc.createElement("div");
    overlay.className = "ltracker-reader-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      background: "#111",
      zIndex: "999999",
      color: "#eee",
      fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
      overflow: "hidden"
    });
    const meta = [
      entry.rendered.presetName ? entry.rendered.presetName : null,
      entry.rendered.snapshotCreatedAt ? entry.rendered.snapshotCreatedAt : null,
      entry.rendered.controlState.debugSwipeLabel
    ].filter((item) => Boolean(item)).join(" / ");
    const duration = state.settings.messageDisplay.showGenerationDuration ? formatDurationMs2(entry.rendered.generationDurationMs) : null;
    const elapsedMarkup = state.settings.messageDisplay.showGenerationDuration ? entry.rendered.isRegenerating && entry.rendered.generationStartedAt ? `<span class="ltd-pill" data-started-at="${escapeHtml2(entry.rendered.generationStartedAt)}">${escapeHtml2(currentRunningDuration(entry.rendered.generationStartedAt) ?? "0ms")}</span>` : duration ? `<span class="ltd-pill">${escapeHtml2(duration)}</span>` : "" : "";
    const statusMarkup = entry.rendered.isRegenerating ? `<span class="ltd-pill" data-ltracker-status>generating</span>` : entry.rendered.controlState.error ? `<span class="ltd-pill ltd-warning" data-ltracker-status>warning</span>` : "";
    const body = entry.rendered.html || `<pre class="ltd-pre" style="white-space: pre-wrap; word-break: break-word;">${escapeHtml2(entry.rendered.textFallback)}</pre>`;
    overlay.innerHTML = `
      <button class="ltracker-reader-fixed-close" data-reader-action="close" title="Close Reader" aria-label="Close Reader">&times;</button>
      <header class="ltracker-reader-header" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; min-width: 0; border-bottom: 1px solid #333; padding: calc(10px + env(safe-area-inset-top)) 64px 10px 16px; background: #1a1a1a; font-family: sans-serif; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 260px; flex-wrap: wrap;">
          <h2 style="margin: 0; font-size: 15px; font-weight: bold; color: #9b5cff; min-width: 0;">${preview ? "LTracker Reader Preview" : "LTracker Reader"}</h2>
          <span style="font-size: 11px; color: #aaa; min-width: 0; max-width: min(52vw, 350px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml2(meta)}</span>
          ${elapsedMarkup}
          ${statusMarkup}
        </div>
        <div style="display: flex; gap: 6px; align-items: center; flex: 0 0 auto; padding-right: 44px;">
          <button class="ltd-icon-button" data-reader-action="toggle_regenerate" title="Regenerate" style="width: 24px; height: 24px; padding: 0;">${iconSvg(entry.rendered.isRegenerating ? "stop" : "refresh")}</button>
          <button class="ltd-icon-button" data-reader-action="edit" title="Edit" style="width: 24px; height: 24px; padding: 0;">${iconSvg("edit")}</button>
          <button class="ltd-icon-button" data-reader-action="delete" title="Delete" style="width: 24px; height: 24px; padding: 0;">${iconSvg("delete")}</button>
          <button class="ltd-icon-button" data-reader-action="close" title="Close Reader" style="background: #ea4335; border-color: #ea4335; color: #fff; width: auto; padding: 0 12px; font-weight: bold; height: 24px; font-size: 12px; line-height: 22px; cursor: pointer; border-radius: 6px;">Close</button>
        </div>
      </header>
      <main class="ltracker-reader-body" style="flex: 1; min-height: 0; padding: 18px; overflow-y: auto; background: #111; box-sizing: border-box;">
        <div class="ltracker-reader-content-wrapper" style="width: 100%; max-width: min(100%, var(--ltracker-reader-content-max, 1100px)); margin: 0 auto; overflow-x: auto; box-sizing: border-box; background: #161616; padding: 15px; border-radius: 8px; border: 1px solid #333; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          ${body}
        </div>
      </main>
    `;
    overlay.addEventListener("click", (e) => {
      const btn = e.target instanceof HTMLElement ? e.target.closest("[data-reader-action]") : null;
      if (!btn) return;
      const action = btn.dataset.readerAction;
      const messageId = entry.indexEntry.messageId;
      const swipeKey = entry.indexEntry.swipeKey;
      if (action === "close") {
        closeFullscreenReader();
      }
      if (action === "toggle_regenerate") {
        toggleMessageRegeneration(messageId, swipeKey, entry.rendered.activeJobId ?? null);
        closeFullscreenReader();
      }
      if (action === "edit") {
        closeFullscreenReader();
        openTrackerEditor(entry);
      }
      if (action === "delete") {
        closeFullscreenReader();
        void deleteMessageTracker(messageId, swipeKey);
      }
    });
    doc.body.appendChild(overlay);
    activeReaderElement = overlay;
    localDiagnostics({
      lastDisplaySurface: "fullscreen_reader",
      lastReaderOpenedAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastReaderMessageId: entry.indexEntry.messageId,
      lastReaderSwipeKey: entry.indexEntry.swipeKey,
      lastDisplayPreviewAction: preview ? "fullscreen" : state.diagnostics.lastDisplayPreviewAction,
      lastDisplayPreviewResult: preview ? "opened" : state.diagnostics.lastDisplayPreviewResult,
      lastDisplayPreviewReason: preview ? "Opened fullscreen reader preview." : state.diagnostics.lastDisplayPreviewReason
    });
  }
  function closeFullscreenReader() {
    if (activeReaderElement) {
      activeReaderElement.remove();
      activeReaderElement = null;
      localDiagnostics({
        lastDisplayPreviewResult: state.diagnostics.lastDisplayPreviewAction === "fullscreen" ? "closed" : state.diagnostics.lastDisplayPreviewResult
      });
    }
  }
  function closeDisplayPreview() {
    if (activeDisplayPreviewElement) {
      activeDisplayPreviewElement.remove();
      activeDisplayPreviewElement = null;
    }
  }
  function renderEntryForSurface(entry, surface) {
    const chatId = entry.snapshot?.chatId ?? state.chatId ?? activeChatId() ?? "";
    return {
      ...entry,
      rendered: renderMessageTracker({
        messageId: entry.indexEntry.messageId,
        messageIndex: entry.indexEntry.messageIndex,
        attachedSnapshot: entry.snapshot,
        latestChatSnapshot: state.snapshot,
        preset: state.activePreset,
        settings: {
          ...state.settings.messageDisplay,
          displaySurface: surface,
          displayMode: displayModeForSurface(surface)
        },
        swipeIdentity: {
          chatId,
          messageId: entry.indexEntry.messageId,
          swipeKey: entry.indexEntry.swipeKey,
          swipeIndex: entry.indexEntry.swipeIndex,
          swipeId: entry.indexEntry.swipeId,
          swipeContentHash: entry.indexEntry.swipeContentHash,
          swipeKeySource: entry.indexEntry.swipeKeySource
        },
        isRegenerating: entry.rendered.isRegenerating,
        activeJobId: entry.rendered.activeJobId,
        activeJobStartedAt: entry.rendered.generationStartedAt
      })
    };
  }
  function latestPreviewEntry() {
    const current = findHistoryEntry(
      state.diagnostics.lastMessageControlMessageId ?? void 0,
      state.diagnostics.lastMessageControlSwipeKey
    );
    return current ?? allRenderableEntries()[0] ?? null;
  }
  function openDisplayPreview(entry, surface) {
    closeDisplayPreview();
    closePopover();
    closeFullscreenReader();
    const renderedEntry = renderEntryForSurface(entry, surface);
    const doc = document;
    const overlay = doc.createElement("div");
    overlay.className = "ltracker-display-preview-overlay";
    const width = state.settings.expandedWidth;
    const panel = doc.createElement("section");
    panel.className = "ltracker-display-preview-panel";
    panel.style.right = surface === "inline_wide" ? `max(4px, env(safe-area-inset-right))` : "18px";
    panel.style.left = surface === "inline_wide" ? `max(4px, env(safe-area-inset-left))` : "";
    panel.style.bottom = `max(10px, env(safe-area-inset-bottom))`;
    panel.style.width = surface === "inline_wide" ? `calc(100vw - ${Math.max(8, width.mobileHorizontalMarginPx * 2)}px)` : `min(420px, calc(100vw - 24px))`;
    panel.style.maxWidth = surface === "inline_wide" ? `min(${width.maxExpandedWidthPx}px, calc(100vw - 8px))` : "min(420px, calc(100vw - 24px))";
    panel.innerHTML = `
      <div class="ltracker-display-preview-header">
        <strong>${surface === "inline_wide" ? "Preview: Inline wide" : "Preview: Inline contained"}</strong>
        <button class="ltracker-button" type="button" data-preview-action="close">Close</button>
      </div>
      <div class="ltracker-display-preview-body">
        ${renderedEntry.rendered.domHtml}
      </div>
    `;
    panel.addEventListener("click", (event) => {
      const button = event.target instanceof HTMLElement ? event.target.closest("[data-preview-action]") : null;
      if (button) {
        closeDisplayPreview();
        localDiagnostics({
          lastDisplayPreviewResult: "closed",
          lastDisplayPreviewReason: "Closed inline display preview."
        });
      }
    });
    overlay.appendChild(panel);
    doc.body.appendChild(overlay);
    activeDisplayPreviewElement = overlay;
    localDiagnostics({
      lastDisplayPreviewAction: surface === "inline_wide" ? "wide" : "contained",
      lastDisplayPreviewResult: "opened",
      lastDisplayPreviewReason: surface === "inline_wide" ? "Opened a chat-width inline preview without mutating chat storage." : "Opened a contained inline preview without mutating chat storage."
    });
  }
  function widthConstraintDiagnostic(element, surface) {
    if (!(element instanceof HTMLElement) || surface !== "inline_wide") return { constrained: null, reason: null };
    const parent = element.parentElement;
    const doc = element.ownerDocument || document;
    const viewWidth = doc.defaultView?.innerWidth ?? 0;
    if (!parent || viewWidth <= 0) return { constrained: null, reason: null };
    const parentWidth = elementWidth(parent);
    if (parentWidth > 0 && parentWidth < Math.min(viewWidth * 0.62, state.settings.expandedWidth.maxExpandedWidthPx * 0.6)) {
      return {
        constrained: true,
        reason: `Parent width ${Math.round(parentWidth)}px is much narrower than viewport ${Math.round(viewWidth)}px.`
      };
    }
    return { constrained: false, reason: null };
  }
  function applyExpandedWidthMode(element) {
    if (!(element instanceof HTMLElement)) return;
    const width = state.settings.expandedWidth;
    const surface = resolveDisplaySurface(state.settings);
    const maxWidth = `${width.maxExpandedWidthPx}px`;
    const contained = surface === "inline_contained" || surface === "inline_wide" && width.expandedWidthMode === "contained";
    const compactShell = surface === "anchored_popover" || surface === "fullscreen_reader";
    element.classList.toggle("ltd-chat-width", surface === "inline_wide");
    element.classList.toggle("ltd-overlay-shell", compactShell);
    element.style.setProperty("--ltracker-expanded-width", maxWidth);
    element.style.maxWidth = contained || compactShell ? "100%" : width.expandedWidthMode === "full_mobile" ? `min(${maxWidth}, calc(100vw - ${width.mobileHorizontalMarginPx * 2}px))` : `min(${maxWidth}, 100%)`;
    element.style.width = compactShell ? "auto" : "100%";
    element.style.marginLeft = "";
    element.style.marginRight = "";
    element.style.setProperty("--ltracker-expanded-max-height", `${width.expandedContentMaxHeightVh}vh`);
    const details = element.querySelector(":scope > details");
    if (compactShell) details?.removeAttribute("open");
    const summary = element.querySelector(":scope > details > summary");
    if (summary) {
      summary.addEventListener("click", (e) => {
        const currentSurface = resolveDisplaySurface(state.settings);
        if (currentSurface !== "anchored_popover" && currentSurface !== "fullscreen_reader") return;
        if (e.target instanceof HTMLElement && e.target.closest("[data-ltracker-dom-action]")) return;
        e.preventDefault();
        const messageId = element.dataset.ltrackerMessageId;
        const swipeKey = element.dataset.ltrackerSwipeKey;
        if (!messageId || !swipeKey) return;
        const entry = findHistoryEntry(messageId, swipeKey);
        if (!entry) return;
        if (currentSurface === "fullscreen_reader") {
          openFullscreenReader(entry);
        } else {
          togglePopover(entry, summary);
        }
      });
    }
    localDiagnostics({
      selectedDisplaySurface: state.settings.messageDisplay.displaySurface,
      resolvedDisplaySurface: surface,
      displaySurfaceKind: displaySurfaceKind(surface),
      expandedWidthModeResolved: width.expandedWidthMode,
      lastExpandedTrackerWidthPx: width.expandedWidthMode === "contained" ? null : width.maxExpandedWidthPx,
      lastWidthModeResolved: width.expandedWidthMode
    });
  }
  function hydrateDomInjections() {
    const surface = resolveDisplaySurface(state.settings);
    if (!state.settings.messageDisplay.enabled || !state.settings.messageDisplay.useDomInjection || surface === "drawer_only") {
      cleanupDomInjections();
      localDiagnostics({
        selectedDisplaySurface: state.settings.messageDisplay.displaySurface,
        resolvedDisplaySurface: surface,
        displaySurfaceKind: displaySurfaceKind(surface),
        displaySurfaceMountStrategy: surface === "drawer_only" ? "drawer_only" : null,
        displaySurfaceFallbackReason: surface === "drawer_only" ? "Drawer history only is selected." : null,
        messageDisplayHydratedCount: 0
      });
      return false;
    }
    const keepKeys = /* @__PURE__ */ new Set();
    let injectedAny = false;
    let hydratedCount = 0;
    for (const entry of allRenderableEntries()) {
      const html = renderInlineTrackerHtml(entry);
      if (!html.trim()) continue;
      const key = trackerEntryKey(entry.indexEntry.messageId, entry.indexEntry.swipeKey);
      const messageElement = ctx.dom.findMessageElement(entry.indexEntry.messageId);
      const requestedPlacement = state.settings.messageDisplay.placement;
      localDiagnostics({
        lastPlacementRequested: requestedPlacement,
        lastPlacementRenderAttemptAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (!messageElement) continue;
      keepKeys.add(key);
      const mount = resolveTrackerMountPoint(messageElement, surface);
      const target = mount.target;
      const position = positionForPlacement(requestedPlacement);
      const signature = [
        entry.rendered.renderMode,
        entry.rendered.snapshotCreatedAt,
        entry.rendered.presetId,
        entry.rendered.swipeKey,
        entry.rendered.isRegenerating ? "generating" : "idle",
        entry.rendered.generationStartedAt,
        entry.rendered.activeJobId,
        entry.rendered.controlState.generationStatus,
        surface,
        state.settings.messageDisplay.displayMode,
        state.settings.expandedWidth.expandedWidthMode,
        state.settings.expandedWidth.maxExpandedWidthPx,
        state.settings.expandedWidth.mobileHorizontalMarginPx,
        state.settings.expandedWidth.expandedContentMaxHeightVh,
        mount.strategy,
        html
      ].join("\n");
      if (domSignatures.get(key) === signature) {
        injectedAny = true;
        hydratedCount += 1;
        continue;
      }
      try {
        domInjections.get(key)?.cleanup();
        const element = ctx.dom.inject(target, html, position);
        applyExpandedWidthMode(element);
        const widthDiag = widthConstraintDiagnostic(element, surface);
        element.addEventListener("click", handleDomTrackerAction);
        domInjections.set(key, {
          element,
          cleanup: () => {
            element.removeEventListener("click", handleDomTrackerAction);
            ctx.dom.uninject(element);
          }
        });
        domSignatures.set(key, signature);
        localDiagnostics({
          selectedDisplaySurface: state.settings.messageDisplay.displaySurface,
          resolvedDisplaySurface: surface,
          displaySurfaceKind: displaySurfaceKind(surface),
          displaySurfaceMountStrategy: mount.strategy,
          displaySurfaceParentWidthConstrained: widthDiag.constrained,
          displaySurfaceFallbackReason: mount.fallbackReason ?? widthDiag.reason,
          lastDisplaySurface: surface,
          lastDisplaySurfaceRehydratedAt: (/* @__PURE__ */ new Date()).toISOString(),
          lastPlacementResolved: requestedPlacement,
          lastPlacementRenderResult: "rendered",
          lastPlacementError: null,
          lastMountPointStrategy: mount.strategy,
          lastWidthConstraintReason: widthDiag.reason,
          lastWidthOverflowDetected: widthDiag.constrained,
          lastDomInjectionAt: (/* @__PURE__ */ new Date()).toISOString(),
          lastDomInjectionError: null,
          lastMessageDisplayError: null,
          lastMessageControlRenderAt: (/* @__PURE__ */ new Date()).toISOString(),
          lastMessageControlMessageId: entry.indexEntry.messageId,
          lastMessageControlSwipeKey: entry.indexEntry.swipeKey,
          lastMessageControlState: entry.rendered.controlState.generationStatus,
          nativeToolbarSupported: MESSAGE_NATIVE_TOOLBAR_SUPPORTED,
          nativeToolbarFallbackReason: MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON
        });
        injectedAny = true;
        hydratedCount += 1;
      } catch (error) {
        localDiagnostics({
          lastPlacementRenderResult: "failed",
          lastPlacementError: errorMessage(error),
          lastMountPointStrategy: mount.strategy,
          displaySurfaceMountStrategy: mount.strategy,
          displaySurfaceFallbackReason: errorMessage(error),
          lastDomInjectionError: errorMessage(error),
          lastMessageDisplayError: errorMessage(error)
        });
      }
    }
    cleanupDomInjections(keepKeys);
    localDiagnostics({
      messageDisplayHydratedCount: hydratedCount,
      lastMessageDisplayHydratedAt: hydratedCount > 0 ? (/* @__PURE__ */ new Date()).toISOString() : state.diagnostics.lastMessageDisplayHydratedAt
    });
    return injectedAny;
  }
  function hydrateMessageWidgets() {
    const renderWidget = ctx.messages?.renderWidget;
    const injected = hydrateDomInjections();
    if (state.settings.messageDisplay.useDomInjection && (injected || !state.settings.messageDisplay.fallbackToIframeWidget)) {
      cleanupMessageWidgets();
      return;
    }
    if (!state.settings.messageDisplay.enabled || resolveDisplaySurface(state.settings) === "drawer_only" || !renderWidget || !state.settings.messageDisplay.fallbackToIframeWidget) {
      cleanupMessageWidgets();
      return;
    }
    const keepKeys = /* @__PURE__ */ new Set();
    for (const entry of allRenderableEntries()) {
      if (!entry.rendered.widgetHtml.trim()) continue;
      const key = `${entry.indexEntry.messageId}:${entry.indexEntry.swipeKey}:${MESSAGE_WIDGET_ID}`;
      keepKeys.add(key);
      const signature = [
        entry.rendered.renderMode,
        entry.rendered.snapshotCreatedAt,
        entry.rendered.presetId,
        entry.rendered.widgetHtml
      ].join("\n");
      if (widgetSignatures.get(key) === signature) continue;
      try {
        widgetCleanups.get(key)?.();
        const cleanup = renderWidget({
          messageId: entry.indexEntry.messageId,
          widgetId: MESSAGE_WIDGET_ID,
          html: entry.rendered.widgetHtml,
          minHeight: state.settings.messageDisplay.collapsedByDefault ? Math.max(0, state.settings.messageDisplay.minimizedMaxHeightPx) : 40,
          maxHeight: 4e3
        }, (payload) => handleWidgetPayload(entry.indexEntry.messageId, entry.indexEntry.swipeKey, payload));
        widgetCleanups.set(key, cleanup);
        widgetSignatures.set(key, signature);
      } catch (error) {
        state = {
          ...state,
          diagnostics: {
            ...state.diagnostics,
            lastMessageDisplayError: errorMessage(error)
          }
        };
      }
    }
    cleanupMessageWidgets(keepKeys);
  }
  function buildEmbeddedTagEntry(payload) {
    if (!payload.messageId) return null;
    const chatId = payload.chatId ?? currentChatId();
    if (!chatId) return null;
    const swipeKey = payload.attrs.swipe || DEFAULT_SWIPE_KEY;
    const version = payload.attrs.version || EXTENSION_VERSION;
    const parsed = JSON.parse(payload.content);
    if (!isRecord5(parsed) || Array.isArray(parsed)) {
      throw new Error("Embedded LTracker tag content must be a JSON object.");
    }
    const attachedAt = (/* @__PURE__ */ new Date()).toISOString();
    const snapshot = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      extensionVersion: version,
      chatId,
      messageId: payload.messageId,
      messageIndex: null,
      swipeKey,
      swipeIndex: null,
      swipeId: null,
      swipeContentHash: null,
      swipeKeySource: "unknown",
      presetId: state.activePreset.id,
      presetName: state.activePreset.name,
      presetVersion: state.activePreset.version,
      trigger: {
        kind: "widget",
        requestId: `tag-intercept:${payload.messageId}:${swipeKey}`,
        sourceMessageId: payload.messageId,
        sourceMessageIndex: null,
        swipeKey,
        swipeIndex: null,
        swipeId: null,
        swipeContentHash: null,
        swipeKeySource: "unknown"
      },
      snapshot: {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        extensionVersion: version,
        chatId,
        createdAt: attachedAt,
        messageCount: 1,
        sourceMessageIds: [payload.messageId],
        presetId: state.activePreset.id,
        presetName: state.activePreset.name,
        presetVersion: state.activePreset.version,
        generationStartedAt: null,
        generationCompletedAt: null,
        generationDurationMs: null,
        generationCancelledAt: null,
        generationStatus: "completed",
        data: parsed
      },
      attachedAt
    };
    const indexEntry = {
      messageId: payload.messageId,
      messageIndex: null,
      swipeKey,
      swipeIndex: null,
      swipeId: null,
      swipeContentHash: null,
      swipeKeySource: "unknown",
      createdAt: attachedAt,
      presetId: state.activePreset.id,
      presetName: state.activePreset.name,
      storageKey: `embedded:${chatId}:${payload.messageId}:${swipeKey}`
    };
    return {
      indexEntry,
      snapshot,
      rendered: renderMessageTracker({
        messageId: payload.messageId,
        messageIndex: null,
        attachedSnapshot: snapshot,
        latestChatSnapshot: state.snapshot,
        preset: state.activePreset,
        settings: state.settings.messageDisplay,
        swipeIdentity: {
          chatId,
          messageId: payload.messageId,
          swipeKey,
          swipeIndex: null,
          swipeId: null,
          swipeContentHash: null,
          swipeKeySource: "unknown"
        },
        isRegenerating: false,
        activeJobId: null,
        activeJobStartedAt: null
      })
    };
  }
  function handleEmbeddedTrackerTag(payload) {
    const swipeKey = payload.attrs.swipe || DEFAULT_SWIPE_KEY;
    const outbound = {
      type: "embedded_tracker_tag_intercepted",
      chatId: payload.chatId ?? currentChatId(),
      messageId: payload.messageId ?? null,
      swipeKey,
      jsonText: payload.content,
      requestId: requestId("tag-intercept")
    };
    if (typeof payload.isStreaming === "boolean") outbound.isStreaming = payload.isStreaming;
    send(outbound);
    if (payload.isStreaming) return;
    try {
      const entry = buildEmbeddedTagEntry(payload);
      if (!entry) return;
      embeddedTagEntries.set(trackerEntryKey(entry.indexEntry.messageId, entry.indexEntry.swipeKey), entry);
      localDiagnostics({
        lastTagInterceptAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastTagInterceptMessageId: entry.indexEntry.messageId,
        lastTagInterceptSwipeKey: entry.indexEntry.swipeKey,
        lastTagInterceptError: null
      });
      hydrateMessageWidgets();
    } catch (error) {
      localDiagnostics({
        lastTagInterceptAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastTagInterceptMessageId: payload.messageId ?? null,
        lastTagInterceptSwipeKey: swipeKey,
        lastTagInterceptError: errorMessage(error)
      });
    }
  }
  function requestState() {
    send({ type: "refresh_state", chatId: activeChatId() });
  }
  function activateDrawer() {
    if (state.settings.connection.refreshConnectionsOnDrawerOpen) {
      refreshConnections();
      return;
    }
    requestState();
  }
  function generateTracker() {
    send({
      type: "generate_tracker",
      chatId: activeChatId(),
      requestId: requestId("generate")
    });
  }
  function refreshConnections() {
    send({
      type: "refresh_connections",
      chatId: activeChatId(),
      requestId: requestId("connections-refresh")
    });
  }
  function testTrackerConnection() {
    send({
      type: "test_tracker_connection",
      chatId: activeChatId(),
      settings: readSettings(),
      requestId: requestId("connection-test")
    });
  }
  function cancelConnectionTest() {
    send({
      type: "cancel_connection_test",
      chatId: activeChatId(),
      requestId: requestId("connection-test-cancel")
    });
  }
  function resetConnectionParameters() {
    const current = readSettings();
    state = {
      ...state,
      settings: {
        ...current,
        connection: {
          ...current.connection,
          parameters: DEFAULT_TRACKER_CONNECTION_PARAMETERS
        }
      }
    };
    render();
    scheduleSettingsAutosave();
  }
  function validReasoningEffort(value) {
    return value === "auto" || value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "max" || value === "xhigh" ? value : null;
  }
  function applyPresetRecommendedConnection() {
    const recommended = state.activePreset.recommendedConnection;
    if (!recommended) return;
    const current = readSettings();
    const reasoningSource = recommended.reasoning?.source;
    state = {
      ...state,
      settings: {
        ...current,
        connection: {
          ...current.connection,
          mode: recommended.mode ?? current.connection.mode,
          parameters: {
            ...current.connection.parameters,
            temperature: recommended.temperature ?? current.connection.parameters.temperature,
            max_tokens: recommended.max_tokens ?? current.connection.parameters.max_tokens
          },
          reasoning: {
            ...current.connection.reasoning,
            source: reasoningSource === "inherit" || reasoningSource === "off" || reasoningSource === "custom" ? reasoningSource : current.connection.reasoning.source,
            effort: validReasoningEffort(recommended.reasoning?.effort) ?? current.connection.reasoning.effort
          }
        }
      }
    };
    render();
    scheduleSettingsAutosave();
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
    const autoTimingNumberValue = (name) => {
      const input = tab.root.querySelector(`[data-auto-timing-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.autoTiming[name];
    };
    const autoTimingBooleanValue = (name) => {
      const input = tab.root.querySelector(`[data-auto-timing-setting="${name}"]`);
      return input ? input.checked : state.settings.autoTiming[name];
    };
    const budgetNumberValue = (name) => {
      const input = tab.root.querySelector(`[data-budget-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.budget[name];
    };
    const budgetBooleanValue = (name) => {
      const input = tab.root.querySelector(`[data-budget-setting="${name}"]`);
      return input ? input.checked : state.settings.budget[name];
    };
    const budgetSelectValue = (name, fallback) => {
      const input = tab.root.querySelector(`[data-budget-setting="${name}"]`);
      return input ? input.value : fallback;
    };
    const memoryNumberValue = (name) => {
      const input = tab.root.querySelector(`[data-memory-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.memory[name];
    };
    const memoryBooleanValue = (name) => {
      const input = tab.root.querySelector(`[data-memory-setting="${name}"]`);
      return input ? input.checked : state.settings.memory[name];
    };
    const memorySelectValue = (name, fallback) => {
      const input = tab.root.querySelector(`[data-memory-setting="${name}"]`);
      return input ? input.value : fallback;
    };
    const injectionNumberValue = (name) => {
      const input = tab.root.querySelector(`[data-injection-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.injection[name];
    };
    const injectionBooleanValue = (name) => {
      const input = tab.root.querySelector(`[data-injection-setting="${name}"]`);
      return input ? input.checked : state.settings.injection[name];
    };
    const injectionTextValue = (name) => {
      const input = tab.root.querySelector(`[data-injection-setting="${name}"]`);
      return input ? input.value : state.settings.injection[name];
    };
    const rendererBooleanValue = (name) => {
      const input = tab.root.querySelector(`[data-renderer-setting="${name}"]`);
      return input ? input.checked : state.settings.renderer[name];
    };
    const rendererTextValue = (name) => {
      const input = tab.root.querySelector(`[data-renderer-setting="${name}"]`);
      return input ? input.value : state.settings.renderer[name];
    };
    const messageDisplayNumberValue = (name) => {
      const input = tab.root.querySelector(`[data-message-display-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.messageDisplay[name];
    };
    const messageDisplayBooleanValue = (name) => {
      const input = tab.root.querySelector(`[data-message-display-setting="${name}"]`);
      return input ? input.checked : state.settings.messageDisplay[name];
    };
    const injectionSelectValue = (name, fallback) => {
      const input = tab.root.querySelector(`[data-injection-setting="${name}"]`);
      return input ? input.value : fallback;
    };
    const rendererSelectValue = (name, fallback) => {
      const input = tab.root.querySelector(`[data-renderer-setting="${name}"]`);
      return input ? input.value : fallback;
    };
    const rendererTrustModeValue = () => {
      const input = tab.root.querySelector('[data-renderer-setting="templateTrustMode"]');
      return input ? input.value : state.settings.renderer.templateTrustMode;
    };
    const messageDisplaySelectValue = (name, fallback) => {
      const input = tab.root.querySelector(`[data-message-display-setting="${name}"]`);
      return input ? input.value : fallback;
    };
    const expandedWidthNumberValue = (name) => {
      const input = tab.root.querySelector(`[data-expanded-width-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.expandedWidth[name];
    };
    const expandedWidthSelectValue = (name, fallback) => {
      const input = tab.root.querySelector(`[data-expanded-width-setting="${name}"]`);
      return input ? input.value : fallback;
    };
    const expandedWidthBooleanValue = (name) => {
      const input = tab.root.querySelector(`[data-expanded-width-setting="${name}"]`);
      return input ? input.checked : state.settings.expandedWidth[name];
    };
    const connectionBooleanValue = (name) => {
      const input = tab.root.querySelector(`[data-connection-setting="${name}"]`);
      return input ? input.checked : state.settings.connection[name];
    };
    const connectionTextValue = (name) => {
      const input = tab.root.querySelector(`[data-connection-setting="${name}"]`);
      return input ? input.value : state.settings.connection[name];
    };
    const connectionSelectValue = (name, fallback) => {
      const input = tab.root.querySelector(`[data-connection-setting="${name}"], [data-connection-reasoning="${name}"]`);
      return input ? input.value : fallback;
    };
    const connectionParameterValue = (name) => {
      const input = tab.root.querySelector(`[data-connection-parameter="${name}"]`);
      if (!input) return state.settings.connection.parameters[name];
      if (!input.value.trim()) return null;
      const numeric = Number(input.value);
      return Number.isFinite(numeric) ? numeric : null;
    };
    const selectedConnectionInput = tab.root.querySelector('[data-connection-setting="selectedConnectionId"]');
    const selectedConnectionId = selectedConnectionInput?.value.trim() || null;
    const selectedConnection = selectedConnectionId ? state.connectionProfiles.find((profile) => profile.id === selectedConnectionId) ?? null : null;
    const displaySurface = messageDisplaySelectValue("displaySurface", state.settings.messageDisplay.displaySurface);
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
      },
      autoTiming: {
        waitForAssistantFinalization: autoTimingBooleanValue("waitForAssistantFinalization"),
        postCompletionSettleMs: autoTimingNumberValue("postCompletionSettleMs"),
        stableContentCheckMs: autoTimingNumberValue("stableContentCheckMs"),
        requireStableSwipeContent: autoTimingBooleanValue("requireStableSwipeContent"),
        cancelPendingOnSwipeChange: autoTimingBooleanValue("cancelPendingOnSwipeChange")
      },
      budget: {
        mode: budgetSelectValue("mode", state.settings.budget.mode),
        ultraModeEnabled: budgetBooleanValue("ultraModeEnabled"),
        recentMessageBudgetTokens: budgetNumberValue("recentMessageBudgetTokens"),
        perMessageBudgetTokens: budgetNumberValue("perMessageBudgetTokens"),
        trackerMemoryBudgetTokens: budgetNumberValue("trackerMemoryBudgetTokens"),
        promptInjectionBudgetTokens: budgetNumberValue("promptInjectionBudgetTokens"),
        maxTrackerOutputTokens: budgetNumberValue("maxTrackerOutputTokens"),
        promptPreviewBudgetTokens: budgetNumberValue("promptPreviewBudgetTokens"),
        renderedHtmlMaxChars: budgetNumberValue("renderedHtmlMaxChars"),
        rawOutputMaxChars: budgetNumberValue("rawOutputMaxChars"),
        presetImportMaxChars: budgetNumberValue("presetImportMaxChars")
      },
      memory: {
        enabled: memoryBooleanValue("enabled"),
        includeInTrackerGeneration: memoryBooleanValue("includeInTrackerGeneration"),
        retainCount: memoryNumberValue("retainCount"),
        fullSnapshotCount: memoryNumberValue("fullSnapshotCount"),
        compactOlderSnapshots: memoryBooleanValue("compactOlderSnapshots"),
        maxMemoryChars: memoryNumberValue("maxMemoryChars"),
        source: memorySelectValue("source", state.settings.memory.source),
        excludeTargetMessage: memoryBooleanValue("excludeTargetMessage"),
        order: memorySelectValue("order", state.settings.memory.order),
        requireSamePreset: memoryBooleanValue("requireSamePreset"),
        requireSameSwipeWhenAvailable: memoryBooleanValue("requireSameSwipeWhenAvailable")
      },
      injection: {
        enabled: injectionBooleanValue("enabled"),
        retainCount: injectionNumberValue("retainCount"),
        format: injectionSelectValue("format", state.settings.injection.format),
        injectionPlacement: injectionSelectValue("injectionPlacement", state.settings.injection.injectionPlacement),
        includeOnlyIfMissingFromPrompt: injectionBooleanValue("includeOnlyIfMissingFromPrompt"),
        stripOlderTrackerBlocks: injectionBooleanValue("stripOlderTrackerBlocks"),
        maxInjectedChars: injectionNumberValue("maxInjectedChars"),
        roleFallback: injectionSelectValue("roleFallback", state.settings.injection.roleFallback),
        includeHeader: injectionBooleanValue("includeHeader"),
        header: injectionTextValue("header")
      },
      renderer: {
        enabled: rendererBooleanValue("enabled"),
        previewSource: rendererSelectValue("previewSource", state.settings.renderer.previewSource),
        missingValuePlaceholder: rendererTextValue("missingValuePlaceholder"),
        maxRenderedChars: budgetNumberValue("renderedHtmlMaxChars"),
        allowInlineStyles: rendererTrustModeValue() !== "safe",
        templateTrustMode: rendererTrustModeValue()
      },
      messageDisplay: {
        enabled: messageDisplayBooleanValue("enabled"),
        useDomInjection: messageDisplayBooleanValue("useDomInjection"),
        fallbackToIframeWidget: messageDisplayBooleanValue("fallbackToIframeWidget"),
        attachmentMode: messageDisplaySelectValue("attachmentMode", state.settings.messageDisplay.attachmentMode),
        displayMode: displayModeForSurface(displaySurface),
        displaySurface,
        placement: messageDisplaySelectValue("placement", state.settings.messageDisplay.placement),
        source: messageDisplaySelectValue("source", state.settings.messageDisplay.source),
        renderMode: messageDisplaySelectValue("renderMode", state.settings.messageDisplay.renderMode),
        allowInlineStyles: rendererTrustModeValue() !== "safe",
        deduplicateRenderWarnings: messageDisplayBooleanValue("deduplicateRenderWarnings"),
        showRenderWarningsInDiagnosticsOnly: messageDisplayBooleanValue("showRenderWarningsInDiagnosticsOnly"),
        showDebugSwipeKey: messageDisplayBooleanValue("showDebugSwipeKey"),
        showGenerateButtonForMissingTracker: messageDisplayBooleanValue("showGenerateButtonForMissingTracker"),
        controlDensity: messageDisplaySelectValue("controlDensity", state.settings.messageDisplay.controlDensity),
        controlPlacement: messageDisplaySelectValue("controlPlacement", state.settings.messageDisplay.controlPlacement),
        showExpandedHeaderActions: messageDisplayBooleanValue("showExpandedHeaderActions"),
        showBottomActionsInInlineTracker: messageDisplayBooleanValue("showBottomActionsInInlineTracker"),
        collapsedByDefault: messageDisplayBooleanValue("collapsedByDefault"),
        compactCollapsedHeader: messageDisplayBooleanValue("compactCollapsedHeader"),
        showTimestamp: messageDisplayBooleanValue("showTimestamp"),
        showPresetName: messageDisplayBooleanValue("showPresetName"),
        showDebugCopyButtonsInHistory: messageDisplayBooleanValue("showDebugCopyButtonsInHistory"),
        showWidgetRegenerateButton: messageDisplayBooleanValue("showWidgetRegenerateButton"),
        showEditButton: messageDisplayBooleanValue("showEditButton"),
        showDeleteButton: messageDisplayBooleanValue("showDeleteButton"),
        showNoTrackerForSwipe: messageDisplayBooleanValue("showNoTrackerForSwipe"),
        showGenerationDuration: messageDisplayBooleanValue("showGenerationDuration"),
        minimizedMaxHeightPx: messageDisplayNumberValue("minimizedMaxHeightPx"),
        maxRenderedChars: messageDisplayNumberValue("maxRenderedChars")
      },
      expandedWidth: {
        expandedWidthMode: expandedWidthSelectValue("expandedWidthMode", state.settings.expandedWidth.expandedWidthMode),
        maxExpandedWidthPx: expandedWidthNumberValue("maxExpandedWidthPx"),
        mobileHorizontalMarginPx: expandedWidthNumberValue("mobileHorizontalMarginPx"),
        expandedContentMaxHeightVh: expandedWidthNumberValue("expandedContentMaxHeightVh"),
        preferFullscreenOnMobile: expandedWidthBooleanValue("preferFullscreenOnMobile"),
        fullscreenBreakpointPx: expandedWidthNumberValue("fullscreenBreakpointPx"),
        popoverBackdrop: expandedWidthBooleanValue("popoverBackdrop"),
        closeOnBackdropClick: expandedWidthBooleanValue("closeOnBackdropClick"),
        closeOnEscape: expandedWidthBooleanValue("closeOnEscape")
      },
      connection: {
        mode: connectionSelectValue("mode", state.settings.connection.mode),
        selectedConnectionId,
        selectedConnectionName: selectedConnection ? selectedConnection.name : selectedConnectionId ? state.settings.connection.selectedConnectionName : null,
        refreshConnectionsOnDrawerOpen: connectionBooleanValue("refreshConnectionsOnDrawerOpen"),
        parameters: {
          temperature: connectionParameterValue("temperature"),
          max_tokens: connectionParameterValue("max_tokens"),
          top_p: connectionParameterValue("top_p"),
          frequency_penalty: connectionParameterValue("frequency_penalty"),
          presence_penalty: connectionParameterValue("presence_penalty")
        },
        reasoning: {
          source: connectionSelectValue("source", state.settings.connection.reasoning.source),
          apiReasoning: Boolean(tab.root.querySelector('[data-connection-reasoning="apiReasoning"]')?.checked ?? state.settings.connection.reasoning.apiReasoning),
          effort: connectionSelectValue("effort", state.settings.connection.reasoning.effort),
          thinkingDisplay: connectionSelectValue("thinkingDisplay", state.settings.connection.reasoning.thinkingDisplay)
        },
        testPrompt: connectionTextValue("testPrompt")
      },
      history: {
        pageSize: state.settings.history?.pageSize ?? 25,
        showDuplicates: state.settings.history?.showDuplicates ?? false
      },
      storageMaintenance: {
        enabled: state.settings.storageMaintenance?.enabled ?? false,
        maxSnapshotsPerChat: state.settings.storageMaintenance?.maxSnapshotsPerChat ?? 100,
        cleanupDuplicatesOnly: state.settings.storageMaintenance?.cleanupDuplicatesOnly ?? false
      }
    };
  }
  function saveSettings(prefix = "settings") {
    setSettingsSaveStatus("saving");
    send({
      type: "save_settings",
      chatId: activeChatId(),
      settings: readSettings(),
      requestId: requestId(prefix)
    });
  }
  function resetSettings() {
    clearSettingsAutosaveTimer();
    setSettingsSaveStatus("saving");
    send({
      type: "reset_settings",
      chatId: activeChatId(),
      requestId: requestId("settings-reset")
    });
  }
  function setLocalError(message) {
    state = {
      ...state,
      status: "error",
      error: emptyError(message)
    };
    render();
  }
  function fieldText(name, fallback) {
    const input = tab.root.querySelector(`[data-preset-field="${name}"]`);
    return input ? input.value : fallback;
  }
  function readPresetDraft() {
    let jsonSchema;
    try {
      const parsed = JSON.parse(fieldText("jsonSchema", "{}"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setLocalError("JSON Schema must be a JSON object.");
        return null;
      }
      jsonSchema = parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLocalError(`JSON Schema is invalid JSON: ${message}`);
      return null;
    }
    const htmlTemplate = fieldText("htmlTemplate", "");
    const draft = {
      id: state.activePreset.id,
      name: fieldText("name", state.activePreset.name),
      description: fieldText("description", state.activePreset.description),
      version: fieldText("version", state.activePreset.version),
      jsonSchema,
      promptInstructions: fieldText("promptInstructions", state.activePreset.promptInstructions),
      htmlTemplate,
      notes: fieldText("notes", state.activePreset.notes ?? ""),
      capabilities: {
        supportsHtmlTemplate: htmlTemplate.trim().length > 0
      }
    };
    return draft;
  }
  function selectPreset(presetId) {
    send({
      type: "select_preset",
      chatId: activeChatId(),
      presetId,
      requestId: requestId("preset-select")
    });
  }
  function savePresetAsNew() {
    const preset = readPresetDraft();
    if (!preset) return;
    send({
      type: "save_preset_as_new",
      chatId: activeChatId(),
      preset,
      requestId: requestId("preset-new")
    });
  }
  function duplicatePreset() {
    const preset = readPresetDraft();
    if (!preset) return;
    send({
      type: "duplicate_preset",
      chatId: activeChatId(),
      preset: {
        ...preset,
        name: `${preset.name || state.activePreset.name} Copy`
      },
      requestId: requestId("preset-duplicate")
    });
  }
  function updatePreset() {
    if (state.activePreset.origin === "built_in") return;
    const preset = readPresetDraft();
    if (!preset) return;
    send({
      type: "update_preset",
      chatId: activeChatId(),
      presetId: state.activePreset.id,
      preset,
      requestId: requestId("preset-update")
    });
  }
  function deletePreset() {
    if (state.activePreset.origin === "built_in") return;
    send({
      type: "delete_preset",
      chatId: activeChatId(),
      presetId: state.activePreset.id,
      requestId: requestId("preset-delete")
    });
  }
  function resetPreset() {
    send({
      type: "reset_preset",
      chatId: activeChatId(),
      requestId: requestId("preset-reset")
    });
  }
  function importPreset() {
    const input = tab.root.querySelector("[data-preset-import]");
    const importText = input?.value.trim() ?? "";
    if (!importText) {
      setLocalError("Paste preset export JSON before importing.");
      return;
    }
    send({
      type: "import_preset",
      chatId: activeChatId(),
      importText,
      requestId: requestId("preset-import")
    });
  }
  function validatePreset() {
    const preset = readPresetDraft();
    if (!preset) return;
    send({
      type: "validate_preset",
      chatId: activeChatId(),
      preset,
      requestId: requestId("preset-validate")
    });
  }
  function validatePresetReportFrontend() {
    const preset = readPresetDraft();
    if (!preset) return;
    send({
      type: "validate_preset_report",
      chatId: activeChatId(),
      preset,
      requestId: requestId("preset-validate-report")
    });
  }
  function generateSampleSnapshotFrontend() {
    send({
      type: "generate_sample_snapshot",
      chatId: activeChatId(),
      requestId: requestId("preset-sample-snapshot")
    });
  }
  function exportPresetPackFrontend(includeSettings) {
    const msg = {
      type: "export_preset_pack",
      chatId: activeChatId(),
      requestId: requestId("preset-export-pack")
    };
    if (includeSettings) {
      msg.includeRecommendedSettings = true;
    }
    msg.includeExampleSnapshot = true;
    send(msg);
  }
  function triggerFileImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.ltracker.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === "string") {
          stageImportText(text);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
  function stageImportText(text) {
    const maxChars = state.settings.budget.presetImportMaxChars;
    if (text.length > maxChars) {
      setLocalError(`Import size (${text.length} chars) exceeds limit of ${maxChars} chars.`);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setLocalError(`Invalid JSON: ${errorMessage(e)}`);
      return;
    }
    const result = importPresetPack(parsed, state.presets.map((p) => p.id), (/* @__PURE__ */ new Date()).toISOString());
    if (!result.ok || !result.preset) {
      setLocalError(result.error ?? "Failed to parse import preset pack.");
      return;
    }
    stagedImportPack = result;
    stagedImportRawText = text;
    state = {
      ...state,
      error: null
    };
    render();
  }
  function executeImportPresetPack() {
    if (!stagedImportPack || !stagedImportRawText) return;
    const nameInput = tab.root.querySelector("[data-import-review-name]");
    const presetName = nameInput?.value.trim() || stagedImportPack.preset?.name || "Imported Preset";
    const installModeSelect = tab.root.querySelector("[data-import-review-install-mode]");
    const installMode = installModeSelect?.value || "new";
    const trustModeSelect = tab.root.querySelector("[data-import-review-trust-mode]");
    const trustMode = trustModeSelect?.value || "safe";
    const applyRecToggle = tab.root.querySelector("[data-import-review-apply-settings]");
    const applyRecommendedSettings = applyRecToggle ? applyRecToggle.checked : false;
    const msg = {
      type: "import_preset_pack",
      chatId: activeChatId(),
      importText: stagedImportRawText,
      requestId: requestId("preset-import-pack")
    };
    if (presetName) msg.presetName = presetName;
    if (installMode === "overwrite") {
      const overwriteSelect = tab.root.querySelector("[data-import-review-overwrite-target]");
      if (overwriteSelect?.value) {
        msg.overwritePresetId = overwriteSelect.value;
      }
    }
    if (trustMode) msg.trustMode = trustMode;
    if (applyRecommendedSettings) msg.applyRecommendedSettings = applyRecommendedSettings;
    send(msg);
    stagedImportPack = null;
    stagedImportRawText = "";
    render();
  }
  function selectedRenderSource() {
    const input = tab.root.querySelector('[data-renderer-setting="previewSource"]');
    return input?.value === "latest_message_snapshot" ? "latest_message_snapshot" : "latest_chat_snapshot";
  }
  function renderTemplatePreview() {
    send({
      type: "render_template",
      chatId: activeChatId(),
      source: selectedRenderSource(),
      requestId: requestId("render-template")
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
  async function showLTrackerConfirm(title, message) {
    if (ctx.ui?.showConfirm) {
      const res = await ctx.ui.showConfirm({
        title,
        message,
        variant: "danger",
        confirmLabel: "Delete"
      });
      return res.confirmed;
    }
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "ltracker-confirm-backdrop";
      backdrop.innerHTML = `
        <div class="ltracker-confirm-dialog">
          <h3>${escapeHtml2(title)}</h3>
          <p>${escapeHtml2(message)}</p>
          <div class="ltracker-confirm-actions">
            <button class="ltracker-button ltracker-cancel-btn" type="button">Cancel</button>
            <button class="ltracker-button ltracker-confirm-btn ltd-danger" type="button">Delete</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
      const onCancel = () => {
        cleanup();
        resolve(false);
      };
      const onConfirm = () => {
        cleanup();
        resolve(true);
      };
      const cleanup = () => {
        backdrop.querySelector(".ltracker-cancel-btn")?.removeEventListener("click", onCancel);
        backdrop.querySelector(".ltracker-confirm-btn")?.removeEventListener("click", onConfirm);
        backdrop.remove();
      };
      backdrop.querySelector(".ltracker-cancel-btn")?.addEventListener("click", onCancel);
      backdrop.querySelector(".ltracker-confirm-btn")?.addEventListener("click", onConfirm);
    });
  }
  async function deleteMessageTracker(messageId, swipeKey) {
    const confirmed = await showLTrackerConfirm(
      "Delete Tracker",
      "Delete tracker for this message/swipe? This does not delete the chat message."
    );
    if (!confirmed) return;
    send({
      type: "delete_message_tracker",
      chatId: activeChatId(),
      messageId,
      swipeKey,
      requestId: requestId("tracker-delete")
    });
    if (recentlyDeletedBanner) {
      clearTimeout(recentlyDeletedBanner.timer);
    }
    const timer = setTimeout(() => {
      if (recentlyDeletedBanner && recentlyDeletedBanner.messageId === messageId && recentlyDeletedBanner.swipeKey === swipeKey) {
        recentlyDeletedBanner = null;
        render();
      }
    }, 3e4);
    recentlyDeletedBanner = { messageId, swipeKey, timer };
    render();
  }
  function openTrackerEditor(entry) {
    const modal = ctx.ui.showModal({
      title: "LTracker Message Tracker",
      width: 760,
      maxHeight: 720
    });
    const rendered = entry.rendered;
    const metadata = JSON.stringify({
      messageId: entry.indexEntry.messageId,
      messageIndex: entry.indexEntry.messageIndex,
      swipeKey: entry.indexEntry.swipeKey,
      swipeIndex: entry.indexEntry.swipeIndex,
      swipeId: entry.indexEntry.swipeId,
      swipeContentHash: entry.indexEntry.swipeContentHash,
      swipeKeySource: entry.indexEntry.swipeKeySource,
      presetId: rendered.presetId,
      presetName: rendered.presetName,
      presetVersion: rendered.presetVersion,
      snapshotCreatedAt: rendered.snapshotCreatedAt,
      attachedAt: rendered.attachedAt,
      generationDurationMs: rendered.generationDurationMs,
      generationStatus: rendered.generationStatus
    }, null, 2);
    modal.root.innerHTML = `
      <div class="ltracker-editor">
        <div class="ltracker-actions">
          <button class="ltracker-button" type="button" data-editor-action="copy-json">Copy JSON</button>
          <button class="ltracker-button" type="button" data-editor-action="copy-text">Copy text</button>
          <button class="ltracker-button" type="button" data-editor-action="copy-html">Copy sanitized HTML</button>
          <button class="ltracker-button" type="button" data-editor-action="save-json">Save edited JSON</button>
          <button class="ltracker-button" type="button" data-editor-action="close">Close</button>
        </div>
        <div class="ltracker-editor-error" data-editor-error></div>
        <section class="ltracker-panel">
          <span class="ltracker-label">Rendered preview</span>
          ${rendered.html ? `<div class="ltracker-render-preview">${rendered.html}</div>` : `<pre class="ltracker-text">${escapeHtml2(rendered.textFallback)}</pre>`}
        </section>
        <section class="ltracker-panel">
          <span class="ltracker-label">Tracker JSON</span>
          <textarea class="ltracker-editor-textarea" data-editor-json>${escapeHtml2(rendered.json)}</textarea>
        </section>
        <section class="ltracker-panel">
          <span class="ltracker-label">Text fallback</span>
          <pre class="ltracker-text">${escapeHtml2(rendered.textFallback)}</pre>
        </section>
        <section class="ltracker-panel">
          <span class="ltracker-label">Sanitized HTML</span>
          <pre class="ltracker-text">${escapeHtml2(rendered.html || "None")}</pre>
        </section>
        <section class="ltracker-panel">
          <span class="ltracker-label">Source metadata</span>
          <pre class="ltracker-json">${escapeHtml2(metadata)}</pre>
        </section>
      </div>
    `;
    const setError = (message) => {
      const target = modal.root.querySelector("[data-editor-error]");
      if (target) target.textContent = message;
    };
    const onClick2 = (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest("[data-editor-action]") : null;
      const action = target?.dataset.editorAction;
      if (!action) return;
      const jsonInput = modal.root.querySelector("[data-editor-json]");
      if (action === "copy-json") void copyText(jsonInput?.value ?? rendered.json, "tracker JSON");
      if (action === "copy-text") void copyText(rendered.textFallback, "tracker text");
      if (action === "copy-html") void copyText(rendered.html || null, "tracker HTML");
      if (action === "close") modal.dismiss();
      if (action === "save-json") {
        const jsonText = jsonInput?.value ?? "";
        try {
          const parsed = JSON.parse(jsonText);
          const data = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "data" in parsed && isRecord5(parsed.data) ? parsed.data : parsed;
          if (!data || typeof data !== "object" || Array.isArray(data)) {
            setError("Tracker JSON must be a JSON object.");
            return;
          }
          send({
            type: "save_edited_message_tracker",
            chatId: activeChatId(),
            messageId: entry.indexEntry.messageId,
            swipeKey: entry.indexEntry.swipeKey,
            jsonText: JSON.stringify(data),
            requestId: requestId("tracker-edit")
          });
          modal.dismiss();
        } catch (error) {
          setError(`Invalid JSON: ${errorMessage(error)}`);
        }
      }
    };
    modal.root.addEventListener("click", onClick2);
    modal.onDismiss(() => modal.root.removeEventListener("click", onClick2));
  }
  function renderMessageHistory() {
    const filter = historyFilterText.trim().toLowerCase();
    const currentMessageId = state.diagnostics.lastMessageControlMessageId ?? state.diagnostics.latestAttachedMessageId ?? state.diagnostics.lastSwipeDetectedMessageId;
    const selectedSwipeKey = state.diagnostics.lastMessageControlSwipeKey ?? state.diagnostics.lastSwipeKey;
    const baseEntries = groupMessageTrackerHistory(allIndexedHistoryEntries(), historyShowDuplicates).entries;
    const entries = baseEntries.filter((entry) => {
      const rendered = entry.rendered;
      if (historyErrorsOnly && rendered.errors.length === 0 && rendered.controlState.generationStatus !== "failed") return false;
      if (historyCurrentMessageOnly && (!currentMessageId || entry.indexEntry.messageId !== currentMessageId)) return false;
      if (historySelectedSwipeOnly && (!selectedSwipeKey || entry.indexEntry.swipeKey !== selectedSwipeKey)) return false;
      if (historyCurrentPresetOnly && (rendered.presetId ?? entry.indexEntry.presetId) !== state.activePreset.id) return false;
      if (!filter) return true;
      const haystack = [
        entry.indexEntry.messageId,
        entry.indexEntry.swipeKey,
        entry.indexEntry.presetName,
        rendered.presetName,
        rendered.snapshotCreatedAt,
        rendered.textFallback
      ].filter((item) => Boolean(item)).join(" ").toLowerCase();
      return haystack.includes(filter);
    });
    const undoBannerHtml = recentlyDeletedBanner ? `
        <div class="ltracker-undo-banner">
          <span>Tracker snapshot deleted.</span>
          <button class="ltracker-button" type="button" data-action="undo-delete">Undo</button>
        </div>
      ` : "";
    const loadMoreHtml = state.diagnostics.messageSnapshotIndexCount > currentHistoryLimit ? `
        <div class="ltracker-history-load-more" style="margin-top: 14px; text-align: center;">
          <button class="ltracker-button" type="button" data-action="load-more-history">Load More</button>
        </div>
      ` : "";
    if (entries.length === 0) {
      const message = baseEntries.length > 0 ? "No message-attached tracker snapshots match the current filters." : "No message-attached tracker snapshots are indexed for this chat yet.";
      return `
        ${undoBannerHtml}
        <div class="ltracker-render-placeholder">${escapeHtml2(message)}</div>
      `;
    }
    return `
      ${undoBannerHtml}
      <div class="ltracker-history-list">
        ${entries.map((entry) => {
      const rendered = entry.rendered;
      const open = state.settings.messageDisplay.collapsedByDefault ? "" : " open";
      const duration = formatDurationMs2(rendered.generationDurationMs);
      const title = [
        entry.indexEntry.messageIndex !== null ? `Message #${entry.indexEntry.messageIndex}` : "Message",
        entry.indexEntry.swipeIndex !== null ? `Swipe ${entry.indexEntry.swipeIndex + 1}` : `Swipe ${entry.indexEntry.swipeKey}`,
        rendered.presetName ? rendered.presetName : "Preset unknown",
        duration
      ].filter((item) => Boolean(item)).join(" - ");
      const meta = [
        `id ${entry.indexEntry.messageId}`,
        `swipe ${entry.indexEntry.swipeKey}`,
        entry.indexEntry.swipeKeySource ? `source ${entry.indexEntry.swipeKeySource}` : null,
        rendered.snapshotCreatedAt ? `snapshot ${rendered.snapshotCreatedAt}` : "snapshot unavailable",
        rendered.attachedAt ? `attached ${rendered.attachedAt}` : null,
        rendered.generationDurationMs !== null ? `duration ${formatDurationMs2(rendered.generationDurationMs)}` : null,
        rendered.isRegenerating ? "generating" : null,
        `mode ${rendered.renderMode}`
      ].filter((item) => Boolean(item)).join(" / ");
      const htmlPreview = rendered.html ? `<div class="ltracker-render-preview">${rendered.html}</div>` : `<pre class="ltracker-text">${escapeHtml2(rendered.textFallback)}</pre>`;
      const copyActions = state.settings.messageDisplay.showDebugCopyButtonsInHistory ? `
                <button class="ltracker-button" type="button" data-action="copy-history-json" data-message-id="${escapeHtml2(entry.indexEntry.messageId)}" data-swipe-key="${escapeHtml2(entry.indexEntry.swipeKey)}"${disabled(!rendered.json)}>
                  Copy JSON
                </button>
                <button class="ltracker-button" type="button" data-action="copy-history-html" data-message-id="${escapeHtml2(entry.indexEntry.messageId)}" data-swipe-key="${escapeHtml2(entry.indexEntry.swipeKey)}"${disabled(!rendered.html)}>
                  Copy HTML
                </button>
                <button class="ltracker-button" type="button" data-action="copy-history-text" data-message-id="${escapeHtml2(entry.indexEntry.messageId)}" data-swipe-key="${escapeHtml2(entry.indexEntry.swipeKey)}"${disabled(!rendered.textFallback)}>
                  Copy Text
                </button>
              ` : "";
      return `
            <article class="ltracker-history-entry">
              <details${open}>
                <summary>${escapeHtml2(title)}</summary>
                <div class="ltracker-history-meta">${escapeHtml2(meta)}</div>
                ${htmlPreview}
                <div class="ltracker-copy-actions" style="margin-top: 8px;">
                  <button class="ltracker-button" type="button" data-action="regenerate-history" data-message-id="${escapeHtml2(entry.indexEntry.messageId)}" data-swipe-key="${escapeHtml2(entry.indexEntry.swipeKey)}">
                    Regenerate
                  </button>
                  <button class="ltracker-button" type="button" data-action="edit-history" data-message-id="${escapeHtml2(entry.indexEntry.messageId)}" data-swipe-key="${escapeHtml2(entry.indexEntry.swipeKey)}">
                    Edit/View
                  </button>
                  <button class="ltracker-button" type="button" data-action="delete-history" data-message-id="${escapeHtml2(entry.indexEntry.messageId)}" data-swipe-key="${escapeHtml2(entry.indexEntry.swipeKey)}">
                    Delete
                  </button>
                  ${copyActions}
                </div>
              </details>
            </article>
          `;
    }).join("")}
      </div>
      ${loadMoreHtml}
    `;
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
    const memoryPreviewText = state.memoryPreview ?? "No tracker memory block available yet.";
    const injectionPreviewText = state.injectionPreview ?? "No injection preview available yet.";
    const renderPreview = state.renderPreview;
    const renderStatus = renderPreview?.status ?? "not rendered";
    const renderSnapshotAt = renderPreview?.snapshotCreatedAt ?? "None";
    const renderHasTemplate = state.activePreset.htmlTemplate?.trim() ? "yes" : "no";
    const renderHtmlPreview = renderPreview?.html ? `<div class="ltracker-render-preview">${renderPreview.html}</div>` : `<div class="ltracker-render-preview ltracker-render-placeholder">${escapeHtml2("No sanitized HTML preview yet. Render a snapshot to preview the active template.")}</div>`;
    const renderTextFallback = renderPreview?.textFallback ?? "No text fallback preview yet. Render a snapshot to create one.";
    const renderWarningsText = renderPreview?.warnings.length ? renderPreview.warnings.join("\n") : "None";
    const renderErrorsText = renderPreview?.errors.length ? renderPreview.errors.join("\n") : "None";
    const messageHistoryHtml = renderMessageHistory();
    const placementWarning = state.settings.messageDisplay.placement === "top" && diagnostics.messageWidgetPlacementReason && diagnostics.messageDisplayRenderer === "iframe_widget" ? `<p class="ltracker-note">${escapeHtml2("Current Lumiverse widget API renders below messages.")}</p>` : "";
    const currentDisplaySurface = resolveDisplaySurface(state.settings);
    const overlaySurfaceSelected = currentDisplaySurface === "anchored_popover" || currentDisplaySurface === "fullscreen_reader";
    const displaySurfaceNote = currentDisplaySurface === "inline_wide" ? "Inline wide uses a wide message-row mount and width settings below." : overlaySurfaceSelected ? "Popover and fullscreen are detached from message-bubble width limits; width fields below apply to inline surfaces." : currentDisplaySurface === "drawer_only" ? "Drawer history only removes inline chat display." : "Inline contained stays inside the normal message bubble.";
    const inlineOnlySuffix = overlaySurfaceSelected || currentDisplaySurface === "drawer_only" ? " (inline only)" : "";
    const activePreset = state.activePreset;
    const activePresetIsBuiltIn = activePreset.origin === "built_in";
    const presetSchemaText = JSON.stringify(activePreset.jsonSchema, null, 2);
    const presetHtmlWarning = activePreset.htmlTemplate?.trim() ? "" : activePresetIsBuiltIn ? "Built-in preset has no HTML template." : "";
    const presetOptions = state.presets.map((preset) => {
      return `<option value="${escapeHtml2(preset.id)}"${selected(preset.id === activePreset.id)}>${escapeHtml2(preset.name)} (${escapeHtml2(preset.origin)})</option>`;
    }).join("");
    const permissionText = [
      state.permissions.generation ? "generation granted" : "generation missing",
      state.permissions.chats ? "chats granted" : "chats missing",
      state.permissions.chatMutation ? "chat_mutation granted" : "chat_mutation missing",
      diagnostics.contextHandlerDisabledReason ? "context_handler disabled by hotfix" : state.permissions.contextHandler ? "context_handler granted" : "context_handler missing",
      state.permissions.interceptor ? "interceptor granted" : "interceptor missing"
    ].join(" / ");
    const connectionSettings = state.settings.connection;
    const selectedConnection = connectionSettings.selectedConnectionId ? state.connectionProfiles.find((profile) => profile.id === connectionSettings.selectedConnectionId) ?? null : null;
    const connectionOptions = [
      `<option value=""${selected(!connectionSettings.selectedConnectionId)}>None selected</option>`,
      ...state.connectionProfiles.map((profile) => {
        const label = [
          profile.name,
          profile.provider ? `provider ${profile.provider}` : null,
          profile.model ? `model ${profile.model}` : null,
          profile.is_default ? "default" : null
        ].filter((item) => Boolean(item)).join(" / ");
        return `<option value="${escapeHtml2(profile.id)}"${selected(profile.id === connectionSettings.selectedConnectionId)}>${escapeHtml2(label)}</option>`;
      }),
      connectionSettings.selectedConnectionId && !selectedConnection ? `<option value="${escapeHtml2(connectionSettings.selectedConnectionId)}" selected>${escapeHtml2(connectionSettings.selectedConnectionName ?? connectionSettings.selectedConnectionId)} (missing)</option>` : ""
    ].join("");
    const connectionWarning = connectionSettings.mode !== "active_quiet" && !connectionSettings.selectedConnectionId ? "Selected connection mode needs a connection profile. LTracker will fall back to active quiet mode." : connectionSettings.mode !== "active_quiet" && !selectedConnection ? "Selected tracker connection is not in the current profile list. LTracker will fall back to active quiet mode." : diagnostics.lastGenerationConnectionFallbackReason;
    const reasoningControls = connectionSettings.reasoning.source === "custom" ? `
            <label class="ltracker-check">
              <input type="checkbox" data-connection-reasoning="apiReasoning"${checked(connectionSettings.reasoning.apiReasoning)}>
              API reasoning
            </label>
            <label class="ltracker-field">
              Effort
              <select data-connection-reasoning="effort">
                <option value="auto"${selected(connectionSettings.reasoning.effort === "auto")}>Auto</option>
                <option value="none"${selected(connectionSettings.reasoning.effort === "none")}>None</option>
                <option value="minimal"${selected(connectionSettings.reasoning.effort === "minimal")}>Minimal</option>
                <option value="low"${selected(connectionSettings.reasoning.effort === "low")}>Low</option>
                <option value="medium"${selected(connectionSettings.reasoning.effort === "medium")}>Medium</option>
                <option value="high"${selected(connectionSettings.reasoning.effort === "high")}>High</option>
                <option value="max"${selected(connectionSettings.reasoning.effort === "max")}>Max</option>
                <option value="xhigh"${selected(connectionSettings.reasoning.effort === "xhigh")}>XHigh</option>
              </select>
            </label>
            <label class="ltracker-field">
              Thinking display
              <select data-connection-reasoning="thinkingDisplay">
                <option value="auto"${selected(connectionSettings.reasoning.thinkingDisplay === "auto")}>Auto</option>
                <option value="summarized"${selected(connectionSettings.reasoning.thinkingDisplay === "summarized")}>Summarized</option>
                <option value="omitted"${selected(connectionSettings.reasoning.thinkingDisplay === "omitted")}>Omitted</option>
              </select>
            </label>
        ` : "";
    const connectionTestRunning = diagnostics.lastConnectionTestStatus === "running";
    const connectionTestSummary = [
      `status ${diagnostics.lastConnectionTestStatus}`,
      diagnostics.lastConnectionTestDurationMs !== null ? `duration ${formatDurationMs2(diagnostics.lastConnectionTestDurationMs)}` : null,
      diagnostics.lastConnectionTestFinishReason ? `finish ${diagnostics.lastConnectionTestFinishReason}` : null,
      diagnostics.lastConnectionTestError ? `error ${diagnostics.lastConnectionTestError}` : null
    ].filter((item) => Boolean(item)).join(" / ");
    const recommendedConnection = activePreset.recommendedConnection;
    const recommendedConnectionText = recommendedConnection ? [
      recommendedConnection.notes ?? null,
      recommendedConnection.mode ? `mode ${recommendedConnection.mode}` : null,
      recommendedConnection.temperature !== void 0 ? `temperature ${recommendedConnection.temperature}` : null,
      recommendedConnection.max_tokens !== void 0 ? `max_tokens ${recommendedConnection.max_tokens}` : null,
      recommendedConnection.reasoning?.source ? `reasoning ${recommendedConnection.reasoning.source}` : null
    ].filter((item) => Boolean(item)).join(" / ") : null;
    let importReviewHtml = "";
    if (stagedImportPack) {
      const pack = stagedImportPack;
      const preset = pack.preset;
      const meta = pack.packMeta;
      const hasRec = Boolean(pack.recommendedSettings);
      const overwriteOptions = state.presets.filter((p) => p.origin !== "built_in" && p.id !== DEFAULT_TRACKER_PRESET_ID).map((p) => `<option value="${escapeHtml2(p.id)}">${escapeHtml2(p.name)}</option>`).join("");
      const recDetailsList = [];
      if (pack.recommendedSettings) {
        const rec = pack.recommendedSettings;
        if (rec.connection) {
          recDetailsList.push(`Connection settings (mode: ${rec.connection.mode || "inherit"})`);
        }
        if (rec.memory) {
          recDetailsList.push(`Memory settings (retain: ${rec.memory.retainCount ?? "inherit"})`);
        }
        if (rec.injection) {
          recDetailsList.push(`Injection settings (format: ${rec.injection.format ?? "inherit"})`);
        }
        if (rec.messageDisplay) {
          recDetailsList.push(`Display settings (surface: ${rec.messageDisplay.displaySurface ?? rec.messageDisplay.displayMode ?? "inherit"})`);
        }
        if (rec.expandedWidth) {
          recDetailsList.push(`Expanded width settings (mode: ${rec.expandedWidth.expandedWidthMode ?? "inherit"})`);
        }
        if (rec.budget) {
          recDetailsList.push(`Budget settings (ultra mode: ${rec.budget.ultraModeEnabled ? "enabled" : "disabled"})`);
        }
      }
      const recDetailsHtml = recDetailsList.length > 0 ? `<div class="ltracker-rec-details" style="font-size: 10px; color: #aaa; margin-top: 4px; padding-left: 10px;">Applying recommendations will update:<ul>${recDetailsList.map((item) => `<li>${escapeHtml2(item)}</li>`).join("")}</ul></div>` : "";
      const rendererRequirements = detectTemplateRendererRequirements(preset?.htmlTemplate ?? "");
      const rendererRequirementsHtml = rendererRequirements.features.length > 0 || rendererRequirements.warnings.length > 0 ? `
          <div class="ltracker-rec-details" style="font-size: 11px; color: #ddd; margin-bottom: 12px; border: 1px solid rgba(155,92,255,.35); padding: 8px; border-radius: 6px;">
            <strong>This preset uses:</strong>
            <ul style="margin: 6px 0 6px 18px; padding: 0;">
              ${rendererRequirements.features.map((feature) => `<li>${escapeHtml2(feature)}</li>`).join("") || "<li>Basic HTML template features</li>"}
            </ul>
            <div>Recommended mode: ${escapeHtml2(rendererRequirements.recommendedMode === "dev" ? "Trusted; JavaScript remains stripped until future Dev Mode" : rendererRequirements.recommendedMode === "trusted" ? "Trusted" : "Safe")}</div>
            ${rendererRequirements.warnings.map((warning) => `<div style="color: #fbbc05; margin-top: 4px;">${escapeHtml2(warning)}</div>`).join("")}
          </div>
        ` : "";
      importReviewHtml = `
        <div class="ltracker-import-review" style="border: 1px solid var(--border-color, #444); padding: 12px; border-radius: 6px; background: rgba(255,255,255,0.02); margin-bottom: 15px;">
          <h3 style="margin-top: 0; color: #9b5cff; font-size: 14px; font-weight: bold; margin-bottom: 8px;">Preset Pack Import Review</h3>
          <div class="ltracker-grid ltracker-details" style="margin-bottom: 12px;">
            ${renderRow("Pack name", preset?.name ?? "Unknown")}
            ${renderRow("Version", preset?.version ?? "1.0")}
            ${renderRow("Author/Exported by", meta?.author ?? "Unknown")}
            ${renderRow("Exported at", meta?.exportedAt ?? "Unknown")}
            ${renderRow("Description", preset?.description ?? "None")}
            ${renderRow("Min. LTracker version", meta?.minVersion ?? "None")}
          </div>
          ${rendererRequirementsHtml}

          <div class="ltracker-settings" style="margin-bottom: 12px;">
            <label class="ltracker-field">
              Preset name (editable)
              <input type="text" data-import-review-name value="${escapeHtml2(preset?.name ?? "Imported Preset")}">
            </label>
            <label class="ltracker-field">
              Install mode
              <select data-import-review-install-mode>
                <option value="new">Save as new preset</option>
                ${overwriteOptions ? `<option value="overwrite">Overwrite existing preset</option>` : ""}
              </select>
            </label>
            ${overwriteOptions ? `
              <label class="ltracker-field" data-import-review-overwrite-container style="display: none;">
                Preset to overwrite
                <select data-import-review-overwrite-target>
                  ${overwriteOptions}
                </select>
              </label>
            ` : ""}
            <label class="ltracker-field">
              Template trust mode
              <select data-import-review-trust-mode>
                <option value="trusted"${selected(rendererRequirements.recommendedMode !== "safe")}>Trusted</option>
                <option value="safe"${selected(rendererRequirements.recommendedMode === "safe")}>Safe</option>
              </select>
            </label>
            ${hasRec ? `
              <label class="ltracker-check">
                <input type="checkbox" data-import-review-apply-settings checked>
                Apply recommended settings
              </label>
              ${recDetailsHtml}
            ` : ""}
          </div>

          <div class="ltracker-actions">
            <button class="ltracker-button" type="button" data-action="import-preset-pack" style="background: #9b5cff; color: #fff;">
              Install Preset
            </button>
            <button class="ltracker-button" type="button" data-action="cancel-import">
              Cancel Import
            </button>
          </div>
        </div>
      `;
    }
    let validationReportHtml = "";
    if (stagedValidationReport) {
      const rep = stagedValidationReport;
      const entriesHtml = rep.entries.map((entry) => {
        let badgeColor = "#444";
        if (entry.severity === "error") badgeColor = "#ea4335";
        if (entry.severity === "warning") badgeColor = "#fbbc05";
        if (entry.severity === "pass") badgeColor = "#34a853";
        if (entry.severity === "info") badgeColor = "#4285f4";
        return `
          <div class="ltracker-validation-entry" style="display: flex; gap: 8px; margin-bottom: 4px; font-size: 11px; align-items: flex-start;">
            <span style="background: ${badgeColor}; color: #fff; padding: 1px 4px; border-radius: 3px; font-size: 9px; text-transform: uppercase; font-weight: bold; min-width: 50px; text-align: center; margin-top: 2px;">
              ${escapeHtml2(entry.severity)}
            </span>
            <div>
              <span style="font-weight: bold; color: #ccc;">[${escapeHtml2(entry.category)}]</span>
              <span>${escapeHtml2(entry.message)}</span>
            </div>
          </div>
        `;
      }).join("");
      const placeholdersHtml = rep.missingPlaceholders.length > 0 ? `<p class="ltracker-note" style="color: #fbbc05; margin-top: 5px;">Missing Schema Fields: ${rep.missingPlaceholders.map((p) => `<code>${escapeHtml2(p)}</code>`).join(", ")}</p>` : "";
      const unusedHtml = rep.unusedSchemaFields.length > 0 ? `<p class="ltracker-note" style="color: #4285f4; margin-top: 5px;">Unused Schema Fields: ${rep.unusedSchemaFields.map((f) => `<code>${escapeHtml2(f)}</code>`).join(", ")}</p>` : "";
      const warningGroupsHtml = rep.sanitizerWarningGroups.length > 0 ? `
          <details style="margin-top: 5px;">
            <summary style="font-size: 11px; color: #fbbc05; cursor: pointer;">Sanitizer Warnings (${rep.sanitizerWarningGroups.length})</summary>
            <ul style="font-size: 10px; margin: 4px 0 0 15px; padding: 0; color: #aaa;">
              ${rep.sanitizerWarningGroups.map((g) => `<li>${escapeHtml2(g)}</li>`).join("")}
            </ul>
          </details>
        ` : "";
      const rendererReqHtml = rep.rendererRequirements.features.length > 0 || rep.rendererRequirements.warnings.length > 0 ? `
          <div style="font-size: 11px; color: #ddd; margin-top: 8px; border: 1px solid rgba(155,92,255,.25); padding: 6px; border-radius: 4px;">
            Renderer requirements: ${escapeHtml2(rep.rendererRequirements.features.join(", ") || "Basic HTML")}
            <br>Recommended mode: ${escapeHtml2(rep.rendererRequirements.recommendedMode === "dev" ? "Trusted now; future Dev Mode for JavaScript-like content" : rep.rendererRequirements.recommendedMode)}
          </div>
        ` : "";
      validationReportHtml = `
        <div class="ltracker-validation-report" style="border: 1px solid var(--border-color, #444); padding: 12px; border-radius: 6px; background: rgba(255,255,255,0.01); margin-top: 15px;">
          <h3 style="margin-top: 0; color: ${rep.ok ? "#34a853" : "#ea4335"}; font-size: 14px; font-weight: bold; margin-bottom: 8px;">
            Preset Validation: ${rep.ok ? "Passed" : "Failed with Errors"}
          </h3>
          <div class="ltracker-chip-row" style="margin-bottom: 8px;">
            <span class="ltracker-chip" style="background: rgba(234,67,53,0.1); color: #ea4335;">Errors: ${rep.errorCount}</span>
            <span class="ltracker-chip" style="background: rgba(251,188,5,0.1); color: #fbbc05;">Warnings: ${rep.warningCount}</span>
            <span class="ltracker-chip" style="background: rgba(52,168,83,0.1); color: #34a853;">Passes: ${rep.passCount}</span>
          </div>

          <div style="max-height: 200px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.05); padding: 6px; border-radius: 4px; background: rgba(0,0,0,0.1); margin-bottom: 8px;">
            ${entriesHtml}
          </div>

          ${placeholdersHtml}
          ${unusedHtml}
          ${warningGroupsHtml}
          ${rendererReqHtml}

          <div class="ltracker-grid ltracker-details" style="margin-top: 8px; font-size: 11px;">
            ${renderRow("Est. Pack Size", `${rep.estimatedPackSizeChars.toLocaleString()} chars`)}
            ${renderRow("Est. Prompt Tokens", `~${rep.estimatedPromptTokens.toLocaleString()}`)}
            ${renderRow("Est. Rendered HTML Size", `${rep.estimatedRenderedChars.toLocaleString()} chars`)}
            ${renderRow("Ultra Mode recommended", rep.estimatedPromptTokens > 8e3 || rep.estimatedRenderedChars > 1e5 ? "Yes" : "No")}
          </div>
        </div>
      `;
    }
    let sampleSnapshotHtml = "";
    if (stagedSampleSnapshot) {
      const renderPreview2 = stagedSampleRenderResult;
      const sampleHtmlPreview = renderPreview2?.html ? `<div class="ltracker-render-preview">${renderPreview2.html}</div>` : `<div class="ltracker-render-preview ltracker-render-placeholder">${escapeHtml2("No HTML preview rendered.")}</div>`;
      sampleSnapshotHtml = `
        <div class="ltracker-sample-snapshot-preview" style="border: 1px solid var(--border-color, #444); padding: 12px; border-radius: 6px; background: rgba(255,255,255,0.01); margin-top: 15px;">
          <h3 style="margin-top: 0; color: #4285f4; font-size: 14px; font-weight: bold; margin-bottom: 8px;">Sample Snapshot & Render Preview</h3>
          <details style="margin-bottom: 8px;">
            <summary style="font-size: 11px; cursor: pointer; color: #aaa;">View Sample Snapshot Data</summary>
            <pre class="ltracker-json" style="max-height: 150px; font-size: 10px;">${escapeHtml2(JSON.stringify(stagedSampleSnapshot, null, 2))}</pre>
          </details>

          ${sampleHtmlPreview}

          <div class="ltracker-actions" style="margin-top: 8px;">
            <button class="ltracker-button" type="button" data-action="copy-sample-snapshot">
              Copy Sample Snapshot JSON
            </button>
            <button class="ltracker-button" type="button" data-action="copy-render-html-sample" ${disabled(!renderPreview2?.html)}>
              Copy Rendered HTML
            </button>
          </div>
        </div>
      `;
    }
    tab.root.innerHTML = `
      <section class="ltracker-shell">
        <header class="ltracker-header">
          <div>
            <h2 class="ltracker-title">LTracker</h2>
            <div class="ltracker-version">Version ${escapeHtml2(state.version)}</div>
          </div>
          <div class="ltracker-actions">
            <span class="ltracker-status">${escapeHtml2(labelForStatus(state.status))}</span>
            <span class="ltracker-save-status" data-settings-save-status>${escapeHtml2(settingsSaveStatusLabel())}</span>
          </div>
        </header>

        <nav class="ltracker-section-nav" aria-label="LTracker sections">
          ${["Dashboard", "Generation", "Auto", "Connection", "Display", "Renderer", "Memory / Injection", "Presets", "History", "Diagnostics", "Advanced"].map((label) => {
      const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return `<a class="ltracker-nav-chip" data-drawer-section="${escapeHtml2(id)}" href="#ltracker-section-${id}">${escapeHtml2(label)}</a>`;
    }).join("")}
        </nav>

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

        <section class="ltracker-panel ltracker-section" id="ltracker-section-dashboard">
          <div class="ltracker-section-title">
            <span class="ltracker-label">Dashboard</span>
          </div>
          <div class="ltracker-chip-row">
            <span class="ltracker-chip">Auto ${escapeHtml2(state.settings.auto.autoModeEnabled ? "on" : "off")}</span>
            <span class="ltracker-chip">Memory ${escapeHtml2(state.settings.memory.enabled ? "on" : "off")}</span>
            <span class="ltracker-chip">Inject ${escapeHtml2(state.settings.injection.enabled ? "on" : "off")}</span>
            <span class="ltracker-chip">Display ${escapeHtml2(diagnostics.messageDisplayMode ?? "drawer")}</span>
            <span class="ltracker-chip">Attach ${escapeHtml2(state.settings.messageDisplay.attachmentMode)}</span>
          </div>
          <div class="ltracker-grid ltracker-details">
            ${renderRow("Active preset", activePreset.name)}
            ${renderRow("Tracker connection", connectionSettings.selectedConnectionName ?? connectionSettings.mode)}
            ${renderRow("Latest snapshot", state.snapshot?.createdAt ?? null)}
            ${renderRow("Latest memory", diagnostics.lastMemorySourceSummary)}
            ${renderRow("Auto finalization", diagnostics.lastAutoFinalizationState)}
            ${renderRow("Waiting message", diagnostics.lastAutoWaitingMessageId)}
          </div>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="generate" ${disabled(!canGenerate)}>Generate Tracker</button>
            <button class="ltracker-button" type="button" data-action="refresh">Refresh State</button>
            <button class="ltracker-button" type="button" data-action="render-template" ${disabled(!state.chatId)}>Render Latest Snapshot</button>
            <button class="ltracker-button" type="button" data-action="reset-settings">Reset Settings</button>
          </div>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-generation">
          <span class="ltracker-label">Generation</span>
          <div class="ltracker-settings">
            <label class="ltracker-field">
              Recent message limit
              <input type="number" min="1" max="200" step="1" data-setting="recentMessageLimit" value="${escapeHtml2(String(state.settings.recentMessageLimit))}">
            </label>
            <label class="ltracker-field">
              Per-message chars
              <input type="number" min="500" max="512000" step="100" data-setting="maxMessageChars" value="${escapeHtml2(String(state.settings.maxMessageChars))}">
            </label>
            <label class="ltracker-field">
              Timeout ms
              <input type="number" min="10000" max="180000" step="1000" data-setting="generationTimeoutMs" value="${escapeHtml2(String(state.settings.generationTimeoutMs))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="saveRawOutput"${checked(state.settings.saveRawOutput)}>
              Save raw output
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="savePromptPreview"${checked(state.settings.savePromptPreview)}>
              Save prompt preview
            </label>
            <label class="ltracker-field">
              Budget mode
              <select data-budget-setting="mode">
                <option value="estimated_tokens"${selected(state.settings.budget.mode === "estimated_tokens")}>Estimated tokens</option>
                <option value="characters"${selected(state.settings.budget.mode === "characters")}>Characters</option>
              </select>
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-budget-setting="ultraModeEnabled"${checked(state.settings.budget.ultraModeEnabled)}>
              Ultra Tracker Mode
            </label>
            <label class="ltracker-field">
              Recent budget tokens
              <input type="number" min="256" max="128000" step="256" data-budget-setting="recentMessageBudgetTokens" value="${escapeHtml2(String(state.settings.budget.recentMessageBudgetTokens))}">
              <span class="ltracker-key">${escapeHtml2(budgetHint(state.settings.budget.recentMessageBudgetTokens))}</span>
            </label>
            <label class="ltracker-field">
              Per-message budget tokens
              <input type="number" min="256" max="128000" step="256" data-budget-setting="perMessageBudgetTokens" value="${escapeHtml2(String(state.settings.budget.perMessageBudgetTokens))}">
              <span class="ltracker-key">${escapeHtml2(budgetHint(state.settings.budget.perMessageBudgetTokens))}</span>
            </label>
            <label class="ltracker-field">
              Max tracker output tokens
              <input type="number" min="256" max="64000" step="256" data-budget-setting="maxTrackerOutputTokens" value="${escapeHtml2(String(state.settings.budget.maxTrackerOutputTokens))}">
            </label>
            <label class="ltracker-field">
              Prompt preview tokens
              <input type="number" min="256" max="128000" step="256" data-budget-setting="promptPreviewBudgetTokens" value="${escapeHtml2(String(state.settings.budget.promptPreviewBudgetTokens))}">
            </label>
            <label class="ltracker-field">
              Raw output chars
              <input type="number" min="1000" max="2000000" step="1000" data-budget-setting="rawOutputMaxChars" value="${escapeHtml2(String(state.settings.budget.rawOutputMaxChars))}">
              <span class="ltracker-key">${escapeHtml2(charLimitHint(state.settings.budget.rawOutputMaxChars))}</span>
            </label>
          </div>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="reset-settings">Reset Settings</button>
          </div>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-auto">
          <span class="ltracker-label">Auto</span>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-setting="autoModeEnabled"${checked(state.settings.auto.autoModeEnabled)}>
              Auto mode
            </label>
            <label class="ltracker-field">
              Wait after message finishes
              <input type="number" min="250" max="30000" step="250" data-setting="autoDebounceMs" value="${escapeHtml2(String(state.settings.auto.autoDebounceMs))}">
            </label>
            <label class="ltracker-field">
              Skip first messages
              <input type="number" min="0" max="100" step="1" data-setting="skipFirstMessages" value="${escapeHtml2(String(state.settings.auto.skipFirstMessages))}">
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
            <label class="ltracker-check">
              <input type="checkbox" data-auto-timing-setting="waitForAssistantFinalization"${checked(state.settings.autoTiming.waitForAssistantFinalization)}>
              Wait for assistant finalization
            </label>
            <label class="ltracker-field">
              Settle ms
              <input type="number" min="0" max="10000" step="50" data-auto-timing-setting="postCompletionSettleMs" value="${escapeHtml2(String(state.settings.autoTiming.postCompletionSettleMs))}">
            </label>
            <label class="ltracker-field">
              Stable check ms
              <input type="number" min="0" max="5000" step="50" data-auto-timing-setting="stableContentCheckMs" value="${escapeHtml2(String(state.settings.autoTiming.stableContentCheckMs))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-auto-timing-setting="requireStableSwipeContent"${checked(state.settings.autoTiming.requireStableSwipeContent)}>
              Require stable swipe content
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-auto-timing-setting="cancelPendingOnSwipeChange"${checked(state.settings.autoTiming.cancelPendingOnSwipeChange)}>
              Cancel pending on swipe change
            </label>
          </div>
          <div class="ltracker-grid ltracker-details">
            ${renderRow("Finalization state", diagnostics.lastAutoFinalizationState)}
            ${renderRow("Waiting message", diagnostics.lastAutoWaitingMessageId)}
            ${renderRow("Waiting swipe", diagnostics.lastAutoWaitingSwipeKey)}
            ${renderRow("Stable passed", diagnostics.lastAutoStableCheckPassed === null ? null : diagnostics.lastAutoStableCheckPassed ? "yes" : "no")}
            ${renderRow("Pending finalizations", diagnostics.pendingAutoFinalizationCount)}
          </div>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-connection">
          <span class="ltracker-label">Tracker Connection</span>
          <div class="ltracker-settings">
            <label class="ltracker-field">
              Tracker Profile
              <select data-connection-setting="selectedConnectionId">
                ${connectionOptions}
              </select>
            </label>
            <p class="ltracker-note" style="margin-top: 2px; margin-bottom: 8px;">Fallback: Use active roleplay connection if tracker profile is unavailable</p>
            <label class="ltracker-check">
              <input type="checkbox" data-connection-setting="refreshConnectionsOnDrawerOpen"${checked(connectionSettings.refreshConnectionsOnDrawerOpen)}>
              Refresh on drawer open
            </label>
            <label class="ltracker-field ltracker-field-wide">
              Test prompt
              <textarea data-connection-setting="testPrompt">${escapeHtml2(connectionSettings.testPrompt || TRACKER_CONNECTION_DEFAULT_TEST_PROMPT)}</textarea>
            </label>
          </div>
          ${connectionWarning ? `<p class="ltracker-note">${escapeHtml2(connectionWarning)}</p>` : ""}
          <div class="ltracker-actions" style="margin-top: 10px; margin-bottom: 10px;">
            <button class="ltracker-button" type="button" data-action="refresh-connections">Refresh Connections</button>
            <button class="ltracker-button" type="button" data-action="test-connection" ${disabled(connectionTestRunning)}>Test Tracker Connection</button>
            <button class="ltracker-button" type="button" data-action="cancel-connection-test" ${disabled(!connectionTestRunning)}>Cancel Test</button>
          </div>
          <div class="ltracker-grid ltracker-details">
            ${renderRow("Selected name", selectedConnection?.name ?? connectionSettings.selectedConnectionName)}
            ${renderRow("Selected id", connectionSettings.selectedConnectionId)}
            ${renderRow("Provider", selectedConnection?.provider ?? null)}
            ${renderRow("Model", selectedConnection?.model ?? null)}
            ${renderRow("Has API key", selectedConnection?.has_api_key === null || selectedConnection?.has_api_key === void 0 ? null : selectedConnection.has_api_key ? "yes" : "no")}
            ${renderRow("Reasoning binding", compactRecord(selectedConnection?.reasoning_bindings ?? null))}
            ${renderRow("Profiles loaded", state.connectionProfiles.length)}
            ${renderRow("Last refresh", diagnostics.lastConnectionRefreshAt)}
            ${renderRow("Refresh error", diagnostics.lastConnectionRefreshError)}
            ${renderRow("Connection test", connectionTestSummary || null)}
          </div>

          <details class="ltracker-details" style="margin-top: 15px;">
            <summary style="font-weight: bold; cursor: pointer;">Advanced Connection & Model Parameters</summary>
            <div class="ltracker-settings" style="margin-top: 10px;">
              <label class="ltracker-field">
                Low-level Connection Mode
                <select data-connection-setting="mode">
                  <option value="selected_connection_raw"${selected(connectionSettings.mode === "selected_connection_raw")}>Selected profile + raw parameters (Default)</option>
                  <option value="active_quiet"${selected(connectionSettings.mode === "active_quiet")}>Always use active chat connection</option>
                  <option value="selected_connection_quiet"${selected(connectionSettings.mode === "selected_connection_quiet")}>Selected profile, quiet mode</option>
                </select>
              </label>
              <label class="ltracker-field">
                Temperature
                <input type="number" min="0" max="2" step="0.05" data-connection-parameter="temperature" value="${escapeHtml2(numberInputValue(connectionSettings.parameters.temperature))}">
              </label>
              <label class="ltracker-field">
                Max tokens
                <input type="number" min="256" max="64000" step="256" data-connection-parameter="max_tokens" value="${escapeHtml2(numberInputValue(connectionSettings.parameters.max_tokens))}">
              </label>
              <label class="ltracker-field">
                Top p
                <input type="number" min="0" max="1" step="0.05" data-connection-parameter="top_p" value="${escapeHtml2(numberInputValue(connectionSettings.parameters.top_p))}">
              </label>
              <label class="ltracker-field">
                Frequency penalty
                <input type="number" min="-2" max="2" step="0.05" data-connection-parameter="frequency_penalty" value="${escapeHtml2(numberInputValue(connectionSettings.parameters.frequency_penalty))}">
              </label>
              <label class="ltracker-field">
                Presence penalty
                <input type="number" min="-2" max="2" step="0.05" data-connection-parameter="presence_penalty" value="${escapeHtml2(numberInputValue(connectionSettings.parameters.presence_penalty))}">
              </label>
              <label class="ltracker-field">
                Reasoning Source
                <select data-connection-reasoning="source">
                  <option value="inherit"${selected(connectionSettings.reasoning.source === "inherit")}>Inherit</option>
                  <option value="off"${selected(connectionSettings.reasoning.source === "off")}>Off</option>
                  <option value="custom"${selected(connectionSettings.reasoning.source === "custom")}>Custom</option>
                </select>
              </label>
              ${reasoningControls}
            </div>
            <div class="ltracker-actions" style="margin-top: 10px;">
              <button class="ltracker-button" type="button" data-action="reset-connection-parameters">Reset Parameters</button>
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Last connection test output</summary>
            <pre class="ltracker-text">${escapeHtml2(diagnostics.lastConnectionTestOutputPreview ?? "None")}</pre>
          </details>
          <details class="ltracker-details">
            <summary>Last connection test usage</summary>
            <pre class="ltracker-text">${escapeHtml2(compactRecord(diagnostics.lastConnectionTestUsage) ?? "None")}</pre>
          </details>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-memory-injection">
          <span class="ltracker-label">Tracker Memory</span>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-memory-setting="enabled"${checked(state.settings.memory.enabled)}>
              Enable tracker memory
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-memory-setting="includeInTrackerGeneration"${checked(state.settings.memory.includeInTrackerGeneration)}>
              Include in tracker generation
            </label>
            <label class="ltracker-field">
              Retain last N
              <input type="number" min="0" max="10" step="1" data-memory-setting="retainCount" value="${escapeHtml2(String(state.settings.memory.retainCount))}">
            </label>
            <label class="ltracker-field">
              Full snapshots
              <input type="number" min="0" max="10" step="1" data-memory-setting="fullSnapshotCount" value="${escapeHtml2(String(state.settings.memory.fullSnapshotCount))}">
            </label>
            <label class="ltracker-field">
              Memory budget tokens
              <input type="number" min="256" max="128000" step="256" data-budget-setting="trackerMemoryBudgetTokens" value="${escapeHtml2(String(state.settings.budget.trackerMemoryBudgetTokens))}">
              <span class="ltracker-key">${escapeHtml2(budgetHint(state.settings.budget.trackerMemoryBudgetTokens))}</span>
            </label>
            <label class="ltracker-field">
              Memory source
              <select data-memory-setting="source">
                <option value="hybrid"${selected(state.settings.memory.source === "hybrid")}>Hybrid</option>
                <option value="sidecar_index"${selected(state.settings.memory.source === "sidecar_index")}>Sidecar index</option>
                <option value="embedded_tags"${selected(state.settings.memory.source === "embedded_tags")}>Embedded tags</option>
                <option value="message_history"${selected(state.settings.memory.source === "message_history")}>Message history</option>
              </select>
            </label>
            <label class="ltracker-field">
              Order
              <select data-memory-setting="order">
                <option value="oldest_to_newest"${selected(state.settings.memory.order === "oldest_to_newest")}>Oldest to newest</option>
                <option value="newest_to_oldest"${selected(state.settings.memory.order === "newest_to_oldest")}>Newest to oldest</option>
              </select>
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-memory-setting="compactOlderSnapshots"${checked(state.settings.memory.compactOlderSnapshots)}>
              Compact older snapshots
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-memory-setting="excludeTargetMessage"${checked(state.settings.memory.excludeTargetMessage)}>
              Exclude target message
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-memory-setting="requireSamePreset"${checked(state.settings.memory.requireSamePreset)}>
              Require same preset
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-memory-setting="requireSameSwipeWhenAvailable"${checked(state.settings.memory.requireSameSwipeWhenAvailable)}>
              Require same swipe when available
            </label>
          </div>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="copy-memory-preview" ${disabled(!state.memoryPreview)}>
              Copy Memory Block
            </button>
          </div>
          <details class="ltracker-details">
            <summary>Preview memory block</summary>
            <pre class="ltracker-text">${escapeHtml2(memoryPreviewText)}</pre>
          </details>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Advanced Prompt Injection</span>
          <p class="ltracker-note">${escapeHtml2("Normal prompt injection affects roleplay prompt context and uses the interceptor path. Keep it off if you only want tracker-generation memory.")}</p>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-injection-setting="enabled"${checked(state.settings.injection.enabled)}>
              Enable normal prompt injection
            </label>
            <label class="ltracker-field">
              Retain last N
              <input type="number" min="0" max="10" step="1" data-injection-setting="retainCount" value="${escapeHtml2(String(state.settings.injection.retainCount))}">
            </label>
            <label class="ltracker-field">
              Format
              <select data-injection-setting="format">
                <option value="embedded_tag"${selected(state.settings.injection.format === "embedded_tag")}>Embedded tag</option>
                <option value="compact_text"${selected(state.settings.injection.format === "compact_text")}>Compact text</option>
                <option value="pretty_json"${selected(state.settings.injection.format === "pretty_json")}>Pretty JSON</option>
                <option value="minimal"${selected(state.settings.injection.format === "minimal")}>Minimal</option>
              </select>
            </label>
            <label class="ltracker-field">
              Placement
              <select data-injection-setting="injectionPlacement">
                <option value="append_to_last_assistant"${selected(state.settings.injection.injectionPlacement === "append_to_last_assistant")}>Append to last assistant</option>
                <option value="system_before_last"${selected(state.settings.injection.injectionPlacement === "system_before_last")}>System before last</option>
                <option value="system_after_history"${selected(state.settings.injection.injectionPlacement === "system_after_history")}>System after history</option>
              </select>
            </label>
            <label class="ltracker-field">
              Injection budget tokens
              <input type="number" min="256" max="128000" step="256" data-budget-setting="promptInjectionBudgetTokens" value="${escapeHtml2(String(state.settings.budget.promptInjectionBudgetTokens))}">
              <span class="ltracker-key">${escapeHtml2(budgetHint(state.settings.budget.promptInjectionBudgetTokens))}</span>
            </label>
            <label class="ltracker-field">
              Role fallback
              <select data-injection-setting="roleFallback">
                <option value="system"${selected(state.settings.injection.roleFallback === "system")}>System</option>
                <option value="assistant"${selected(state.settings.injection.roleFallback === "assistant")}>Assistant</option>
              </select>
            </label>
            <label class="ltracker-field">
              Header
              <input type="text" data-injection-setting="header" value="${escapeHtml2(state.settings.injection.header)}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-injection-setting="includeOnlyIfMissingFromPrompt"${checked(state.settings.injection.includeOnlyIfMissingFromPrompt)}>
              Only backfill if missing
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-injection-setting="stripOlderTrackerBlocks"${checked(state.settings.injection.stripOlderTrackerBlocks)}>
              Strip older tracker blocks
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-injection-setting="includeHeader"${checked(state.settings.injection.includeHeader)}>
              Include header
            </label>
          </div>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="copy-injection-preview" ${disabled(!state.injectionPreview)}>
              Copy Injection Preview
            </button>
          </div>
          <details class="ltracker-details">
            <summary>Current injection preview</summary>
            <pre class="ltracker-text">${escapeHtml2(injectionPreviewText)}</pre>
          </details>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-renderer">
          <span class="ltracker-label">Renderer</span>
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
              <input type="text" data-renderer-setting="missingValuePlaceholder" value="${escapeHtml2(state.settings.renderer.missingValuePlaceholder)}">
            </label>
            <label class="ltracker-field">
              Template mode
              <select data-renderer-setting="templateTrustMode">
                <option value="trusted"${selected(state.settings.renderer.templateTrustMode === "trusted")}>Trusted</option>
                <option value="safe"${selected(state.settings.renderer.templateTrustMode === "safe")}>Safe</option>
                <option value="dev"${selected(state.settings.renderer.templateTrustMode === "dev")}>Dev future</option>
              </select>
            </label>
            <label class="ltracker-field">
              Rendered HTML chars
              <input type="number" min="1000" max="2000000" step="1000" data-budget-setting="renderedHtmlMaxChars" value="${escapeHtml2(String(state.settings.budget.renderedHtmlMaxChars))}">
              <span class="ltracker-key">${escapeHtml2(charLimitHint(state.settings.budget.renderedHtmlMaxChars))}</span>
            </label>
          </div>
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
            <button class="ltracker-button" type="button" data-action="copy-render-errors" ${disabled(!renderPreview || renderPreview.errors.length === 0 && renderPreview.warnings.length === 0)}>
              Copy Render Errors
            </button>
          </div>
          <details class="ltracker-details" open>
            <summary>Sanitized rendered HTML preview</summary>
            ${renderHtmlPreview}
          </details>
          <details class="ltracker-details">
            <summary>Plain-text fallback preview</summary>
            <pre class="ltracker-text">${escapeHtml2(renderTextFallback)}</pre>
          </details>
          <details class="ltracker-details">
            <summary>Render warnings</summary>
            <pre class="ltracker-text">${escapeHtml2(renderWarningsText)}</pre>
          </details>
          <details class="ltracker-details">
            <summary>Render errors</summary>
            <pre class="ltracker-text ltracker-error">${escapeHtml2(renderErrorsText)}</pre>
          </details>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-display">
          <span class="ltracker-label">Display</span>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="enabled"${checked(state.settings.messageDisplay.enabled)}>
              Enable message display
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="useDomInjection"${checked(state.settings.messageDisplay.useDomInjection)}>
              DOM injection primary
            </label>
            <label class="ltracker-field">
              Attachment mode
              <select data-message-display-setting="attachmentMode">
                <option value="sidecar_snapshot"${selected(state.settings.messageDisplay.attachmentMode === "sidecar_snapshot")}>Sidecar snapshot</option>
                <option value="embedded_tracker_tag"${selected(state.settings.messageDisplay.attachmentMode === "embedded_tracker_tag")}>Embedded tracker tag</option>
                <option value="both"${selected(state.settings.messageDisplay.attachmentMode === "both")}>Both</option>
              </select>
            </label>
            <label class="ltracker-field">
              Display surface
              <select data-message-display-setting="displaySurface">
                <option value="inline_contained"${selected(state.settings.messageDisplay.displaySurface === "inline_contained")}>Inline contained</option>
                <option value="inline_wide"${selected(state.settings.messageDisplay.displaySurface === "inline_wide")}>Inline wide</option>
                <option value="anchored_popover"${selected(state.settings.messageDisplay.displaySurface === "anchored_popover")}>Anchored popover</option>
                <option value="fullscreen_reader"${selected(state.settings.messageDisplay.displaySurface === "fullscreen_reader")}>Fullscreen reader</option>
                <option value="drawer_only"${selected(state.settings.messageDisplay.displaySurface === "drawer_only")}>Drawer history only</option>
              </select>
            </label>
            <p class="ltracker-note ltracker-field-wide">${escapeHtml2(displaySurfaceNote)}</p>
            <label class="ltracker-field">
              Placement
              <select data-message-display-setting="placement">
                <option value="top"${selected(state.settings.messageDisplay.placement === "top")}>Top</option>
                <option value="bottom"${selected(state.settings.messageDisplay.placement === "bottom")}>Bottom</option>
              </select>
            </label>
            <label class="ltracker-field">
              Source
              <select data-message-display-setting="source">
                <option value="message_attached_snapshot"${selected(state.settings.messageDisplay.source === "message_attached_snapshot")}>Message-attached snapshot</option>
                <option value="latest_chat_snapshot"${selected(state.settings.messageDisplay.source === "latest_chat_snapshot")}>Latest chat snapshot</option>
              </select>
            </label>
            <label class="ltracker-field">
              Render mode
              <select data-message-display-setting="renderMode">
                <option value="html_template"${selected(state.settings.messageDisplay.renderMode === "html_template")}>HTML template</option>
                <option value="compact_text"${selected(state.settings.messageDisplay.renderMode === "compact_text")}>Compact text</option>
                <option value="pretty_json"${selected(state.settings.messageDisplay.renderMode === "pretty_json")}>Pretty JSON</option>
              </select>
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="deduplicateRenderWarnings"${checked(state.settings.messageDisplay.deduplicateRenderWarnings)}>
              Deduplicate render warnings
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showRenderWarningsInDiagnosticsOnly"${checked(state.settings.messageDisplay.showRenderWarningsInDiagnosticsOnly)}>
              Keep warning details in diagnostics
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showGenerateButtonForMissingTracker"${checked(state.settings.messageDisplay.showGenerateButtonForMissingTracker)}>
              Missing tracker generate icon
            </label>
            <label class="ltracker-field">
              Control density
              <select data-message-display-setting="controlDensity">
                <option value="compact"${selected(state.settings.messageDisplay.controlDensity === "compact")}>Compact</option>
                <option value="comfortable"${selected(state.settings.messageDisplay.controlDensity === "comfortable")}>Comfortable</option>
              </select>
            </label>
            <label class="ltracker-field">
              Control placement
              <select data-message-display-setting="controlPlacement">
                <option value="message_header"${selected(state.settings.messageDisplay.controlPlacement === "message_header")}>Message header</option>
                <option value="inside_tracker_header"${selected(state.settings.messageDisplay.controlPlacement === "inside_tracker_header")}>Inside tracker header</option>
              </select>
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showExpandedHeaderActions"${checked(state.settings.messageDisplay.showExpandedHeaderActions)}>
              Expanded header actions
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showBottomActionsInInlineTracker"${checked(state.settings.messageDisplay.showBottomActionsInInlineTracker)}>
              Bottom inline actions
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="collapsedByDefault"${checked(state.settings.messageDisplay.collapsedByDefault)}>
              Collapsed by default
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="compactCollapsedHeader"${checked(state.settings.messageDisplay.compactCollapsedHeader)}>
              Compact collapsed header
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showTimestamp"${checked(state.settings.messageDisplay.showTimestamp)}>
              Show timestamp
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showPresetName"${checked(state.settings.messageDisplay.showPresetName)}>
              Show preset name
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showDebugCopyButtonsInHistory"${checked(state.settings.messageDisplay.showDebugCopyButtonsInHistory)}>
              History debug copy buttons
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showWidgetRegenerateButton"${checked(state.settings.messageDisplay.showWidgetRegenerateButton)}>
              Widget regenerate button
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showEditButton"${checked(state.settings.messageDisplay.showEditButton)}>
              Edit button
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showDeleteButton"${checked(state.settings.messageDisplay.showDeleteButton)}>
              Delete button
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showNoTrackerForSwipe"${checked(state.settings.messageDisplay.showNoTrackerForSwipe)}>
              No-tracker swipe state
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showGenerationDuration"${checked(state.settings.messageDisplay.showGenerationDuration)}>
              Generation duration
            </label>
            <label class="ltracker-field">
              Expanded width mode${escapeHtml2(inlineOnlySuffix)}
              <select data-expanded-width-setting="expandedWidthMode">
                <option value="contained"${selected(state.settings.expandedWidth.expandedWidthMode === "contained")}>Contained</option>
                <option value="wide"${selected(state.settings.expandedWidth.expandedWidthMode === "wide")}>Wide</option>
                <option value="full_mobile"${selected(state.settings.expandedWidth.expandedWidthMode === "full_mobile")}>Full mobile</option>
              </select>
            </label>
            <label class="ltracker-field">
              Max expanded width${escapeHtml2(inlineOnlySuffix)}
              <input type="number" min="320" max="1800" step="20" data-expanded-width-setting="maxExpandedWidthPx" value="${escapeHtml2(String(state.settings.expandedWidth.maxExpandedWidthPx))}">
            </label>
            <label class="ltracker-field">
              Mobile margin${escapeHtml2(inlineOnlySuffix)}
              <input type="number" min="0" max="32" step="1" data-expanded-width-setting="mobileHorizontalMarginPx" value="${escapeHtml2(String(state.settings.expandedWidth.mobileHorizontalMarginPx))}">
            </label>
            <label class="ltracker-field">
              Expanded max height${escapeHtml2(inlineOnlySuffix)}
              <input type="number" min="30" max="95" step="1" data-expanded-width-setting="expandedContentMaxHeightVh" value="${escapeHtml2(String(state.settings.expandedWidth.expandedContentMaxHeightVh))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-expanded-width-setting="preferFullscreenOnMobile"${checked(state.settings.expandedWidth.preferFullscreenOnMobile)}>
              Prefer fullscreen on mobile
            </label>
            <label class="ltracker-field">
              Fullscreen breakpoint px
              <input type="number" min="320" max="1800" step="50" data-expanded-width-setting="fullscreenBreakpointPx" value="${escapeHtml2(String(state.settings.expandedWidth.fullscreenBreakpointPx))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-expanded-width-setting="popoverBackdrop"${checked(state.settings.expandedWidth.popoverBackdrop)}>
              Popover backdrop overlay
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-expanded-width-setting="closeOnBackdropClick"${checked(state.settings.expandedWidth.closeOnBackdropClick)}>
              Close popover on backdrop click
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-expanded-width-setting="closeOnEscape"${checked(state.settings.expandedWidth.closeOnEscape)}>
              Close popover/reader on Escape
            </label>
            <label class="ltracker-field">
              Legacy minimized height
              <input type="number" min="0" max="400" step="10" data-message-display-setting="minimizedMaxHeightPx" value="${escapeHtml2(String(state.settings.messageDisplay.minimizedMaxHeightPx))}">
            </label>
            <label class="ltracker-field">
              Message render chars
              <input type="number" min="1000" max="2000000" step="1000" data-message-display-setting="maxRenderedChars" value="${escapeHtml2(String(state.settings.messageDisplay.maxRenderedChars))}">
            </label>
          </div>
          <div class="ltracker-presets-subsection" style="margin-top: 15px; margin-bottom: 10px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold; display: block; margin-bottom: 8px;">Display Surface Preview / Testing</span>
            <div class="ltracker-actions">
              <button class="ltracker-button" type="button" data-action="preview-display-surface" data-surface="contained">Preview Contained</button>
              <button class="ltracker-button" type="button" data-action="preview-display-surface" data-surface="wide">Preview Wide</button>
              <button class="ltracker-button" type="button" data-action="preview-display-surface" data-surface="popover">Preview Popover</button>
              <button class="ltracker-button" type="button" data-action="preview-display-surface" data-surface="fullscreen">Preview Fullscreen</button>
            </div>
          </div>
          ${placementWarning}
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-history">
          <span class="ltracker-label">Message Tracker History</span>
          <div class="ltracker-settings" style="margin-bottom: 10px;">
            <label class="ltracker-field ltracker-field-wide">
              Search/filter
              <input type="search" data-history-filter="text" value="${escapeHtml2(historyFilterText)}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-history-filter="showDuplicates"${checked(historyShowDuplicates)}>
              Show duplicates
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-history-filter="currentMessageOnly"${checked(historyCurrentMessageOnly)}>
              Current message only
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-history-filter="selectedSwipeOnly"${checked(historySelectedSwipeOnly)}>
              Selected swipe only
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-history-filter="currentPresetOnly"${checked(historyCurrentPresetOnly)}>
              Current preset only
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-history-filter="errorsOnly"${checked(historyErrorsOnly)}>
              Errors only
            </label>
          </div>
          <div class="ltracker-actions" style="margin-bottom: 10px;">
            <button class="ltracker-button" type="button" data-action="refresh">Refresh History</button>
            <button class="ltracker-button" type="button" data-action="cleanup-duplicates" ${disabled(diagnostics.lastHistoryDuplicateCount <= 0)}>Clear Duplicate Index Entries</button>
            <button class="ltracker-button" type="button" data-action="run-storage-maintenance-scan">Scan History Index</button>
            <button class="ltracker-button" type="button" data-action="cleanup-missing-index">Cleanup Missing Index Entries</button>
            <button class="ltracker-button" type="button" data-action="copy-storage-report">Copy Storage Report</button>
          </div>
          <div class="ltracker-chip-row" style="margin-bottom: 10px;">
            <span class="ltracker-chip">Groups ${escapeHtml2(String(diagnostics.lastHistoryGroupedCount))}</span>
            <span class="ltracker-chip">Duplicates ${escapeHtml2(String(diagnostics.lastHistoryDuplicateCount))}</span>
          </div>
          ${messageHistoryHtml}
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-presets">
          <span class="ltracker-label">Presets</span>
          
          <div class="ltracker-presets-subsection" style="margin-bottom: 15px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold; display: block; margin-bottom: 8px;">Current Preset</span>
            <div class="ltracker-settings">
              <label class="ltracker-field">
                Selected preset
                <select data-preset-select>
                  ${presetOptions}
                </select>
              </label>
              <label class="ltracker-field">
                Preset name
                <input type="text" data-preset-field="name" value="${escapeHtml2(activePreset.name)}"${disabled(activePresetIsBuiltIn)}>
              </label>
              <label class="ltracker-field">
                Preset version
                <input type="text" data-preset-field="version" value="${escapeHtml2(activePreset.version)}"${disabled(activePresetIsBuiltIn)}>
              </label>
              <label class="ltracker-field">
                Origin
                <input type="text" value="${escapeHtml2(activePreset.origin)}" disabled>
              </label>
              <label class="ltracker-field ltracker-field-wide">
                Preset description
                <textarea data-preset-field="description"${disabled(activePresetIsBuiltIn)}>${escapeHtml2(activePreset.description)}</textarea>
              </label>
            </div>
          </div>

          ${importReviewHtml}

          <div class="ltracker-presets-subsection" style="margin-bottom: 15px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold; display: block; margin-bottom: 8px;">Preset Configuration</span>
            <div class="ltracker-settings">
              <label class="ltracker-field ltracker-field-wide">
                Schema Box 1 - JSON Schema
                <textarea data-preset-field="jsonSchema"${disabled(activePresetIsBuiltIn)}>${escapeHtml2(presetSchemaText)}</textarea>
              </label>
              <label class="ltracker-field ltracker-field-wide">
                Schema Box 2 - HTML Template (Sanitized preview/message display)
                <textarea data-preset-field="htmlTemplate"${disabled(activePresetIsBuiltIn)}>${escapeHtml2(activePreset.htmlTemplate ?? "")}</textarea>
              </label>
              <label class="ltracker-field ltracker-field-wide">
                Prompt Box - AI Instructions
                <textarea data-preset-field="promptInstructions"${disabled(activePresetIsBuiltIn)}>${escapeHtml2(activePreset.promptInstructions)}</textarea>
              </label>
              <label class="ltracker-field ltracker-field-wide">
                Notes
                <textarea data-preset-field="notes"${disabled(activePresetIsBuiltIn)}>${escapeHtml2(activePreset.notes ?? "")}</textarea>
              </label>
            </div>
          </div>

          <div class="ltracker-presets-subsection" style="margin-bottom: 15px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold; display: block; margin-bottom: 8px;">Validate & Preview</span>
            <div class="ltracker-actions">
              <button class="ltracker-button" type="button" data-action="validate-preset-report">
                Validate Preset (Full Report)
              </button>
              <button class="ltracker-button" type="button" data-action="render-template" ${disabled(!state.chatId)}>
                Render With Latest Snapshot
              </button>
              <button class="ltracker-button" type="button" data-action="generate-sample-snapshot">
                Render With Sample Snapshot
              </button>
            </div>
            ${validationReportHtml}
            ${sampleSnapshotHtml}
          </div>

          <div class="ltracker-presets-subsection" style="margin-bottom: 15px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold; display: block; margin-bottom: 8px;">Import & Export Preset Packs</span>
            <div style="font-size: 11px; color: #aaa; margin-bottom: 8px;">
              Manage presets as single <code>.ltracker.json</code> files containing schemas, templates, instructions, notes, and settings recommendations.
            </div>
            <div class="ltracker-actions" style="margin-bottom: 10px;">
              <button class="ltracker-button" type="button" data-action="import-file-pack">
                Import Preset Pack File (.ltracker.json)
              </button>
              <button class="ltracker-button" type="button" data-action="export-preset-pack">
                Export Selected Preset Pack
              </button>
              <button class="ltracker-button" type="button" data-action="export-preset-pack-settings">
                Export Preset Pack + Current Settings
              </button>
            </div>
            <div class="ltracker-actions" style="margin-bottom: 10px;">
              <button class="ltracker-button" type="button" data-action="copy-preset-pack-json">
                Copy Preset Pack JSON
              </button>
              <button class="ltracker-button" type="button" data-action="copy-legacy-preset-json">
                Copy Current Preset Legacy JSON
              </button>
            </div>
            <label class="ltracker-field ltracker-field-wide">
              Or paste Preset / Pack JSON below and click preview:
              <textarea data-preset-import placeholder="Paste JSON here..."></textarea>
            </label>
            <div class="ltracker-actions" style="margin-top: 5px;">
              <button class="ltracker-button" type="button" data-action="import-preset-pack-preview">
                Preview Pasted JSON
              </button>
            </div>
          </div>

          <div class="ltracker-presets-subsection">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: bold; display: block; margin-bottom: 8px;">Preset Storage Management</span>
            <div class="ltracker-actions">
              <button class="ltracker-button" type="button" data-action="save-preset-new">Save As New Preset</button>
              <button class="ltracker-button" type="button" data-action="duplicate-preset">Duplicate Preset</button>
              <button class="ltracker-button" type="button" data-action="update-preset" ${disabled(activePresetIsBuiltIn)}>Update Current Preset</button>
              <button class="ltracker-button" type="button" data-action="delete-preset" ${disabled(activePresetIsBuiltIn)}>Delete Preset</button>
              <button class="ltracker-button" type="button" data-action="reset-preset">Reset To Default Preset</button>
              <button class="ltracker-button" type="button" data-action="apply-preset-connection" ${disabled(!recommendedConnection)}>
                Apply Preset Recommended Tracker Settings
              </button>
            </div>
            ${presetHtmlWarning ? `<p class="ltracker-note">${escapeHtml2(presetHtmlWarning)}</p>` : ""}
            ${recommendedConnectionText ? `<p class="ltracker-note">${escapeHtml2(recommendedConnectionText)}</p>` : ""}
          </div>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-diagnostics">
          <span class="ltracker-label">Diagnostics</span>
          <div class="ltracker-actions" style="margin-bottom: 12px;">
            <button class="ltracker-button" type="button" data-action="copy-all-diagnostics">Copy All Diagnostics</button>
            <button class="ltracker-button" type="button" data-action="copy-last-error">Copy Last Error</button>
          </div>
          
          <details class="ltracker-details">
            <summary>Status & General</summary>
            <div class="ltracker-grid">
              ${renderRow("Extension version", state.version)}
              ${renderRow("Active chat id", state.chatId)}
              ${renderRow("Current status", state.status)}
              ${renderRow("Auto mode", autoStatus)}
              ${renderRow("Permission status", permissionText)}
              ${renderRow("Connection mode", diagnostics.connectionMode)}
              ${renderRow("Native toolbar supported", diagnostics.nativeToolbarSupported ? "yes" : "no")}
              ${renderRow("Native toolbar fallback", diagnostics.nativeToolbarFallbackReason)}
              ${renderRow("Message-local UI supported", diagnostics.messageLocalUiSupported ? "yes" : "no")}
              ${renderRow("Message-local fallback reason", diagnostics.messageLocalUiFallbackReason)}
              ${renderRow("Build target", diagnostics.buildInfo.buildTarget)}
              ${renderRow("Spindle types", diagnostics.buildInfo.spindleTypesVersion)}
              ${renderRow("Storage schema", diagnostics.buildInfo.storageSchemaVersion)}
              ${renderRow("Settings schema", diagnostics.buildInfo.settingsSchemaVersion)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Generation Jobs</summary>
            <div class="ltracker-grid">
              ${renderRow("Active tracker jobs", diagnostics.activeTrackerJobs.map((job) => `${job.messageId}/${job.swipeKey}`).join(", "))}
              ${renderRow("Active widget regenerations", diagnostics.activeWidgetRegenerationCount)}
              ${renderRow("Last job id", diagnostics.lastJobId)}
              ${renderRow("Last request id", diagnostics.lastRequestId)}
              ${renderRow("Last duration ms", diagnostics.lastGenerationDurationMs)}
              ${renderRow("Last generation source", diagnostics.lastGenerationSource)}
              ${renderRow("Last generation started", diagnostics.lastGenerationStartedAt)}
              ${renderRow("Last generation completed", diagnostics.lastGenerationCompletedAt)}
              ${renderRow("Last cancellation", diagnostics.lastCancellation ? `${diagnostics.lastCancellation.jobId}: ${diagnostics.lastCancellation.reason}` : null)}
              ${renderRow("Last widget regenerate message", diagnostics.lastWidgetRegenerateMessageId)}
              ${renderRow("Last widget regenerate started", diagnostics.lastWidgetRegenerateStartedAt)}
              ${renderRow("Last widget regenerate completed", diagnostics.lastWidgetRegenerateCompletedAt)}
              ${renderRow("Last widget regenerate duration", diagnostics.lastWidgetRegenerateDurationMs)}
              ${renderRow("Last widget regenerate cancelled", diagnostics.lastWidgetRegenerateCancelledAt)}
              ${renderRow("Last widget regenerate error", diagnostics.lastWidgetRegenerateError)}
              ${renderRow("Last job timeout at", diagnostics.lastJobTimeoutAt)}
              ${renderRow("Last job timeout job id", diagnostics.lastJobTimeoutJobId)}
              ${renderRow("Last job timeout message id", diagnostics.lastJobTimeoutMessageId)}
              ${renderRow("Last job timeout swipe key", diagnostics.lastJobTimeoutSwipeKey)}
              ${renderRow("Stale jobs evicted count", diagnostics.staleJobsEvictedCount)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Auto Timing</summary>
            <div class="ltracker-grid">
              ${renderRow("Last auto event", diagnostics.lastAutoEventAt)}
              ${renderRow("Last auto event type", diagnostics.lastAutoEventType)}
              ${renderRow("Last auto scheduled", diagnostics.lastAutoScheduledAt)}
              ${renderRow("Last auto triggered", diagnostics.lastAutoTriggeredAt)}
              ${renderRow("Last auto skipped", diagnostics.lastAutoSkippedReason)}
              ${renderRow("Last auto source message", diagnostics.lastAutoSourceMessageId)}
              ${renderRow("Last auto source index", diagnostics.lastAutoSourceMessageIndex)}
              ${renderRow("Last auto generation id", diagnostics.lastAutoGenerationId)}
              ${renderRow("Auto finalization state", diagnostics.lastAutoFinalizationState)}
              ${renderRow("Auto waiting message", diagnostics.lastAutoWaitingMessageId)}
              ${renderRow("Auto waiting swipe", diagnostics.lastAutoWaitingSwipeKey)}
              ${renderRow("Auto finalized at", diagnostics.lastAutoFinalizedAt)}
              ${renderRow("Auto stable check at", diagnostics.lastAutoStableCheckAt)}
              ${renderRow("Auto stable passed", diagnostics.lastAutoStableCheckPassed === null ? null : diagnostics.lastAutoStableCheckPassed ? "yes" : "no")}
              ${renderRow("Auto stable hash", diagnostics.lastAutoContentStableHash)}
              ${renderRow("Auto finalization skipped", diagnostics.lastAutoFinalizationSkippedReason)}
              ${renderRow("Pending auto finalizations", diagnostics.pendingAutoFinalizationCount)}
              ${renderRow("Swipe change cancelled pending", diagnostics.lastSwipeChangeCancelledPendingJob ? "yes" : "no")}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Memory</summary>
            <div class="ltracker-grid">
              ${renderRow("Last memory index count", diagnostics.lastMemoryIndexCount)}
              ${renderRow("Last memory candidate count", diagnostics.lastMemoryCandidateCount)}
              ${renderRow("Last memory loaded snapshot count", diagnostics.lastMemoryLoadedSnapshotCount)}
              ${renderRow("Last memory load duration ms", diagnostics.lastMemoryLoadDurationMs)}
              ${renderRow("Last memory load skipped count", diagnostics.lastMemoryLoadSkippedCount)}
              ${renderRow("Last memory entry count", diagnostics.lastMemoryEntryCount)}
              ${renderRow("Last memory chars", diagnostics.lastMemoryChars)}
              ${renderRow("Last memory truncated", diagnostics.lastMemoryTruncated ? "yes" : "no")}
              ${renderRow("Last memory sources", diagnostics.lastMemorySourceSummary)}
              ${renderRow("Last memory skipped", diagnostics.lastMemorySkippedReason)}
              ${renderRow("Last prompt included memory", diagnostics.lastPromptIncludedMemory ? "yes" : "no")}
              ${renderRow("Estimated memory tokens", diagnostics.estimatedMemoryTokensLastRun)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Prompt Injection</summary>
            <div class="ltracker-grid">
              ${renderRow("Injection enabled", diagnostics.injectionEnabled ? "yes" : "no")}
              ${renderRow("Context handler registered", diagnostics.contextHandlerRegistered ? "yes" : "no")}
              ${renderRow("Context handler disabled reason", diagnostics.contextHandlerDisabledReason)}
              ${renderRow("Last context handler error", diagnostics.lastContextHandlerError)}
              ${renderRow("Last injection at", diagnostics.lastInjectionAt)}
              ${renderRow("Last injection mode", diagnostics.lastInjectionMode)}
              ${renderRow("Last injection format", diagnostics.lastInjectionFormat)}
              ${renderRow("Last injected chars", diagnostics.lastInjectedChars)}
              ${renderRow("Last injection skipped", diagnostics.lastInjectionSkippedReason)}
              ${renderRow("Last injection snapshot", diagnostics.lastInjectionSnapshotCreatedAt)}
              ${renderRow("Last injection source message", diagnostics.lastInjectionSourceMessageId)}
              ${renderRow("Interceptor registered", diagnostics.interceptorRegistered ? "yes" : "no")}
              ${renderRow("Last interceptor at", diagnostics.lastInterceptorAt)}
              ${renderRow("Last interceptor injected count", diagnostics.lastInterceptorInjectedCount)}
              ${renderRow("Last interceptor injected chars", diagnostics.lastInterceptorInjectedChars)}
              ${renderRow("Last interceptor stripped count", diagnostics.lastInterceptorStrippedCount)}
              ${renderRow("Last interceptor skipped", diagnostics.lastInterceptorSkippedReason)}
              ${renderRow("Last interceptor error", diagnostics.lastInterceptorError)}
              ${renderRow("Prompt trackers before", diagnostics.lastInterceptorPromptTrackerCountBefore)}
              ${renderRow("Prompt trackers after", diagnostics.lastInterceptorPromptTrackerCountAfter)}
              ${renderRow("Estimated prompt tokens", diagnostics.estimatedPromptTokensLastRun)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Display / DOM</summary>
            <div class="ltracker-grid">
              ${renderRow("Message display enabled", diagnostics.messageDisplayEnabled ? "yes" : "no")}
              ${renderRow("Message display mode", diagnostics.messageDisplayMode)}
              ${renderRow("Message display renderer", diagnostics.messageDisplayRenderer)}
              ${renderRow("Message display placement", diagnostics.messageDisplayPlacement)}
              ${renderRow("Message display hydrated count", diagnostics.messageDisplayHydratedCount)}
              ${renderRow("Last message display hydration", diagnostics.lastMessageDisplayHydratedAt)}
              ${renderRow("Last message display error", diagnostics.lastMessageDisplayError)}
              ${renderRow("Selected display surface", diagnostics.selectedDisplaySurface)}
              ${renderRow("Resolved display surface", diagnostics.resolvedDisplaySurface)}
              ${renderRow("Display surface kind", diagnostics.displaySurfaceKind)}
              ${renderRow("Display surface mount", diagnostics.displaySurfaceMountStrategy)}
              ${renderRow("Display surface constrained", diagnostics.displaySurfaceParentWidthConstrained === null ? null : diagnostics.displaySurfaceParentWidthConstrained ? "yes" : "no")}
              ${renderRow("Display surface fallback", diagnostics.displaySurfaceFallbackReason)}
              ${renderRow("Last surface rehydration", diagnostics.lastDisplaySurfaceRehydratedAt)}
              ${renderRow("Last display preview action", diagnostics.lastDisplayPreviewAction)}
              ${renderRow("Last display preview result", diagnostics.lastDisplayPreviewResult)}
              ${renderRow("Last display preview reason", diagnostics.lastDisplayPreviewReason)}
              ${renderRow("Last message control render", diagnostics.lastMessageControlRenderAt)}
              ${renderRow("Last message control message", diagnostics.lastMessageControlMessageId)}
              ${renderRow("Last message control swipe", diagnostics.lastMessageControlSwipeKey)}
              ${renderRow("Last message control state", diagnostics.lastMessageControlState)}
              ${renderRow("Last generate button message", diagnostics.lastGenerateButtonMessageId)}
              ${renderRow("Last generate button click", diagnostics.lastGenerateButtonClickedAt)}
              ${renderRow("Last inline action", diagnostics.lastInlineActionClicked)}
              ${renderRow("Last inline action at", diagnostics.lastInlineActionAt)}
              ${renderRow("Last inline action error", diagnostics.lastInlineActionError)}
              ${renderRow("Message widget placement resolved", diagnostics.messageWidgetPlacementResolved)}
              ${renderRow("Message widget placement reason", diagnostics.messageWidgetPlacementReason)}
              ${renderRow("Expanded width mode", diagnostics.expandedWidthModeResolved)}
              ${renderRow("Expanded width px", diagnostics.lastExpandedTrackerWidthPx)}
              ${renderRow("Iframe fallback visible in main UI", diagnostics.iframeFallbackVisibleInMainUi ? "yes" : "no")}
              ${renderRow("Latest attached message", diagnostics.latestAttachedMessageId)}
              ${renderRow("Latest attached index", diagnostics.latestAttachedMessageIndex)}
              ${renderRow("Latest attached at", diagnostics.latestAttachedSnapshotAt)}
              ${renderRow("Latest attached storage key", diagnostics.latestAttachedSnapshotStorageKey)}
              ${renderRow("Last DOM injection", diagnostics.lastDomInjectionAt)}
              ${renderRow("Last DOM injection error", diagnostics.lastDomInjectionError)}
              ${renderRow("Last uninject", diagnostics.lastUninjectAt)}
              ${renderRow("Last embedded tag write", diagnostics.lastEmbeddedTagWriteAt)}
              ${renderRow("Last embedded tag message", diagnostics.lastEmbeddedTagWriteMessageId)}
              ${renderRow("Last embedded tag swipe", diagnostics.lastEmbeddedTagWriteSwipeKey)}
              ${renderRow("Last embedded tag error", diagnostics.lastEmbeddedTagError)}
              ${renderRow("Last tag intercept", diagnostics.lastTagInterceptAt)}
              ${renderRow("Last tag intercept message", diagnostics.lastTagInterceptMessageId)}
              ${renderRow("Last tag intercept swipe", diagnostics.lastTagInterceptSwipeKey)}
              ${renderRow("Last tag intercept error", diagnostics.lastTagInterceptError)}
              ${renderRow("Last display surface", diagnostics.lastDisplaySurface)}
              ${renderRow("Last popover opened at", diagnostics.lastPopoverOpenedAt)}
              ${renderRow("Last popover message", diagnostics.lastPopoverMessageId)}
              ${renderRow("Last popover swipe", diagnostics.lastPopoverSwipeKey)}
              ${renderRow("Last popover width px", diagnostics.lastPopoverWidthPx)}
              ${renderRow("Last popover height px", diagnostics.lastPopoverHeightPx)}
              ${renderRow("Last reader opened at", diagnostics.lastReaderOpenedAt)}
              ${renderRow("Last reader message", diagnostics.lastReaderMessageId)}
              ${renderRow("Last reader swipe", diagnostics.lastReaderSwipeKey)}
              ${renderRow("Last resolved viewport width", diagnostics.lastResolvedViewportWidth)}
              ${renderRow("Last resolved viewport height", diagnostics.lastResolvedViewportHeight)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Storage & History</summary>
            <div class="ltracker-grid">
              ${renderRow("Message snapshot index count", diagnostics.messageSnapshotIndexCount)}
              ${renderRow("Swipe tracker index count", diagnostics.swipeTrackerIndexCount)}
              ${renderRow("History grouped count", diagnostics.lastHistoryGroupedCount)}
              ${renderRow("History duplicate count", diagnostics.lastHistoryDuplicateCount)}
              ${renderRow("History orphan count", diagnostics.lastHistoryOrphanCount)}
              ${renderRow("History cleanup at", diagnostics.lastHistoryCleanupAt)}
              ${renderRow("Storage key", diagnostics.storageKey)}
              ${renderRow("Messages read", diagnostics.lastMessagesRead)}
              ${renderRow("Source message range", diagnostics.lastSourceMessageRange)}
              ${renderRow("Source message ids", diagnostics.lastSourceMessageIds.join(", "))}
              ${renderRow("Last deleted tracker message", diagnostics.lastDeletedTrackerMessageId)}
              ${renderRow("Last deleted tracker swipe", diagnostics.lastDeletedTrackerSwipeKey)}
              ${renderRow("Last edited tracker message", diagnostics.lastEditedTrackerMessageId)}
              ${renderRow("Last edited tracker swipe", diagnostics.lastEditedTrackerSwipeKey)}
              ${renderRow("Last swipe detected message", diagnostics.lastSwipeDetectedMessageId)}
              ${renderRow("Last swipe key", diagnostics.lastSwipeKey)}
              ${renderRow("Last swipe key source", diagnostics.lastSwipeKeySource)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Connections</summary>
            <div class="ltracker-grid">
              ${renderRow("Selected connection id", diagnostics.selectedConnectionId)}
              ${renderRow("Selected connection name", diagnostics.selectedConnectionName)}
              ${renderRow("Selected connection available", diagnostics.selectedConnectionAvailable ? "yes" : "no")}
              ${renderRow("Connection list count", diagnostics.connectionListCount)}
              ${renderRow("Last connection refresh", diagnostics.lastConnectionRefreshAt)}
              ${renderRow("Last connection refresh error", diagnostics.lastConnectionRefreshError)}
              ${renderRow("Last generation connection mode", diagnostics.lastGenerationConnectionModeUsed)}
              ${renderRow("Last generation connection id", diagnostics.lastGenerationConnectionIdUsed)}
              ${renderRow("Last generation connection name", diagnostics.lastGenerationConnectionNameUsed)}
              ${renderRow("Last generation connection fallback", diagnostics.lastGenerationConnectionFallbackReason)}
              ${renderRow("Last generation parameters", compactRecord(diagnostics.lastGenerationParametersUsed))}
              ${renderRow("Last reasoning override", compactRecord(diagnostics.lastReasoningOverrideUsed))}
              ${renderRow("Last connection test at", diagnostics.lastConnectionTestAt)}
              ${renderRow("Last connection test status", diagnostics.lastConnectionTestStatus)}
              ${renderRow("Last connection test duration", diagnostics.lastConnectionTestDurationMs)}
              ${renderRow("Last connection test error", diagnostics.lastConnectionTestError)}
              ${renderRow("Last connection test finish", diagnostics.lastConnectionTestFinishReason)}
              ${renderRow("Last connection test usage", compactRecord(diagnostics.lastConnectionTestUsage))}
              ${renderRow("Connection profile selected", diagnostics.connectionProfileSelected ? "yes" : "no")}
              ${renderRow("Effective connection mode", diagnostics.effectiveTrackerConnectionMode)}
              ${renderRow("Effective connection reason", diagnostics.effectiveTrackerConnectionReason)}
              ${renderRow("Last connection fallback reason", diagnostics.lastSelectedConnectionFallbackReason)}
              ${renderRow("Last profile missing at", diagnostics.lastTrackerProfileMissingAt)}
            </div>
          </details>

          <details class="ltracker-details">
            <summary>Renderer & Presets</summary>
            <div class="ltracker-grid">
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
              ${renderRow("Template trust mode", diagnostics.templateTrustMode)}
              ${renderRow("Ultra mode", diagnostics.ultraModeEnabled ? "yes" : "no")}
              ${renderRow("Last preset estimated tokens", diagnostics.lastPresetEstimatedTokens)}
              ${renderRow("Last preset estimated chars", diagnostics.lastPresetEstimatedRenderedChars)}
            </div>
          </details>
          <details class="ltracker-details">
            <summary>Last raw model output</summary>
            <pre class="ltracker-text">${escapeHtml2(rawOutput ?? "None")}</pre>
          </details>
          <details class="ltracker-details">
            <summary>Last prompt preview</summary>
            <pre class="ltracker-text">${escapeHtml2(prompt ?? "None")}</pre>
          </details>
          <div class="ltracker-details">
            <span class="ltracker-label">Last parsed tracker JSON</span>
            <pre class="ltracker-json">${escapeHtml2(renderJson(parsedTracker, "None"))}</pre>
          </div>
          <div class="ltracker-details">
            <span class="ltracker-label">Last parse/generation/storage error</span>
            <pre class="ltracker-text ltracker-error">${escapeHtml2(renderError(error))}</pre>
          </div>
        </section>

        <section class="ltracker-panel ltracker-section" id="ltracker-section-advanced">
          <span class="ltracker-label">Advanced</span>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="fallbackToIframeWidget"${checked(state.settings.messageDisplay.fallbackToIframeWidget)}>
              Iframe fallback / legacy backup
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-renderer-setting="allowInlineStyles"${checked(state.settings.renderer.allowInlineStyles)} disabled>
              Trusted inline styles active
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="showDebugSwipeKey"${checked(state.settings.messageDisplay.showDebugSwipeKey)}>
              Debug swipe key
            </label>
            <label class="ltracker-field">
              Dev Mode Templates
              <input type="text" value="Future" disabled>
            </label>
          </div>
          <div class="ltracker-grid ltracker-details">
            ${renderRow("Context handler", diagnostics.contextHandlerDisabledReason)}
            ${renderRow("Message widget fallback", diagnostics.messageWidgetPlacementReason)}
            ${renderRow("DOM injection error", diagnostics.lastDomInjectionError)}
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
          <pre class="ltracker-json">${escapeHtml2(latestMessageSnapshotText)}</pre>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Latest tracker snapshot</span>
          <pre class="ltracker-json">${escapeHtml2(snapshotText)}</pre>
        </section>
      </section>
    `;
    hydrateMessageWidgets();
  }
  const onClick = (event) => {
    const sectionTarget = event.target instanceof HTMLElement ? event.target.closest("[data-drawer-section]") : null;
    if (sectionTarget?.dataset.drawerSection) {
      localDiagnostics({ drawerActiveSection: sectionTarget.dataset.drawerSection });
    }
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
    const action = target?.dataset.action;
    const historyEntry = findHistoryEntry(target?.dataset.messageId, target?.dataset.swipeKey ?? null);
    if (action === "generate") generateTracker();
    if (action === "refresh") requestState();
    if (action === "cleanup-duplicates") {
      send({
        type: "cleanup_duplicate_history",
        chatId: activeChatId(),
        requestId: requestId("history-cleanup")
      });
    }
    if (action === "refresh-connections") refreshConnections();
    if (action === "test-connection") testTrackerConnection();
    if (action === "cancel-connection-test") cancelConnectionTest();
    if (action === "reset-connection-parameters") resetConnectionParameters();
    if (action === "apply-preset-connection") applyPresetRecommendedConnection();
    if (action === "clear-snapshot") clearSnapshot();
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
    if (action === "copy-memory-preview") void copyText(state.memoryPreview, "tracker memory block");
    if (action === "copy-injection-preview") void copyText(state.injectionPreview, "injection preview");
    if (action === "copy-storage-report") {
      const report = [
        `Storage key: ${state.diagnostics.storageKey}`,
        `Message snapshot index count: ${state.diagnostics.messageSnapshotIndexCount}`,
        `Swipe tracker index count: ${state.diagnostics.swipeTrackerIndexCount}`,
        `History grouped count: ${state.diagnostics.lastHistoryGroupedCount}`,
        `History duplicate count: ${state.diagnostics.lastHistoryDuplicateCount}`,
        `History orphan count: ${state.diagnostics.lastHistoryOrphanCount}`,
        `History cleanup at: ${state.diagnostics.lastHistoryCleanupAt}`
      ].join("\n");
      void copyText(report, "storage report");
    }
    if (action === "render-template") renderTemplatePreview();
    if (action === "copy-render-html") void copyText(state.renderPreview?.html ?? null, "sanitized HTML");
    if (action === "copy-render-fallback") void copyText(state.renderPreview?.textFallback ?? null, "text fallback");
    if (action === "copy-render-errors") {
      const renderLog = state.renderPreview ? [
        ...state.renderPreview.errors.map((item) => `error: ${item}`),
        ...state.renderPreview.warnings.map((item) => `warning: ${item}`)
      ].join("\n") : null;
      void copyText(renderLog, "render errors");
    }
    if (action === "copy-history-json") void copyText(historyEntry?.rendered.json ?? null, "message tracker JSON");
    if (action === "copy-history-html") void copyText(historyEntry?.rendered.html ?? null, "message tracker HTML");
    if (action === "copy-history-text") void copyText(historyEntry?.rendered.textFallback ?? null, "message tracker text");
    if (action === "regenerate-history" && historyEntry) {
      toggleMessageRegeneration(historyEntry.indexEntry.messageId, historyEntry.indexEntry.swipeKey, historyEntry.rendered.activeJobId);
    }
    if (action === "edit-history" && historyEntry) {
      openTrackerEditor(historyEntry);
    }
    if (action === "delete-history" && historyEntry) {
      void deleteMessageTracker(historyEntry.indexEntry.messageId, historyEntry.indexEntry.swipeKey);
    }
    if (action === "save-preset-new") savePresetAsNew();
    if (action === "duplicate-preset") duplicatePreset();
    if (action === "update-preset") updatePreset();
    if (action === "delete-preset") deletePreset();
    if (action === "reset-preset") resetPreset();
    if (action === "import-preset") importPreset();
    if (action === "validate-preset") validatePreset();
    if (action === "validate-preset-report") validatePresetReportFrontend();
    if (action === "generate-sample-snapshot") generateSampleSnapshotFrontend();
    if (action === "export-preset") {
      void copyText(JSON.stringify(exportTrackerPreset(state.activePreset), null, 2), "selected preset export");
    }
    if (action === "export-preset-pack") exportPresetPackFrontend(false);
    if (action === "export-preset-pack-settings") exportPresetPackFrontend(true);
    if (action === "copy-preset-pack-json") {
      const exportOpts = {
        includeRecommendedSettings: true,
        settings: state.settings
      };
      if (state.snapshot?.data) {
        exportOpts.exampleSnapshot = state.snapshot.data;
      }
      const pack = exportPresetPack(state.activePreset, exportOpts);
      void copyText(JSON.stringify(pack, null, 2), "preset pack JSON");
    }
    if (action === "copy-legacy-preset-json") {
      void copyText(JSON.stringify(exportTrackerPreset(state.activePreset), null, 2), "legacy preset JSON");
    }
    if (action === "import-file-pack") triggerFileImport();
    if (action === "import-preset-pack-preview") {
      const input = tab.root.querySelector("[data-preset-import]");
      const text = input?.value.trim() ?? "";
      if (!text) {
        setLocalError("Paste preset pack JSON before previewing.");
      } else {
        stageImportText(text);
      }
    }
    if (action === "import-preset-pack") executeImportPresetPack();
    if (action === "cancel-import") {
      stagedImportPack = null;
      stagedImportRawText = "";
      render();
    }
    if (action === "copy-sample-snapshot") {
      void copyText(stagedSampleSnapshot ? JSON.stringify(stagedSampleSnapshot, null, 2) : null, "sample snapshot JSON");
    }
    if (action === "undo-delete" && recentlyDeletedBanner) {
      send({
        type: "restore_deleted_tracker",
        chatId: activeChatId(),
        messageId: recentlyDeletedBanner.messageId,
        swipeKey: recentlyDeletedBanner.swipeKey,
        requestId: requestId("tracker-restore")
      });
      clearTimeout(recentlyDeletedBanner.timer);
      recentlyDeletedBanner = null;
      render();
    }
    if (action === "load-more-history") {
      currentHistoryLimit += 25;
      send({
        type: "refresh_state",
        chatId: activeChatId()
      });
    }
    if (action === "run-storage-maintenance-scan") {
      send({
        type: "run_storage_maintenance_scan",
        chatId: activeChatId(),
        requestId: requestId("storage-scan")
      });
    }
    if (action === "cleanup-missing-index") {
      send({
        type: "cleanup_missing_index_entries",
        chatId: activeChatId(),
        requestId: requestId("storage-clean")
      });
    }
    if (action === "copy-all-diagnostics") {
      const flatDiags = Object.entries(state.diagnostics).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n");
      void copyText(flatDiags, "all diagnostics");
    }
    if (action === "copy-last-error") {
      const err = state.diagnostics.lastError;
      const errText = err ? `Stage: ${err.stage}
Message: ${err.message}${err.detail ? `
Detail: ${err.detail}` : ""}` : "No error recorded.";
      void copyText(errText, "last error");
    }
    if (action === "preview-display-surface") {
      const surface = target.dataset.surface;
      const entry = latestPreviewEntry();
      if (entry) {
        if (surface === "contained") {
          openDisplayPreview(entry, "inline_contained");
        } else if (surface === "wide") {
          openDisplayPreview(entry, "inline_wide");
        } else if (surface === "popover") {
          openPopover(entry, target, true);
        } else if (surface === "fullscreen") {
          openFullscreenReader(entry, true);
        }
      } else {
        localDiagnostics({
          lastDisplayPreviewAction: surface ?? "unknown",
          lastDisplayPreviewResult: "unavailable",
          lastDisplayPreviewReason: "No tracker snapshot available to preview. Generate a tracker first."
        });
        setLocalError("No tracker snapshot available to preview. Generate a tracker first.");
      }
    }
  };
  tab.root.addEventListener("click", onClick);
  cleanups.push(() => tab.root.removeEventListener("click", onClick));
  const updateHistoryFilter = (input) => {
    const filter = input.dataset.historyFilter;
    if (!filter) return false;
    if (filter === "text") historyFilterText = input.value;
    if (filter === "showDuplicates") historyShowDuplicates = input.checked;
    if (filter === "currentMessageOnly") historyCurrentMessageOnly = input.checked;
    if (filter === "selectedSwipeOnly") historySelectedSwipeOnly = input.checked;
    if (filter === "currentPresetOnly") historyCurrentPresetOnly = input.checked;
    if (filter === "errorsOnly") historyErrorsOnly = input.checked;
    render();
    return true;
  };
  const onInput = (event) => {
    const historyInput = event.target instanceof HTMLElement ? event.target.closest("[data-history-filter]") : null;
    if (historyInput && updateHistoryFilter(historyInput)) return;
    if (isSettingsControl(event.target)) {
      scheduleSettingsAutosave();
      if (isDisplaySurfaceControl(event.target)) applyDisplaySettingsOptimistically(false);
    }
  };
  tab.root.addEventListener("input", onInput);
  cleanups.push(() => tab.root.removeEventListener("input", onInput));
  const onChange = (event) => {
    const historyInput = event.target instanceof HTMLElement ? event.target.closest("[data-history-filter]") : null;
    if (historyInput && updateHistoryFilter(historyInput)) return;
    if (isSettingsControl(event.target)) {
      scheduleSettingsAutosave();
      if (isDisplaySurfaceControl(event.target)) applyDisplaySettingsOptimistically(true);
    }
    const target = event.target instanceof HTMLSelectElement ? event.target.closest("[data-preset-select]") : null;
    if (target) selectPreset(target.value);
    const installModeSelect = event.target instanceof HTMLSelectElement ? event.target.closest("[data-import-review-install-mode]") : null;
    if (installModeSelect) {
      const overwriteContainer = tab.root.querySelector("[data-import-review-overwrite-container]");
      if (overwriteContainer) {
        overwriteContainer.style.display = installModeSelect.value === "overwrite" ? "block" : "none";
      }
    }
  };
  tab.root.addEventListener("change", onChange);
  cleanups.push(() => tab.root.removeEventListener("change", onChange));
  cleanups.push(ctx.messages.registerTagInterceptor({
    tagName: LTRACKER_TAG_NAME,
    attrs: { type: LTRACKER_TAG_TYPE },
    removeFromMessage: true
  }, handleEmbeddedTrackerTag));
  cleanups.push(tab.onActivate(activateDrawer));
  cleanups.push(inputAction.onClick(generateTracker));
  cleanups.push(ctx.onBackendMessage((payload) => {
    if (!isBackendMessage(payload)) return;
    const settingsResponse = typeof payload.requestId === "string" && (payload.requestId.startsWith("settings:") || payload.requestId.startsWith("settings-auto:") || payload.requestId.startsWith("settings-reset:"));
    if (payload.type === "state") {
      if (payload.state.chatId !== state.chatId) embeddedTagEntries.clear();
      syncOptimisticJobsFromState(payload.state);
      state = payload.state;
      if (settingsResponse) settingsSaveStatus = "saved";
      render();
    }
    if (payload.type === "error") {
      if (payload.state) syncOptimisticJobsFromState(payload.state);
      state = payload.state ?? {
        ...state,
        status: "error",
        error: emptyError(payload.message)
      };
      if (settingsResponse) settingsSaveStatus = "failed";
      render();
    }
    if (payload.type === "preset_pack_export_ready") {
      let methodUsed = "file download";
      try {
        const blob = new Blob([payload.json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = payload.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        methodUsed = "copy fallback";
        void copyText(payload.json, "preset pack JSON");
      }
      console.log(`LTracker export method used: ${methodUsed}`);
    }
    if (payload.type === "preset_pack_validation_report") {
      stagedValidationReport = payload.report;
      render();
    }
    if (payload.type === "sample_snapshot_ready") {
      stagedSampleSnapshot = payload.snapshot;
      stagedSampleRenderResult = payload.renderResult;
      render();
    }
  }));
  cleanups.push(() => clearSettingsAutosaveTimer());
  cleanups.push(() => cleanupMessageWidgets());
  cleanups.push(() => cleanupDomInjections());
  cleanups.push(() => closeDisplayPreview());
  cleanups.push(() => closePopover());
  cleanups.push(() => closeFullscreenReader());
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
