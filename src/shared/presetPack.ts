import type {
  LTrackerSettings,
  LTrackerSampleSnapshotMode,
  TrackerPresetDraft,
  TrackerSchemaPreset,
  TrackerPresetOrigin,
} from "./types";
import { EXTENSION_VERSION } from "./types";
import {
  sanitizePresetId,
  createPresetId,
  DEFAULT_TRACKER_PRESET_ID,
  repairTrackerPreset,
  importTrackerPresetEnvelope,
  PRESET_EXPORT_KIND,
  PRESET_EXPORT_FORMAT_VERSION,
  estimatePresetStats,
} from "./presets";
import {
  detectTemplateRendererRequirements,
  renderHtmlTemplate,
  type TemplateRendererRequirements,
  type HtmlTemplateRenderResult,
} from "./htmlTemplateRenderer";

// ---------------------------------------------------------------------------
// Pack format constants
// ---------------------------------------------------------------------------

export const PRESET_PACK_KIND = "ltracker_preset_pack" as const;
export const PRESET_PACK_FORMAT_VERSION = 1;

// ---------------------------------------------------------------------------
// Pack envelope types
// ---------------------------------------------------------------------------

export interface LTrackerPresetPackV1 {
  kind: typeof PRESET_PACK_KIND;
  formatVersion: typeof PRESET_PACK_FORMAT_VERSION;
  exportedAt: string;
  exportedBy?: string;
  appCompatibility: {
    extension: "LTracker";
    minVersion: string;
    recommendedVersion: string;
  };
  preset: {
    id?: string;
    name: string;
    description?: string;
    version: string;
    jsonSchema: Record<string, unknown>;
    htmlTemplate: string;
    promptInstructions: string;
    notes?: string;
    tags?: string[];
    origin?: string;
    author?: string;
  };
  recommendedSettings?: PackRecommendedSettings;
  exampleSnapshot?: Record<string, unknown>;
  validation?: {
    expectedRootFields?: string[];
    estimatedTokens?: number;
    estimatedRenderedChars?: number;
  };
}

export interface PackRecommendedSettings {
  connection?: Partial<LTrackerSettings["connection"]>;
  memory?: Partial<LTrackerSettings["memory"]>;
  injection?: Partial<LTrackerSettings["injection"]>;
  messageDisplay?: Partial<LTrackerSettings["messageDisplay"]>;
  renderer?: Partial<LTrackerSettings["renderer"]>;
  expandedWidth?: Partial<LTrackerSettings["expandedWidth"]>;
  budget?: Partial<LTrackerSettings["budget"]>;
}

// ---------------------------------------------------------------------------
// Validation report types
// ---------------------------------------------------------------------------

export type ValidationSeverity = "error" | "warning" | "info" | "pass";

export interface ValidationEntry {
  severity: ValidationSeverity;
  category: string;
  message: string;
}

export interface PresetValidationReport {
  ok: boolean;
  entries: ValidationEntry[];
  errorCount: number;
  warningCount: number;
  passCount: number;
  estimatedPromptTokens: number;
  estimatedRenderedChars: number;
  estimatedPackSizeChars: number;
  missingPlaceholders: string[];
  unusedSchemaFields: string[];
  rawObjectInterpolationPaths: string[];
  rawArrayInterpolationPaths: string[];
  mobileRiskWarnings: string[];
  verticalTextRiskWarnings: string[];
  sanitizerWarningGroups: string[];
  rendererRequirements: TemplateRendererRequirements;
  sampleRenderResult: HtmlTemplateRenderResult | null;
}

// ---------------------------------------------------------------------------
// Import result types
// ---------------------------------------------------------------------------

export interface PresetPackImportResult {
  ok: boolean;
  preset: TrackerSchemaPreset | null;
  recommendedSettings: PackRecommendedSettings | null;
  exampleSnapshot: Record<string, unknown> | null;
  error: string | null;
  warnings: string[];
  packMeta: {
    kind: string;
    formatVersion: number;
    exportedAt: string | null;
    minVersion: string | null;
    recommendedVersion: string | null;
    tags: string[];
    author: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

const REAL_CREDENTIAL_KEY_NAMES = new Set([
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
  "accesskey",
]);

function credentialKeyName(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isRealCredentialKey(key: string): boolean {
  return REAL_CREDENTIAL_KEY_NAMES.has(credentialKeyName(key));
}

function stripRecommendedSettingCredentials(
  obj: Record<string, unknown>,
  path: string,
  strippedPaths: string[],
  depth = 0,
): Record<string, unknown> {
  if (depth > 10) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const nextPath = `${path}.${key}`;
    if (isRealCredentialKey(key)) {
      strippedPaths.push(nextPath);
      continue;
    }
    if (isRecord(value)) {
      result[key] = stripRecommendedSettingCredentials(value, nextPath, strippedPaths, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportPresetPack(
  preset: TrackerSchemaPreset,
  options?: {
    includeRecommendedSettings?: boolean;
    settings?: LTrackerSettings;
    exampleSnapshot?: Record<string, unknown>;
    author?: string;
  },
): LTrackerPresetPackV1 {
  const presetStats = estimatePresetStats(preset);
  const schemaKeys = isRecord(preset.jsonSchema)
    ? Object.keys(preset.jsonSchema)
    : [];

  const pack: LTrackerPresetPackV1 = {
    kind: PRESET_PACK_KIND,
    formatVersion: PRESET_PACK_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appCompatibility: {
      extension: "LTracker",
      minVersion: "0.17",
      recommendedVersion: EXTENSION_VERSION,
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
      origin: preset.origin,
    },
    validation: {
      expectedRootFields: schemaKeys,
      estimatedTokens: presetStats.estimatedTokens,
      estimatedRenderedChars: presetStats.estimatedRenderedChars,
    },
  };

  if (options?.author) {
    pack.exportedBy = options.author;
    pack.preset.author = options.author;
  }

  if (options?.includeRecommendedSettings && options.settings) {
    const settings = options.settings;
    const recommended: PackRecommendedSettings = {};
    const connRec: Partial<LTrackerSettings["connection"]> = {
      mode: settings.connection.mode,
      parameters: { ...settings.connection.parameters },
      reasoning: { ...settings.connection.reasoning },
    };
    // Strip connection secrets — never include IDs or names that might leak
    recommended.connection = connRec;
    recommended.memory = {
      enabled: settings.memory.enabled,
      includeInTrackerGeneration: settings.memory.includeInTrackerGeneration,
      retainCount: settings.memory.retainCount,
      fullSnapshotCount: settings.memory.fullSnapshotCount,
      compactOlderSnapshots: settings.memory.compactOlderSnapshots,
      maxMemoryChars: settings.memory.maxMemoryChars,
      source: settings.memory.source,
      order: settings.memory.order,
    };
    recommended.injection = {
      enabled: settings.injection.enabled,
      format: settings.injection.format,
      retainCount: settings.injection.retainCount,
      injectionPlacement: settings.injection.injectionPlacement,
      maxInjectedChars: settings.injection.maxInjectedChars,
    };
    recommended.renderer = {
      enabled: settings.renderer.enabled,
      previewSource: settings.renderer.previewSource,
      maxRenderedChars: settings.renderer.maxRenderedChars,
      allowInlineStyles: settings.renderer.allowInlineStyles,
      templateTrustMode: settings.renderer.templateTrustMode,
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
      maxRenderedChars: settings.messageDisplay.maxRenderedChars,
    };
    recommended.expandedWidth = {
      expandedWidthMode: settings.expandedWidth.expandedWidthMode,
      maxExpandedWidthPx: settings.expandedWidth.maxExpandedWidthPx,
      mobileHorizontalMarginPx: settings.expandedWidth.mobileHorizontalMarginPx,
      expandedContentMaxHeightVh: settings.expandedWidth.expandedContentMaxHeightVh,
    };
    recommended.budget = {
      mode: settings.budget.mode,
      ultraModeEnabled: settings.budget.ultraModeEnabled,
      maxTrackerOutputTokens: settings.budget.maxTrackerOutputTokens,
      renderedHtmlMaxChars: settings.budget.renderedHtmlMaxChars,
    };
    pack.recommendedSettings = recommended;
  }

  if (options?.exampleSnapshot && isRecord(options.exampleSnapshot)) {
    pack.exampleSnapshot = options.exampleSnapshot;
  }

  return pack;
}

// ---------------------------------------------------------------------------
// Import (supports pack, old envelope, raw preset)
// ---------------------------------------------------------------------------

function validatePackRecommendedSettings(value: unknown): { settings: PackRecommendedSettings | null; warnings: string[] } {
  if (!isRecord(value)) return { settings: null, warnings: [] };
  const result: PackRecommendedSettings = {};
  const strippedPaths: string[] = [];
  if (isRecord(value.connection)) {
    result.connection = stripRecommendedSettingCredentials(
      value.connection,
      "recommendedSettings.connection",
      strippedPaths,
    ) as Partial<LTrackerSettings["connection"]>;
  }
  if (isRecord(value.memory)) result.memory = value.memory as Partial<LTrackerSettings["memory"]>;
  if (isRecord(value.injection)) result.injection = value.injection as Partial<LTrackerSettings["injection"]>;
  if (isRecord(value.renderer)) result.renderer = value.renderer as Partial<LTrackerSettings["renderer"]>;
  if (isRecord(value.messageDisplay)) result.messageDisplay = value.messageDisplay as Partial<LTrackerSettings["messageDisplay"]>;
  if (isRecord(value.expandedWidth)) result.expandedWidth = value.expandedWidth as Partial<LTrackerSettings["expandedWidth"]>;
  if (isRecord(value.budget)) result.budget = value.budget as Partial<LTrackerSettings["budget"]>;
  for (const [key, nestedValue] of Object.entries(value)) {
    if (
      key !== "connection"
      && key !== "memory"
      && key !== "injection"
      && key !== "renderer"
      && key !== "messageDisplay"
      && key !== "expandedWidth"
      && key !== "budget"
      && isRecord(nestedValue)
    ) {
      stripRecommendedSettingCredentials(nestedValue, `recommendedSettings.${key}`, strippedPaths);
    }
  }
  const warnings = strippedPaths.map((path) => `Removed credential-like recommended setting field: ${path}`);
  return { settings: Object.keys(result).length > 0 ? result : null, warnings };
}

export function importPresetPack(
  value: unknown,
  existingIds: Iterable<string>,
  now: string,
): PresetPackImportResult {
  if (!isRecord(value)) {
    return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Import must be a JSON object.", warnings: [], packMeta: null };
  }

  // ---- Try new ltracker_preset_pack format ----
  if (value.kind === PRESET_PACK_KIND) {
    if (value.formatVersion !== PRESET_PACK_FORMAT_VERSION) {
      return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: `Unsupported preset pack format version: ${value.formatVersion}. Expected ${PRESET_PACK_FORMAT_VERSION}.`, warnings: [], packMeta: null };
    }

    const presetData = isRecord(value.preset) ? value.preset : null;
    if (!presetData) {
      return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Import preset data is missing or invalid.", warnings: [], packMeta: null };
    }

    const compat = isRecord(value.appCompatibility) ? value.appCompatibility : null;
    const warnings: string[] = [];

    // Build a TrackerSchemaPreset from pack data
    const existing = new Set(existingIds);
    const rawId = sanitizePresetId(stringValue(presetData.id, stringValue(presetData.name, "imported")));
    const id = existing.has(rawId) || rawId === DEFAULT_TRACKER_PRESET_ID
      ? createPresetId(stringValue(presetData.name, "Imported Preset"), existing)
      : rawId;

    const preset: TrackerSchemaPreset = {
      id,
      name: stringValue(presetData.name, "Imported Preset").trim() || "Imported Preset",
      description: stringValue(presetData.description),
      version: stringValue(presetData.version, "1.0"),
      createdAt: now,
      updatedAt: now,
      jsonSchema: isRecord(presetData.jsonSchema) ? presetData.jsonSchema : {},
      promptInstructions: stringValue(presetData.promptInstructions),
      htmlTemplate: typeof presetData.htmlTemplate === "string" ? presetData.htmlTemplate : "",
      notes: typeof presetData.notes === "string" ? presetData.notes : "",
      origin: "user_imported" as TrackerPresetOrigin,
      capabilities: {
        supportsHtmlTemplate: typeof presetData.htmlTemplate === "string" && presetData.htmlTemplate.trim().length > 0,
      },
    };

    // Validate minimum requirements
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
    const exampleSnapshot = isRecord(value.exampleSnapshot) ? value.exampleSnapshot as Record<string, unknown> : null;

    const tags = Array.isArray(presetData.tags)
      ? presetData.tags.filter((t: unknown): t is string => typeof t === "string")
      : [];

    const packMeta = {
      kind: PRESET_PACK_KIND,
      formatVersion: PRESET_PACK_FORMAT_VERSION,
      exportedAt: stringValue(value.exportedAt, ""),
      minVersion: compat ? stringValue(compat.minVersion) : null,
      recommendedVersion: compat ? stringValue(compat.recommendedVersion) : null,
      tags,
      author: stringValue(value.exportedBy) || stringValue(presetData.author) || null,
    };

    return { ok: true, preset, recommendedSettings, exampleSnapshot, error: null, warnings, packMeta };
  }

  // ---- Try old ltracker_schema_preset format ----
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
      packMeta: { kind: PRESET_EXPORT_KIND, formatVersion: PRESET_EXPORT_FORMAT_VERSION, exportedAt: null, minVersion: null, recommendedVersion: null, tags: [], author: null },
    };
  }

  // ---- Try raw preset object (has jsonSchema and promptInstructions) ----
  if (isRecord(value) && isRecord(value.jsonSchema) && typeof value.promptInstructions === "string") {
    const repaired = repairTrackerPreset({
      ...value,
      origin: value.origin ?? "user_imported",
      id: value.id ?? sanitizePresetId(stringValue(value.name, "imported")),
    });
    if (!repaired) {
      return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Raw preset object could not be repaired.", warnings: [], packMeta: null };
    }
    const existing = new Set(existingIds);
    const id = existing.has(repaired.id) || repaired.id === DEFAULT_TRACKER_PRESET_ID
      ? createPresetId(repaired.name, existing)
      : repaired.id;
    return {
      ok: true,
      preset: { ...repaired, id, origin: "user_imported", createdAt: now, updatedAt: now },
      recommendedSettings: null,
      exampleSnapshot: null,
      error: null,
      warnings: ["Imported as raw preset object (no pack envelope)."],
      packMeta: null,
    };
  }

  return { ok: false, preset: null, recommendedSettings: null, exampleSnapshot: null, error: "Unrecognized import format. Expected ltracker_preset_pack, ltracker_schema_preset, or a raw preset object with jsonSchema and promptInstructions.", warnings: [], packMeta: null };
}

// ---------------------------------------------------------------------------
// Sample Snapshot Generator
// ---------------------------------------------------------------------------

const SAMPLE_MAX_DEPTH = 5;
const SAMPLE_MAX_ARRAY_LENGTH = 2;

const FIELD_HEURISTICS: Array<[RegExp, () => unknown]> = [
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
  [/^id$/i, () => "sample-001"],
];

function sampleValueForField(fieldName: string, depth: number): unknown {
  for (const [pattern, generator] of FIELD_HEURISTICS) {
    if (pattern.test(fieldName)) return generator();
  }
  // Generic fallbacks based on common naming
  if (fieldName.endsWith("s") && depth < SAMPLE_MAX_DEPTH) {
    // Plural → likely an array, but the schema should determine this
    return `Example ${fieldName}`;
  }
  return `Example ${fieldName.replace(/[-_]/g, " ")}`;
}

function generateSampleFromSchema(schema: unknown, depth = 0): unknown {
  if (depth > SAMPLE_MAX_DEPTH) return "[max depth]";

  if (!isRecord(schema)) {
    return "sample value";
  }

  const schemaType = stringValue(schema.type, "object");

  if (schemaType === "object" || (schema.properties && isRecord(schema.properties))) {
    const properties = isRecord(schema.properties) ? schema.properties : schema;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (key === "type" || key === "properties" || key === "required" || key === "description" || key === "items" || key === "default" || key === "enum") continue;
      if (isRecord(value)) {
        // This is a typed property with { type, ... }
        result[key] = generateSampleForProperty(key, value, depth + 1);
      } else {
        // Simple field at top level (schema is just a flat object with field names)
        result[key] = sampleValueForField(key, depth);
      }
    }
    // If the schema IS a flat object of field keys (like LTracker presets typically are),
    // treat every key as a field name
    if (Object.keys(result).length === 0 && !schema.properties) {
      for (const key of Object.keys(schema)) {
        if (isRecord(schema[key])) {
          result[key] = generateSampleFromSchema(schema[key], depth + 1);
        } else {
          result[key] = sampleValueForField(key, depth);
        }
      }
    }
    return result;
  }

  if (schemaType === "array") {
    const items = isRecord(schema.items) ? schema.items : null;
    const sample = items ? generateSampleFromSchema(items, depth + 1) : "sample item";
    return Array.from({ length: Math.min(SAMPLE_MAX_ARRAY_LENGTH, 2) }, () =>
      isRecord(sample) ? { ...sample } : sample
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

function generateSampleForProperty(fieldName: string, prop: Record<string, unknown>, depth: number): unknown {
  if (depth > SAMPLE_MAX_DEPTH) return "[max depth]";

  if (typeof prop.default !== "undefined") return prop.default;
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0];

  const propType = stringValue(prop.type, "");

  if (propType === "object" || isRecord(prop.properties)) {
    return generateSampleFromSchema(prop, depth);
  }
  if (propType === "array") {
    const items = isRecord(prop.items) ? prop.items : null;
    const itemSample = items
      ? generateSampleFromSchema(items, depth + 1)
      : sampleValueForField(fieldName, depth);
    return Array.from({ length: SAMPLE_MAX_ARRAY_LENGTH }, () =>
      isRecord(itemSample) ? { ...itemSample } : itemSample
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

function trackerStressData(mode: LTrackerSampleSnapshotMode): Record<string, unknown> {
  const longWord = "HyperAdministrativelyOverInstrumentalizedContinuityCheckpoint";
  const commonCast = [
    {
      name: "Cecelia Voss",
      role: "Political liaison",
      desc: "Composed, watchful, and tracking every private reaction in the room.",
      rel: [
        { t: "Liaison", c: "Cecelia Voss" },
        { t: "Trust", c: "Cautious but rising" },
      ],
      pockets: [
        { t: "cigarettes", c: "right hand" },
        { t: "folded writ", c: "inside coat" },
      ],
    },
    {
      name: mode === "mobile_torture" ? `Maximilian-${longWord}` : "Mara Ell",
      role: "Witness",
      desc: mode === "mobile_torture"
        ? `A long visual description with ${longWord} and several clauses that should reveal cramped mobile layouts.`
        : "Nervous but attentive, with one unresolved answer still hidden.",
      rel: [
        { t: mode === "mobile_torture" ? `LongRelationLabel-${longWord}` : "Pressure", c: "Knows more than she admits" },
      ],
      pockets: [
        { t: mode === "mobile_torture" ? `Pocket-${longWord}` : "silver key", c: "left pocket" },
      ],
    },
  ];
  const worldItems = [
    { t: "storm lantern", c: "low oil" },
    { t: "sealed contract", c: "unsigned" },
    { t: "weather", c: "rain pressing against the windows" },
  ];
  const base: Record<string, unknown> = {
    time: { clock: "23:18", day: "Thursday", pressure: 72 },
    loc: {
      name: mode === "mobile_torture" ? `Northwestern-${longWord}-Observation Balcony` : "North Gallery",
      weather: "Hard rain, amber lamps, glass fogging at the edges.",
    },
    scene: {
      location: mode === "mobile_torture" ? `Northwestern-${longWord}-Observation Balcony` : "North Gallery",
      time: "late night",
      mood: "charged but contained",
      alert: mode === "mobile_torture"
        ? `Very long alert: ${longWord} ${longWord} ${longWord}.`
        : "A promised answer is overdue.",
    },
    cast: commonCast,
    rel: commonCast[0]?.rel ?? [],
    relations: commonCast[0]?.rel ?? [],
    pockets: commonCast[0]?.pockets ?? [],
    world: {
      items: worldItems,
      alerts: [
        { t: "Door", c: "Unlocked from the wrong side" },
        { t: "Ledger", c: "Missing final page" },
      ],
    },
    meters: {
      danger: 63,
      intimacy: 41,
      suspicion: 78,
    },
    notes: [
      "One optional field is intentionally absent in some samples.",
      mode === "mobile_torture" ? `Long unbroken token ${longWord}${longWord}` : "Use this to test wrapping.",
    ],
    empty_list: [],
    missing_optional_demo: null,
  };
  if (mode === "minimal") {
    return {
      time: { clock: "09:00" },
      loc: { name: "Small room" },
      scene: { location: "Small room", time: "morning" },
      cast: [commonCast[0]],
      rel: [],
      pockets: [],
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
          pockets: [{ t: "brass whistle", c: "belt" }],
        },
        {
          name: "Oren Pike",
          role: "Messenger",
          desc: "Carrying a letter he has not read.",
          rel: [{ t: "Risk", c: "May bolt if pressed" }],
          pockets: [{ t: "sealed letter", c: "satchel" }],
        },
      ],
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
          { t: "ledger ink", c: "fresh" },
        ],
        factions: [
          { t: "Wardens", c: "watching" },
          { t: "Archivists", c: "withholding records" },
        ],
      },
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
            { t: "Fear", c: "The map names him" },
          ],
          pockets: [
            { t: "map tube", c: "under arm" },
            { t: "burnt match", c: "waistcoat" },
          ],
        },
      ],
    };
  }
  return base;
}

function mergeSampleModeData(base: Record<string, unknown>, mode: LTrackerSampleSnapshotMode): Record<string, unknown> {
  const modeData = trackerStressData(mode);
  if (mode === "normal") {
    return {
      ...modeData,
      ...base,
      cast: Array.isArray(base.cast) ? base.cast : modeData.cast,
      rel: Array.isArray(base.rel) ? base.rel : modeData.rel,
      relations: Array.isArray(base.relations) ? base.relations : modeData.relations,
      pockets: Array.isArray(base.pockets) ? base.pockets : modeData.pockets,
      world: isRecord(base.world) ? { ...(modeData.world as Record<string, unknown>), ...base.world } : modeData.world,
    };
  }
  return {
    ...base,
    ...modeData,
    world: isRecord(base.world) && isRecord(modeData.world) ? { ...base.world, ...modeData.world } : modeData.world,
  };
}

export function generateSampleSnapshot(
  jsonSchema: Record<string, unknown>,
  mode: LTrackerSampleSnapshotMode = "normal",
): Record<string, unknown> {
  const result = generateSampleFromSchema(jsonSchema, 0);
  const base = isRecord(result) ? result : { data: result };
  return mergeSampleModeData(base, mode);
}

// ---------------------------------------------------------------------------
// Validation Report
// ---------------------------------------------------------------------------

const SCHEMA_META_KEYS = new Set(["type", "properties", "required", "description", "items", "default", "enum"]);
const TEMPLATE_HELPERS = new Set([
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
  "fieldChipList",
]);

function valueAtTemplatePath(source: unknown, path: string): unknown {
  if (!path) return source;
  let current: unknown = source;
  for (const part of path.split(".")) {
    if (!part) continue;
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[Number(part)];
    } else if (isRecord(current)) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function collectSchemaFieldNames(schema: Record<string, unknown>, prefix = "", depth = 0): string[] {
  if (depth > 5) return [];
  if (isRecord(schema.properties)) {
    return collectSchemaFieldNames(schema.properties as Record<string, unknown>, prefix, depth);
  }
  const fields: string[] = [];
  for (const key of Object.keys(schema)) {
    if (SCHEMA_META_KEYS.has(key)) continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    fields.push(fullKey);
    const val = schema[key];
    if (isRecord(val)) {
      if (isRecord(val.properties)) {
        fields.push(...collectSchemaFieldNames(val.properties as Record<string, unknown>, fullKey, depth + 1));
      } else if (val.type === "array" && isRecord(val.items)) {
        const item = val.items as Record<string, unknown>;
        if (isRecord(item.properties)) {
          fields.push(...collectSchemaFieldNames(item.properties as Record<string, unknown>, fullKey, depth + 1));
        } else if (isRecord(item)) {
          fields.push(...collectSchemaFieldNames(item, fullKey, depth + 1));
        }
      } else if (val.type !== "string" && val.type !== "number" && val.type !== "boolean" && val.type !== "integer" && val.type !== "array") {
        // Could be a nested object schema without explicit type
        fields.push(...collectSchemaFieldNames(val, fullKey, depth + 1));
      }
    }
  }
  return [...new Set(fields)];
}

function expressionTokens(expression: string): string[] {
  const tokens: string[] = [];
  const pattern = /"[^"]*"|'[^']*'|[^\s]+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(expression)) !== null) tokens.push(match[0] ?? "");
  return tokens;
}

function isLiteralToken(token: string): boolean {
  return token === "true"
    || token === "false"
    || token === "null"
    || /^-?\d+(?:\.\d+)?$/.test(token)
    || /^".*"$/.test(token)
    || /^'.*'$/.test(token);
}

function normalizeTemplatePath(path: string, contextStack: string[]): string | null {
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

function addTemplateExpressionPaths(expression: string, contextStack: string[], placeholders: Set<string>): void {
  const tokens = expressionTokens(expression);
  if (tokens.length === 0) return;
  const relevant = TEMPLATE_HELPERS.has(tokens[0] ?? "") ? tokens.slice(1) : tokens;
  for (const token of relevant) {
    const normalized = normalizeTemplatePath(token, contextStack);
    if (normalized) placeholders.add(normalized);
  }
}

function findTemplatePlaceholders(template: string): string[] {
  const placeholders = new Set<string>();
  const contextStack: string[] = [];
  const pattern = /\{\{\s*([\s\S]*?)\s*\}\}/g;
  let match: RegExpExecArray | null;
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

function findDirectInterpolatedPaths(template: string): string[] {
  const direct = new Set<string>();
  const contextStack: string[] = [];
  const pattern = /\{\{\s*([\s\S]*?)\s*\}\}/g;
  let match: RegExpExecArray | null;
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
        const normalized = normalizeTemplatePath(blockExpression, contextStack);
        if (normalized) contextStack.push(normalized);
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

function collectTemplateAuthoringWarnings(
  template: string,
  sampleData: Record<string, unknown>,
): {
  rawObjectInterpolationPaths: string[];
  rawArrayInterpolationPaths: string[];
  mobileRiskWarnings: string[];
  verticalTextRiskWarnings: string[];
} {
  const rawObjectInterpolationPaths: string[] = [];
  const rawArrayInterpolationPaths: string[] = [];
  for (const path of findDirectInterpolatedPaths(template)) {
    const value = valueAtTemplatePath(sampleData, path);
    if (Array.isArray(value)) rawArrayInterpolationPaths.push(path);
    else if (isRecord(value)) rawObjectInterpolationPaths.push(path);
  }

  const mobileRiskWarnings: string[] = [];
  const verticalTextRiskWarnings: string[] = [];
  const styleText = template.replace(/\s+/g, " ");
  const fixedWidthPattern = /\b(?:width|min-width)\s*:\s*(\d{3,5})px/gi;
  let widthMatch: RegExpExecArray | null;
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
    verticalTextRiskWarnings: [...new Set(verticalTextRiskWarnings)],
  };
}

function presetName(preset: TrackerPresetDraft | TrackerSchemaPreset): string {
  return preset.name ?? "";
}

function presetId(preset: TrackerPresetDraft | TrackerSchemaPreset): string {
  return ("id" in preset && typeof preset.id === "string") ? preset.id : "validation_target";
}

export function validatePresetReport(
  preset: TrackerPresetDraft | TrackerSchemaPreset,
  options?: {
    allowInlineStyles?: boolean;
    maxRenderedChars?: number;
    sampleMode?: LTrackerSampleSnapshotMode;
  },
): PresetValidationReport {
  const entries: ValidationEntry[] = [];
  const missingPlaceholders: string[] = [];
  const unusedSchemaFields: string[] = [];
  const rawObjectInterpolationPaths: string[] = [];
  const rawArrayInterpolationPaths: string[] = [];
  const mobileRiskWarnings: string[] = [];
  const verticalTextRiskWarnings: string[] = [];
  const sanitizerWarningGroups: string[] = [];
  const rendererRequirements = detectTemplateRendererRequirements(preset.htmlTemplate ?? "");
  let sampleRenderResult: HtmlTemplateRenderResult | null = null;

  // ---- Pack / metadata ----
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

  // ---- JSON Schema ----
  if (isRecord(preset.jsonSchema)) {
    const rootKeys = Object.keys(preset.jsonSchema);
    if (rootKeys.length > 0) {
      entries.push({ severity: "pass", category: "Schema", message: `JSON schema has ${rootKeys.length} root field(s): ${rootKeys.slice(0, 10).join(", ")}${rootKeys.length > 10 ? "..." : ""}.` });
    } else {
      entries.push({ severity: "error", category: "Schema", message: "JSON schema is empty (no root fields)." });
    }
    const schemaJson = JSON.stringify(preset.jsonSchema, null, 2);
    const schemaSize = schemaJson.length;
    if (schemaSize > 50_000) {
      entries.push({ severity: "warning", category: "Schema", message: `JSON schema is very large (${schemaSize.toLocaleString()} chars). Consider simplifying.` });
    } else {
      entries.push({ severity: "info", category: "Schema", message: `JSON schema size: ${schemaSize.toLocaleString()} chars.` });
    }

    // Check required fields validity
    const schemaObj = preset.jsonSchema;
    if (Array.isArray(schemaObj.required)) {
      const requiredFields = schemaObj.required.filter((f: unknown): f is string => typeof f === "string");
      const invalidRequired = requiredFields.filter((f: string) => !rootKeys.includes(f) && !(isRecord(schemaObj.properties) && f in (schemaObj.properties as Record<string, unknown>)));
      if (invalidRequired.length > 0) {
        entries.push({ severity: "warning", category: "Schema", message: `Required fields not in schema properties: ${invalidRequired.join(", ")}.` });
      }
    }
  } else {
    entries.push({ severity: "error", category: "Schema", message: "JSON schema is not a valid object." });
  }

  // ---- Prompt instructions ----
  const prompt = preset.promptInstructions ?? "";
  if (prompt.trim()) {
    entries.push({ severity: "pass", category: "Prompt", message: "Prompt instructions exist." });
    const promptTokens = Math.ceil(prompt.length / 4);
    entries.push({ severity: "info", category: "Prompt", message: `Estimated prompt tokens: ~${promptTokens.toLocaleString()}.` });
    if (promptTokens > 8_000) {
      entries.push({ severity: "warning", category: "Prompt", message: `Prompt is very large (~${promptTokens.toLocaleString()} tokens). Consider reducing if generation is slow.` });
    }
    // Check for JSON-only instruction
    const hasJsonInstruction = /json[\s-]*only|respond[\s]*(?:only[\s]*)?(?:with|in)[\s]*json|output[\s]*(?:must[\s]*be[\s]*)?json|no[\s]*(?:markdown|prose|explanation)/i.test(prompt);
    if (!hasJsonInstruction) {
      entries.push({ severity: "warning", category: "Prompt", message: "Prompt may not contain a clear JSON-only instruction. Consider adding 'Respond only with JSON' to prevent prose around the tracker output." });
    }
  } else {
    entries.push({ severity: "error", category: "Prompt", message: "Prompt instructions are empty." });
  }

  // ---- HTML template ----
  const template = preset.htmlTemplate ?? "";
  if (template.trim()) {
    entries.push({ severity: "pass", category: "Template", message: "HTML template exists." });
    entries.push({ severity: "info", category: "Template", message: `Template size: ${template.length.toLocaleString()} chars.` });
    if (rendererRequirements.features.length > 0) {
      entries.push({
        severity: rendererRequirements.recommendedMode === "dev" ? "warning" : "info",
        category: "Renderer",
        message: `Template uses ${rendererRequirements.features.join(", ")}. Recommended mode: ${rendererRequirements.recommendedMode === "dev" ? "Trusted now; future Dev Mode for JavaScript-like content" : "Trusted"}.`,
      });
    }
    for (const warning of rendererRequirements.warnings) {
      entries.push({ severity: "warning", category: "Renderer", message: warning });
    }

    const sampleData = isRecord(preset.jsonSchema)
      ? generateSampleSnapshot(preset.jsonSchema, options?.sampleMode ?? "normal")
      : {};
    const authoringWarnings = collectTemplateAuthoringWarnings(template, sampleData);
    rawObjectInterpolationPaths.push(...authoringWarnings.rawObjectInterpolationPaths);
    rawArrayInterpolationPaths.push(...authoringWarnings.rawArrayInterpolationPaths);
    mobileRiskWarnings.push(...authoringWarnings.mobileRiskWarnings);
    verticalTextRiskWarnings.push(...authoringWarnings.verticalTextRiskWarnings);

    for (const path of rawArrayInterpolationPaths) {
      entries.push({
        severity: "warning",
        category: "Template Lint",
        message: `This path appears to be an array and may render as raw JSON: ${path}. Use {{#each ${path}}}...{{/each}} or a chip/list helper.`,
      });
    }
    for (const path of rawObjectInterpolationPaths) {
      entries.push({
        severity: "warning",
        category: "Template Lint",
        message: `This path appears to be an object and may render as raw JSON: ${path}. Use {{#with ${path}}}...{{/with}}, {{json ${path}}}, or a field helper.`,
      });
    }
    for (const warning of mobileRiskWarnings) {
      entries.push({ severity: "warning", category: "Mobile QA", message: warning });
    }
    for (const warning of verticalTextRiskWarnings) {
      entries.push({ severity: "warning", category: "Mobile QA", message: warning });
    }

    // Check for missing/unused placeholders
    if (isRecord(preset.jsonSchema)) {
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

    // Try sample render
    sampleRenderResult = renderHtmlTemplate(
      { template, snapshotData: sampleData, presetId: presetId(preset), presetName: presetName(preset) },
      {
        allowInlineStyles: options?.allowInlineStyles ?? true,
        templateTrustMode: options?.allowInlineStyles === false ? "safe" : "trusted",
        maxRenderedChars: options?.maxRenderedChars ?? 500_000,
        deduplicateWarnings: true,
        maxWarnings: 50,
      },
    );

    if (sampleRenderResult.ok) {
      entries.push({ severity: "pass", category: "Template", message: "Template renders successfully with sample data." });
      const renderedSize = sampleRenderResult.html.length;
      entries.push({ severity: "info", category: "Template", message: `Rendered HTML size: ${renderedSize.toLocaleString()} chars.` });
      if (renderedSize > 100_000) {
        entries.push({ severity: "warning", category: "Template", message: "Rendered output is very large. May be slow on mobile devices." });
      }
    } else {
      entries.push({ severity: "warning", category: "Template", message: `Template render failed with sample data: ${sampleRenderResult.errors.join("; ")}` });
    }

    // Sanitizer warnings
    if (sampleRenderResult && sampleRenderResult.warnings.length > 0) {
      const warningGroups = new Map<string, number>();
      for (const w of sampleRenderResult.warnings) {
        const key = w.replace(/["'][^"']*["']/g, "...").replace(/\d+/g, "N");
        warningGroups.set(key, (warningGroups.get(key) ?? 0) + 1);
      }
      for (const [group, count] of warningGroups) {
        const label = count > 1 ? `(×${count}) ${group}` : group;
        sanitizerWarningGroups.push(label);
      }
      if (sanitizerWarningGroups.length > 0) {
        entries.push({ severity: "warning", category: "Sanitizer", message: `${sanitizerWarningGroups.length} sanitizer warning group(s).` });
      }
    }
  } else {
    entries.push({ severity: "info", category: "Template", message: "No HTML template. Text fallback will be used for display." });
  }

  // ---- Estimates ----
  const schemaPreset: TrackerSchemaPreset = {
    id: presetId(preset),
    name: preset.name ?? "",
    description: ("description" in preset && typeof preset.description === "string") ? preset.description : "",
    version: preset.version ?? "1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    jsonSchema: isRecord(preset.jsonSchema) ? preset.jsonSchema : {},
    promptInstructions: preset.promptInstructions ?? "",
    htmlTemplate: preset.htmlTemplate ?? "",
    notes: preset.notes ?? "",
    origin: ("origin" in preset && typeof preset.origin === "string" ? preset.origin : "user_created") as TrackerPresetOrigin,
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
    sampleRenderResult,
  };
}

// ---------------------------------------------------------------------------
// File name helper
// ---------------------------------------------------------------------------

export function sanitizePackFileName(presetName: string, presetVersion: string): string {
  const name = (presetName ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "preset";
  const version = (presetVersion ?? "").trim().replace(/[^a-zA-Z0-9._-]+/g, "") || "1.0";
  return `${name}-${version}.ltracker.json`;
}

