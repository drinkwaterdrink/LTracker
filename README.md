# LTracker

Version: `0.09`

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
- Adds preset id, preset name, preset version, and generation timing metadata to new tracker snapshots.
- Renders sanitized tracker HTML previews in the drawer.
- Renders compact message-attached tracker widgets through the official Lumiverse message widget API when available.
- Shows a persistent drawer `Message Tracker History` for every indexed message-attached snapshot.
- Keeps prompt injection settings saved, but context-handler injection remains disabled in `0.09`.

## Message Widget UX

LTracker inspected the installed `lumiverse-spindle-types@0.5.21` API and local examples for `ctx.messages.renderWidget()`. The verified API accepts a message id, widget id, sandboxed HTML, and height options. It is documented as rendering below a message, and no official top placement, before-message slot, header adornment, or above-content option was found.

Because of that, `messageDisplay.placement` is treated as desired placement for future Lumiverse support. Current Lumiverse API renders below messages. LTracker does not mutate chat message text, does not patch private DOM selectors, and does not rely on private Lumiverse class names.

Version `0.09` makes widgets compact:

- A slim header shows `LTracker`, optional preset/timestamp metadata, and elapsed duration.
- Message widgets are collapsed by default to save space, especially on mobile.
- The top-right icon regenerates the tracker for that specific message only.
- Clicking the same icon while that widget job is running cancels that job when the widget message bridge is available.
- Previous message snapshots are preserved on cancellation.
- Copy JSON, Copy HTML, and Copy Text buttons are intentionally removed from message widgets by default.
- Copy buttons remain available in drawer history when `messageDisplay.showDebugCopyButtonsInHistory` is enabled.

## Storage

LTracker writes user-scoped extension storage only:

- Latest chat snapshot: `chats/{chatId}/latest-snapshot.json`
- Message-attached snapshot: `chats/{chatId}/messages/{messageId}/tracker-snapshot.json`
- Message snapshot index: `chats/{chatId}/message-snapshots/index.json`
- Settings: `settings.json`
- Preset index and presets: `presets/index.json` and `presets/{presetId}.json`

Older snapshots without preset metadata or generation duration still load. Missing preset id, preset name, preset version, and generation timing fields normalize to `null`.

## Auto Mode

Auto Mode is off by default. When enabled, LTracker subscribes to Lumiverse generation/message events and schedules tracker generation after qualifying messages. The primary assistant trigger is `GENERATION_ENDED`, which provides the saved assistant `messageId`; `MESSAGE_SENT` is used only for the optional user-message trigger path.

Auto Mode includes debounce, skip-first-message gating, one active job per chat, quiet-generation filtering so LTracker does not recursively trigger itself, and active-chat-only stale job handling.

## Context Handler Injection

Prompt injection is disabled in `0.09`. The `context_handler` permission remains absent from `spindle.json`, and LTracker does not call `spindle.registerContextHandler()`.

The injection settings are retained so existing user choices are not lost. They are not active until the Lumiverse context handler return contract is verified and re-enabled safely. Normal Lumiverse message generation should continue to work with LTracker enabled.

## Schema Presets

Schema Presets let each chat choose the tracker shape and extraction instructions used by manual, auto, and per-message widget regeneration.

- `Schema Box 1 - JSON Schema` controls the requested tracker structure sent to the model.
- `Schema Box 2 - HTML Template` renders sanitized drawer previews and message widgets.
- `Prompt Box - AI Instructions` guides tracker extraction while the backend keeps non-overridable rules for JSON-only output, exact names, no invention, unknown fields, and current/relevant state.

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

The drawer diagnostics panel shows generation, auto mode, storage, preset, renderer, injection, and message display state. New `0.09` diagnostics include:

- `lastWidgetRegenerateMessageId`
- `lastWidgetRegenerateStartedAt`
- `lastWidgetRegenerateCompletedAt`
- `lastWidgetRegenerateDurationMs`
- `lastWidgetRegenerateCancelledAt`
- `lastWidgetRegenerateError`
- `activeWidgetRegenerationCount`
- `messageWidgetPlacementResolved`
- `messageWidgetPlacementReason`

Diagnostics may contain chat-derived prompt previews, raw model output, and parsed tracker JSON when those save settings are enabled.

## Settings Reference

Settings are stored in per-user extension storage at `settings.json` and repaired back to safe defaults if missing or malformed.

### General

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `recentMessageLimit` | `24` | Number of recent chat messages read for tracker generation. | Increase when tracker output misses older context. | Decrease to reduce prompt size and generation cost. | More context can improve continuity but costs more tokens and time. |
| `maxMessageChars` | `8000` | Maximum characters kept from each message before prompting the tracker model. | Increase for long-form messages where late details matter. | Decrease if prompts are too large or slow. | Higher caps preserve detail but can crowd the tracker prompt. |
| `generationTimeoutMs` | `45000` | How long LTracker waits for quiet tracker generation. | Increase for slow providers or large schemas. | Decrease if failed tracker jobs should return faster. | Longer timeouts reduce false failures but make stuck jobs linger. |
| `saveRawOutput` | `true` | Saves the model's raw tracker response for diagnostics. | Enable while debugging parse failures. | Disable to store less model output. | Helpful debugging data may include sensitive chat-derived text. |
| `savePromptPreview` | `true` | Saves the tracker prompt preview for diagnostics. | Enable when tuning schema/prompt behavior. | Disable to store less chat-derived prompt text. | Easier prompt debugging costs more stored diagnostic data. |

### Auto Mode

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `auto.autoModeEnabled` | `false` | Turns automatic tracker generation on or off. | Enable after the manual button works for the chat. | Disable when testing or avoiding extra generations. | Convenience costs extra model calls. |
| `auto.autoDebounceMs` | `1500` | Wait time after a qualifying message before generating. Debounce means rapid events collapse into one job. | Increase if events arrive in bursts or messages save slowly. | Decrease if tracker updates feel late. | More delay avoids duplicate work but feels less immediate. |
| `auto.skipFirstMessages` | `2` | Avoids auto generation until the chat has enough messages. | Increase for setup-heavy chats. | Decrease if early tracker state is useful. | Waiting gives the model more context but delays first state. |
| `auto.triggerAfterAssistantMessages` | `true` | Generates after assistant completions. | Keep enabled for zTracker-like per-response snapshots. | Disable if only manual or user-message tracking is desired. | Accurate scrollback costs one tracker job after assistant turns. |
| `auto.triggerAfterUserMessages` | `false` | Generates after user messages through the message-sent event path. | Enable for user-turn state tracking experiments. | Keep disabled to reduce extra jobs. | More reactive state can double tracker traffic. |
| `auto.attachSnapshotToMessage` | `true` | Saves the auto snapshot under the triggering message id and updates the index. | Keep enabled for message widgets and history. | Disable if only the latest chat snapshot matters. | Message-attached snapshot storage improves scrollback accuracy but stores more records. |
| `auto.onlyWhenChatActive` | `true` | Ignores stale auto jobs if the user switches chats. | Keep enabled for safer multi-chat use. | Disable only if background chat tracking is intentionally desired later. | Safer active-chat behavior can skip background updates. |

### Prompt Injection

Prompt injection is disabled in `0.09` unless a later version safely re-enables context-handler registration.

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `injection.enabled` | `false` | User preference for cached tracker injection. In `0.09`, it is saved but inactive. | Enable only for future testing after context injection is restored. | Keep disabled for normal `0.09` use. | Stored preference is ready for later, but it does nothing now. |
| `injection.mode` | `latest_chat_snapshot` | Chooses latest chat snapshot or latest message-attached snapshot as injection source. | Use message-attached snapshot when per-response state matters. | Use latest chat snapshot for broad current-state summaries. | Exact message state is precise; chat-wide state is simpler. |
| `injection.format` | `compact` | Chooses `compact`, `minimal`, or `pretty_json` text. `compact` is readable continuity, `minimal` is short, and `pretty_json` is best for inspection. | Use `pretty_json` for debugging; use `compact` for readable continuity. | Use `minimal` to save context if injection returns later. | Richer formats are easier to inspect but consume more prompt space. |
| `injection.maxInjectedChars` | `3000` | Character cap for injected text. | Increase if compact state is being truncated. | Decrease to reduce context size. | More injected state can help continuity but competes with chat context. |
| `injection.includeHeader` | `true` | Adds an include header label like `[LTracker Snapshot]`. | Enable to make injected text easy to identify. | Disable to save a few tokens. | A header improves clarity but adds small overhead. |
| `injection.includeTimestamp` | `true` | Adds snapshot timestamp. | Enable when freshness matters. | Disable to shorten output. | Freshness context costs a little text. |
| `injection.includeSourceMessageId` | `false` | Adds source message id for message snapshots. | Enable for debugging attachment timing. | Disable for cleaner prompt text. | Debug precision adds technical clutter. |
| `injection.onlyInjectWhenSnapshotExists` | `true` | Avoids empty placeholder injection when no snapshot exists. | Keep enabled for clean prompts. | Disable only if a future placeholder workflow needs it. | Clean prompts omit missing state, while placeholders can make absence explicit. |

### Renderer

The drawer renderer is the drawer preview surface. It is separate from message display, which controls inline message widgets and drawer history rows.

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `renderer.enabled` | `true` | Enables sanitized drawer preview rendering. | Keep enabled when using HTML templates. | Disable to inspect plain text fallback. | Rich preview is easier to read but adds rendering work. |
| `renderer.previewSource` | `latest_chat_snapshot` | Chooses drawer preview source. | Use latest message snapshot to preview the latest attached response. | Use latest chat snapshot for the current chat-wide tracker. | Message source checks attachment behavior; chat source checks current state. |
| `renderer.missingValuePlaceholder` | empty string | Missing value placeholder shown when a template references a missing field. | Set to `unknown` while debugging schemas. | Leave blank for cleaner display. | Placeholders reveal schema gaps but can make previews noisy. |
| `renderer.maxRenderedChars` | `50000` | Character cap for drawer-rendered HTML and fallback text. | Increase for large tracker templates. | Decrease to keep the drawer lighter. | Higher caps show more output but can make the drawer heavier. |
| `renderer.allowInlineStyles` | `false` | Allows a small set of sanitized inline styles in drawer previews. | Enable for trusted templates needing simple formatting. | Keep disabled for stricter rendering. | Sanitized inline styles improve presentation but widen the allowed HTML surface. |

### Message Display

Message display controls message widgets and the drawer history model. It can use a message-attached snapshot for exact scrollback state or the latest chat snapshot when you want every display to mirror current state.

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `messageDisplay.enabled` | `true` | Enables message widgets and the rendered history model. | Keep enabled for visible per-message trackers. | Disable to remove inline widgets and rely on raw snapshots. | Visible state is useful but adds UI surface. |
| `messageDisplay.placement` | `top` | Desired top vs bottom placement. Current Lumiverse widget API renders below messages. | Use `top` as the target behavior for future host support. | Use `bottom` to match the current widget API. | The setting preserves intent even though the host controls actual placement today. |
| `messageDisplay.source` | `message_attached_snapshot` | Chooses exact message-attached snapshot or latest chat snapshot for display. | Use message-attached snapshot for scrollback accuracy. | Use latest chat snapshot only when all displays should mirror current state. | Exact history is more faithful; latest state is easier to compare. |
| `messageDisplay.renderMode` | `html_template` | Chooses template HTML, compact text, or pretty JSON. | Use template HTML for rich zTracker-like display. | Use compact text or `pretty_json` for debugging and simpler rendering. | Rich HTML is readable but template-dependent. |
| `messageDisplay.collapsedByDefault` | `true` | Starts tracker blocks collapsed by default. | Enable for mobile or large trackers. | Disable when you want trackers visible while scrolling. | Collapsed widgets save space but require one click to inspect. |
| `messageDisplay.showTimestamp` | `true` | Shows snapshot timestamp in widget/history headers. | Keep enabled to judge freshness. | Disable for a quieter header. | Timestamp clarity adds header text. |
| `messageDisplay.showPresetName` | `true` | Shows preset name in widget/history headers. | Keep enabled when testing multiple presets. | Disable for a shorter header. | Preset clarity adds header text. |
| `messageDisplay.showDebugCopyButtonsInHistory` | `true` | Shows copy buttons for JSON, HTML, and text in drawer history only. | Enable for debugging/exporting tracker state. | Disable for a cleaner history view. | Copy buttons help audits but are intentionally kept out of compact widgets. |
| `messageDisplay.showWidgetRegenerateButton` | `true` | Shows the icon-only per-message regenerate/cancel control in widgets. | Keep enabled for targeted tracker repairs. | Disable if widgets should be display-only. | Direct controls are faster but add one interactive button per widget. |
| `messageDisplay.showGenerationDuration` | `true` | Shows completed generation duration and live elapsed time when feasible. | Keep enabled while tuning providers or schemas. | Disable for the quietest widget header. | Timing helps diagnose slow trackers but adds small header metadata. |
| `messageDisplay.maxRenderedChars` | `50000` | Character cap for message display HTML/text/JSON. | Increase for large templates. | Decrease to keep message widgets and history lighter. | Higher caps preserve detail but can make widgets heavy. |

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
| `chat_mutation` | Reads chat messages through `spindle.chat.getMessages()`. LTracker does not mutate chat message content in `0.09`. | Generate requests show a clear missing-permission error. |

Drawer tabs, input-bar actions, message widgets, frontend/backend messaging, logging, toasts, and user storage are free-tier or frontend surfaces in the inspected `lumiverse-spindle-types@0.5.21` API.

## Known Limitations

- Context-handler prompt injection is disabled in `0.09` to protect normal Lumiverse generation.
- `messageDisplay.placement` is a preference because `ctx.messages.renderWidget()` currently renders below a message.
- Widget-to-extension regeneration/cancel uses the sandbox widget postMessage bridge and frontend widget handler. If a future Lumiverse runtime blocks that bridge, use drawer history regeneration instead.
- No connection settings, interceptor, World Books, Memory Cortex, character-card context, sequential generation, partial regeneration, cleanup/pending repair mode, or per-field regeneration yet.
- Auto Mode depends on Lumiverse event delivery and the user-scoped `userId` supplied by the host.
- Diagnostics may contain sensitive chat-derived prompt and model output when raw/prompt saving is enabled.
- If future Lumiverse API versions change generation, chat, message-widget, or storage signatures, the thin adapters should be updated first.

## Roadmap

1. `0.10 Connection Settings`
2. `0.11 Sequential + Partial Regeneration`
3. `0.12 Cleanup + Repair Mode`
4. `0.13 World Books, Character Exclusions, Import/Export polish, TOON/XML/native modes`

## Attribution

LTracker is inspired by Zaakh/SillyTavern-zTracker and its tracker-oriented design. No zTracker source code is copied in version `0.09`. If future versions copy or adapt zTracker code, preserve the original MIT attribution and license notices.
