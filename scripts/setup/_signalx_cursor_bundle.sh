#!/usr/bin/env bash
set -e

mkdir -p src src-tauri/src

# ---------- App.tsx ----------
cat > src/App.tsx <<'APP'
<PASTE YOUR App.tsx CONTENT HERE>
APP

# ---------- main.rs ----------
cat > src-tauri/src/main.rs <<'RS'
<PASTE YOUR main.rs CONTENT HERE>
RS

# ---------- Dev launcher ----------
cat > SignalX-Dev.command <<'CMD'
#!/bin/bash
cd "$(dirname "$0")"

echo "Starting SignalX dev…"

if ! command -v signal-cli >/dev/null; then
  echo "signal-cli not found"
  exit 1
fi

lsof -ti :5173 | xargs kill -9 2>/dev/null || true

npm install
npm run tauri dev
CMD

chmod +x SignalX-Dev.command

# ---------- Zip for Cursor ----------
zip -r SignalX-Cursor-Bundle.zip \
  src/App.tsx \
  src-tauri/src/main.rs \
  SignalX-Dev.command

echo "✅ Created SignalX-Cursor-Bundle.zip"
