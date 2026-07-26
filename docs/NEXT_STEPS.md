# SignalX - Next Steps

GUI rebuild Phases 1–5 (shell, commands, messaging UI, AI draft, guarded
auto-reply) are in place. Foundation hardening pins the app to one Signal
account and one outbox send path.

## Remaining product work

1. ~~Menu responder (IVR)~~ — shipped (text menus, handoff, allowlist)
2. **Catalog + customers** — local products + customers tied to Signal contacts
3. **Orders + invoices in-thread**
4. **AI polish** on commerce flows

## AI setup (optional)

```bash
./scripts/setup-ai.sh
# set SIGNALX_OLLAMA_MODEL in .signalx.env
```
