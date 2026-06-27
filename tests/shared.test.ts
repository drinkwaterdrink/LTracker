import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TRACKER_SCHEMA } from "../src/shared/defaultSchema";
import {
  buildInjectionDecision,
  shouldSkipContextForInternalGeneration,
} from "../src/shared/contextInjection";
import {
  isQuietGenerationType,
  shouldScheduleAutoTracker,
} from "../src/shared/auto";
import { parseTrackerJson } from "../src/shared/parser";
import {
  DEFAULT_SETTINGS,
  repairSettings,
} from "../src/shared/settings";
import {
  formatSnapshotForInjection,
  truncateSafe,
} from "../src/shared/snapshotFormat";
import { messageSnapshotPath } from "../src/shared/storageKeys";
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
  extensionVersion: "0.04",
  chatId: "chat-a",
  createdAt: "2003-09-22T16:18:00.000Z",
  messageCount: 8,
  sourceMessageIds: ["m1", "m2"],
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
  extensionVersion: "0.04",
  chatId: "chat-a",
  messageId: "m2",
  messageIndex: 7,
  trigger: {
    kind: "auto",
    requestId: "auto",
    eventType: "GENERATION_ENDED",
    sourceMessageId: "m2",
    sourceMessageIndex: 7,
    generationId: "g1",
    generationType: "normal",
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
    messageSnapshotPath("chat id/1", "message id/2"),
    "chats/chat%20id%2F1/messages/message%20id%2F2/tracker-snapshot.json",
  );
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
