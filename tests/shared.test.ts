import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TRACKER_SCHEMA } from "../src/shared/defaultSchema";
import {
  buildInjectionDecision,
  shouldSkipContextForInternalGeneration,
} from "../src/shared/contextInjection";
import {
  formatTemplateTextFallback,
  renderHtmlTemplate,
  sanitizeHtml,
} from "../src/shared/htmlTemplateRenderer";
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
  extensionVersion: "0.06",
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
  extensionVersion: "0.06",
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
