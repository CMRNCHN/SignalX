# SignalX - Next Steps

GUI rebuild Phases 1–5 (shell, commands, messaging UI, AI draft, guarded
auto-reply) are in place. Foundation hardening pins the app to one Signal
account and one outbox send path.

Commerce-depth Phases 1–4 (below) are implemented: IVR menu editor, quotes/drafts,
inventory ops, and Sales console.

## Shipped product work (Phases 1–9 + commerce depth)

1. ~~Menu responder (IVR)~~
2. ~~Catalog + customers~~
3. ~~Orders + invoices in-thread~~
4. ~~IVR order-taking~~ (menu v3: pick product # → qty → order + invoice via outbox)
5. ~~In-app device link~~ (Settings → Device link; `signal-cli link` IPC; scripts under `scripts/` as fallback)
6. ~~AI / IVR commerce copy polish~~ + dark Bonsai shell, soft setup banner, in-app QR
7. ~~Order lifecycle (`paid` / `fulfilled` / `cancelled`) + Outbox cockpit + outbound attachments~~
8. ~~Profile context rail + AI quick actions~~ (Messages 4th column; orders-backed standing/ledger; `cmd_suggest_thread_actions`)
9. ~~Backup / migrate~~ (Settings → System; `cmd_export_data_bundle` / `cmd_import_data_bundle`)
10. ~~IVR commerce editor~~ (Settings → IVR menus JSON; `order_status`; hide zero-stock)
11. ~~Quotes / draft orders~~ (Create quote → Send quote → Confirm; stock decrements on confirm only)
12. ~~Inventory ops~~ (stock ± with reason, low-stock threshold + filter, CSV import/export)
13. ~~Sales console~~ (Sales nav: totals / top products / commerce audit; Duplicate as draft)

## Operator GUI notes

- Dark flat-gray modular shell (floated panels, work tabs, liquid-glass composer).
- Soft setup banner when config/number missing or `NotRegistered` → Settings → Account.
- Settings tabs: Account | IVR | Auto-reply | Backup; Account combines status + device link QR.
- IVR: master switch, allowlist, hide zero-stock, menus JSON editor (Save / Reset demo / Preview).
- Orders: Place order (confirmed) or Create quote (draft); draft → Send quote / Confirm / Edit qty.
- Catalog: low-stock threshold, ± stock adjust, Below threshold filter, CSV export/import.
- Sales: period + status filters, revenue totals, top products, commerce audit, Reorder → draft.
- Thread header shows when Menu IVR is armed but global is off.
- Messages: profile context rail (standing with 7-day At risk, notes, AI, ledger, Send quote).
- Settings → System → Backup: export/import data bundle (zip); chat-only export unchanged.

## Long-term backlog (not next)

**Messenger completeness**
- Inbound Signal attachments (persist + render; profile rail Media)
- Multi-file outbound / voice notes
- Contact photos + real Apple Contacts
- Keyboard shortcuts
- Refresh `figma-handoff/` to 4-column + Outbox + Backup + Sales

**Operator reliability**
- Unified Audit panel (IVR + commerce + outbox + auto-reply)
- Backup v2: encrypted zip, scheduled local backups, optional identity-pack
- Packaging / signed macOS build / launcher polish

**AI / automation**
- Rule-based workflows (keyword / time → outbox template)
- Scheduled outbound messages
- Richer guarded auto-reply policies

**Stretch**
- TUI mode (`--tui`)
- External inventory webhooks beyond CSV
- Payment processor (only if explicitly reopened)

**Still rejected**
- Multi-account switcher
- Native Signal bot buttons as primary IVR
- Auto-send from AI chips

## Live IVR order smoke (manual)

1. Add ≥1 product with stock in Catalog.
2. Settings → IVR → enable Menu IVR + allowlist the buyer thread (or disable allowlist).
3. From another Signal device: `1` browse, `2` order → product # → qty; `4` check order.
4. Confirm invoice text arrives and Orders panel shows the order.

## Quotes smoke (manual)

1. Orders → Create quote on a DM → status `draft` (stock unchanged).
2. Send quote → Confirm → stock decrements once; Send invoice works after confirm.

## Inventory / Sales smoke (manual)

1. Catalog → set low-stock threshold → Adjust −1 → filter Below threshold.
2. Export CSV → tweak a row → Import dry-run → Import confirm.
3. Sales → Last 30 days → see totals; Reorder → new draft.

## Device link smoke (manual)

1. Ensure `.signalx.env` has `SIGNALX_SIGNALCLI_CONFIG` (and a usable `signal-cli`).
2. If the rail shows **Link this Mac**, open it (or Settings → Device link).
3. Start linking → scan the in-app QR from Signal → Linked devices (or Copy URI).
4. Wait for LINKED; set `SIGNALX_NUMBER` if first link, then restart so receive/outbox start.

## AI setup (optional)

```bash
./scripts/setup-ai.sh
# set SIGNALX_OLLAMA_MODEL in .signalx.env
```

Draft reply uses a commerce/IVR-aware prompt; still fills composer only (never auto-sends).

## Profile rail smoke (manual)

1. Messages → open a DM → confirm 4th column (identity, standing, ledger, media).
2. Draft on thread: Send latest quote chip; stale confirmed (>7d) → At risk.
3. AI off: quick actions show commerce fallbacks; Summarize/Draft chips disabled or absent.
4. AI on (`./scripts/setup-ai.sh`): Refresh summary + Draft chip fills composer (does not send).

## Backup / migrate smoke (manual)

1. Settings → System → Backup → **Export data bundle** → confirm zip under app `exports/` opens.
2. Optionally wipe or use a copy of app data; **Import** with Replace → confirm → Quit now → reopen.
3. Catalog, customers, orders, IVR settings, and threads match the bundle; `.signalx.env` / signal-cli were not required inside the zip.
4. Merge smoke: export, change a product name locally, import Merge with overlapping product id → incoming upserts; messages with same id keep local content.
5. Rail **Export chat** still exports messages-only (unchanged).
