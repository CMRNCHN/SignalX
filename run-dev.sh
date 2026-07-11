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

# Launch the Tauri dev shell (starts Vite via beforeDevCommand).
npm run tauri dev -- "$@"
