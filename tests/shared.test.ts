import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TRACKER_SCHEMA } from "../src/shared/defaultSchema";
import { parseTrackerJson } from "../src/shared/parser";
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
