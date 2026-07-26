#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Load local config (signal-cli + Ollama) if present.
if [[ -f "$ROOT/.signalx.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.signalx.env"
  set +a
fi

# Install frontend deps on first run.
if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  npm install
fi

# Free Vite's fixed port (vite.config.ts uses strictPort: true).
if command -v lsof >/dev/null 2>&1; then
  PID="$(lsof -ti tcp:5173 || true)"
  if [ -n "$PID" ]; then
    echo "Killing process on port 5173: $PID"
    kill -9 $PID || true
  fi
fi

# Launch the Tauri dev shell (starts Vite via beforeDevCommand).
npm run tauri:dev -- "$@"
