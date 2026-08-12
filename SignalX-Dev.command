#!/bin/zsh
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG="$ROOT/run-dev.command.log"

echo "=== SignalX desktop (Tauri + Vite) ===" | tee "$LOG"
date | tee -a "$LOG"
echo "Project: $ROOT" | tee -a "$LOG"

cd "$ROOT"

if ! command -v cargo >/dev/null 2>&1; then
  echo "ERROR: cargo not found (install Rust: https://rustup.rs)" | tee -a "$LOG"
  echo "Browser UI-only preview (no Signal backend): npm run ui" | tee -a "$LOG"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found (install Node.js: https://nodejs.org)" | tee -a "$LOG"
  exit 1
fi

MIN_RUST="1.88.0"
RUSTC_VER="$(rustc --version 2>/dev/null | awk '{print $2}')"
if [[ -n "$RUSTC_VER" ]]; then
  lowest="$(printf '%s\n%s\n' "$MIN_RUST" "$RUSTC_VER" | sort -V | head -1)"
  if [[ "$lowest" != "$MIN_RUST" ]]; then
    echo "ERROR: rustc $RUSTC_VER is too old (need >= $MIN_RUST)." | tee -a "$LOG"
    echo "       Run: rustup update && rustup default stable" | tee -a "$LOG"
    exit 1
  fi
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

# Free Vite's fixed port (vite.config.ts uses strictPort: true).
if command -v lsof >/dev/null 2>&1; then
  PID="$(lsof -ti tcp:5173 || true)"
  if [[ -n "$PID" ]]; then
    echo "Killing process on port 5173: $PID" | tee -a "$LOG"
    kill -9 $PID || true
  fi
fi

echo "Starting SignalX desktop window (Ctrl+C to stop)..." | tee -a "$LOG"
echo "Tip: npm run ui = browser layout preview only (no signal-cli)." | tee -a "$LOG"
npm run tauri:dev 2>&1 | tee -a "$LOG"
