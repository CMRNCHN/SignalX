# SignalX - Handoff

## Where things stand

- **Working today:** a headless Rust daemon (`src-tauri/src/main.rs`) that uses
  `signal-cli` to receive/send Signal messages, persists threads to disk, runs an
  outbox worker, and can auto-draft replies via a local Ollama model.
- **Not present:** a GUI. The prior Tauri + React frontend, `tauri.conf.json`,
  `build.rs`, icons, and capabilities were deleted. The daemon's real-time event
  emit points are currently no-op stubs.
- **Goal:** rebuild a Tauri + React desktop client on top of the existing daemon,
  reusing its handler functions (see `NEXT_STEPS.md` for the phase plan).

## Run it

```bash
cd src-tauri && cargo run          # headless daemon
SIGNALX_AGENT=1 cargo run           # with AI auto-draft mode
```

Config: `.signalx.env` (copy from `.signalx.env.example`). Keys cover only
`signal-cli` and Ollama:

- `SIGNALX_SIGNALCLI_CONFIG` - signal-cli config path
- `SIGNALX_NUMBER` - your Signal phone number
- `SIGNALX_SIGNALCLI_BIN` - (optional) path to signal-cli binary
- `SIGNALX_OLLAMA_MODEL` / `SIGNALX_OLLAMA_URL` - (optional) local Ollama

Never commit `.signalx.env` (contains your phone number).

## The daemon command surface (to be wrapped by the GUI)

The daemon exposes plain functions returning `{success, data}` / `{success,
error}` JSON. These are what the future Tauri commands should wrap:

- Threads/messages: `get_threads`, `get_thread_messages`, `send_message`,
  `search_messages`
- Contacts/groups/aliases and export helpers
- Diagnostics/health: `get_receive_loop_state`, `get_diagnostics`
- AI: `summarize_thread`, `draft_reply`, `check_ai_status`

## Conventions to maintain in the rebuild

1. **Daemon is source of truth** for messages — no localStorage canonical state.
2. **Event-driven, no polling** — implement the stubbed emit points via
   `AppHandle.emit` (new-message and outbox-status events).
3. **API shape** — commands return `{success: true, data}` or
   `{success: false, error}`.
4. **AI never auto-sends** in assisted mode; auto-reply is a separate, opt-in,
   guarded mode (Phase 5).

See `STATUS.md` for current state and `NEXT_STEPS.md` for the phased plan.
