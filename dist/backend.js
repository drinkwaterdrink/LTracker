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
function emptyDecision(skippedReason) {
  return {
    text: null,
    skippedReason,
    snapshotCreatedAt: null,
    sourceMessageId: null,
    injectedChars: 0
  };
}

// src/shared/contextHandlerRuntime.ts
var CONTEXT_HANDLER_EXPERIMENTAL_ENABLED = false;
var CONTEXT_HANDLER_DISABLED_REASON = "Context handler injection is disabled in 0.09 while the Lumiverse context handler return contract is being verified.";

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
  "border",
  "border-radius",
  "padding",
  "margin",
  "font-weight",
  "font-style",
  "text-align",
  "display",
  "gap",
  "grid-template-columns",
  "flex-direction",
  "align-items",
  "justify-content"
]);
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  let current = source;
  for (const segment of path.split(".")) {
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
    if (lowerValue.includes("url(") || lowerValue.includes("expression") || lowerValue.includes("@") || /[<>{}]/.test(rawValue)) {
      warnings.push(`Removed unsafe style value for ${property}.`);
      continue;
    }
    if (!/^[\w\s#.,%()/-]+$/.test(rawValue)) {
      warnings.push(`Removed unsupported style value for ${property}.`);
      continue;
    }
    declarations.push(`${property}: ${rawValue}`);
  }
  return declarations.length > 0 ? declarations.join("; ") : null;
}
function sanitizeAttributes(raw, allowInlineStyles, warnings) {
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
      return `<${tag}${sanitizeAttributes(rawAttributes, options.allowInlineStyles === true, warnings)}>`;
    }
  );
  return { html: sanitized, warnings };
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
    const sanitized = sanitizeHtml(rendered, { allowInlineStyles: options.allowInlineStyles === true });
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

// src/shared/messageDisplay.ts
var MESSAGE_LOCAL_UI_SUPPORTED = true;
var MESSAGE_LOCAL_UI_FALLBACK_REASON = null;
var MESSAGE_WIDGET_PLACEMENT_REASON = "lumiverse-spindle-types@0.5.21 exposes ctx.messages.renderWidget() as a below-message widget surface and does not expose a top-placement option.";
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
function buildWidgetHtml(rendered, settings) {
  const duration = settings.showGenerationDuration ? formatDurationMs(rendered.generationDurationMs) : null;
  const runningSince = rendered.isRegenerating ? rendered.generationStartedAt : null;
  const actionLabel = rendered.isRegenerating ? "Cancel tracker generation" : "Regenerate tracker";
  const meta = [
    settings.showPresetName && rendered.presetName ? rendered.presetName : null,
    settings.showTimestamp && rendered.snapshotCreatedAt ? rendered.snapshotCreatedAt : null
  ].filter((item) => Boolean(item)).join(" / ");
  const body = rendered.html || `<pre class="ltr-pre">${escapeHtml(rendered.textFallback)}</pre>`;
  const regenerateButton = settings.showWidgetRegenerateButton ? `
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
      <\/script>` : "";
  const elapsedMarkup = settings.showGenerationDuration ? rendered.isRegenerating && rendered.generationStartedAt ? `<span class="ltr-pill" data-elapsed>${escapeHtml(currentRunningDuration(rendered.generationStartedAt) ?? "0ms")}</span>` : duration ? `<span class="ltr-pill">${escapeHtml(duration)}</span>` : "" : "";
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
function renderMessageTracker(input) {
  const snapshot = snapshotForDisplay(input);
  const metadata = metadataFromSnapshot(input.attachedSnapshot, snapshot);
  const generationMetadata = generationMetadataFromSnapshot(snapshot, input);
  if (!snapshot) {
    const textFallback2 = "No tracker snapshot is available for this message.";
    const base2 = {
      messageId: input.messageId,
      messageIndex: input.messageIndex,
      ...metadata,
      ...generationMetadata,
      renderMode: input.settings.renderMode,
      html: "",
      textFallback: textFallback2,
      json: "",
      warnings: [],
      errors: [textFallback2]
    };
    return {
      ...base2,
      widgetHtml: buildWidgetHtml(base2, input.settings)
    };
  }
  const warnings = [];
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
      allowInlineStyles: false
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
    errors
  };
  return {
    ...base,
    widgetHtml: buildWidgetHtml(base, input.settings)
  };
}
function buildMessageTrackerHistory(input) {
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
        activeJobStartedAt: activeJob?.startedAt ?? null
      })
    };
  });
}

// src/shared/messageSnapshotIndex.ts
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}
function messageIndexOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}
function repairIndexEntry(value) {
  if (!isRecord3(value) || typeof value.messageId !== "string" || typeof value.storageKey !== "string") {
    return null;
  }
  return {
    messageId: value.messageId,
    messageIndex: messageIndexOrNull(value.messageIndex),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    presetId: stringOrNull(value.presetId),
    presetName: stringOrNull(value.presetName),
    storageKey: value.storageKey
  };
}
function repairMessageSnapshotIndex(value) {
  if (!Array.isArray(value)) return [];
  const seen = /* @__PURE__ */ new Set();
  const repaired = [];
  for (const item of value) {
    const entry = repairIndexEntry(item);
    if (!entry || seen.has(entry.messageId)) continue;
    seen.add(entry.messageId);
    repaired.push(entry);
  }
  return sortMessageSnapshotIndex(repaired);
}
function sortMessageSnapshotIndex(index) {
  return [...index].sort((left, right) => {
    if (left.messageIndex !== null && right.messageIndex !== null && left.messageIndex !== right.messageIndex) {
      return left.messageIndex - right.messageIndex;
    }
    if (left.messageIndex !== null && right.messageIndex === null) return -1;
    if (left.messageIndex === null && right.messageIndex !== null) return 1;
    const created = left.createdAt.localeCompare(right.createdAt);
    return created !== 0 ? created : left.messageId.localeCompare(right.messageId);
  });
}
function upsertMessageSnapshotIndexEntry(index, entry) {
  const next = index.filter((item) => item.messageId !== entry.messageId);
  next.push(entry);
  return sortMessageSnapshotIndex(next);
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
    generationStatus: snapshot.generationStatus === "completed" || snapshot.generationStatus === "cancelled" || snapshot.generationStatus === "failed" ? snapshot.generationStatus : null
  };
}
function normalizeMessageAttachedSnapshotPresetMetadata(snapshot) {
  const normalizedSnapshot = normalizeTrackerSnapshotPresetMetadata(snapshot.snapshot);
  return {
    ...snapshot,
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
function isRecord4(value) {
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
  if (!isRecord4(value)) return void 0;
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
  if (!isRecord4(value)) {
    return { ok: false, error: "JSON Schema must be a JSON object." };
  }
  return { ok: true, error: null };
}
function validateTrackerPreset(value) {
  if (!isRecord4(value)) return { ok: false, error: "Preset must be a JSON object." };
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
  if (!isRecord4(value)) return null;
  const origin = validOrigin(value.origin) ? value.origin : null;
  if (!origin) return null;
  const preset = {
    id: sanitizePresetId(stringValue(value.id)),
    name: stringValue(value.name).trim(),
    description: stringValue(value.description),
    version: stringValue(value.version, "1.0"),
    createdAt: stringValue(value.createdAt, (/* @__PURE__ */ new Date()).toISOString()),
    updatedAt: stringValue(value.updatedAt, (/* @__PURE__ */ new Date()).toISOString()),
    jsonSchema: isRecord4(value.jsonSchema) ? value.jsonSchema : {},
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
  if (!isRecord4(value)) return { ok: false, preset: null, error: "Import must be a JSON object." };
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
var EXTENSION_VERSION = "0.09";
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
  maxInjectedChars: { min: 500, max: 2e4, default: 3e3 },
  maxRenderedChars: { min: 1e3, max: 2e5, default: 5e4 },
  maxMessageDisplayRenderedChars: { min: 1e3, max: 2e5, default: 5e4 }
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
    placement: "top",
    source: "message_attached_snapshot",
    renderMode: "html_template",
    collapsedByDefault: true,
    showTimestamp: true,
    showPresetName: true,
    showDebugCopyButtonsInHistory: true,
    showWidgetRegenerateButton: true,
    showGenerationDuration: true,
    maxRenderedChars: SETTINGS_LIMITS.maxMessageDisplayRenderedChars.default
  }
};
function isRecord5(value) {
  return typeof value === "object" && value !== null;
}
function clampNumber(value, fallback, min, max) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() ? Number(value) : fallback;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}
function repairSettings(value) {
  const source = isRecord5(value) ? value : {};
  const autoSource = isRecord5(source.auto) ? source.auto : {};
  const injectionSource = isRecord5(source.injection) ? source.injection : {};
  const rendererSource = isRecord5(source.renderer) ? source.renderer : {};
  const messageDisplaySource = isRecord5(source.messageDisplay) ? source.messageDisplay : {};
  const mode = injectionSource.mode === "latest_message_snapshot" || injectionSource.mode === "latest_chat_snapshot" ? injectionSource.mode : DEFAULT_SETTINGS.injection.mode;
  const format = injectionSource.format === "pretty_json" || injectionSource.format === "minimal" || injectionSource.format === "compact" ? injectionSource.format : DEFAULT_SETTINGS.injection.format;
  const previewSource = rendererSource.previewSource === "latest_message_snapshot" || rendererSource.previewSource === "latest_chat_snapshot" ? rendererSource.previewSource : DEFAULT_SETTINGS.renderer.previewSource;
  const messageDisplayPlacement = messageDisplaySource.placement === "bottom" || messageDisplaySource.placement === "top" ? messageDisplaySource.placement : DEFAULT_SETTINGS.messageDisplay.placement;
  const messageDisplaySourceSetting = messageDisplaySource.source === "latest_chat_snapshot" || messageDisplaySource.source === "message_attached_snapshot" ? messageDisplaySource.source : DEFAULT_SETTINGS.messageDisplay.source;
  const messageDisplayRenderMode = messageDisplaySource.renderMode === "compact_text" || messageDisplaySource.renderMode === "pretty_json" || messageDisplaySource.renderMode === "html_template" ? messageDisplaySource.renderMode : DEFAULT_SETTINGS.messageDisplay.renderMode;
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
    },
    renderer: {
      enabled: typeof rendererSource.enabled === "boolean" ? rendererSource.enabled : DEFAULT_SETTINGS.renderer.enabled,
      previewSource,
      missingValuePlaceholder: typeof rendererSource.missingValuePlaceholder === "string" ? rendererSource.missingValuePlaceholder : DEFAULT_SETTINGS.renderer.missingValuePlaceholder,
      maxRenderedChars: clampNumber(
        rendererSource.maxRenderedChars,
        SETTINGS_LIMITS.maxRenderedChars.default,
        SETTINGS_LIMITS.maxRenderedChars.min,
        SETTINGS_LIMITS.maxRenderedChars.max
      ),
      allowInlineStyles: typeof rendererSource.allowInlineStyles === "boolean" ? rendererSource.allowInlineStyles : DEFAULT_SETTINGS.renderer.allowInlineStyles
    },
    messageDisplay: {
      enabled: typeof messageDisplaySource.enabled === "boolean" ? messageDisplaySource.enabled : DEFAULT_SETTINGS.messageDisplay.enabled,
      placement: messageDisplayPlacement,
      source: messageDisplaySourceSetting,
      renderMode: messageDisplayRenderMode,
      collapsedByDefault: typeof messageDisplaySource.collapsedByDefault === "boolean" ? messageDisplaySource.collapsedByDefault : DEFAULT_SETTINGS.messageDisplay.collapsedByDefault,
      showTimestamp: typeof messageDisplaySource.showTimestamp === "boolean" ? messageDisplaySource.showTimestamp : DEFAULT_SETTINGS.messageDisplay.showTimestamp,
      showPresetName: typeof messageDisplaySource.showPresetName === "boolean" ? messageDisplaySource.showPresetName : DEFAULT_SETTINGS.messageDisplay.showPresetName,
      showDebugCopyButtonsInHistory: typeof messageDisplaySource.showDebugCopyButtonsInHistory === "boolean" ? messageDisplaySource.showDebugCopyButtonsInHistory : typeof messageDisplaySource.showCopyButton === "boolean" ? messageDisplaySource.showCopyButton : DEFAULT_SETTINGS.messageDisplay.showDebugCopyButtonsInHistory,
      showWidgetRegenerateButton: typeof messageDisplaySource.showWidgetRegenerateButton === "boolean" ? messageDisplaySource.showWidgetRegenerateButton : DEFAULT_SETTINGS.messageDisplay.showWidgetRegenerateButton,
      showGenerationDuration: typeof messageDisplaySource.showGenerationDuration === "boolean" ? messageDisplaySource.showGenerationDuration : DEFAULT_SETTINGS.messageDisplay.showGenerationDuration,
      maxRenderedChars: clampNumber(
        messageDisplaySource.maxRenderedChars,
        SETTINGS_LIMITS.maxMessageDisplayRenderedChars.default,
        SETTINGS_LIMITS.maxMessageDisplayRenderedChars.min,
        SETTINGS_LIMITS.maxMessageDisplayRenderedChars.max
      )
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
function messageSnapshotIndexPath(chatId) {
  return `chats/${encodeStorageSegment(chatId)}/message-snapshots/index.json`;
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
function isRecord6(value) {
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
  if (!isRecord6(payload) || typeof payload.type !== "string") return false;
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
    "validate_preset",
    "render_template",
    "regenerate_message_tracker",
    "cancel_tracker_generation"
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
    "validate_preset",
    "render_template",
    "regenerate_message_tracker",
    "cancel_tracker_generation"
  ].includes(payload.type) && typeof payload.requestId !== "string") return false;
  if (payload.type === "save_settings" && !isRecord6(payload.settings)) return false;
  if (["save_preset_as_new", "duplicate_preset", "update_preset", "validate_preset"].includes(payload.type) && !isRecord6(payload.preset)) return false;
  if (["select_preset", "update_preset", "delete_preset"].includes(payload.type) && typeof payload.presetId !== "string") return false;
  if (payload.type === "import_preset" && typeof payload.importText !== "string") return false;
  if (payload.type === "regenerate_message_tracker" && typeof payload.messageId !== "string") return false;
  if (payload.type === "cancel_tracker_generation" && typeof payload.jobId !== "string") return false;
  if (payload.type === "render_template" && "source" in payload && payload.source !== void 0 && payload.source !== "latest_chat_snapshot" && payload.source !== "latest_message_snapshot") return false;
  return true;
}
function permissionState() {
  return {
    generation: spindle.permissions.has("generation"),
    chats: spindle.permissions.has("chats"),
    chatMutation: spindle.permissions.has("chat_mutation"),
    contextHandler: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED && spindle.permissions.has("context_handler")
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
    contextHandlerRegistered,
    contextHandlerDisabledReason: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED ? null : CONTEXT_HANDLER_DISABLED_REASON,
    lastContextHandlerError: null,
    messageDisplayEnabled: false,
    messageDisplayMode: null,
    messageDisplayPlacement: null,
    messageDisplayHydratedCount: 0,
    lastMessageDisplayHydratedAt: null,
    lastMessageDisplayError: null,
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
    messageWidgetPlacementReason: MESSAGE_WIDGET_PLACEMENT_REASON
  };
}
function stringOrNull2(value) {
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
  return isRecord6(value) && !Array.isArray(value) ? value : null;
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
function renderSourceOrNull(value) {
  return value === "latest_chat_snapshot" || value === "latest_message_snapshot" ? value : null;
}
function renderStatusOrNull(value) {
  return value === "rendered" || value === "fallback" || value === "no_template" || value === "no_snapshot" || value === "error" ? value : null;
}
function messageDisplayModeOrNull(value) {
  return value === "message_widget" || value === "drawer_history" || value === "disabled" ? value : null;
}
function messageDisplayPlacementOrNull(value) {
  return value === "top" || value === "bottom" ? value : null;
}
function messageWidgetPlacementResolved(value) {
  return value === "top" || value === "bottom" || value === "host_default" || value === "unsupported" ? value : MESSAGE_LOCAL_UI_SUPPORTED ? "host_default" : "unsupported";
}
function errorOrNull(value) {
  if (!isRecord6(value) || typeof value.stage !== "string" || typeof value.message !== "string") return null;
  const error = {
    stage: value.stage,
    message: value.message,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso()
  };
  if (typeof value.detail === "string") error.detail = value.detail;
  return error;
}
function cancellationOrNull(value) {
  if (!isRecord6(value) || typeof value.jobId !== "string" || typeof value.requestId !== "string" || typeof value.reason !== "string") return null;
  return {
    jobId: value.jobId,
    requestId: value.requestId,
    reason: value.reason,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso()
  };
}
function repairDiagnostics(value, chatId) {
  const base = defaultDiagnostics(chatId);
  if (!isRecord6(value)) return base;
  return {
    ...base,
    status: value.status === "generating" || value.status === "error" ? value.status : "idle",
    lastJobId: stringOrNull2(value.lastJobId),
    lastRequestId: stringOrNull2(value.lastRequestId),
    lastGenerationSource: sourceKindOrNull(value.lastGenerationSource),
    lastGenerationStartedAt: stringOrNull2(value.lastGenerationStartedAt),
    lastGenerationCompletedAt: stringOrNull2(value.lastGenerationCompletedAt),
    lastGenerationDurationMs: numberOrNull(value.lastGenerationDurationMs),
    lastMessagesRead: typeof value.lastMessagesRead === "number" && Number.isFinite(value.lastMessagesRead) ? Math.max(0, Math.round(value.lastMessagesRead)) : 0,
    lastSourceMessageIds: stringArray(value.lastSourceMessageIds),
    lastSourceMessageRange: stringOrNull2(value.lastSourceMessageRange),
    lastRawOutput: stringOrNull2(value.lastRawOutput),
    lastParsedTracker: recordOrNull(value.lastParsedTracker),
    lastPromptPreview: stringOrNull2(value.lastPromptPreview),
    lastError: errorOrNull(value.lastError),
    lastCancellation: cancellationOrNull(value.lastCancellation),
    autoSubscriptionActive: autoSubscriptionsActive,
    lastAutoEventAt: stringOrNull2(value.lastAutoEventAt),
    lastAutoEventType: autoEventTypeOrNull(value.lastAutoEventType),
    lastAutoSkippedReason: stringOrNull2(value.lastAutoSkippedReason),
    lastAutoScheduledAt: stringOrNull2(value.lastAutoScheduledAt),
    lastAutoTriggeredAt: stringOrNull2(value.lastAutoTriggeredAt),
    lastAutoSourceMessageId: stringOrNull2(value.lastAutoSourceMessageId),
    lastAutoSourceMessageIndex: nonNegativeInteger(value.lastAutoSourceMessageIndex),
    lastAutoGenerationId: stringOrNull2(value.lastAutoGenerationId),
    latestAttachedMessageId: stringOrNull2(value.latestAttachedMessageId),
    latestAttachedMessageIndex: nonNegativeInteger(value.latestAttachedMessageIndex),
    latestAttachedSnapshotAt: stringOrNull2(value.latestAttachedSnapshotAt),
    latestAttachedSnapshotStorageKey: stringOrNull2(value.latestAttachedSnapshotStorageKey),
    injectionEnabled: typeof value.injectionEnabled === "boolean" ? value.injectionEnabled : false,
    lastInjectionAt: stringOrNull2(value.lastInjectionAt),
    lastInjectionMode: injectionModeOrNull(value.lastInjectionMode),
    lastInjectionFormat: injectionFormatOrNull(value.lastInjectionFormat),
    lastInjectedChars: typeof value.lastInjectedChars === "number" && Number.isFinite(value.lastInjectedChars) ? Math.max(0, Math.round(value.lastInjectedChars)) : 0,
    lastInjectionSkippedReason: stringOrNull2(value.lastInjectionSkippedReason),
    lastInjectionSnapshotCreatedAt: stringOrNull2(value.lastInjectionSnapshotCreatedAt),
    lastInjectionSourceMessageId: stringOrNull2(value.lastInjectionSourceMessageId),
    selectedPresetId: stringOrNull2(value.selectedPresetId),
    selectedPresetName: stringOrNull2(value.selectedPresetName),
    lastPresetFallbackReason: stringOrNull2(value.lastPresetFallbackReason),
    lastPresetValidationError: stringOrNull2(value.lastPresetValidationError),
    lastPromptUsedPresetId: stringOrNull2(value.lastPromptUsedPresetId),
    lastPromptUsedPresetName: stringOrNull2(value.lastPromptUsedPresetName),
    lastRenderAt: stringOrNull2(value.lastRenderAt),
    lastRenderPresetId: stringOrNull2(value.lastRenderPresetId),
    lastRenderPresetName: stringOrNull2(value.lastRenderPresetName),
    lastRenderSnapshotCreatedAt: stringOrNull2(value.lastRenderSnapshotCreatedAt),
    lastRenderSource: renderSourceOrNull(value.lastRenderSource),
    lastRenderStatus: renderStatusOrNull(value.lastRenderStatus),
    lastRenderWarnings: stringArray(value.lastRenderWarnings),
    lastRenderErrors: stringArray(value.lastRenderErrors),
    lastSanitizedHtmlChars: typeof value.lastSanitizedHtmlChars === "number" && Number.isFinite(value.lastSanitizedHtmlChars) ? Math.max(0, Math.round(value.lastSanitizedHtmlChars)) : 0,
    lastFallbackTextChars: typeof value.lastFallbackTextChars === "number" && Number.isFinite(value.lastFallbackTextChars) ? Math.max(0, Math.round(value.lastFallbackTextChars)) : 0,
    contextHandlerRegistered,
    contextHandlerDisabledReason: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED ? stringOrNull2(value.contextHandlerDisabledReason) : CONTEXT_HANDLER_DISABLED_REASON,
    lastContextHandlerError: stringOrNull2(value.lastContextHandlerError),
    messageDisplayEnabled: typeof value.messageDisplayEnabled === "boolean" ? value.messageDisplayEnabled : base.messageDisplayEnabled,
    messageDisplayMode: messageDisplayModeOrNull(value.messageDisplayMode),
    messageDisplayPlacement: messageDisplayPlacementOrNull(value.messageDisplayPlacement),
    messageDisplayHydratedCount: typeof value.messageDisplayHydratedCount === "number" && Number.isFinite(value.messageDisplayHydratedCount) ? Math.max(0, Math.round(value.messageDisplayHydratedCount)) : 0,
    lastMessageDisplayHydratedAt: stringOrNull2(value.lastMessageDisplayHydratedAt),
    lastMessageDisplayError: stringOrNull2(value.lastMessageDisplayError),
    messageLocalUiSupported: typeof value.messageLocalUiSupported === "boolean" ? value.messageLocalUiSupported : MESSAGE_LOCAL_UI_SUPPORTED,
    messageLocalUiFallbackReason: stringOrNull2(value.messageLocalUiFallbackReason) ?? MESSAGE_LOCAL_UI_FALLBACK_REASON,
    messageSnapshotIndexCount: typeof value.messageSnapshotIndexCount === "number" && Number.isFinite(value.messageSnapshotIndexCount) ? Math.max(0, Math.round(value.messageSnapshotIndexCount)) : 0,
    lastWidgetRegenerateMessageId: stringOrNull2(value.lastWidgetRegenerateMessageId),
    lastWidgetRegenerateStartedAt: stringOrNull2(value.lastWidgetRegenerateStartedAt),
    lastWidgetRegenerateCompletedAt: stringOrNull2(value.lastWidgetRegenerateCompletedAt),
    lastWidgetRegenerateDurationMs: numberOrNull(value.lastWidgetRegenerateDurationMs),
    lastWidgetRegenerateCancelledAt: stringOrNull2(value.lastWidgetRegenerateCancelledAt),
    lastWidgetRegenerateError: stringOrNull2(value.lastWidgetRegenerateError),
    activeWidgetRegenerationCount: typeof value.activeWidgetRegenerationCount === "number" && Number.isFinite(value.activeWidgetRegenerationCount) ? Math.max(0, Math.round(value.activeWidgetRegenerationCount)) : 0,
    messageWidgetPlacementResolved: messageWidgetPlacementResolved(value.messageWidgetPlacementResolved),
    messageWidgetPlacementReason: stringOrNull2(value.messageWidgetPlacementReason) ?? MESSAGE_WIDGET_PLACEMENT_REASON
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
  if (!isRecord6(raw) || typeof raw.selectedPresetId !== "string") {
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
  const snapshot = await spindle.userStorage.getJson(snapshotPath(chatId), {
    fallback: null,
    userId
  });
  return snapshot ? normalizeTrackerSnapshotPresetMetadata(snapshot) : null;
}
async function loadMessageSnapshot(chatId, messageId, userId) {
  if (!chatId || !messageId) return null;
  const snapshot = await spindle.userStorage.getJson(messageSnapshotPath(chatId, messageId), {
    fallback: null,
    userId
  });
  return snapshot ? normalizeMessageAttachedSnapshotPresetMetadata(snapshot) : null;
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
function activeWidgetJobsForChat(chatId) {
  if (!chatId) return {};
  const job = activeJobs.get(chatId);
  if (!job || job.sourceKind !== "widget" || !job.sourceMessageId) return {};
  return {
    [job.sourceMessageId]: {
      jobId: job.jobId,
      startedAt: job.startedAt
    }
  };
}
function resolveMessageWidgetPlacement(requested) {
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
    spindle.log.warn(`LTracker could not save diagnostics: ${errorMessage(error)}`);
  }
}
async function buildState(chatId, userId, status, error = null, renderPreview = null) {
  const settings = await getSettings(userId);
  const diagnostics = await loadDiagnostics(chatId, userId);
  const presetState = await resolveActivePreset(chatId, userId);
  const snapshot = await loadSnapshot(chatId, userId);
  const activeWidgetJobs = activeWidgetJobsForChat(chatId);
  const messageSnapshotIndex = await loadMessageSnapshotIndex(chatId, userId);
  const historySnapshots = await Promise.all(
    messageSnapshotIndex.map((entry) => loadMessageSnapshot(chatId, entry.messageId, userId))
  );
  const messageSnapshotHistory = buildMessageTrackerHistory({
    index: messageSnapshotIndex,
    snapshots: historySnapshots,
    latestChatSnapshot: snapshot,
    preset: presetState.activePreset,
    settings: settings.messageDisplay,
    activeWidgetJobs
  });
  const latestMessageSnapshot = await loadMessageSnapshot(
    chatId,
    diagnostics.latestAttachedMessageId,
    userId
  );
  const messageDisplayMode = !settings.messageDisplay.enabled ? "disabled" : MESSAGE_LOCAL_UI_SUPPORTED ? "message_widget" : "drawer_history";
  const messageDisplayHydratedCount = settings.messageDisplay.enabled ? messageSnapshotHistory.filter((entry) => entry.snapshot !== null).length : 0;
  const placement = resolveMessageWidgetPlacement(settings.messageDisplay.placement);
  const activeWidgetRegenerationCount = Object.keys(activeWidgetJobs).length;
  const injectionPreview = CONTEXT_HANDLER_EXPERIMENTAL_ENABLED ? buildInjectionDecision({
    settings,
    chatSnapshot: snapshot,
    messageSnapshot: latestMessageSnapshot,
    internalTrackerGeneration: false
  }).text : null;
  const stateError = error ?? diagnostics.lastError;
  return {
    version: EXTENSION_VERSION,
    status: status ?? diagnostics.status,
    chatId,
    snapshot,
    latestMessageSnapshot,
    injectionPreview,
    renderPreview,
    messageSnapshotHistory,
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
      injectionEnabled: settings.injection.enabled && CONTEXT_HANDLER_EXPERIMENTAL_ENABLED,
      selectedPresetId: presetState.activePreset.id,
      selectedPresetName: presetState.activePreset.name,
      lastPresetFallbackReason: presetState.fallbackReason ?? diagnostics.lastPresetFallbackReason,
      contextHandlerRegistered,
      contextHandlerDisabledReason: CONTEXT_HANDLER_EXPERIMENTAL_ENABLED ? diagnostics.contextHandlerDisabledReason : CONTEXT_HANDLER_DISABLED_REASON,
      messageDisplayEnabled: settings.messageDisplay.enabled,
      messageDisplayMode,
      messageDisplayPlacement: settings.messageDisplay.placement,
      messageDisplayHydratedCount,
      lastMessageDisplayHydratedAt: messageDisplayHydratedCount > 0 ? nowIso() : diagnostics.lastMessageDisplayHydratedAt,
      messageLocalUiSupported: MESSAGE_LOCAL_UI_SUPPORTED,
      messageLocalUiFallbackReason: MESSAGE_LOCAL_UI_FALLBACK_REASON,
      messageSnapshotIndexCount: messageSnapshotIndex.length,
      activeWidgetRegenerationCount,
      messageWidgetPlacementResolved: placement.resolved,
      messageWidgetPlacementReason: placement.reason
    }
  };
}
async function sendState(chatId, userId, status, error = null, requestId, renderPreview = null) {
  const message = {
    type: "state",
    state: await buildState(chatId, userId, status, error, renderPreview)
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
function normalizeGenerationText(result) {
  if (typeof result === "string" && result.trim()) return result;
  if (!isRecord6(result)) {
    throw new Error("Lumiverse generation returned an unsupported response.");
  }
  for (const key of ["content", "text", "output", "response"]) {
    const value = result[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const message = result.message;
  if (typeof message === "string" && message.trim()) return message;
  if (isRecord6(message) && typeof message.content === "string" && message.content.trim()) {
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
async function saveMessageAttachedSnapshotWithIndex(snapshot, userId) {
  await saveMessageAttachedSnapshot(snapshot, userId);
  const storageKey = messageSnapshotPath(snapshot.chatId, snapshot.messageId);
  const index = await loadMessageSnapshotIndex(snapshot.chatId, userId);
  const nextIndex = upsertMessageSnapshotIndexEntry(index, {
    messageId: snapshot.messageId,
    messageIndex: snapshot.messageIndex,
    createdAt: snapshot.attachedAt,
    presetId: snapshot.presetId,
    presetName: snapshot.presetName,
    storageKey
  });
  await saveMessageSnapshotIndex(snapshot.chatId, nextIndex, userId);
  return nextIndex;
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
function createWidgetTrigger(input) {
  return {
    kind: "widget",
    requestId: input.requestId,
    sourceMessageId: input.message.id,
    sourceMessageIndex: input.message.index_in_chat
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
  return isRecord6(value) && typeof value.id === "string" && typeof value.chat_id === "string" && typeof value.index_in_chat === "number" && typeof value.is_user === "boolean" && typeof value.content === "string";
}
function messageFromEventPayload(payload) {
  if (isChatMessage(payload)) return payload;
  if (isRecord6(payload) && isChatMessage(payload.message)) return payload.message;
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
  if (!userId || !isRecord6(payload)) return;
  const chatId = typeof payload.chatId === "string" ? payload.chatId : null;
  rememberActiveChat(userId, chatId);
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
  if (trigger.kind === "widget" && activeJobs.has(resolvedChatId)) {
    const running = activeJobs.get(resolvedChatId);
    if (running?.sourceKind === "widget" && running.sourceMessageId === trigger.sourceMessageId) {
      running.cancelReason = "Widget regeneration was cancelled.";
      running.controller.abort();
      return;
    }
  }
  const existing = activeJobs.get(resolvedChatId);
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
    jobId: newJobId(),
    requestId,
    sourceKind: trigger.kind,
    startedAt
  };
  if (trigger.kind === "auto" || trigger.kind === "widget") {
    job.sourceMessageId = trigger.sourceMessageId;
    job.sourceMessageIndex = trigger.sourceMessageIndex;
  }
  activeJobs.set(resolvedChatId, job);
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
      lastAutoGenerationId: trigger.generationId
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
      activeWidgetRegenerationCount: 1
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
      presetId: presetState.activePreset.id,
      presetName: presetState.activePreset.name,
      presetVersion: presetState.activePreset.version,
      generationStartedAt: startedAt,
      generationCompletedAt: completedAt,
      generationDurationMs: completedAtMs - startedAtMs,
      generationCancelledAt: null,
      generationStatus: "completed",
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
      const storageKey = messageSnapshotPath(resolvedChatId, trigger.sourceMessageId);
      const attachedSnapshot = {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        extensionVersion: EXTENSION_VERSION,
        chatId: resolvedChatId,
        messageId: trigger.sourceMessageId,
        messageIndex: trigger.sourceMessageIndex,
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name,
        presetVersion: presetState.activePreset.version,
        trigger,
        snapshot,
        attachedAt
      };
      const index = await saveMessageAttachedSnapshotWithIndex(attachedSnapshot, userId);
      diagnostics = {
        ...diagnostics,
        latestAttachedMessageId: trigger.sourceMessageId,
        latestAttachedMessageIndex: trigger.sourceMessageIndex,
        latestAttachedSnapshotAt: attachedAt,
        latestAttachedSnapshotStorageKey: storageKey,
        messageSnapshotIndexCount: index.length
      };
      if (trigger.kind === "widget") {
        diagnostics = {
          ...diagnostics,
          lastWidgetRegenerateMessageId: trigger.sourceMessageId,
          lastWidgetRegenerateCompletedAt: completedAt,
          lastWidgetRegenerateDurationMs: completedAtMs - startedAtMs,
          lastWidgetRegenerateCancelledAt: null,
          lastWidgetRegenerateError: null,
          activeWidgetRegenerationCount: 0
        };
      }
    }
    await persistDiagnostics(diagnostics, userId);
    await sendState(resolvedChatId, userId, "idle", null, requestId);
  } catch (error) {
    if (!isCurrentJob(resolvedChatId, job.jobId)) return;
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
          activeWidgetRegenerationCount: 0
        };
      }
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
        activeWidgetRegenerationCount: 0
      };
    }
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
    const template = presetState.activePreset.htmlTemplate ?? "";
    const fallback = formatTemplateTextFallback(snapshot.data);
    let preview;
    if (!settings.renderer.enabled) {
      preview = {
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name,
        snapshotCreatedAt: snapshot.createdAt,
        source,
        status: "fallback",
        html: "",
        textFallback: fallback,
        warnings: ["Renderer preview is disabled in settings; showing text fallback."],
        errors: []
      };
    } else {
      const result = renderHtmlTemplate({
        template,
        snapshotData: snapshot.data,
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name
      }, {
        missingValuePlaceholder: settings.renderer.missingValuePlaceholder,
        maxRenderedChars: settings.renderer.maxRenderedChars,
        allowInlineStyles: settings.renderer.allowInlineStyles
      });
      const status = !template.trim() ? "no_template" : result.ok ? "rendered" : "error";
      preview = {
        presetId: presetState.activePreset.id,
        presetName: presetState.activePreset.name,
        snapshotCreatedAt: snapshot.createdAt,
        source,
        status,
        html: result.html,
        textFallback: result.textFallback,
        warnings: result.warnings,
        errors: result.errors
      };
    }
    const updatedDiagnostics = {
      ...diagnostics,
      lastRenderAt: nowIso(),
      lastRenderPresetId: preview.presetId,
      lastRenderPresetName: preview.presetName,
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
    jsonSchema: isRecord6(value.jsonSchema) && !Array.isArray(value.jsonSchema) ? value.jsonSchema : {},
    promptInstructions: typeof value.promptInstructions === "string" ? value.promptInstructions : ""
  };
  if (typeof value.id === "string") draft.id = value.id;
  if (typeof value.htmlTemplate === "string") draft.htmlTemplate = value.htmlTemplate;
  if (typeof value.notes === "string") draft.notes = value.notes;
  if (isRecord6(value.capabilities)) {
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
    message
  }));
}
async function cancelTrackerGeneration(payload, userId) {
  const resolvedChatId = await resolveActiveChatId(payload.chatId, userId).catch((error) => {
    stageError("active_chat", error);
  });
  rememberActiveChat(userId, resolvedChatId);
  const job = activeJobs.get(resolvedChatId);
  if (!job || job.jobId !== payload.jobId) {
    await sendState(resolvedChatId, userId, void 0, null, payload.requestId);
    return;
  }
  job.cancelReason = job.sourceKind === "widget" ? "Widget regeneration was cancelled." : "Tracker generation was cancelled.";
  job.controller.abort();
  await sendState(resolvedChatId, userId, "generating", null, payload.requestId);
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
  if (!CONTEXT_HANDLER_EXPERIMENTAL_ENABLED) {
    spindle.log.warn(CONTEXT_HANDLER_DISABLED_REASON);
    return;
  }
  spindle.log.warn("LTracker context injection stayed disabled because no verified Lumiverse context handler DTO is available.");
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
      if (payload.type === "render_template") {
        await renderTemplatePreview(chatId, userId, payload.requestId, payload.source);
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
