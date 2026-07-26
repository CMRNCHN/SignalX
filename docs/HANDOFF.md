# SignalX - Handoff

## Where things stand

- **Working today:** Tauri + React GUI over a Rust Signal daemon (`signal-cli`),
  local thread persistence, outbox worker, optional Ollama drafts and guarded
  auto-reply.
- **Identity:** single account from `.signalx.env` — no multi-account UI.
- **Send path:** all outbound messages go through the outbox.
- **Next:** IVR menu responder, then catalog/customers, then orders/invoices.

## Run it

```bash
cp .signalx.env.example .signalx.env   # edit number + signal-cli config path
npm install
npm run tauri dev
# or: ./run-dev.sh / ./SignalX-Dev.command

# headless (optional):
cd src-tauri && cargo run -- --headless
SIGNALX_AGENT=1 cargo run -- --headless   # AI drafts on inbound
```

Config keys: `SIGNALX_SIGNALCLI_CONFIG`, `SIGNALX_NUMBER`, optional
`SIGNALX_SIGNALCLI_BIN`, `SIGNALX_OLLAMA_*`. Never commit `.signalx.env`.

## Conventions

1. Daemon is source of truth for messages — no localStorage canonical state.
2. Event-driven UI updates via `AppHandle.emit`.
3. Commands return `{success: true, data}` or `{success: false, error}`.
4. AI never auto-sends in assisted mode; auto-reply is separate, opt-in, guarded.
