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
5. In-app device link (Settings → Device link QR + URI; CLI scripts under `scripts/` remain fallback)
6. Dark Bonsai shell + soft NotRegistered/setup banner + commerce/IVR AI + static copy polish
7. Order lifecycle (paid / fulfilled / cancelled), Outbox cockpit, outbound attachments (outbox-only)
8. Profile context rail + AI quick actions (Messages 4-column shell; orders-backed standing/ledger; suggest chips)

Backup/migrate design: `docs/superpowers/specs/2026-07-30-backup-migrate-design.md`

See `docs/superpowers/specs/2026-07-28-bonsai-shell-setup-ai-design.md`,
`docs/superpowers/specs/2026-07-31-profile-context-rail-design.md`, and
`docs/NEXT_STEPS.md`.
