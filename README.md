# SignalX

AI-powered Signal desktop client. Native Tauri + React GUI on top of a Rust Signal daemon (`signal-cli` + optional Ollama drafts / guarded auto-reply).

## Quick start

1. Copy env config:
   ```bash
   cp .signalx.env.example .signalx.env
   # edit .signalx.env with your number and signal-cli config path
   ```

2. Run the GUI (default):
   ```bash
   npm install
   npm run tauri dev
   ```
   Or double-click `./SignalX-Dev.command` / run `./run-dev.sh`.

3. Headless daemon only (optional):
   ```bash
   cd src-tauri && cargo run -- --headless
   # or: SIGNALX_HEADLESS=1 cargo run
   ```

4. Optional AI setup (Ollama):
   ```bash
   ./scripts/setup-ai.sh
   ```

## What’s in the repo

| Path | Purpose |
|------|---------|
| `src/` | React messaging UI |
| `src-tauri/` | Rust daemon + Tauri commands (Signal CLI, threads, outbox, Ollama, auto-reply) |
| `scripts/` | Dev, test, and cleanup helpers |

## Docs

- [QUICKSTART.md](./docs/QUICKSTART.md) — setup and troubleshooting
- [BUILD.md](./docs/BUILD.md) — production builds

## Disk cleanup

```bash
./scripts/cleanup.sh
```

## Configuration

See `.signalx.env.example`. Never commit `.signalx.env` (contains your phone number).
