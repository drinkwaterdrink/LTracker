# LTracker

Version: `0.05`

LTracker is a Lumiverse Spindle extension that creates per-chat tracker snapshots from recent chat messages. It is inspired by Zaakh/SillyTavern-zTracker's tracker concept, but this project is a fresh Lumiverse-native implementation and does not depend on SillyTavern APIs, globals, DOM selectors, templates, prompt builders, World Info APIs, connection profile APIs, or `generate_interceptor`.

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
- Optionally auto-generates after assistant completions or user messages with debounce and first-message skipping.
- Optionally saves a storage-only tracker snapshot attached to the triggering message id.
- Optionally injects the latest cached tracker snapshot into normal generation context through a context handler.
- Provides Schema Presets for selecting, editing, importing, and exporting tracker schemas and prompt instructions.
- Stores optional HTML template text for a future renderer while keeping it inert in `0.05`.
- Displays status, latest snapshot JSON, diagnostics, settings, and structured errors in the drawer.

## Auto Mode

Auto Mode is off by default. When enabled, LTracker subscribes to Lumiverse generation/message events and schedules tracker generation after qualifying messages. The current primary assistant trigger is `GENERATION_ENDED`, which provides the saved assistant `messageId`; `MESSAGE_SENT` is used as the user-message trigger path when enabled.

Auto Mode includes:

- Debounce per user/chat so rapid events collapse into one pending tracker job.
- Skip-first-message gating to avoid early chat setup turns.
- A running-job guard so auto mode does not start while a tracker generation is already active for that chat.
- Active-chat-only mode, enabled by default.
- Stale pending-job cleanup on chat switches, settings reset, and extension unload.
- Quiet-generation filtering so LTracker's own tracker calls do not recursively trigger auto mode.
- Storage-only message-attached snapshots at `chats/{chatId}/messages/{messageId}/tracker-snapshot.json`.

Message-attached snapshots do not mutate chat messages and do not add visible message widgets in `0.05`.

## Context Handler Injection

Prompt injection is off by default. When enabled, LTracker registers a Lumiverse context handler and injects formatted cached tracker state into normal roleplay generations. It never runs tracker generation inside the context handler; the hook only reads extension storage, formats an existing snapshot, and returns quickly.

Supported injection modes:

- `latest_chat_snapshot`: injects the latest per-chat tracker snapshot.
- `latest_message_snapshot`: injects the latest storage-only snapshot attached to a triggering message.

Supported formats:

- `compact`: readable continuity block for scene, cast, important state, and open threads.
- `minimal`: short model-facing location/cast/continuity summary.
- `pretty_json`: sanitized, pretty-printed JSON block.

The installed `lumiverse-spindle-types@0.5.21` exposes `spindle.registerContextHandler(handler, priority?)` with an `unknown` context shape and `unknown` return type. LTracker isolates this behind a thin adapter and currently returns a plain text context block. If a future Lumiverse API documents a richer context-block DTO, update the adapter first.

To test injection:

1. Generate a tracker manually.
2. Enable LTracker injection in the drawer and save settings.
3. Start a normal roleplay generation.
4. Confirm diagnostics show an injected block, character count, snapshot timestamp, and no skipped reason.

## Schema Presets

Schema Presets let each chat choose the tracker shape and extraction instructions used by manual and auto tracker generation. Existing chats continue to use the built-in `Default Scene Tracker` when no preset has been selected.

The drawer uses a zTracker-style three-box layout:

- `Schema Box 1 - JSON Schema`: active in `0.05`; controls the requested tracker structure sent to the model.
- `Schema Box 2 - HTML Template`: stored only in `0.05`; escaped in the drawer, never rendered as HTML, and never injected into chat messages.
- `Prompt Box - AI Instructions`: active in `0.05`; guides tracker extraction while the backend keeps non-overridable rules for JSON-only output, exact names, no invention, unknown fields, and current/relevant state.

The built-in `Default Scene Tracker` is read-only and reproduces the previous default tracker behavior. User-created and imported presets can be edited or deleted. Use Duplicate Preset to fork the built-in preset before customizing it.

Preset export copies one `ltracker_schema_preset` JSON envelope. Import validates `kind`, `formatVersion`, and preset content, generates a new id on conflicts, marks imported presets as `user_imported`, and preserves any HTML template as plain text only.

## Diagnostics

The drawer includes a diagnostics panel for manual debugging. It shows:

- Extension version, active chat id, current status, and permission status.
- Last generation start/completion timestamps and duration.
- Last generation source, manual or auto.
- Auto event, scheduled, triggered, skipped, and source-message details.
- Latest message-attached snapshot id, index, timestamp, and storage key.
- Injection enabled state, last injection timestamp, skipped reason, injected character count, snapshot timestamp, and source message id.
- Selected preset id/name, fallback reason, validation error, and preset used for the last tracker prompt.
- Number of messages read and source message ids/range.
- Storage key used for the current chat snapshot.
- Last raw model output, collapsed by default.
- Last prompt preview, collapsed by default.
- Last parsed tracker JSON.
- Last parse, generation, storage, or active-chat error with a stage label.
- Build/type information when available.
- Last cancelled job when a newer Generate Tracker request supersedes an older one.

The drawer also includes buttons for Refresh State, Generate Tracker, Clear Current Chat Snapshot, Copy Latest Tracker JSON, Copy Last Prompt, Copy Last Raw Output, Copy Message Snapshot, and Copy Injection Preview. All displayed model output is escaped; LTracker does not render raw LLM HTML.

## Generator Settings

Settings are stored in per-user extension storage at `settings.json` and repaired back to safe defaults if missing or malformed.

| Setting | Default | Bounds |
| --- | --- | --- |
| `recentMessageLimit` | `24` | `1` to `200` |
| `maxMessageChars` | `8000` | `500` to `50000` |
| `generationTimeoutMs` | `45000` | `10000` to `180000` |
| `saveRawOutput` | `true` | boolean |
| `savePromptPreview` | `true` | boolean |
| `auto.autoModeEnabled` | `false` | boolean |
| `auto.autoDebounceMs` | `1500` | `250` to `30000` |
| `auto.skipFirstMessages` | `2` | `0` to `100` |
| `auto.triggerAfterAssistantMessages` | `true` | boolean |
| `auto.triggerAfterUserMessages` | `false` | boolean |
| `auto.attachSnapshotToMessage` | `true` | boolean |
| `auto.onlyWhenChatActive` | `true` | boolean |
| `injection.enabled` | `false` | boolean |
| `injection.mode` | `latest_chat_snapshot` | `latest_chat_snapshot` or `latest_message_snapshot` |
| `injection.format` | `compact` | `compact`, `pretty_json`, or `minimal` |
| `injection.maxInjectedChars` | `3000` | `500` to `20000` |
| `injection.includeHeader` | `true` | boolean |
| `injection.includeTimestamp` | `true` | boolean |
| `injection.includeSourceMessageId` | `false` | boolean |
| `injection.onlyInjectWhenSnapshotExists` | `true` | boolean |

Use Save Settings to persist changes or Reset Settings to restore defaults.

## Debugging A Failed Generation

1. Open the LTracker drawer.
2. Click Refresh State.
3. Check permission status for `generation`, `chats`, `chat_mutation`, and `context_handler`.
4. Inspect the staged error in Last parse/generation/storage error.
5. Expand Last prompt preview to verify the transcript, selected preset schema, and instructions sent to the model.
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
| `generation` | Calls `spindle.generate.quiet()` for tracker extraction and listens for generation-completed events. | Generate requests show a clear missing-permission error; auto assistant triggers cannot run. |
| `chats` | Resolves the user's active chat through `spindle.chats.getActive()` when the frontend does not supply one. | Generate requests fall back to the frontend-supplied chat id or show a clear missing-permission error. |
| `chat_mutation` | Reads chat messages through `spindle.chat.getMessages()`. LTracker does not mutate chat message content in `0.05`. | Generate requests show a clear missing-permission error. |
| `context_handler` | Registers `spindle.registerContextHandler()` for optional cached tracker snapshot injection. | Injection stays unavailable and diagnostics show missing permission. |

Drawer tabs, input-bar actions, frontend/backend messaging, logging, toasts, and user storage are treated as free-tier surfaces in the inspected `lumiverse-spindle-types@0.5.21` API.

## Known Limitations

- No interceptor, World Books, Memory Cortex, custom HTML template renderer, connection-profile selection, per-field regeneration, cleanup/pending fields, or message-local widgets.
- JSON Schema and prompt instructions are active for generation, but the HTML template box is storage-only until the `0.06` renderer phase.
- Auto Mode depends on Lumiverse event delivery and the user-scoped `userId` supplied by the host. If an event arrives without a known user, LTracker skips it.
- Active-chat-only stale-job handling is best-effort when the drawer has not yet observed a chat switch.
- Context handler payload and return types are loose in `lumiverse-spindle-types@0.5.21`; LTracker uses a conservative text-return adapter and fails to no-op if it cannot resolve user/chat context.
- The MVP uses prompt-engineered JSON rather than provider-native structured output.
- Diagnostics may contain sensitive chat-derived prompt and model output when raw/prompt saving is enabled.
- If future Lumiverse API versions change generation, chat, or storage signatures, the thin backend adapters should be updated first.

## Roadmap

1. `0.06 Safe HTML Template Renderer`.
2. `0.07 Connection Settings`.
3. `0.08 Visible Per-Response Tracker Blocks / Message Widgets`.
4. `0.09 Sequential + Partial Regeneration`.
5. `0.10 Cleanup + Repair Mode`.
6. `0.11 World Books, Character Exclusions, Import/Export polish, TOON/XML/native modes`.

## Attribution

LTracker is inspired by Zaakh/SillyTavern-zTracker and its tracker-oriented design. No zTracker source code is copied in version `0.05`. If future versions copy or adapt zTracker code, preserve the original MIT attribution and license notices.
