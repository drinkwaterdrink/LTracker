function normalizeJsonText(raw: string): string {
  return raw
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'");
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function removeTrailingCommas(raw: string): string {
  return raw.replace(/,\s*([}\]])/g, "$1");
}

function extractBalancedObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      return raw.slice(start, index + 1);
    }
  }

  return null;
}

function parseObject(candidate: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(candidate);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Tracker output must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function parseTrackerJson(raw: string): Record<string, unknown> {
  if (!raw.trim()) throw new Error("Tracker generation returned empty output.");

  const candidates = [
    normalizeJsonText(raw),
    stripCodeFence(normalizeJsonText(raw)),
    extractBalancedObject(stripCodeFence(normalizeJsonText(raw))) ?? "",
  ].filter((candidate) => candidate.trim().length > 0);

  const repaired = candidates.flatMap((candidate) => [
    candidate,
    removeTrailingCommas(candidate),
  ]);

  let lastError: unknown = null;
  for (const candidate of repaired) {
    try {
      return parseObject(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Tracker output was not valid JSON after basic repair. ${detail}`);
}
