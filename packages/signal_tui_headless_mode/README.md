# SignalX Cursor Pack

These packs are scaffolds to drop into your existing SignalX repo and apply with Cursor.
Designed to be feature-flagged and safe-by-default.

Guardrails
- Draft-first: anything that sends must be explicitly enabled by a feature flag and visible in UI.
- No credentials in code: use .signalx.env / OS keychain later.
- Keep automation opt-in and per-thread/per-contact.


## Pack: TUI / Headless Mode
Date: 2025-12-23

Adds:
- Node-based headless runner + minimal TUI (blessed)
- Designed for operator workflow; expects your backend running locally.

Included:
- cli/package.json
- cli/src/index.ts
- cli/src/ui.ts
- docs/tui_headless.md
