# SignalX - Status

SignalX is a desktop Signal client with AI-assisted replies. It is built on
`signal-cli` for messaging and an optional local Ollama model for drafting.

## Current reality

- **Rust daemon (`src-tauri/src/main.rs`)** works headless today. It runs its own
  Tokio runtime, drives `signal-cli` to receive/send, persists threads to disk,
  processes an outbox, and can auto-draft replies via Ollama.
- The daemon already contains the full command surface as plain functions that
  return `{success, data}` JSON: threads, messages, send, search, contacts,
  groups, aliases, export, `summarize_thread`, `draft_reply`, diagnostics, etc.
- **There is no GUI right now.** The previous Tauri + React frontend (and its
  `tauri.conf.json`, `build.rs`, icons, capabilities) were deleted. Real-time
  event emit points in the daemon are currently no-op stubs.

## Target architecture

A single native macOS app: a **Tauri + React frontend** on top of the existing
Rust daemon. The daemon logic stays intact; Tauri becomes the transport (command
wrappers) and the runtime host, emitting live events to the UI.

```
React UI  --invoke-->  #[tauri::command] wrappers  -->  existing daemon handlers
   ^                                                        |
   +----------------- AppHandle emit (new msg / outbox) <---+
                                                     signal-cli + Ollama
```

## What runs today

```bash
cd src-tauri && cargo run          # headless daemon
SIGNALX_AGENT=1 cargo run           # with AI auto-draft mode
```

Config lives in `.signalx.env` (see `.signalx.env.example`) and covers only
`signal-cli` and Ollama.

## Next

The GUI rebuild is planned in phases: restore the Tauri shell, wrap the daemon
handlers as Tauri commands, build the core messaging UI, wire AI-assisted
drafting, then add an opt-in guarded auto-reply mode. See `NEXT_STEPS.md`.
