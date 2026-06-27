import {
  SETTINGS_SCHEMA_VERSION,
  type LTrackerSettings,
} from "./types";

export const SETTINGS_LIMITS = {
  recentMessageLimit: { min: 1, max: 200, default: 24 },
  maxMessageChars: { min: 500, max: 50_000, default: 8_000 },
  generationTimeoutMs: { min: 10_000, max: 180_000, default: 45_000 },
} as const;

export const DEFAULT_SETTINGS: LTrackerSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  recentMessageLimit: SETTINGS_LIMITS.recentMessageLimit.default,
  maxMessageChars: SETTINGS_LIMITS.maxMessageChars.default,
  generationTimeoutMs: SETTINGS_LIMITS.generationTimeoutMs.default,
  saveRawOutput: true,
  savePromptPreview: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() ? Number(value) : fallback;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function repairSettings(value: unknown): LTrackerSettings {
  const source = isRecord(value) ? value : {};
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    recentMessageLimit: clampNumber(
      source.recentMessageLimit,
      SETTINGS_LIMITS.recentMessageLimit.default,
      SETTINGS_LIMITS.recentMessageLimit.min,
      SETTINGS_LIMITS.recentMessageLimit.max,
    ),
    maxMessageChars: clampNumber(
      source.maxMessageChars,
      SETTINGS_LIMITS.maxMessageChars.default,
      SETTINGS_LIMITS.maxMessageChars.min,
      SETTINGS_LIMITS.maxMessageChars.max,
    ),
    generationTimeoutMs: clampNumber(
      source.generationTimeoutMs,
      SETTINGS_LIMITS.generationTimeoutMs.default,
      SETTINGS_LIMITS.generationTimeoutMs.min,
      SETTINGS_LIMITS.generationTimeoutMs.max,
    ),
    saveRawOutput: typeof source.saveRawOutput === "boolean"
      ? source.saveRawOutput
      : DEFAULT_SETTINGS.saveRawOutput,
    savePromptPreview: typeof source.savePromptPreview === "boolean"
      ? source.savePromptPreview
      : DEFAULT_SETTINGS.savePromptPreview,
  };
}
