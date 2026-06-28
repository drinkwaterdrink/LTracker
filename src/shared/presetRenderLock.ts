import type {
  MessageAttachedSnapshot,
  RenderPresetSource,
  TrackerPresetRenderLock,
  TrackerSchemaPreset,
  TrackerSnapshot,
} from "./types";

const MAX_LOCKED_SCHEMA_CHARS = 50_000;
const MAX_LOCKED_PROMPT_CHARS = 40_000;

export interface SnapshotPresetResolution {
  preset: TrackerSchemaPreset | null;
  source: RenderPresetSource;
  warning: string | null;
  fallbackReason: string | null;
  mismatchDetected: boolean;
  lockedPresetId: string | null;
  lockedPresetName: string | null;
  lockedPresetVersion: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function schemaTitle(schema: Record<string, unknown>): string | null {
  return typeof schema.title === "string" && schema.title.trim() ? schema.title : null;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const parts = Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${parts.join(",")}}`;
}

export function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32-${hash.toString(16).padStart(8, "0")}`;
}

function copyJsonSchema(schema: Record<string, unknown>): Record<string, unknown> | null {
  const text = stableStringify(schema);
  if (text.length > MAX_LOCKED_SCHEMA_CHARS) return null;
  try {
    return JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function capturePresetRenderLock(
  preset: TrackerSchemaPreset,
  capturedAt: string,
): TrackerPresetRenderLock {
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
    capturedAt,
  };
}

export function normalizePresetRenderLock(value: unknown): TrackerPresetRenderLock | null {
  if (!isRecord(value)) return null;
  const schema = isRecord(value.jsonSchema) ? value.jsonSchema : null;
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
    capturedAt: typeof value.capturedAt === "string" ? value.capturedAt : new Date(0).toISOString(),
  };
}

function snapshotFromSource(source: TrackerSnapshot | MessageAttachedSnapshot | null): TrackerSnapshot | null {
  if (!source) return null;
  if ("snapshot" in source) return source.snapshot;
  return source;
}

function attachedMetadata(source: TrackerSnapshot | MessageAttachedSnapshot | null): {
  presetId: string | null;
  presetName: string | null;
  presetVersion: string | null;
} {
  const snapshot = snapshotFromSource(source);
  return {
    presetId: ("snapshot" in (source ?? {}) ? (source as MessageAttachedSnapshot).presetId : null) ?? snapshot?.presetId ?? null,
    presetName: ("snapshot" in (source ?? {}) ? (source as MessageAttachedSnapshot).presetName : null) ?? snapshot?.presetName ?? null,
    presetVersion: ("snapshot" in (source ?? {}) ? (source as MessageAttachedSnapshot).presetVersion : null) ?? snapshot?.presetVersion ?? null,
  };
}

function renderOnlyPresetFromLock(lock: TrackerPresetRenderLock): TrackerSchemaPreset {
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
    origin: "user_imported",
  };
}

function findByNameVersion(
  presets: TrackerSchemaPreset[],
  presetName: string | null,
  presetVersion: string | null,
): TrackerSchemaPreset | null {
  if (!presetName || !presetVersion) return null;
  return presets.find((preset) => preset.name === presetName && preset.version === presetVersion) ?? null;
}

export function resolvePresetForSnapshot(
  source: TrackerSnapshot | MessageAttachedSnapshot | null,
  installedPresets: TrackerSchemaPreset[],
  activePreset: TrackerSchemaPreset,
): SnapshotPresetResolution {
  const snapshot = snapshotFromSource(source);
  const metadata = attachedMetadata(source);
  const lock = normalizePresetRenderLock(snapshot?.presetRenderLock);
  const snapshotHasMetadata = Boolean(metadata.presetId || metadata.presetName || metadata.presetVersion);
  const activeMismatch = (id: string | null) => Boolean(id && id !== activePreset.id);

  if (lock?.htmlTemplate !== null && lock?.htmlTemplate !== undefined) {
    return {
      preset: renderOnlyPresetFromLock(lock),
      source: "snapshot_render_lock",
      warning: null,
      fallbackReason: null,
      mismatchDetected: activeMismatch(lock.presetId),
      lockedPresetId: lock.presetId,
      lockedPresetName: lock.presetName,
      lockedPresetVersion: lock.presetVersion,
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
        lockedPresetVersion: metadata.presetVersion,
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
      lockedPresetVersion: metadata.presetVersion,
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
      lockedPresetVersion: null,
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
    lockedPresetVersion: metadata.presetVersion,
  };
}
