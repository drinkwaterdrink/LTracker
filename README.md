# LTracker

Version: `0.02`

LTracker is a Lumiverse Spindle extension that creates a manual, per-chat tracker snapshot from recent chat messages. It is inspired by Zaakh/SillyTavern-zTracker's tracker concept, but this project is a fresh Lumiverse-native implementation and does not depend on SillyTavern APIs, globals, DOM selectors, templates, prompt builders, World Info APIs, connection profile APIs, or `generate_interceptor`.

## Current MVP Features

- Registers a Lumiverse drawer tab named `LTracker`.
- Registers an input-bar action named `Generate Tracker`.
- Reads the active chat id from the frontend context, with a backend `spindle.chats.getActive(userId)` fallback.
- Reads recent messages with `spindle.chat.getMessages()`.
- Builds a compact tracker extraction prompt.
- Calls `spindle.generate.quiet()` using the user's active/default generation connection.
- Parses model output as JSON with basic fenced-text, surrounding-text, and trailing-comma repair.
- Validates that the parsed tracker is an object.
- Saves the latest snapshot in per-user extension storage keyed by chat id.
- Displays status, latest snapshot JSON, diagnostics, settings, and structured errors in the drawer.

## Diagnostics

The drawer includes a diagnostics panel for manual debugging before automatic generation or prompt injection are added. It shows:

- Extension version, active chat id, current status, and permission status.
- Last generation start/completion timestamps and duration.
- Number of messages read and source message ids/range.
- Storage key used for the current chat snapshot.
- Last raw model output, collapsed by default.
- Last prompt preview, collapsed by default.
- Last parsed tracker JSON.
- Last parse, generation, storage, or active-chat error with a stage label.
- Build/type information when available.
- Last cancelled job when a newer Generate Tracker request supersedes an older one.

The drawer also includes buttons for Refresh State, Generate Tracker, Clear Current Chat Snapshot, Copy Latest Tracker JSON, Copy Last Prompt, and Copy Last Raw Output. All displayed model output is escaped; LTracker does not render raw LLM HTML.

## Generator Settings

Settings are stored in per-user extension storage at `settings.json` and repaired back to safe defaults if missing or malformed.

| Setting | Default | Bounds |
| --- | --- | --- |
| `recentMessageLimit` | `24` | `1` to `200` |
| `maxMessageChars` | `8000` | `500` to `50000` |
| `generationTimeoutMs` | `45000` | `10000` to `180000` |
| `saveRawOutput` | `true` | boolean |
| `savePromptPreview` | `true` | boolean |

Use Save Settings to persist changes or Reset Settings to restore defaults.

## Debugging A Failed Generation

1. Open the LTracker drawer.
2. Click Refresh State.
3. Check permission status for `generation`, `chats`, and `chat_mutation`.
4. Inspect the staged error in Last parse/generation/storage error.
5. Expand Last prompt preview to verify the transcript and schema sent to the model.
6. Expand Last raw model output to see whether the model returned valid JSON.
7. If parsing failed, copy the raw output and compare it with the default schema.
8. Adjust message limits or timeout in Generator Settings, save, and run Generate Tracker again.

## Install And Development

```bash
npm install
npm run validate
```

Validation runs TypeScript typecheck, shared-module tests, backend/frontend bundling, and the backend scanner. Build output is written to `dist/backend.js` and `dist/frontend.js`, which are referenced by `spindle.json`.

## Permissions

| Permission | Used for | Degrade behavior |
| --- | --- | --- |
| `generation` | Calls `spindle.generate.quiet()` for manual tracker extraction. | Generate requests show a clear missing-permission error. |
| `chats` | Resolves the user's active chat through `spindle.chats.getActive()` when the frontend does not supply one. | Generate requests fall back to the frontend-supplied chat id or show a clear missing-permission error. |
| `chat_mutation` | Reads chat messages through `spindle.chat.getMessages()`. | Generate requests show a clear missing-permission error. |

Drawer tabs, input-bar actions, frontend/backend messaging, logging, toasts, and user storage are treated as free-tier surfaces in the inspected `lumiverse-spindle-types@0.5.21` API.

## Known Limitations

- LTracker is still manual-only; there is no auto mode yet.
- No context handler, interceptor, prompt injection, World Books, Memory Cortex, schema editor, per-field regeneration, cleanup/pending fields, or message-local widgets.
- The MVP uses prompt-engineered JSON rather than provider-native structured output.
- Diagnostics may contain sensitive chat-derived prompt and model output when raw/prompt saving is enabled.
- If future Lumiverse API versions change generation, chat, or storage signatures, the thin backend adapters should be updated first.

## Roadmap

1. `0.03 Auto Mode`: generate after assistant messages with debounce, one job per chat, and stale-job protection.
2. Compact cached snapshot injection through a context handler.
3. Optional interceptor mode for exact prompt placement.
4. Schema presets and schema editor.
5. Sequential generation, per-section regeneration, and per-field regeneration.
6. Cleanup/pending field workflows.
7. World Book allowlists and character exclusions after permissions/API verification.
8. Export/import flows and deeper diagnostics.

## Attribution

LTracker is inspired by Zaakh/SillyTavern-zTracker and its tracker-oriented design. No zTracker source code is copied in version `0.02`. If future versions copy or adapt zTracker code, preserve the original MIT attribution and license notices.
