#!/usr/bin/env bash
set -euo pipefail

Z="$HOME/.zshrc"
APP_DIR="/Users/cameroncohen/Developer/apps/signalx"
CONFIG_DIR="$APP_DIR/.signal-cli"
LOG="$APP_DIR/signal-cli-link.log"

mkdir -p "$APP_DIR" "$CONFIG_DIR"

if [ -f "$Z" ]; then
  cp "$Z" "$Z.bak.$(date +%Y%m%d_%H%M%S)"
  perl -0777 -i -pe 's/^[^\n]*fg:10: job not found:[^\n]*\n//mg; s/^[^\n]*bad pattern:[^\n]*\n//mg' "$Z"
fi

if command -v brew >/dev/null 2>&1; then
  brew update >/dev/null 2>&1 || true
  brew install qrencode >/dev/null 2>&1 || true

  if ! command -v java >/dev/null 2>&1; then
    brew install --cask temurin >/dev/null 2>&1 || brew install --cask zulu >/dev/null 2>&1 || true
  fi
fi

JAVA_HOME="$(/usr/libexec/java_home 2>/dev/null || true)"
if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
  export JAVA_HOME
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if ! command -v java >/dev/null 2>&1; then
  echo "Java still missing. Run ONE of these, then re-run this script:"
  echo "  brew install --cask temurin"
  echo "  OR: brew install --cask zulu"
  exit 1
fi

SIGNAL_CLI="$(command -v signal-cli || true)"
if [ -z "${SIGNAL_CLI:-}" ]; then
  echo "signal-cli not found. Install it first:"
  echo "  brew install signal-cli"
  exit 1
fi

: > "$LOG"
echo "== java ==" | tee -a "$LOG"
(java -version 2>&1) | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "== signal-cli ==" | tee -a "$LOG"
"$SIGNAL_CLI" --version 2>&1 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "== linking (scan QR in Signal iPhone > Settings > Linked Devices) ==" | tee -a "$LOG"
URI="$("$SIGNAL_CLI" --config "$CONFIG_DIR" -v link -n "SignalX-Mac" 2>&1 | tee -a "$LOG" | tail -n 1)"

printf '%s\n' "$URI" | tee "$APP_DIR/tsdevice-uri.txt" >/dev/null
printf '%s\n' "$URI" | qrencode -t UTF8

echo "" | tee -a "$LOG"
echo "== accounts ==" | tee -a "$LOG"
"$SIGNAL_CLI" --config "$CONFIG_DIR" listAccounts 2>&1 | tee -a "$LOG"

echo ""
echo "Done. If link fails, open: $LOG"
