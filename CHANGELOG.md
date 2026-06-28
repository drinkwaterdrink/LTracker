# Changelog

## 0.19 - Trusted Renderer Freedom / Power Template Compatibility
- Added Trusted Mode support for scoped style blocks.
- Added Safe Mode behavior that removes full style blocks without leaking raw CSS text.
- Added Trusted Mode support for safe inline SVG icons and ornaments.
- Added Handlebars-style conditionals and basic helpers.
- Improved template validation to understand data-prefixed paths, loop context, and `this`.
- Added renderer requirement detection during preset import review.
- Kept JavaScript disabled outside future explicit Dev Mode.
- Fixed stale README 0.17 references and connection default documentation.
- Preserved existing 0.18 popover, fullscreen reader, and selected tracker profile behavior.

## 0.18 - Display Width, Popover, Fullscreen Reader, and Connection UX Simplification
- Simplified Tracker Connection UI, hiding raw technical modes behind an Advanced Parameters details panel and exposing human-readable Tracker Profile selection.
- Configured default connection mode to use the selected profile with raw parameters (`selected_connection_raw`), with automatic fallback to active roleplay connection (`active_quiet`).
- Implemented floating Popover display surface that opens overlays next to trigger summaries on desktop, falling back to centered sheet modals on mobile viewports.
- Implemented full viewport Fullscreen Reader display surface with clean meta details and action controls.
- Configured global Escape key event handler and popover backdrop close listeners for overlay dismissal.
- Added Display Surface Preview / Testing buttons directly in the Display settings panel.
- Wrapped template HTML in overflow-x: auto scroll containers to prevent wide layouts from clipping or causing horizontal overflow inside chat bubbles.
- Documented import limits (10,000,000 Normal / 50,000,000 Ultra) in the README.

## 0.17 - Preset Pack Import/Export + Better Validation
- Added portable `.ltracker.json` Preset Pack format containing preset properties, recommended settings, and optional example snapshot.
- Added Export Preset Pack action with optional recommended settings and example snapshot.
- Added Import Preset Pack file/pasted UI with Import Review showing meta, preset properties, trust mode, and recommended settings toggle.
- Upgraded preset validation to generate a diagnostic report showing passes, warnings, errors, estimates, missing placeholders, and sanitizer warnings.
- Added Sample Snapshot Generator that yields bounded mockup snapshots (max depth 5, array length 2) for rendering templates.
- Bumped internal extension version to 0.17.

## 0.16 - Stabilization, performance, and safety hardening
- Bounded tracker memory snapshot loading so long chats do not trigger unbounded sequential storage reads.
- Added candidate selection, deduplication, concurrency limiting, and diagnostics for tracker memory loads.
- Added hard timeout and stale-job eviction for tracker generation jobs.
- Moved static DOM tracker CSS toward a single global stylesheet injection to avoid duplicate style blocks per message.
- Added delete confirmation for inline and drawer tracker deletion.
- Added optional undo restore only if implemented safely.
- Hardened sanitizer and embedded LTracker tag parsing without disabling Trusted Preset Mode.
- Added preset/import size guards with Ultra Mode-aware warnings.
- Added history paging and storage maintenance groundwork.
- Grouped diagnostics into readable categories.
- Preserved 0.15 Trusted Preset, DOM injection, Ultra Mode, connection, memory, and prompt injection behavior.

## 0.15 - Auto timing, drawer UX, and power defaults
- Added assistant finalization gating so auto tracker generation waits until swipe/regenerate output is complete.
- Added stable-content checks and settle delay before tracker extraction.
- Added cancellation of pending tracker jobs when selected swipe changes before finalization.
- Renamed user-facing debounce wording to "Wait after message finishes."
- Made Trusted Preset Mode the default template behavior.
- Enabled sanitized inline styles by default for trusted user-authored presets.
- Hid the sanitized inline style checkbox from the main UI.
- Made DOM injection the primary/default message display engine.
- Hid iframe fallback in Advanced/Legacy and made it off by default.
- Added token-aware budget UI and Ultra Tracker Mode for very large tracker presets.
- Raised soft limits for large zTracker-style schemas and outputs.
- Added expanded tracker width modes.
- Redesigned the drawer into Dashboard, Generation, Auto, Connection, Display, Renderer, Memory/Injection, Presets, History, Diagnostics, and Advanced sections.
- Improved Message Tracker History grouping, filtering, duplicate handling, and compact preview.
- Centralized autosave status in the drawer header.

## 0.14 - Tracker memory and safe prompt injection
- Added tracker memory settings for retaining recent prior tracker snapshots.
- Added default last-3 tracker memory for tracker generation.
- Added sunset controls for full prior snapshots and future compact older memory.
- Updated tracker prompt building so prior tracker states can be used as baseline memory.
- Added instructions to mutate from the most recent prior tracker state while preserving stable unchanged fields.
- Added safe interceptor-based normal prompt injection, separate from disabled context-handler injection.
- Added retained tracker block stripping and backfill from sidecar/embedded tracker history.
- Added compact, minimal, pretty JSON, and embedded-tag injection formats.
- Added memory and interceptor diagnostics.
- Added frozen-object regression tests to avoid readonly host object mutation.
- Updated README to distinguish Tracker Memory from normal Prompt Injection.

## 0.13 - Connection settings
- Added tracker connection settings with active/default, selected quiet, and selected raw generation modes.
- Added connection profile listing, refresh, and selected profile storage.
- Added tracker-specific generation parameters.
- Added tracker reasoning override controls.
- Added Test Tracker Connection action with duration, output preview, finish reason, usage, and cancellation.
- Applied connection settings to manual, auto, per-message generate, and per-message regenerate tracker jobs.
- Added connection fallback diagnostics.
- Added optional preset recommended connection metadata groundwork.
- Updated README with tracker connection guidance and recommended starting settings.

## 0.12 - Message control bar and generation UX
- Replaced bulky message tracker indicators with a compact message control pill.
- Hid swipe key/index text by default behind a debug setting.
- Added optional generate button for visible assistant messages without trackers.
- Moved regenerate, edit/view, and delete into the expanded tracker header as small icon-only controls.
- Removed large bottom action buttons from inline tracker displays.
- Made regenerate feedback instant with spinner/elapsed timer state before backend completion.
- Made the regenerate icon act as stop/cancel while a tracker job is running.
- Added compact/comfortable control density settings.
- Added native toolbar support detection with safe fallback to an in-message control pill.
- Added diagnostics for message control rendering and inline actions.
- Updated README roadmap and template capability model.

## 0.11 - Render fidelity and embedded tracker tags
- Expanded sanitized inline style support for richer zTracker-like HTML templates in message displays.
- Added render-warning deduplication and warning caps so noisy templates stay inspectable in diagnostics.
- Allowed `<details open>` only on `<details>` and kept other unsafe attributes stripped.
- Added embedded tracker tag mode with `<ltracker type="state" version="0.11" swipe="...">` blocks.
- Added exact-swipe embedded tag upsert/removal using `spindle.chat.updateMessage()` only when embedded mode is enabled.
- Added a Lumiverse message tag interceptor that hides raw LTracker tags and renders from the intercepted exact message payload.
- Added sidecar, embedded, and both attachment modes.
- Added full inline, button popover, and drawer-history-only display modes.
- Improved top/bottom DOM injection by resolving a message body/bubble mount point before falling back to the full message element.
- Replaced the manual Save Settings button with debounced autosave and an explicit Reset Settings action.
- Added diagnostics for placement resolution, mount strategy, embedded tag writes, and tag interception.
- Added tests for embedded tag exact-swipe replacement/removal, sanitizer fidelity, settings repair, autosave UI, and README coverage.

## 0.10 - Top swipe tracker controls
- Added swipe-aware message tracker storage keyed by chat id, message id, and selected swipe key.
- Added official Lumiverse DOM injection as the primary compact message tracker renderer.
- Added top-of-message tracker placement with iframe widget fallback when DOM injection is unavailable.
- Added icon-only regenerate/cancel, edit/view, and delete controls per message swipe.
- Added an edit/view modal with rendered preview, JSON, text, HTML, metadata, and edited snapshot saves.
- Added precise per-swipe delete behavior that removes only the selected message/swipe tracker.
- Added swipe navigation and swipe edit event handling for auto tracker refreshes.
- Added message display settings for DOM injection, iframe fallback, compact collapse, edit/delete controls, missing-swipe state, and minimized iframe height.
- Added diagnostics for DOM injection, swipe detection, active tracker jobs, edits, deletes, and renderer fallback.
- Added tests for swipe identity, per-swipe storage/indexing, DOM tracker HTML, selected-swipe filtering, settings migration, and README coverage.

## 0.09 - Message widget UX polish
- Removed bulky setting explanations from the drawer UI and moved detailed setting documentation to README.
- Audited message widget placement and resolved top/bottom behavior according to official Lumiverse APIs.
- Made message tracker widgets more compact.
- Removed copy buttons from message widgets by default.
- Added icon-only per-message tracker regeneration control.
- Added cancellation support for in-progress tracker regeneration where supported.
- Added generation duration metadata and display.
- Added message widget and regeneration diagnostics.
- Added tests for setting migration, compact widgets, regeneration, cancellation, elapsed time, and README setting coverage.

## 0.08 - Visible message tracker blocks
- Added persistent message-attached tracker display groundwork.
- Added message snapshot index storage.
- Added preset metadata to tracker snapshots.
- Added message display settings.
- Added visible message tracker rendering when supported by Lumiverse message-local UI APIs.
- Added drawer-based Message Tracker History fallback when message-local rendering is unavailable.
- Added concise drawer help text for confusing settings.
- Expanded README with a full settings reference.
- Added diagnostics for message display support and hydration.
- Added tests for message display settings, snapshot indexing, fallback rendering, and snapshot compatibility.

## 0.07 - Readonly generation hotfix
- Fixed a blocker where enabling LTracker could cause normal Lumiverse generations to fail with `Attempted to assign to readonly property`.
- Made context-handler injection fail-safe.
- Removed side effects from the context handler path.
- Added frozen-object regression tests for context handling.
- Added diagnostics for context handler registration, disabled state, and errors.
- Preserved schema presets and drawer-only HTML renderer behavior.

## 0.06 - Safe HTML template renderer
- Added safe HTML template rendering for drawer previews.
- Added basic zTracker-style template placeholders and each-blocks.
- Added sanitizer for rendered tracker HTML.
- Added rendered tracker preview section in the drawer.
- Added renderer settings.
- Added render diagnostics.
- Added tests for template rendering, escaping, sanitization, fallback behavior, and renderer settings.

## 0.05 - Schema presets
- Added tracker schema preset data model.
- Converted the default tracker schema into a built-in preset.
- Added per-chat selected preset state.
- Added preset-aware prompt building.
- Added Schema Presets drawer UI.
- Added zTracker-style JSON Schema, HTML Template, and Prompt Instructions boxes.
- Added preset import/export.
- Added preset diagnostics.
- Added tests for preset validation, import/export, fallback behavior, and prompt construction.

## 0.04 - Context handler injection
- Added optional cached tracker snapshot injection.
- Added injection settings and drawer controls.
- Added compact, minimal, and pretty JSON snapshot formatters.
- Added injection diagnostics and preview.
- Added safeguards so LTracker tracker-generation prompts do not receive LTracker injection.
- Added tests for injection settings and snapshot formatting.

## 0.03 - Auto mode and message-attached snapshots
- Added Auto Mode settings for enablement, debounce, first-message skipping, assistant/user triggers, active-chat-only behavior, and message snapshot attachment.
- Added backend event subscriptions for generation completion, message-sent fallback, chat switching, and extension unload cleanup.
- Added one pending auto timer per user/chat and a guard against starting auto tracker generation while a tracker job is already running.
- Added storage-only message-attached tracker snapshots keyed by chat id and message id.
- Added auto mode and message snapshot diagnostics to the drawer.
- Added tests for auto setting repair, scheduling decisions, quiet-generation filtering, and message snapshot storage keys.

## 0.02 - MVP hardening and diagnostics
- Added diagnostics panel.
- Added generator settings.
- Added prompt and raw-output preview.
- Added clear current chat snapshot action.
- Hardened stale-job and cancellation handling.
- Added structured error diagnostics.
- Added parser and prompt tests.
- Updated validation to run tests.

## 0.01 - Initial MVP scaffold
- Created initial Lumiverse Spindle extension scaffold.
- Added LTracker drawer tab.
- Added Generate Tracker input-bar action.
- Added manual tracker generation flow.
- Added default tracker schema.
- Added JSON parsing and basic repair.
- Added per-chat snapshot storage.
- Added README and changelog.
