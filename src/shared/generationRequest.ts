import type {
  LTrackerConnectionMode,
  LTrackerConnectionParameters,
  LTrackerConnectionProfileSummary,
  LTrackerConnectionSettings,
  LTrackerReasoningSettings,
  LTrackerSettings,
} from "./types";
import { effectiveTrackerOutputTokens } from "./budget";

export const TRACKER_CONNECTION_DEFAULT_TEST_PROMPT =
  "Return a compact JSON object with ok true and a short status.";

export const TRACKER_CONNECTION_PARAMETER_LIMITS = {
  temperature: { min: 0, max: 2, default: 0.2 },
  max_tokens: { min: 256, max: 64_000, default: 8_000 },
  top_p: { min: 0, max: 1, default: null },
  frequency_penalty: { min: -2, max: 2, default: null },
  presence_penalty: { min: -2, max: 2, default: null },
} as const;

export const DEFAULT_TRACKER_CONNECTION_PARAMETERS: LTrackerConnectionParameters = {
  temperature: TRACKER_CONNECTION_PARAMETER_LIMITS.temperature.default,
  max_tokens: TRACKER_CONNECTION_PARAMETER_LIMITS.max_tokens.default,
  top_p: null,
  frequency_penalty: null,
  presence_penalty: null,
};

export interface TrackerGenerationRequest {
  type: "quiet" | "raw";
  messages: unknown[];
  connection_id?: string;
  parameters?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface TrackerGenerationRequestBuildInput {
  messages: unknown[];
  settings: LTrackerSettings;
  selectedConnection: LTrackerConnectionProfileSummary | null;
  quietSupportsConnectionId?: boolean;
  signal?: AbortSignal;
}

export interface TrackerGenerationRequestBuildResult {
  request: TrackerGenerationRequest;
  modeUsed: LTrackerConnectionMode;
  connectionIdUsed: string | null;
  connectionNameUsed: string | null;
  fallbackReason: string | null;
  parametersUsed: Record<string, unknown> | null;
  reasoningOverrideUsed: Record<string, unknown> | null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cleanParameterValue(
  value: unknown,
  limits: { min: number; max: number },
  integer = false,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = finiteNumber(value);
  if (numeric === null) return null;
  const clamped = clamp(numeric, limits.min, limits.max);
  return integer ? Math.round(clamped) : clamped;
}

export function cleanTrackerGenerationParameters(
  parameters: Partial<LTrackerConnectionParameters> | null | undefined,
): Record<string, unknown> | null {
  if (!parameters) return null;
  const result: Record<string, unknown> = {};
  const temperature = cleanParameterValue(parameters.temperature, TRACKER_CONNECTION_PARAMETER_LIMITS.temperature);
  const maxTokens = cleanParameterValue(parameters.max_tokens, TRACKER_CONNECTION_PARAMETER_LIMITS.max_tokens, true);
  const topP = cleanParameterValue(parameters.top_p, TRACKER_CONNECTION_PARAMETER_LIMITS.top_p);
  const frequencyPenalty = cleanParameterValue(
    parameters.frequency_penalty,
    TRACKER_CONNECTION_PARAMETER_LIMITS.frequency_penalty,
  );
  const presencePenalty = cleanParameterValue(
    parameters.presence_penalty,
    TRACKER_CONNECTION_PARAMETER_LIMITS.presence_penalty,
  );
  if (temperature !== null) result.temperature = temperature;
  if (maxTokens !== null) result.max_tokens = maxTokens;
  if (topP !== null) result.top_p = topP;
  if (frequencyPenalty !== null) result.frequency_penalty = frequencyPenalty;
  if (presencePenalty !== null) result.presence_penalty = presencePenalty;
  return Object.keys(result).length > 0 ? result : null;
}

export function buildTrackerReasoningOverride(
  reasoning: LTrackerReasoningSettings | null | undefined,
): Record<string, unknown> | null {
  if (!reasoning || reasoning.source === "inherit") return null;
  if (reasoning.source === "off") {
    return {
      source: "off",
      apiReasoning: false,
    };
  }
  return {
    source: "custom",
    apiReasoning: reasoning.apiReasoning,
    effort: reasoning.effort,
    thinkingDisplay: reasoning.thinkingDisplay,
  };
}

function activeQuietResult(
  messages: unknown[],
  signal: AbortSignal | undefined,
  parametersUsed: Record<string, unknown> | null,
  reasoningOverrideUsed: Record<string, unknown> | null,
  fallbackReason: string | null,
): TrackerGenerationRequestBuildResult {
  const request: TrackerGenerationRequest = {
    type: "quiet",
    messages,
  };
  if (parametersUsed) request.parameters = parametersUsed;
  if (reasoningOverrideUsed) request.reasoning = reasoningOverrideUsed;
  if (signal) request.signal = signal;
  return {
    request,
    modeUsed: "active_quiet",
    connectionIdUsed: null,
    connectionNameUsed: null,
    fallbackReason,
    parametersUsed,
    reasoningOverrideUsed,
  };
}

export function buildTrackerGenerationRequest(
  input: TrackerGenerationRequestBuildInput,
): TrackerGenerationRequestBuildResult {
  const connectionSettings: LTrackerConnectionSettings = input.settings.connection;
  const quietSupportsConnectionId = input.quietSupportsConnectionId !== false;
  const parametersUsed = cleanTrackerGenerationParameters({
    ...connectionSettings.parameters,
    max_tokens: effectiveTrackerOutputTokens(input.settings),
  });
  const reasoningOverrideUsed = buildTrackerReasoningOverride(connectionSettings.reasoning);

  if (connectionSettings.mode === "active_quiet") {
    return activeQuietResult(input.messages, input.signal, parametersUsed, reasoningOverrideUsed, null);
  }

  if (!connectionSettings.selectedConnectionId) {
    return activeQuietResult(
      input.messages,
      input.signal,
      parametersUsed,
      reasoningOverrideUsed,
      "No tracker profile selected. LTracker will use the active roleplay connection until one is selected.",
    );
  }

  if (!input.selectedConnection) {
    return activeQuietResult(
      input.messages,
      input.signal,
      parametersUsed,
      reasoningOverrideUsed,
      "Selected tracker connection profile is missing or unavailable.",
    );
  }

  const request: TrackerGenerationRequest = {
    type: connectionSettings.mode === "selected_connection_raw" || !quietSupportsConnectionId ? "raw" : "quiet",
    messages: input.messages,
    connection_id: input.selectedConnection.id,
  };
  if (parametersUsed) request.parameters = parametersUsed;
  if (reasoningOverrideUsed) request.reasoning = reasoningOverrideUsed;
  if (input.signal) request.signal = input.signal;

  return {
    request,
    modeUsed: request.type === "raw" ? "selected_connection_raw" : "selected_connection_quiet",
    connectionIdUsed: input.selectedConnection.id,
    connectionNameUsed: input.selectedConnection.name,
    fallbackReason: connectionSettings.mode === "selected_connection_quiet" && !quietSupportsConnectionId
      ? "Quiet generation does not support connection_id in this Lumiverse build; using raw generation."
      : null,
    parametersUsed,
    reasoningOverrideUsed,
  };
}
