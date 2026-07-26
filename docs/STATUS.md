# SignalX - Status

SignalX is a single-number Signal desktop client: messenger, optional local AI
drafts / guarded auto-reply, with a Tauri + React GUI on a Rust daemon
(`signal-cli` + optional Ollama).

## Current reality

- **GUI is the default.** `npm run tauri dev` (or `./run-dev.sh`) starts the app.
- **One Signal account** from `.signalx.env` (`SIGNALX_NUMBER` +
  `SIGNALX_SIGNALCLI_CONFIG`). There is no account switcher.
- Storage keys use a sanitized form of the number; orphan JSON files under other
  stems on disk are ignored, not deleted.
- **Outbox is the only send path** (queue → retry → signal-cli).
- Headless mode remains available: `cd src-tauri && cargo run -- --headless`

## Next product slices

1. Menu-style IVR responder (Signal IVR)
2. Catalog + customers
3. Orders + invoices in-thread
4. AI polish on those flows

See `docs/superpowers/specs/2026-07-26-foundation-hardening-design.md` and
`docs/NEXT_STEPS.md`.
