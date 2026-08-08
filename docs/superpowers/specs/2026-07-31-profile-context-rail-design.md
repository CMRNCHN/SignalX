# Profile context rail + AI quick actions

## Goal

When a Messages thread is selected, the shell becomes four columns (rail · thread list · chat · **profile rail ~300px**) so the operator can see contact/customer identity, order standing, an AI summary, quick action chips, an orders ledger, and outbound/product media — a thin local-first CRM without a new payment system or inbound media gallery.

## Locked defaults

- Profile rail shows only for `panel === threads` with a selected thread. Hidden on Catalog / Orders / Settings / Outbox / etc.
- Ledger, standing, and history are **derived from existing Orders** for that `thread_id` / linked customer. No separate ledger DB in v1.
- Media: outbound outbox `attachment_path` for the thread + product images from order lines. Inbound Signal media gallery is out of scope.
- AI suggestions never auto-send. Click runs a known action or fills the composer. If Ollama is unconfigured, show static fallbacks (Summarize/Draft disabled when AI off; Open orders, Link customer, Send latest invoice when applicable).

## UI sections (top → bottom)

1. **Identity** — avatar initials, display name, thread id, favorite/mute, link/open customer.
2. **Standing** — `Good` / `Open balance` / `At risk` / `New` from order statuses; lifetime spend (paid+fulfilled) and open amount.
3. **Notes** — editable `Customer.notes` via upsert (requires linked customer).
4. **AI summary** — Refresh → `cmd_summarize_thread`; session cache per `thread_id` in React state.
5. **AI quick actions** — 3–5 chips from `cmd_suggest_thread_actions`.
6. **Ledger** — orders for thread; Mark paid / Invoice shortcuts; View all → Orders filtered to this thread.
7. **Media** — outbox attachment thumbs + product image thumbs.

## Backend: `cmd_suggest_thread_actions`

- Input: `thread_id`, optional `last_n`.
- Builds short thread context + light commerce snapshot (order count, open total, last status, customer linked). No full catalog dump.
- Allowlisted `kind`: `draft`, `summarize`, `send_invoice`, `mark_paid`, `open_orders`, `link_customer`, `compose`.
- Strict JSON parse; on failure or AI off → curated commerce fallbacks.

## Non-goals (v1)

- Inbound Signal attachment gallery / CDN sync
- Separate accounting ledger, payments, credit limits
- Multi-account CRM, tags graph, timeline beyond orders
- Auto-send from AI chips

## Files

- `src/ProfileRail.tsx`, `src/App.tsx`, `src/styles.css`, `src/api.ts`
- `src-tauri/src/lib.rs` (`suggest_thread_actions` / `cmd_suggest_thread_actions`)
