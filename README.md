# LTracker

Version: `0.19.1`

Current release: `0.19.1 Display Surface Repair / Chat-Width Inline Fix`

LTracker is a Lumiverse Spindle extension that creates tracker snapshots from recent chat messages. It is inspired by Zaakh/SillyTavern-zTracker's tracker concept, but this project is a fresh Lumiverse-native implementation and does not depend on SillyTavern APIs, globals, DOM selectors, templates, prompt builders, World Info APIs, connection profile APIs, or `generate_interceptor`.

## Current Features

- Drawer tab, input-bar `Generate Tracker` action, per-message tracker controls, and drawer history.
- Manual, auto, and exact message/swipe tracker generation.
- Swipe-aware sidecar snapshots and optional embedded `<ltracker type="state">` tags.
- Tracker Memory for prior snapshot baseline context.
- Optional normal prompt injection through `spindle.registerInterceptor()`, disabled by default.
- Selected tracker profile workflow with tracker-specific advanced parameters.
- Display surfaces for inline contained, inline wide, anchored popover, fullscreen reader, and drawer-only use.
- Trusted renderer support for scoped CSS, safe inline styles, safe inline SVG, details/summary drawers, conditionals, loops, and helpers.
- Safe Mode for shared or unknown presets, with full style-block removal so raw CSS is not shown as text.
- Preset pack import/export, import review, validation reports, sample snapshot rendering, and Ultra Tracker Mode budgets.

## Tracker Connection Settings

Recommended setup:

1. Open LTracker.
2. Go to Connection.
3. Select a tracker profile.
4. LTracker uses that selected profile with tracker-specific advanced parameters.
5. If no tracker profile is selected, it falls back to the active roleplay connection.

API keys are never exposed to LTracker, never stored by LTracker, and should never be pasted into LTracker. The extension stores only the selected connection id and display name.

The normal default is a selected tracker profile using raw tracker parameters:

| Setting | Default | Notes |
| --- | --- | --- |
| `connection.mode` | `selected_connection_raw` | Uses the selected tracker profile with tracker parameters; falls back safely when unavailable. |
| `connection.selectedConnectionId` | `null` | Set by choosing a tracker profile in the drawer. |
| `connection.refreshConnectionsOnDrawerOpen` | `true` | Refreshes profile list when opening the drawer. |
| `connection.parameters.temperature` | `0.2` | Low variance for JSON extraction. |
| `connection.parameters.max_tokens` | `8000` | Tracker output cap; null values are omitted. |
| `connection.parameters.top_p` | `null` | Omitted unless set. |
| `connection.parameters.frequency_penalty` | `null` | Omitted unless set. |
| `connection.parameters.presence_penalty` | `null` | Omitted unless set. |
| `connection.reasoning.source` | `inherit` | Use `off` for cheaper/faster extraction, or `custom` for complex schemas. |
| `connection.reasoning.apiReasoning` | `true` | Used only when reasoning override is meaningful. |
| `connection.reasoning.effort` | `auto` | Custom effort when supported. |
| `connection.reasoning.thinkingDisplay` | `auto` | Custom thinking display when supported. |
| `connection.testPrompt` | compact JSON smoke prompt | Used by `Test Tracker Connection`. |

Advanced/Internal connection modes still exist for migration and diagnostics:

- `active_quiet`: active/default roleplay connection.
- `selected_connection_quiet`: selected profile through quiet generation when supported.
- `selected_connection_raw`: selected profile with raw tracker parameters.

Use `Test Tracker Connection` after selecting a profile. It does not mutate chat, snapshots, embedded tags, or message displays. Diagnostics show duration, mode used, fallback reason, output preview, finish reason, and usage when available.

## Message Display

`messageDisplay.displaySurface` controls where the tracker opens:

- `inline_contained`: inline tracker constrained to message width.
- `inline_wide`: inline tracker mounted as wide as the practical chat/message row.
- `anchored_popover`: compact shell opens a floating popover.
- `fullscreen_reader`: compact shell opens the fullscreen reader with a fixed mobile close button.
- `drawer_only`: no inline tracker, drawer history only.

`expandedWidth.expandedWidthMode` controls sizing behavior for expanded inline surfaces:

- `contained`
- `wide`
- `full_mobile`

### Which display mode should I use?

Recommended setup for the widest normal chat tracker:

- Display surface: Inline wide
- Expanded width mode: Full mobile on phone / Wide on desktop
- Max expanded width: 1100-1800
- Mobile margin: 0-6
- Expanded max height: 90-95

Display surface decides where the tracker opens. Expanded width mode only affects inline sizing. Max expanded width is a cap, not a guaranteed width.

If inline wide is still narrow, the host message bubble is constraining it. LTracker now tries a wide message-row mount before falling back to the normal bubble. If the host DOM still prevents practical width, use anchored popover or fullscreen reader; both are detached from message-bubble constraints.

Legacy `messageDisplay.displayMode` remains for migration and preset-pack compatibility. Old settings migrate as follows:

- `inline_full + contained` -> `inline_contained`
- `inline_full + wide/full_mobile` -> `inline_wide`
- `inline_button_popover` -> `anchored_popover`
- `drawer_history_only` -> `drawer_only`

The popover/fullscreen click handler is scoped to LTracker-owned shell controls. User template drawers such as `<details><summary>User template drawer</summary><div>Still opens normally</div></details>` remain normal template content.

## Trusted Renderer Freedom

LTracker has three renderer trust levels.

### Safe Mode

Use Safe Mode for unknown/shared imports.

- Removes full `<style>...</style>` blocks including CSS contents.
- Strips SVG.
- Strips JavaScript-like content, event handlers, iframes, forms, inputs, links, and external URLs.
- Keeps a strict HTML sanitizer.

### Trusted Mode

Trusted Mode is the default for user-authored presets.

- Allows scoped `<style>` blocks.
- Allows safe inline styles.
- Allows safe inline SVG.
- Allows CSS variables, gradients, grid/flex, shadows, transforms, transitions, basic animations, and details/summary drawers.
- Disallows JavaScript, event handlers, external URLs, `@import`, remote fonts, iframes, forms, inputs, scripts, and unsafe SVG references.

Trusted style blocks are sanitized and scoped under a generated wrapper class such as `.ltracker-preset-scope-abc123 .my-card`, so preset CSS does not leak into Lumiverse host UI.

Trusted SVG allowlist:

```text
svg, path, circle, rect, line, polyline, polygon, g, defs, linearGradient, radialGradient, stop
```

Trusted SVG attribute allowlist:

```text
viewBox, fill, stroke, stroke-width, d, cx, cy, r, x, y, width, height,
points, x1, x2, y1, y2, offset, stop-color, stop-opacity, opacity,
class, aria-hidden, role
```

### Dev Mode

Dev Mode is a future explicit opt-in sandbox experiment. Imported presets cannot enable Dev Mode automatically. JavaScript remains disabled in v0.19; if script-like content is detected, LTracker strips it and warns:

```text
JavaScript requires Dev Mode and was not executed.
```

## Template Syntax

Supported template syntax:

```handlebars
{{path}}
{{data.path}}
{{json path}}
{{#each array}}...{{/each}}
{{#if field}}...{{else}}...{{/if}}
{{#unless field}}...{{/unless}}
{{#with object}}...{{/with}}
{{this}}
```

Supported helpers:

```handlebars
{{default value "fallback"}}
{{percent value}}
{{json value}}
{{eq a b}}
{{gt a b}}
{{lt a b}}
{{and a b}}
{{or a b}}
{{not a}}
{{class value}}
{{lower value}}
{{upper value}}
{{truncate value 80}}
```

Missing values render as the configured missing value placeholder and do not crash rendering. Falsey values are `false`, `null`, `undefined`, `""`, `0`, and empty arrays. Non-empty strings, non-zero numbers, `true`, non-empty arrays, and objects are truthy.

## Preset Import Review And Validation

Import Review shows renderer requirements before install:

```text
This preset uses:
- Scoped CSS
- Inline SVG
- Conditionals
Recommended mode: Trusted
```

If a preset contains scripts or event handlers, the review warns that JavaScript-like content will be stripped unless a future explicit Dev Mode sandbox is enabled. Imported presets cannot enable Dev Mode automatically.

Validate Preset understands:

- `data.time.clock` as schema field `time.clock`
- loop context such as `{{#each data.cast}}{{name}}{{idn.desc}}{{/each}}`
- `{{this}}` inside array loops
- conditionals and helpers

Validation reports true missing fields, true unused fields, estimated prompt/render size, sanitizer warning groups, and renderer requirements.

## Tracker Memory And Prompt Injection

Tracker Memory feeds prior tracker snapshots into tracker generation. It does not affect normal roleplay generations by itself. Defaults are memory on, last 3 prior snapshots, full snapshot count 3, and oldest-to-newest ordering.

Prompt Injection is separate, optional, and disabled by default. It uses the interceptor permission path, not `context_handler`; `spindle.json` does not request `context_handler`.

## Settings Reference

Common settings are repaired back to safe defaults if missing or malformed.

| Setting | Default | Notes |
| --- | --- | --- |
| `recentMessageLimit` | `24` | Number of recent chat messages read for tracker generation. |
| `maxMessageChars` | `48000` | Per-message character cap before prompting. |
| `generationTimeoutMs` | `45000` | Tracker generation timeout. |
| `saveRawOutput` | `true` | Saves raw tracker model output for diagnostics. |
| `savePromptPreview` | `true` | Saves prompt preview for diagnostics. |
| `auto.autoModeEnabled` | `false` | Enables auto tracker generation. |
| `auto.autoDebounceMs` | `1500` | Wait after finalization before generating. |
| `auto.skipFirstMessages` | `2` | Skips early chats. |
| `auto.triggerAfterAssistantMessages` | `true` | Auto after assistant messages. |
| `auto.triggerAfterUserMessages` | `false` | Auto after user messages. |
| `auto.attachSnapshotToMessage` | `true` | Saves message-attached snapshots. |
| `auto.onlyWhenChatActive` | `true` | Skips stale inactive chats. |
| `autoTiming.waitForAssistantFinalization` | `true` | Waits for final message state. |
| `autoTiming.postCompletionSettleMs` | `750` | Settle delay after finalization. |
| `autoTiming.stableContentCheckMs` | `400` | Delay between stable-content reads. |
| `autoTiming.requireStableSwipeContent` | `true` | Requires matching content reads. |
| `autoTiming.cancelPendingOnSwipeChange` | `true` | Cancels pending jobs when selected swipe changes. |
| `budget.mode` | `estimated_tokens` | Uses approximate token budgets. |
| `budget.ultraModeEnabled` | `false` | Raises limits for very large presets. |
| `budget.recentMessageBudgetTokens` | `16000` | Recent transcript budget. |
| `budget.perMessageBudgetTokens` | `12000` | Per-message budget. |
| `budget.trackerMemoryBudgetTokens` | `12000` | Tracker memory budget. |
| `budget.promptInjectionBudgetTokens` | `12000` | Injection budget. |
| `budget.maxTrackerOutputTokens` | `8000` | Tracker output token cap. |
| `budget.promptPreviewBudgetTokens` | `16000` | Prompt preview cap. |
| `budget.renderedHtmlMaxChars` | `250000` | Rendered HTML cap. |
| `budget.rawOutputMaxChars` | `250000` | Raw output cap. |
| `budget.presetImportMaxChars` | `10,000,000 (Normal) / 50,000,000 (Ultra)` | Preset import cap. |
| `renderer.enabled` | `true` | Drawer preview renderer. |
| `renderer.previewSource` | `latest_chat_snapshot` | Drawer preview source. |
| `renderer.missingValuePlaceholder` | empty | Placeholder for missing paths. |
| `renderer.maxRenderedChars` | `250000` | Drawer render cap. |
| `renderer.allowInlineStyles` | `true` | Migrated internal flag from trust mode. |
| `renderer.templateTrustMode` | `trusted` | Safe, Trusted, or future Dev behavior. |
| `messageDisplay.enabled` | `true` | Message tracker display. |
| `messageDisplay.useDomInjection` | `true` | DOM injection primary renderer. |
| `messageDisplay.fallbackToIframeWidget` | `false` | Advanced iframe fallback. |
| `messageDisplay.attachmentMode` | `sidecar_snapshot` | Sidecar, embedded tag, or both. |
| `messageDisplay.displayMode` | `inline_full` | Legacy compatibility mode. |
| `messageDisplay.displaySurface` | `inline_wide` | Where the tracker opens. |
| `messageDisplay.placement` | `top` | Top or bottom placement. |
| `messageDisplay.source` | `message_attached_snapshot` | Exact message or latest chat state. |
| `messageDisplay.renderMode` | `html_template` | HTML template, compact text, or pretty JSON. |
| `messageDisplay.allowInlineStyles` | `true` | Migrated internal flag from trust mode. |
| `messageDisplay.deduplicateRenderWarnings` | `true` | Summarizes repeated warnings. |
| `messageDisplay.showRenderWarningsInDiagnosticsOnly` | `true` | Keeps warning detail out of chat UI. |
| `messageDisplay.showDebugSwipeKey` | `false` | Shows swipe metadata. |
| `messageDisplay.showGenerateButtonForMissingTracker` | `true` | Shows generate icon when no exact tracker exists. |
| `messageDisplay.controlDensity` | `compact` | Compact or comfortable controls. |
| `messageDisplay.controlPlacement` | `message_header` | Preferred control placement. |
| `messageDisplay.showExpandedHeaderActions` | `true` | Shows regenerate/edit/delete in expanded header. |
| `messageDisplay.showBottomActionsInInlineTracker` | `false` | Legacy large bottom actions. |
| `messageDisplay.collapsedByDefault` | `true` | Starts trackers collapsed. |
| `messageDisplay.compactCollapsedHeader` | `true` | Slim collapsed header. |
| `messageDisplay.showTimestamp` | `true` | Shows snapshot time. |
| `messageDisplay.showPresetName` | `true` | Shows preset name. |
| `messageDisplay.showDebugCopyButtonsInHistory` | `true` | Drawer history copy buttons. |
| `messageDisplay.showWidgetRegenerateButton` | `true` | Regenerate/cancel icon. |
| `messageDisplay.showEditButton` | `true` | Edit/view icon. |
| `messageDisplay.showDeleteButton` | `true` | Delete icon. |
| `messageDisplay.showNoTrackerForSwipe` | `false` | Reserved missing-swipe display. |
| `messageDisplay.showGenerationDuration` | `true` | Shows live/completed timing. |
| `messageDisplay.minimizedMaxHeightPx` | `0` | Legacy iframe minimized height. |
| `messageDisplay.maxRenderedChars` | `250000` | Message render cap. |
| `expandedWidth.expandedWidthMode` | `wide` | Inline sizing behavior. |
| `expandedWidth.maxExpandedWidthPx` | `1100` | Maximum cap, not guaranteed width. |
| `expandedWidth.mobileHorizontalMarginPx` | `4` | Viewport margin for mobile/full-width modes. |
| `expandedWidth.expandedContentMaxHeightVh` | `90` | Max scroll body height. |
| `expandedWidth.preferFullscreenOnMobile` | `true` | Only affects popover/overlay behavior. |
| `expandedWidth.fullscreenBreakpointPx` | `640` | Width below which mobile behavior starts. |
| `expandedWidth.popoverBackdrop` | `true` | Dark overlay behind popover. |
| `expandedWidth.closeOnBackdropClick` | `true` | Clicking backdrop closes popover. |
| `expandedWidth.closeOnEscape` | `true` | Desktop keyboard shortcut. |

## Install And Development

```bash
npm install
npm run validate
```

Validation runs TypeScript typecheck, shared-module tests, backend/frontend bundling, and the backend scanner. Build output is written to `dist/backend.js` and `dist/frontend.js`, which are referenced by `spindle.json`.

## Permissions

| Permission | Used for | Degrade behavior |
| --- | --- | --- |
| `generation` | Tracker extraction and generation events. | Generate requests show a clear missing-permission error. |
| `chats` | Active chat resolution and chat data reads. | Falls back to supplied chat id or errors clearly. |
| `chat_mutation` | Embedded tracker tag writes/removals only. | Sidecar mode still works; embedded tag updates cannot run. |
| `interceptor` | Optional normal prompt injection. | Tracker Memory still works; prompt injection is unavailable. |

## Known Limitations

- JavaScript remains disabled outside future explicit Dev Mode.
- Sequential generation, partial regeneration, cleanup/repair mode, World Books, character exclusions, and advanced import/export polish are future phases.
- DOM injection can only attach to mounted messages; drawer history covers unavailable messages.
- Some host themes may still constrain inline content. Inline wide records diagnostics for mount strategy and width constraints, and popover/fullscreen remain the reliable detached alternatives.
- Embedded tracker tag mode only replaces or removes LTracker's own tag for the exact swipe key.
- Diagnostics may contain sensitive chat-derived prompt and model output when raw/prompt saving is enabled.

## Roadmap

1. `0.20 Dev Mode Templates / Sandbox Experiments`
2. `0.21 Sequential + Partial Regeneration`
3. `0.22 Cleanup / Repair / Pending Fields`
4. `0.23 World Books, Character Exclusions, Import/Export Polish`
5. `0.24 YAML / Macro Support / Advanced Compatibility`

## Attribution

LTracker is inspired by Zaakh/SillyTavern-zTracker and its tracker-oriented design. No zTracker source code is copied in version `0.19`. If future versions copy or adapt zTracker code, preserve the original MIT attribution and license notices.
