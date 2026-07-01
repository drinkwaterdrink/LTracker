# LTracker

Version: `0.26.1`

Current release: `0.26.1 Prompt Injection Swipe Isolation + Stale Tracker Leak Fix`

LTracker is a Lumiverse Spindle extension that creates tracker snapshots from recent chat messages. It is inspired by Zaakh/SillyTavern-zTracker's tracker concept, but this project is a fresh Lumiverse-native implementation and does not depend on SillyTavern APIs, globals, DOM selectors, templates, prompt builders, World Info APIs, connection profile APIs, or `generate_interceptor`.

## Current Features

- Drawer tab, input-bar `Generate Tracker` action, per-message tracker controls, and drawer history.
- True active-panel drawer shell with sticky command header, sticky primary nav, and a scrollable active panel.
- Manual, auto, and exact message/swipe tracker generation.
- Swipe-aware sidecar snapshots and optional embedded `<ltracker type="state">` tags.
- Tracker Memory for prior snapshot baseline context.
- Optional normal prompt injection through `spindle.registerInterceptor()`, disabled by default and swipe-isolated when enabled.
- Selected tracker profile workflow with tracker-specific advanced parameters.
- Display surfaces for inline contained, inline wide, anchored popover, fullscreen reader, and drawer-only use.
- Preset-locked snapshot rendering so existing trackers keep the preset/template they were generated with.
- Trusted renderer support for scoped CSS, safe inline styles, safe inline SVG, details/summary drawers, conditionals, loops, and helpers.
- Preset Render Lab for phone/tablet/desktop viewport previews with stress sample data and fullscreen overlay preview.
- Template Helper Pack for chip lists, joins, field plucking, fallbacks, clamped meter widths, and mobile-safe class names.
- Preset QA warnings for raw array/object interpolation, mobile overflow risk, and vertical text risk.
- Safe Mode for shared or unknown presets, with full style-block removal so raw CSS is not shown as text.
- Preset pack import/export, import review, validation reports, sample snapshot rendering, and Ultra Tracker Mode budgets.
- Preset import credential guardrails that allow fictional schema/template words like secrets, tokens, and credentials while stripping real connection credentials from recommended settings.
- Compact validation UX with grouped reports, clear pack/template/rendered character labels, and reliable copyable validation reports.
- Maintenance & Repair tools for health checks, settings repair, snapshot index cleanup, preset render-lock diagnostics, orphan scans, broken embedded tag cleanup, and copyable maintenance reports.
- Context Filters for tracker generation, auto-mode exclusions, manual lore/character/persona notes, and read-only native world/character/persona context when Lumiverse permissions are granted.
- Owner Power Mode for private/local interactive tracker UIs using LTracker-owned declarative action hooks, inert runtime-source import/export, Render Lab testing, diagnostics, crash recovery, and a global kill switch.
- Prompt Injection safety diagnostics that reject stale, non-selected, alternate-swipe, future-index, and unverified global tracker states before normal roleplay generation.

## Drawer Command Center

Version `0.22` turned the drawer into a true mobile-first app shell, `0.23` tightened import/review UX, and `0.24` adds recovery tooling and mobile/runtime polish:

```text
Sticky Command Header
Sticky Primary Nav
Scrollable Active Panel
```

Only the active panel renders at a time. The primary mobile navigation is:

1. Home
2. Presets
3. Render Lab
4. Display
5. More

The More panel launches Generation, Connection, Memory & Context Filters, Diagnostics, and Advanced. The UI follows a dark graphite/glass command-center style with real LTracker status only: ready/warning/error state, auto on/off, generation status, selected tracker profile, active preset, display surface, last generation duration when recorded, and real errors/fallbacks. It does not invent fake metrics or fake telemetry.

Home shows the active preset, selected tracker profile, display surface, auto-mode state, last generation status, last error, and the recommended next action. Quick actions cover Generate Tracker, Regenerate Selected / Latest, Import Preset, Open Render Lab, Test Connection, and Diagnostics.

Presets keeps everyday preset selection, import/export, validation, duplicate/delete/reset, and compatibility warnings visible. The large JSON Schema, HTML Template, Prompt Instructions, Description, and Notes authoring fields are collapsed behind Authoring mode.

Render Lab remains storage-free and chat-safe. The drawer panel shows controls plus a compact result summary. The rendered tracker preview opens in a floating fullscreen-style overlay with a large fixed close button, normal Close button, mobile safe-area spacing, optional Escape close, and backdrop-close behavior that follows the current display setting. It previews the active or staged preset with phone narrow, phone large, tablet, desktop, or custom widths; minimal, normal, stress, mobile torture, cast-heavy, or world-heavy samples; and inline contained, inline wide, popover, or fullscreen shells. It can copy sample JSON, sanitized HTML, and the lint report.

## v0.23 Import And Validation Cleanup

Preset import now distinguishes story/preset vocabulary from actual extension credentials. A tracker schema may safely use fictional fields such as `secrets`, `secretHints`, `tokens`, `credentials`, or `privateKnowledge`; those names are common tracker concepts and no longer cause broad false-positive rejection.

LTracker still strips real credential-bearing recommended settings before install. This applies to actual connection/provider/config fields such as `apiKey`, `secretKey`, `password`, `bearer`, `privateKey`, `accessKey`, and similar credential names inside `recommendedSettings.connection` or future provider/auth-style settings blocks. Warnings name the stripped setting path only and never echo the secret value.

Validation reports now show the small summary first:

- Errors, warnings, and pass counts.
- Pack chars.
- Model prompt token estimate.
- Template chars.
- Schema chars.
- Rendered chars.
- Renderer requirements and mobile QA warnings in collapsed groups.

Render Lab previews stay out of the normal drawer scroll. Use `Open Preview` or `Open Fullscreen Preview` to inspect the rendered tracker in the overlay.

Display uses visual cards instead of raw mode selectors:

- Inline Wide: recommended normal mode for practical chat-width trackers.
- Anchored Popover: best for large HUDs without chat clutter.
- Fullscreen Reader: best for mobile reading.
- Drawer Only: no inline chat display.
- Inline Contained: compatibility mode.

Advanced Display keeps inline sizing, popover, fullscreen, and close behavior settings. Legacy `messageDisplay.displayMode` stays internal for migration and is not a normal control.

Generation exposes everyday auto controls, trigger roles, skip count, message limits, budgets, timeout, raw-output saving, prompt-preview saving, attach behavior, and swipe status. Advanced Generation contains debounce, finalization, settle delay, stable swipe checks, and pending-job cancellation.

Connection shows only the tracker profile dropdown, refresh profiles, test connection, fallback status, selected profile identity, and last test result. Low-level `connection.mode` and model parameters live under Advanced Connection.

Memory & Context Filters separates three related features: Tracker Generation Context controls what LTracker reads before building tracker prompts, Tracker Memory is used only when LTracker generates or updates tracker JSON, and Prompt Injection injects tracker state into normal roleplay generation. Prompt Injection can affect story continuity and should stay off unless you specifically want the RP model to see tracker state.

Diagnostics is collapsed and searchable. Groups cover Status, Last error, Generation jobs, Auto timing, Memory, Prompt injection, Display / DOM, Renderer / sanitizer, Presets / import, Connections, and Storage / history. Copy buttons include all diagnostics, last error, last prompt preview, and last raw model output.

Advanced contains Ultra Tracker Mode, budget limits, storage maintenance, duplicate/orphan cleanup, reset settings, clear current chat snapshot, legacy compatibility, hidden debug controls, and the future Dev Mode placeholder.

## v0.24 Cleanup, Repair, Runtime Polish, and Mobile Smoke Fixes

v0.24 focuses on day-to-day recovery instead of new generation features. The More panel now includes Maintenance & Repair with plain-language actions:

- Run Health Check: inspects settings, presets, renderer mode, connection fallback, snapshot indexes, sidecar availability, preset render locks, and embedded tracker tags.
- Repair Settings: rewrites repaired settings through the normal `repairSettings()` path, keeping migration compatibility.
- Repair Snapshot Index: deduplicates message/swipe history rows, keeps the newest entry for each swipe identity, and removes rows that point to missing sidecar snapshots.
- Repair Preset Render Locks: only backfills legacy locks when the original installed preset can be matched by id or name/version. It never silently rebinds old trackers to the current active preset.
- Clean Orphan Snapshots: reindexes discoverable sidecar snapshots that are not referenced by the index. Full storage deletion is intentionally limited because Spindle storage does not expose broad listing.
- Clean Broken Embedded Tags: removes complete LTracker-owned embedded tags whose JSON is broken. Malformed tag fragments are reported for manual review.
- Copy Maintenance Report: copies a structured report with severity, category, suggested fix, repair action id, storage counts, preset-lock counts, and scan limitations.

Diagnostics now includes a Maintenance / Repair group and copy actions for health check reports and maintenance reports. Raw prompt and model output remain collapsed by default.

### Quick Setup Profiles

Quick setup profiles show a confirmation preview before applying changes:

- Mobile Wide Tracker: inline wide, full-mobile width, zero mobile margin, tall scroll body.
- Popover HUD: anchored popover with backdrop and close behavior.
- Fullscreen Reader: fullscreen reader with mobile-safe reading height.
- Minimal Inline: compact contained inline display.
- Authoring Mode: Trusted renderer, large render/raw budgets, visible render warnings.
- Safe Mode: strict Safe renderer, inline styles off, prompt injection off.
- Ultra Budget: high prompt/render/import/output budgets for huge presets.

### Visible, Advanced, And Legacy Settings

Visible settings are task-oriented and appear in Home, Presets, Render Lab, Display, Generation, Connection, and Memory & Context Filters. Advanced settings remain reachable but collapsed. Legacy/migration-only fields such as `messageDisplay.displayMode`, iframe fallback, raw attachment mode, debug swipe key, debug history copy buttons, and low-level connection mode are hidden from the normal UI.

## v0.25 Context Filters, World/Lore Integration Prep, and Character Exclusions

v0.25 adds a clear context assembly layer before tracker prompt construction:

- Tracker Generation Context controls whether chat messages, tracker memory, embedded tracker tags, world/lore metadata, active character context, persona context, and manual notes are included.
- Message/name exclusions can skip exact character names, case-insensitive contains matches, text/name patterns, user messages, assistant messages, and OOC/system-like messages.
- Auto-mode exclusions can skip tracker generation when the source message or active author matches filter rules. Manual Generate Tracker remains available and falls back safely if filters remove every message.
- World/lore integration is read-only. The installed `lumiverse-spindle-types@0.5.21` exposes `world_books.getActivated()`, which currently provides activated entry metadata such as comment, keys, source, and score; full native lore body ingestion is deferred until Lumiverse exposes a verified read surface for it.
- Character/persona integration is read-only through `characters.get()` and `personas.getActive()` when permissions are granted. Manual Character Notes, Persona Notes, and Extra Lore Context work even if native APIs are unavailable.
- Context Budget Preview breaks down recent chat messages, tracker memory, world/lore context, character context, persona/manual notes, and total estimated tokens/chars.
- Prompt preview diagnostics now include included context sections and an exclusion report, with copy actions for full prompt preview, included context, lore context, and filter reports.

Health Check now warns when context filters remove all normal sources, native world/character/persona context is enabled without an available API/permission, or additional context budgets are unusually high.

## v0.26.1 Prompt Injection Swipe Isolation + Stale Tracker Leak Fix

v0.26.1 hardens normal roleplay Prompt Injection so rejected or alternate swipes cannot leak stale tracker state into the provider prompt.

Safer defaults:

- `injection.enabled`: `false`
- `injection.retainCount`: `1`
- `injection.format`: `minimal`
- `injection.injectionPlacement`: `system_before_last`
- `injection.isolationMode`: `latest_selected_swipe_only`
- `injection.includeOnlyIfMissingFromPrompt`: `true`
- `injection.stripOlderTrackerBlocks`: `true`
- `memory.source`: `sidecar_index`
- `memory.requireSameSwipeWhenAvailable`: `true`
- `memory.retainCount`: `2`
- `memory.fullSnapshotCount`: `1`

Prompt Injection isolation modes:

- `off`: no prompt injection.
- `latest_selected_swipe_only`: injects only the latest tracker attached to the verified latest assistant message's selected swipe. This is the recommended mode.
- `same_message_selected_swipe_only`: injects only the tracker attached to the latest assistant message's selected swipe.
- `same_swipe_chain`: allows recent tracker states only when each entry matches the selected swipe for its own message and is not beyond the prompt boundary.
- `legacy_recent`: old recent-memory behavior. It remains available under advanced settings, but Health Check warns when it is enabled.

Before injecting, LTracker now verifies the current prompt boundary from the provider prompt and current chat messages. It rejects tracker candidates when:

- the snapshot belongs to a non-selected swipe;
- the snapshot points beyond the latest live prompt message;
- the source message is not represented in the prompt;
- the candidate is the global latest chat snapshot and cannot be tied to a selected swipe;
- the latest selected assistant swipe has no matching tracker snapshot;
- the prompt boundary cannot be verified.

In swipe-isolated modes, existing LTracker blocks already present in the prompt are stripped before the verified isolated block is inserted. This prevents stale blocks from surviving just because `includeOnlyIfMissingFromPrompt` is enabled.

Memory & Context Filters now shows a Prompt Injection Safety card with the latest boundary, selected swipe key, accepted/rejected counts, and a copyable Prompt Injection Safety Report. Maintenance & Repair includes warnings and repair actions for unsafe Prompt Injection settings:

- Disable Prompt Injection.
- Apply Swipe-Safe Injection Defaults.
- Apply Swipe-Safe Memory Defaults.
- Clear Prompt Injection safety diagnostics.

## v0.26 Owner Power Mode + Interactive Tracker Runtime

Owner Power Mode is a private/local layer for presets you personally make or approve. It does not replace Safe Mode or Trusted Mode:

- Safe Mode: strict shared-preset mode. Style blocks, SVG, scripts, event handlers, external URLs, and action hooks are stripped.
- Trusted Mode: user-authored static HUD mode. Scoped CSS, safe inline styles, safe SVG, template helpers, details/summary, loops, and conditionals are allowed. Script execution remains disabled.
- Owner Power Mode: local interactive mode. Presets may carry inert `ownerPowerScript` / `ownerPowerManifest` metadata, and LTracker can run scoped declarative action hooks for tabs, menus, panels, class toggles, copy buttons, fullscreen actions, reset view, expand all, and collapse all.

Imported packs cannot enable Owner Power automatically. If a pack contains Owner Power runtime source or asks for Dev/Owner mode, LTracker imports it inertly, strips any recommended setting that tries to enable Owner Power, downgrades recommended Dev renderer mode to Trusted, and shows an import-review warning. The runtime source is preserved for your own presets but does not run in Safe or Trusted Mode.

Render Lab is the first testing surface:

- Static preview remains the default.
- Interactive preview uses LTracker-owned declarative hooks when `allowTemplateActionHooks` is enabled.
- The overlay keeps the fixed close button and static fallback. A failed action cannot trap the drawer.
- Diagnostics show runtime mode, detected script source, script chars, last runtime event, crash count, and the last Owner Power error.

Declarative hook examples:

```html
<button type="button" data-ltracker-power-action="show-panel" data-target="cast">Cast</button>
<section data-ltracker-power-panel="cast">...</section>

<button type="button" data-ltracker-power-action="toggle-class" data-target=".hud" data-class="compact">Compact</button>
<button type="button" data-ltracker-power-action="copy-field" data-path="imgFull">Copy Image Prompt</button>
<button type="button" data-ltracker-power-action="open-fullscreen">Fullscreen</button>
<button type="button" data-ltracker-power-action="reset-view">Reset View</button>
```

Supported actions in this build:

- `show-panel`
- `toggle-panel`
- `toggle-class`
- `copy-field`
- `copy-text`
- `open-fullscreen`
- `close-overlay`
- `reset-view`
- `expand-all`
- `collapse-all`

Full arbitrary preset JavaScript is intentionally deferred in `0.26`. The current scanner/runtime constraints prohibit runtime code generation and the extension should not expose Lumiverse host DOM, storage, generation, API keys, connection details, or unrestricted network access to a template. Owner Power script fields are therefore importable/exportable as inert source, while this release ships the stable declarative hook runtime.

Recovery controls live under Advanced > Owner Power Mode:

- Disable Owner Power now.
- Reset Owner Power settings.
- Clear Owner Power crash counters.
- Copy Owner Power report.

Maintenance & Repair warns when Owner Power is enabled, installed runtime is enabled, a preset contains inert runtime source while Owner Power is disabled, crash count reaches the disable threshold, or external/network/host DOM flags are enabled. Repair actions can disable Owner Power, reset settings, and clear crash counters.

## Preset-Locked Snapshot Rendering

The active preset controls future tracker generations. Once a tracker snapshot is generated, LTracker stores a render lock with the preset identity, template hash, and template copy used for that snapshot. Changing the active preset later does not repaint old trackers through the new template.

Regenerating a message/swipe tracker intentionally creates a new snapshot with the currently active preset and captures a new render lock. Edited tracker JSON preserves the original render lock.

Legacy snapshots from before `0.19.2` resolve by installed preset id first, then installed preset name/version. If no original preset can be found, LTracker falls back safely and warns rather than silently pretending the active preset is the original. Preset packs remain separate: `.ltracker.json` files export presets, not generated tracker snapshots or render locks.

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

Dev Mode is a future explicit opt-in sandbox experiment. Imported presets cannot enable Dev Mode automatically. JavaScript remains disabled in v0.23; if script-like content is detected, LTracker strips it and warns:

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
{{@index}}
{{@first}}
{{@last}}
{{@root.path}}
{{../parentField}}
```

Supported helpers:

```handlebars
{{default value "fallback"}}
{{coalesce a b c "fallback"}}
{{percent value}}
{{json value}}
{{eq a b}}
{{gt a b}}
{{lt a b}}
{{and a b}}
{{or a b}}
{{not a}}
{{class value}}
{{safeClass value}}
{{lower value}}
{{upper value}}
{{truncate value 80}}
{{length value}}
{{join array ", "}}
{{pluck array "field"}}
{{pluckJoin array "field" ", "}}
{{get object "field"}}
{{isArray value}}
{{isObject value}}
{{isEmpty value}}
{{notEmpty value}}
{{clamp value 0 100}}
{{meterWidth value}}
{{nl2br value}}
{{chip value}}
{{chipList array}}
{{fieldChip object "labelField" "contentField"}}
{{fieldChipList array "labelField" "contentField"}}
```

Missing values render as the configured missing value placeholder and do not crash rendering. Falsey values are `false`, `null`, `undefined`, `""`, `0`, and empty arrays. Non-empty strings, non-zero numbers, `true`, non-empty arrays, and objects are truthy.

## Template Helper Pack

The 0.20+ helper pack is meant for complex HUD-style presets that need to render arrays and nested objects cleanly without raw JSON blobs. Directly writing `{{rel}}`, `{{pockets}}`, or `{{cast}}` can display objects as JSON text. Prefer loops or chip helpers.

String array:

```handlebars
{{#each pockets}}
  <span class="chip">{{this}}</span>
{{/each}}
```

Object array:

```handlebars
{{#each rel}}
  <span class="chip"><b>{{t}}</b>{{#if c}} - {{c}}{{/if}}</span>
{{/each}}
```

Helper shorthand:

```handlebars
{{fieldChipList rel "t" "c"}}
{{fieldChipList pockets "t" "c"}}
{{pluckJoin cast "name" ", "}}
```

Nested tracker data:

```handlebars
{{#each cast}}
  <section class="actor-card">
    <h3>{{@index}}. {{name}}</h3>
    <div>{{fieldChipList rel "t" "c"}}</div>
    <div>{{fieldChipList pockets "t" "c"}}</div>
  </section>
{{/each}}
```

## Mobile-Safe Preset Design

Use flexible widths, `minmax(0, 1fr)`, wrapping chip rails, and `overflow-x: auto` for dense HUD sections. Avoid large fixed widths, many fixed grid columns, `white-space: nowrap` on broad containers, and narrow fixed columns that can create letter-by-letter wrapping.

Trusted Mode now allows scoped layout properties such as `position`, `inset`, `aspect-ratio`, `place-items`, `text-overflow`, `isolation`, `contain`, `pointer-events`, `user-select`, and `backdrop-filter`. Style blocks are still scoped to the preset root and external URLs, `@import`, remote fonts, events, and scripts remain blocked.

## Preset Render Lab

The Preset Render Lab lives in the drawer near Presets / Validate & Preview. It renders the active preset, or the staged import under review, without mutating chat, storage, snapshots, or embedded tags.

Preview widths:

- Phone narrow: `360px`
- Phone large: `430px`
- Tablet: `768px`
- Desktop: `1100px`
- Custom width

Display shells:

- Inline contained
- Inline wide
- Popover body
- Fullscreen reader body

Backgrounds:

- Simulated chat
- Plain dark
- Transparent checker

The lab shows sanitized HTML, renderer requirements, missing/unused fields, raw-object interpolation warnings, mobile QA warnings, rendered character count, estimated prompt tokens, and copy buttons for sanitized HTML, sample JSON, and the lint report.

## Sample Snapshot Stress Modes

Sample modes help preset authors reproduce layout problems without a real chat:

- Minimal
- Normal
- Stress / Max Arrays
- Mobile Torture
- Cast Heavy
- World Heavy

Stress samples include cast entries, relation arrays, pocket arrays, long descriptions, long location/weather strings, alerts, empty arrays, missing optional values, and nested object arrays. Mobile Torture adds long words and labels to reveal clipping, overflow, and vertical text wrapping.

## Preset Import Review And Validation

Import Review shows renderer requirements before install:

```text
This preset uses:
- Scoped CSS
- Inline SVG
- Conditionals
- Template helpers
- Possible raw object interpolation
- Possible mobile overflow
Recommended mode: Trusted
```

If a preset contains scripts or event handlers, the review warns that JavaScript-like content will be stripped unless a future explicit Dev Mode sandbox is enabled. Imported presets cannot enable Dev Mode automatically.

Validate Preset understands:

- `data.time.clock` as schema field `time.clock`
- loop context such as `{{#each data.cast}}{{name}}{{idn.desc}}{{/each}}`
- `{{this}}` inside array loops
- conditionals and helpers

Validation reports true missing fields, true unused fields, estimated prompt/render size, sanitizer warning groups, renderer requirements, raw array/object interpolation warnings, mobile overflow risk, and vertical text risk.

## Tracker Memory And Prompt Injection

Tracker Memory feeds prior tracker snapshots into tracker generation. It does not affect normal roleplay generations by itself. Defaults are memory on, sidecar-index source, same-swipe filtering when available, last 2 prior snapshots, full snapshot count 1, and oldest-to-newest ordering.

Prompt Injection is separate, optional, and disabled by default. It uses the interceptor permission path, not `context_handler`; `spindle.json` does not request `context_handler`. When enabled, the recommended isolation mode is `latest_selected_swipe_only`; `legacy_recent` remains available only for advanced compatibility and is warned by Health Check.

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
| `messageDisplay.showGenerationDuration` | `true` | Internal always-on live/completed timing; old false values are repaired to true. |
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
| `contextFilters.enabled` | `false` | Enables generation context filtering. |
| `contextFilters.includeChatMessages` | `true` | Includes recent chat messages in tracker generation. |
| `contextFilters.includeTrackerMemory` | `true` | Allows tracker memory in tracker generation. |
| `contextFilters.includeEmbeddedTrackerTags` | `true` | Allows embedded tags as a tracker memory source. |
| `contextFilters.includeWorldLoreContext` | `false` | Includes read-only activated world/lore metadata when available. |
| `contextFilters.includeCharacterContext` | `false` | Includes read-only active character card context when available. |
| `contextFilters.includePersonaContext` | `false` | Includes read-only active persona/manual notes when available. |
| `contextFilters.excludedCharacterNames` | empty | Names excluded from tracker context and optional auto tracking. |
| `contextFilters.excludedMessageNamePatterns` | empty | Simple contains patterns for message name/content exclusions. |
| `contextFilters.excludedLoreKeywords` | empty | Lore metadata/manual lore exclusion keywords. |
| `contextFilters.loreAllowlistKeywords` | empty | Optional allowlist keywords for lore metadata. |
| `contextFilters.manualWorldLoreContext` | empty | Manual extra lore text for tracker generation only. |
| `contextFilters.manualCharacterContext` | empty | Manual character notes for tracker generation only. |
| `contextFilters.manualPersonaContext` | empty | Manual persona notes for tracker generation only. |
| `memory.source` | `sidecar_index` | Tracker Memory source for tracker generation continuity. |
| `memory.retainCount` | `2` | Prior tracker snapshots retained for tracker generation. |
| `memory.fullSnapshotCount` | `1` | Full prior snapshots retained before compacting older entries. |
| `memory.requireSameSwipeWhenAvailable` | `true` | Keeps tracker memory aligned to selected swipe identity when possible. |
| `injection.enabled` | `false` | Normal roleplay Prompt Injection is off by default. |
| `injection.retainCount` | `1` | Safe Prompt Injection keeps at most one verified tracker state. |
| `injection.format` | `minimal` | Compact normal-roleplay injection format. |
| `injection.injectionPlacement` | `system_before_last` | Places verified tracker state before the final prompt message. |
| `injection.isolationMode` | `latest_selected_swipe_only` | Rejects alternate-swipe, stale, future, or unverified tracker states. |
| `injection.stripOlderTrackerBlocks` | `true` | Swipe-isolated modes remove stale existing LTracker blocks before injecting. |
| `ownerPowerMode.enabled` | `false` | Global private-use Owner Power switch. Imported packs cannot turn it on. |
| `ownerPowerMode.allowRenderLabRuntime` | `false` | Allows interactive Render Lab testing when Owner Power is enabled. |
| `ownerPowerMode.allowInstalledPresetRuntime` | `false` | Reserved installed-preset runtime gate; keep off unless testing your own preset. |
| `ownerPowerMode.allowScriptBlocks` | `false` | Preserves script source as inert metadata only; it is not executed in this build. |
| `ownerPowerMode.allowTemplateActionHooks` | `true` | Enables LTracker-owned scoped declarative actions. |
| `ownerPowerMode.allowExternalUrls` | `false` | External URLs remain blocked by default. |
| `ownerPowerMode.allowNetwork` | `false` | Network access remains blocked by default. |
| `ownerPowerMode.allowHostDomAccess` | `false` | Host DOM access is unsupported and should stay off. |
| `ownerPowerMode.maxScriptChars` | `50000` | Import/export cap for inert Owner Power source metadata. |
| `ownerPowerMode.crashDisableThreshold` | `3` | Repeated runtime errors disable hooks when auto-disable is enabled. |

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
| `world_books` | Read-only activated world/lore metadata for tracker generation context. | Extra Lore Context still works manually. |
| `characters` | Read-only active character card context when enabled. | Manual Character Notes still work. |
| `personas` | Read-only active persona context when enabled. | Manual Persona Notes still work. |

## Troubleshooting

- Tracker too narrow: use Display -> Inline Wide and Expanded width mode `full_mobile` on phones or `wide` on desktop. If the host message bubble still constrains it, use Anchored Popover or Fullscreen Reader.
- Popover not opening: confirm Display is Anchored Popover, message display is enabled, and the compact LTracker pill is present for that message/swipe. Check Diagnostics -> Display / DOM for overlay and mount details.
- Preset import rejected: open Presets -> Import Review, confirm the file is a `.ltracker.json`, check import size limits, and validate the preset before installing. Fictional tracker fields named like secrets/tokens/credentials are allowed; real connection credentials in recommended settings are stripped with path-only warnings.
- Raw JSON appears in tracker: run Validate Preset or Render Lab. Direct `{{rel}}`, `{{pockets}}`, or `{{cast}}` interpolation should usually become `{{#each ...}}`, `{{chipList ...}}`, or `{{fieldChipList ...}}`.
- Template CSS stripped: use Trusted Mode for user-authored presets that need scoped CSS. Safe Mode removes style blocks by design.
- Tracker generated for wrong swipe: check Diagnostics -> Storage / history and Display / DOM. LTracker keys tracker state by chat, message, and swipe identity; missing exact state shows a generate control instead of silently falling back.
- Old tracker changed appearance: v0.19.2+ snapshots should use preset render locks. If a legacy snapshot has no lock and its original preset is unavailable, LTracker warns and falls back safely.

## Known Limitations

- Arbitrary preset JavaScript remains deferred; v0.26 ships inert runtime-source import/export and scoped declarative hooks.
- Sequential generation, partial regeneration, and Preset Authoring Studio 2.0 are lower-priority optional future items rather than active roadmap work.
- Full native World Book entry body ingestion is deferred until Lumiverse exposes a verified read API beyond activated entry metadata.
- Full native Character API integration remains read-only and depends on granted `characters` permission; manual notes are the fallback.
- DOM injection can only attach to mounted messages; drawer history covers unavailable messages.
- Some host themes may still constrain inline content. Inline wide records diagnostics for mount strategy and width constraints, and popover/fullscreen remain the reliable detached alternatives.
- Mobile QA warnings are heuristic and should be confirmed in the Render Lab at `360px` and `430px`.
- Embedded tracker tag mode only replaces or removes LTracker's own tag for the exact swipe key.
- Full orphan sidecar deletion is limited by available storage APIs; v0.24 reindexes discoverable sidecars and reports unknown-storage limitations instead of deleting blindly.
- Diagnostics may contain sensitive chat-derived prompt and model output when raw/prompt saving is enabled.

## Roadmap

1. `0.26.1 Prompt Injection Swipe Isolation + Stale Tracker Leak Fix`
2. `0.27 Preset Pack Collections / Advanced Export Polish`
3. `0.28 Final UX Polish / Stabilization`

### Optional Future / Backlog

- Sequential + Partial Regeneration
- Preset Authoring Studio 2.0
- Native World Book body integration pending verified Spindle support
- Native Character write/update integration remains out of scope
- Public marketplace hardening, if LTracker ever becomes public

## Attribution

LTracker is inspired by Zaakh/SillyTavern-zTracker and its tracker-oriented design. No zTracker source code is copied in version `0.26.1`. If future versions copy or adapt zTracker code, preserve the original MIT attribution and license notices.
