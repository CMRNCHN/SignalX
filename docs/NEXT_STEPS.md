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
6. AI polish (optional) — drafts already work; tighten copy for order/IVR flows later

## Operator GUI notes

- Settings: System card + Device link + actionable IVR/auto-reply allowlists (“Add current chat” / Remove).
- Orders: party name, status pills, explicit ordering-for target, primary Send invoice.
- Thread header shows when Menu IVR is armed but global is off.

## Live IVR order smoke (manual)

1. Add ≥1 product with stock in Catalog.
2. Settings → enable Menu IVR + allowlist the buyer thread (or disable allowlist).
3. From another Signal device: `1` browse, `2` order → product # → qty.
4. Confirm invoice text arrives and Orders panel shows the order.

## Device link smoke (manual)

1. Ensure `.signalx.env` has `SIGNALX_SIGNALCLI_CONFIG` (and a usable `signal-cli`).
2. Settings → Device link → Start linking.
3. Copy the `sgnl://linkdevice…` URI (or paste into a QR tool) and scan from Signal → Linked devices.
4. Wait for success; set `SIGNALX_NUMBER` if first link, then restart the app so receive/outbox start.

## AI setup (optional)

```bash
./scripts/setup-ai.sh
# set SIGNALX_OLLAMA_MODEL in .signalx.env
```
