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

## Shipped product slices

1. Menu-style IVR responder (Signal IVR)
2. Catalog + customers
3. Orders + invoices (GUI + IVR place-order → invoice via outbox)
4. Operator GUI polish (Settings allowlists, order status clarity, IVR armed hints)
5. In-app device link (Settings → Device link; CLI scripts under `scripts/` remain fallback)
6. Next: optional AI polish for order/IVR copy

See `docs/superpowers/specs/2026-07-26-foundation-hardening-design.md` and
`docs/NEXT_STEPS.md`.
