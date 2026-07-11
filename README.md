# SignalX

Headless Signal backend: receives messages via signal-cli, persists threads locally, processes outbox sends, and optional AI agent drafts via Ollama.

No GUI — run as a background daemon.

## Quick start

1. Copy env config:
   ```bash
   cp .signalx.env.example .signalx.env
   # edit .signalx.env with your number and signal-cli config path
   ```

2. Build and run:
   ```bash
   cd src-tauri && cargo run
   ```
   Or: `./SignalX-Dev.command` / `./run-dev.sh`

3. Optional AI agent mode (auto-draft incoming messages):
   ```bash
   SIGNALX_AGENT=1 cargo run
   # or: cargo run -- --agent
   ```

4. Optional AI setup:
   ```bash
   ./scripts/setup-ai.sh
   ```

## What’s in the repo

| Path | Purpose |
|------|---------|
| `src-tauri/` | Rust daemon (Signal CLI, threads, outbox, Ollama) |
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
