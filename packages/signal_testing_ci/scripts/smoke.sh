#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "[smoke] checking vite port 5173"
if lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[smoke] 5173 already in use"; exit 1
fi
echo "[smoke] ok"
