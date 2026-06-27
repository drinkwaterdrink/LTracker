# LTracker

Version: `0.08`

LTracker is a Lumiverse Spindle extension that creates tracker snapshots from recent chat messages. It is inspired by Zaakh/SillyTavern-zTracker's tracker concept, but this project is a fresh Lumiverse-native implementation and does not depend on SillyTavern APIs, globals, DOM selectors, templates, prompt builders, World Info APIs, connection profile APIs, or `generate_interceptor`.

## Current Features

- Registers a Lumiverse drawer tab named `LTracker`.
- Registers an input-bar action named `Generate Tracker`.
- Reads recent chat messages with `spindle.chat.getMessages()`.
- Generates tracker JSON with `spindle.generate.quiet()` using the user's active/default generation connection.
- Saves the latest per-chat tracker snapshot in user extension storage.
- Supports manual tracker generation from the drawer or input-bar action.
- Supports Auto Mode after assistant completions, with optional user-message triggers.
- Stores message-attached tracker snapshots keyed by exact message id.
- Maintains a message snapshot index at `chats/{chatId}/message-snapshots/index.json`.
- Adds preset id, preset name, and preset version metadata to new tracker snapshots.
- Renders sanitized tracker HTML previews in the drawer.
- Renders message-attached tracker widgets through the official Lumiverse message widget API when available.
- Shows a persistent drawer `Message Tracker History` for every indexed message-attached snapshot.
- Keeps prompt injection settings saved, but context-handler injection remains disabled in `0.08`.

## Message Display In 0.08

LTracker inspected the installed `lumiverse-spindle-types@0.5.21` API and found the official frontend surface `ctx.messages.renderWidget()`. Version `0.08` uses that host-supported message-local widget API to render sandboxed tracker widgets attached to the exact assistant message that triggered Auto Mode.

The verified widget API accepts a message id, widget id, and sandboxed HTML. It is documented as rendering below a message. LTracker exposes a `messageDisplay.placement` preference because top/bottom placement is part of the desired zTracker-like behavior, but the current verified Lumiverse widget API controls the final mount position and currently provides below-message widgets. LTracker does not mutate chat message text, does not use SillyTavern-style DOM selectors, and does not rely on private Lumiverse CSS class names.

The drawer history remains available even when inline widgets are supported. It is the durable fallback and audit view:

- It lists indexed message snapshots chronologically.
- It includes message index, message id, snapshot timestamp, preset name, rendered preview, and copy buttons.
- It persists across refresh because it is built from the storage index rather than scanning unknown storage keys.
- If a runtime ever lacks `ctx.messages.renderWidget()`, the widgets are skipped and the drawer history still shows the stored trackers.

## Storage

LTracker writes user-scoped extension storage only:

- Latest chat snapshot: `chats/{chatId}/latest-snapshot.json`
- Message-attached snapshot: `chats/{chatId}/messages/{messageId}/tracker-snapshot.json`
- Message snapshot index: `chats/{chatId}/message-snapshots/index.json`
- Settings: `settings.json`
- Preset index and presets: `presets/index.json` and `presets/{presetId}.json`

Older snapshots without preset metadata still load. Missing preset id, name, or version is normalized to `null`.

## Auto Mode

Auto Mode is off by default. When enabled, LTracker subscribes to Lumiverse generation/message events and schedules tracker generation after qualifying messages. The primary assistant trigger is `GENERATION_ENDED`, which provides the saved assistant `messageId`; `MESSAGE_SENT` is used only for the optional user-message trigger path.

Auto Mode includes debounce, skip-first-message gating, one active job per chat, quiet-generation filtering so LTracker does not recursively trigger itself, and active-chat-only stale job handling.

## Context Handler Injection

Prompt injection is disabled in `0.08`. The `context_handler` permission remains absent from `spindle.json`, and LTracker does not call `spindle.registerContextHandler()`.

The injection settings are retained so existing user choices are not lost. They are not active until the Lumiverse context handler return contract is verified and re-enabled safely. Normal Lumiverse message generation should continue to work with LTracker enabled.

## Schema Presets

Schema Presets let each chat choose the tracker shape and extraction instructions used by manual and auto tracker generation. The drawer uses a zTracker-style three-box layout:

- `Schema Box 1 - JSON Schema`: controls the requested tracker structure sent to the model.
- `Schema Box 2 - HTML Template`: renders sanitized drawer previews and message widgets.
- `Prompt Box - AI Instructions`: guides tracker extraction while the backend keeps non-overridable rules for JSON-only output, exact names, no invention, unknown fields, and current/relevant state.

The built-in `Default Scene Tracker` is read-only. Duplicate it before customizing. Preset export copies one `ltracker_schema_preset` JSON envelope; import validates the envelope and preserves HTML templates as text for sanitized rendering.

## Safe HTML Template Renderer

Supported template syntax:

- `{{path.to.value}}` inserts an escaped tracker value, such as `{{scene.location}}`.
- `{{json path.to.value}}` inserts escaped JSON text.
- `{{#each array}}...{{/each}}` repeats a block for array items.

Renderer safety rules:

- Rendered templates are sanitized before display.
- Template values are escaped by default.
- JavaScript from templates is never executed.
- Unsafe tags, event handler attributes, URL-bearing attributes, SVG, MathML, forms, buttons, and external resources are stripped.
- Inline styles are stripped by default. If enabled for drawer preview, only a small allowlist is kept.
- Message widgets use sanitized HTML and sandboxed iframe rendering.
- Context-handler injection remains disabled and never receives rendered HTML.

## Diagnostics

The drawer diagnostics panel shows generation, auto mode, storage, preset, renderer, injection, and message display state. New `0.08` diagnostics include:

- `messageDisplayEnabled`
- `messageDisplayMode`
- `messageDisplayPlacement`
- `messageDisplayHydratedCount`
- `lastMessageDisplayHydratedAt`
- `lastMessageDisplayError`
- `messageLocalUiSupported`
- `messageLocalUiFallbackReason`
- `messageSnapshotIndexCount`

Diagnostics may contain chat-derived prompt previews, raw model output, and parsed tracker JSON when those save settings are enabled.

## Settings Reference

Settings are stored in per-user extension storage at `settings.json` and repaired back to safe defaults if missing or malformed.

### General

| Setting | Default | What it does | When to increase or enable | When to decrease or disable |
| --- | --- | --- | --- | --- |
| `recentMessageLimit` | `24` | Number of recent chat messages read for tracker generation. | Increase when tracker output misses older context. | Decrease to reduce prompt size and generation cost. |
| `maxMessageChars` | `8000` | Maximum characters kept from each message before prompting the tracker model. | Increase for long-form roleplay messages where late details matter. | Decrease if prompts are too large or slow. |
| `generationTimeoutMs` | `45000` | How long LTracker waits for quiet tracker generation. | Increase for slow providers or large schemas. | Decrease if failed tracker jobs should return faster. |
| `saveRawOutput` | `true` | Saves the model's raw tracker response for diagnostics. | Enable while debugging parse failures. | Disable to store less model output. |
| `savePromptPreview` | `true` | Saves the tracker prompt preview for diagnostics. | Enable when tuning schema/prompt behavior. | Disable to store less chat-derived prompt text. |

### Auto Mode

| Setting | Default | What it does | When to increase or enable | When to decrease or disable |
| --- | --- | --- | --- | --- |
| `auto.autoModeEnabled` (`autoModeEnabled`) | `false` | Turns automatic tracker generation on or off. | Enable after the manual button works for the chat. | Disable when testing or avoiding extra generations. |
| `auto.autoDebounceMs` (`autoDebounceMs`) | `1500` | Wait time after a qualifying message before generating. Debounce means rapid events collapse into one job. | Increase if events arrive in bursts or messages save slowly. | Decrease if tracker updates feel late. |
| `auto.skipFirstMessages` (`skipFirstMessages`) | `2` | Avoids auto generation until the chat has enough messages. | Increase for setup-heavy chats. | Decrease if early tracker state is useful. |
| `auto.triggerAfterAssistantMessages` (`triggerAfterAssistantMessages`) | `true` | Generates after assistant completions. | Keep enabled for zTracker-like per-response snapshots. | Disable if only manual or user-message tracking is desired. |
| `auto.triggerAfterUserMessages` (`triggerAfterUserMessages`) | `false` | Generates after user messages through the message-sent event path. | Enable for user-turn state tracking experiments. | Keep disabled to reduce extra jobs. |
| `auto.attachSnapshotToMessage` (`attachSnapshotToMessage`) | `true` | Saves the auto snapshot under the triggering message id and updates the index. | Keep enabled for message widgets and history. | Disable if only the latest chat snapshot matters. |
| `auto.onlyWhenChatActive` (`onlyWhenChatActive`) | `true` | Ignores stale auto jobs if the user switches chats. | Keep enabled for safer multi-chat use. | Disable only if background chat tracking is intentionally desired later. |

### Prompt Injection

Prompt injection is disabled in `0.08` unless a later version safely re-enables context-handler registration.

| Setting | Default | What it does | When to increase or enable | When to decrease or disable |
| --- | --- | --- | --- | --- |
| `injection.enabled` | `false` | User preference for cached tracker injection. In `0.08`, it is saved but inactive. | Enable only for future testing after context injection is restored. | Keep disabled for normal `0.08` use. |
| `injection.mode` | `latest_chat_snapshot` | Chooses latest chat snapshot or latest message-attached snapshot as injection source. | Use message snapshots when per-response state matters. | Use chat snapshot for broad current-state summaries. |
| `injection.format` | `compact` | Chooses `compact`, `minimal`, or `pretty_json` text. | Use JSON for inspection; compact for readable continuity. | Use minimal to save context if injection returns later. |
| `injection.maxInjectedChars` | `3000` | Character cap for injected text. | Increase if compact state is being truncated. | Decrease to reduce context size. |
| `injection.includeHeader` | `true` | Adds a label like `[LTracker Snapshot]`. | Enable to make injected text easy to identify. | Disable to save a few tokens. |
| `injection.includeTimestamp` | `true` | Adds snapshot timestamp. | Enable when freshness matters. | Disable to shorten output. |
| `injection.includeSourceMessageId` | `false` | Adds source message id for message snapshots. | Enable for debugging attachment timing. | Disable for cleaner prompt text. |
| `injection.onlyInjectWhenSnapshotExists` | `true` | Avoids empty placeholder injection when no snapshot exists. | Keep enabled for clean prompts. | Disable only if a future placeholder workflow needs it. |

### Renderer

| Setting | Default | What it does | When to increase or enable | When to decrease or disable |
| --- | --- | --- | --- | --- |
| `renderer.enabled` | `true` | Enables sanitized drawer preview rendering. | Keep enabled when using HTML templates. | Disable to inspect plain text fallback. |
| `renderer.previewSource` | `latest_chat_snapshot` | Chooses drawer preview source. | Use message snapshot to preview the latest attached response. | Use chat snapshot for the current chat-wide tracker. |
| `renderer.missingValuePlaceholder` | empty string | Text shown when a template references a missing field. | Set to `unknown` while debugging schemas. | Leave blank for cleaner display. |
| `renderer.maxRenderedChars` | `50000` | Character cap for drawer-rendered HTML and fallback text. | Increase for large tracker templates. | Decrease to keep the drawer lighter. |
| `renderer.allowInlineStyles` | `false` | Allows a small sanitized inline-style allowlist in drawer previews. | Enable for trusted templates needing simple formatting. | Keep disabled for stricter rendering. |

### Message Display

| Setting | Default | What it does | When to increase or enable | When to decrease or disable |
| --- | --- | --- | --- | --- |
| `messageDisplay.enabled` | `true` | Enables message widgets and the rendered history model. | Keep enabled for visible per-message trackers. | Disable to remove inline widgets and rely on raw snapshots. |
| `messageDisplay.placement` | `top` | Desired top/bottom placement. The verified widget API currently mounts below messages. | Use top as the target behavior for future host support. | Use bottom to match the current widget API. |
| `messageDisplay.source` | `message_attached_snapshot` | Chooses exact message-attached snapshot or latest chat snapshot for display. | Use attached snapshots for scrollback accuracy. | Use latest chat snapshot only when you want all displays to mirror current state. |
| `messageDisplay.renderMode` | `html_template` | Chooses template HTML, compact text, or pretty JSON. | Use template HTML for rich zTracker-like display. | Use compact text or JSON for debugging and simpler rendering. |
| `messageDisplay.collapsedByDefault` | `false` | Starts tracker blocks collapsed or open. | Enable for mobile or very large trackers. | Disable when you want trackers visible while scrolling. |
| `messageDisplay.showTimestamp` | `true` | Shows snapshot timestamp in widget/history headers. | Keep enabled to judge freshness. | Disable for a quieter header. |
| `messageDisplay.showPresetName` | `true` | Shows preset name in widget/history headers. | Keep enabled when testing multiple presets. | Disable for a shorter header. |
| `messageDisplay.showCopyButton` | `true` | Shows copy buttons for JSON, HTML, and text when the surface supports them. | Keep enabled for debugging/exporting tracker state. | Disable for a cleaner display. |
| `messageDisplay.maxRenderedChars` | `50000` | Character cap for message display HTML/text/JSON. | Increase for large templates. | Decrease to keep message widgets and history lighter. |

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
| `chat_mutation` | Reads chat messages through `spindle.chat.getMessages()`. LTracker does not mutate chat message content in `0.08`. | Generate requests show a clear missing-permission error. |

Drawer tabs, input-bar actions, message widgets, frontend/backend messaging, logging, toasts, and user storage are free-tier or frontend surfaces in the inspected `lumiverse-spindle-types@0.5.21` API.

## Known Limitations

- Context-handler prompt injection is disabled in `0.08` to protect normal Lumiverse generation.
- `messageDisplay.placement` is a preference because `ctx.messages.renderWidget()` currently renders below a message.
- No connection settings, interceptor, World Books, Memory Cortex, character-card context, sequential generation, partial regeneration, cleanup/pending repair mode, or per-field regeneration yet.
- Auto Mode depends on Lumiverse event delivery and the user-scoped `userId` supplied by the host.
- Diagnostics may contain sensitive chat-derived prompt and model output when raw/prompt saving is enabled.
- If future Lumiverse API versions change generation, chat, message-widget, or storage signatures, the thin adapters should be updated first.

## Roadmap

1. `0.09 Connection Settings`
2. `0.10 Sequential + Partial Regeneration`
3. `0.11 Cleanup + Repair Mode`
4. `0.12 World Books, Character Exclusions, Import/Export polish, TOON/XML/native modes`

## Attribution

LTracker is inspired by Zaakh/SillyTavern-zTracker and its tracker-oriented design. No zTracker source code is copied in version `0.08`. If future versions copy or adapt zTracker code, preserve the original MIT attribution and license notices.
