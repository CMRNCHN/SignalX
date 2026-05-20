#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/Users/cameroncohen/Developer/apps/signalx"
CONFIG_DIR="$APP_DIR/.signal-cli"
LOG="$APP_DIR/signal-cli-link.log"
mkdir -p "$CONFIG_DIR"

export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
export PATH="$JAVA_HOME/bin:$PATH"

SIGNAL_CLI="$(command -v signal-cli)"

if ! command -v qrencode >/dev/null 2>&1; then
  brew install qrencode >/dev/null
fi

echo "== java ==" | tee "$LOG"
(java -version 2>&1) | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "== signal-cli ==" | tee -a "$LOG"
"$SIGNAL_CLI" --version 2>&1 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "== linking ==" | tee -a "$LOG"
URI="$("$SIGNAL_CLI" --config "$CONFIG_DIR" -v link -n "SignalX-Mac" 2>&1 | tee -a "$LOG" | tail -n 1)"

printf '%s\n' "$URI" | tee "$APP_DIR/tsdevice-uri.txt" >/dev/null
printf '%s\n' "$URI" | qrencode -t UTF8

echo "" | tee -a "$LOG"
echo "== accounts ==" | tee -a "$LOG"
"$SIGNAL_CLI" --config "$CONFIG_DIR" listAccounts 2>&1 | tee -a "$LOG"
