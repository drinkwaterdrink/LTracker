import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_TRACKER_SCHEMA } from "../src/shared/defaultSchema";
import {
  buildInjectionDecision,
  shouldSkipContextForInternalGeneration,
} from "../src/shared/contextInjection";
import {
  CONTEXT_HANDLER_DISABLED_REASON,
  CONTEXT_HANDLER_EXPERIMENTAL_ENABLED,
  runContextHandlerFailSafe,
} from "../src/shared/contextHandlerRuntime";
import {
  applyContextFiltersToTranscript,
  autoSkipReasonForContextFilters,
  contextBudgetPreview,
  formatContextFilterReport,
} from "../src/shared/contextFilters";
import {
  detectTemplateRendererRequirements,
  formatTemplateTextFallback,
  renderHtmlTemplate,
  sanitizeHtml,
  summarizeWarnings,
} from "../src/shared/htmlTemplateRenderer";
import {
  buildLTrackerTag,
  findLTrackerTagForSwipe,
  removeLTrackerTag,
  upsertLTrackerTag,
  findLTrackerTags,
} from "../src/shared/embeddedTrackerTag";
import {
  buildTrackerGenerationRequest,
  buildTrackerReasoningOverride,
  cleanTrackerGenerationParameters,
} from "../src/shared/generationRequest";
import {
  capturePresetRenderLock,
  resolvePresetForSnapshot,
} from "../src/shared/presetRenderLock";
import {
  applyPromptInjection,
  countTrackerBlocks,
  formatTrackerInjectionBlock,
} from "../src/shared/promptInjection";
import {
  buildPromptInjectionSafetyReport,
  isolatePromptInjectionEntries,
  type PromptInjectionBoundary,
} from "../src/shared/promptInjectionIsolation";
import {
  buildMessageTrackerHistory,
  claimMessageWidget,
  formatDurationMs,
  groupMessageTrackerHistory,
  renderMessageTracker,
} from "../src/shared/messageDisplay";
import {
  normalizeMessageAttachedSnapshotPresetMetadata,
  normalizeTrackerSnapshotPresetMetadata,
  filterMessageSnapshotIndexByStorageKeys,
  repairMessageSnapshotIndex,
  repairMessageSnapshotIndexKeepingNewest,
  removeMessageSnapshotIndexEntry,
  upsertMessageSnapshotIndexEntry,
} from "../src/shared/messageSnapshotIndex";
import {
  isQuietGenerationType,
  shouldScheduleAutoTracker,
} from "../src/shared/auto";
import {
  evaluateStableSwipeContent,
  shouldCancelPendingSwipe,
  stableContentHash,
} from "../src/shared/autoTiming";
import {
  NORMAL_BUDGET_DEFAULTS,
  ULTRA_BUDGET_DEFAULTS,
  estimateCharsFromTokens,
  estimateTokensFromChars,
} from "../src/shared/budget";
import { parseTrackerJson } from "../src/shared/parser";
import {
  canModifyPreset,
  DEFAULT_TRACKER_PRESET,
  DEFAULT_TRACKER_PRESET_ID,
  exportTrackerPreset,
  importTrackerPresetEnvelope,
  resolveSelectedPreset,
  validateJsonSchema,
} from "../src/shared/presets";
import {
  DEFAULT_SETTINGS,
  repairSettings,
} from "../src/shared/settings";
import {
  formatSnapshotForInjection,
  truncateSafe,
} from "../src/shared/snapshotFormat";
import {
  messageSnapshotIndexPath,
  legacyMessageSnapshotPath,
  messageSnapshotPath,
} from "../src/shared/storageKeys";
import {
  DEFAULT_SWIPE_KEY,
  deriveSwipeTrackerIdentity,
  hashSwipeContent,
} from "../src/shared/swipeIdentity";
import {
  buildCompactTranscript,
  buildTrackerPrompt,
} from "../src/shared/trackerPrompt";
import {
  buildTrackerMemoryResult,
  type TrackerMemoryEntry,
  selectTrackerMemoryCandidates,
} from "../src/shared/trackerMemory";
import {
  EXTENSION_VERSION,
  type MessageAttachedSnapshot,
  type TrackerSnapshot,
  type TrackerSchemaPreset,
} from "../src/shared/types";
import {
  exportPresetPack,
  importPresetPack,
  validatePresetReport,
  generateSampleSnapshot,
  PRESET_PACK_KIND,
} from "../src/shared/presetPack";
import {
  ownerPowerFeatureSummary,
  ownerPowerReport,
  stripOwnerPowerRecommendedSettings,
} from "../src/shared/ownerPower";

const sampleSnapshot: TrackerSnapshot = {
  schemaVersion: 1,
  extensionVersion: EXTENSION_VERSION,
  chatId: "chat-a",
  createdAt: "2003-09-22T16:18:00.000Z",
  messageCount: 8,
  sourceMessageIds: ["m1", "m2"],
  presetId: DEFAULT_TRACKER_PRESET.id,
  presetName: DEFAULT_TRACKER_PRESET.name,
  presetVersion: DEFAULT_TRACKER_PRESET.version,
  generationStartedAt: "2003-09-22T16:17:57.600Z",
  generationCompletedAt: "2003-09-22T16:18:00.000Z",
  generationDurationMs: 2400,
  generationCancelledAt: null,
  generationStatus: "completed",
  data: {
    scene: {
      location: "Grand Meridian Court",
      time: "late afternoon",
      mood: "tense/uncertain",
    },
    characters_present: [
      { name: "Aleister Crowley", emotional_state: "confused" },
      { name: "Sable Mareth", emotional_state: "assessing him" },
    ],
    important_facts: [
      "Aleister is newly arrived and confused.",
      "Sable is assessing him at Bracken threshold.",
    ],
    active_threads: [
      "Scholarship packet",
      "House placement tension",
    ],
    next_scene_pressure: "A formal choice is coming.",
  },
};

const sampleMessageSnapshot: MessageAttachedSnapshot = {
  schemaVersion: 1,
  extensionVersion: EXTENSION_VERSION,
  chatId: "chat-a",
  messageId: "m2",
  messageIndex: 7,
  swipeKey: "index-0",
  swipeIndex: 0,
  swipeId: null,
  swipeContentHash: hashSwipeContent("assistant swipe"),
  swipeKeySource: "swipe_index",
  presetId: DEFAULT_TRACKER_PRESET.id,
  presetName: DEFAULT_TRACKER_PRESET.name,
  presetVersion: DEFAULT_TRACKER_PRESET.version,
  trigger: {
    kind: "auto",
    requestId: "auto",
    eventType: "GENERATION_ENDED",
    sourceMessageId: "m2",
    sourceMessageIndex: 7,
    generationId: "g1",
    generationType: "normal",
    swipeKey: "index-0",
    swipeIndex: 0,
    swipeId: null,
    swipeContentHash: hashSwipeContent("assistant swipe"),
    swipeKeySource: "swipe_index",
  },
  snapshot: sampleSnapshot,
  attachedAt: "2003-09-22T16:19:00.000Z",
};

test("parseTrackerJson parses a plain JSON object", () => {
  assert.deepEqual(parseTrackerJson("{\"scene\":{\"time\":\"night\"}}"), {
    scene: { time: "night" },
  });
});

test("parseTrackerJson parses fenced JSON", () => {
  assert.deepEqual(parseTrackerJson("```json\n{\"ok\":true}\n```"), { ok: true });
});

test("parseTrackerJson extracts a balanced object from surrounding text", () => {
  assert.deepEqual(parseTrackerJson("Here is the tracker:\n{\"a\":{\"b\":1}}\nDone."), {
    a: { b: 1 },
  });
});

test("parseTrackerJson removes trailing commas", () => {
  assert.deepEqual(parseTrackerJson("{\"items\":[1,2,],\"ok\":true,}"), {
    items: [1, 2],
    ok: true,
  });
});

test("parseTrackerJson rejects arrays", () => {
  assert.throws(() => parseTrackerJson("[1,2,3]"), /JSON object/);
});

test("parseTrackerJson rejects empty output", () => {
  assert.throws(() => parseTrackerJson("   "), /empty output/);
});

test("buildTrackerPrompt includes JSON-only instruction and default schema", () => {
  const prompt = buildTrackerPrompt("[0 USER Trent]\nHello");
  const joined = prompt.map((message) => message.content).join("\n");
  assert.match(joined, /Return JSON only/);
  assert.match(joined, /characters_present/);
  assert.match(joined, new RegExp(Object.keys(DEFAULT_TRACKER_SCHEMA.scene)[0] ?? "time"));
});

test("buildCompactTranscript truncates long messages with the provided setting", () => {
  const transcript = buildCompactTranscript([
    {
      index: 4,
      role: "assistant",
      name: "Lumia",
      content: "abcdefghijklmnopqrstuvwxyz",
    },
  ], 6);
  assert.match(transcript, /\[4 ASSISTANT Lumia\]/);
  assert.match(transcript, /abcdef/);
  assert.doesNotMatch(transcript, /ghijkl/);
});

test("buildCompactTranscript applies the total transcript budget", () => {
  const transcript = buildCompactTranscript([
    { index: 1, role: "user", name: "Trent", content: "a".repeat(80) },
    { index: 2, role: "assistant", name: "Lumia", content: "b".repeat(80) },
    { index: 3, role: "assistant", name: "Lumia", content: "c".repeat(80) },
  ], 80, 120);

  assert.match(transcript, /prompt budget was reached/);
  assert.match(transcript, /\[1 USER Trent\]/);
  assert.doesNotMatch(transcript, /\[3 ASSISTANT Lumia\]/);
});

test("repairSettings repairs auto mode settings with bounded values", () => {
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    auto: {
      autoModeEnabled: true,
      autoDebounceMs: "999999",
      skipFirstMessages: "-10",
      triggerAfterAssistantMessages: false,
      triggerAfterUserMessages: true,
      attachSnapshotToMessage: false,
      onlyWhenChatActive: false,
    },
  });

  assert.equal(settings.auto.autoModeEnabled, true);
  assert.equal(settings.auto.autoDebounceMs, 30_000);
  assert.equal(settings.auto.skipFirstMessages, 0);
  assert.equal(settings.auto.triggerAfterAssistantMessages, false);
  assert.equal(settings.auto.triggerAfterUserMessages, true);
  assert.equal(settings.auto.attachSnapshotToMessage, false);
  assert.equal(settings.auto.onlyWhenChatActive, false);
});

test("repairSettings adds v0.15 timing, trust, budget, and width defaults", () => {
  const migrated = repairSettings({});
  assert.equal(migrated.autoTiming.waitForAssistantFinalization, true);
  assert.equal(migrated.autoTiming.postCompletionSettleMs, 750);
  assert.equal(migrated.autoTiming.stableContentCheckMs, 400);
  assert.equal(migrated.autoTiming.requireStableSwipeContent, true);
  assert.equal(migrated.autoTiming.cancelPendingOnSwipeChange, true);
  assert.equal(migrated.renderer.templateTrustMode, "trusted");
  assert.equal(migrated.renderer.allowInlineStyles, true);
  assert.equal(migrated.messageDisplay.allowInlineStyles, true);
  assert.equal(migrated.messageDisplay.useDomInjection, true);
  assert.equal(migrated.messageDisplay.fallbackToIframeWidget, false);
  assert.equal(migrated.messageDisplay.displaySurface, "inline_wide");
  assert.deepEqual(migrated.budget, {
    mode: "estimated_tokens",
    ultraModeEnabled: false,
    ...NORMAL_BUDGET_DEFAULTS,
  });
  assert.equal(migrated.expandedWidth.expandedWidthMode, "wide");
  assert.equal(migrated.expandedWidth.maxExpandedWidthPx, 1100);

  const repaired = repairSettings({
    renderer: { allowInlineStyles: false },
    messageDisplay: { allowInlineStyles: false },
    autoTiming: {
      postCompletionSettleMs: -1,
      stableContentCheckMs: 99_999,
      requireStableSwipeContent: false,
      cancelPendingOnSwipeChange: false,
    },
    budget: {
      ultraModeEnabled: true,
      recentMessageBudgetTokens: NORMAL_BUDGET_DEFAULTS.recentMessageBudgetTokens,
      maxTrackerOutputTokens: 999_999,
      renderedHtmlMaxChars: 9_999_999,
    },
    expandedWidth: {
      expandedWidthMode: "full_mobile",
      maxExpandedWidthPx: 99_999,
      mobileHorizontalMarginPx: -20,
      expandedContentMaxHeightVh: 999,
    },
  });

  assert.equal(repaired.renderer.templateTrustMode, "safe");
  assert.equal(repaired.renderer.allowInlineStyles, false);
  assert.equal(repaired.messageDisplay.allowInlineStyles, false);
  assert.equal(repaired.autoTiming.postCompletionSettleMs, 0);
  assert.equal(repaired.autoTiming.stableContentCheckMs, 5_000);
  assert.equal(repaired.autoTiming.requireStableSwipeContent, false);
  assert.equal(repaired.autoTiming.cancelPendingOnSwipeChange, false);
  assert.equal(repaired.budget.ultraModeEnabled, true);
  assert.equal(repaired.budget.recentMessageBudgetTokens, ULTRA_BUDGET_DEFAULTS.recentMessageBudgetTokens);
  assert.equal(repaired.budget.maxTrackerOutputTokens, ULTRA_BUDGET_DEFAULTS.maxTrackerOutputTokens);
  assert.equal(repaired.budget.renderedHtmlMaxChars, ULTRA_BUDGET_DEFAULTS.renderedHtmlMaxChars);
  assert.equal(repaired.expandedWidth.expandedWidthMode, "full_mobile");
  assert.equal(repaired.expandedWidth.maxExpandedWidthPx, 1_800);
  assert.equal(repaired.expandedWidth.mobileHorizontalMarginPx, 0);
  assert.equal(repaired.expandedWidth.expandedContentMaxHeightVh, 95);
});

test("token estimate helpers use the shared four-character approximation", () => {
  assert.equal(estimateTokensFromChars(0), 0);
  assert.equal(estimateTokensFromChars(9), 3);
  assert.equal(estimateCharsFromTokens(12_000), 48_000);
});

test("auto timing stable-content helpers gate partial swipe output", () => {
  const settings = DEFAULT_SETTINGS.autoTiming;
  const first = { messageId: "m2", swipeKey: "index-0", content: "complete reply" };
  const second = { messageId: "m2", swipeKey: "index-0", content: "complete reply" };
  const stable = evaluateStableSwipeContent(first, second, settings);
  assert.equal(stable.passed, true);
  assert.equal(stable.contentHash, stableContentHash("complete reply"));

  const changed = evaluateStableSwipeContent(first, {
    ...second,
    content: "complete reply plus late token",
  }, settings);
  assert.equal(changed.passed, false);
  assert.match(changed.skippedReason ?? "", /changed during stable-content check/);

  assert.equal(shouldCancelPendingSwipe(first, {
    messageId: "m2",
    swipeKey: "index-1",
    content: "new swipe",
  }, settings), true);
});

test("repairSettings adds and repairs connection settings", () => {
  const migrated = repairSettings({
    recentMessageLimit: 12,
  });
  assert.equal(migrated.connection.mode, "selected_connection_raw");
  assert.equal(migrated.connection.parameters.temperature, 0.2);
  assert.equal(migrated.connection.parameters.max_tokens, 8000);
  assert.equal(migrated.connection.reasoning.source, "inherit");

  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    connection: {
      mode: "selected_connection_raw",
      selectedConnectionId: "conn-a",
      selectedConnectionName: "Tracker Cheap",
      refreshConnectionsOnDrawerOpen: false,
      parameters: {
        temperature: 5,
        max_tokens: "999999",
        top_p: null,
        frequency_penalty: "bad",
        presence_penalty: -7,
      },
      reasoning: {
        source: "bogus",
        apiReasoning: false,
        effort: "xlarge",
        thinkingDisplay: "visible",
      },
      testPrompt: "",
    },
  });

  assert.equal(settings.connection.mode, "selected_connection_raw");
  assert.equal(settings.connection.selectedConnectionId, "conn-a");
  assert.equal(settings.connection.selectedConnectionName, "Tracker Cheap");
  assert.equal(settings.connection.refreshConnectionsOnDrawerOpen, false);
  assert.equal(settings.connection.parameters.temperature, 2);
  assert.equal(settings.connection.parameters.max_tokens, 64_000);
  assert.equal(settings.connection.parameters.top_p, null);
  assert.equal(settings.connection.parameters.frequency_penalty, null);
  assert.equal(settings.connection.parameters.presence_penalty, -2);
  assert.equal(settings.connection.reasoning.source, "inherit");
  assert.equal(settings.connection.reasoning.apiReasoning, false);
  assert.equal(settings.connection.reasoning.effort, "auto");
  assert.equal(settings.connection.reasoning.thinkingDisplay, "auto");
  assert.match(settings.connection.testPrompt, /compact JSON object/);
});

test("tracker generation parameters clamp and omit nulls", () => {
  assert.equal(cleanTrackerGenerationParameters({
    temperature: null,
    max_tokens: null,
    top_p: null,
    frequency_penalty: null,
    presence_penalty: null,
  }), null);

  assert.deepEqual(cleanTrackerGenerationParameters({
    temperature: 3,
    max_tokens: 1,
    top_p: 2,
    frequency_penalty: -5,
    presence_penalty: 5,
  }), {
    temperature: 2,
    max_tokens: 256,
    top_p: 1,
    frequency_penalty: -2,
    presence_penalty: 2,
  });
  assert.deepEqual(cleanTrackerGenerationParameters({
    temperature: null,
    max_tokens: 999_999,
    top_p: null,
    frequency_penalty: null,
    presence_penalty: null,
  }), {
    max_tokens: 64_000,
  });
});

test("tracker reasoning overrides support inherit off and custom", () => {
  assert.equal(buildTrackerReasoningOverride(DEFAULT_SETTINGS.connection.reasoning), null);
  assert.deepEqual(buildTrackerReasoningOverride({
    ...DEFAULT_SETTINGS.connection.reasoning,
    source: "off",
  }), {
    source: "off",
    apiReasoning: false,
  });
  assert.deepEqual(buildTrackerReasoningOverride({
    source: "custom",
    apiReasoning: true,
    effort: "low",
    thinkingDisplay: "omitted",
  }), {
    source: "custom",
    apiReasoning: true,
    effort: "low",
    thinkingDisplay: "omitted",
  });
});

test("tracker generation request builder handles connection modes and fallbacks", () => {
  const messages = [{ role: "user", content: "hello" }];
  const selectedConnection = {
    id: "conn-tracker",
    name: "Tracker Profile",
    provider: "openai",
    model: "cheap-json",
    has_api_key: true,
    is_default: false,
    reasoning_bindings: null,
    updated_at: null,
  };
  const selectedRawSettings = repairSettings({
    ...DEFAULT_SETTINGS,
    connection: {
      ...DEFAULT_SETTINGS.connection,
      mode: "selected_connection_raw",
      selectedConnectionId: "conn-tracker",
      selectedConnectionName: "Tracker Profile",
    },
  });
  const raw = buildTrackerGenerationRequest({
    messages,
    settings: selectedRawSettings,
    selectedConnection,
  });
  assert.equal(raw.request.type, "raw");
  assert.equal(raw.request.connection_id, "conn-tracker");
  assert.equal(raw.request.parameters?.max_tokens, NORMAL_BUDGET_DEFAULTS.maxTrackerOutputTokens);
  assert.equal(raw.modeUsed, "selected_connection_raw");
  assert.equal(raw.fallbackReason, null);

  const ultraRaw = buildTrackerGenerationRequest({
    messages,
    settings: repairSettings({
      ...selectedRawSettings,
      budget: {
        ...selectedRawSettings.budget,
        ultraModeEnabled: true,
      },
    }),
    selectedConnection,
  });
  assert.equal(ultraRaw.request.parameters?.max_tokens, ULTRA_BUDGET_DEFAULTS.maxTrackerOutputTokens);

  const quietSettings = repairSettings({
    ...DEFAULT_SETTINGS,
    connection: {
      ...DEFAULT_SETTINGS.connection,
      mode: "selected_connection_quiet",
      selectedConnectionId: "conn-tracker",
      selectedConnectionName: "Tracker Profile",
    },
  });
  const quiet = buildTrackerGenerationRequest({
    messages,
    settings: quietSettings,
    selectedConnection,
  });
  assert.equal(quiet.request.type, "quiet");
  assert.equal(quiet.request.connection_id, "conn-tracker");
  assert.equal(quiet.modeUsed, "selected_connection_quiet");

  const unsupportedQuiet = buildTrackerGenerationRequest({
    messages,
    settings: quietSettings,
    selectedConnection,
    quietSupportsConnectionId: false,
  });
  assert.equal(unsupportedQuiet.request.type, "raw");
  assert.equal(unsupportedQuiet.modeUsed, "selected_connection_raw");
  assert.match(unsupportedQuiet.fallbackReason ?? "", /Quiet generation does not support/);

  const missingSelected = buildTrackerGenerationRequest({
    messages,
    settings: selectedRawSettings,
    selectedConnection: null,
  });
  assert.equal(missingSelected.request.type, "quiet");
  assert.equal(missingSelected.modeUsed, "active_quiet");
  assert.equal(missingSelected.request.connection_id, undefined);
  assert.match(missingSelected.fallbackReason ?? "", /missing or unavailable/);
});

test("shouldScheduleAutoTracker respects role triggers and active chat", () => {
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    auto: {
      ...DEFAULT_SETTINGS.auto,
      autoModeEnabled: true,
    },
  });

  assert.deepEqual(shouldScheduleAutoTracker({
    settings,
    role: "assistant",
    messageCount: 6,
    chatId: "chat-a",
    activeChatId: "chat-a",
    trackerGenerationRunning: false,
  }), { shouldSchedule: true });

  assert.equal(shouldScheduleAutoTracker({
    settings,
    role: "user",
    messageCount: 6,
    chatId: "chat-a",
    activeChatId: "chat-a",
    trackerGenerationRunning: false,
  }).shouldSchedule, false);

  assert.equal(shouldScheduleAutoTracker({
    settings,
    role: "assistant",
    messageCount: 6,
    chatId: "chat-a",
    activeChatId: "chat-b",
    trackerGenerationRunning: false,
  }).shouldSchedule, false);
});

test("shouldScheduleAutoTracker skips early chats and running tracker jobs", () => {
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    auto: {
      ...DEFAULT_SETTINGS.auto,
      autoModeEnabled: true,
      skipFirstMessages: 3,
    },
  });

  assert.equal(shouldScheduleAutoTracker({
    settings,
    role: "assistant",
    messageCount: 3,
    chatId: "chat-a",
    activeChatId: "chat-a",
    trackerGenerationRunning: false,
  }).shouldSchedule, false);

  assert.equal(shouldScheduleAutoTracker({
    settings,
    role: "assistant",
    messageCount: 4,
    chatId: "chat-a",
    activeChatId: "chat-a",
    trackerGenerationRunning: true,
  }).shouldSchedule, false);
});

test("isQuietGenerationType recognizes quiet generations only", () => {
  assert.equal(isQuietGenerationType("quiet"), true);
  assert.equal(isQuietGenerationType("QUIET"), true);
  assert.equal(isQuietGenerationType("normal"), false);
  assert.equal(isQuietGenerationType(null), false);
});

test("messageSnapshotPath stores snapshots under chat and message ids", () => {
  assert.equal(
    messageSnapshotPath("chat id/1", "message id/2", "swipe/1"),
    "chats/chat%20id%2F1/messages/message%20id%2F2/swipes/swipe%2F1/tracker-snapshot.json",
  );
  assert.equal(
    legacyMessageSnapshotPath("chat id/1", "message id/2"),
    "chats/chat%20id%2F1/messages/message%20id%2F2/tracker-snapshot.json",
  );
});

test("messageSnapshotIndexPath stores the per-chat index under message-snapshots", () => {
  assert.equal(
    messageSnapshotIndexPath("chat id/1"),
    "chats/chat%20id%2F1/message-snapshots/index.json",
  );
});

test("embedded tracker tags build, replace, and remove by exact swipe", () => {
  const first = buildLTrackerTag("{\"scene\":{\"time\":\"one\"}}", "index-0");
  assert.match(first, /<ltracker type="state" version="0\.\d+(?:\.\d+)?" swipe="index-0">/);
  const content = upsertLTrackerTag("Assistant reply.", "{\"a\":1}", "index-0");
  const withSecond = upsertLTrackerTag(content.content, "{\"b\":2}", "index-1");
  const replaced = upsertLTrackerTag(withSecond.content, "{\"a\":3}", "index-0");

  assert.equal(content.inserted, true);
  assert.equal(replaced.replaced, true);
  assert.match(findLTrackerTagForSwipe(replaced.content, "index-0")?.content ?? "", /"a":3/);
  assert.match(findLTrackerTagForSwipe(replaced.content, "index-1")?.content ?? "", /"b":2/);
  assert.doesNotMatch(replaced.content, /"a":1/);

  const removed = removeLTrackerTag(replaced.content, "index-0");
  assert.equal(removed.removed, true);
  assert.equal(findLTrackerTagForSwipe(removed.content, "index-0"), null);
  assert.match(findLTrackerTagForSwipe(removed.content, "index-1")?.content ?? "", /"b":2/);
});

test("deriveSwipeTrackerIdentity uses official id, index, then content hash", () => {
  const official = deriveSwipeTrackerIdentity("chat-a", {
    id: "m2",
    content: "active",
    swipeId: "stable-swipe",
    swipe_id: 1,
    swipes: ["old", "active"],
  });
  assert.equal(official.swipeKey, "id-stable-swipe");
  assert.equal(official.swipeKeySource, "swipe_id");
  assert.equal(official.swipeIndex, 1);
  assert.equal(official.swipeContentHash, hashSwipeContent("active"));

  const indexed = deriveSwipeTrackerIdentity("chat-a", {
    id: "m2",
    content: "active",
    swipe_id: 0,
    swipes: ["active"],
  });
  assert.equal(indexed.swipeKey, "index-0");
  assert.equal(indexed.swipeKeySource, "swipe_index");

  const hashed = deriveSwipeTrackerIdentity("chat-a", {
    id: "m2",
    content: "active",
  });
  assert.equal(hashed.swipeKey, `hash-${hashSwipeContent("active")}`);
  assert.equal(hashed.swipeKeySource, "content_hash");
});

test("message snapshot index repairs, sorts, and updates by message/swipe id", () => {
  const repaired = repairMessageSnapshotIndex([
    {
      messageId: "m3",
      messageIndex: 3,
      createdAt: "2003-09-22T16:21:00.000Z",
      presetId: "preset-a",
      presetName: "Preset A",
      storageKey: "key-3",
    },
    {
      messageId: "m1",
      messageIndex: 1,
      createdAt: "2003-09-22T16:20:00.000Z",
      storageKey: "key-1",
    },
    { bad: true },
  ]);
  assert.deepEqual(repaired.map((entry) => entry.messageId), ["m1", "m3"]);

  const updated = upsertMessageSnapshotIndexEntry(repaired, {
    messageId: "m3",
    messageIndex: 2,
    swipeKey: "index-1",
    swipeIndex: 1,
    swipeId: null,
    swipeContentHash: "hash-1",
    swipeKeySource: "swipe_index",
    createdAt: "2003-09-22T16:22:00.000Z",
    presetId: "preset-b",
    presetName: "Preset B",
    storageKey: "key-3b",
  });
  assert.deepEqual(
    updated.map((entry) => `${entry.messageId}:${entry.swipeKey}`),
    ["m1:default", "m3:index-1", "m3:default"],
  );
  assert.equal(updated[1]?.messageIndex, 2);
  assert.equal(repaired[0]?.swipeKey, DEFAULT_SWIPE_KEY);
  assert.equal(updated[1]?.presetName, "Preset B");
  assert.equal(updated[1]?.storageKey, "key-3b");
  assert.equal(updated[2]?.presetName, "Preset A");
});

test("message-specific regeneration updates only the target message index entry", () => {
  const original = repairMessageSnapshotIndex([
    {
      messageId: "m1",
      messageIndex: 1,
      swipeKey: "index-0",
      swipeIndex: 0,
      swipeId: null,
      swipeContentHash: "hash-m1",
      swipeKeySource: "swipe_index",
      createdAt: "2003-09-22T16:18:00.000Z",
      presetId: "preset-a",
      presetName: "Preset A",
      storageKey: "key-1",
    },
    {
      messageId: "m2",
      messageIndex: 2,
      swipeKey: "index-0",
      swipeIndex: 0,
      swipeId: null,
      swipeContentHash: "hash-m2",
      swipeKeySource: "swipe_index",
      createdAt: "2003-09-22T16:19:00.000Z",
      presetId: "preset-a",
      presetName: "Preset A",
      storageKey: "key-2",
    },
  ]);
  const updated = upsertMessageSnapshotIndexEntry(original, {
    messageId: "m2",
    messageIndex: 2,
    swipeKey: "index-1",
    swipeIndex: 1,
    swipeId: null,
    swipeContentHash: "hash-m2b",
    swipeKeySource: "swipe_index",
    createdAt: "2003-09-22T16:20:00.000Z",
    presetId: "preset-b",
    presetName: "Preset B",
    storageKey: "key-2-new",
  });

  assert.deepEqual(updated.map((entry) => `${entry.messageId}:${entry.swipeKey}`), ["m1:index-0", "m2:index-0", "m2:index-1"]);
  assert.deepEqual(updated[0], original[0]);
  assert.equal(updated[2]?.presetName, "Preset B");
  assert.equal(updated[2]?.storageKey, "key-2-new");
});

test("removeMessageSnapshotIndexEntry deletes only the selected message swipe", () => {
  const index = repairMessageSnapshotIndex([
    {
      messageId: "m2",
      messageIndex: 2,
      swipeKey: "index-0",
      swipeIndex: 0,
      swipeKeySource: "swipe_index",
      storageKey: "key-a",
      createdAt: "2003-09-22T16:19:00.000Z",
    },
    {
      messageId: "m2",
      messageIndex: 2,
      swipeKey: "index-1",
      swipeIndex: 1,
      swipeKeySource: "swipe_index",
      storageKey: "key-b",
      createdAt: "2003-09-22T16:20:00.000Z",
    },
  ]);
  const next = removeMessageSnapshotIndexEntry(index, "m2", "index-1");
  assert.deepEqual(next.map((entry) => `${entry.messageId}:${entry.swipeKey}`), ["m2:index-0"]);
});

test("snapshots preserve preset metadata and older snapshots normalize missing metadata", () => {
  assert.equal(sampleSnapshot.presetId, DEFAULT_TRACKER_PRESET.id);
  assert.equal(sampleMessageSnapshot.presetName, DEFAULT_TRACKER_PRESET.name);

  const olderSnapshot = normalizeTrackerSnapshotPresetMetadata({
    schemaVersion: 1,
    extensionVersion: "0.06",
    chatId: "chat-old",
    createdAt: "2003-09-22T16:00:00.000Z",
    messageCount: 2,
    sourceMessageIds: ["old-1"],
    data: { scene: { location: "Archive" } },
  } as TrackerSnapshot);
  assert.equal(olderSnapshot.presetId, null);
  assert.equal(olderSnapshot.presetName, null);
  assert.equal(olderSnapshot.presetVersion, null);
  assert.equal(olderSnapshot.generationStartedAt, null);
  assert.equal(olderSnapshot.generationCompletedAt, null);
  assert.equal(olderSnapshot.generationDurationMs, null);
  assert.equal(olderSnapshot.generationCancelledAt, null);
  assert.equal(olderSnapshot.generationStatus, null);

  const olderAttached = normalizeMessageAttachedSnapshotPresetMetadata({
    ...sampleMessageSnapshot,
    swipeKey: undefined,
    swipeIndex: undefined,
    swipeId: undefined,
    swipeContentHash: undefined,
    swipeKeySource: undefined,
    presetId: undefined,
    presetName: undefined,
    presetVersion: undefined,
    snapshot: olderSnapshot,
  } as unknown as MessageAttachedSnapshot);
  assert.equal(olderAttached.presetId, null);
  assert.equal(olderAttached.presetName, null);
  assert.equal(olderAttached.presetVersion, null);
  assert.equal(olderAttached.swipeKey, DEFAULT_SWIPE_KEY);
  assert.equal(olderAttached.swipeKeySource, "unknown");
});

test("repairSettings repairs memory and prompt injection settings with defaults and clamping", () => {
  const migrated = repairSettings({ recentMessageLimit: 8 });
  assert.equal(migrated.memory.enabled, true);
  assert.equal(migrated.memory.includeInTrackerGeneration, true);
  assert.equal(migrated.memory.retainCount, 2);
  assert.equal(migrated.memory.fullSnapshotCount, 1);
  assert.equal(migrated.memory.maxMemoryChars, estimateCharsFromTokens(NORMAL_BUDGET_DEFAULTS.trackerMemoryBudgetTokens));
  assert.equal(migrated.memory.source, "sidecar_index");
  assert.equal(migrated.memory.requireSameSwipeWhenAvailable, true);
  assert.equal(migrated.injection.enabled, false);
  assert.equal(migrated.injection.retainCount, 1);
  assert.equal(migrated.injection.format, "minimal");
  assert.equal(migrated.injection.injectionPlacement, "system_before_last");
  assert.equal(migrated.injection.isolationMode, "latest_selected_swipe_only");

  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    memory: {
      enabled: false,
      includeInTrackerGeneration: false,
      retainCount: 999,
      fullSnapshotCount: -5,
      compactOlderSnapshots: true,
      maxMemoryChars: 999999,
      source: "embedded_tags",
      excludeTargetMessage: false,
      order: "newest_to_oldest",
      requireSamePreset: true,
      requireSameSwipeWhenAvailable: true,
    },
    injection: {
      enabled: true,
      retainCount: 999,
      format: "compact",
      injectionPlacement: "system_before_last",
      isolationMode: "legacy_recent",
      includeOnlyIfMissingFromPrompt: false,
      stripOlderTrackerBlocks: false,
      maxInjectedChars: "999999",
      roleFallback: "assistant",
      includeHeader: false,
      header: "  Custom Tracker Header  ",
    },
  });

  assert.equal(settings.memory.enabled, false);
  assert.equal(settings.memory.includeInTrackerGeneration, false);
  assert.equal(settings.memory.retainCount, 10);
  assert.equal(settings.memory.fullSnapshotCount, 0);
  assert.equal(settings.memory.compactOlderSnapshots, true);
  assert.equal(settings.memory.maxMemoryChars, 512_000);
  assert.equal(settings.memory.source, "embedded_tags");
  assert.equal(settings.memory.excludeTargetMessage, false);
  assert.equal(settings.memory.order, "newest_to_oldest");
  assert.equal(settings.memory.requireSamePreset, true);
  assert.equal(settings.memory.requireSameSwipeWhenAvailable, true);
  assert.equal(settings.injection.enabled, true);
  assert.equal(settings.injection.retainCount, 10);
  assert.equal(settings.injection.format, "compact_text");
  assert.equal(settings.injection.injectionPlacement, "system_before_last");
  assert.equal(settings.injection.isolationMode, "legacy_recent");
  assert.equal(settings.injection.includeOnlyIfMissingFromPrompt, false);
  assert.equal(settings.injection.stripOlderTrackerBlocks, false);
  assert.equal(settings.injection.maxInjectedChars, 512_000);
  assert.equal(settings.injection.roleFallback, "assistant");
  assert.equal(settings.injection.includeHeader, false);
  assert.equal(settings.injection.header, "Custom Tracker Header");

  const repaired = repairSettings({ injection: { format: "bad", maxInjectedChars: 10, retainCount: -5 } });
  assert.equal(repaired.injection.format, DEFAULT_SETTINGS.injection.format);
  assert.equal(repaired.injection.isolationMode, DEFAULT_SETTINGS.injection.isolationMode);
  assert.equal(repaired.injection.maxInjectedChars, 1_000);
  assert.equal(repaired.injection.retainCount, 0);
});

test("formatSnapshotForInjection renders compact snapshots", () => {
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    injection: {
      ...DEFAULT_SETTINGS.injection,
      enabled: true,
      format: "compact_text",
    },
  });

  const text = formatSnapshotForInjection(sampleSnapshot, settings.injection);
  assert.match(text, /\[LTracker Recent State\]/);
  assert.match(text, /Grand Meridian Court/);
  assert.match(text, /Aleister Crowley; Sable Mareth/);
  assert.match(text, /Scholarship packet/);
});

test("formatSnapshotForInjection renders pretty JSON with source message ids", () => {
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    injection: {
      ...DEFAULT_SETTINGS.injection,
      enabled: true,
      format: "pretty_json",
    },
  });

  const text = formatSnapshotForInjection(sampleMessageSnapshot, settings.injection);
  assert.match(text, /\[LTracker Recent State\]/);
  assert.match(text, /Source message: m2/);
  assert.match(text, /"messageId": "m2"/);
  assert.match(text, /"Grand Meridian Court"/);
});

test("formatSnapshotForInjection renders minimal snapshots", () => {
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    injection: {
      ...DEFAULT_SETTINGS.injection,
      enabled: true,
      format: "minimal",
    },
  });

  const text = formatSnapshotForInjection(sampleSnapshot, settings.injection);
  assert.match(text, /\[LTracker Recent State\]/);
  assert.match(text, /Location: Grand Meridian Court/);
  assert.match(text, /Cast: Aleister Crowley; Sable Mareth/);
  assert.match(text, /Continuity:/);
});

test("formatSnapshotForInjection renders embedded tracker tags", () => {
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    injection: {
      ...DEFAULT_SETTINGS.injection,
      enabled: true,
      format: "embedded_tag",
    },
  });

  const text = formatSnapshotForInjection(sampleSnapshot, settings.injection);
  assert.match(text, /<ltracker type="state">/);
  assert.match(text, /"Grand Meridian Court"/);
  assert.match(text, /<\/ltracker>/);
});

test("truncateSafe respects maxInjectedChars without splitting Unicode code points", () => {
  const text = truncateSafe("alpha 😀 beta gamma", 14);
  assert.ok(Array.from(text).length <= 14);
  assert.match(text, /\[truncated\]/);
});

test("buildInjectionDecision returns empty when disabled or snapshot is absent", () => {
  const disabled = buildInjectionDecision({
    settings: DEFAULT_SETTINGS,
    chatSnapshot: sampleSnapshot,
    messageSnapshot: null,
    internalTrackerGeneration: false,
  });
  assert.equal(disabled.text, null);
  assert.equal(disabled.skippedReason, "Injection is disabled.");

  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    injection: {
      ...DEFAULT_SETTINGS.injection,
      enabled: true,
    },
  });
  const missing = buildInjectionDecision({
    settings,
    chatSnapshot: null,
    messageSnapshot: null,
    internalTrackerGeneration: false,
  });
  assert.equal(missing.text, null);
  assert.equal(missing.skippedReason, "No cached tracker snapshot exists.");
});

test("buildInjectionDecision injects message snapshots when selected", () => {
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    injection: {
      ...DEFAULT_SETTINGS.injection,
      enabled: true,
      format: "pretty_json",
    },
  });
  const decision = buildInjectionDecision({
    settings,
    chatSnapshot: sampleSnapshot,
    messageSnapshot: sampleMessageSnapshot,
    internalTrackerGeneration: false,
  });
  assert.match(decision.text ?? "", /Source message: m2/);
  assert.equal(decision.sourceMessageId, "m2");
  assert.equal(decision.snapshotCreatedAt, sampleSnapshot.createdAt);
});

function memoryEntry(
  messageId: string,
  messageIndex: number,
  payload: Record<string, unknown>,
  extras: Partial<TrackerMemoryEntry> = {},
): TrackerMemoryEntry {
  return {
    messageId,
    messageIndex,
    swipeKey: extras.swipeKey ?? "index-0",
    presetId: extras.presetId ?? DEFAULT_TRACKER_PRESET.id,
    presetName: extras.presetName ?? DEFAULT_TRACKER_PRESET.name,
    createdAt: extras.createdAt ?? `2003-09-22T16:${String(messageIndex).padStart(2, "0")}:00.000Z`,
    source: extras.source ?? "sidecar_snapshot",
    payload,
    text: extras.text ?? JSON.stringify(payload, null, 2),
  };
}

const promptInjectionBoundary: PromptInjectionBoundary = {
  verified: true,
  boundaryMessageId: "u3",
  boundaryMessageIndex: 3,
  latestAssistantMessageId: "a2",
  latestAssistantMessageIndex: 2,
  selectedSwipeKey: "index-1",
  selectedSwipeByMessageId: {
    a1: "index-0",
    a2: "index-1",
  },
};

test("prompt injection isolation accepts only the latest selected swipe snapshot", () => {
  const selected = memoryEntry("a2", 2, { scene: { location: "Office door" } }, { swipeKey: "index-1" });
  const alternate = memoryEntry("a2", 2, { scene: { location: "Room 214" } }, { swipeKey: "index-0" });
  const prior = memoryEntry("a1", 1, { scene: { location: "Hall" } }, { swipeKey: "index-0" });
  const result = isolatePromptInjectionEntries({
    entries: [prior, alternate, selected],
    isolationMode: "latest_selected_swipe_only",
    retainCount: 1,
    boundary: promptInjectionBoundary,
  });
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.entries[0]?.messageId, "a2");
  assert.equal(result.entries[0]?.swipeKey, "index-1");
  assert.ok(result.rejectedReasons.includes("skipped_non_selected_swipe"));
  assert.ok(result.rejectedReasons.includes("skipped_no_selected_swipe_match"));
});

test("prompt injection isolation rejects future, global, non-prompt, and ambiguous candidates", () => {
  const future = memoryEntry("a4", 4, { scene: { location: "Future" } }, { swipeKey: "index-0" });
  const global: TrackerMemoryEntry = {
    ...memoryEntry("global", 9, { scene: { location: "Global stale" } }),
    messageId: null,
    messageIndex: null,
    swipeKey: null,
    source: "latest_chat_snapshot",
  };
  const nonPrompt = memoryEntry("a-missing", 1, { scene: { location: "Missing" } }, { swipeKey: "index-0" });
  const selected = memoryEntry("a2", 2, { scene: { location: "Office door" } }, { swipeKey: "index-1" });
  const result = isolatePromptInjectionEntries({
    entries: [future, global, nonPrompt, selected],
    isolationMode: "same_swipe_chain",
    retainCount: 4,
    boundary: promptInjectionBoundary,
  });
  assert.deepEqual(result.entries.map((entry) => entry.messageId), ["a2"]);
  assert.ok(result.rejectedReasons.includes("skipped_future_message_index"));
  assert.ok(result.rejectedReasons.includes("skipped_global_snapshot_unverified"));
  assert.ok(result.rejectedReasons.includes("skipped_message_not_in_prompt"));

  const ambiguous = isolatePromptInjectionEntries({
    entries: [selected],
    isolationMode: "latest_selected_swipe_only",
    retainCount: 1,
    boundary: { ...promptInjectionBoundary, verified: false, boundaryMessageId: null, boundaryMessageIndex: null },
  });
  assert.equal(ambiguous.acceptedCount, 0);
  assert.ok(ambiguous.rejectedReasons.includes("skipped_ambiguous_prompt_boundary"));
});

test("prompt injection strips stale existing tracker blocks in swipe-isolated modes", () => {
  const staleTag = buildLTrackerTag(JSON.stringify({ scene: { location: "Room 214" } }), "index-0");
  const selected = memoryEntry("a2", 2, { scene: { location: "Office door" } }, { swipeKey: "index-1" });
  const result = applyPromptInjection({
    messages: [
      { role: "assistant", content: `Well?\n\n${staleTag}` },
      { role: "user", content: "Reply" },
    ],
    entries: [selected],
    settings: {
      ...DEFAULT_SETTINGS.injection,
      enabled: true,
      retainCount: 1,
      format: "minimal",
      isolationMode: "latest_selected_swipe_only",
      stripOlderTrackerBlocks: true,
    },
  });
  assert.equal(result.strippedCount, 1);
  assert.equal(result.injectedCount, 1);
  assert.equal(countTrackerBlocks(result.messages), 0);
  assert.doesNotMatch(JSON.stringify(result.messages), /Room 214/);
  assert.match(JSON.stringify(result.messages), /Office door/);
});

test("prompt injection safety report includes boundary, selected swipe, and rejection reasons", () => {
  const selected = memoryEntry("a2", 2, { scene: { location: "Office door" } }, { swipeKey: "index-1" });
  const result = isolatePromptInjectionEntries({
    entries: [selected],
    isolationMode: "latest_selected_swipe_only",
    retainCount: 1,
    boundary: promptInjectionBoundary,
  });
  const report = buildPromptInjectionSafetyReport({
    enabled: true,
    isolationMode: "latest_selected_swipe_only",
    boundary: promptInjectionBoundary,
    result,
  });
  assert.match(report, /boundaryMessageId: u3/);
  assert.match(report, /selectedSwipeKey: index-1/);
  assert.match(report, /candidatesInjected: 1/);
});

test("tracker memory can retain last three, exclude target, dedupe, and sort oldest to newest", () => {
  const entries = [
    memoryEntry("m1", 1, { scene: { location: "One" } }),
    memoryEntry("m2", 2, { scene: { location: "Two" } }),
    memoryEntry("m3", 3, { scene: { location: "Three" } }),
    memoryEntry("m3-dupe", 4, { scene: { location: "Three" } }),
    memoryEntry("m4", 5, { scene: { location: "Current" } }),
  ];
  const result = buildTrackerMemoryResult(entries, {
    ...DEFAULT_SETTINGS.memory,
    retainCount: 3,
    fullSnapshotCount: 3,
  }, {
    targetMessageId: "m4",
    targetSwipeKey: "index-0",
    activePreset: DEFAULT_TRACKER_PRESET,
  });
  assert.equal(result.entries.length, 3);
  assert.deepEqual(result.entries.map((entry) => entry.messageId), ["m1", "m2", "m3"]);
  assert.match(result.renderedText, /Previous tracker states/);
  assert.match(result.renderedText, /--- 3 turns ago ---/);
  assert.match(result.renderedText, /--- Most recent ---/);
  assert.doesNotMatch(result.renderedText, /Current/);
});

test("tracker memory handles retain zero, sunset, and max char truncation", () => {
  const entries = [
    memoryEntry("m1", 1, { scene: { location: "One" } }),
    memoryEntry("m2", 2, { scene: { location: "Two" } }),
    memoryEntry("m3", 3, { scene: { location: "Three" }, important_facts: ["x".repeat(2000)] }),
  ];
  const none = buildTrackerMemoryResult(entries, { ...DEFAULT_SETTINGS.memory, retainCount: 0 });
  assert.equal(none.entries.length, 0);
  assert.equal(none.skippedReason, "Tracker memory retain count is 0.");

  const sunset = buildTrackerMemoryResult(entries, {
    ...DEFAULT_SETTINGS.memory,
    retainCount: 3,
    fullSnapshotCount: 1,
    maxMemoryChars: 5000,
  });
  assert.equal(sunset.entries.length, 1);
  assert.match(sunset.renderedText, /older tracker snapshots omitted/);

  const truncated = buildTrackerMemoryResult(entries, {
    ...DEFAULT_SETTINGS.memory,
    maxMemoryChars: 1000,
  });
  assert.equal(truncated.truncated, true);
  assert.ok(truncated.totalChars <= 1000);
});

test("buildTrackerPrompt includes prior memory and baseline instructions", () => {
  const memory = buildTrackerMemoryResult([
    memoryEntry("m1", 1, { scene: { location: "Old Hall" }, characters_present: ["Ari"] }),
    memoryEntry("m2", 2, { scene: { location: "New Hall" }, characters_present: ["Ari", "Bea"] }),
  ], DEFAULT_SETTINGS.memory);
  const prompt = buildTrackerPrompt("[3 USER Trent]\nThey move to the garden.", DEFAULT_TRACKER_PRESET, memory);
  const joined = prompt.map((message) => message.content).join("\n");
  assert.match(joined, /Previous tracker states/);
  assert.match(joined, /Use the most recent prior tracker state as the baseline/);
  assert.match(joined, /current transcript wins/i);
  assert.match(joined, /Recent conversation:/);
});

test("repairSettings adds context filter defaults without changing existing prompt behavior", () => {
  const settings = repairSettings({});
  assert.equal(settings.contextFilters.enabled, false);
  assert.equal(settings.contextFilters.includeChatMessages, true);
  assert.equal(settings.contextFilters.includeTrackerMemory, true);
  assert.equal(settings.contextFilters.includeWorldLoreContext, false);
  assert.equal(settings.contextFilters.includeCharacterContext, false);
  assert.equal(settings.contextFilters.includePersonaContext, false);
});

test("repairSettings repairs context filters, clamps budgets, and normalizes lists", () => {
  const settings = repairSettings({
    contextFilters: {
      enabled: true,
      maxWorldLoreChars: 999_999_999,
      maxCharacterContextChars: -10,
      maxPersonaContextChars: "12000",
      excludedCharacterNames: ["Ari", " ari ", "", 22],
      excludedMessageNamePatterns: "OOC, narrator\nsystem",
      manualWorldLoreContext: "x".repeat(600_000),
    },
  });
  assert.equal(settings.contextFilters.enabled, true);
  assert.equal(settings.contextFilters.maxWorldLoreChars, 512_000);
  assert.equal(settings.contextFilters.maxCharacterContextChars, 0);
  assert.equal(settings.contextFilters.maxPersonaContextChars, 12_000);
  assert.deepEqual(settings.contextFilters.excludedCharacterNames, ["Ari"]);
  assert.deepEqual(settings.contextFilters.excludedMessageNamePatterns, ["OOC", "narrator", "system"]);
  assert.equal(settings.contextFilters.manualWorldLoreContext.length, 512_000);
});

test("context filters exclude matching names without mutating original transcript", () => {
  const messages = [
    { index: 0, role: "user" as const, name: "Trent", content: "hello" },
    { index: 1, role: "assistant" as const, name: "Narrator", content: "OOC: pause" },
    { index: 2, role: "assistant" as const, name: "Cecelia Voss", content: "scene text" },
  ];
  const original = JSON.stringify(messages);
  const settings = repairSettings({
    contextFilters: {
      enabled: true,
      excludedCharacterNames: ["cecelia voss"],
      excludedMessageNamePatterns: ["OOC"],
      requireExactCharacterNameMatch: true,
      caseSensitiveExclusions: false,
    },
  });
  const result = applyContextFiltersToTranscript(messages, settings.contextFilters);
  assert.equal(JSON.stringify(messages), original);
  assert.equal(result.messageCount, 3);
  assert.equal(result.includedCount, 1);
  assert.equal(result.excludedCount, 2);
  assert.deepEqual(result.excludedNames.sort(), ["Cecelia Voss", "Narrator"]);
  assert.match(formatContextFilterReport(result), /Messages included: 1/);
});

test("context filters support exact and contains matching modes", () => {
  const messages = [
    { index: 0, role: "assistant" as const, name: "Cecelia Voss Prime", content: "hello" },
  ];
  const exact = repairSettings({
    contextFilters: {
      enabled: true,
      excludedCharacterNames: ["Cecelia Voss"],
      requireExactCharacterNameMatch: true,
    },
  });
  assert.equal(applyContextFiltersToTranscript(messages, exact.contextFilters).includedCount, 1);
  const contains = repairSettings({
    contextFilters: {
      enabled: true,
      excludedCharacterNames: ["Cecelia Voss"],
      requireExactCharacterNameMatch: false,
    },
  });
  assert.equal(applyContextFiltersToTranscript(messages, contains.contextFilters).includedCount, 0);
});

test("context filters warn when they remove every chat message", () => {
  const settings = repairSettings({
    contextFilters: {
      enabled: true,
      excludeUserMessages: true,
      excludeAssistantMessages: true,
    },
  });
  const result = applyContextFiltersToTranscript([
    { index: 0, role: "user" as const, name: "Trent", content: "hello" },
    { index: 1, role: "assistant" as const, name: "Ari", content: "reply" },
  ], settings.contextFilters);
  assert.equal(result.includedCount, 0);
  assert.match(result.warning ?? "", /excluded every chat message/);
});

test("auto context filter skip reason applies only to auto generation", () => {
  const settings = repairSettings({
    contextFilters: {
      enabled: true,
      excludedCharacterNames: ["Ari"],
      disableAutoForExcludedNames: true,
    },
  });
  const reason = autoSkipReasonForContextFilters({
    settings,
    role: "assistant",
    name: "Ari",
    content: "reply",
  });
  assert.match(reason ?? "", /Auto skipped by context filters/);
  assert.equal(settings.contextFilters.enabled, true);
});

test("context budget preview includes chat, memory, lore, character, and persona buckets", () => {
  const preview = contextBudgetPreview([
    { key: "messages", label: "Chat transcript", text: "hello" },
    { key: "memory", label: "Tracker memory", text: "old state" },
    { key: "lore", label: "World/lore", text: "lore" },
    { key: "character", label: "Character context", text: "char" },
    { key: "persona", label: "Persona/manual notes", text: "persona" },
  ]);
  assert.deepEqual(preview.buckets.map((bucket) => bucket.key), ["messages", "memory", "lore", "character", "persona"]);
  assert.ok(preview.totalEstimatedTokens > 0);
});

test("buildTrackerPrompt includes additional context sections and filter summary", () => {
  const prompt = buildTrackerPrompt("[0 USER Trent]\nHello", DEFAULT_TRACKER_PRESET, null, {
    contextBlocks: [{ title: "World / Lore Context", text: "Activated entry: tower" }],
    filterSummary: "Messages included: 1",
  });
  const joined = prompt.map((message) => message.content).join("\n");
  assert.match(joined, /Additional context sources/);
  assert.match(joined, /\[World \/ Lore Context\]/);
  assert.match(joined, /Context filter summary/);
});

test("prompt interceptor disabled returns the original frozen messages unchanged", () => {
  const frozenMessage = Object.freeze({ role: "user" as const, content: "hello" });
  const messages = Object.freeze([frozenMessage]);
  const result = applyPromptInjection({
    messages,
    entries: [],
    settings: DEFAULT_SETTINGS.injection,
  });
  assert.equal(result.messages, messages);
  assert.equal(result.skippedReason, "Prompt injection is disabled.");
  assert.deepEqual(messages[0], { role: "user", content: "hello" });
});

test("prompt interceptor clones frozen messages, strips older blocks, and injects retained memory", () => {
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    injection: {
      ...DEFAULT_SETTINGS.injection,
      enabled: true,
      retainCount: 1,
      format: "embedded_tag",
      isolationMode: "legacy_recent",
      injectionPlacement: "append_to_last_assistant",
      stripOlderTrackerBlocks: true,
      includeOnlyIfMissingFromPrompt: false,
    },
  }).injection;
  const olderBlock = buildLTrackerTag("{\"older\":true}", "index-0");
  const keptBlock = buildLTrackerTag("{\"kept\":true}", "index-1");
  const frozenAssistant = Object.freeze({ role: "assistant" as const, content: `reply\n\n${olderBlock}\n\n${keptBlock}` });
  const messages = Object.freeze([
    Object.freeze({ role: "user" as const, content: "hello" }),
    frozenAssistant,
  ]);
  const result = applyPromptInjection({
    messages,
    entries: [memoryEntry("m2", 2, { scene: { location: "Fresh" } })],
    settings,
  });
  assert.notEqual(result.messages, messages);
  assert.equal(result.injectedCount, 1);
  assert.equal(result.strippedCount, 1);
  assert.equal(countTrackerBlocks(result.messages), 2);
  assert.match(String(result.messages[1]?.content), /Fresh/);
  assert.match(String(result.messages[1]?.content), /kept/);
  assert.doesNotMatch(String(result.messages[1]?.content), /older/);
  assert.equal(frozenAssistant.content, `reply\n\n${olderBlock}\n\n${keptBlock}`);
});

test("prompt interceptor skips when enough tracker blocks already exist and catches errors", () => {
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    injection: {
      ...DEFAULT_SETTINGS.injection,
      enabled: true,
      retainCount: 1,
      isolationMode: "legacy_recent",
    },
  }).injection;
  const existing = [{ role: "assistant" as const, content: buildLTrackerTag("{\"ok\":true}", "index-0") }];
  const skipped = applyPromptInjection({
    messages: existing,
    entries: [memoryEntry("m1", 1, { scene: { location: "Fresh" } })],
    settings,
  });
  assert.equal(skipped.injectedCount, 0);
  assert.equal(skipped.skippedReason, "Prompt already contains retained tracker blocks.");

  const failed = applyPromptInjection({
    messages: existing,
    entries: [],
    settings,
    simulateError: true,
  });
  assert.equal(failed.messages, existing);
  assert.equal(failed.error, "Simulated interceptor failure.");
  assert.equal(failed.skippedReason, "Prompt injection failed safely.");
});

test("prompt injection supports embedded tag, compact text, pretty JSON, and minimal formats", () => {
  const entry = memoryEntry("m1", 1, { scene: { location: "Arcade", time: "night" }, characters_present: ["Ari"] });
  for (const format of ["embedded_tag", "compact_text", "pretty_json", "minimal"] as const) {
    const settings = repairSettings({
      ...DEFAULT_SETTINGS,
      injection: {
        ...DEFAULT_SETTINGS.injection,
        enabled: true,
        format,
      },
    }).injection;
    const text = formatTrackerInjectionBlock([entry], settings);
    assert.match(text, /Arcade/);
  }
});

test("context injection helper skips internal tracker generation", () => {
  assert.equal(shouldSkipContextForInternalGeneration({}, true), true);
  assert.equal(shouldSkipContextForInternalGeneration({ input: { type: "quiet" } }, false), true);
  assert.equal(shouldSkipContextForInternalGeneration({ request: { metadata: { source: "ltracker" } } }, false), true);
  assert.equal(shouldSkipContextForInternalGeneration({ input: { type: "raw" } }, false), false);
});

test("built-in default preset loads with the default tracker schema", () => {
  assert.equal(DEFAULT_TRACKER_PRESET.id, DEFAULT_TRACKER_PRESET_ID);
  assert.equal(DEFAULT_TRACKER_PRESET.name, "Default Scene Tracker");
  assert.deepEqual(DEFAULT_TRACKER_PRESET.jsonSchema, DEFAULT_TRACKER_SCHEMA);
  assert.equal(DEFAULT_TRACKER_PRESET.origin, "built_in");
});

test("preset validation rejects invalid JSON schema", () => {
  assert.equal(validateJsonSchema([]).ok, false);
  assert.equal(validateJsonSchema("not schema").ok, false);
  assert.equal(validateJsonSchema({ type: "object" }).ok, true);
});

test("preset import rejects wrong kind", () => {
  const result = importTrackerPresetEnvelope({
    kind: "wrong",
    formatVersion: 1,
    preset: DEFAULT_TRACKER_PRESET,
  }, [], "2026-06-27T00:00:00.000Z");
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /kind/);
});

test("preset import rejects wrong format version", () => {
  const result = importTrackerPresetEnvelope({
    kind: "ltracker_schema_preset",
    formatVersion: 99,
    preset: DEFAULT_TRACKER_PRESET,
  }, [], "2026-06-27T00:00:00.000Z");
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /format version/);
});

test("preset import resolves id conflicts and preserves HTML as text", () => {
  const envelope = exportTrackerPreset({
    ...DEFAULT_TRACKER_PRESET,
    id: "custom",
    origin: "user_created",
    htmlTemplate: "<div>{{scene.location}}</div>",
  });
  const result = importTrackerPresetEnvelope(envelope, ["custom"], "2026-06-27T00:00:00.000Z");
  assert.equal(result.ok, true);
  assert.notEqual(result.preset?.id, "custom");
  assert.equal(result.preset?.origin, "user_imported");
  assert.equal(result.preset?.htmlTemplate, "<div>{{scene.location}}</div>");
});

test("built-in preset cannot be overwritten", () => {
  assert.equal(canModifyPreset(DEFAULT_TRACKER_PRESET), false);
});

test("selected missing preset falls back to default", () => {
  const resolved = resolveSelectedPreset([DEFAULT_TRACKER_PRESET], "missing");
  assert.equal(resolved.preset.id, DEFAULT_TRACKER_PRESET_ID);
  assert.match(resolved.fallbackReason ?? "", /missing/);
});

test("buildTrackerPrompt includes selected preset schema and instructions", () => {
  const preset = {
    ...DEFAULT_TRACKER_PRESET,
    id: "custom",
    name: "Custom Tracker",
    jsonSchema: {
      scene: {
        location: "",
      },
      custom_state: "",
    },
    promptInstructions: "Track the ritual pressure and unresolved magical bargains.",
    htmlTemplate: "<section>Do not render me</section>",
  };
  const prompt = buildTrackerPrompt("[0 USER Trent]\nHello", preset);
  const joined = prompt.map((message) => message.content).join("\n");
  assert.match(joined, /Custom Tracker/);
  assert.match(joined, /custom_state/);
  assert.match(joined, /ritual pressure/);
  assert.match(joined, /Return JSON only/);
  assert.doesNotMatch(joined, /<section>Do not render me<\/section>/);
});

test("renderHtmlTemplate replaces nested path values", () => {
  const result = renderHtmlTemplate({
    template: "<section>{{scene.location}} at {{scene.time}}</section>",
    snapshotData: sampleSnapshot.data,
    presetId: "custom",
    presetName: "Custom",
  });
  assert.equal(result.ok, true);
  assert.match(result.html, /Grand Meridian Court at late afternoon/);
});

test("renderHtmlTemplate replaces missing paths with placeholder", () => {
  const result = renderHtmlTemplate({
    template: "<p>{{scene.weather}}</p>",
    snapshotData: sampleSnapshot.data,
    presetId: "custom",
    presetName: "Custom",
  }, { missingValuePlaceholder: "unknown" });
  assert.match(result.html, /unknown/);
});

test("renderHtmlTemplate escapes inserted values", () => {
  const result = renderHtmlTemplate({
    template: "<p>{{danger}}</p>",
    snapshotData: { danger: "<script>alert(1)</script>" },
    presetId: "custom",
    presetName: "Custom",
  });
  assert.doesNotMatch(result.html, /<script>/);
  assert.match(result.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("renderHtmlTemplate json helper escapes JSON text", () => {
  const result = renderHtmlTemplate({
    template: "<pre>{{json scene}}</pre>",
    snapshotData: { scene: { location: "<Court>" } },
    presetId: "custom",
    presetName: "Custom",
  });
  assert.match(result.html, /&quot;location&quot;/);
  assert.match(result.html, /&lt;Court&gt;/);
});

test("renderHtmlTemplate supports each blocks", () => {
  const result = renderHtmlTemplate({
    template: "<ul>{{#each characters_present}}<li>{{name}}: {{emotional_state}}</li>{{/each}}</ul>",
    snapshotData: sampleSnapshot.data,
    presetId: "custom",
    presetName: "Custom",
  });
  assert.match(result.html, /<li>Aleister Crowley: confused<\/li>/);
  assert.match(result.html, /<li>Sable Mareth: assessing him<\/li>/);
});

test("sanitizeHtml strips unsafe script tags", () => {
  const sanitized = sanitizeHtml("<section>safe</section><script>alert(1)</script>");
  assert.equal(sanitized.html, "<section>safe</section>");
  assert.doesNotMatch(sanitized.html, /alert/);
  assert.ok(sanitized.warnings.some((warning) => warning.includes("script")));
});

test("sanitizeHtml strips event handler attributes", () => {
  const sanitized = sanitizeHtml("<div onclick=\"alert(1)\" class=\"ok\">Safe</div>");
  assert.equal(sanitized.html, "<div class=\"ok\">Safe</div>");
  assert.ok(sanitized.warnings.some((warning) => warning.includes("event attribute")));
});

test("sanitizeHtml strips URL-bearing attributes", () => {
  const sanitized = sanitizeHtml("<p href=\"x\" src=\"x\" srcdoc=\"x\" title=\"ok\">Safe</p>");
  assert.equal(sanitized.html, "<p title=\"ok\">Safe</p>");
  assert.ok(sanitized.warnings.some((warning) => warning.includes("href")));
  assert.ok(sanitized.warnings.some((warning) => warning.includes("src")));
  assert.ok(sanitized.warnings.some((warning) => warning.includes("srcdoc")));
});

test("sanitizeHtml strips unknown tags", () => {
  const sanitized = sanitizeHtml("<blink>loud</blink><section>safe</section>");
  assert.equal(sanitized.html, "loud<section>safe</section>");
  assert.ok(sanitized.warnings.some((warning) => warning.includes("blink")));
});

test("sanitizeHtml strips inline style by default", () => {
  const sanitized = sanitizeHtml("<div style=\"color: red\" class=\"ok\">Safe</div>");
  assert.equal(sanitized.html, "<div class=\"ok\">Safe</div>");
  assert.ok(sanitized.warnings.some((warning) => warning.includes("inline style")));
});

test("sanitizeHtml keeps only safe inline styles when enabled", () => {
  const sanitized = sanitizeHtml(
    "<div style=\"color: red; background-image: url(x); padding: 4px; position: fixed\">Safe</div>",
    { allowInlineStyles: true },
  );
  assert.equal(sanitized.html, "<div style=\"color: red; padding: 4px; position: fixed\">Safe</div>");
  assert.ok(sanitized.warnings.some((warning) => warning.includes("background-image")));
});

test("sanitizeHtml preserves expanded safe inline styles", () => {
  const sanitized = sanitizeHtml(
    "<section style=\"background-color: #101820; border: 1px solid currentColor; box-shadow: 0 1px 4px rgba(0,0,0,.2); display: grid; grid-template-rows: auto 1fr; row-gap: 6px; overflow-wrap: anywhere; max-width: 42rem\">Safe</section>",
    { allowInlineStyles: true },
  );
  assert.match(sanitized.html, /background-color: #101820/);
  assert.match(sanitized.html, /box-shadow: 0 1px 4px rgba\(0,0,0,.2\)/);
  assert.match(sanitized.html, /grid-template-rows: auto 1fr/);
  assert.match(sanitized.html, /overflow-wrap: anywhere/);
  assert.equal(sanitized.warnings.length, 0);
});

test("sanitizeHtml only allows open on details", () => {
  const sanitized = sanitizeHtml("<details open><summary>A</summary>B</details><div open>Bad</div>");
  assert.match(sanitized.html, /<details open>/);
  assert.doesNotMatch(sanitized.html, /<div open>/);
  assert.ok(sanitized.warnings.some((warning) => warning.includes("open")));
});

test("safe mode removes full style blocks without visible CSS leakage", () => {
  const sanitized = sanitizeHtml("<style>.card{color:red}</style><section>Safe</section>", {
    templateTrustMode: "safe",
  });
  assert.equal(sanitized.html, "<section>Safe</section>");
  assert.doesNotMatch(sanitized.html, /\.card/);
  assert.ok(sanitized.warnings.some((warning) => warning.includes("<style>")));
});

test("trusted mode preserves scoped style blocks and prevents host escape", () => {
  const result = renderHtmlTemplate({
    template: "<style>.card{color:red} body{color:blue}</style><section class=\"card\">{{scene.location}}</section>",
    snapshotData: sampleSnapshot.data,
    presetId: "custom",
    presetName: "Custom",
  }, {
    allowInlineStyles: true,
    templateTrustMode: "trusted",
  });
  assert.match(result.html, /<style>\.ltracker-preset-scope-[a-z0-9]+ \.card\{color: red\}<\/style>/);
  assert.doesNotMatch(result.html, /body\{color: blue\}/);
  assert.match(result.html, /Grand Meridian Court/);
});

test("safe and trusted SVG modes use the trusted allowlist", () => {
  const safe = sanitizeHtml("<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\"></circle></svg>", {
    templateTrustMode: "safe",
  });
  assert.doesNotMatch(safe.html, /<svg/);

  const trusted = sanitizeHtml("<svg viewBox=\"0 0 10 10\" onclick=\"bad()\"><circle cx=\"5\" cy=\"5\" r=\"4\" fill=\"currentColor\"></circle><script>bad()</script><foreignObject>bad</foreignObject></svg>", {
    allowInlineStyles: true,
    templateTrustMode: "trusted",
  });
  assert.match(trusted.html, /<svg viewBox="0 0 10 10">/);
  assert.match(trusted.html, /<circle cx="5" cy="5" r="4" fill="currentColor"><\/circle>/);
  assert.doesNotMatch(trusted.html, /onclick|foreignObject|<script>|bad\(\)/);
});

test("trusted sanitizer strips event handlers and external URLs", () => {
  const sanitized = sanitizeHtml("<section onclick=\"bad()\" style=\"background-image: url(https://evil.test/a.png); color: red\">Safe</section><svg><use href=\"https://evil.test/icon.svg#x\"></use></svg>", {
    allowInlineStyles: true,
    templateTrustMode: "trusted",
  });
  assert.equal(sanitized.html, "<section style=\"color: red\">Safe</section><svg></svg>");
  assert.ok(sanitized.warnings.some((warning) => warning.includes("event attribute")));
  assert.ok(sanitized.warnings.some((warning) => warning.includes("background-image") || warning.includes("URL-bearing") || warning.includes("<use>")));
});

test("renderHtmlTemplate supports conditionals, with, this, and helpers", () => {
  const result = renderHtmlTemplate({
    template: "{{#if scene.location}}<b>{{scene.location}}</b>{{else}}missing{{/if}}{{#unless empty}} ready{{/unless}}{{#with scene}}{{time}}{{/with}}<ul>{{#each active_threads}}<li>{{this}}</li>{{/each}}</ul>{{default missing \"fallback\"}} {{percent progress}} {{#if characters_present}}{{#each characters_present}}<i>{{name}}</i>{{/each}}{{/if}} {{eq count 2}} {{gt score 7}} {{lt score 9}} {{and ok scene.location}} {{or missing ok}} {{not missing}} {{lower Shout}} {{upper whisper}} {{truncate long 4}} {{class \"Hero Mode\"}}",
    snapshotData: {
      ...sampleSnapshot.data,
      empty: false,
      progress: 0.42,
      count: 2,
      score: 8,
      ok: true,
      long: "abcdef",
      Shout: "LOUD",
      whisper: "soft",
    },
    presetId: "custom",
    presetName: "Custom",
  });
  assert.match(result.html, /<b>Grand Meridian Court<\/b>/);
  assert.match(result.html, / ready/);
  assert.match(result.html, /late afternoon/);
  assert.match(result.html, /<li>Scholarship packet<\/li>/);
  assert.match(result.html, /fallback 42%/);
  assert.match(result.html, /<i>Aleister Crowley<\/i>/);
  assert.match(result.html, /true true true true true true/);
  assert.match(result.html, /loud SOFT abcd hero-mode/);
});

test("renderHtmlTemplate supports the v0.20 helper pack", () => {
  const result = renderHtmlTemplate({
    template: [
      "{{length rel}}",
      "{{join tags \" | \"}}",
      "{{pluckJoin rel \"t\" \", \"}}",
      "{{get actor \"name\"}}",
      "{{coalesce missing empty \"fallback\"}}",
      "{{isArray rel}} {{isObject actor}} {{isEmpty emptyList}} {{notEmpty rel}}",
      "{{clamp danger 0 100}} {{meterWidth progress}}",
      "{{nl2br note}}",
      "{{truncate long 5}} {{safeClass \"Hero Mode!\"}}",
      "{{chip actor.name}}",
      "{{fieldChipList rel \"t\" \"c\"}}",
    ].join(" "),
    snapshotData: {
      actor: { name: "Cecelia Voss" },
      tags: ["red", "blue"],
      rel: [{ t: "Liaison", c: "Cecelia Voss" }],
      empty: "",
      emptyList: [],
      danger: 120,
      progress: 0.42,
      note: "line one\nline two",
      long: "abcdefg",
    },
    presetId: "helpers",
    presetName: "Helpers",
  }, {
    allowInlineStyles: true,
    templateTrustMode: "trusted",
  });
  assert.equal(result.ok, true);
  assert.match(result.html, /1 red \| blue Liaison Cecelia Voss fallback/);
  assert.match(result.html, /true true true true/);
  assert.match(result.html, /100 42%/);
  assert.match(result.html, /line one<br>line two/);
  assert.match(result.html, /abcde hero-mode/);
  assert.match(result.html, /class="ltracker-template-chip ltracker-template-chip-cecelia-voss"/);
  assert.match(result.html, /<b>Liaison<\/b><span>Cecelia Voss<\/span>/);
  assert.doesNotMatch(result.html, /\[\{"t"/);
});

test("renderHtmlTemplate supports nested loops with parent, root, and index context", () => {
  const result = renderHtmlTemplate({
    template: "{{#each cast}}<h3>{{@index}} {{name}} {{@first}} {{@last}} {{@root.scene.location}}</h3>{{#each rel}}<span>{{../name}}: {{t}} {{c}}</span>{{/each}}{{/each}}",
    snapshotData: {
      scene: { location: "North Gallery" },
      cast: [
        { name: "Cecelia", rel: [{ t: "Liaison", c: "active" }] },
        { name: "Mara", rel: [{ t: "Witness", c: "uneasy" }] },
      ],
    },
    presetId: "nested",
    presetName: "Nested",
  });
  assert.match(result.html, /0 Cecelia true false North Gallery/);
  assert.match(result.html, /1 Mara false true North Gallery/);
  assert.match(result.html, /<span>Cecelia: Liaison active<\/span>/);
  assert.match(result.html, /<span>Mara: Witness uneasy<\/span>/);
});

test("summarizeWarnings deduplicates and caps render warnings", () => {
  const warnings = [
    "Removed unsupported style property position.",
    "Removed unsupported style property position.",
    "Removed unsafe attribute onclick.",
    "Removed unknown tag blink.",
  ];
  assert.deepEqual(summarizeWarnings(warnings, 2), [
    "Removed unsupported style property position. x 2",
    "Removed unsafe attribute onclick.",
    "1 more render warnings hidden.",
  ]);
});

test("renderHtmlTemplate returns fallback when no template exists", () => {
  const result = renderHtmlTemplate({
    template: "",
    snapshotData: sampleSnapshot.data,
    presetId: "custom",
    presetName: "Custom",
  });
  assert.equal(result.ok, true);
  assert.equal(result.usedFallback, true);
  assert.equal(result.html, "");
  assert.match(result.textFallback, /Scene:/);
});

function presetFixture(id: string, name: string, version: string, htmlTemplate: string): TrackerSchemaPreset {
  return {
    ...DEFAULT_TRACKER_PRESET,
    id,
    name,
    version,
    htmlTemplate,
    jsonSchema: {
      type: "object",
      title: `${name} Schema`,
      properties: {
        field: { type: "string" },
      },
    },
    promptInstructions: `Extract ${name}.`,
    origin: "user_created",
  };
}

function attachedSnapshotWithPreset(
  preset: TrackerSchemaPreset,
  data: Record<string, unknown>,
  lock = true,
): MessageAttachedSnapshot {
  const createdAt = "2026-06-28T15:00:00.000Z";
  const snapshot: TrackerSnapshot = {
    schemaVersion: 1,
    extensionVersion: EXTENSION_VERSION,
    chatId: "chat-lock",
    createdAt,
    messageCount: 1,
    sourceMessageIds: ["m-lock"],
    presetId: preset.id,
    presetName: preset.name,
    presetVersion: preset.version,
    generationStartedAt: createdAt,
    generationCompletedAt: createdAt,
    generationDurationMs: 10,
    generationCancelledAt: null,
    generationStatus: "completed",
    presetRenderLock: lock ? capturePresetRenderLock(preset, createdAt) : null,
    data,
  };
  return {
    schemaVersion: 1,
    extensionVersion: EXTENSION_VERSION,
    chatId: "chat-lock",
    messageId: "m-lock",
    messageIndex: 1,
    swipeKey: DEFAULT_SWIPE_KEY,
    swipeIndex: null,
    swipeId: null,
    swipeContentHash: null,
    swipeKeySource: "unknown",
    presetId: preset.id,
    presetName: preset.name,
    presetVersion: preset.version,
    trigger: {
      kind: "widget",
      requestId: "lock-test",
      sourceMessageId: "m-lock",
      sourceMessageIndex: 1,
      swipeKey: DEFAULT_SWIPE_KEY,
      swipeIndex: null,
      swipeId: null,
      swipeContentHash: null,
      swipeKeySource: "unknown",
    },
    snapshot,
    attachedAt: createdAt,
  };
}

test("preset render locks capture identity hashes and template copies", () => {
  const preset = presetFixture("preset-a", "Preset A", "1.0", "<section>LOCK {{field}}</section>");
  const lock = capturePresetRenderLock(preset, "2026-06-28T15:00:00.000Z");
  assert.equal(lock.presetId, "preset-a");
  assert.equal(lock.presetName, "Preset A");
  assert.equal(lock.presetVersion, "1.0");
  assert.equal(lock.schemaTitle, "Preset A Schema");
  assert.match(lock.schemaHash ?? "", /^fnv1a32-/);
  assert.match(lock.htmlTemplateHash ?? "", /^fnv1a32-/);
  assert.match(lock.promptInstructionsHash ?? "", /^fnv1a32-/);
  assert.equal(lock.htmlTemplate, "<section>LOCK {{field}}</section>");
  assert.deepEqual(lock.jsonSchema?.properties, { field: { type: "string" } });
});

test("existing snapshot renders with locked template after active preset changes", () => {
  const presetA = presetFixture("preset-a", "Preset A", "1.0", "<section>LOCK {{field}}</section>");
  const presetB = presetFixture("preset-b", "Preset B", "2.0", "<section>ACTIVE {{field}}</section>");
  const attached = attachedSnapshotWithPreset(presetA, { field: "old" }, true);
  const rendered = renderMessageTracker({
    messageId: "m-lock",
    messageIndex: 1,
    attachedSnapshot: attached,
    latestChatSnapshot: null,
    preset: presetB,
    presets: [presetB],
    activePreset: presetB,
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      renderMode: "html_template",
    },
  });
  assert.match(rendered.html, /LOCK old/);
  assert.doesNotMatch(rendered.html, /ACTIVE old/);
  assert.equal(rendered.renderPresetSource, "snapshot_render_lock");
  assert.equal(rendered.renderLockedPresetId, "preset-a");
  assert.equal(rendered.renderPresetMismatchDetected, true);
});

test("legacy snapshot resolves by installed preset id then name/version before fallback", () => {
  const presetA = presetFixture("preset-a", "Preset A", "1.0", "<section>ID {{field}}</section>");
  const presetB = presetFixture("preset-b", "Preset B", "2.0", "<section>ACTIVE {{field}}</section>");
  const byId = attachedSnapshotWithPreset(presetA, { field: "legacy" }, false);
  const renderedById = renderMessageTracker({
    messageId: "m-lock",
    messageIndex: 1,
    attachedSnapshot: byId,
    latestChatSnapshot: null,
    preset: presetB,
    presets: [presetA, presetB],
    activePreset: presetB,
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      renderMode: "html_template",
    },
  });
  assert.match(renderedById.html, /ID legacy/);
  assert.equal(renderedById.renderPresetSource, "installed_preset_id");

  const byName = attachedSnapshotWithPreset(presetA, { field: "named" }, false);
  byName.presetId = "missing-id";
  byName.snapshot.presetId = "missing-id";
  const renderedByName = renderMessageTracker({
    messageId: "m-lock",
    messageIndex: 1,
    attachedSnapshot: byName,
    latestChatSnapshot: null,
    preset: presetB,
    presets: [presetA, presetB],
    activePreset: presetB,
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      renderMode: "html_template",
    },
  });
  assert.match(renderedByName.html, /ID named/);
  assert.equal(renderedByName.renderPresetSource, "installed_preset_name_version");
});

test("legacy snapshot with unavailable original preset uses JSON fallback warning", () => {
  const presetA = presetFixture("preset-a", "Preset A", "1.0", "<section>ID {{field}}</section>");
  const presetB = presetFixture("preset-b", "Preset B", "2.0", "<section>ACTIVE {{field}}</section>");
  const attached = attachedSnapshotWithPreset(presetA, { field: "orphan" }, false);
  const rendered = renderMessageTracker({
    messageId: "m-lock",
    messageIndex: 1,
    attachedSnapshot: attached,
    latestChatSnapshot: null,
    preset: presetB,
    presets: [presetB],
    activePreset: presetB,
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      renderMode: "html_template",
    },
  });
  assert.doesNotMatch(rendered.html, /ACTIVE orphan/);
  assert.match(rendered.textFallback, /"field": "orphan"/);
  assert.equal(rendered.renderPresetSource, "json_fallback_original_preset_missing");
  assert.match(rendered.warnings.join("\n"), /Original preset unavailable/);
});

test("legacy snapshot without preset identity can use active preset fallback", () => {
  const presetB = presetFixture("preset-b", "Preset B", "2.0", "<section>ACTIVE {{field}}</section>");
  const attached = attachedSnapshotWithPreset(presetB, { field: "legacy" }, false);
  attached.presetId = null;
  attached.presetName = null;
  attached.presetVersion = null;
  attached.snapshot.presetId = null;
  attached.snapshot.presetName = null;
  attached.snapshot.presetVersion = null;
  const resolution = resolvePresetForSnapshot(attached, [presetB], presetB);
  assert.equal(resolution.source, "active_preset_legacy_fallback");
  const rendered = renderMessageTracker({
    messageId: "m-lock",
    messageIndex: 1,
    attachedSnapshot: attached,
    latestChatSnapshot: null,
    preset: presetB,
    presets: [presetB],
    activePreset: presetB,
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      renderMode: "html_template",
    },
  });
  assert.match(rendered.html, /ACTIVE legacy/);
  assert.match(rendered.warnings.join("\n"), /Legacy snapshot has no preset lock/);
});

test("drawer history renders each snapshot with its own preset lock", () => {
  const presetA = presetFixture("preset-a", "Preset A", "1.0", "<section>A {{field}}</section>");
  const presetB = presetFixture("preset-b", "Preset B", "2.0", "<section>B {{field}}</section>");
  const snapA = attachedSnapshotWithPreset(presetA, { field: "one" }, true);
  const snapB = attachedSnapshotWithPreset(presetB, { field: "two" }, true);
  snapB.messageId = "m-lock-2";
  snapB.snapshot.sourceMessageIds = ["m-lock-2"];
  const history = buildMessageTrackerHistory({
    index: [
      {
        messageId: "m-lock",
        messageIndex: 1,
        swipeKey: DEFAULT_SWIPE_KEY,
        swipeIndex: null,
        swipeId: null,
        swipeContentHash: null,
        swipeKeySource: "unknown",
        createdAt: snapA.attachedAt,
        presetId: presetA.id,
        presetName: presetA.name,
        storageKey: "a",
      },
      {
        messageId: "m-lock-2",
        messageIndex: 2,
        swipeKey: DEFAULT_SWIPE_KEY,
        swipeIndex: null,
        swipeId: null,
        swipeContentHash: null,
        swipeKeySource: "unknown",
        createdAt: snapB.attachedAt,
        presetId: presetB.id,
        presetName: presetB.name,
        storageKey: "b",
      },
    ],
    snapshots: [snapA, snapB],
    latestChatSnapshot: null,
    preset: presetB,
    presets: [presetA, presetB],
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      renderMode: "html_template",
    },
  });
  assert.match(history[0].rendered.html, /A one/);
  assert.match(history[1].rendered.html, /B two/);
});

test("renderMessageTracker selects HTML template rendering when available", () => {
  const rendered = renderMessageTracker({
    messageId: "m2",
    messageIndex: 7,
    attachedSnapshot: sampleMessageSnapshot,
    latestChatSnapshot: sampleSnapshot,
    preset: {
      ...DEFAULT_TRACKER_PRESET,
      htmlTemplate: "<section>{{scene.location}}</section>",
    },
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      renderMode: "html_template",
    },
  });
  assert.match(rendered.html, /Grand Meridian Court/);
  assert.match(rendered.widgetHtml, /LTracker/);
  assert.match(rendered.json, /"messageId": "m2"/);
});

test("renderMessageTracker emits distinct display surface shell signatures", () => {
  const base = {
    messageId: "m2",
    messageIndex: 7,
    attachedSnapshot: sampleMessageSnapshot,
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
  };
  const wide = renderMessageTracker({
    ...base,
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      displaySurface: "inline_wide",
    },
  });
  assert.match(wide.domHtml, /data-ltracker-display-surface="inline_wide"/);
  assert.match(wide.domHtml, /ltd-surface-inline-wide/);
  assert.match(wide.domHtml, /ltd-chat-width/);

  const popover = renderMessageTracker({
    ...base,
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      displaySurface: "anchored_popover",
    },
  });
  assert.match(popover.domHtml, /data-ltracker-display-surface="anchored_popover"/);
  assert.match(popover.domHtml, /ltd-surface-popover/);
  assert.match(popover.domHtml, /ltd-overlay-shell/);
});

test("renderMessageTracker keeps sanitized inline styles when message display allows them", () => {
  const rendered = renderMessageTracker({
    messageId: "m2",
    messageIndex: 7,
    attachedSnapshot: sampleMessageSnapshot,
    latestChatSnapshot: sampleSnapshot,
    preset: {
      ...DEFAULT_TRACKER_PRESET,
      htmlTemplate: "<section style=\"background-color: #101820; padding: 6px; position: fixed\">{{scene.location}}</section>",
    },
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      allowInlineStyles: true,
      renderMode: "html_template",
    },
  });
  assert.match(rendered.html, /style="background-color: #101820; padding: 6px; position: fixed"/);
  assert.equal(rendered.warnings.some((warning) => warning.includes("position")), false);
});

test("renderMessageTracker widget is compact and omits copy buttons by default", () => {
  const rendered = renderMessageTracker({
    messageId: "m2",
    messageIndex: 7,
    attachedSnapshot: sampleMessageSnapshot,
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
    settings: DEFAULT_SETTINGS.messageDisplay,
  });

  assert.doesNotMatch(rendered.widgetHtml, /Copy JSON/);
  assert.doesNotMatch(rendered.widgetHtml, /Copy HTML/);
  assert.doesNotMatch(rendered.widgetHtml, /Copy Text/);
  assert.doesNotMatch(rendered.domHtml, /Copy JSON/);
  assert.doesNotMatch(rendered.domHtml, /Copy HTML/);
  assert.doesNotMatch(rendered.domHtml, /Copy Text/);
  assert.doesNotMatch(rendered.domHtml, /ltd-footer-actions/);
  assert.doesNotMatch(rendered.widgetHtml, /swipe index-0/i);
  assert.doesNotMatch(rendered.domHtml, /swipe index-0/i);
  assert.match(rendered.widgetHtml, /class="ltr-icon-button"/);
  assert.match(rendered.widgetHtml, /title="Regenerate tracker"/);
  assert.match(rendered.widgetHtml, /aria-label="Regenerate tracker"/);
  assert.match(rendered.domHtml, /data-ltracker-dom-action="toggle_regenerate"/);
  assert.match(rendered.domHtml, /title="Regenerate tracker"/);
  assert.match(rendered.domHtml, /aria-label="Regenerate tracker"/);
  assert.match(rendered.domHtml, /title="View or edit tracker"/);
  assert.match(rendered.domHtml, /aria-label="View or edit tracker"/);
  assert.match(rendered.domHtml, /title="Delete tracker"/);
  assert.match(rendered.domHtml, /aria-label="Delete tracker"/);
  assert.doesNotMatch(rendered.widgetHtml, />\s*Regenerate tracker\s*</);
  assert.doesNotMatch(rendered.domHtml, />\s*(Regenerate tracker|View or edit tracker|Delete tracker)\s*</);
});

test("renderMessageTracker hides swipe labels until debug swipe key is enabled", () => {
  const hidden = renderMessageTracker({
    messageId: "m2",
    messageIndex: 7,
    attachedSnapshot: sampleMessageSnapshot,
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
    settings: DEFAULT_SETTINGS.messageDisplay,
  });
  const shown = renderMessageTracker({
    messageId: "m2",
    messageIndex: 7,
    attachedSnapshot: sampleMessageSnapshot,
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      showDebugSwipeKey: true,
    },
  });

  assert.equal(DEFAULT_SETTINGS.messageDisplay.showDebugSwipeKey, false);
  assert.equal(hidden.controlState.debugSwipeLabel, null);
  assert.doesNotMatch(hidden.domHtml, /swipe index-0/i);
  assert.match(shown.controlState.debugSwipeLabel ?? "", /swipe index-0/i);
  assert.match(shown.domHtml, /swipe index-0/i);
});

test("renderMessageTracker renders a tiny generate icon for missing snapshots when enabled", () => {
  const missing = renderMessageTracker({
    messageId: "m3",
    messageIndex: 8,
    attachedSnapshot: null,
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
    settings: DEFAULT_SETTINGS.messageDisplay,
    swipeIdentity: {
      chatId: "chat-a",
      messageId: "m3",
      swipeKey: DEFAULT_SWIPE_KEY,
      swipeIndex: null,
      swipeId: null,
      swipeContentHash: null,
      swipeKeySource: "unknown",
    },
  });
  const disabled = renderMessageTracker({
    messageId: "m3",
    messageIndex: 8,
    attachedSnapshot: null,
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      showGenerateButtonForMissingTracker: false,
    },
  });

  assert.equal(DEFAULT_SETTINGS.messageDisplay.showGenerateButtonForMissingTracker, true);
  assert.equal(missing.controlState.hasTracker, false);
  assert.match(missing.domHtml, /data-ltracker-dom-action="generate"/);
  assert.match(missing.domHtml, /title="Generate tracker"/);
  assert.match(missing.widgetHtml, /data-ltracker-action="generate"/);
  assert.doesNotMatch(missing.domHtml, /No tracker snapshot is available/);
  assert.equal(disabled.domHtml, "");
  assert.equal(disabled.widgetHtml, "");
});

test("renderMessageTracker widget shows generation duration when available", () => {
  const rendered = renderMessageTracker({
    messageId: "m2",
    messageIndex: 7,
    attachedSnapshot: sampleMessageSnapshot,
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
    settings: DEFAULT_SETTINGS.messageDisplay,
  });

  assert.equal(formatDurationMs(sampleSnapshot.generationDurationMs), "2.4s");
  assert.match(rendered.widgetHtml, /2\.4s/);
  assert.match(rendered.domHtml, /2\.4s/);
  assert.equal(rendered.generationDurationMs, 2400);
  assert.equal(rendered.generationStatus, "completed");
});

test("renderMessageTracker widget can hide regenerate control", () => {
  const rendered = renderMessageTracker({
    messageId: "m2",
    messageIndex: 7,
    attachedSnapshot: sampleMessageSnapshot,
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      showWidgetRegenerateButton: false,
    },
  });

  assert.doesNotMatch(rendered.widgetHtml, /Regenerate tracker/);
  assert.doesNotMatch(rendered.domHtml, /Regenerate tracker/);
  assert.doesNotMatch(rendered.widgetHtml, /ltracker_widget_action/);
});

test("renderMessageTracker widget exposes cancel state while regenerating", () => {
  const rendered = renderMessageTracker({
    messageId: "m2",
    messageIndex: 7,
    attachedSnapshot: sampleMessageSnapshot,
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
    settings: DEFAULT_SETTINGS.messageDisplay,
    isRegenerating: true,
    activeJobId: "job-widget-1",
    activeJobStartedAt: "2003-09-22T16:19:00.000Z",
  });

  assert.equal(rendered.isRegenerating, true);
  assert.equal(rendered.activeJobId, "job-widget-1");
  assert.match(rendered.widgetHtml, /title="Cancel tracker generation"/);
  assert.match(rendered.widgetHtml, /aria-label="Cancel tracker generation"/);
  assert.match(rendered.widgetHtml, /ltr-spinning/);
  assert.match(rendered.widgetHtml, /data-elapsed/);
  assert.match(rendered.domHtml, /title="Cancel tracker generation"/);
  assert.match(rendered.domHtml, /aria-label="Cancel tracker generation"/);
  assert.match(rendered.domHtml, /ltd-spinning/);
  assert.match(rendered.domHtml, /data-ltracker-elapsed/);
  assert.match(rendered.domHtml, /data-started-at="2003-09-22T16:19:00.000Z"/);
  assert.match(rendered.widgetHtml, /job-widget-1/);
});

test("renderMessageTracker falls back to compact text when HTML template is absent", () => {
  const rendered = renderMessageTracker({
    messageId: "m2",
    messageIndex: 7,
    attachedSnapshot: sampleMessageSnapshot,
    latestChatSnapshot: null,
    preset: {
      ...DEFAULT_TRACKER_PRESET,
      htmlTemplate: "",
    },
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      renderMode: "html_template",
    },
  });
  assert.match(rendered.html, /<pre/);
  assert.match(rendered.textFallback, /Scene:/);
});

test("renderMessageTracker renders compact text and pretty JSON modes", () => {
  const compact = renderMessageTracker({
    messageId: "m2",
    messageIndex: 7,
    attachedSnapshot: sampleMessageSnapshot,
    latestChatSnapshot: null,
    preset: DEFAULT_TRACKER_PRESET,
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      renderMode: "compact_text",
    },
  });
  assert.match(compact.textFallback, /Grand Meridian Court/);
  assert.doesNotMatch(compact.textFallback, /\[LTracker Snapshot\]/);

  const json = renderMessageTracker({
    messageId: "m2",
    messageIndex: 7,
    attachedSnapshot: sampleMessageSnapshot,
    latestChatSnapshot: null,
    preset: DEFAULT_TRACKER_PRESET,
    settings: {
      ...DEFAULT_SETTINGS.messageDisplay,
      renderMode: "pretty_json",
    },
  });
  assert.match(json.html, /&quot;messageId&quot;/);
  assert.match(json.textFallback, /"messageId": "m2"/);
});

test("claimMessageWidget prevents duplicate widget claims", () => {
  const registry = new Set<string>();
  assert.equal(claimMessageWidget(registry, "m2"), true);
  assert.equal(claimMessageWidget(registry, "m2"), false);
  assert.equal(claimMessageWidget(registry, "m3"), true);
});

test("buildMessageTrackerHistory creates a persistent drawer history model", () => {
  const history = buildMessageTrackerHistory({
    index: [
      {
        messageId: "m2",
        messageIndex: 7,
        swipeKey: sampleMessageSnapshot.swipeKey,
        swipeIndex: sampleMessageSnapshot.swipeIndex,
        swipeId: sampleMessageSnapshot.swipeId,
        swipeContentHash: sampleMessageSnapshot.swipeContentHash,
        swipeKeySource: sampleMessageSnapshot.swipeKeySource,
        createdAt: sampleMessageSnapshot.attachedAt,
        presetId: sampleMessageSnapshot.presetId,
        presetName: sampleMessageSnapshot.presetName,
        storageKey: messageSnapshotPath(sampleMessageSnapshot.chatId, sampleMessageSnapshot.messageId, sampleMessageSnapshot.swipeKey),
      },
    ],
    snapshots: [sampleMessageSnapshot],
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
    settings: DEFAULT_SETTINGS.messageDisplay,
  });
  assert.equal(history.length, 1);
  assert.equal(history[0]?.indexEntry.messageId, "m2");
  assert.match(history[0]?.rendered.widgetHtml ?? "", /LTracker/);
});

test("groupMessageTrackerHistory shows latest per message swipe by default", () => {
  const latest = buildMessageTrackerHistory({
    index: [
      {
        messageId: "m2",
        messageIndex: 7,
        swipeKey: sampleMessageSnapshot.swipeKey,
        swipeIndex: sampleMessageSnapshot.swipeIndex,
        swipeId: sampleMessageSnapshot.swipeId,
        swipeContentHash: sampleMessageSnapshot.swipeContentHash,
        swipeKeySource: sampleMessageSnapshot.swipeKeySource,
        createdAt: sampleMessageSnapshot.attachedAt,
        presetId: sampleMessageSnapshot.presetId,
        presetName: sampleMessageSnapshot.presetName,
        storageKey: messageSnapshotPath(sampleMessageSnapshot.chatId, sampleMessageSnapshot.messageId, sampleMessageSnapshot.swipeKey),
      },
    ],
    snapshots: [sampleMessageSnapshot],
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
    settings: DEFAULT_SETTINGS.messageDisplay,
  })[0];
  assert.ok(latest);
  const older: typeof latest = {
    ...latest,
    indexEntry: {
      ...latest.indexEntry,
      createdAt: "2003-09-22T16:00:00.000Z",
      storageKey: `${latest.indexEntry.storageKey}.old`,
    },
    snapshot: latest.snapshot
      ? {
          ...latest.snapshot,
          attachedAt: "2003-09-22T16:00:00.000Z",
          snapshot: {
            ...latest.snapshot.snapshot,
            createdAt: "2003-09-22T16:00:00.000Z",
          },
        }
      : null,
  };

  const grouped = groupMessageTrackerHistory([older, latest], false);
  assert.equal(grouped.groupedCount, 1);
  assert.equal(grouped.duplicateCount, 1);
  assert.equal(grouped.entries.length, 1);
  assert.equal(grouped.entries[0]?.indexEntry.storageKey, latest.indexEntry.storageKey);

  const withDuplicates = groupMessageTrackerHistory([older, latest], true);
  assert.equal(withDuplicates.entries.length, 2);
});

test("buildMessageTrackerHistory displays only the selected swipe tracker when provided", () => {
  const secondSnapshot: MessageAttachedSnapshot = {
    ...sampleMessageSnapshot,
    swipeKey: "index-1",
    swipeIndex: 1,
    swipeContentHash: hashSwipeContent("alternate swipe"),
    snapshot: {
      ...sampleSnapshot,
      data: {
        ...sampleSnapshot.data,
        scene: { location: "Alternate Hall" },
      },
    },
  };
  const history = buildMessageTrackerHistory({
    index: [
      {
        messageId: "m2",
        messageIndex: 7,
        swipeKey: "index-0",
        swipeIndex: 0,
        swipeId: null,
        swipeContentHash: sampleMessageSnapshot.swipeContentHash,
        swipeKeySource: "swipe_index",
        createdAt: sampleMessageSnapshot.attachedAt,
        presetId: sampleMessageSnapshot.presetId,
        presetName: sampleMessageSnapshot.presetName,
        storageKey: messageSnapshotPath(sampleMessageSnapshot.chatId, "m2", "index-0"),
      },
      {
        messageId: "m2",
        messageIndex: 7,
        swipeKey: "index-1",
        swipeIndex: 1,
        swipeId: null,
        swipeContentHash: secondSnapshot.swipeContentHash,
        swipeKeySource: "swipe_index",
        createdAt: secondSnapshot.attachedAt,
        presetId: secondSnapshot.presetId,
        presetName: secondSnapshot.presetName,
        storageKey: messageSnapshotPath(secondSnapshot.chatId, "m2", "index-1"),
      },
    ],
    snapshots: [sampleMessageSnapshot, secondSnapshot],
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
    settings: DEFAULT_SETTINGS.messageDisplay,
    selectedSwipeIdentities: {
      m2: {
        chatId: "chat-a",
        messageId: "m2",
        swipeKey: "index-1",
        swipeIndex: 1,
        swipeId: null,
        swipeContentHash: secondSnapshot.swipeContentHash,
        swipeKeySource: "swipe_index",
      },
    },
  });

  assert.equal(history.length, 1);
  assert.equal(history[0]?.indexEntry.swipeKey, "index-1");
  assert.match(history[0]?.rendered.textFallback ?? "", /Alternate Hall/);
});

test("cancelled widget regeneration preserves the existing message snapshot in history", () => {
  const history = buildMessageTrackerHistory({
    index: [
      {
        messageId: "m2",
        messageIndex: 7,
        swipeKey: sampleMessageSnapshot.swipeKey,
        swipeIndex: sampleMessageSnapshot.swipeIndex,
        swipeId: sampleMessageSnapshot.swipeId,
        swipeContentHash: sampleMessageSnapshot.swipeContentHash,
        swipeKeySource: sampleMessageSnapshot.swipeKeySource,
        createdAt: sampleMessageSnapshot.attachedAt,
        presetId: sampleMessageSnapshot.presetId,
        presetName: sampleMessageSnapshot.presetName,
        storageKey: messageSnapshotPath(sampleMessageSnapshot.chatId, sampleMessageSnapshot.messageId, sampleMessageSnapshot.swipeKey),
      },
    ],
    snapshots: [sampleMessageSnapshot],
    latestChatSnapshot: sampleSnapshot,
    preset: DEFAULT_TRACKER_PRESET,
    settings: DEFAULT_SETTINGS.messageDisplay,
    activeWidgetJobs: {
      "m2:index-0": { jobId: "job-widget-1", startedAt: "2003-09-22T16:19:00.000Z" },
    },
  });

  assert.equal(history.length, 1);
  assert.equal(history[0]?.snapshot, sampleMessageSnapshot);
  assert.equal(history[0]?.rendered.isRegenerating, true);
  assert.match(history[0]?.rendered.textFallback ?? "", /Grand Meridian Court/);
});

test("formatTemplateTextFallback includes tracker continuity fields", () => {
  const fallback = formatTemplateTextFallback(sampleSnapshot.data);
  assert.match(fallback, /Present characters: Aleister Crowley; Sable Mareth/);
  assert.match(fallback, /Scholarship packet/);
});

test("repairSettings repairs renderer settings with defaults and clamping", () => {
  const settings = repairSettings({
    renderer: {
      enabled: false,
      previewSource: "latest_message_snapshot",
      missingValuePlaceholder: "unknown",
      maxRenderedChars: "999999",
      allowInlineStyles: true,
    },
  });
  assert.equal(settings.renderer.enabled, false);
  assert.equal(settings.renderer.previewSource, "latest_message_snapshot");
  assert.equal(settings.renderer.missingValuePlaceholder, "unknown");
  assert.equal(settings.renderer.maxRenderedChars, 999_999);
  assert.equal(settings.renderer.allowInlineStyles, true);

  const repaired = repairSettings({ renderer: { previewSource: "bad", maxRenderedChars: 5 } });
  assert.equal(repaired.renderer.previewSource, DEFAULT_SETTINGS.renderer.previewSource);
  assert.equal(repaired.renderer.maxRenderedChars, 1_000);
});

test("repairSettings repairs message display settings with defaults and clamping", () => {
  const settings = repairSettings({
    messageDisplay: {
      enabled: false,
      useDomInjection: false,
      fallbackToIframeWidget: false,
      attachmentMode: "both",
      displayMode: "inline_button_popover",
      displaySurface: "fullscreen_reader",
      placement: "bottom",
      source: "latest_chat_snapshot",
      renderMode: "pretty_json",
      allowInlineStyles: false,
      deduplicateRenderWarnings: false,
      showRenderWarningsInDiagnosticsOnly: false,
      showDebugSwipeKey: true,
      showGenerateButtonForMissingTracker: false,
      controlDensity: "comfortable",
      controlPlacement: "inside_tracker_header",
      showExpandedHeaderActions: false,
      showBottomActionsInInlineTracker: true,
      collapsedByDefault: true,
      compactCollapsedHeader: false,
      showTimestamp: false,
      showPresetName: false,
      showDebugCopyButtonsInHistory: false,
      showWidgetRegenerateButton: false,
      showEditButton: false,
      showDeleteButton: false,
      showNoTrackerForSwipe: true,
      showGenerationDuration: false,
      minimizedMaxHeightPx: "999999",
      maxRenderedChars: "999999",
    },
  });
  assert.equal(settings.messageDisplay.enabled, false);
  assert.equal(settings.messageDisplay.useDomInjection, false);
  assert.equal(settings.messageDisplay.fallbackToIframeWidget, false);
  assert.equal(settings.messageDisplay.attachmentMode, "both");
  assert.equal(settings.messageDisplay.displayMode, "inline_full");
  assert.equal(settings.messageDisplay.displaySurface, "fullscreen_reader");
  assert.equal(settings.messageDisplay.placement, "bottom");
  assert.equal(settings.messageDisplay.source, "latest_chat_snapshot");
  assert.equal(settings.messageDisplay.renderMode, "pretty_json");
  assert.equal(settings.messageDisplay.allowInlineStyles, true);
  assert.equal(settings.messageDisplay.deduplicateRenderWarnings, false);
  assert.equal(settings.messageDisplay.showRenderWarningsInDiagnosticsOnly, false);
  assert.equal(settings.messageDisplay.showDebugSwipeKey, true);
  assert.equal(settings.messageDisplay.showGenerateButtonForMissingTracker, false);
  assert.equal(settings.messageDisplay.controlDensity, "comfortable");
  assert.equal(settings.messageDisplay.controlPlacement, "inside_tracker_header");
  assert.equal(settings.messageDisplay.showExpandedHeaderActions, false);
  assert.equal(settings.messageDisplay.showBottomActionsInInlineTracker, true);
  assert.equal(settings.messageDisplay.collapsedByDefault, true);
  assert.equal(settings.messageDisplay.compactCollapsedHeader, false);
  assert.equal(settings.messageDisplay.showTimestamp, false);
  assert.equal(settings.messageDisplay.showPresetName, false);
  assert.equal(settings.messageDisplay.showDebugCopyButtonsInHistory, false);
  assert.equal(settings.messageDisplay.showWidgetRegenerateButton, false);
  assert.equal(settings.messageDisplay.showEditButton, false);
  assert.equal(settings.messageDisplay.showDeleteButton, false);
  assert.equal(settings.messageDisplay.showNoTrackerForSwipe, true);
  assert.equal(settings.messageDisplay.showGenerationDuration, true);
  assert.equal(settings.messageDisplay.minimizedMaxHeightPx, 400);
  assert.equal(settings.messageDisplay.maxRenderedChars, 999_999);

  const repaired = repairSettings({
    messageDisplay: {
      attachmentMode: "chat_metadata",
      displayMode: "floating_panel",
      placement: "middle",
      source: "bad",
      renderMode: "markdown",
      controlDensity: "roomy",
      controlPlacement: "native_toolbar",
      maxRenderedChars: 10,
    },
  });
  assert.equal(repaired.messageDisplay.attachmentMode, DEFAULT_SETTINGS.messageDisplay.attachmentMode);
  assert.equal(repaired.messageDisplay.displayMode, DEFAULT_SETTINGS.messageDisplay.displayMode);
  assert.equal(repaired.messageDisplay.displaySurface, DEFAULT_SETTINGS.messageDisplay.displaySurface);
  assert.equal(repaired.messageDisplay.placement, DEFAULT_SETTINGS.messageDisplay.placement);
  assert.equal(repaired.messageDisplay.source, DEFAULT_SETTINGS.messageDisplay.source);
  assert.equal(repaired.messageDisplay.renderMode, DEFAULT_SETTINGS.messageDisplay.renderMode);
  assert.equal(repaired.messageDisplay.showDebugSwipeKey, DEFAULT_SETTINGS.messageDisplay.showDebugSwipeKey);
  assert.equal(repaired.messageDisplay.showGenerateButtonForMissingTracker, DEFAULT_SETTINGS.messageDisplay.showGenerateButtonForMissingTracker);
  assert.equal(repaired.messageDisplay.controlDensity, DEFAULT_SETTINGS.messageDisplay.controlDensity);
  assert.equal(repaired.messageDisplay.controlPlacement, DEFAULT_SETTINGS.messageDisplay.controlPlacement);
  assert.equal(repaired.messageDisplay.showExpandedHeaderActions, DEFAULT_SETTINGS.messageDisplay.showExpandedHeaderActions);
  assert.equal(repaired.messageDisplay.showBottomActionsInInlineTracker, DEFAULT_SETTINGS.messageDisplay.showBottomActionsInInlineTracker);
  assert.equal(repaired.messageDisplay.minimizedMaxHeightPx, 0);
  assert.equal(repaired.messageDisplay.maxRenderedChars, 1_000);
});

test("repairSettings migrates legacy display modes into displaySurface", () => {
  assert.equal(repairSettings({
    messageDisplay: { displayMode: "inline_full" },
    expandedWidth: { expandedWidthMode: "contained" },
  }).messageDisplay.displaySurface, "inline_contained");
  assert.equal(repairSettings({
    messageDisplay: { displayMode: "inline_full" },
    expandedWidth: { expandedWidthMode: "wide" },
  }).messageDisplay.displaySurface, "inline_wide");
  assert.equal(repairSettings({
    messageDisplay: { displayMode: "inline_button_popover" },
  }).messageDisplay.displaySurface, "anchored_popover");
  assert.equal(repairSettings({
    messageDisplay: { displayMode: "drawer_history_only" },
  }).messageDisplay.displaySurface, "drawer_only");
});

test("repairSettings keeps displaySurface authoritative over legacy displayMode", () => {
  const repaired = repairSettings({
    messageDisplay: {
      displayMode: "inline_full",
      displaySurface: "fullscreen_reader",
    },
    expandedWidth: {
      expandedWidthMode: "contained",
    },
  });
  assert.equal(repaired.messageDisplay.displaySurface, "fullscreen_reader");
  assert.equal(repaired.messageDisplay.displayMode, "inline_full");

  const popover = repairSettings({
    messageDisplay: {
      displayMode: "inline_full",
      displaySurface: "anchored_popover",
    },
  });
  assert.equal(popover.messageDisplay.displaySurface, "anchored_popover");
  assert.equal(popover.messageDisplay.displayMode, "inline_button_popover");
});

test("repairSettings migrates old showCopyButton into drawer history debug copies", () => {
  const hidden = repairSettings({
    messageDisplay: {
      showCopyButton: false,
    },
  });
  assert.equal(hidden.messageDisplay.showDebugCopyButtonsInHistory, false);
  assert.equal(hidden.messageDisplay.showWidgetRegenerateButton, DEFAULT_SETTINGS.messageDisplay.showWidgetRegenerateButton);
  assert.equal(hidden.messageDisplay.showEditButton, true);
  assert.equal(hidden.messageDisplay.showDeleteButton, true);
  assert.equal(hidden.messageDisplay.showGenerationDuration, DEFAULT_SETTINGS.messageDisplay.showGenerationDuration);

  const visible = repairSettings({
    messageDisplay: {
      showCopyButton: true,
    },
  });
  assert.equal(visible.messageDisplay.showDebugCopyButtonsInHistory, true);
});

test("renderHtmlTemplate truncates large rendered output", () => {
  const result = renderHtmlTemplate({
    template: `<p>${"x".repeat(200)}</p>`,
    snapshotData: sampleSnapshot.data,
    presetId: "custom",
    presetName: "Custom",
  }, { maxRenderedChars: 40 });
  assert.ok(result.html.length <= 40);
  assert.ok(result.warnings.some((warning) => warning.includes("truncated")));
});

test("renderHtmlTemplate reports errors instead of throwing", () => {
  const result = renderHtmlTemplate({
    template: "<pre>{{json unsafe}}</pre>",
    snapshotData: { unsafe: BigInt(7) },
    presetId: "custom",
    presetName: "Custom",
  });
  assert.equal(result.ok, false);
  assert.equal(result.usedFallback, true);
  assert.ok(result.errors.some((error) => error.includes("Renderer failed safely")));
});

test("context handler hotfix is disabled by default", () => {
  assert.equal(CONTEXT_HANDLER_EXPERIMENTAL_ENABLED, false);
  assert.match(CONTEXT_HANDLER_DISABLED_REASON, /disabled in 0\.16|remains disabled in 0\.16/);
});

test("context handler guard never mutates a frozen context object when disabled", async () => {
  const context = Object.freeze({
    type: "normal",
    request: Object.freeze({ metadata: Object.freeze({ source: "user" }) }),
  });
  let called = false;
  const result = await runContextHandlerFailSafe({
    context,
    enabled: false,
    run: async () => {
      called = true;
      return "should not run";
    },
  });
  assert.equal(result, null);
  assert.equal(called, false);
  assert.deepEqual(context, {
    type: "normal",
    request: { metadata: { source: "user" } },
  });
});

test("context handler guard returns safe empty output when disabled", async () => {
  const result = await runContextHandlerFailSafe({
    context: Object.freeze({ generationType: "normal" }),
    enabled: false,
    run: async () => "tracker context",
  });
  assert.equal(result, null);
});

test("context handler guard catches storage/read errors and does not throw", async () => {
  const errors: string[] = [];
  const result = await runContextHandlerFailSafe({
    context: Object.freeze({ generationType: "normal" }),
    enabled: true,
    run: async () => {
      throw new Error("storage unavailable");
    },
    onError: (message) => errors.push(message),
  });
  assert.equal(result, null);
  assert.deepEqual(errors, ["storage unavailable"]);
});

test("context handler disabled path performs no diagnostics recording", async () => {
  let diagnosticWrites = 0;
  let storageReads = 0;
  const result = await runContextHandlerFailSafe({
    context: Object.freeze({ generationType: "normal" }),
    enabled: false,
    run: async () => {
      storageReads += 1;
      diagnosticWrites += 1;
      return "tracker context";
    },
  });
  assert.equal(result, null);
  assert.equal(storageReads, 0);
  assert.equal(diagnosticWrites, 0);
});

test("renderer preview does not run during disabled context injection", async () => {
  let renderCalls = 0;
  const result = await runContextHandlerFailSafe({
    context: Object.freeze({ generationType: "normal" }),
    enabled: false,
    run: async () => {
      renderCalls += 1;
      return renderHtmlTemplate({
        template: "<p>{{scene.location}}</p>",
        snapshotData: sampleSnapshot.data,
        presetId: "custom",
        presetName: "Custom",
      }).html;
    },
  });
  assert.equal(result, null);
  assert.equal(renderCalls, 0);
});

test("normal generation can call the disabled context handler guard without throwing", async () => {
  const frozenGenerationContext = Object.freeze({
    generationType: "normal",
    messages: Object.freeze([
      Object.freeze({ role: "user", content: "hello" }),
    ]),
  });
  await assert.doesNotReject(async () => {
    const result = await runContextHandlerFailSafe({
      context: frozenGenerationContext,
      enabled: false,
      run: async () => "tracker context",
    });
    assert.equal(result, null);
  });
});

test("backend tracker generation uses the shared connection helper", () => {
  const backend = readFileSync("src/backend.ts", "utf8");
  assert.match(backend, /buildTrackerGenerationRequest/);
  assert.match(backend, /async function runTrackerGeneration[\s\S]*buildTrackerGenerationRequest/);
  assert.match(backend, /const generation = await runTrackerGeneration/);
  assert.match(backend, /await generateTracker\(pending\.chatId, pending\.userId, pending\.trigger\)/);
  assert.match(backend, /async function regenerateMessageTracker[\s\S]*await generateTracker/);
  assert.match(backend, /lastGenerationConnectionFallbackReason: generation\.requestDiagnostics\.fallbackReason/);
  assert.match(backend, /lastGenerationParametersUsed: generation\.requestDiagnostics\.parametersUsed/);
  assert.match(backend, /lastReasoningOverrideUsed: generation\.requestDiagnostics\.reasoningOverrideUsed/);
});

test("backend tracker generation uses tracker memory before prompt building", () => {
  const backend = readFileSync("src/backend.ts", "utf8");
  assert.match(backend, /async function generateTracker[\s\S]*const contextAwareSettings = memorySettingsForContextFilters\(settings\)/);
  assert.match(backend, /async function generateTracker[\s\S]*const memory = contextAwareSettings\.memory\.enabled/);
  assert.match(backend, /async function generateTracker[\s\S]*collectTrackerMemory\(resolvedChatId, userId, contextAwareSettings, presetState\.activePreset, trigger(?:, memDiags)?\)/);
  assert.match(backend, /async function generateTracker[\s\S]*buildTrackerPrompt\([\s\S]*memory\.renderedText \? memory : null/);
});

test("connection test path does not mutate tracker snapshots or chat tags", () => {
  const backend = readFileSync("src/backend.ts", "utf8");
  const match = /async function testTrackerConnection[\s\S]*?\r?\n}\r?\n\r?\nasync function cancelConnectionTest/.exec(backend);
  assert.ok(match, "testTrackerConnection function should be present");
  const body = match[0];
  for (const forbidden of [
    "saveSnapshot(",
    "saveMessageAttachedSnapshot",
    "saveMessageAttachedSnapshotWithIndex",
    "upsertLTrackerTag",
    "updateMessage",
    "removeEmbeddedTrackerTag",
  ]) {
    assert.doesNotMatch(body, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(body, /runTrackerGeneration/);
  assert.match(body, /lastConnectionTestOutputPreview/);
});

test("validatePresetReport understands data-prefixed paths, loops, conditionals, and this", () => {
  const preset: TrackerSchemaPreset = {
    id: "validation-power",
    name: "Validation Power",
    description: "Validation test",
    version: "1.0",
    createdAt: "2026-06-28",
    updatedAt: "2026-06-28",
    jsonSchema: {
      type: "object",
      properties: {
        time: {
          type: "object",
          properties: {
            clock: { type: "string" },
          },
        },
        cast: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              idn: {
                type: "object",
                properties: {
                  desc: { type: "string" },
                },
              },
            },
          },
        },
        tags: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    htmlTemplate: "{{data.time.clock}}{{#if data.cast}}{{#each data.cast}}{{name}}{{idn.desc}}{{/each}}{{/if}}{{#each data.tags}}{{this}}{{/each}}",
    promptInstructions: "Respond only with JSON.",
    origin: "user_created",
  };
  const report = validatePresetReport(preset);
  assert.equal(report.missingPlaceholders.length, 0);
  assert.equal(report.unusedSchemaFields.length, 0);
});

test("validatePresetReport warns about raw array/object interpolation and mobile risks", () => {
  const preset: TrackerSchemaPreset = {
    id: "qa",
    name: "QA",
    description: "QA test",
    version: "1.0",
    createdAt: "2026-06-28",
    updatedAt: "2026-06-28",
    jsonSchema: {
      type: "object",
      properties: {
        rel: {
          type: "array",
          items: {
            type: "object",
            properties: {
              t: { type: "string" },
              c: { type: "string" },
            },
          },
        },
        pockets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              t: { type: "string" },
              c: { type: "string" },
            },
          },
        },
        world: {
          type: "object",
          properties: {
            items: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    htmlTemplate: "<style>.hud{min-width:480px;white-space:nowrap;writing-mode:vertical-rl;word-break:break-all}.tiny{width:44px}</style><section>{{rel}}{{pockets}}{{world}}</section>",
    promptInstructions: "Respond only with JSON.",
    origin: "user_created",
  };
  const report = validatePresetReport(preset, { sampleMode: "stress" });
  assert.deepEqual(report.rawArrayInterpolationPaths.sort(), ["pockets", "rel"]);
  assert.deepEqual(report.rawObjectInterpolationPaths, ["world"]);
  assert.ok(report.mobileRiskWarnings.length >= 2);
  assert.ok(report.verticalTextRiskWarnings.length >= 2);
  assert.ok(report.entries.some((entry) => entry.message.includes("Use {{#each rel}}")));
});

test("generateSampleSnapshot supports authoring stress modes", () => {
  const minimal = generateSampleSnapshot({}, "minimal");
  const stress = generateSampleSnapshot({}, "stress");
  const mobile = generateSampleSnapshot({}, "mobile_torture");
  const castHeavy = generateSampleSnapshot({}, "cast_heavy");
  const worldHeavy = generateSampleSnapshot({}, "world_heavy");
  assert.ok(Array.isArray(minimal.cast));
  assert.ok(Array.isArray(stress.cast));
  assert.ok((stress.cast as unknown[]).length >= 3);
  assert.match(JSON.stringify(mobile), /HyperAdministrativelyOverInstrumentalized/);
  assert.ok(((castHeavy.cast as unknown[]) ?? []).length >= 4);
  assert.ok(Array.isArray((worldHeavy.world as Record<string, unknown>).items));
});

test("renderer requirement detection recommends Trusted and flags JavaScript-like content", () => {
  const requirements = detectTemplateRendererRequirements("<style>.hud{display:grid}</style><svg viewBox=\"0 0 1 1\"></svg>{{#if data.ok}}ok{{/if}}");
  assert.equal(requirements.usesScopedCss, true);
  assert.equal(requirements.usesInlineSvg, true);
  assert.equal(requirements.usesConditionals, true);
  assert.equal(requirements.recommendedMode, "trusted");

  const scriptRequirements = detectTemplateRendererRequirements("<section onclick=\"bad()\"><script>bad()</script></section>");
  assert.equal(scriptRequirements.hasJavaScriptLikeContent, true);
  assert.equal(scriptRequirements.recommendedMode, "dev");
  assert.ok(scriptRequirements.warnings.some((warning) => warning.includes("JavaScript-like")));
});

test("import review surfaces renderer requirements and never offers Dev Mode auto-enable", () => {
  const frontend = readFileSync("src/frontend.ts", "utf8");
  assert.match(frontend, /detectTemplateRendererRequirements/);
  assert.match(frontend, /This preset uses:/);
  assert.match(frontend, /Recommended mode:/);
  assert.match(frontend, /Mobile QA status:/);
  assert.match(frontend, /Possible raw arrays:/);
  const importReviewTrustSelect = /<select data-import-review-trust-mode>[\s\S]*?<\/select>/.exec(frontend)?.[0] ?? "";
  assert.match(importReviewTrustSelect, /<option value="trusted"/);
  assert.match(importReviewTrustSelect, /<option value="safe"/);
  assert.doesNotMatch(importReviewTrustSelect, /<option value="dev"/);

  const backend = readFileSync("src/backend.ts", "utf8");
  assert.match(backend, /options\.trustMode === "trusted" \|\| options\.trustMode === "safe"/);
  assert.doesNotMatch(backend, /options\.trustMode === "dev"/);
});

test("frontend exposes a storage-free Preset Render Lab", () => {
  const frontend = readFileSync("src/frontend.ts", "utf8");
  assert.match(frontend, /Preset Render Lab/);
  assert.match(frontend, /let activeRenderLabPreviewElement: HTMLElement \| null = null/);
  assert.match(frontend, /function openRenderLabPreview\(fullscreen = false\)/);
  assert.match(frontend, /function closeRenderLabPreview\(\)/);
  assert.match(frontend, /data-render-lab="sampleMode"/);
  assert.match(frontend, /data-render-lab="viewport"/);
  assert.match(frontend, /data-render-lab="surface"/);
  assert.match(frontend, /data-action="open-render-lab-preview"/);
  assert.match(frontend, /data-action="open-render-lab-fullscreen-preview"/);
  assert.match(frontend, /ltracker-render-lab-overlay/);
  assert.match(frontend, /Open Preview/);
  assert.match(frontend, /Open Fullscreen Preview/);
  assert.match(frontend, /copy-render-lab-html/);
  assert.match(frontend, /copy-render-lab-sample/);
  assert.match(frontend, /copy-render-lab-report/);
  assert.match(frontend, /copy-validation-report/);
  assert.match(frontend, /Render Lab previews open in the floating preview overlay/);
  assert.match(frontend, /generateSampleSnapshot\(schema, renderLabSampleMode\)/);
  assert.match(frontend, /renderHtmlTemplate\(/);
  assert.match(frontend, /recordRenderLabDiagnostics/);
  assert.doesNotMatch(frontend, /Latest sanitized preview/);
  assert.doesNotMatch(frontend, /type: "render_lab/);
});

test("README settings reference covers the major setting groups", () => {
  const readme = readFileSync("README.md", "utf8");
  for (const text of [
    "Version: `0.26.1`",
    "Current release: `0.26.1 Prompt Injection Swipe Isolation + Stale Tracker Leak Fix`",
    "Drawer Command Center",
    "Sticky Command Header",
    "Scrollable Active Panel",
    "Home",
    "Presets",
    "Render Lab",
    "Display",
    "More",
    "Generation",
    "Connection",
    "Memory & Context Filters",
    "Tracker Generation Context controls",
    "Context Budget Preview",
    "world_books.getActivated",
    "characters.get()",
    "personas.getActive()",
    "Diagnostics",
    "Advanced",
    "Quick Setup Profiles",
    "Mobile Wide Tracker",
    "Popover HUD",
    "Fullscreen Reader",
    "Minimal Inline",
    "Authoring Mode",
    "Safe Mode",
    "Ultra Budget",
    "Visible, Advanced, And Legacy Settings",
    "Preset-Locked Snapshot Rendering",
    "Template Helper Pack",
    "Preset Render Lab",
    "Sample Snapshot Stress Modes",
    "Mobile-safe preset design",
    "Settings Reference",
    "Tracker Connection Settings",
    "Recommended setup",
    "connection.mode",
    "selected_connection_raw",
    "API keys are never exposed",
    "Test Tracker Connection",
    "recentMessageLimit",
    "maxMessageChars",
    "generationTimeoutMs",
    "saveRawOutput",
    "savePromptPreview",
    "auto.autoModeEnabled",
    "auto.autoDebounceMs",
    "auto.skipFirstMessages",
    "auto.triggerAfterAssistantMessages",
    "auto.triggerAfterUserMessages",
    "auto.attachSnapshotToMessage",
    "auto.onlyWhenChatActive",
    "autoTiming.waitForAssistantFinalization",
    "autoTiming.postCompletionSettleMs",
    "autoTiming.stableContentCheckMs",
    "autoTiming.requireStableSwipeContent",
    "autoTiming.cancelPendingOnSwipeChange",
    "budget.mode",
    "budget.ultraModeEnabled",
    "budget.recentMessageBudgetTokens",
    "budget.perMessageBudgetTokens",
    "budget.trackerMemoryBudgetTokens",
    "budget.promptInjectionBudgetTokens",
    "budget.maxTrackerOutputTokens",
    "budget.promptPreviewBudgetTokens",
    "budget.renderedHtmlMaxChars",
    "budget.rawOutputMaxChars",
    "budget.presetImportMaxChars",
    "Trusted Renderer Freedom",
    "Safe Mode",
    "Trusted Mode",
    "Dev Mode",
    "JavaScript requires Dev Mode and was not executed",
    "{{#if field}}",
    "{{else}}",
    "{{#unless field}}",
    "{{#with object}}",
    "{{this}}",
    "{{@index}}",
    "{{default value \"fallback\"}}",
    "{{fieldChipList array \"labelField\" \"contentField\"}}",
    "{{meterWidth value}}",
    "Trusted SVG allowlist",
    "Preset Import Review And Validation",
    "v0.23 Import And Validation Cleanup",
    "v0.24 Cleanup, Repair, Runtime Polish, and Mobile Smoke Fixes",
    "v0.26 Owner Power Mode + Interactive Tracker Runtime",
    "Owner Power Mode",
    "Imported packs cannot enable Owner Power automatically",
    "data-ltracker-power-action",
    "copy-field",
    "Full arbitrary preset JavaScript is intentionally deferred",
    "Disable Owner Power now",
    "Reset Owner Power settings",
    "Maintenance & Repair",
    "Run Health Check",
    "Repair Settings",
    "Repair Snapshot Index",
    "Repair Preset Render Locks",
    "Clean Orphan Snapshots",
    "Clean Broken Embedded Tags",
    "Copy Maintenance Report",
    "Fictional tracker fields named like secrets/tokens/credentials are allowed",
    "real connection credentials in recommended settings are stripped",
    "Pack chars",
    "Model prompt token estimate",
    "Template chars",
    "Rendered chars",
    "This preset uses:",
    "Possible raw object interpolation",
    "Possible mobile overflow",
    "Recommended mode: Trusted",
    "spindle.registerInterceptor",
    "context_handler",
    "renderer.enabled",
    "renderer.previewSource",
    "renderer.missingValuePlaceholder",
    "renderer.maxRenderedChars",
    "renderer.allowInlineStyles",
    "renderer.templateTrustMode",
    "messageDisplay.enabled",
    "messageDisplay.useDomInjection",
    "messageDisplay.fallbackToIframeWidget",
    "messageDisplay.attachmentMode",
    "messageDisplay.displayMode",
    "messageDisplay.displaySurface",
    "messageDisplay.placement",
    "messageDisplay.source",
    "messageDisplay.renderMode",
    "messageDisplay.allowInlineStyles",
    "messageDisplay.deduplicateRenderWarnings",
    "messageDisplay.showRenderWarningsInDiagnosticsOnly",
    "messageDisplay.showDebugSwipeKey",
    "messageDisplay.showGenerateButtonForMissingTracker",
    "messageDisplay.controlDensity",
    "messageDisplay.controlPlacement",
    "messageDisplay.showExpandedHeaderActions",
    "messageDisplay.showBottomActionsInInlineTracker",
    "messageDisplay.collapsedByDefault",
    "messageDisplay.compactCollapsedHeader",
    "messageDisplay.showTimestamp",
    "messageDisplay.showPresetName",
    "messageDisplay.showDebugCopyButtonsInHistory",
    "messageDisplay.showWidgetRegenerateButton",
    "messageDisplay.showEditButton",
    "messageDisplay.showDeleteButton",
    "messageDisplay.showNoTrackerForSwipe",
    "messageDisplay.showGenerationDuration",
    "messageDisplay.minimizedMaxHeightPx",
    "messageDisplay.maxRenderedChars",
    "expandedWidth.expandedWidthMode",
    "Troubleshooting",
    "tracker too narrow",
    "popover not opening",
    "preset import rejected",
    "raw JSON appears in tracker",
    "template CSS stripped",
    "tracker generated for wrong swipe",
    "old tracker changed appearance",
    "0.26.1 Prompt Injection Swipe Isolation + Stale Tracker Leak Fix",
    "0.27 Preset Pack Collections / Advanced Export Polish",
    "0.28 Final UX Polish / Stabilization",
    "Optional Future / Backlog",
    "Sequential + Partial Regeneration",
    "Preset Authoring Studio 2.0",
  ]) {
    assert.match(readme, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("drawer UI keeps detailed setting explanations out of the app surface", () => {
  const frontend = readFileSync("src/frontend.ts", "utf8");
  for (const phrase of [
    "Debounce is the wait",
    "Placement is a preference",
    "zTracker-style layout",
    "Mode chooses chat-wide",
    "Detailed setting documentation",
    "When to increase",
    "When to decrease",
  ]) {
  assert.doesNotMatch(frontend, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(frontend, /MESSAGE_NATIVE_TOOLBAR_FALLBACK_REASON/);
  assert.match(frontend, /Context handler injection remains disabled in 0\.15/);
  assert.doesNotMatch(frontend, />\s*Allow sanitized inline styles\s*</);
  assert.match(frontend, /registerTagInterceptor/);
  assert.match(frontend, /data-settings-save-status/);
  assert.match(frontend, /saveSettings\("settings-auto"\)/);
  assert.match(frontend, /LTracker Command Center/);
  assert.match(frontend, /type LTrackerDrawerPanel/);
  assert.match(frontend, /let activePanel: LTrackerDrawerPanel = "home"/);
  assert.match(frontend, /PRIMARY_DRAWER_PANELS/);
  assert.match(frontend, /data-panel-target="\$\{escapeHtml\(id\)\}"/);
  assert.match(frontend, /ltracker-drawer-shell/);
  assert.match(frontend, /ltracker-panel-scroll/);
  assert.match(frontend, /\$\{activePanel === "home" \? `/);
  assert.match(frontend, /\$\{activePanel === "presets" \? `/);
  assert.match(frontend, /\$\{activePanel === "renderLab" \? `/);
  assert.match(frontend, /\$\{activePanel === "display" \? `/);
  assert.match(frontend, /\$\{activePanel === "more" \? `/);
  assert.match(frontend, /\$\{activePanel === "generation" \? `/);
  assert.match(frontend, /\$\{activePanel === "connection" \? `/);
  assert.match(frontend, /\$\{activePanel === "memory" \? `/);
  assert.match(frontend, /\$\{activePanel === "maintenance" \? `/);
  assert.match(frontend, /\$\{activePanel === "diagnostics" \? `/);
  assert.match(frontend, /\$\{activePanel === "advanced" \? `/);
  assert.doesNotMatch(frontend, /data-drawer-section/);
  for (const id of ["home", "presets", "render-lab", "display", "more", "generation", "connection", "memory-context", "maintenance", "diagnostics", "advanced"]) {
    assert.match(frontend, new RegExp(`id="ltracker-section-${id}"`));
  }
  for (const oldId of ["dashboard", "auto", "renderer", "history", "memory-injection"]) {
    assert.doesNotMatch(frontend, new RegExp(`id="ltracker-section-${oldId}"`));
  }
  assert.match(frontend, /<summary>Authoring mode<\/summary>/);
  assert.doesNotMatch(frontend, /<details class="ltracker-details" open>\s*<summary>Authoring mode<\/summary>/);
  for (const profile of [
    "Mobile Wide Tracker",
    "Popover HUD",
    "Fullscreen Reader",
    "Minimal Inline",
    "Authoring Mode",
    "Safe Mode",
    "Ultra Budget",
  ]) {
    assert.match(frontend, new RegExp(profile));
  }
  assert.match(frontend, /data-action="apply-quick-setup"/);
  assert.match(frontend, /data-action="apply-display-surface"/);
  assert.match(frontend, /data-action="generate"/);
  assert.match(frontend, /data-action="regenerate-latest"/);
  assert.match(frontend, /data-action="import-file-pack"/);
  assert.match(frontend, /data-action="test-connection"/);
  assert.match(frontend, /data-panel-target="renderLab"/);
  assert.match(frontend, /data-panel-target="diagnostics"/);
  assert.match(frontend, /data-panel-target="maintenance"/);
  assert.match(frontend, /data-action="run-health-check"/);
  assert.match(frontend, /data-action="repair-settings"/);
  assert.match(frontend, /data-action="repair-snapshot-index"/);
  assert.match(frontend, /data-action="repair-preset-render-locks"/);
  assert.match(frontend, /data-action="clean-orphan-snapshots"/);
  assert.match(frontend, /data-action="clean-broken-embedded-tags"/);
  assert.match(frontend, /data-action="copy-maintenance-report"/);
  assert.match(frontend, /data-diagnostics-search/);
  assert.match(frontend, /data-diagnostics-group/);
  assert.match(frontend, /Maintenance \/ Repair/);
  for (const filter of [
    "text",
    "showDuplicates",
    "currentMessageOnly",
    "selectedSwipeOnly",
    "currentPresetOnly",
    "errorsOnly",
  ]) {
    assert.match(frontend, new RegExp(`data-history-filter="${filter}"`));
  }
  const displaySection = /id="ltracker-section-display"[\s\S]*?id="ltracker-section-generation"/.exec(frontend)?.[0] ?? "";
  assert.doesNotMatch(displaySection, /fallbackToIframeWidget/);
  assert.doesNotMatch(displaySection, /displayMode/);
  assert.match(displaySection, /displaySurfaceCards/);
  assert.match(frontend, /Inline Wide/);
  assert.match(frontend, /Anchored Popover/);
  assert.match(frontend, /Fullscreen Reader/);
  assert.match(frontend, /Drawer Only/);
  const advancedSection = /id="ltracker-section-advanced"[\s\S]*?<\/section>/.exec(frontend)?.[0] ?? "";
  assert.match(advancedSection, /fallbackToIframeWidget/);
  assert.match(advancedSection, /How trackers attach to messages/);
  assert.match(frontend, /Internal connection mode/);
  assert.doesNotMatch(frontend, />Save Settings</);
});

test("frontend message controls send exact message and swipe actions", () => {
  const frontend = readFileSync("src/frontend.ts", "utf8");
  assert.match(frontend, /type: "generate_message_tracker"[\s\S]{0,220}messageId[\s\S]{0,80}swipeKey/);
  assert.match(frontend, /requestId: requestId\("widget-generate"\)/);
  assert.match(frontend, /type: "regenerate_message_tracker"[\s\S]{0,220}messageId[\s\S]{0,80}swipeKey/);
  assert.match(frontend, /type: "cancel_tracker_generation"[\s\S]{0,240}messageId[\s\S]{0,80}swipeKey/);
  assert.match(frontend, /noteInlineAction\("generate", messageId, swipeKey\)/);
  assert.match(frontend, /noteInlineAction\("cancel", messageId, swipeKey\)/);
});

test("popover summary handler is scoped to LTracker shell summaries", () => {
  const frontend = readFileSync("src/frontend.ts", "utf8");
  assert.match(frontend, /querySelector<HTMLElement>\(":scope > details > summary"\)/);
  assert.doesNotMatch(frontend, /details\.querySelector\("summary"\)/);
  assert.match(frontend, /target\.closest\("\[data-ltracker-dom-action\]"\)/);
  const rendered = renderHtmlTemplate({
    template: "<details><summary>User template drawer</summary><div>Still opens normally</div></details>",
    snapshotData: {},
    presetId: "drawer",
    presetName: "Drawer",
  }, {
    allowInlineStyles: true,
    templateTrustMode: "trusted",
  });
  assert.match(rendered.html, /<details><summary>User template drawer<\/summary><div>Still opens normally<\/div><\/details>/);
});

test("display surface repair uses wide mount strategy and reinjection signatures", () => {
  const frontend = readFileSync("src/frontend.ts", "utf8");
  assert.match(frontend, /function findWideMessageRow/);
  assert.match(frontend, /resolveTrackerMountPoint\(messageElement, surface\)/);
  assert.match(frontend, /surface === "inline_wide"/);
  assert.match(frontend, /wide_message_row/);
  assert.match(frontend, /wide_message_element/);
  assert.match(frontend, /displaySurfaceMountStrategy/);
  assert.match(frontend, /displaySurfaceParentWidthConstrained/);
  assert.match(frontend, /lastDisplaySurfaceRehydratedAt/);
  assert.match(frontend, /const signature = \[[\s\S]*surface[\s\S]*mount\.strategy[\s\S]*html/);
});

test("display surface changes apply optimistically and preview paths are functional", () => {
  const frontend = readFileSync("src/frontend.ts", "utf8");
  assert.match(frontend, /function applyDisplaySettingsOptimistically/);
  assert.match(frontend, /isDisplaySurfaceControl\(event\.target\)\) applyDisplaySettingsOptimistically\(true\)/);
  assert.match(frontend, /function openDisplayPreview/);
  assert.match(frontend, /latestPreviewEntry/);
  assert.match(frontend, /openDisplayPreview\(entry, "inline_contained"\)/);
  assert.match(frontend, /openDisplayPreview\(entry, "inline_wide"\)/);
  assert.match(frontend, /openPopover\(entry, target as HTMLElement, true\)/);
  assert.match(frontend, /openFullscreenReader\(entry, true\)/);
  assert.match(frontend, /No tracker snapshot available to preview\. Generate a tracker first\./);
});

test("fullscreen reader has fixed mobile close and clears overlay state", () => {
  const frontend = readFileSync("src/frontend.ts", "utf8");
  assert.match(frontend, /class="ltracker-reader-fixed-close"/);
  assert.match(frontend, /top: max\(10px, env\(safe-area-inset-top\)\)/);
  assert.match(frontend, /right: max\(10px, env\(safe-area-inset-right\)\)/);
  assert.match(frontend, /min-width: 44px/);
  assert.match(frontend, /min-height: 44px/);
  assert.match(frontend, /activeReaderElement\.remove\(\)/);
  assert.match(frontend, /activeReaderElement = null/);
  assert.match(frontend, /ltracker-reader-content-wrapper" style="width: 100%; max-width: min\(100%, var\(--ltracker-reader-content-max, 1100px\)\)/);
});

test("0.16 performance, sanitation, nesting, and memory selection features", () => {
  // 1. Sanitizer: backslashes/escapes and url() protocols stripped
  assert.equal(sanitizeHtml("<div style=\"background: url('http://evil.com')\"></div>").html.trim(), "<div></div>");
  assert.equal(sanitizeHtml("<div style=\"color: \\5c red\"></div>").html.trim(), "<div></div>");
  assert.equal(sanitizeHtml("<div style=\"background: url(data:text/html,evil)\"></div>").html.trim(), "<div></div>");

  // 2. Nested tag guards: checks for nested tags inside embedded tags
  const tags = findLTrackerTags("Hello <ltracker>first <ltracker>second</ltracker> third</ltracker>");
  assert.equal(tags.length, 0);

  // 3. Stable message snapshot index deduplication
  const rawIndex = [
    { messageId: "m1", swipeKey: "index-0", createdAt: "2026-01-01", storageKey: "k1" },
    { messageId: "m1", swipeKey: "index-0", createdAt: "2026-01-02", storageKey: "k2" },
  ];
  const repairedIndex = repairMessageSnapshotIndex(rawIndex);
  assert.equal(repairedIndex.length, 1);
  assert.equal(repairedIndex[0].storageKey, "k1");

  // 4. Tracker memory candidates window size limit formula
  const entries: TrackerMemoryEntry[] = Array.from({ length: 100 }, (_, i) => ({
    messageId: `m${i}`,
    swipeKey: "index-0",
    messageIndex: i,
    swipeIndex: 0,
    swipeId: null,
    swipeContentHash: "h",
    swipeKeySource: "swipe_index",
    createdAt: "2026-01-01",
    presetId: "p",
    presetName: "p",
    storageKey: "k",
  }));
  const mockSettings = {
    enabled: true,
    includeInTrackerGeneration: true,
    retainCount: 5,
    fullSnapshotCount: 2,
    compactOlderSnapshots: true,
    maxMemoryChars: 4000,
    source: "message_attached_snapshot" as const,
    excludeTargetMessage: false,
    order: "recency" as const,
    requireSamePreset: false,
    requireSameSwipeWhenAvailable: false,
  };
  const candidates = selectTrackerMemoryCandidates(entries, mockSettings, { targetSwipeKey: "index-0" });
  // targetRetain = 5 => Math.min(100, Math.max(5 * 6 + 10, 5 + 20)) = Math.min(100, Math.max(40, 25)) = 40
  assert.equal(candidates.length, 40);
});

test("v0.17 Preset Pack Import/Export + Validation + Snapshot tests", () => {
  // 1. Export preset pack
  const mockPreset: TrackerSchemaPreset = {
    id: "test-preset",
    name: "Test Preset",
    description: "A test preset description",
    version: "1.2",
    createdAt: "2026-06-28",
    updatedAt: "2026-06-28",
    jsonSchema: {
      type: "object",
      properties: {
        fieldA: { type: "string" },
        fieldB: { type: "number" }
      }
    },
    htmlTemplate: "<div>{{fieldA}}</div>",
    promptInstructions: "Write fieldA",
    origin: "user_created"
  };

  const pack = exportPresetPack(mockPreset, {
    includeRecommendedSettings: true,
    settings: {
      ...DEFAULT_SETTINGS,
      memory: {
        ...DEFAULT_SETTINGS.memory,
        retainCount: 12
      }
    }
  });

  assert.equal(pack.kind, PRESET_PACK_KIND);
  assert.equal(pack.preset.id, "test-preset");
  assert.equal(pack.recommendedSettings?.memory?.retainCount, 12);

  // 2. Import preset pack (with overwrite)
  const importResult = importPresetPack(pack, ["test-preset"], "2026-06-28");
  assert.equal(importResult.ok, true);
  assert.ok(importResult.preset);
  assert.notEqual(importResult.preset?.id, "test-preset"); // auto-resolved id collision
  assert.equal(importResult.preset?.name, "Test Preset");
  assert.equal(importResult.recommendedSettings?.memory?.retainCount, 12);

  // 3. Validation report
  const validation = validatePresetReport(mockPreset);
  assert.equal(validation.ok, true);
  assert.equal(validation.errorCount, 0);
  assert.equal(validation.missingPlaceholders.length, 0);
  assert.ok(validation.estimatedPromptTokens > 0);

  // 4. Sample snapshot constraints
  const complexSchema = {
    type: "object",
    properties: {
      nested: {
        type: "object",
        properties: {
          deep: {
            type: "object",
            properties: {
              veryDeep: {
                type: "object",
                properties: {
                  limit: { type: "string" }
                }
              }
            }
          }
        }
      },
      list: {
        type: "array",
        items: { type: "string" }
      }
    }
  };

  const snapshot = generateSampleSnapshot(complexSchema);
  assert.ok(snapshot.nested);
  assert.ok(Array.isArray(snapshot.list));
  assert.equal((snapshot.list as unknown[]).length, 2); // array size constraint
});

test("v0.24 snapshot index repair keeps newest entries and filters missing sidecars", () => {
  const rawIndex = [
    { messageId: "m1", swipeKey: "index-0", createdAt: "2026-01-01T00:00:00.000Z", storageKey: "old" },
    { messageId: "m1", swipeKey: "index-0", createdAt: "2026-01-02T00:00:00.000Z", storageKey: "new" },
    { messageId: "m2", swipeKey: "index-1", createdAt: "2026-01-01T00:00:00.000Z", storageKey: "keep" },
    { messageId: "broken" },
  ];

  const repaired = repairMessageSnapshotIndexKeepingNewest(rawIndex);
  assert.equal(repaired.duplicateCount, 1);
  assert.equal(repaired.invalidCount, 1);
  assert.equal(repaired.index.length, 2);
  assert.ok(repaired.index.some((entry) => entry.messageId === "m1" && entry.storageKey === "new"));

  const filtered = filterMessageSnapshotIndexByStorageKeys(repaired.index, new Set(["new"]));
  assert.equal(filtered.removedCount, 1);
  assert.equal(filtered.index.length, 1);
  assert.equal(filtered.index[0].storageKey, "new");
});

test("v0.24 maintenance source exposes health check, repair, and diagnostics wiring", () => {
  const frontend = readFileSync("src/frontend.ts", "utf8");
  const backend = readFileSync("src/backend.ts", "utf8");
  const types = readFileSync("src/shared/types.ts", "utf8");

  assert.match(types, /interface LTrackerMaintenanceReport/);
  assert.match(types, /lastMaintenanceReport: LTrackerMaintenanceReport \| null/);
  assert.match(frontend, /Maintenance & Repair/);
  assert.match(frontend, /function maintenanceReportText/);
  assert.match(frontend, /data-action="copy-health-check-report"/);
  assert.match(frontend, /data-action="copy-maintenance-report"/);
  assert.match(frontend, /data-action="copy-preset-lock-report"/);
  assert.match(frontend, /type: "run_health_check"/);
  assert.match(frontend, /type: "repair_settings"/);
  assert.match(frontend, /type: "repair_snapshot_index"/);
  assert.match(frontend, /type: "repair_preset_render_locks"/);
  assert.match(frontend, /type: "clean_orphan_snapshots"/);
  assert.match(frontend, /type: "clean_broken_embedded_tags"/);
  assert.match(frontend, /Search diagnostics/);
  assert.match(frontend, /Maintenance \/ Repair/);

  assert.match(backend, /structured report|LTrackerMaintenanceReport|createMaintenanceReport/);
  assert.match(backend, /selected tracker profile is not available|Selected tracker profile is not available/i);
  assert.match(backend, /repairActionId: "repair_settings"/);
  assert.match(backend, /repairActionId: "repair_snapshot_index"/);
  assert.match(backend, /repairActionId: "repair_preset_render_locks"/);
  assert.match(backend, /repairActionId: brokenEmbeddedTags > 0 \? "clean_broken_embedded_tags" : null/);
  assert.match(backend, /repairActionId: "clean_orphan_snapshots"/);
  assert.match(backend, /repairSettings\(raw\)/);
  assert.match(backend, /capturePresetRenderLock\(preset, capturedAt\)/);
  assert.match(backend, /presetMatchForSnapshot\(snapshot, presetState\.presets\)/);
});

test("preset pack import allows narrative secret-like schema fields", () => {
  const narrativePreset: TrackerSchemaPreset = {
    id: "narrative-secrets",
    name: "Narrative Secrets",
    description: "Schema intentionally uses fictional secret/private/token words.",
    version: "1.0",
    createdAt: "2026-06-28",
    updatedAt: "2026-06-28",
    jsonSchema: {
      type: "object",
      properties: {
        secrets: { type: "array", items: { type: "string" } },
        secretHints: { type: "string" },
        privateKnowledge: { type: "string" },
        tokens: { type: "array", items: { type: "string" } },
        credentials: { type: "string" },
        hiddenTruths: { type: "array", items: { type: "object" } },
      },
    },
    htmlTemplate: "<section>{{secretHints}}{{#each secrets}}{{this}}{{/each}}</section>",
    promptInstructions: "Track secrets, private knowledge, tokens, and credentials as fictional story state.",
    notes: "private token secret credential words here are narrative, not app secrets.",
    origin: "user_created",
  };
  const pack = exportPresetPack(narrativePreset, {
    exampleSnapshot: {
      secrets: ["The door remembers."],
      secretHints: "Look below the ash.",
      privateKnowledge: "Only the narrator knows this.",
      tokens: ["brass-token"],
      credentials: "fictional court pass",
    },
  });

  const imported = importPresetPack(pack, [], "2026-06-28");
  assert.equal(imported.ok, true);
  assert.equal(imported.error, null);
  assert.equal(imported.preset?.name, "Narrative Secrets");
  assert.equal(typeof imported.preset?.jsonSchema, "object");
  assert.notEqual(imported.preset?.jsonSchema, null);
  assert.match(JSON.stringify(imported.preset?.jsonSchema), /privateKnowledge/);
  assert.match(JSON.stringify(imported.exampleSnapshot), /brass-token/);
});

test("preset pack import strips real recommended setting credentials without leaking values", () => {
  const pack = exportPresetPack(DEFAULT_TRACKER_PRESET);
  const unsafeValue = "sk-live-do-not-leak";
  const unsafePassword = "hunter2-do-not-leak";
  const unsafePrivateKey = "private-key-do-not-leak";
  const imported = importPresetPack({
    ...pack,
    recommendedSettings: {
      connection: {
        mode: "selected_connection_raw",
        apiKey: unsafeValue,
        password: unsafePassword,
        provider: {
          privateKey: unsafePrivateKey,
        },
        credentials: {
          token: "token-do-not-leak",
        },
        parameters: {
          temperature: 0.2,
        },
      },
    },
  }, [], "2026-06-28");

  assert.equal(imported.ok, true);
  const connection = imported.recommendedSettings?.connection as Record<string, unknown>;
  assert.ok(connection);
  assert.equal("apiKey" in connection, false);
  assert.equal("password" in connection, false);
  assert.deepEqual(connection.parameters, { temperature: 0.2 });
  assert.doesNotMatch(JSON.stringify(imported.recommendedSettings), /do-not-leak|hunter2|private-key|token-do-not-leak/);
  assert.ok(imported.warnings.some((warning) => warning.includes("recommendedSettings.connection.apiKey")));
  assert.ok(imported.warnings.some((warning) => warning.includes("recommendedSettings.connection.password")));
  assert.ok(imported.warnings.some((warning) => warning.includes("recommendedSettings.connection.provider.privateKey")));
  assert.ok(imported.warnings.every((warning) => !warning.includes(unsafeValue) && !warning.includes(unsafePassword)));
});

test("exported preset packs never include connection ids or credential-like fields", () => {
  const exported = exportPresetPack(DEFAULT_TRACKER_PRESET, {
    includeRecommendedSettings: true,
    settings: {
      ...DEFAULT_SETTINGS,
      connection: {
        ...DEFAULT_SETTINGS.connection,
        selectedConnectionId: "conn-secret-id",
        selectedConnectionName: "Private Tracker Profile",
      },
    },
  });
  const serialized = JSON.stringify(exported);
  assert.doesNotMatch(serialized, /conn-secret-id|Private Tracker Profile/);
  assert.doesNotMatch(serialized, /apiKey|secretKey|password|privateKey|accessKey|bearer/i);
});

test("Owner Power defaults are disabled and settings repair clamps runtime limits", () => {
  assert.equal(DEFAULT_SETTINGS.ownerPowerMode.enabled, false);
  assert.equal(DEFAULT_SETTINGS.ownerPowerMode.allowRenderLabRuntime, false);
  assert.equal(DEFAULT_SETTINGS.ownerPowerMode.allowInstalledPresetRuntime, false);
  assert.equal(DEFAULT_SETTINGS.ownerPowerMode.allowScriptBlocks, false);
  assert.equal(DEFAULT_SETTINGS.ownerPowerMode.allowTemplateActionHooks, true);
  assert.equal(DEFAULT_SETTINGS.ownerPowerMode.allowExternalUrls, false);
  assert.equal(DEFAULT_SETTINGS.ownerPowerMode.allowNetwork, false);
  assert.equal(DEFAULT_SETTINGS.ownerPowerMode.allowHostDomAccess, false);

  const repaired = repairSettings({
    ...DEFAULT_SETTINGS,
    ownerPowerMode: {
      enabled: true,
      allowRenderLabRuntime: true,
      allowInstalledPresetRuntime: true,
      allowScriptBlocks: true,
      allowTemplateActionHooks: false,
      allowExternalUrls: true,
      allowNetwork: true,
      allowHostDomAccess: true,
      maxScriptChars: 999_999_999,
      maxRuntimeErrors: 0,
      crashDisableThreshold: 999,
      autoDisableOnCrash: false,
    },
  });
  assert.equal(repaired.ownerPowerMode.enabled, true);
  assert.equal(repaired.ownerPowerMode.maxScriptChars, 200_000);
  assert.equal(repaired.ownerPowerMode.maxRuntimeErrors, 1);
  assert.equal(repaired.ownerPowerMode.crashDisableThreshold, 20);
  assert.equal(repaired.ownerPowerMode.autoDisableOnCrash, false);
});

test("Owner Power preset packs import runtime source inertly and cannot auto-enable settings", () => {
  const powerPack = {
    kind: PRESET_PACK_KIND,
    formatVersion: 1,
    exportedAt: "2026-06-29T00:00:00.000Z",
    appCompatibility: {
      extension: "LTracker",
      minVersion: "0.26",
      recommendedVersion: "0.26",
    },
    preset: {
      id: "owner-power-preset",
      name: "Owner Power Preset",
      version: "1.0",
      jsonSchema: { type: "object", properties: { imgFull: { type: "string" } } },
      promptInstructions: "Return imgFull.",
      htmlTemplate: `<div><script type="application/ltracker-owner-power">LTrackerPower.register({});</script><button type="button" data-ltracker-power-action="copy-field" data-path="imgFull">Copy</button></div>`,
      ownerPowerManifest: {
        version: 1,
        usesRuntime: true,
        requiredMode: "owner_power",
        capabilities: ["tabs", "copy-field"],
      },
    },
    recommendedSettings: {
      ownerPowerMode: { enabled: true, allowInstalledPresetRuntime: true },
      renderer: { templateTrustMode: "dev" },
      connection: { selectedConnectionId: "conn-id", selectedConnectionName: "profile", apiKey: "secret" },
    },
  };

  const result = importPresetPack(powerPack, [], "2026-06-29T00:00:00.000Z");
  assert.equal(result.ok, true);
  assert.ok(result.preset?.ownerPowerScript?.includes("LTrackerPower.register"));
  assert.equal(result.preset?.ownerPowerManifest?.requiredMode, "owner_power");
  assert.doesNotMatch(result.preset?.htmlTemplate ?? "", /<script/i);
  assert.equal(result.recommendedSettings?.renderer?.templateTrustMode, "trusted");
  assert.equal(result.recommendedSettings?.ownerPowerMode, undefined);
  assert.equal(result.recommendedSettings?.connection?.selectedConnectionId, "conn-id");
  assert.equal(result.recommendedSettings?.connection?.selectedConnectionName, "profile");
  assert.equal((result.recommendedSettings?.connection as Record<string, unknown>)?.apiKey, undefined);
  assert.match(result.warnings.join("\n"), /Owner Power Mode/);
  assert.match(result.warnings.join("\n"), /cannot enable Owner Power Mode automatically/);
  assert.match(result.warnings.join("\n"), /Recommended settings that attempted to enable Owner Power Mode were stripped/);

  const summary = ownerPowerFeatureSummary(result.preset!);
  assert.equal(summary.requested, true);
  assert.equal(summary.hasScript, true);
  assert.ok(summary.scriptChars > 0);

  const stripped = stripOwnerPowerRecommendedSettings(powerPack.recommendedSettings);
  assert.equal("ownerPowerMode" in stripped.value, false);
  assert.equal((stripped.value.renderer as Record<string, unknown>).templateTrustMode, "trusted");
});

test("Owner Power sanitizer keeps trusted declarative hooks but strips scripts", () => {
  const template = `<script type="application/ltracker-owner-power">ignored()</script><button type="button" data-ltracker-power-action="show-panel" data-target="cast">Cast</button><section data-ltracker-power-panel="cast">OK</section>`;
  const trusted = sanitizeHtml(template, { templateTrustMode: "trusted", allowInlineStyles: true });
  assert.doesNotMatch(trusted.html, /<script/i);
  assert.match(trusted.html, /data-ltracker-power-action="show-panel"/);
  assert.match(trusted.html, /data-ltracker-power-panel="cast"/);
  assert.match(trusted.warnings.join("\n"), /JavaScript requires Dev Mode|Removed unsafe <script>/);

  const safe = sanitizeHtml(template, { templateTrustMode: "safe", allowInlineStyles: false });
  assert.doesNotMatch(safe.html, /data-ltracker-power-action/);
  assert.doesNotMatch(safe.html, /data-ltracker-power-panel/);
});

test("Owner Power export keeps runtime source but not global Owner Power settings", () => {
  const preset: TrackerSchemaPreset = {
    ...DEFAULT_TRACKER_PRESET,
    id: "power-export",
    name: "Power Export",
    origin: "user_created",
    htmlTemplate: `<button type="button" data-ltracker-power-action="reset-view">Reset</button>`,
    ownerPowerScript: "LTrackerPower.register({ mount() {} });",
    ownerPowerManifest: { version: 1, usesRuntime: true, requiredMode: "owner_power" },
  };
  const pack = exportPresetPack(preset, {
    includeRecommendedSettings: true,
    settings: {
      ...DEFAULT_SETTINGS,
      ownerPowerMode: {
        ...DEFAULT_SETTINGS.ownerPowerMode,
        enabled: true,
        allowInstalledPresetRuntime: true,
      },
    },
  });
  assert.equal(pack.preset.ownerPowerScript, preset.ownerPowerScript);
  assert.equal((pack.preset.ownerPowerManifest as Record<string, unknown>).requiredMode, "owner_power");
  assert.equal(pack.recommendedSettings?.ownerPowerMode, undefined);
  assert.doesNotMatch(JSON.stringify(pack.recommendedSettings), /allowInstalledPresetRuntime|ownerPowerMode/);
});

test("Owner Power reports and UI/backend wiring are present", () => {
  const report = ownerPowerReport({
    settings: {
      ...DEFAULT_SETTINGS.ownerPowerMode,
      enabled: true,
      allowTemplateActionHooks: true,
    },
    preset: {
      ...DEFAULT_TRACKER_PRESET,
      ownerPowerScript: "source",
      ownerPowerManifest: { version: 1, usesRuntime: true, requiredMode: "owner_power" },
    },
    crashCount: 2,
    lastEvent: "show-panel",
  });
  assert.match(report, /LTracker Owner Power Report/);
  assert.match(report, /Global enabled: yes/);
  assert.match(report, /Declarative hooks: yes/);
  assert.match(report, /Preset requested Owner Power: yes/);

  const frontend = readFileSync("src/frontend.ts", "utf8");
  assert.match(frontend, /function handleOwnerPowerAction/);
  assert.match(frontend, /data-ltracker-power-action/);
  assert.match(frontend, /data-owner-power-setting="enabled"/);
  assert.match(frontend, /data-action="disable-owner-power"/);
  assert.match(frontend, /data-action="reset-owner-power-settings"/);
  assert.match(frontend, /data-action="clear-owner-power-crashes"/);
  assert.match(frontend, /copy-owner-power-report/);
  assert.match(frontend, /ownerPowerCrashCount/);
  assert.match(frontend, /autoDisableOnCrash/);

  const backend = readFileSync("src/backend.ts", "utf8");
  assert.match(backend, /disable_owner_power/);
  assert.match(backend, /reset_owner_power_settings/);
  assert.match(backend, /clear_owner_power_crashes/);
  assert.match(backend, /Owner Power Mode is enabled/);
  assert.match(backend, /activePresetHasOwnerPowerScript/);
});

test("v0.26.1 Hotfix Completion Verification", () => {
  // 1. Version consistency checks
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const spindleJson = JSON.parse(readFileSync("spindle.json", "utf8"));
  assert.equal(packageJson.version, "0.26.1");
  assert.equal(spindleJson.version, "0.26.1");
  assert.equal(EXTENSION_VERSION, "0.26.1");
  assert.ok(spindleJson.permissions.includes("world_books"));
  assert.ok(spindleJson.permissions.includes("characters"));
  assert.ok(spindleJson.permissions.includes("personas"));

  // 2. Changelog check
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  assert.match(changelog, /## 0\.26\.1 - Prompt Injection Swipe Isolation \+ Stale Tracker Leak Fix/);
  assert.match(changelog, /## 0\.26 - Owner Power Mode \+ Interactive Tracker Runtime/);
  assert.match(changelog, /## 0\.25 - Context Filters, World\/Lore Integration Prep, and Character Exclusions/);
  assert.match(changelog, /## 0\.24 - Cleanup, Repair, Runtime Polish, and Mobile Smoke Fixes/);
  assert.match(changelog, /## 0\.23 - Preset Import Fixes, Drawer Shell Polish, and Validation UX Cleanup/);
  assert.match(changelog, /## 0\.22 - Drawer Shell Polish \+ True Panel Navigation/);
  assert.match(changelog, /## 0\.21 - Drawer Command Center \/ Settings UX Overhaul/);
  assert.match(changelog, /## 0\.20 - Preset Authoring Studio \+ Template Helper Pack \+ Mobile Render QA/);
  assert.match(changelog, /## 0\.19\.2 - Preset-Locked Snapshot Rendering/);
  assert.match(changelog, /## 0\.19\.1 - Display Surface Repair \/ Chat-Width Inline Fix/);
  assert.match(changelog, /## 0\.19 - Trusted Renderer Freedom \/ Power Template Compatibility/);

  // 3. README.md consistency check
  const readme = readFileSync("README.md", "utf8");
  assert.match(readme, /Version: `0\.26\.1`/);
  assert.match(readme, /Current release: `0\.26\.1 Prompt Injection Swipe Isolation \+ Stale Tracker Leak Fix`/);
  assert.match(readme, /Drawer Command Center/);
  assert.match(readme, /v0\.26\.1 Prompt Injection Swipe Isolation \+ Stale Tracker Leak Fix/);
  assert.match(readme, /latest_selected_swipe_only/);
  assert.match(readme, /Prompt Injection Safety Report/);
  assert.match(readme, /v0\.26 Owner Power Mode \+ Interactive Tracker Runtime/);
  assert.match(readme, /Imported packs cannot enable Owner Power automatically/);
  assert.match(readme, /data-ltracker-power-action/);
  assert.match(readme, /Full arbitrary preset JavaScript is intentionally deferred/);
  assert.match(readme, /Disable Owner Power now/);
  assert.match(readme, /v0\.25 Context Filters, World\/Lore Integration Prep, and Character Exclusions/);
  assert.match(readme, /Memory & Context Filters/);
  assert.match(readme, /Tracker Generation Context controls/);
  assert.match(readme, /world_books\.getActivated/);
  assert.match(readme, /characters\.get\(\)/);
  assert.match(readme, /personas\.getActive\(\)/);
  assert.match(readme, /Full native World Book entry body ingestion is deferred/);
  assert.match(readme, /v0\.24 Cleanup, Repair, Runtime Polish, and Mobile Smoke Fixes/);
  assert.match(readme, /Maintenance & Repair/);
  assert.match(readme, /Run Health Check/);
  assert.match(readme, /Repair Snapshot Index/);
  assert.match(readme, /Repair Preset Render Locks/);
  assert.match(readme, /Copy Maintenance Report/);
  assert.match(readme, /Optional Future \/ Backlog/);
  assert.match(readme, /Sequential \+ Partial Regeneration/);
  assert.match(readme, /Preset Authoring Studio 2\.0/);
  assert.match(readme, /v0\.23 Import And Validation Cleanup/);
  assert.match(readme, /fictional fields such as `secrets`, `secretHints`, `tokens`, `credentials`, or `privateKnowledge`/);
  assert.match(readme, /Warnings name the stripped setting path only and never echo the secret value/);
  assert.match(readme, /Only the active panel renders at a time/);
  assert.match(readme, /Render Lab.*floating fullscreen-style overlay/s);
  assert.match(readme, /Quick Setup Profiles/);
  assert.match(readme, /Preset-Locked Snapshot Rendering/);
  assert.match(readme, /Template Helper Pack/);
  assert.match(readme, /Preset Render Lab/);
  assert.match(readme, /Mobile Torture/);
  assert.match(readme, /Changing the active preset later does not repaint old trackers/);
  assert.match(readme, /Which display mode should I use\?/);
  assert.match(readme, /Display surface: Inline wide/);
  assert.doesNotMatch(readme, /Current release: `0\.17/);

  // 4. Global stylesheet element presence check in frontend
  const frontendSource = readFileSync("src/frontend.ts", "utf8");
  assert.match(frontendSource, /ltracker-dom-style/);
  assert.match(frontendSource, /LTRACKER_DOM_TRACKER_CSS/);
  assert.match(frontendSource, /Memory & Context Filters/);
  assert.match(frontendSource, /data-context-filter-setting="enabled"/);
  assert.match(frontendSource, /data-context-filter-setting="excludedCharacterNames"/);
  assert.match(frontendSource, /data-context-filter-setting="manualWorldLoreContext"/);
  assert.match(frontendSource, /data-action="copy-included-context"/);
  assert.match(frontendSource, /data-action="copy-exclusion-report"/);
  assert.match(frontendSource, /data-owner-power-setting="enabled"/);
  assert.match(frontendSource, /data-ltracker-power-action/);
  assert.match(frontendSource, /function handleOwnerPowerAction/);
  assert.match(frontendSource, /copy-owner-power-report/);
  assert.match(frontendSource, /disable_owner_power/);
  assert.match(frontendSource, /data-injection-setting="isolationMode"/);
  assert.match(frontendSource, /copy-prompt-injection-safety-report/);
  assert.match(frontendSource, /apply-swipe-safe-injection-defaults/);

  // 5. Check size guard validation in backend importPreset
  const backendSource = readFileSync("src/backend.ts", "utf8");
  assert.match(backendSource, /resolvePromptInjectionBoundaryFromMessages/);
  assert.match(backendSource, /isolatePromptInjectionEntries/);
  assert.match(backendSource, /allowLatestChatSnapshotFallback = true/);
  assert.match(backendSource, /applySwipeSafeInjectionDefaultsAction/);
  assert.match(backendSource, /applySwipeSafeMemoryDefaultsAction/);
  assert.match(backendSource, /ownerPowerFeatureSummary/);
  assert.match(backendSource, /async function disableOwnerPowerAction/);
  assert.match(backendSource, /async function resetOwnerPowerSettingsAction/);
  assert.match(backendSource, /async function clearOwnerPowerCrashesAction/);
  assert.match(backendSource, /applyContextFiltersToTranscript/);
  assert.match(backendSource, /autoSkipReasonForContextFilters/);
  assert.match(backendSource, /spindle\.world_books\.getActivated/);
  assert.match(backendSource, /spindle\.characters\.get/);
  assert.match(backendSource, /spindle\.personas\.getActive/);
  assert.match(backendSource, /Context filters left no eligible chat messages/);
  assert.match(backendSource, /World\/lore context is enabled/);
  assert.match(backendSource, /Character context is enabled/);
  assert.match(backendSource, /Persona context is enabled/);
  assert.match(backendSource, /presetImportMaxChars/);
  assert.match(backendSource, /JSON\.parse\(importText\)/);
  assert.match(backendSource, /capturePresetRenderLock\(presetState\.activePreset, completedAt\)/);
  assert.match(backendSource, /\.\.\.existing\.snapshot[\s\S]*data: parsed[\s\S]*editedByUser: true/);
  assert.match(backendSource, /async function buildMaintenanceReport/);
  assert.match(backendSource, /async function runHealthCheck/);
  assert.match(backendSource, /async function repairSettingsAction/);
  assert.match(backendSource, /async function repairSnapshotIndexAction/);
  assert.match(backendSource, /async function repairPresetRenderLocksAction/);
  assert.match(backendSource, /async function cleanBrokenEmbeddedTagsAction/);
  assert.match(backendSource, /repairSettings\(raw\)/);
  assert.match(backendSource, /repairMessageSnapshotIndexKeepingNewest/);
  assert.match(backendSource, /filterMessageSnapshotIndexByStorageKeys/);
  assert.match(backendSource, /never silently rebind|do not silently rebind|active preset/);

  // 6. Frontend/backend render paths resolve per snapshot instead of blindly using the active preset.
  assert.match(frontendSource, /presets: state\.presets/);
  assert.match(frontendSource, /renderPresetSourceLabel/);
  assert.match(frontendSource, /Rebind to current preset \(future\)/);
  assert.match(backendSource, /buildMessageTrackerHistory\(\{[\s\S]*presets: presetState\.presets/);
  assert.match(backendSource, /resolvePresetForSnapshot\(snapshotSource, presetState\.presets, presetState\.activePreset\)/);

  // 7. Malformed and nested tag parsing checks
  const normalTags = findLTrackerTags("<ltracker>content</ltracker>");
  assert.equal(normalTags.length, 1);
  assert.equal(normalTags[0].content, "content");

  const malformedNestedTags = findLTrackerTags("Hello <ltracker>first <ltracker>second</ltracker> third</ltracker>");
  assert.equal(malformedNestedTags.length, 0); // Nested tags are ignored/rejected
});

