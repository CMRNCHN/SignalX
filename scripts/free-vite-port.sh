#!/usr/bin/env bash
# Free Vite's fixed port (vite.config.ts uses strictPort: true).
set -e
if ! command -v lsof >/dev/null 2>&1; then
  exit 0
fi
PID="$(lsof -ti tcp:5173 || true)"
if [[ -n "$PID" ]]; then
  echo "Freeing port 5173 (pid: $PID)"
  # shellcheck disable=SC2086
  kill -9 $PID 2>/dev/null || true
  sleep 0.3
fi
