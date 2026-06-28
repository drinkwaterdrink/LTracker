# LTracker

Version: `0.16`

Current release: `0.16 Production Readiness + Performance & Hardening Overhaul`

LTracker is a Lumiverse Spindle extension that creates tracker snapshots from recent chat messages. It is inspired by Zaakh/SillyTavern-zTracker's tracker concept, but this project is a fresh Lumiverse-native implementation and does not depend on SillyTavern APIs, globals, DOM selectors, templates, prompt builders, World Info APIs, connection profile APIs, or `generate_interceptor`.

## Current Features

- Registers a Lumiverse drawer tab named `LTracker`.
- Registers an input-bar action named `Generate Tracker`.
- Reads recent chat messages with `spindle.chat.getMessages()`.
- Generates tracker JSON with the active/default connection or a selected tracker connection in quiet/raw mode.
- Lists Lumiverse connection profiles without exposing or storing API keys.
- Adds tracker-specific generation parameters, reasoning overrides, safe fallback diagnostics, and a non-mutating connection test action.
- Saves the latest per-chat tracker snapshot in user extension storage.
- Supports manual tracker generation from the drawer or input-bar action.
- Supports Auto Mode after assistant completions, including swipe/regenerate events when Lumiverse reports them.
- Waits for assistant/swipe finalization, settle delay, and stable-content checks before auto tracker extraction.
- Includes recent prior tracker snapshots as tracker-generation memory, using the most recent prior state as the baseline.
- Stores message-attached tracker snapshots keyed by exact message id and selected swipe key.
- Maintains a message snapshot index at `chats/{chatId}/message-snapshots/index.json`.
- Renders sanitized tracker HTML previews in the drawer.
- Uses a compact message control pill for visible tracker controls.
- Shows a tiny generate tracker icon for visible assistant messages without a selected-swipe tracker when enabled.
- Moves regenerate/stop, edit/view, and delete controls into the expanded tracker header as icon-only actions.
- Removes large bottom action buttons from inline message trackers by default.
- Uses DOM injection as the primary/default message display engine, with iframe widgets as an advanced legacy fallback.
- Defaults to Trusted Preset Mode so user-authored sanitized HTML/CSS templates render richly without a main inline-style checkbox.
- Adds token-aware budgets and Ultra Tracker Mode for large zTracker-style schemas, prompts, tracker memory, and outputs.
- Supports optional embedded `<ltracker type="state">` tags in assistant message swipes, hidden by a Lumiverse tag interceptor and rendered from the intercepted exact payload.
- Autosaves settings changes from the drawer; Reset Settings remains explicit.
- Supports optional safe normal prompt injection through `spindle.registerInterceptor()`, disabled by default.

## Message Display

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

The inspected Lumiverse docs/types expose message DOM helpers, message widgets, message tags, `message_footer`, and context menus, but no official per-message toolbar action slot. Because of that, LTracker uses a safe in-message control pill fallback instead of private host selectors. Iframe message widget fallback uses `ctx.messages.renderWidget()` and may render below messages.

Drawer history is the durable debug/audit surface. It groups by message id plus swipe key and shows the latest snapshot by default, with duplicate index cleanup that does not delete stored snapshots. Inline trackers keep the compact control pill and expanded header actions.

Saved message text mutation is used only when `messageDisplay.attachmentMode` is `embedded_tracker_tag` or `both`, where LTracker calls `spindle.chat.updateMessage()` to upsert or remove its own exact-swipe `<ltracker>` block. Sidecar mode remains storage-only.

Expanded tracker width modes let collapsed controls stay tiny while opened trackers can use contained, wide, full-mobile, or future popover-style sizing. Full-mobile uses near-viewport width with a small configurable horizontal margin.

## Auto Timing and Finalization

Auto mode now treats assistant generation and swipe/regenerate updates as a two-step process. LTracker first marks the target as `waiting_for_message_finalization`, waits for the strongest available Lumiverse final event, rereads the selected assistant swipe, waits the configured settle delay, rereads it again, and compares content hashes when stable checks are enabled. If the selected swipe changes before finalization, the old pending job is cancelled and cannot overwrite the new swipe's tracker.

`Wait after message finishes` is the user-facing debounce. It happens after finalization and stable-content checks so rapid save/swipe/generation events collapse into one tracker job without summarizing partial assistant output.

## Power Defaults

LTracker defaults to Trusted Preset Mode because it is designed for user-authored tracker presets. Sanitization still runs as a guardrail, but sanitized inline styles are enabled by default for richer zTracker-like layouts. Safe Mode is available for imported/shared presets. Dev Mode is a future placeholder and does not enable template JavaScript in `0.16`.

Older `renderer.allowInlineStyles` and `messageDisplay.allowInlineStyles` settings migrate into `renderer.templateTrustMode`. Trusted mode enables both internal inline-style flags; Safe mode disables them.

DOM injection is the default display engine. Iframe fallback is off by default and lives in Advanced as `Iframe fallback / legacy backup` for troubleshooting runtimes where DOM injection cannot attach.

## Budgets and Ultra Tracker Mode

Budget mode defaults to estimated tokens using the rough estimate `1 token ~= 4 characters`. Token budgets drive recent transcript size, per-message context, tracker memory, prompt injection, tracker output tokens, and prompt preview size. Character limits remain for rendered HTML, raw output previews, diagnostics previews, import textareas, and storage safety caps.

Normal defaults target large but practical tracker use: 16k recent tokens, 12k per-message tokens, 12k tracker memory tokens, 12k injection tokens, 8k tracker output tokens, and 250k rendered/raw character caps. Ultra Tracker Mode raises those soft budgets for very large 30k-40k token zTracker-style presets and uses warnings instead of tiny hard blocks.

## Drawer Layout

The drawer is organized as Dashboard, Generation, Auto, Connection, Display, Renderer, Memory / Injection, Presets, History, Diagnostics, and Advanced. The header has one central autosave status. The Dashboard shows current status, preset, connection, latest snapshot/memory, and quick actions.

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

## Tracker Memory

Tracker generation now uses prior tracker snapshots as baseline memory. By default, LTracker includes the last 3 prior tracker states, ordered oldest to newest, before the recent conversation transcript.

The tracker prompt tells the model to mutate from the most recent prior tracker state while preserving stable unchanged fields. The current transcript still wins over prior memory when they conflict.

The sunset policy is simple in `0.16`: `retainCount` controls how many prior snapshots are considered, `fullSnapshotCount` controls how many most-recent snapshots are included in full, and older snapshots are omitted unless compact older snapshots is enabled.

Recommended start: Tracker Memory on, include last 3, full snapshot count 3, normal Prompt Injection off until tested.

## Safe Prompt Injection

Normal prompt injection is separate from Tracker Memory:

- Tracker Memory affects tracker generation.
- Prompt Injection affects normal roleplay generation.

Prompt Injection uses the Lumiverse interceptor path, not `context_handler`. The `context_handler` permission remains absent from `spindle.json`, and LTracker does not call `spindle.registerContextHandler()`.

## Stabilization and Safety Hardening

LTracker `0.16` focuses on stabilization, efficiency, and safety updates:

- **Bounded Memory Loading**: Implements bounded candidate selection using a formula tied to memory settings to prevent unbounded reads for long chats.
- **Job Timeout Eviction**: Automatically evicts stale generation jobs after 2 minutes or the custom `generationTimeoutMs` to avoid locking the queue.
- **Global DOM Tracker Stylesheet**: Injects CSS styles once globally at startup on the main page head to eliminate duplicate style blocks per message bubble.
- **Delete Confirmation**: Prompts users before deleting any message or drawer snapshot, with a 30-second temporary undo buffer in the drawer.
- **Storage Maintenance Tools**: Adds manual scans to discover and clean up orphaned snapshot files or duplicate index entries.
- **Import Size Guards**: Validates preset JSON file sizes, rejecting imports larger than 250,000 characters before parsing.
- **Grouped Diagnostics**: Groups technical logs, diagnostics, and version information into collapsible accordions to keep the workspace clean.

The interceptor treats host messages as readonly, clones message objects before editing, strips older `<ltracker>` blocks when configured, and returns the original prompt unchanged on errors or timeout. It never runs LLM generation inside the interceptor.

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
| `maxMessageChars` | `48000` | Maximum characters kept from each message before prompting the tracker model. | Increase for long-form messages where late details matter. | Decrease if prompts are too large or slow. | Higher caps preserve detail but can crowd the tracker prompt. |
| `generationTimeoutMs` | `45000` | How long LTracker waits for quiet tracker generation. | Increase for slow providers or large schemas. | Decrease if failed tracker jobs should return faster. | Longer timeouts reduce false failures but make stuck jobs linger. |
| `saveRawOutput` | `true` | Saves the model's raw tracker response for diagnostics. | Enable while debugging parse failures. | Disable to store less model output. | Helpful debugging data may include sensitive chat-derived text. |
| `savePromptPreview` | `true` | Saves the tracker prompt preview for diagnostics. | Enable when tuning schema/prompt behavior. | Disable to store less chat-derived prompt text. | Easier prompt debugging costs more stored diagnostic data. |

### Auto Mode

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `auto.autoModeEnabled` | `false` | Turns automatic tracker generation on or off. | Enable after the manual button works for the chat. | Disable when testing or avoiding extra generations. | Convenience costs extra model calls. |
| `auto.autoDebounceMs` | `1500` | Wait after message finishes before generating. Debounce means rapid events collapse into one job after finalization. | Increase if events arrive in bursts or messages save slowly. | Decrease if tracker updates feel late. | More delay avoids duplicate work but feels less immediate. |
| `autoTiming.waitForAssistantFinalization` | `true` | Waits for assistant/swipe finalization before auto tracker extraction. | Keep enabled for swipe/regenerate accuracy. | Disable only for debugging event timing. | Prevents partial trackers but can add a short delay. |
| `autoTiming.postCompletionSettleMs` | `750` | Short settle delay after finalization before the stable-content reread. | Increase for slow providers or sync-heavy chats. | Decrease if final message writes are instant. | More delay improves safety but slows auto updates. |
| `autoTiming.stableContentCheckMs` | `400` | Delay between final swipe content reads before comparing hashes. | Increase if provider writes continue after final events. | Decrease only when writes are known synchronous. | More stability checking slows auto updates slightly. |
| `autoTiming.requireStableSwipeContent` | `true` | Requires two reads of the selected swipe to match before auto generation. | Keep enabled for regenerate/swipe safety. | Disable only when host events are already known stable. | Avoids partial content but can skip unstable messages. |
| `autoTiming.cancelPendingOnSwipeChange` | `true` | Cancels a pending finalized tracker job when the selected swipe changes. | Keep enabled for swipe/regenerate accuracy. | Disable only for diagnostics. | Prevents swipe A from receiving swipe B's tracker. |
| `budget.mode` | `estimated_tokens` | Shows prompt/model budgets as approximate token counts. | Use for model-context planning. | Use `characters` only when tuning storage/display caps. | Estimates use `1 token ~= 4 characters`. |
| `budget.ultraModeEnabled` | `false` | Lifts normal defaults for very large tracker presets. | Enable for 30k-40k token zTracker-style schemas. | Keep off for mobile/light providers. | Huge budgets can be slow or exceed model context. |
| `budget.recentMessageBudgetTokens` | `16000` | Total approximate recent transcript budget. | Raise for long scenes. | Lower for smaller contexts. | More transcript can improve state but costs context. |
| `budget.perMessageBudgetTokens` | `12000` | Approximate per-message slice before tracker prompting. | Raise for very long single turns. | Lower to prevent one message dominating context. | Higher values preserve late details but can crowd the prompt. |
| `budget.trackerMemoryBudgetTokens` | `12000` | Approximate tracker memory block budget. | Raise for large schemas and continuity. | Lower for smaller tracker calls. | More memory preserves state but competes with current transcript. |
| `budget.promptInjectionBudgetTokens` | `12000` | Approximate prompt-injection tracker block budget. | Raise for rich injected state. | Lower for normal RP context. | More injected state can improve continuity but changes RP prompts. |
| `budget.maxTrackerOutputTokens` | `8000` | Tracker model output budget passed as `max_tokens`. | Raise for large schemas. | Lower for cheaper/faster tracker extraction. | Higher output caps cost more and may fail on smaller models. |
| `budget.promptPreviewBudgetTokens` | `16000` | Approximate stored prompt-preview cap. | Raise when debugging huge prompts. | Lower to store less prompt text. | Larger previews can include sensitive chat text. |
| `budget.renderedHtmlMaxChars` | `250000` | Character cap for rendered HTML and fallback output. | Raise for large templates. | Lower for mobile performance. | Huge DOM output can lag older devices. |
| `budget.rawOutputMaxChars` | `250000` | Character cap for saved raw model output. | Raise during parse debugging. | Lower to reduce stored model text. | Larger raw outputs help debugging but may include sensitive text. |
| `budget.presetImportMaxChars` | `1000000` | Character cap for pasted preset imports. | Raise for very large local presets. | Lower for safer import testing. | Larger imports are slower to validate. |
| `auto.skipFirstMessages` | `2` | Avoids auto generation until the chat has enough messages. | Increase for setup-heavy chats. | Decrease if early tracker state is useful. | Waiting gives the model more context but delays first state. |
| `auto.triggerAfterAssistantMessages` | `true` | Generates after assistant completions. | Keep enabled for zTracker-like per-response snapshots. | Disable if only manual tracking is desired. | Accurate scrollback costs one tracker job after assistant turns. |
| `auto.triggerAfterUserMessages` | `false` | Generates after user messages through the message-sent event path. | Enable for user-turn state tracking experiments. | Keep disabled to reduce extra jobs. | More reactive state can double tracker traffic. |
| `auto.attachSnapshotToMessage` | `true` | Saves auto snapshots under the triggering message/swipe and updates the index. | Keep enabled for message display and history. | Disable if only the latest chat snapshot matters. | Message-attached storage improves scrollback accuracy but stores more records. |
| `auto.onlyWhenChatActive` | `true` | Ignores stale auto jobs if the user switches chats. | Keep enabled for safer multi-chat use. | Disable only if background chat tracking is intentionally desired later. | Safer active-chat behavior can skip background updates. |

### Tracker Connection Settings

LTracker can use a dedicated tracker connection/profile instead of always using the active roleplay connection. API keys are never exposed to the extension, never displayed, and never stored; LTracker stores only the selected connection id and display name.

Connection modes:

- `active_quiet`: uses `spindle.generate.quiet()` with the user's active/default Lumiverse connection. This is the simple default.
- `selected_connection_quiet`: uses quiet generation with `connection_id` when supported by the installed Lumiverse API.
- `selected_connection_raw`: uses `spindle.generate.raw()` with `connection_id`, tracker parameters, and reasoning overrides.

Recommended starting settings: `temperature` `0.2`, `max_tokens` `2000`, `top_p` blank/null, penalties blank/null, and reasoning `inherit`. Use reasoning `off` for cheap/fast tracker extraction, or low/medium custom effort when a complex schema misses details.

The drawer's `Test Tracker Connection` button sends only the configured test prompt, records duration, output preview, finish reason, usage, mode, connection id/name, and fallback reason, and does not mutate chat messages, tracker snapshots, embedded tags, or message displays.

If a selected connection is missing, stale, or not selected, LTracker falls back to `active_quiet` and records the fallback in diagnostics. `selected_connection_quiet` falls back to raw mode only if the installed Lumiverse API does not support `connection_id` on quiet requests.

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `connection.mode` | `active_quiet` | Chooses active quiet, selected quiet, or selected raw tracker generation. | Use selected raw for a cheap/fast tracker profile. | Use active quiet for simplest setup. | Dedicated profiles are tunable but need a valid connection profile. |
| `connection.selectedConnectionId` | `null` | Stores the selected tracker connection id. | Select a profile after refreshing connections. | Clear it to force active quiet fallback. | Stale ids are preserved for visibility but fall back safely. |
| `connection.refreshConnectionsOnDrawerOpen` | `true` | Refreshes connection profile summaries when the drawer opens. | Keep enabled while switching provider profiles. | Disable if refresh is noisy or slow. | Fresher lists cost one lightweight profile-list call. |
| `connection.parameters.temperature` | `0.2` | Tracker model randomness. | Increase for flexible extraction. | Lower for stricter JSON and stable summaries. | Lower is more reliable; higher can infer more. |
| `connection.parameters.max_tokens` | `2000` | Maximum tracker response length. | Increase for large schemas. | Decrease for cheaper, faster trackers. | Too low can truncate JSON. |
| `connection.parameters.top_p` | `null` | Optional nucleus sampling override. | Set only when tuning a provider. | Leave blank to omit. | Omitted values inherit provider/preset behavior. |
| `connection.parameters.frequency_penalty` | `null` | Optional repetition penalty override. | Set only for provider-specific tuning. | Leave blank to omit. | Penalties can distort structured JSON if overused. |
| `connection.parameters.presence_penalty` | `null` | Optional novelty penalty override. | Set only for provider-specific tuning. | Leave blank to omit. | Penalties can reduce faithful extraction. |
| `connection.reasoning.source` | `inherit` | Chooses inherited reasoning, off, or custom override. | Use custom for complex schemas. | Use off for cheap/fast extraction. | Reasoning may improve detail but cost more. |
| `connection.reasoning.apiReasoning` | `true` | Enables API reasoning in custom mode. | Enable when provider supports reasoning fields. | Disable for simple extraction. | Provider support varies. |
| `connection.reasoning.effort` | `auto` | Custom reasoning effort. | Use low/medium for harder schemas. | Use none/minimal for speed. | Higher effort can cost more and take longer. |
| `connection.reasoning.thinkingDisplay` | `auto` | Custom thinking display preference. | Use summarized for inspectable reasoning where supported. | Use omitted for cleaner responses. | Display support is provider-dependent. |
| `connection.testPrompt` | compact JSON test prompt | Prompt used by `Test Tracker Connection`. | Customize while debugging provider behavior. | Keep default for quick smoke tests. | Long prompts make the test less tiny. |

### Tracker Memory

Tracker Memory feeds prior tracker snapshots into the tracker-generation prompt. It does not affect normal roleplay generations by itself.

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `memory.enabled` | `true` | Turns tracker memory collection on or off. | Keep enabled for stable tracker continuity. | Disable when testing fresh extraction with no prior state. | Memory improves continuity but adds prompt context. |
| `memory.includeInTrackerGeneration` | `true` | Adds the rendered memory block to tracker-generation prompts. | Keep enabled for baseline mutation behavior. | Disable to collect previews without prompting with memory. | Useful control while debugging prompts. |
| `memory.retainCount` | `3` | Total prior tracker snapshots considered. | Increase for slow-moving scenes. | Set to `0` to include no memory. | More retained state can help continuity but costs context. |
| `memory.fullSnapshotCount` | `3` | Number of most recent retained snapshots included in full. | Increase for complex schemas. | Decrease to sunset older snapshots faster. | Full snapshots are precise but larger. |
| `memory.compactOlderSnapshots` | `false` | Includes compact one-line older entries beyond the full snapshot count. | Enable after testing if longer memory helps. | Keep disabled for clean last-3 behavior. | Compact older memory is smaller but less complete. |
| `memory.maxMemoryChars` | `48000` | Character cap for the rendered memory block. | Increase for large schemas. | Decrease if tracker prompts get too large. | Higher caps preserve detail but compete with transcript context. |
| `memory.source` | `hybrid` | Chooses sidecar index, embedded tags, message-history scan, or hybrid. | Use hybrid for best recovery. | Use sidecar only for storage-first behavior. | Hybrid is resilient but does more lookup work. |
| `memory.excludeTargetMessage` | `true` | Prevents the tracker currently being generated from becoming its own prior memory. | Keep enabled for per-message regeneration. | Disable only for debugging collection behavior. | Safer lineage may omit same-message alternate data. |
| `memory.order` | `oldest_to_newest` | Orders retained memory. | Keep oldest-to-newest for progression. | Use newest-to-oldest only for experiments. | Oldest-to-newest mirrors the prompt baseline flow. |
| `memory.requireSamePreset` | `false` | Uses only memory generated by the current preset. | Enable when switching incompatible schemas. | Disable for broader continuity. | Same-preset memory is cleaner but may omit useful history. |
| `memory.requireSameSwipeWhenAvailable` | `false` | Prefers same-swipe lineage when entries exist. | Enable while debugging exact swipe state. | Keep disabled for normal cross-turn continuity. | Same-swipe filtering can be too narrow. |

### Prompt Injection

Prompt Injection is optional and disabled by default. It uses `spindle.registerInterceptor()` and never the old context-handler path.

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `injection.enabled` | `false` | Enables normal roleplay prompt injection through the interceptor. | Enable only after testing memory previews. | Keep disabled if tracker generation memory is enough. | Injection can improve roleplay continuity but changes normal prompt context. |
| `injection.retainCount` | `3` | Number of recent tracker blocks to inject or retain. | Increase for broader roleplay continuity. | Set to `0` to strip only, if stripping is enabled. | More injected state costs context. |
| `injection.format` | `embedded_tag` | Chooses `embedded_tag`, `compact_text`, `pretty_json`, or `minimal`. | Use embedded tags for structural continuity; use pretty JSON for debugging. | Use minimal to save prompt space. | Richer formats are clearer but larger. |
| `injection.injectionPlacement` | `append_to_last_assistant` | Chooses append-to-assistant or system-message fallback placement. | Keep append-to-assistant for SimTracker-like behavior. | Use system placement if assistant appends confuse a provider. | Placement can affect prompt interpretation. |
| `injection.includeOnlyIfMissingFromPrompt` | `true` | Skips backfill when enough tracker blocks are already present. | Keep enabled to avoid duplicates. | Disable only for testing forced injection. | Duplicate avoidance makes prompts cleaner. |
| `injection.stripOlderTrackerBlocks` | `true` | Removes older `<ltracker>` blocks beyond retain count. | Keep enabled for context control. | Disable if you need to inspect all existing blocks. | Stripping prevents old state from crowding prompts. |
| `injection.maxInjectedChars` | `48000` | Character cap for injected tracker text. | Increase for large schemas. | Decrease for smaller prompts. | Higher caps preserve detail but compete with chat context. |
| `injection.roleFallback` | `system` | Role used when LTracker cannot append to an assistant message. | Keep system for explicit state blocks. | Use assistant only for provider experiments. | Role fallback changes prompt semantics. |
| `injection.includeHeader` | `true` | Adds a header before injected tracker blocks. | Keep enabled for Prompt Breakdown clarity. | Disable to save a few tokens. | Headers are readable but slightly larger. |
| `injection.header` | `LTracker Recent State` | Header label for injected blocks and preview. | Customize for debugging. | Keep default for consistent diagnostics. | Custom labels are cosmetic. |

### Renderer

The drawer renderer is separate from message display.

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `renderer.enabled` | `true` | Enables sanitized drawer preview rendering. | Keep enabled when using HTML templates. | Disable to inspect plain text fallback. | Rich preview is easier to read but adds rendering work. |
| `renderer.previewSource` | `latest_chat_snapshot` | Chooses drawer preview source. | Use latest message snapshot to preview the latest attached response. | Use latest chat snapshot for the current chat-wide tracker. | Message source checks attachment behavior; chat source checks current state. |
| `renderer.missingValuePlaceholder` | empty string | Missing value placeholder shown when a template references a missing field. | Set to `unknown` while debugging schemas. | Leave blank for cleaner display. | Placeholders reveal schema gaps but can make previews noisy. |
| `renderer.maxRenderedChars` | `250000` | Character cap for drawer-rendered HTML and fallback text. | Increase for large tracker templates. | Decrease to keep the drawer lighter. | Higher caps show more output but can make the drawer heavier. |
| `renderer.templateTrustMode` | `trusted` | Controls Safe, Trusted, or future Dev template behavior for drawer previews. | Keep Trusted for user-authored presets. | Use Safe for imported/shared presets. | Trusted enables sanitized inline styles while keeping sanitizer guardrails. |

### Message Display

| Setting | Default | What it does | When to increase or enable | When to decrease or disable | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| `messageDisplay.enabled` | `true` | Enables message trackers and drawer history rendering. | Keep enabled for visible per-message trackers. | Disable to remove inline trackers and rely on raw snapshots. | Visible state is useful but adds UI surface. |
| `messageDisplay.useDomInjection` | `true` | Uses official message-targeted DOM injection as the primary renderer. | Keep enabled for top placement and compact collapse. | Disable to force iframe widget fallback/history. | DOM injection is tighter, but only mounted message bubbles can be injected immediately. |
| `messageDisplay.fallbackToIframeWidget` | `false` | Advanced legacy backup using iframe message widgets when DOM injection cannot render. | Enable only for troubleshooting. | Keep disabled for the default compact DOM layout. | Fallback improves availability but may render below messages. |
| `messageDisplay.attachmentMode` | `sidecar_snapshot` | Chooses storage-only sidecar snapshots, embedded tracker tag snapshots, or both. | Use `embedded_tracker_tag` or `both` when the tracker should travel inside the assistant swipe content. | Use `sidecar_snapshot` for no chat-message mutation. | Embedded tracker tag mode is portable but requires `chat_mutation`; sidecar is quieter and safer. |
| `messageDisplay.displayMode` | `inline_full` | Chooses full inline trackers, compact button popover trackers, or drawer history only. | Use `inline_button_popover` for less chat clutter. | Use `drawer_history_only` when inline UI is distracting. | Inline full is richest; button popover is denser; drawer-only is least intrusive. |
| `messageDisplay.placement` | `top` | Desired top vs bottom placement. DOM injection uses `afterbegin` for top. | Use `top` for zTracker-like placement. | Use `bottom` if top feels visually noisy. | Top vs bottom changes where the compact control pill attaches in the message. |
| `messageDisplay.source` | `message_attached_snapshot` | Chooses exact message/swipe snapshot or latest chat snapshot for display. | Use message-attached snapshot for scrollback accuracy. | Use latest chat snapshot only when all displays should mirror current state. | Exact history is more faithful; latest state is easier to compare. |
| `messageDisplay.renderMode` | `html_template` | Chooses template HTML, compact text, or pretty JSON. | Use template HTML for rich zTracker-like display. | Use compact text or `pretty_json` for debugging. | Rich HTML is readable but template-dependent. |
| `renderer.templateTrustMode` | `trusted` | Selects Safe, Trusted, or future Dev template behavior. | Keep Trusted for user-authored presets. | Use Safe for imported/shared presets. | Trusted enables sanitized inline styles; Dev is a placeholder in `0.16`. |
| `messageDisplay.deduplicateRenderWarnings` | `true` | Collapses repeated sanitizer/render warnings. | Keep enabled for noisy templates. | Disable only when every repeated warning matters during debugging. | Diagnostics stay readable but repeated details are summarized. |
| `messageDisplay.showRenderWarningsInDiagnosticsOnly` | `true` | Keeps capped render warning detail in diagnostics instead of making message UI noisy. | Keep enabled for normal chat use. | Disable when actively debugging a template from the message display. | Cleaner chat UI means warnings are easier to miss unless diagnostics are open. |
| `messageDisplay.showDebugSwipeKey` | `false` | Shows swipe key/index text in message controls. | Enable when testing selected-swipe storage and render routing. | Keep disabled for normal chat use. | Debug clarity adds technical text to message bubbles. |
| `messageDisplay.showGenerateButtonForMissingTracker` | `true` | Shows a tiny generate icon on visible assistant messages without an exact tracker. | Keep enabled for fast backfill. | Disable when missing trackers should stay invisible. | Discovery improves but adds a small control to more messages. |
| `messageDisplay.controlDensity` | `compact` | Chooses compact or comfortable sizing for message control icons. | Use comfortable on touch-heavy devices. | Use compact for dense chats. | Bigger targets are easier to tap but take more space. |
| `messageDisplay.controlPlacement` | `message_header` | Chooses the preferred compact control placement model. | Use message header for zTracker-like attachment. | Use inside tracker header for quieter placement experiments. | Placement can affect visual density. |
| `messageDisplay.showExpandedHeaderActions` | `true` | Shows regenerate/stop, edit/view, and delete in the expanded tracker header. | Keep enabled for quick per-message repairs. | Disable for display-only inline trackers. | Direct actions are faster but add controls. |
| `messageDisplay.showBottomActionsInInlineTracker` | `false` | Restores large bottom inline actions. | Enable only for debugging old layouts. | Keep disabled for compact UX. | Bottom actions are discoverable but bulky. |
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
| `messageDisplay.maxRenderedChars` | `250000` | Character cap for message display HTML/text/JSON. | Increase for large templates. | Decrease to keep trackers lighter. | Higher caps preserve detail but can make widgets heavy. |
| `expandedWidth.expandedWidthMode` | `wide` | Controls expanded tracker width. | Use `full_mobile` for phone-first inspection. | Use `contained` when trackers should stay inside message width. | Wider trackers are easier to read but take more horizontal space. |

## Diagnostics

v0.16 keeps connection diagnostics for profile refresh, selected connection availability, generation mode used, fallback reason, tracker parameters, reasoning override, and connection test status. It also adds tracker memory, auto finalization, history grouping, budget, trust-mode, and expanded-width diagnostics.

Interceptor diagnostics track registration state, last interceptor time, injected count/chars, stripped count, skipped reason, error, and tracker block counts before/after prompt injection. Message-control diagnostics still track the last compact-control render, exact message/swipe key, control state, generate-button click, inline action, native toolbar support, and native toolbar fallback reason.

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
| `interceptor` | Registers safe normal prompt injection with `spindle.registerInterceptor()`. | Tracker Memory still works; normal prompt injection remains unavailable. |

Drawer tabs, input-bar actions, message-targeted DOM injection, message widgets, frontend/backend messaging, logging, toasts, and user storage are free-tier or frontend surfaces in the inspected `lumiverse-spindle-types@0.5.21` API.

## Known Limitations

- Context-handler prompt injection remains disabled in `0.16`; safe prompt injection uses the interceptor path instead.
- Sequential generation, partial regeneration, cleanup/repair mode, World Books, Memory Cortex, character-card context, and TOON/XML/native transform modes are future phases.
- DOM injection only attaches immediately to mounted message bubbles; iframe fallback and drawer history cover unavailable bubbles.
- There is no official per-message toolbar slot in the inspected docs/types, so LTracker uses the safe in-message control pill fallback.
- Embedded tracker tag mode only replaces or removes LTracker's own tag for the exact swipe key.
- Diagnostics may contain sensitive chat-derived prompt and model output when raw/prompt saving is enabled.

## Roadmap

1. `0.17 Power Template Engine`
2. `0.18 Dev Mode Templates`
3. `0.19 Sequential + Partial Regeneration`
4. `0.20 Cleanup / Repair / Pending Fields`
5. `0.21 World Books, Character Exclusions, Import/Export Polish`
6. `0.22 YAML / Macro Support / Advanced Compatibility`

## Attribution

LTracker is inspired by Zaakh/SillyTavern-zTracker and its tracker-oriented design. No zTracker source code is copied in version `0.16`. If future versions copy or adapt zTracker code, preserve the original MIT attribution and license notices.
