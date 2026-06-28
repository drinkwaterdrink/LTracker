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
} from "../src/shared/embeddedTrackerTag";
import {
  buildTrackerGenerationRequest,
  buildTrackerReasoningOverride,
  cleanTrackerGenerationParameters,
} from "../src/shared/generationRequest";
import {
  buildMessageTrackerHistory,
  claimMessageWidget,
  formatDurationMs,
  renderMessageTracker,
} from "../src/shared/messageDisplay";
import {
  normalizeMessageAttachedSnapshotPresetMetadata,
  normalizeTrackerSnapshotPresetMetadata,
  repairMessageSnapshotIndex,
  removeMessageSnapshotIndexEntry,
  upsertMessageSnapshotIndexEntry,
} from "../src/shared/messageSnapshotIndex";
import {
  isQuietGenerationType,
  shouldScheduleAutoTracker,
} from "../src/shared/auto";
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
import type {
  MessageAttachedSnapshot,
  TrackerSnapshot,
} from "../src/shared/types";

const sampleSnapshot: TrackerSnapshot = {
  schemaVersion: 1,
  extensionVersion: "0.13",
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
  extensionVersion: "0.13",
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

test("repairSettings adds and repairs connection settings", () => {
  const migrated = repairSettings({
    recentMessageLimit: 12,
  });
  assert.equal(migrated.connection.mode, "active_quiet");
  assert.equal(migrated.connection.parameters.temperature, 0.2);
  assert.equal(migrated.connection.parameters.max_tokens, 2000);
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
  assert.equal(settings.connection.parameters.max_tokens, 32_000);
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
  assert.equal(raw.modeUsed, "selected_connection_raw");
  assert.equal(raw.fallbackReason, null);

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
  assert.match(first, /<ltracker type="state" version="0.13" swipe="index-0">/);
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

test("repairSettings repairs injection settings with defaults and clamping", () => {
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    injection: {
      enabled: true,
      mode: "latest_message_snapshot",
      format: "minimal",
      maxInjectedChars: "999999",
      includeHeader: false,
      includeTimestamp: false,
      includeSourceMessageId: true,
      onlyInjectWhenSnapshotExists: false,
    },
  });

  assert.equal(settings.injection.enabled, true);
  assert.equal(settings.injection.mode, "latest_message_snapshot");
  assert.equal(settings.injection.format, "minimal");
  assert.equal(settings.injection.maxInjectedChars, 20_000);
  assert.equal(settings.injection.includeHeader, false);
  assert.equal(settings.injection.includeTimestamp, false);
  assert.equal(settings.injection.includeSourceMessageId, true);
  assert.equal(settings.injection.onlyInjectWhenSnapshotExists, false);

  const repaired = repairSettings({ injection: { mode: "bad", format: "bad", maxInjectedChars: 10 } });
  assert.equal(repaired.injection.mode, DEFAULT_SETTINGS.injection.mode);
  assert.equal(repaired.injection.format, DEFAULT_SETTINGS.injection.format);
  assert.equal(repaired.injection.maxInjectedChars, 500);
});

test("formatSnapshotForInjection renders compact snapshots", () => {
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    injection: {
      ...DEFAULT_SETTINGS.injection,
      enabled: true,
      format: "compact",
    },
  });

  const text = formatSnapshotForInjection(sampleSnapshot, settings.injection);
  assert.match(text, /\[LTracker Snapshot\]/);
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
      mode: "latest_message_snapshot",
      format: "pretty_json",
      includeSourceMessageId: true,
    },
  });

  const text = formatSnapshotForInjection(sampleMessageSnapshot, settings.injection);
  assert.match(text, /\[LTracker Snapshot JSON\]/);
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
  assert.match(text, /\[LTracker Mini-State\]/);
  assert.match(text, /Location: Grand Meridian Court/);
  assert.match(text, /Cast: Aleister Crowley; Sable Mareth/);
  assert.match(text, /Continuity:/);
});

test("formatSnapshotForInjection strips unsafe control characters and escapes HTML", () => {
  const snapshot: TrackerSnapshot = {
    ...sampleSnapshot,
    presetId: sampleSnapshot.presetId,
    presetName: sampleSnapshot.presetName,
    presetVersion: sampleSnapshot.presetVersion,
    data: {
      ...sampleSnapshot.data,
      important_facts: ["<script>alert(1)</script>\u0007"],
    },
  };
  const settings = repairSettings({
    ...DEFAULT_SETTINGS,
    injection: {
      ...DEFAULT_SETTINGS.injection,
      enabled: true,
    },
  });

  const text = formatSnapshotForInjection(snapshot, settings.injection);
  assert.doesNotMatch(text, /<script>/);
  assert.match(text, /&lt;script&gt;/);
  assert.doesNotMatch(text, /\u0007/);
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
      mode: "latest_message_snapshot",
      includeSourceMessageId: true,
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
  assert.equal(sanitized.html, "<div style=\"color: red; padding: 4px\">Safe</div>");
  assert.ok(sanitized.warnings.some((warning) => warning.includes("background-image")));
  assert.ok(sanitized.warnings.some((warning) => warning.includes("position")));
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
  assert.match(rendered.html, /style="background-color: #101820; padding: 6px"/);
  assert.doesNotMatch(rendered.html, /position/);
  assert.ok(rendered.warnings.some((warning) => warning.includes("position")));
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
  assert.equal(settings.renderer.maxRenderedChars, 200_000);
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
  assert.equal(settings.messageDisplay.displayMode, "inline_button_popover");
  assert.equal(settings.messageDisplay.placement, "bottom");
  assert.equal(settings.messageDisplay.source, "latest_chat_snapshot");
  assert.equal(settings.messageDisplay.renderMode, "pretty_json");
  assert.equal(settings.messageDisplay.allowInlineStyles, false);
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
  assert.equal(settings.messageDisplay.showGenerationDuration, false);
  assert.equal(settings.messageDisplay.minimizedMaxHeightPx, 400);
  assert.equal(settings.messageDisplay.maxRenderedChars, 200_000);

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
  assert.match(CONTEXT_HANDLER_DISABLED_REASON, /disabled in 0\.13/);
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

test("connection test path does not mutate tracker snapshots or chat tags", () => {
  const backend = readFileSync("src/backend.ts", "utf8");
  const match = /async function testTrackerConnection[\s\S]*?\n}\n\nasync function cancelConnectionTest/.exec(backend);
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

test("README settings reference covers the major setting groups", () => {
  const readme = readFileSync("README.md", "utf8");
  for (const text of [
    "Settings Reference",
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
    "Tracker Connection Settings",
    "active_quiet",
    "selected_connection_quiet",
    "selected_connection_raw",
    "API keys are never exposed",
    "Test Tracker Connection",
    "connection.mode",
    "connection.selectedConnectionId",
    "connection.refreshConnectionsOnDrawerOpen",
    "connection.parameters.temperature",
    "connection.parameters.max_tokens",
    "connection.parameters.top_p",
    "connection.parameters.frequency_penalty",
    "connection.parameters.presence_penalty",
    "connection.reasoning.source",
    "connection.reasoning.apiReasoning",
    "connection.reasoning.effort",
    "connection.reasoning.thinkingDisplay",
    "connection.testPrompt",
    "injection.enabled",
    "injection.mode",
    "injection.format",
    "injection.maxInjectedChars",
    "injection.includeHeader",
    "injection.includeTimestamp",
    "injection.includeSourceMessageId",
    "injection.onlyInjectWhenSnapshotExists",
    "renderer.enabled",
    "renderer.previewSource",
    "renderer.missingValuePlaceholder",
    "renderer.maxRenderedChars",
    "renderer.allowInlineStyles",
    "messageDisplay.enabled",
    "messageDisplay.useDomInjection",
    "messageDisplay.fallbackToIframeWidget",
    "messageDisplay.attachmentMode",
    "messageDisplay.displayMode",
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
    "debounce",
    "missing value placeholder",
    "include header",
    "compact",
    "minimal",
    "pretty_json",
    "drawer renderer",
    "message display",
    "message-attached snapshot",
    "embedded tracker tag",
    "button popover",
    "latest chat snapshot",
    "collapsed by default",
    "sanitized inline styles",
    "copy buttons",
    "top vs bottom",
    "compact message control pill",
    "Generate tracker",
    "stop/cancel",
    "native toolbar fallback",
    "Default: Trusted Preset Mode",
    "Safe Mode",
    "Dev Mode",
    "0.14 Power Template Engine",
    "0.15 Dev Mode Templates",
    "0.16 Sequential + Partial Regeneration",
    "0.17 Cleanup / Repair / Pending Fields",
    "0.18 World Books, Character Exclusions, Import/Export Polish",
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
  assert.match(frontend, /Context handler injection is disabled in 0\.13/);
  assert.match(frontend, /registerTagInterceptor/);
  assert.match(frontend, /data-settings-save-status/);
  assert.match(frontend, /saveSettings\("settings-auto"\)/);
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
