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
    max_tokens: 2e3,
    reasoning: {
      source: "inherit",
      effort: "auto"
    },
    notes: "Start with active quiet mode, low temperature, and inherited reasoning. Use a selected raw tracker profile after confirming it returns strict JSON."
  }
};
function exportTrackerPreset(preset) {
  return {
    kind: PRESET_EXPORT_KIND,
    formatVersion: PRESET_EXPORT_FORMAT_VERSION,
    preset
  };
}

// src/shared/htmlTemplateRenderer.ts
var TEMPLATE_PATH = "[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*";
var EACH_BLOCK_PATTERN = new RegExp(`{{#each\\s+(${TEMPLATE_PATH})\\s*}}([\\s\\S]*?){{/each}}`, "g");
var JSON_HELPER_PATTERN = new RegExp(`{{\\s*json\\s+(${TEMPLATE_PATH})\\s*}}`, "g");
var VALUE_PATTERN = new RegExp(`{{\\s*(${TEMPLATE_PATH})\\s*}}`, "g");
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
var VOID_TAGS = /* @__PURE__ */ new Set(["br", "hr"]);
var ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set(["class", "title", "aria-label", "data-ltracker-section"]);
var DANGEROUS_TAGS = [
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
  "svg",
  "math"
];
var SAFE_STYLE_PROPERTIES = /* @__PURE__ */ new Set([
  "color",
  "background",
  "background-color",
  "border",
  "border-top",
  "border-bottom",
  "border-left",
  "border-right",
  "border-color",
  "border-radius",
  "box-shadow",
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
  "flex-direction",
  "align-items",
  "justify-content",
  "width",
  "max-width",
  "min-width",
  "height",
  "max-height",
  "min-height",
  "overflow",
  "overflow-wrap",
  "word-break",
  "white-space",
  "opacity"
]);
function isRecord(value) {
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
  let current = source;
  for (const segment of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
    } else if (isRecord(current)) {
      current = current[segment];
    } else {
      return void 0;
    }
  }
  return current;
}
function valueToText(value, placeholder) {
  if (value === void 0 || value === null) return placeholder;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value, null, 2) ?? placeholder;
}
function renderTemplateFragment(template, root, current, placeholder) {
  const withJson = template.replace(JSON_HELPER_PATTERN, (_match, path) => {
    const value = valueAtPath(current, path) ?? valueAtPath(root, path);
    const text = value === void 0 ? placeholder : JSON.stringify(value, null, 2) ?? placeholder;
    return escapeHtml(text);
  });
  return withJson.replace(VALUE_PATTERN, (_match, path) => {
    const value = valueAtPath(current, path) ?? valueAtPath(root, path);
    return escapeHtml(valueToText(value, placeholder));
  });
}
function renderTemplate(template, snapshotData, placeholder) {
  const expandedLoops = template.replace(EACH_BLOCK_PATTERN, (_match, path, body) => {
    const value = valueAtPath(snapshotData, path);
    if (!Array.isArray(value)) return "";
    return value.map((item) => renderTemplateFragment(body, snapshotData, item, placeholder)).join("");
  });
  return renderTemplateFragment(expandedLoops, snapshotData, snapshotData, placeholder);
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
function stripDangerousContainers(html, warnings) {
  let result = html;
  for (const tag of DANGEROUS_TAGS) {
    const paired = new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*/\\s*${tag}\\s*>`, "gi");
    result = result.replace(paired, () => {
      warnings.push(`Removed unsafe <${tag}> element.`);
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
    const name = (match[1] ?? "").toLowerCase();
    if (!name) continue;
    result.push({ name, value: match[2] ?? match[3] ?? match[4] ?? "" });
  }
  return result;
}
function sanitizeStyle(value, warnings) {
  const declarations = [];
  for (const part of value.split(";")) {
    const separator = part.indexOf(":");
    if (separator <= 0) continue;
    const property = part.slice(0, separator).trim().toLowerCase();
    const rawValue = part.slice(separator + 1).trim();
    const lowerValue = rawValue.toLowerCase();
    if (!SAFE_STYLE_PROPERTIES.has(property)) {
      warnings.push(`Removed unsupported style property ${property}.`);
      continue;
    }
    if (lowerValue.includes("url(") || lowerValue.includes("expression") || lowerValue.includes("@import") || lowerValue.includes("javascript:") || lowerValue.includes("behavior:") || lowerValue.includes("-moz-binding") || /[<>{}]/.test(rawValue)) {
      warnings.push(`Removed unsafe style value for ${property}.`);
      continue;
    }
    if (!/^[\w\s#.,%()+\-/*:'"]+$/.test(rawValue)) {
      warnings.push(`Removed unsupported style value for ${property}.`);
      continue;
    }
    declarations.push(`${property}: ${rawValue}`);
  }
  return declarations.length > 0 ? declarations.join("; ") : null;
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
function sanitizeAttributes(raw, tag, allowInlineStyles, warnings) {
  const attributes = [];
  for (const attribute of attributePairs(raw)) {
    if (attribute.name.startsWith("on")) {
      warnings.push(`Removed event attribute ${attribute.name}.`);
      continue;
    }
    if (attribute.name === "href" || attribute.name === "src" || attribute.name === "srcdoc") {
      warnings.push(`Removed URL-bearing attribute ${attribute.name}.`);
      continue;
    }
    if (attribute.name === "style") {
      if (!allowInlineStyles) {
        warnings.push("Removed inline style attribute.");
        continue;
      }
      const style = sanitizeStyle(attribute.value, warnings);
      if (style) attributes.push(`style="${escapeHtml(style)}"`);
      continue;
    }
    if (attribute.name === "open") {
      if (tag === "details") {
        attributes.push("open");
      } else {
        warnings.push("Removed unsupported attribute open.");
      }
      continue;
    }
    if (!ALLOWED_ATTRIBUTES.has(attribute.name)) {
      warnings.push(`Removed unsupported attribute ${attribute.name}.`);
      continue;
    }
    attributes.push(`${attribute.name}="${escapeHtml(attribute.value)}"`);
  }
  return attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
}
function sanitizeHtml(html, options = {}) {
  const warnings = [];
  const withoutDangerousContainers = stripDangerousContainers(html, warnings);
  const sanitized = withoutDangerousContainers.replace(
    /<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)([^>]*)>/g,
    (_match, closing, rawTag, rawAttributes) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        warnings.push(`Removed unsupported <${tag}> tag.`);
        return "";
      }
      if (closing) return `</${tag}>`;
      if (VOID_TAGS.has(tag)) return `<${tag}>`;
      return `<${tag}${sanitizeAttributes(rawAttributes, tag, options.allowInlineStyles === true, warnings)}>`;
    }
  );
  return {
    html: sanitized,
    warnings: options.deduplicateWarnings === true ? summarizeWarnings(warnings, options.maxWarnings) : warnings
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
    const sanitizeOptions = {
      allowInlineStyles: options.allowInlineStyles === true,
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

// src/shared/snapshotFormat.ts
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isMessageAttachedSnapshot(value) {
  return "snapshot" in value && isRecord2(value.snapshot);
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
    if (isRecord2(value)) return `${key}: ${recordSummary2(value) ?? "set"}`;
    const list = listFromUnknown2(value);
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
  const raw = settings.format === "pretty_json" ? formatPrettyJson(source, snapshot, sourceMessageId, settings) : settings.format === "minimal" ? formatMinimal(snapshot, sourceMessageId, settings) : formatCompact(snapshot, sourceMessageId, settings);
  return truncateSafe2(sanitizePromptText(raw), settings.maxInjectedChars);
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

// src/shared/messageDisplay.ts
var MESSAGE_WIDGET_ID = "ltracker-message-tracker";
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
function injectionSettings(settings) {
  return {
    enabled: true,
    mode: "latest_message_snapshot",
    format: "compact",
    maxInjectedChars: settings.maxRenderedChars,
    includeHeader: false,
    includeTimestamp: false,
    includeSourceMessageId: false,
    onlyInjectWhenSnapshotExists: true
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
  const expandedActions = settings.showExpandedHeaderActions || !rendered.controlState.hasTracker;
  const bodyMarkup = rendered.controlState.hasTracker ? `<div class="ltd-body">${body}</div>` : "";
  const footerActions = settings.showBottomActionsInInlineTracker && rendered.controlState.hasTracker ? `<div class="ltd-footer-actions" style="display: flex; gap: 4px; justify-content: flex-end; border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent); padding: 5px 7px;">
        ${domButton("toggle_regenerate", actionLabel, actionKind, settings.showWidgetRegenerateButton, rendered.isRegenerating ? " ltd-spinning" : "")}
        ${domButton("edit", "View or edit tracker", "edit", settings.showEditButton)}
        ${domButton("delete", "Delete tracker", "delete", settings.showDeleteButton)}
      </div>` : "";
  const titleIcon = rendered.isRegenerating ? `<span class="ltd-control-icon ltd-spinning">${iconSvg("refresh")}</span>` : rendered.controlState.error ? `<span class="ltd-control-icon ltd-warning">${iconSvg("warning")}</span>` : `<span class="ltd-control-icon">${rendered.controlState.hasTracker ? iconSvg("chevron") : iconSvg("generate")}</span>`;
  const title = rendered.controlState.hasTracker ? "L" : "";
  return `
<section class="ltracker-dom-tracker${compactClass}${densityClass}${placementClass}${hasTrackerClass}" data-ltracker-message-id="${escapeHtml(rendered.messageId)}" data-ltracker-swipe-key="${escapeHtml(rendered.swipeKey)}" data-ltracker-control-state="${escapeHtml(rendered.controlState.generationStatus)}">
  <style>
    .ltracker-dom-tracker { margin: 0 0 4px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 8px; background: color-mix(in srgb, currentColor 3%, transparent); color: inherit; font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 100%; }
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
    .ltd-body { border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent); padding: 7px; overflow-wrap: anywhere; max-height: min(56vh, 540px); overflow: auto; }
    .ltd-pre { white-space: pre-wrap; word-break: break-word; margin: 0; font: 12px/1.42 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .ltracker-dom-tracker details:not([open]) { min-height: 0; }
    .ltracker-dom-tracker details:not([open]) .ltd-body { display: none; }
    @keyframes ltd-spin { to { transform: rotate(360deg); } }
    @media (max-width: 520px) { .ltd-meta { display: none; } .ltd-summary { gap: 4px; } .ltd-icon-button { width: 28px; height: 28px; } .ltd-body { max-height: 48vh; } }
  </style>
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

// src/shared/types.ts
var EXTENSION_VERSION = "0.13";
var STORAGE_SCHEMA_VERSION = 1;
var SETTINGS_SCHEMA_VERSION = 1;
var SPINDLE_TYPES_VERSION = "0.5.21";

// src/shared/embeddedTrackerTag.ts
var LTRACKER_TAG_NAME = "ltracker";
var LTRACKER_TAG_TYPE = "state";

// src/shared/generationRequest.ts
var TRACKER_CONNECTION_DEFAULT_TEST_PROMPT = "Return a compact JSON object with ok true and a short status.";
var TRACKER_CONNECTION_PARAMETER_LIMITS = {
  temperature: { min: 0, max: 2, default: 0.2 },
  max_tokens: { min: 256, max: 32e3, default: 2e3 },
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
  maxMessageChars: { min: 500, max: 5e4, default: 8e3 },
  generationTimeoutMs: { min: 1e4, max: 18e4, default: 45e3 },
  autoDebounceMs: { min: 250, max: 3e4, default: 1500 },
  skipFirstMessages: { min: 0, max: 100, default: 2 },
  maxInjectedChars: { min: 500, max: 2e4, default: 3e3 },
  maxRenderedChars: { min: 1e3, max: 2e5, default: 5e4 },
  maxMessageDisplayRenderedChars: { min: 1e3, max: 2e5, default: 5e4 },
  minimizedMaxHeightPx: { min: 0, max: 400, default: 0 }
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
  },
  renderer: {
    enabled: true,
    previewSource: "latest_chat_snapshot",
    missingValuePlaceholder: "",
    maxRenderedChars: SETTINGS_LIMITS.maxRenderedChars.default,
    allowInlineStyles: false
  },
  messageDisplay: {
    enabled: true,
    useDomInjection: true,
    fallbackToIframeWidget: true,
    attachmentMode: "sidecar_snapshot",
    displayMode: "inline_full",
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
  connection: {
    mode: "active_quiet",
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
      contextHandler: false
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
      contextHandlerDisabledReason: "Context handler injection is disabled in 0.13 while the Lumiverse context handler return contract is being verified.",
      lastContextHandlerError: null,
      messageDisplayEnabled: false,
      messageDisplayMode: null,
      messageDisplayPlacement: null,
      messageDisplayHydratedCount: 0,
      lastMessageDisplayHydratedAt: null,
      lastMessageDisplayError: null,
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
      lastConnectionTestUsage: null
    },
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
function isRecord3(value) {
  return typeof value === "object" && value !== null;
}
function isBackendMessage(payload) {
  return isRecord3(payload) && typeof payload.type === "string";
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
  const elapsedTimer = setInterval(updateElapsedTimers, 250);
  cleanups.push(() => clearInterval(elapsedTimer));
  function activeChatId() {
    return ctx.getActiveChat().chatId;
  }
  function currentChatId() {
    return state.chatId ?? activeChatId();
  }
  function send(message) {
    if (!disposed) ctx.sendToBackend(message);
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
    return Boolean(target.closest("[data-setting], [data-renderer-setting], [data-message-display-setting], [data-connection-setting], [data-connection-parameter], [data-connection-reasoning]"));
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
  function allRenderableEntries() {
    const active = currentChatId();
    const entries = /* @__PURE__ */ new Map();
    for (const entry of state.messageSnapshotHistory) {
      if (active && entry.snapshot?.chatId && entry.snapshot.chatId !== active) continue;
      entries.set(trackerEntryKey(entry.indexEntry.messageId, entry.indexEntry.swipeKey), rerenderHistoryEntry(entry));
    }
    for (const [key, entry] of embeddedTagEntries) {
      if (active && entry.snapshot?.chatId && entry.snapshot.chatId !== active) continue;
      entries.set(key, rerenderHistoryEntry(entry));
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
    if (!isRecord3(payload) || payload.type !== "ltracker_widget_action" || payload.action !== "toggle_regenerate" && payload.action !== "generate" || payload.messageId !== expectedMessageId) return;
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
  function resolveTrackerMountPoint(messageElement) {
    const officialBody = queryMountPoint(
      messageElement,
      "[data-lumiverse-message-body], [data-message-body], [data-message-content], [data-chat-message-content]"
    );
    if (officialBody) {
      return { target: officialBody, strategy: "official_message_body" };
    }
    const scopedBubble = queryMountPoint(messageElement, ":scope > div[class*='bubble']");
    if (scopedBubble) {
      return { target: scopedBubble, strategy: "bubble_adapter" };
    }
    const nestedBubble = queryMountPoint(messageElement, "div[class*='bubble']");
    if (nestedBubble) {
      return { target: nestedBubble, strategy: "bubble_adapter" };
    }
    return { target: messageElement, strategy: "official_message_element" };
  }
  function positionForPlacement(placement) {
    return placement === "top" ? "afterbegin" : "beforeend";
  }
  function hydrateDomInjections() {
    if (!state.settings.messageDisplay.enabled || !state.settings.messageDisplay.useDomInjection || state.settings.messageDisplay.displayMode === "drawer_history_only") {
      cleanupDomInjections();
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
      const mount = resolveTrackerMountPoint(messageElement);
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
        state.settings.messageDisplay.displayMode,
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
          lastPlacementResolved: requestedPlacement,
          lastPlacementRenderResult: "rendered",
          lastPlacementError: null,
          lastMountPointStrategy: mount.strategy,
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
    if (!state.settings.messageDisplay.enabled || state.settings.messageDisplay.displayMode === "drawer_history_only" || !renderWidget || !state.settings.messageDisplay.fallbackToIframeWidget) {
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
    if (!isRecord3(parsed) || Array.isArray(parsed)) {
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
    const injectionNumberValue = (name) => {
      const input = tab.root.querySelector(`[data-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.injection[name];
    };
    const injectionBooleanValue = (name) => {
      const input = tab.root.querySelector(`[data-setting="${name}"]`);
      return input ? input.checked : state.settings.injection[name];
    };
    const rendererNumberValue = (name) => {
      const input = tab.root.querySelector(`[data-renderer-setting="${name}"]`);
      return input ? Number(input.value) : state.settings.renderer[name];
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
    const selectValue = (name, fallback) => {
      const input = tab.root.querySelector(`[data-setting="${name}"]`);
      return input ? input.value : fallback;
    };
    const rendererSelectValue = (name, fallback) => {
      const input = tab.root.querySelector(`[data-renderer-setting="${name}"]`);
      return input ? input.value : fallback;
    };
    const messageDisplaySelectValue = (name, fallback) => {
      const input = tab.root.querySelector(`[data-message-display-setting="${name}"]`);
      return input ? input.value : fallback;
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
      injection: {
        enabled: injectionBooleanValue("enabled"),
        mode: selectValue("mode", state.settings.injection.mode),
        format: selectValue("format", state.settings.injection.format),
        maxInjectedChars: injectionNumberValue("maxInjectedChars"),
        includeHeader: injectionBooleanValue("includeHeader"),
        includeTimestamp: injectionBooleanValue("includeTimestamp"),
        includeSourceMessageId: injectionBooleanValue("includeSourceMessageId"),
        onlyInjectWhenSnapshotExists: injectionBooleanValue("onlyInjectWhenSnapshotExists")
      },
      renderer: {
        enabled: rendererBooleanValue("enabled"),
        previewSource: rendererSelectValue("previewSource", state.settings.renderer.previewSource),
        missingValuePlaceholder: rendererTextValue("missingValuePlaceholder"),
        maxRenderedChars: rendererNumberValue("maxRenderedChars"),
        allowInlineStyles: rendererBooleanValue("allowInlineStyles")
      },
      messageDisplay: {
        enabled: messageDisplayBooleanValue("enabled"),
        useDomInjection: messageDisplayBooleanValue("useDomInjection"),
        fallbackToIframeWidget: messageDisplayBooleanValue("fallbackToIframeWidget"),
        attachmentMode: messageDisplaySelectValue("attachmentMode", state.settings.messageDisplay.attachmentMode),
        displayMode: messageDisplaySelectValue("displayMode", state.settings.messageDisplay.displayMode),
        placement: messageDisplaySelectValue("placement", state.settings.messageDisplay.placement),
        source: messageDisplaySelectValue("source", state.settings.messageDisplay.source),
        renderMode: messageDisplaySelectValue("renderMode", state.settings.messageDisplay.renderMode),
        allowInlineStyles: messageDisplayBooleanValue("allowInlineStyles"),
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
  async function deleteMessageTracker(messageId, swipeKey) {
    const confirmed = await ctx.ui.showConfirm({
      title: "Delete Tracker",
      message: "Delete this tracker snapshot for the selected message swipe? The chat message will not be changed.",
      variant: "danger",
      confirmLabel: "Delete"
    });
    if (!confirmed.confirmed) return;
    send({
      type: "delete_message_tracker",
      chatId: activeChatId(),
      messageId,
      swipeKey,
      requestId: requestId("tracker-delete")
    });
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
          const data = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "data" in parsed && isRecord3(parsed.data) ? parsed.data : parsed;
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
    const entries = allRenderableEntries();
    if (entries.length === 0) {
      return `<div class="ltracker-render-placeholder">${escapeHtml2("No message-attached tracker snapshots are indexed for this chat yet.")}</div>`;
    }
    return `
      <div class="ltracker-history-list">
        ${entries.map((entry) => {
      const rendered = entry.rendered;
      const open = state.settings.messageDisplay.collapsedByDefault ? "" : " open";
      const title = [
        entry.indexEntry.messageIndex !== null ? `Message #${entry.indexEntry.messageIndex}` : "Message",
        `Swipe ${entry.indexEntry.swipeKey}`,
        rendered.presetName ? rendered.presetName : "No preset metadata"
      ].join(" - ");
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
    const injectionDisabledReason = diagnostics.contextHandlerDisabledReason;
    const injectionPreviewText = injectionDisabledReason ? injectionDisabledReason : state.injectionPreview ?? "No injection preview available. Generate a tracker and enable injection to preview cached context.";
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
      diagnostics.contextHandlerDisabledReason ? "context_handler disabled by hotfix" : state.permissions.contextHandler ? "context_handler granted" : "context_handler missing"
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
    tab.root.innerHTML = `
      <section class="ltracker-shell">
        <header class="ltracker-header">
          <div>
            <h2 class="ltracker-title">LTracker</h2>
            <div class="ltracker-version">Version ${escapeHtml2(state.version)}</div>
          </div>
          <span class="ltracker-status">${escapeHtml2(labelForStatus(state.status))}</span>
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
              <input type="number" min="1" max="200" step="1" data-setting="recentMessageLimit" value="${escapeHtml2(String(state.settings.recentMessageLimit))}">
            </label>
            <label class="ltracker-field">
              Max chars per message
              <input type="number" min="500" max="50000" step="100" data-setting="maxMessageChars" value="${escapeHtml2(String(state.settings.maxMessageChars))}">
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
            <label class="ltracker-check">
              <input type="checkbox" data-setting="autoModeEnabled"${checked(state.settings.auto.autoModeEnabled)}>
              Auto mode
            </label>
            <label class="ltracker-field">
              Auto debounce ms
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
          </div>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <span class="ltracker-save-status" data-settings-save-status>${escapeHtml2(settingsSaveStatusLabel())}</span>
            <button class="ltracker-button" type="button" data-action="reset-settings">Reset Settings</button>
          </div>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Tracker Connection</span>
          <div class="ltracker-settings">
            <label class="ltracker-field">
              Mode
              <select data-connection-setting="mode">
                <option value="active_quiet"${selected(connectionSettings.mode === "active_quiet")}>Active chat connection</option>
                <option value="selected_connection_quiet"${selected(connectionSettings.mode === "selected_connection_quiet")}>Selected connection, quiet mode</option>
                <option value="selected_connection_raw"${selected(connectionSettings.mode === "selected_connection_raw")}>Selected connection, raw mode</option>
              </select>
            </label>
            <label class="ltracker-field">
              Profile
              <select data-connection-setting="selectedConnectionId">
                ${connectionOptions}
              </select>
            </label>
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
          <div class="ltracker-actions" style="margin-top: 10px;">
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
          <details class="ltracker-details">
            <summary>Last connection test output</summary>
            <pre class="ltracker-text">${escapeHtml2(diagnostics.lastConnectionTestOutputPreview ?? "None")}</pre>
          </details>
          <details class="ltracker-details">
            <summary>Last connection test usage</summary>
            <pre class="ltracker-text">${escapeHtml2(compactRecord(diagnostics.lastConnectionTestUsage) ?? "None")}</pre>
          </details>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Tracker Generation Parameters</span>
          <div class="ltracker-settings">
            <label class="ltracker-field">
              Temperature
              <input type="number" min="0" max="2" step="0.05" data-connection-parameter="temperature" value="${escapeHtml2(numberInputValue(connectionSettings.parameters.temperature))}">
            </label>
            <label class="ltracker-field">
              Max tokens
              <input type="number" min="256" max="32000" step="256" data-connection-parameter="max_tokens" value="${escapeHtml2(numberInputValue(connectionSettings.parameters.max_tokens))}">
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
          </div>
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="reset-connection-parameters">Reset Parameters</button>
          </div>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Tracker Reasoning</span>
          <div class="ltracker-settings">
            <label class="ltracker-field">
              Source
              <select data-connection-reasoning="source">
                <option value="inherit"${selected(connectionSettings.reasoning.source === "inherit")}>Inherit</option>
                <option value="off"${selected(connectionSettings.reasoning.source === "off")}>Off</option>
                <option value="custom"${selected(connectionSettings.reasoning.source === "custom")}>Custom</option>
              </select>
            </label>
            ${reasoningControls}
          </div>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Prompt Injection</span>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-setting="enabled"${checked(state.settings.injection.enabled)}>
              Enable LTracker injection
            </label>
            <label class="ltracker-field">
              Mode
              <select data-setting="mode">
                <option value="latest_chat_snapshot"${selected(state.settings.injection.mode === "latest_chat_snapshot")}>Latest chat snapshot</option>
                <option value="latest_message_snapshot"${selected(state.settings.injection.mode === "latest_message_snapshot")}>Latest message snapshot</option>
              </select>
            </label>
            <label class="ltracker-field">
              Format
              <select data-setting="format">
                <option value="compact"${selected(state.settings.injection.format === "compact")}>Compact</option>
                <option value="pretty_json"${selected(state.settings.injection.format === "pretty_json")}>Pretty JSON</option>
                <option value="minimal"${selected(state.settings.injection.format === "minimal")}>Minimal</option>
              </select>
            </label>
            <label class="ltracker-field">
              Max injected chars
              <input type="number" min="500" max="20000" step="250" data-setting="maxInjectedChars" value="${escapeHtml2(String(state.settings.injection.maxInjectedChars))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="includeHeader"${checked(state.settings.injection.includeHeader)}>
              Include header
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="includeTimestamp"${checked(state.settings.injection.includeTimestamp)}>
              Include timestamp
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="includeSourceMessageId"${checked(state.settings.injection.includeSourceMessageId)}>
              Include source message id
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-setting="onlyInjectWhenSnapshotExists"${checked(state.settings.injection.onlyInjectWhenSnapshotExists)}>
              Only inject when snapshot exists
            </label>
          </div>
          ${injectionDisabledReason ? `<p class="ltracker-note">${escapeHtml2(injectionDisabledReason)}</p>` : ""}
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="copy-injection-preview" ${disabled(!state.injectionPreview)}>
              Copy Injection Preview
            </button>
          </div>
          <details class="ltracker-details" open>
            <summary>Current injection preview</summary>
            <pre class="ltracker-text">${escapeHtml2(injectionPreviewText)}</pre>
          </details>
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Rendered Tracker Preview</span>
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
              Max rendered chars
              <input type="number" min="1000" max="200000" step="1000" data-renderer-setting="maxRenderedChars" value="${escapeHtml2(String(state.settings.renderer.maxRenderedChars))}">
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-renderer-setting="allowInlineStyles"${checked(state.settings.renderer.allowInlineStyles)}>
              Allow sanitized inline styles
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

        <section class="ltracker-panel">
          <span class="ltracker-label">Message Display</span>
          <div class="ltracker-settings">
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="enabled"${checked(state.settings.messageDisplay.enabled)}>
              Enable message display
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="useDomInjection"${checked(state.settings.messageDisplay.useDomInjection)}>
              DOM injection
            </label>
            <label class="ltracker-check">
              <input type="checkbox" data-message-display-setting="fallbackToIframeWidget"${checked(state.settings.messageDisplay.fallbackToIframeWidget)}>
              Iframe fallback
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
              Display mode
              <select data-message-display-setting="displayMode">
                <option value="inline_full"${selected(state.settings.messageDisplay.displayMode === "inline_full")}>Inline full</option>
                <option value="inline_button_popover"${selected(state.settings.messageDisplay.displayMode === "inline_button_popover")}>Button popover</option>
                <option value="drawer_history_only"${selected(state.settings.messageDisplay.displayMode === "drawer_history_only")}>Drawer history only</option>
              </select>
            </label>
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
              <input type="checkbox" data-message-display-setting="allowInlineStyles"${checked(state.settings.messageDisplay.allowInlineStyles)}>
              Allow sanitized inline styles
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
              <input type="checkbox" data-message-display-setting="showDebugSwipeKey"${checked(state.settings.messageDisplay.showDebugSwipeKey)}>
              Show debug swipe key
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
              Fallback minimized height
              <input type="number" min="0" max="400" step="10" data-message-display-setting="minimizedMaxHeightPx" value="${escapeHtml2(String(state.settings.messageDisplay.minimizedMaxHeightPx))}">
            </label>
            <label class="ltracker-field">
              Max rendered chars
              <input type="number" min="1000" max="200000" step="1000" data-message-display-setting="maxRenderedChars" value="${escapeHtml2(String(state.settings.messageDisplay.maxRenderedChars))}">
            </label>
          </div>
          ${placementWarning}
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Message Tracker History</span>
          ${messageHistoryHtml}
        </section>

        <section class="ltracker-panel">
          <span class="ltracker-label">Schema Presets</span>
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
            <label class="ltracker-field ltracker-field-wide">
              Import Preset JSON
              <textarea data-preset-import placeholder="Paste exported ltracker_schema_preset JSON here"></textarea>
            </label>
          </div>
          ${presetHtmlWarning ? `<p class="ltracker-note">${escapeHtml2(presetHtmlWarning)}</p>` : ""}
          ${recommendedConnectionText ? `<p class="ltracker-note">${escapeHtml2(recommendedConnectionText)}</p>` : ""}
          <div class="ltracker-actions" style="margin-top: 10px;">
            <button class="ltracker-button" type="button" data-action="render-template" ${disabled(!state.chatId)}>
              Render With Latest Snapshot
            </button>
            <button class="ltracker-button" type="button" data-action="apply-preset-connection" ${disabled(!recommendedConnection)}>
              Apply Preset Recommended Tracker Settings
            </button>
            <button class="ltracker-button" type="button" data-action="save-preset-new">Save As New Preset</button>
            <button class="ltracker-button" type="button" data-action="duplicate-preset">Duplicate Preset</button>
            <button class="ltracker-button" type="button" data-action="update-preset" ${disabled(activePresetIsBuiltIn)}>Update Current Preset</button>
            <button class="ltracker-button" type="button" data-action="delete-preset" ${disabled(activePresetIsBuiltIn)}>Delete Preset</button>
            <button class="ltracker-button" type="button" data-action="reset-preset">Reset To Default Preset</button>
            <button class="ltracker-button" type="button" data-action="export-preset">Export Selected Preset</button>
            <button class="ltracker-button" type="button" data-action="import-preset">Import Preset JSON</button>
            <button class="ltracker-button" type="button" data-action="validate-preset">Validate Preset</button>
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
            ${renderRow("Connection mode", diagnostics.connectionMode)}
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
            ${renderRow("Message display enabled", diagnostics.messageDisplayEnabled ? "yes" : "no")}
            ${renderRow("Message display mode", diagnostics.messageDisplayMode)}
            ${renderRow("Message display renderer", diagnostics.messageDisplayRenderer)}
            ${renderRow("Message display placement", diagnostics.messageDisplayPlacement)}
            ${renderRow("Message display hydrated count", diagnostics.messageDisplayHydratedCount)}
            ${renderRow("Last message display hydration", diagnostics.lastMessageDisplayHydratedAt)}
            ${renderRow("Last message display error", diagnostics.lastMessageDisplayError)}
            ${renderRow("Last message control render", diagnostics.lastMessageControlRenderAt)}
            ${renderRow("Last message control message", diagnostics.lastMessageControlMessageId)}
            ${renderRow("Last message control swipe", diagnostics.lastMessageControlSwipeKey)}
            ${renderRow("Last message control state", diagnostics.lastMessageControlState)}
            ${renderRow("Last generate button message", diagnostics.lastGenerateButtonMessageId)}
            ${renderRow("Last generate button click", diagnostics.lastGenerateButtonClickedAt)}
            ${renderRow("Last inline action", diagnostics.lastInlineActionClicked)}
            ${renderRow("Last inline action at", diagnostics.lastInlineActionAt)}
            ${renderRow("Last inline action error", diagnostics.lastInlineActionError)}
            ${renderRow("Native toolbar supported", diagnostics.nativeToolbarSupported ? "yes" : "no")}
            ${renderRow("Native toolbar fallback", diagnostics.nativeToolbarFallbackReason)}
            ${renderRow("Last placement requested", diagnostics.lastPlacementRequested)}
            ${renderRow("Last placement resolved", diagnostics.lastPlacementResolved)}
            ${renderRow("Last placement attempt", diagnostics.lastPlacementRenderAttemptAt)}
            ${renderRow("Last placement result", diagnostics.lastPlacementRenderResult)}
            ${renderRow("Last placement error", diagnostics.lastPlacementError)}
            ${renderRow("Last mount strategy", diagnostics.lastMountPointStrategy)}
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
            ${renderRow("Message-local UI supported", diagnostics.messageLocalUiSupported ? "yes" : "no")}
            ${renderRow("Message-local fallback reason", diagnostics.messageLocalUiFallbackReason)}
            ${renderRow("Message snapshot index count", diagnostics.messageSnapshotIndexCount)}
            ${renderRow("Swipe tracker index count", diagnostics.swipeTrackerIndexCount)}
            ${renderRow("Last deleted tracker message", diagnostics.lastDeletedTrackerMessageId)}
            ${renderRow("Last deleted tracker swipe", diagnostics.lastDeletedTrackerSwipeKey)}
            ${renderRow("Last edited tracker message", diagnostics.lastEditedTrackerMessageId)}
            ${renderRow("Last edited tracker swipe", diagnostics.lastEditedTrackerSwipeKey)}
            ${renderRow("Last swipe detected message", diagnostics.lastSwipeDetectedMessageId)}
            ${renderRow("Last swipe key", diagnostics.lastSwipeKey)}
            ${renderRow("Last swipe key source", diagnostics.lastSwipeKeySource)}
            ${renderRow("Active tracker jobs", diagnostics.activeTrackerJobs.map((job) => `${job.messageId}/${job.swipeKey}`).join(", "))}
            ${renderRow("Last widget regenerate message", diagnostics.lastWidgetRegenerateMessageId)}
            ${renderRow("Last widget regenerate started", diagnostics.lastWidgetRegenerateStartedAt)}
            ${renderRow("Last widget regenerate completed", diagnostics.lastWidgetRegenerateCompletedAt)}
            ${renderRow("Last widget regenerate duration", diagnostics.lastWidgetRegenerateDurationMs)}
            ${renderRow("Last widget regenerate cancelled", diagnostics.lastWidgetRegenerateCancelledAt)}
            ${renderRow("Last widget regenerate error", diagnostics.lastWidgetRegenerateError)}
            ${renderRow("Active widget regenerations", diagnostics.activeWidgetRegenerationCount)}
            ${renderRow("Message widget placement resolved", diagnostics.messageWidgetPlacementResolved)}
            ${renderRow("Message widget placement reason", diagnostics.messageWidgetPlacementReason)}
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
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
    const action = target?.dataset.action;
    const historyEntry = findHistoryEntry(target?.dataset.messageId, target?.dataset.swipeKey ?? null);
    if (action === "generate") generateTracker();
    if (action === "refresh") requestState();
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
    if (action === "copy-injection-preview") void copyText(state.injectionPreview, "injection preview");
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
    if (action === "export-preset") {
      void copyText(JSON.stringify(exportTrackerPreset(state.activePreset), null, 2), "selected preset export");
    }
  };
  tab.root.addEventListener("click", onClick);
  cleanups.push(() => tab.root.removeEventListener("click", onClick));
  const onInput = (event) => {
    if (isSettingsControl(event.target)) scheduleSettingsAutosave();
  };
  tab.root.addEventListener("input", onInput);
  cleanups.push(() => tab.root.removeEventListener("input", onInput));
  const onChange = (event) => {
    if (isSettingsControl(event.target)) scheduleSettingsAutosave();
    const target = event.target instanceof HTMLSelectElement ? event.target.closest("[data-preset-select]") : null;
    if (target) selectPreset(target.value);
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
  }));
  cleanups.push(() => clearSettingsAutosaveTimer());
  cleanups.push(() => cleanupMessageWidgets());
  cleanups.push(() => cleanupDomInjections());
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
