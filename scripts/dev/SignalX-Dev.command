#!/bin/zsh
set -e

ROOT="/Users/cameroncohen/Developer/apps/signalx"
LOG="$ROOT/run-dev.command.log"

echo "=== SignalX Dev Launcher ===" | tee "$LOG"
date | tee -a "$LOG"

cd "$ROOT" | tee -a "$LOG"

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found" | tee -a "$LOG"
  exit 1
fi

if ! command -v signal-cli >/dev/null 2>&1; then
  echo "ERROR: signal-cli not found (install via Homebrew)" | tee -a "$LOG"
  exit 1
fi

# Kill anything on 5173
if command -v lsof >/dev/null 2>&1; then
  PID="$(lsof -ti tcp:5173 || true)"
  if [ -n "$PID" ]; then
    echo "Killing process on port 5173: $PID" | tee -a "$LOG"
    kill -9 $PID || true
  fi
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "node_modules missing; running npm install..." | tee -a "$LOG"
  npm install 2>&1 | tee -a "$LOG"
fi

echo "Starting: npm run dev (Vite) + Tauri dev" | tee -a "$LOG"
echo "If Tauri says Waiting for frontend: open another terminal and run: npm run dev" | tee -a "$LOG"

# Start Vite in background
npm run dev -- --host 127.0.0.1 --port 5173 2>&1 | tee -a "$LOG" &
sleep 1

# Start Tauri (uses @tauri-apps/cli in node_modules)
npm run tauri dev 2>&1 | tee -a "$LOG"
