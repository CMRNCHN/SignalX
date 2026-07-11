# SignalX - Next Steps

SignalX today is a working **headless Rust daemon** (Signal via `signal-cli`,
local thread persistence, outbox, optional Ollama drafting). The goal is to put a
native GUI back on top of that daemon without rewriting its logic.

## GUI rebuild plan

### Phase 1 - Restore the Tauri shell
- Add `tauri` + `tauri-build` deps to `src-tauri/Cargo.toml`; recreate `build.rs`,
  `tauri.conf.json`, `capabilities/default.json`, and app icons.
- Scaffold the frontend: `package.json`, `vite.config.ts`, `tsconfig*.json`,
  `index.html`, `src/main.tsx`, `src/App.tsx`, `@tauri-apps/api`.
- Recreate the `SignalX-Dev.command` / `run-dev.sh` flow for `tauri dev`.

### Phase 2 - Expose daemon logic as Tauri commands
- Wrap the existing handler functions as `#[tauri::command]`s, passing `AppState`
  via `tauri::State`. Bodies stay as-is (they already return `{success, data}`).
- Replace `run_headless` with a Tauri `setup` hook that spawns the receive loop
  and outbox worker on Tauri's runtime.
- Implement the currently-stubbed emit points with `AppHandle.emit` and emit a
  new-message event so the UI updates without polling.

### Phase 3 - Core messaging UI
- Account switcher + health badge (from `get_receive_loop_state` /
  `get_diagnostics`).
- Thread list, conversation view, composer that sends through the outbox with
  pending/failed/retry states.
- Live updates via event listeners; message search; contacts/groups panels;
  export buttons.

### Phase 4 - AI-assisted drafting (human sends)
- "Summarize" and "Draft reply" actions wired to `summarize_thread` /
  `draft_reply`; drafts land in the composer and never auto-send.
- AI status indicator with a graceful "AI not configured" state.

### Phase 5 - Opt-in auto-reply mode (guarded)
- Per-thread opt-in flag + global kill-switch, off by default, groups excluded.
- When a thread is opted-in AND AI is configured AND guardrails pass, the draft
  is enqueued to the outbox; otherwise it stays a draft.
- Guardrails: allowlist-only, rate limits, quiet hours, and an audit log.

## AI setup (optional)

```bash
./scripts/setup-ai.sh          # or manually:
brew install ollama
ollama serve
ollama pull qwen2.5:3b-instruct
```

Then set `SIGNALX_OLLAMA_MODEL` (and optionally `SIGNALX_OLLAMA_URL`) in
`.signalx.env`. Verify with `curl -s http://localhost:11434/api/tags`.
