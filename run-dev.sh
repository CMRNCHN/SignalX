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

# Desktop shell needs a modern Rust (edition 2024 crates). rust-toolchain.toml
# will auto-install 1.85+ via rustup when cargo runs; fail early if rustup/cargo missing.
if ! command -v cargo >/dev/null 2>&1; then
  echo "ERROR: cargo not found. Install Rust from https://rustup.rs then re-run."
  echo "       (Browser UI-only preview: npm run ui)"
  exit 1
fi

MIN_RUST="1.88.0"
RUSTC_VER="$(rustc --version 2>/dev/null | awk '{print $2}')"
if [[ -n "$RUSTC_VER" ]]; then
  lowest="$(printf '%s\n%s\n' "$MIN_RUST" "$RUSTC_VER" | sort -V | head -1)"
  if [[ "$lowest" != "$MIN_RUST" ]]; then
    echo "ERROR: rustc $RUSTC_VER is too old (need >= $MIN_RUST)."
    echo "       Run: rustup update && rustup default stable"
    echo "       Or rely on rust-toolchain.toml after installing rustup."
    exit 1
  fi
fi

# Free Vite's fixed port (vite.config.ts uses strictPort: true).
bash "$ROOT/scripts/free-vite-port.sh"

echo "Starting SignalX desktop (Tauri + Vite)…"
echo "  UI-only browser preview (no Signal backend): npm run ui"
# Launch the Tauri desktop shell (starts Vite via beforeDevCommand).
npm run tauri:dev -- "$@"
