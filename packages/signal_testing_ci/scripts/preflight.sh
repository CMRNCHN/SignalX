#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "[preflight] repo: $(pwd)"
command -v node >/dev/null || { echo "missing node"; exit 1; }
command -v npm >/dev/null || { echo "missing npm"; exit 1; }
command -v cargo >/dev/null || echo "[warn] cargo missing (tauri may install)"
test -f .signalx.env || { echo "missing .signalx.env"; exit 1; }
echo "[preflight] ok"
