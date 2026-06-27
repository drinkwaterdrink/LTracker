import { DEFAULT_TRACKER_SCHEMA } from "./defaultSchema";
import type {
  TrackerPresetCapabilities,
  TrackerPresetDraft,
  TrackerPresetExportEnvelope,
  TrackerPresetOrigin,
  TrackerSchemaPreset,
} from "./types";

export const DEFAULT_TRACKER_PRESET_ID = "default_scene_tracker";
export const PRESET_EXPORT_KIND = "ltracker_schema_preset";
export const PRESET_EXPORT_FORMAT_VERSION = 1;

export const DEFAULT_PRESET_PROMPT_INSTRUCTIONS = [
  "Fill the tracker from the transcript using the requested schema.",
  "Track current scene state, present characters, relationships, assets, active threads, unresolved continuity, important facts, and next-scene pressure.",
  "Prefer concise values that help future roleplay continuity.",
].join("\n");

export const DEFAULT_TRACKER_PRESET: TrackerSchemaPreset = {
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
    supportsSequentialGeneration: false,
  },
};

export interface PresetValidationResult {
  ok: boolean;
  error: string | null;
}

export interface PresetImportResult {
  ok: boolean;
  preset: TrackerSchemaPreset | null;
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function validOrigin(value: unknown): value is TrackerPresetOrigin {
  return value === "built_in" || value === "user_imported" || value === "user_created";
}

function repairCapabilities(value: unknown): TrackerPresetCapabilities | undefined {
  if (!isRecord(value)) return undefined;
  const result: TrackerPresetCapabilities = {};
  if (typeof value.supportsHtmlTemplate === "boolean") result.supportsHtmlTemplate = value.supportsHtmlTemplate;
  if (typeof value.supportsPartialRegeneration === "boolean") result.supportsPartialRegeneration = value.supportsPartialRegeneration;
  if (typeof value.supportsSequentialGeneration === "boolean") result.supportsSequentialGeneration = value.supportsSequentialGeneration;
  return Object.keys(result).length > 0 ? result : undefined;
}

export function sanitizePresetId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || "preset";
}

export function createPresetId(name: string, existingIds: Iterable<string>): string {
  const existing = new Set(existingIds);
  const base = sanitizePresetId(name);
  if (!existing.has(base) && base !== DEFAULT_TRACKER_PRESET_ID) return base;
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${base}_${index}`;
    if (!existing.has(candidate) && candidate !== DEFAULT_TRACKER_PRESET_ID) return candidate;
  }
  return `${base}_${Date.now()}`;
}

export function validateJsonSchema(value: unknown): PresetValidationResult {
  if (!isRecord(value)) {
    return { ok: false, error: "JSON Schema must be a JSON object." };
  }
  return { ok: true, error: null };
}

export function validateTrackerPreset(value: unknown): PresetValidationResult {
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
  return { ok: true, error: null };
}

export function repairTrackerPreset(value: unknown): TrackerSchemaPreset | null {
  if (!isRecord(value)) return null;
  const origin = validOrigin(value.origin) ? value.origin : null;
  if (!origin) return null;
  const preset: TrackerSchemaPreset = {
    id: sanitizePresetId(stringValue(value.id)),
    name: stringValue(value.name).trim(),
    description: stringValue(value.description),
    version: stringValue(value.version, "1.0"),
    createdAt: stringValue(value.createdAt, new Date().toISOString()),
    updatedAt: stringValue(value.updatedAt, new Date().toISOString()),
    jsonSchema: isRecord(value.jsonSchema) ? value.jsonSchema : {},
    promptInstructions: stringValue(value.promptInstructions),
    origin,
  };
  const htmlTemplate = optionalString(value.htmlTemplate);
  if (htmlTemplate !== undefined) preset.htmlTemplate = htmlTemplate;
  const notes = optionalString(value.notes);
  if (notes !== undefined) preset.notes = notes;
  const capabilities = repairCapabilities(value.capabilities);
  if (capabilities) preset.capabilities = capabilities;
  return validateTrackerPreset(preset).ok ? preset : null;
}

export function draftToPreset(
  draft: TrackerPresetDraft,
  options: {
    id: string;
    origin: Exclude<TrackerPresetOrigin, "built_in">;
    now: string;
    existing?: TrackerSchemaPreset | null;
  },
): TrackerSchemaPreset {
  const preset: TrackerSchemaPreset = {
    id: sanitizePresetId(options.id),
    name: draft.name.trim() || "Untitled Preset",
    description: draft.description,
    version: draft.version.trim() || "1.0",
    createdAt: options.existing?.createdAt ?? options.now,
    updatedAt: options.now,
    jsonSchema: draft.jsonSchema,
    promptInstructions: draft.promptInstructions,
    origin: options.origin,
  };
  if (draft.htmlTemplate !== undefined) preset.htmlTemplate = draft.htmlTemplate;
  if (draft.notes !== undefined) preset.notes = draft.notes;
  if (draft.capabilities) preset.capabilities = draft.capabilities;
  return preset;
}

export function exportTrackerPreset(preset: TrackerSchemaPreset): TrackerPresetExportEnvelope {
  return {
    kind: PRESET_EXPORT_KIND,
    formatVersion: PRESET_EXPORT_FORMAT_VERSION,
    preset,
  };
}

export function importTrackerPresetEnvelope(
  value: unknown,
  existingIds: Iterable<string>,
  now: string,
): PresetImportResult {
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
  const id = existing.has(importedId) || importedId === DEFAULT_TRACKER_PRESET_ID
    ? createPresetId(repaired.name, existing)
    : importedId;
  return {
    ok: true,
    error: null,
    preset: {
      ...repaired,
      id,
      origin: "user_imported",
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function canModifyPreset(preset: TrackerSchemaPreset): boolean {
  return preset.origin !== "built_in";
}

export function resolveSelectedPreset(
  presets: TrackerSchemaPreset[],
  selectedPresetId: string,
): { preset: TrackerSchemaPreset; fallbackReason: string | null } {
  const selected = presets.find((preset) => preset.id === selectedPresetId);
  if (selected) return { preset: selected, fallbackReason: null };
  return {
    preset: DEFAULT_TRACKER_PRESET,
    fallbackReason: `Selected preset ${selectedPresetId} was not found; using Default Scene Tracker.`,
  };
}
