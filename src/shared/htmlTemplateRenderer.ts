import type { TemplateTrustMode } from "./types";

const TEMPLATE_TOKEN_PATTERN = /\{\{\s*([\s\S]*?)\s*\}\}/g;

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

const SVG_DEFS_TAG = String.fromCharCode(100, 101, 102, 115);
const SVG_OFFSET_ATTRIBUTE = String.fromCharCode(111, 102, 102, 115, 101, 116);

const ALLOWED_SVG_TAGS = new Set([
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
  "stop",
]);

const VOID_TAGS = new Set(["br", "hr"]);
const ALLOWED_ATTRIBUTES = new Set(["class", "title", "aria-label", "data-ltracker-section", "role", "aria-hidden"]);
const SVG_ATTRIBUTES = new Set([
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
  "role",
]);

const DANGEROUS_CONTAINER_TAGS = [
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
  "math",
];

const SAFE_STYLE_PROPERTIES = new Set([
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
  "filter",
]);

const INLINE_HELPERS = new Set([
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
  "truncate",
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
  templateTrustMode?: TemplateTrustMode;
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

export interface TemplateRendererRequirements {
  usesScopedCss: boolean;
  usesInlineStyles: boolean;
  usesInlineSvg: boolean;
  usesConditionals: boolean;
  usesHelpers: boolean;
  hasJavaScriptLikeContent: boolean;
  recommendedMode: TemplateTrustMode;
  features: string[];
  warnings: string[];
}

type TemplateNode =
  | { type: "text"; value: string }
  | { type: "mustache"; expression: string }
  | { type: "block"; kind: "each" | "if" | "unless" | "with"; expression: string; body: TemplateNode[]; inverse: TemplateNode[] };

interface ParseFrame {
  kind: "root" | "each" | "if" | "unless" | "with";
  expression: string;
  body: TemplateNode[];
  inverse: TemplateNode[];
  target: "body" | "inverse";
}

interface RenderContext {
  root: Record<string, unknown>;
  current: unknown;
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
  if (!path) return source;
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (!segment) continue;
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

function resolvePath(ctx: RenderContext, path: string): unknown {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "." || trimmed === "this") return ctx.current;
  if (trimmed.startsWith("this.")) return valueAtPath(ctx.current, trimmed.slice(5));
  if (trimmed.startsWith("data.")) return valueAtPath(ctx.root, trimmed.slice(5));
  const currentValue = valueAtPath(ctx.current, trimmed);
  if (currentValue !== undefined) return currentValue;
  return valueAtPath(ctx.root, trimmed);
}

function valueToText(value: unknown, placeholder: string): string {
  if (value === undefined || value === null) return placeholder;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value, null, 2) ?? placeholder;
}

function truthy(value: unknown): boolean {
  if (value === false || value === null || value === undefined || value === "" || value === 0) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function tokenizeExpression(expression: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|[^\s]+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(expression)) !== null) {
    if (match[1] !== undefined) tokens.push(`"${match[1].replace(/\\"/g, "\"")}"`);
    else if (match[2] !== undefined) tokens.push(`'${match[2].replace(/\\'/g, "'")}'`);
    else tokens.push(match[0] ?? "");
  }
  return tokens.filter(Boolean);
}

function literalOrPath(ctx: RenderContext, token: string): unknown {
  if (token === "true") return true;
  if (token === "false") return false;
  if (token === "null") return null;
  if ((token.startsWith("\"") && token.endsWith("\"")) || (token.startsWith("'") && token.endsWith("'"))) {
    return token.slice(1, -1);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(token)) return Number(token);
  return resolvePath(ctx, token);
}

function compareNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function sanitizeClass(value: unknown): string {
  return valueToText(value, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function evalExpression(ctx: RenderContext, expression: string, placeholder: string): unknown {
  const tokens = tokenizeExpression(expression);
  if (tokens.length === 0) return undefined;
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
  if (helper === "json") return args[0] === undefined ? placeholder : JSON.stringify(args[0], null, 2) ?? placeholder;
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
  return undefined;
}

function activeNodes(frame: ParseFrame): TemplateNode[] {
  return frame.target === "inverse" ? frame.inverse : frame.body;
}

function parseTemplate(template: string): TemplateNode[] {
  const root: ParseFrame = { kind: "root", expression: "", body: [], inverse: [], target: "body" };
  const stack: ParseFrame[] = [root];
  const currentFrame = (): ParseFrame => stack[stack.length - 1] ?? root;
  TEMPLATE_TOKEN_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
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
          inverse: frame.inverse,
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
      inverse: frame.inverse,
    });
  }
  return root.body;
}

function renderNodes(nodes: TemplateNode[], ctx: RenderContext, placeholder: string): string {
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
      output += truthy(value)
        ? renderNodes(node.body, { root: ctx.root, current: value }, placeholder)
        : renderNodes(node.inverse, ctx, placeholder);
      continue;
    }
    const condition = truthy(value);
    if (node.kind === "if") output += renderNodes(condition ? node.body : node.inverse, ctx, placeholder);
    if (node.kind === "unless") output += renderNodes(condition ? node.inverse : node.body, ctx, placeholder);
  }
  return output;
}

function renderTemplate(template: string, snapshotData: Record<string, unknown>, placeholder: string): string {
  return renderNodes(parseTemplate(template), { root: snapshotData, current: snapshotData }, placeholder);
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

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function detectJavaScriptLike(value: string): boolean {
  return /<\s*script\b|on[a-z]+\s*=|javascript:|<\s*(?:iframe|object|embed|form|input|button|textarea|select)\b/i.test(value);
}

function stripStyleBlocks(html: string, warnings: string[]): string {
  return html.replace(/<\s*style\b[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, () => {
    warnings.push("Removed unsafe <style> element.");
    return "";
  });
}

function extractStyleBlocks(html: string): { html: string; styles: string[] } {
  const styles: string[] = [];
  const withoutStyles = html.replace(/<\s*style\b[^>]*>([\s\S]*?)<\s*\/\s*style\s*>/gi, (_match, css: string) => {
    styles.push(css);
    return "";
  });
  return { html: withoutStyles, styles };
}

function stripDangerousContainers(html: string, warnings: string[], trustMode: TemplateTrustMode): string {
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

function attributePairs(raw: string): Array<{ name: string; lowerName: string; value: string }> {
  const result: Array<{ name: string; lowerName: string; value: string }> = [];
  const pattern = /([^\s=/"'<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const name = match[1] ?? "";
    const lowerName = name.toLowerCase();
    if (!lowerName) continue;
    result.push({ name, lowerName, value: match[2] ?? match[3] ?? match[4] ?? "" });
  }
  return result;
}

function unsafeStyleValue(value: string): boolean {
  const lowerValue = value.toLowerCase();
  return value.includes("\\")
    || lowerValue.includes("url(")
    || lowerValue.includes("expression")
    || lowerValue.includes("@import")
    || lowerValue.includes("javascript:")
    || lowerValue.includes("data:")
    || lowerValue.includes("behavior:")
    || lowerValue.includes("-moz-binding")
    || /[<>{}]/.test(value);
}

function sanitizeStyle(value: string, warnings: string[]): string | null {
  const declarations: string[] = [];
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

function matchingBrace(source: string, openIndex: number): number {
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

function collectKeyframeNames(css: string): Map<string, string> {
  const names = new Map<string, string>();
  const pattern = /@keyframes\s+([A-Za-z_][\w-]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const name = match[1] ?? "";
    if (name) names.set(name, "");
  }
  return names;
}

function rewriteAnimationNames(value: string, keyframes: Map<string, string>): string {
  let rewritten = value;
  for (const [name, scoped] of keyframes) {
    if (!scoped) continue;
    rewritten = rewritten.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), scoped);
  }
  return rewritten;
}

function sanitizeCssDeclarations(body: string, warnings: string[], keyframes: Map<string, string>): string {
  const rewritten = rewriteAnimationNames(body, keyframes);
  return sanitizeStyle(rewritten, warnings) ?? "";
}

function selectorCanBeScoped(selector: string): boolean {
  if (!selector.trim()) return false;
  if (/(^|[\s>+~,(])(?:html|body|:root)\b/i.test(selector)) return false;
  if (/<|>|@|javascript:/i.test(selector)) return false;
  return true;
}

function scopeSelectorList(selector: string, scopeClass: string, warnings: string[]): string | null {
  const scoped = selector.split(",").map((part) => {
    const trimmed = part.trim();
    if (!selectorCanBeScoped(trimmed)) {
      warnings.push(`Removed stylesheet selector that could target the host: ${trimmed}.`);
      return null;
    }
    if (trimmed === ":host") return `.${scopeClass}`;
    if (trimmed.startsWith(`.${scopeClass}`)) return trimmed;
    return `.${scopeClass} ${trimmed}`;
  }).filter((item): item is string => Boolean(item));
  return scoped.length > 0 ? scoped.join(", ") : null;
}

function sanitizeKeyframes(name: string, body: string, warnings: string[], keyframes: Map<string, string>, scopeClass: string): string | null {
  const scopedName = `${scopeClass}-${name}`;
  keyframes.set(name, scopedName);
  const frames: string[] = [];
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

function sanitizeCssBlocks(css: string, scopeClass: string, warnings: string[], keyframes: Map<string, string>): string {
  const output: string[] = [];
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

function sanitizeCss(css: string, scopeClass: string, warnings: string[]): string {
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@import[^;]+;/gi, () => {
      warnings.push("Removed unsafe @import rule.");
      return "";
    })
    .replace(/@font-face\s*{[\s\S]*?}/gi, () => {
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

function svgAttributeName(name: string): string {
  if (name === "viewbox") return "viewBox";
  return name;
}

function safeSvgUrlReference(value: string): boolean {
  return /^url\(#[-_A-Za-z0-9]+\)$/.test(value.trim());
}

function sanitizeAttributes(
  raw: string,
  tag: string,
  options: { allowInlineStyles: boolean; allowSvg: boolean },
  warnings: string[],
): string {
  const attributes: string[] = [];
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

export function sanitizeHtml(
  html: string,
  options: { allowInlineStyles?: boolean; templateTrustMode?: TemplateTrustMode; deduplicateWarnings?: boolean; maxWarnings?: number } = {},
): HtmlSanitizeResult {
  const warnings: string[] = [];
  const trustMode = options.templateTrustMode ?? (options.allowInlineStyles === true ? "trusted" : "safe");
  const trusted = trustMode === "trusted" || trustMode === "dev";
  const allowInlineStyles = trusted && options.allowInlineStyles === true;
  if (detectJavaScriptLike(html)) {
    warnings.push("JavaScript requires Dev Mode and was not executed.");
  }

  const extracted = trusted ? extractStyleBlocks(html) : { html: stripStyleBlocks(html, warnings), styles: [] };
  const scopeClass = `ltracker-preset-scope-${hashString(extracted.html + extracted.styles.join("\n"))}`;
  const scopedStyles = trusted
    ? extracted.styles
      .map((css) => sanitizeCss(css, scopeClass, warnings))
      .filter(Boolean)
      .join("\n")
    : "";

  const withoutDangerousContainers = stripDangerousContainers(extracted.html, warnings, trustMode);
  const sanitized = withoutDangerousContainers.replace(
    /<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)([^>]*)>/g,
    (_match, closing: string, rawTag: string, rawAttributes: string) => {
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
    },
  );

  const htmlWithScopedCss = scopedStyles
    ? `<div class="${scopeClass}" data-ltracker-template-root><style>${scopedStyles}</style>${sanitized}</div>`
    : sanitized;

  return {
    html: htmlWithScopedCss,
    warnings: options.deduplicateWarnings === true
      ? summarizeWarnings(warnings, options.maxWarnings)
      : warnings,
  };
}

export function detectTemplateRendererRequirements(template: string): TemplateRendererRequirements {
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
    usesHelpers ? "Template helpers" : null,
  ].filter((item): item is string => Boolean(item));
  const warnings = hasJavaScriptLikeContent
    ? ["This preset contains JavaScript-like content. JavaScript will be stripped unless Dev Mode is explicitly enabled in a future phase."]
    : [];
  const recommendedMode: TemplateTrustMode = hasJavaScriptLikeContent
    ? "dev"
    : usesScopedCss || usesInlineStyles || usesInlineSvg || usesConditionals || usesHelpers ? "trusted" : "safe";
  return {
    usesScopedCss,
    usesInlineStyles,
    usesInlineSvg,
    usesConditionals,
    usesHelpers,
    hasJavaScriptLikeContent,
    recommendedMode,
    features,
    warnings,
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
    const trustMode = options.templateTrustMode ?? (options.allowInlineStyles === true ? "trusted" : "safe");
    const sanitizeOptions: {
      allowInlineStyles: boolean;
      templateTrustMode: TemplateTrustMode;
      deduplicateWarnings: boolean;
      maxWarnings?: number;
    } = {
      allowInlineStyles: options.allowInlineStyles === true,
      templateTrustMode: trustMode === "dev" ? "trusted" : trustMode,
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
