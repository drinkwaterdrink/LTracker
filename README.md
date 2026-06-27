# LTracker

Version: `0.12`

LTracker is a Lumiverse Spindle extension that creates tracker snapshots from recent chat messages. It is inspired by Zaakh/SillyTavern-zTracker's tracker concept, but this project is a fresh Lumiverse-native implementation and does not depend on SillyTavern APIs, globals, DOM selectors, templates, prompt builders, World Info APIs, connection profile APIs, or `generate_interceptor`.

## Current Features

- Registers a Lumiverse drawer tab named `LTracker`.
- Registers an input-bar action named `Generate Tracker`.
- Reads recent chat messages with `spindle.chat.getMessages()`.
- Generates tracker JSON with `spindle.generate.quiet()` using the user's active/default generation connection.
- Saves the latest per-chat tracker snapshot in user extension storage.
- Supports manual tracker generation from the drawer or input-bar action.
- Supports Auto Mode after assistant completions, including swipe/regenerate events when Lumiverse reports them.
- Stores message-attached tracker snapshots keyed by exact message id and selected swipe key.
- Maintains a message snapshot index at `chats/{chatId}/message-snapshots/index.json`.
- Renders sanitized tracker HTML previews in the drawer.
- Uses a compact message control pill for visible tracker controls.
- Shows a tiny generate tracker icon for visible assistant messages without a selected-swipe tracker when enabled.
- Moves regenerate/stop, edit/view, and delete controls into the expanded tracker header as icon-only actions.
- Removes large bottom action buttons from inline message trackers by default.
- Preserves sandboxed iframe message widgets as a fallback.
- Supports optional embedded `<ltracker type="state">` tags in assistant message swipes, hidden by a Lumiverse tag interceptor and rendered from the intercepted exact payload.
- Autosaves settings changes from the drawer; Reset Settings remains explicit.
- Keeps prompt injection settings saved, but context-handler injection remains disabled in `0.12`.

## Message Display In 0.12

LTracker now renders a tiny message-attached control pill instead of bulky status text like `LTracker generating swipe index-0`.

The compact control pill has these states:

- No tracker: small generate icon with `Generate tracker`.
- Tracker collapsed: slim `L` tracker header.
- Tracker expanded: full tracker content with header actions at the top-right.
- Generating: spinner plus live elapsed timer.
- Error: compact warning state.
- Cancel available: the regenerate icon becomes a stop/cancel action while the exact job is running.

Tapping the regenerate icon starts tracker generation for that exact message/swipe and updates the visible UI immediately. Tapping the same icon while it is running cancels that exact job. On cancel or error, LTracker preserves the previous tracker snapshot for the message/swipe.

LTracker prefers official Lumiverse message-targeted DOM APIs:

- `ctx.dom.findMessageElement(messageId)` finds a mounted message bubble.
- `ctx.dom.inject(target, html, "afterbegin")` injects the tracker at the top of the resolved message body/bubble when top placement is selected.
- `ctx.dom.uninject(element)` removes or replaces injected tracker DOM.
- `ctx.dom.getMessageId(target)` resolves message identity for injected controls.
- `ctx.messages.registerTagInterceptor()` hides embedded tracker tags before normal message rendering.

The inspected Lumiverse docs/types expose message DOM helpers, message widgets, message tags, `message_footer`, and context menus, but no official per-message toolbar action slot. Because of that, v0.12 uses a safe in-message control pill fallback instead of private host selectors. Iframe message widget fallback uses `ctx.messages.renderWidget()` and may render below messages.

Drawer history is the durable debug/audit surface. It can keep larger regenerate/edit/delete/copy actions because it is not the compact chat surface. Inline trackers keep the compact control pill and expanded header actions.

Saved message text mutation is used only when `messageDisplay.attachmentMode` is `embedded_tracker_tag` or `both`, where LTracker calls `spindle.chat.updateMessage()` to upsert or remove its own exact-swipe `<ltracker>` block. Sidecar mode remains storage-only.

## Swipe-Aware Trackers

Each assistant swipe gets its own tracker. LTracker derives a stable identity from the best official data available:

- official swipe id fields when present
- active `swipe_id` index from Lumiverse `ChatMessageDTO`
- selected swipe content hash as a last fallback

New message snapshot storage includes the swipe key:

```text
chats/{chatId}/messages/{messageId}/swipes/{swipeKey}/tracker-snapshot.json
```

Older non-swipe snapshots still load as `swipeKey: "default"`.

Only the selected swipe's tracker is rendered in chat. Swipe key/index text is hidden by default because it is debug metadata, not normal roleplay UI. Enable `messageDisplay.showDebugSwipeKey` to show it while testing swipe selection.

## Tracker Controls

Compact control pill:

- Shows the message-local tracker state.
- Shows the missing-tracker generate icon when enabled.
- Shows live elapsed time during generation.
- Stays small enough for mobile message bubbles.

Expanded tracker header actions:

- Regenerate starts a tracker job for that exact message/swipe.
- The same control becomes stop/cancel while that exact job runs.
- Edit/View opens a modal with rendered preview, tracker JSON, text fallback, sanitized HTML, and source metadata.
- Delete removes only that message/swipe tracker snapshot from LTracker storage.

Drawer history debug actions:

- Keep larger buttons for regenerate, edit/view, delete, and optional copy buttons.
- Are intended for audits, diagnostics, and state repair.

Edited tracker JSON is saved as a user-edited tracker override with `editedAt` and `editedByUser: true`. It never mutates chat message text.

## Storage

LTracker writes user-scoped extension storage only:

- Latest chat snapshot: `chats/{chatId}/latest-snapshot.json`
- Message/swipe snapshot: `chats/{chatId}/messages/{messageId}/swipes/{swipeKey}/tracker-snapshot.json`
- Legacy message snapshot fallback: `chats/{chatId}/messages/{messageId}/tracker-snapshot.json`
- Message snapshot index: `chats/{chatId}/message-snapshots/index.json`
- Settings: `settings.json`
- Preset index and presets: `presets/index.json` and `presets/{presetId}.json`

## Context Handler Injection

Prompt injection is disabled in `0.12`. The `context_handler` permission remains absent from `spindle.json`, and LTracker does not call `spindle.registerContextHandler()`.

## Template Capability Model

Default: Trusted Preset Mode
- for user-authored presets
- rich sanitized HTML/CSS/SVG
- safe inline styles enabled by default
- CSS drawers/tabs/animations
- future Handlebars helpers

Safe Mode
- for imported/untrusted presets
- stricter sanitizer

Dev Mode
- one advanced mode combining sandboxed/raw ideas
- template JS and advanced experiments
- explicit warning toggle

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
| `auto.triggerAfterAssistantMessages` | `true` | Generates after assistant completions. | Keep enabled for zTracker-like per-response snapshots. | Disable if only manual tracking is desired. | Accurate scrollback costs one tracker job after assistant turns. |
| `auto.triggerAfterUserMessages` | `false` | Generates after user messages through the message-sent event path. | Enable for user-turn state tracking experiments. | Keep disabled to reduce extra jobs. | More reactive state can double tracker traffic. |
| `auto.attachSnapshotToMessage` | `true` | Saves auto snapshots under the triggering message/swipe and updates the index. | Keep enabled for message display and history. | Disable if only the latest chat snapshot matters. | Message-attached storage improves scrollback accuracy but stores more records. |
| `auto.onlyWhenChatActive` | `true` | Ignores stale auto jobs if the user switches chats. | Keep enabled for safer multi-chat use. | Disable only if background chat tracking is intentionally desired later. | Safer active-chat behavior can skip background updates. |

### Prompt Injection

Prompt injection is disabled in `0.12` unless a later version safely re-enables context-handler registration.

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `injection.enabled` | `false` | User preference for cached tracker injection. In `0.12`, it is saved but inactive. | Enable only for future testing after context injection is restored. | Keep disabled for normal `0.12` use. | Stored preference is ready for later, but it does nothing now. |
| `injection.mode` | `latest_chat_snapshot` | Chooses latest chat snapshot or latest message-attached snapshot as injection source. | Use message-attached snapshot when per-response state matters. | Use latest chat snapshot for broad current-state summaries. | Exact message state is precise; chat-wide state is simpler. |
| `injection.format` | `compact` | Chooses `compact`, `minimal`, or `pretty_json` text. | Use `pretty_json` for debugging; use `compact` for readable continuity. | Use `minimal` to save context if injection returns later. | Richer formats are easier to inspect but consume more prompt space. |
| `injection.maxInjectedChars` | `3000` | Character cap for injected text. | Increase if compact state is being truncated. | Decrease to reduce context size. | More injected state can help continuity but competes with chat context. |
| `injection.includeHeader` | `true` | Adds an include header label like `[LTracker Snapshot]`. | Enable to make injected text easy to identify. | Disable to save a few tokens. | A header improves clarity but adds small overhead. |
| `injection.includeTimestamp` | `true` | Adds snapshot timestamp. | Enable when freshness matters. | Disable to shorten output. | Freshness context costs a little text. |
| `injection.includeSourceMessageId` | `false` | Adds source message id for message snapshots. | Enable for debugging attachment timing. | Disable for cleaner prompt text. | Debug precision adds technical clutter. |
| `injection.onlyInjectWhenSnapshotExists` | `true` | Avoids empty placeholder injection when no snapshot exists. | Keep enabled for clean prompts. | Disable only if a future placeholder workflow needs it. | Clean prompts omit missing state, while placeholders can make absence explicit. |

### Renderer

The drawer renderer is separate from message display.

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `renderer.enabled` | `true` | Enables sanitized drawer preview rendering. | Keep enabled when using HTML templates. | Disable to inspect plain text fallback. | Rich preview is easier to read but adds rendering work. |
| `renderer.previewSource` | `latest_chat_snapshot` | Chooses drawer preview source. | Use latest message snapshot to preview the latest attached response. | Use latest chat snapshot for the current chat-wide tracker. | Message source checks attachment behavior; chat source checks current state. |
| `renderer.missingValuePlaceholder` | empty string | Missing value placeholder shown when a template references a missing field. | Set to `unknown` while debugging schemas. | Leave blank for cleaner display. | Placeholders reveal schema gaps but can make previews noisy. |
| `renderer.maxRenderedChars` | `50000` | Character cap for drawer-rendered HTML and fallback text. | Increase for large tracker templates. | Decrease to keep the drawer lighter. | Higher caps show more output but can make the drawer heavier. |
| `renderer.allowInlineStyles` | `false` | Allows a small set of sanitized inline styles in drawer previews. | Enable for trusted templates needing simple formatting. | Keep disabled for stricter rendering. | Sanitized inline styles improve presentation but widen the allowed HTML surface. |

### Message Display

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `messageDisplay.enabled` | `true` | Enables message trackers and drawer history rendering. | Keep enabled for visible per-message trackers. | Disable to remove inline trackers and rely on raw snapshots. | Visible state is useful but adds UI surface. |
| `messageDisplay.useDomInjection` | `true` | Uses official message-targeted DOM injection as the primary renderer. | Keep enabled for top placement and compact collapse. | Disable to force iframe widget fallback/history. | DOM injection is tighter, but only mounted message bubbles can be injected immediately. |
| `messageDisplay.fallbackToIframeWidget` | `true` | Uses iframe message widgets when DOM injection cannot render. | Enable for broader runtime fallback. | Disable if below-message fallback is undesirable. | Fallback improves availability but may render below messages. |
| `messageDisplay.attachmentMode` | `sidecar_snapshot` | Chooses storage-only sidecar snapshots, embedded tracker tag snapshots, or both. | Use `embedded_tracker_tag` or `both` when the tracker should travel inside the assistant swipe content. | Use `sidecar_snapshot` for no chat-message mutation. | Embedded tracker tag mode is portable but requires `chat_mutation`; sidecar is quieter and safer. |
| `messageDisplay.displayMode` | `inline_full` | Chooses full inline trackers, compact button popover trackers, or drawer history only. | Use `inline_button_popover` for less chat clutter. | Use `drawer_history_only` when inline UI is distracting. | Inline full is richest; button popover is denser; drawer-only is least intrusive. |
| `messageDisplay.placement` | `top` | Desired top vs bottom placement. DOM injection uses `afterbegin` for top. | Use `top` for zTracker-like placement. | Use `bottom` if top feels visually noisy. | Top vs bottom changes where the compact control pill attaches in the message. |
| `messageDisplay.source` | `message_attached_snapshot` | Chooses exact message/swipe snapshot or latest chat snapshot for display. | Use message-attached snapshot for scrollback accuracy. | Use latest chat snapshot only when all displays should mirror current state. | Exact history is more faithful; latest state is easier to compare. |
| `messageDisplay.renderMode` | `html_template` | Chooses template HTML, compact text, or pretty JSON. | Use template HTML for rich zTracker-like display. | Use compact text or `pretty_json` for debugging. | Rich HTML is readable but template-dependent. |
| `messageDisplay.allowInlineStyles` | `true` | Allows a sanitized inline style allowlist in message tracker HTML. | Keep enabled for zTracker-like HTML template fidelity. | Disable for stricter rendering. | Fidelity improves, but the sanitizer has a wider allowed HTML surface. |
| `messageDisplay.deduplicateRenderWarnings` | `true` | Collapses repeated sanitizer/render warnings. | Keep enabled for noisy templates. | Disable only when every repeated warning matters during debugging. | Diagnostics stay readable but repeated details are summarized. |
| `messageDisplay.showRenderWarningsInDiagnosticsOnly` | `true` | Keeps capped render warning detail in diagnostics instead of making message UI noisy. | Keep enabled for normal chat use. | Disable when actively debugging a template from the message display. | Cleaner chat UI means warnings are easier to miss unless diagnostics are open. |
| `messageDisplay.showDebugSwipeKey` | `false` | Shows swipe key/index text in message controls. | Enable when testing selected-swipe storage and render routing. | Keep disabled for normal chat use. | Debug clarity adds technical text to message bubbles. |
| `messageDisplay.showGenerateButtonForMissingTracker` | `true` | Shows a tiny generate icon on visible assistant messages without an exact tracker. | Keep enabled for fast backfill. | Disable when missing trackers should stay invisible. | Discovery improves but adds a small control to more messages. |
| `messageDisplay.controlDensity` | `compact` | Chooses compact or comfortable sizing for message control icons. | Use comfortable on touch-heavy devices. | Use compact for dense chats. | Bigger targets are easier to tap but take more space. |
| `messageDisplay.controlPlacement` | `message_header` | Chooses the preferred compact control placement model. | Use message header for zTracker-like attachment. | Use inside tracker header for quieter placement experiments. | Placement can affect visual density. |
| `messageDisplay.showExpandedHeaderActions` | `true` | Shows regenerate/stop, edit/view, and delete in the expanded tracker header. | Keep enabled for quick per-message repairs. | Disable for display-only inline trackers. | Direct actions are faster but add controls. |
| `messageDisplay.showBottomActionsInInlineTracker` | `false` | Restores large bottom inline actions. | Enable only for debugging old layouts. | Keep disabled for v0.12 compact UX. | Bottom actions are discoverable but bulky. |
| `messageDisplay.collapsedByDefault` | `true` | Starts tracker blocks collapsed by default. | Enable for mobile or large trackers. | Disable when trackers should stay open while scrolling. | Collapsed by default saves space but requires one click to inspect. |
| `messageDisplay.compactCollapsedHeader` | `true` | Keeps collapsed DOM trackers as a slim header bar. | Keep enabled to avoid empty vertical space. | Disable only for testing alternate layout. | Compact collapse is denser but shows less context at a glance. |
| `messageDisplay.showTimestamp` | `true` | Shows snapshot timestamp in tracker/history headers. | Keep enabled to judge freshness. | Disable for a quieter header. | Timestamp clarity adds header text. |
| `messageDisplay.showPresetName` | `true` | Shows preset name in tracker/history headers. | Keep enabled when testing multiple presets. | Disable for a shorter header. | Preset clarity adds header text. |
| `messageDisplay.showDebugCopyButtonsInHistory` | `true` | Shows copy buttons for JSON, HTML, and text in drawer history only. | Enable for debugging/exporting tracker state. | Disable for a cleaner history view. | Copy buttons help audits but stay out of compact message trackers. |
| `messageDisplay.showWidgetRegenerateButton` | `true` | Shows the icon-only regenerate/cancel control. | Keep enabled for targeted tracker repairs. | Disable if message trackers should be display-only. | Direct controls are faster but add an action button. |
| `messageDisplay.showEditButton` | `true` | Shows the edit/view control that opens the tracker modal. | Enable when user-edited tracker overrides are useful. | Disable for read-only tracker displays. | Editing fixes bad JSON but can diverge from generated state. |
| `messageDisplay.showDeleteButton` | `true` | Shows the delete control for a single message/swipe tracker. | Enable for cleanup of wrong snapshots. | Disable to avoid destructive controls in chat. | Delete is precise but requires regeneration to recover. |
| `messageDisplay.showNoTrackerForSwipe` | `false` | Reserved setting for showing an empty-state marker when selected swipe has no tracker. | Enable later if missing-swipe state should be explicit. | Keep disabled for quiet chat display. | Empty states aid discovery but add visual noise. |
| `messageDisplay.showGenerationDuration` | `true` | Shows completed generation duration and live elapsed time when feasible. | Keep enabled while tuning providers or schemas. | Disable for the quietest header. | Timing helps diagnose slow trackers but adds metadata. |
| `messageDisplay.minimizedMaxHeightPx` | `0` | Fallback iframe minimized height when collapsed. DOM injection does not need it. | Increase only if an iframe runtime clips the collapsed header. | Keep at `0` to avoid blank collapsed space. | Higher values can reintroduce empty iframe space. |
| `messageDisplay.maxRenderedChars` | `50000` | Character cap for message display HTML/text/JSON. | Increase for large templates. | Decrease to keep trackers lighter. | Higher caps preserve detail but can make widgets heavy. |

## Diagnostics

v0.12 adds message-control diagnostics for the last compact-control render, exact message/swipe key, control state, generate-button click, inline action, native toolbar support, and native toolbar fallback reason.

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
| `chat_mutation` | Reads chat messages through `spindle.chat.getMessages()` and calls `spindle.chat.updateMessage()` only for embedded tracker tag writes/removals. | Generate requests show a clear missing-permission error; embedded tracker tag mode cannot update message swipes. |

Drawer tabs, input-bar actions, message-targeted DOM injection, message widgets, frontend/backend messaging, logging, toasts, and user storage are free-tier or frontend surfaces in the inspected `lumiverse-spindle-types@0.5.21` API.

## Known Limitations

- Context-handler prompt injection is disabled in `0.12` to protect normal Lumiverse generation.
- Connection settings are still not implemented.
- Sequential generation, partial regeneration, cleanup/repair mode, World Books, Memory Cortex, character-card context, and TOON/XML/native transform modes are future phases.
- DOM injection only attaches immediately to mounted message bubbles; iframe fallback and drawer history cover unavailable bubbles.
- There is no official per-message toolbar slot in the inspected docs/types, so v0.12 uses the safe in-message control pill fallback.
- Embedded tracker tag mode only replaces or removes LTracker's own tag for the exact swipe key.
- Diagnostics may contain sensitive chat-derived prompt and model output when raw/prompt saving is enabled.

## Roadmap

1. `0.13 Connection Settings`
2. `0.14 Power Template Engine`
3. `0.15 Dev Mode Templates`
4. `0.16 Sequential + Partial Regeneration`
5. `0.17 Cleanup / Repair / Pending Fields`
6. `0.18 World Books, Character Exclusions, Import/Export Polish`

## Attribution

LTracker is inspired by Zaakh/SillyTavern-zTracker and its tracker-oriented design. No zTracker source code is copied in version `0.12`. If future versions copy or adapt zTracker code, preserve the original MIT attribution and license notices.
