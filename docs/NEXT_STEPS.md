# SignalX - Next Steps

GUI rebuild Phases 1–5 (shell, commands, messaging UI, AI draft, guarded
auto-reply) are in place. Foundation hardening pins the app to one Signal
account and one outbox send path.

## Remaining product work

1. ~~Menu responder (IVR)~~
2. ~~Catalog + customers~~
3. ~~Orders + invoices in-thread~~
4. ~~IVR order-taking~~ (menu v3: pick product # → qty → order + invoice via outbox)
5. ~~In-app device link~~ (Settings → Device link; `signal-cli link` IPC; scripts under `scripts/` as fallback)
6. ~~AI / IVR commerce copy polish~~ + dark Bonsai shell, soft setup banner, in-app QR
7. Order lifecycle (`paid` / `fulfilled` / `cancelled`) + Outbox cockpit + outbound attachments
8. ~~Profile context rail + AI quick actions~~ (Messages 4th column; orders-backed standing/ledger; `cmd_suggest_thread_actions`)
9. Backup / migrate — design in `docs/superpowers/specs/2026-07-30-backup-migrate-design.md` (implement next)

## Operator GUI notes

- Dark flat-gray modular shell (floated panels, work tabs, liquid-glass composer).
- Soft setup banner when config/number missing or `NotRegistered` → Settings → Device link.
- Settings tabs: System | Device link | IVR | Auto-reply; Device link shows QR + Copy URI.
- Orders: party name, status pills, explicit ordering-for target, primary Send invoice.
- Thread header shows when Menu IVR is armed but global is off.
- Messages: profile context rail (standing, notes, AI summary/actions, orders ledger, outbound media).

## Live IVR order smoke (manual)

1. Add ≥1 product with stock in Catalog.
2. Settings → IVR → enable Menu IVR + allowlist the buyer thread (or disable allowlist).
3. From another Signal device: `1` browse, `2` order → product # → qty.
4. Confirm invoice text arrives and Orders panel shows the order.

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
2. AI off: quick actions show commerce fallbacks; Summarize/Draft chips disabled or absent.
3. AI on (`./scripts/setup-ai.sh`): Refresh summary + Draft chip fills composer (does not send).
4. Link as customer → save notes; Mark paid / Invoice on a ledger row; Open orders filters this thread.