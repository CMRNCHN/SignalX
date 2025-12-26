# SignalX Cursor Pack

These packs are scaffolds to drop into your existing SignalX repo and apply with Cursor.
Designed to be feature-flagged and safe-by-default.

Guardrails
- Draft-first: anything that sends must be explicitly enabled by a feature flag and visible in UI.
- No credentials in code: use .signalx.env / OS keychain later.
- Keep automation opt-in and per-thread/per-contact.


## Pack: Automation Scaffolding
Date: 2025-12-23

Adds:
- Rule engine scaffold (draft-only default)
- Draft pipeline + Outbox model (explicit consent for any auto-send)
- Single place to add integrations later

Included:
- src/automation/types.ts
- src/automation/rules.ts
- src/automation/engine.ts
- src/automation/outbox.ts
- docs/automation_scaffolding.md
