import type { LTrackerBudgetSettings, LTrackerSettings } from "./types";

export const CHARS_PER_ESTIMATED_TOKEN = 4;

export const NORMAL_BUDGET_DEFAULTS = {
  recentMessageBudgetTokens: 16_000,
  perMessageBudgetTokens: 12_000,
  trackerMemoryBudgetTokens: 12_000,
  promptInjectionBudgetTokens: 12_000,
  maxTrackerOutputTokens: 8_000,
  promptPreviewBudgetTokens: 16_000,
  renderedHtmlMaxChars: 250_000,
  rawOutputMaxChars: 250_000,
  presetImportMaxChars: 1_000_000,
} as const;

export const ULTRA_BUDGET_DEFAULTS = {
  recentMessageBudgetTokens: 128_000,
  perMessageBudgetTokens: 40_000,
  trackerMemoryBudgetTokens: 64_000,
  promptInjectionBudgetTokens: 64_000,
  maxTrackerOutputTokens: 64_000,
  promptPreviewBudgetTokens: 128_000,
  renderedHtmlMaxChars: 2_000_000,
  rawOutputMaxChars: 2_000_000,
  presetImportMaxChars: 10_000_000,
} as const;

export function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars / CHARS_PER_ESTIMATED_TOKEN);
}

export function estimateCharsFromTokens(tokens: number): number {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;
  return Math.round(tokens * CHARS_PER_ESTIMATED_TOKEN);
}

function tokenBudgetToChars(tokens: number, fallbackChars: number): number {
  const chars = estimateCharsFromTokens(tokens);
  return chars > 0 ? chars : fallbackChars;
}

export function budgetDefaults(ultraModeEnabled: boolean): Omit<LTrackerBudgetSettings, "mode" | "ultraModeEnabled"> {
  return ultraModeEnabled ? ULTRA_BUDGET_DEFAULTS : NORMAL_BUDGET_DEFAULTS;
}

export function effectivePerMessageChars(settings: LTrackerSettings): number {
  if (settings.budget.mode === "estimated_tokens") {
    return tokenBudgetToChars(settings.budget.perMessageBudgetTokens, settings.maxMessageChars);
  }
  return settings.maxMessageChars;
}

export function effectiveRecentTranscriptChars(settings: LTrackerSettings): number {
  if (settings.budget.mode === "estimated_tokens") {
    return tokenBudgetToChars(settings.budget.recentMessageBudgetTokens, settings.maxMessageChars * settings.recentMessageLimit);
  }
  return Math.max(settings.maxMessageChars, settings.maxMessageChars * settings.recentMessageLimit);
}

export function effectiveTrackerMemoryChars(settings: LTrackerSettings): number {
  if (settings.budget.mode === "estimated_tokens") {
    return tokenBudgetToChars(settings.budget.trackerMemoryBudgetTokens, settings.memory.maxMemoryChars);
  }
  return settings.memory.maxMemoryChars;
}

export function effectivePromptInjectionChars(settings: LTrackerSettings): number {
  if (settings.budget.mode === "estimated_tokens") {
    return tokenBudgetToChars(settings.budget.promptInjectionBudgetTokens, settings.injection.maxInjectedChars);
  }
  return settings.injection.maxInjectedChars;
}

export function effectivePromptPreviewChars(settings: LTrackerSettings): number {
  if (settings.budget.mode === "estimated_tokens") {
    return tokenBudgetToChars(settings.budget.promptPreviewBudgetTokens, 64_000);
  }
  return 64_000;
}

export function effectiveTrackerOutputTokens(settings: LTrackerSettings): number {
  return Math.max(256, Math.round(settings.budget.maxTrackerOutputTokens));
}
