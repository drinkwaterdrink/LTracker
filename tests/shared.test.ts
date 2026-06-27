import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TRACKER_SCHEMA } from "../src/shared/defaultSchema";
import {
  isQuietGenerationType,
  shouldScheduleAutoTracker,
} from "../src/shared/auto";
import { parseTrackerJson } from "../src/shared/parser";
import {
  DEFAULT_SETTINGS,
  repairSettings,
} from "../src/shared/settings";
import { messageSnapshotPath } from "../src/shared/storageKeys";
import {
  buildCompactTranscript,
  buildTrackerPrompt,
} from "../src/shared/trackerPrompt";

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
