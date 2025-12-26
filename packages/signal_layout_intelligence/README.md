# SignalX Cursor Pack

These packs are scaffolds to drop into your existing SignalX repo and apply with Cursor.
Designed to be feature-flagged and safe-by-default.

Guardrails
- Draft-first: anything that sends must be explicitly enabled by a feature flag and visible in UI.
- No credentials in code: use .signalx.env / OS keychain later.
- Keep automation opt-in and per-thread/per-contact.


## Pack: Layout Intelligence
Date: 2025-12-23

Adds:
- Persistent workspace layout model (panel sizes, collapsed sections, density, contrast).
- Snap points + double-click reset.
- Layout Store: localStorage persistence + optional backend file persistence later.

Integration points:
- src/App.tsx (root layout grid)
- Sidebar / Threads / Chat / ToolsPanel

Included:
- src/layout/layoutStore.ts
- src/layout/resizer.ts
- src/layout/snapPoints.ts
- docs/layout_intelligence.md

Cursor instructions:
1) Add files.
2) Wire layoutStore into App root (apply datasets; persist on change).
3) Replace resize logic with resizer.ts and snap points.
4) Add ToolsPanel controls for workspace/density/contrast and Reset.
