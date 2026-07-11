#!/bin/zsh
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG="$ROOT/run-dev.command.log"

echo "=== SignalX dev (Tauri + Vite) ===" | tee "$LOG"
date | tee -a "$LOG"
echo "Project: $ROOT" | tee -a "$LOG"

cd "$ROOT"

if ! command -v cargo >/dev/null 2>&1; then
  echo "ERROR: cargo not found (install Rust: https://rustup.rs)" | tee -a "$LOG"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found (install Node.js: https://nodejs.org)" | tee -a "$LOG"
  exit 1
fi

# Load local config (signal-cli + Ollama) if present.
if [[ -f "$ROOT/.signalx.env" ]]; then
  set -a
  source "$ROOT/.signalx.env"
  set +a
fi

# Install frontend deps on first run.
if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "Installing frontend dependencies..." | tee -a "$LOG"
  npm install 2>&1 | tee -a "$LOG"
fi

echo "Starting SignalX (Ctrl+C to stop)..." | tee -a "$LOG"
npm run tauri dev 2>&1 | tee -a "$LOG"
