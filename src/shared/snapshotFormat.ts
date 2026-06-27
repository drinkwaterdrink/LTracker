import type {
  LTrackerInjectionSettings,
  MessageAttachedSnapshot,
  TrackerSnapshot,
} from "./types";

interface NormalizedSnapshot {
  snapshot: TrackerSnapshot;
  sourceMessageId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMessageAttachedSnapshot(value: TrackerSnapshot | MessageAttachedSnapshot): value is MessageAttachedSnapshot {
  return "snapshot" in value && isRecord(value.snapshot);
}

function normalizeSnapshot(value: TrackerSnapshot | MessageAttachedSnapshot): NormalizedSnapshot {
  if (isMessageAttachedSnapshot(value)) {
    return {
      snapshot: value.snapshot,
      sourceMessageId: value.messageId,
    };
  }
  return {
    snapshot: value,
    sourceMessageId: null,
  };
}

export function sanitizePromptText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function truncateSafe(value: string, maxChars: number): string {
  const chars = Array.from(value);
  if (chars.length <= maxChars) return value;
  const suffix = "\n[truncated]";
  if (maxChars <= 0) return "";
  const suffixChars = Array.from(suffix);
  if (maxChars <= suffixChars.length) return suffixChars.slice(0, maxChars).join("");
  const keep = Math.max(0, maxChars - suffixChars.length);
  return `${chars.slice(0, keep).join("")}${suffix}`;
}

function primitiveToString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

function recordSummary(value: Record<string, unknown>): string | null {
  const preferred = ["name", "title", "status", "recent_change", "current_goal", "emotional_state", "physical_state"];
  const direct = preferred
    .map((key) => primitiveToString(value[key]))
    .filter((item): item is string => Boolean(item));
  if (direct.length > 0) return direct.join(" - ");

  const fragments = Object.entries(value)
    .map(([key, entry]) => {
      const rendered = primitiveToString(entry);
      return rendered ? `${key}: ${rendered}` : null;
    })
    .filter((item): item is string => Boolean(item));
  return fragments.length > 0 ? fragments.slice(0, 4).join("; ") : null;
}

function listFromUnknown(value: unknown): string[] {
  const primitive = primitiveToString(value);
  if (primitive) return [primitive];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const rendered = primitiveToString(item);
        if (rendered) return rendered;
        return isRecord(item) ? recordSummary(item) : null;
      })
      .filter((item): item is string => Boolean(item));
  }
  if (isRecord(value)) {
    const summary = recordSummary(value);
    return summary ? [summary] : [];
  }
  return [];
}

function stringAt(data: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = data;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return primitiveToString(current);
}

function sceneLine(data: Record<string, unknown>): string | null {
  const parts = [
    stringAt(data, ["scene", "location"]),
    stringAt(data, ["scene", "date"]) ?? stringAt(data, ["scene", "time"]),
    stringAt(data, ["scene", "mood"]),
    stringAt(data, ["scene", "danger_level"]),
  ].filter((item): item is string => Boolean(item));
  return parts.length > 0 ? parts.join(", ") : null;
}

function characterNames(data: Record<string, unknown>): string[] {
  return listFromUnknown(data.characters_present)
    .map((item) => item.split(" - ")[0]?.trim() ?? item.trim())
    .filter(Boolean);
}

function importantState(data: Record<string, unknown>): string[] {
  const facts = listFromUnknown(data.important_facts);
  const continuity = listFromUnknown(data.unresolved_continuity);
  const pressure = listFromUnknown(data.next_scene_pressure);
  return [...facts, ...continuity, ...pressure].slice(0, 8);
}

function openThreads(data: Record<string, unknown>): string[] {
  return listFromUnknown(data.active_threads).slice(0, 8);
}

function fallbackSummary(data: Record<string, unknown>): string {
  const fragments = Object.entries(data)
    .map(([key, value]) => {
      if (isRecord(value)) return `${key}: ${recordSummary(value) ?? "set"}`;
      const list = listFromUnknown(value);
      if (list.length > 0) return `${key}: ${list.slice(0, 2).join("; ")}`;
      return null;
    })
    .filter((item): item is string => Boolean(item));
  return fragments.slice(0, 6).join("\n");
}

function metadataLines(
  snapshot: TrackerSnapshot,
  sourceMessageId: string | null,
  settings: LTrackerInjectionSettings,
): string[] {
  const lines: string[] = [];
  if (settings.includeTimestamp) lines.push(`Generated: ${snapshot.createdAt}`);
  if (settings.includeSourceMessageId && sourceMessageId) lines.push(`Source message: ${sourceMessageId}`);
  return lines;
}

function formatCompact(
  snapshot: TrackerSnapshot,
  sourceMessageId: string | null,
  settings: LTrackerInjectionSettings,
): string {
  const lines: string[] = [];
  if (settings.includeHeader) lines.push("[LTracker Snapshot]");
  lines.push(...metadataLines(snapshot, sourceMessageId, settings));

  const scene = sceneLine(snapshot.data);
  if (scene) lines.push(`Scene: ${scene}`);

  const present = characterNames(snapshot.data);
  if (present.length > 0) lines.push(`Present: ${present.join("; ")}`);

  const state = importantState(snapshot.data);
  if (state.length > 0) {
    lines.push("Important state:");
    lines.push(...state.map((item) => `- ${item}`));
  }

  const threads = openThreads(snapshot.data);
  if (threads.length > 0) {
    lines.push("Open threads:");
    lines.push(...threads.map((item) => `- ${item}`));
  }

  if (lines.length === 0 || (settings.includeHeader && lines.length === 1)) {
    lines.push(fallbackSummary(snapshot.data));
  }

  return lines.filter(Boolean).join("\n");
}

function formatPrettyJson(
  source: TrackerSnapshot | MessageAttachedSnapshot,
  snapshot: TrackerSnapshot,
  sourceMessageId: string | null,
  settings: LTrackerInjectionSettings,
): string {
  const payload = isMessageAttachedSnapshot(source)
    ? {
        messageId: source.messageId,
        messageIndex: source.messageIndex,
        attachedAt: source.attachedAt,
        snapshotCreatedAt: snapshot.createdAt,
        data: snapshot.data,
      }
    : {
        snapshotCreatedAt: snapshot.createdAt,
        data: snapshot.data,
      };
  const lines: string[] = [];
  if (settings.includeHeader) lines.push("[LTracker Snapshot JSON]");
  lines.push(...metadataLines(snapshot, sourceMessageId, settings));
  lines.push(JSON.stringify(payload, null, 2));
  return lines.join("\n");
}

function formatMinimal(
  snapshot: TrackerSnapshot,
  sourceMessageId: string | null,
  settings: LTrackerInjectionSettings,
): string {
  const lines: string[] = [];
  if (settings.includeHeader) lines.push("[LTracker Mini-State]");
  lines.push(...metadataLines(snapshot, sourceMessageId, settings));
  lines.push(`Location: ${stringAt(snapshot.data, ["scene", "location"]) ?? "Unknown"}`);
  const cast = characterNames(snapshot.data);
  lines.push(`Cast: ${cast.length > 0 ? cast.join("; ") : "Unknown"}`);
  const continuity = [
    ...importantState(snapshot.data),
    ...openThreads(snapshot.data),
  ];
  lines.push(`Continuity: ${continuity.length > 0 ? continuity.slice(0, 4).join("; ") : "No cached continuity details."}`);
  return lines.join("\n");
}

export function formatSnapshotForInjection(
  source: TrackerSnapshot | MessageAttachedSnapshot,
  settings: LTrackerInjectionSettings,
): string {
  const { snapshot, sourceMessageId } = normalizeSnapshot(source);
  const raw = settings.format === "pretty_json"
    ? formatPrettyJson(source, snapshot, sourceMessageId, settings)
    : settings.format === "minimal"
      ? formatMinimal(snapshot, sourceMessageId, settings)
      : formatCompact(snapshot, sourceMessageId, settings);
  return truncateSafe(sanitizePromptText(raw), settings.maxInjectedChars);
}
