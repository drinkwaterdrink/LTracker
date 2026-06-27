const TEMPLATE_PATH = "[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*";
const EACH_BLOCK_PATTERN = new RegExp(`{{#each\\s+(${TEMPLATE_PATH})\\s*}}([\\s\\S]*?){{/each}}`, "g");
const JSON_HELPER_PATTERN = new RegExp(`{{\\s*json\\s+(${TEMPLATE_PATH})\\s*}}`, "g");
const VALUE_PATTERN = new RegExp(`{{\\s*(${TEMPLATE_PATH})\\s*}}`, "g");

const ALLOWED_TAGS = new Set([
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
  "pre",
]);

const VOID_TAGS = new Set(["br", "hr"]);
const ALLOWED_ATTRIBUTES = new Set(["class", "title", "aria-label", "data-ltracker-section"]);
const DANGEROUS_TAGS = [
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
  "math",
];
const SAFE_STYLE_PROPERTIES = new Set([
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
  "opacity",
]);

export interface HtmlTemplateRenderInput {
  template: string;
  snapshotData: Record<string, unknown>;
  presetId: string;
  presetName: string;
}

export interface HtmlTemplateRenderOptions {
  missingValuePlaceholder?: string;
  maxRenderedChars?: number;
  allowInlineStyles?: boolean;
  deduplicateWarnings?: boolean;
  maxWarnings?: number;
}

export interface HtmlTemplateRenderResult {
  ok: boolean;
  html: string;
  textFallback: string;
  errors: string[];
  warnings: string[];
  usedFallback: boolean;
}

export interface HtmlSanitizeResult {
  html: string;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateSafe(value: string, maxChars: number): { value: string; truncated: boolean } {
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

function valueAtPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
    } else if (isRecord(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function valueToText(value: unknown, placeholder: string): string {
  if (value === undefined || value === null) return placeholder;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value, null, 2) ?? placeholder;
}

function renderTemplateFragment(
  template: string,
  root: Record<string, unknown>,
  current: unknown,
  placeholder: string,
): string {
  const withJson = template.replace(JSON_HELPER_PATTERN, (_match, path: string) => {
    const value = valueAtPath(current, path) ?? valueAtPath(root, path);
    const text = value === undefined ? placeholder : JSON.stringify(value, null, 2) ?? placeholder;
    return escapeHtml(text);
  });

  return withJson.replace(VALUE_PATTERN, (_match, path: string) => {
    const value = valueAtPath(current, path) ?? valueAtPath(root, path);
    return escapeHtml(valueToText(value, placeholder));
  });
}

function renderTemplate(template: string, snapshotData: Record<string, unknown>, placeholder: string): string {
  const expandedLoops = template.replace(EACH_BLOCK_PATTERN, (_match, path: string, body: string) => {
    const value = valueAtPath(snapshotData, path);
    if (!Array.isArray(value)) return "";
    return value.map((item) => renderTemplateFragment(body, snapshotData, item, placeholder)).join("");
  });
  return renderTemplateFragment(expandedLoops, snapshotData, snapshotData, placeholder);
}

function primitiveToString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

function recordSummary(value: Record<string, unknown>): string | null {
  const preferred = ["name", "title", "status", "role", "emotional_state", "physical_state", "current_goal"];
  const direct = preferred
    .map((key) => primitiveToString(value[key]))
    .filter((item): item is string => Boolean(item));
  if (direct.length > 0) return direct.join(" - ");

  const fragments = Object.entries(value)
    .map(([key, entry]) => {
      const rendered = primitiveToString(entry);
      return rendered ? `${key}: ${rendered}` : null;
    })
    .filter((item): item is string => Boolean(item));
  return fragments.length > 0 ? fragments.slice(0, 4).join("; ") : null;
}

function listFromUnknown(value: unknown): string[] {
  const primitive = primitiveToString(value);
  if (primitive) return [primitive];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const rendered = primitiveToString(item);
        if (rendered) return rendered;
        return isRecord(item) ? recordSummary(item) : null;
      })
      .filter((item): item is string => Boolean(item));
  }
  if (isRecord(value)) {
    const summary = recordSummary(value);
    return summary ? [summary] : [];
  }
  return [];
}

function stringAt(data: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = data;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return primitiveToString(current);
}

export function formatTemplateTextFallback(data: Record<string, unknown>): string {
  const lines: string[] = [];
  const scene = [
    stringAt(data, ["scene", "location"]),
    stringAt(data, ["scene", "date"]) ?? stringAt(data, ["scene", "time"]),
    stringAt(data, ["scene", "mood"]),
  ].filter((item): item is string => Boolean(item));
  if (scene.length > 0) lines.push(`Scene: ${scene.join(", ")}`);

  const present = listFromUnknown(data.characters_present)
    .map((item) => item.split(" - ")[0]?.trim() ?? item.trim())
    .filter(Boolean);
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
  const fragments = Object.entries(data)
    .map(([key, value]) => {
      const list = listFromUnknown(value);
      return list.length > 0 ? `${key}: ${list.slice(0, 3).join("; ")}` : null;
    })
    .filter((item): item is string => Boolean(item));
  return fragments.length > 0 ? fragments.slice(0, 8).join("\n") : "No tracker fields are available.";
}

function stripDangerousContainers(html: string, warnings: string[]): string {
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

function attributePairs(raw: string): Array<{ name: string; value: string }> {
  const result: Array<{ name: string; value: string }> = [];
  const pattern = /([^\s=/"'<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const name = (match[1] ?? "").toLowerCase();
    if (!name) continue;
    result.push({ name, value: match[2] ?? match[3] ?? match[4] ?? "" });
  }
  return result;
}

function sanitizeStyle(value: string, warnings: string[]): string | null {
  const declarations: string[] = [];
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
    if (
      lowerValue.includes("url(")
      || lowerValue.includes("expression")
      || lowerValue.includes("@import")
      || lowerValue.includes("javascript:")
      || lowerValue.includes("behavior:")
      || lowerValue.includes("-moz-binding")
      || /[<>{}]/.test(rawValue)
    ) {
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

export function summarizeWarnings(warnings: string[], maxWarnings = 20): string[] {
  const counts = new Map<string, number>();
  for (const warning of warnings) {
    counts.set(warning, (counts.get(warning) ?? 0) + 1);
  }
  const summarized = [...counts.entries()].map(([warning, count]) => count > 1 ? `${warning} x ${count}` : warning);
  if (summarized.length <= maxWarnings) return summarized;
  return [
    ...summarized.slice(0, Math.max(0, maxWarnings)),
    `${summarized.length - maxWarnings} more render warnings hidden.`,
  ];
}

function sanitizeAttributes(raw: string, tag: string, allowInlineStyles: boolean, warnings: string[]): string {
  const attributes: string[] = [];
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

export function sanitizeHtml(
  html: string,
  options: { allowInlineStyles?: boolean; deduplicateWarnings?: boolean; maxWarnings?: number } = {},
): HtmlSanitizeResult {
  const warnings: string[] = [];
  const withoutDangerousContainers = stripDangerousContainers(html, warnings);
  const sanitized = withoutDangerousContainers.replace(
    /<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)([^>]*)>/g,
    (_match, closing: string, rawTag: string, rawAttributes: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        warnings.push(`Removed unsupported <${tag}> tag.`);
        return "";
      }
      if (closing) return `</${tag}>`;
      if (VOID_TAGS.has(tag)) return `<${tag}>`;
      return `<${tag}${sanitizeAttributes(rawAttributes, tag, options.allowInlineStyles === true, warnings)}>`;
    },
  );
  return {
    html: sanitized,
    warnings: options.deduplicateWarnings === true
      ? summarizeWarnings(warnings, options.maxWarnings)
      : warnings,
  };
}

export function renderHtmlTemplate(
  input: HtmlTemplateRenderInput,
  options: HtmlTemplateRenderOptions = {},
): HtmlTemplateRenderResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const placeholder = options.missingValuePlaceholder ?? "";
  const maxRenderedChars = Math.max(1, options.maxRenderedChars ?? 50_000);
  const textFallback = formatTemplateTextFallback(input.snapshotData);

  try {
    if (!input.template.trim()) {
      return {
        ok: true,
        html: "",
        textFallback,
        errors,
        warnings: ["No HTML template is stored for this preset; using the text fallback."],
        usedFallback: true,
      };
    }

    const rendered = renderTemplate(input.template, input.snapshotData, placeholder);
    const sanitizeOptions: {
      allowInlineStyles: boolean;
      deduplicateWarnings: boolean;
      maxWarnings?: number;
    } = {
      allowInlineStyles: options.allowInlineStyles === true,
      deduplicateWarnings: options.deduplicateWarnings === true,
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
      usedFallback: false,
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
      usedFallback: true,
    };
  }
}
