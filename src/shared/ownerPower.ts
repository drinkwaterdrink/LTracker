import type {
  LTrackerOwnerPowerSettings,
  TrackerOwnerPowerManifest,
  TrackerSchemaPreset,
} from "./types";

export interface OwnerPowerScriptExtraction {
  html: string;
  scripts: string[];
  warnings: string[];
}

export interface OwnerPowerFeatureSummary {
  requested: boolean;
  hasScript: boolean;
  scriptChars: number;
  manifest: TrackerOwnerPowerManifest | null;
  warnings: string[];
}

const OWNER_POWER_SCRIPT_TYPE = "application/ltracker-owner-power";
const OWNER_POWER_SCRIPT_PATTERN = /<\s*script\b([^>]*)>([\s\S]*?)<\s*\/\s*script\s*>/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "", maxLength = 200_000): string {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function optionalString(value: unknown, maxLength = 64_000): string | undefined {
  return typeof value === "string" ? value.slice(0, maxLength) : undefined;
}

function boolValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function scriptType(rawAttributes: string): string | null {
  const match = rawAttributes.match(/\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim().toLowerCase() || null;
}

export function extractOwnerPowerScriptsFromHtml(html: string): OwnerPowerScriptExtraction {
  const scripts: string[] = [];
  const warnings: string[] = [];
  const stripped = html.replace(OWNER_POWER_SCRIPT_PATTERN, (_match, rawAttributes: string, body: string) => {
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

export function repairOwnerPowerManifest(value: unknown): TrackerOwnerPowerManifest | undefined {
  if (!isRecord(value)) return undefined;
  const version = typeof value.version === "number" && Number.isFinite(value.version)
    ? Math.max(1, Math.round(value.version))
    : 1;
  const manifest: TrackerOwnerPowerManifest = { version };
  const entry = optionalString(value.entry, 200);
  if (entry) manifest.entry = entry;
  const usesRuntime = boolValue(value.usesRuntime);
  if (usesRuntime !== undefined) manifest.usesRuntime = usesRuntime;
  if (value.requiredMode === "owner_power") manifest.requiredMode = "owner_power";
  if (Array.isArray(value.capabilities)) {
    const capabilities = value.capabilities
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 40);
    if (capabilities.length > 0) manifest.capabilities = capabilities;
  }
  const notes = optionalString(value.notes, 2000);
  if (notes) manifest.notes = notes;
  return manifest;
}

export function ownerPowerRequestedByPreset(preset: Pick<TrackerSchemaPreset, "ownerPowerManifest" | "htmlTemplate">): boolean {
  return preset.ownerPowerManifest?.requiredMode === "owner_power"
    || preset.ownerPowerManifest?.usesRuntime === true
    || /application\/ltracker-owner-power/i.test(preset.htmlTemplate ?? "");
}

export function ownerPowerScriptForPreset(preset: Pick<TrackerSchemaPreset, "ownerPowerScript" | "htmlTemplate">): string {
  const explicit = typeof preset.ownerPowerScript === "string" ? preset.ownerPowerScript.trim() : "";
  if (explicit) return explicit;
  const extracted = extractOwnerPowerScriptsFromHtml(preset.htmlTemplate ?? "");
  return extracted.scripts.join("\n\n").trim();
}

export function ownerPowerFeatureSummary(preset: Pick<TrackerSchemaPreset, "ownerPowerScript" | "ownerPowerManifest" | "htmlTemplate">): OwnerPowerFeatureSummary {
  const extracted = extractOwnerPowerScriptsFromHtml(preset.htmlTemplate ?? "");
  const explicitScript = typeof preset.ownerPowerScript === "string" ? preset.ownerPowerScript : "";
  const scriptChars = explicitScript.length + extracted.scripts.reduce((sum, script) => sum + script.length, 0);
  const hasScript = scriptChars > 0;
  const requested = ownerPowerRequestedByPreset(preset) || hasScript;
  const warnings = [
    ...extracted.warnings,
    hasScript ? "Preset contains Owner Power runtime source; it remains inert until manually enabled." : null,
    requested ? "Preset packs cannot enable Owner Power Mode automatically." : null,
  ].filter((item): item is string => Boolean(item));
  return {
    requested,
    hasScript,
    scriptChars,
    manifest: preset.ownerPowerManifest ?? null,
    warnings,
  };
}

export function stripOwnerPowerRecommendedSettings(value: Record<string, unknown>): { value: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === "ownerPowerMode") {
      warnings.push("Recommended settings that attempted to enable Owner Power Mode were stripped.");
      continue;
    }
    if (key === "renderer" && isRecord(nested)) {
      const renderer: Record<string, unknown> = { ...nested };
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

export function ownerPowerStatusLabel(settings: LTrackerOwnerPowerSettings): string {
  if (!settings.enabled) return "disabled";
  if (settings.allowInstalledPresetRuntime) return "installed runtime allowed";
  if (settings.allowRenderLabRuntime) return "Render Lab only";
  if (settings.allowTemplateActionHooks) return "declarative hooks only";
  return "enabled, no runtime surface allowed";
}

export function ownerPowerReport(input: {
  settings: LTrackerOwnerPowerSettings;
  preset?: Pick<TrackerSchemaPreset, "id" | "name" | "ownerPowerScript" | "ownerPowerManifest" | "htmlTemplate"> | null;
  crashCount?: number;
  disabledReason?: string | null;
  lastError?: string | null;
  lastEvent?: string | null;
}): string {
  const presetSummary = input.preset ? ownerPowerFeatureSummary(input.preset) : null;
  return [
    "LTracker Owner Power Report",
    `Mode: ${ownerPowerStatusLabel(input.settings)}`,
    `Global enabled: ${input.settings.enabled ? "yes" : "no"}`,
    `Render Lab runtime: ${input.settings.allowRenderLabRuntime ? "yes" : "no"}`,
    `Installed preset runtime: ${input.settings.allowInstalledPresetRuntime ? "yes" : "no"}`,
    `Declarative hooks: ${input.settings.allowTemplateActionHooks ? "yes" : "no"}`,
    `Script blocks allowed: ${input.settings.allowScriptBlocks ? "yes" : "no"}`,
    `External URLs: ${input.settings.allowExternalUrls ? "yes" : "no"}`,
    `Network: ${input.settings.allowNetwork ? "yes" : "no"}`,
    `Host DOM access: ${input.settings.allowHostDomAccess ? "yes" : "no"}`,
    `Max script chars: ${input.settings.maxScriptChars}`,
    `Crash threshold: ${input.settings.crashDisableThreshold}`,
    `Crash count: ${input.crashCount ?? 0}`,
    `Disabled reason: ${input.disabledReason ?? "none"}`,
    `Last event: ${input.lastEvent ?? "none"}`,
    `Last error: ${input.lastError ?? "none"}`,
    input.preset ? `Preset: ${input.preset.name} (${input.preset.id})` : "Preset: none",
    presetSummary ? `Preset requested Owner Power: ${presetSummary.requested ? "yes" : "no"}` : null,
    presetSummary ? `Preset has script source: ${presetSummary.hasScript ? "yes" : "no"}` : null,
    presetSummary ? `Preset script chars: ${presetSummary.scriptChars}` : null,
  ].filter((line): line is string => Boolean(line)).join("\n");
}
