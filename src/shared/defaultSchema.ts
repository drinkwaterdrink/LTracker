export const DEFAULT_TRACKER_SCHEMA = {
  scene: {
    time: "",
    date: "",
    location: "",
    weather: "",
    mood: "",
    danger_level: "",
  },
  characters_present: [
    {
      name: "",
      role: "",
      physical_state: "",
      emotional_state: "",
      outfit: "",
      current_goal: "",
      secrets_or_tension: "",
    },
  ],
  relationships: [
    {
      a: "",
      b: "",
      status: "",
      recent_change: "",
    },
  ],
  inventory_and_assets: [],
  active_threads: [],
  unresolved_continuity: [],
  important_facts: [],
  next_scene_pressure: "",
} as const;

export function defaultTrackerSchemaJson(): string {
  return JSON.stringify(DEFAULT_TRACKER_SCHEMA, null, 2);
}
