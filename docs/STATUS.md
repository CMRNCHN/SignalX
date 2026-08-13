# SignalX - Status

SignalX is a single-number Signal desktop client: messenger, optional local AI
drafts / guarded auto-reply, with a Tauri + React GUI on a Rust daemon
(`signal-cli` + optional Ollama). Local sales console: catalog, IVR menus,
quotes/orders/invoices, inventory, and Sales summary — all outbox-gated.

## Current reality

- **Local desktop app is the product.** `./run-dev.sh`, `./SignalX-Dev.command`, or
  `npm run desktop` opens the Tauri window (Vite is only the UI host inside that shell).
- **`npm run ui`** is a browser layout preview — no Signal backend / IPC.
- Requires **Rust ≥ 1.88** (`rust-toolchain.toml` pins it). Older Cargo fails on current crates.
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
9. Backup / migrate v1 (Settings → System; zip export/import of app data; restart required after import)
10. IVR commerce editor (menus IPC + Settings JSON editor; `order_status`; hide zero-stock)
11. Quotes / draft orders (no stock until Confirm; Send quote vs Send invoice)
12. Inventory ops (stock adjust + ledger, low-stock threshold, CSV import/export)
13. Sales console (Sales nav, totals/top products, commerce audit, Duplicate as draft)

See `docs/NEXT_STEPS.md` for smoke checklists and the long-term backlog.
