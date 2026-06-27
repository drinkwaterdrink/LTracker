# Changelog

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
