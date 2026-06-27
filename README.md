# LTracker

Version: `0.01`

LTracker is a Lumiverse Spindle extension that creates a manual, per-chat tracker snapshot from recent chat messages. It is inspired by Zaakh/SillyTavern-zTracker's tracker concept, but this MVP is a fresh Lumiverse-native implementation and does not depend on SillyTavern APIs, globals, DOM selectors, templates, prompt builders, World Info APIs, connection profile APIs, or `generate_interceptor`.

## MVP Features

- Registers a Lumiverse drawer tab named `LTracker`.
- Registers an input-bar action named `Generate Tracker`.
- Reads the active chat id from the frontend context and sends it to the backend.
- Reads recent messages with `spindle.chat.getMessages()`.
- Builds a compact tracker extraction prompt.
- Calls `spindle.generate.quiet()` using the user's active/default generation connection.
- Parses model output as JSON with basic fenced-text and surrounding-text repair.
- Validates that the parsed tracker is an object.
- Saves the latest snapshot in per-user extension storage keyed by chat id.
- Displays status, latest snapshot JSON, and latest error in the drawer.

## Install And Development

```bash
npm install
npm run validate
```

Build output is written to `dist/backend.js` and `dist/frontend.js`, which are referenced by `spindle.json`.

## Permissions

| Permission | Used for | Degrade behavior |
| --- | --- | --- |
| `generation` | Calls `spindle.generate.quiet()` for manual tracker extraction. | Generate requests show a clear missing-permission error. |
| `chats` | Resolves the user's active chat through `spindle.chats.getActive()` when the frontend does not supply one. | Generate requests fall back to the frontend-supplied chat id or show a clear missing-permission error. |
| `chat_mutation` | Reads chat messages through `spindle.chat.getMessages()`. | Generate requests show a clear missing-permission error. |

Drawer tabs, input-bar actions, frontend/backend messaging, logging, toasts, and user storage are treated as free-tier surfaces in the inspected `lumiverse-spindle-types@0.5.21` API.

## Known Limitations

- Manual generation only; there is no auto mode yet.
- No context handler, interceptor, prompt injection, World Books, Memory Cortex, schema editor, per-field regeneration, cleanup/pending fields, or message-local widgets.
- The frontend sends the active `chatId` for responsiveness, and the backend can resolve the active chat with `spindle.chats.getActive(userId)` when needed.
- The MVP uses prompt-engineered JSON rather than provider-native structured output.
- If future Lumiverse API versions change generation, chat, or storage signatures, the thin backend adapters should be updated first.

## Roadmap

1. Auto mode after assistant messages with debounce and stale-job protection.
2. Compact cached snapshot injection through a context handler.
3. Optional interceptor mode for exact prompt placement.
4. Schema presets and schema editor.
5. Sequential generation, per-section regeneration, and per-field regeneration.
6. Cleanup/pending field workflows.
7. World Book allowlists and character exclusions after permissions/API verification.
8. Diagnostics and export/import flows.

## Attribution

LTracker is inspired by Zaakh/SillyTavern-zTracker and its tracker-oriented design. No zTracker source code is copied in version `0.01`. If future versions copy or adapt zTracker code, preserve the original MIT attribution and license notices.
