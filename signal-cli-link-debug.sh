#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/Users/cameroncohen/Developer/apps/signalx"
CONFIG_DIR="$APP_DIR/.signal-cli"
LOG="$APP_DIR/signal-cli-link.log"
mkdir -p "$CONFIG_DIR"

SIGNAL_CLI="$(command -v signal-cli)"

echo "== signal-cli ==" | tee "$LOG"
"$SIGNAL_CLI" --version 2>&1 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "== java ==" | tee -a "$LOG"
(java -version 2>&1 || true) | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "== env proxies (for this run we clear them) ==" | tee -a "$LOG"
env | rg -i '^(http|https|all|no)_proxy=' || true

export http_proxy=""
export https_proxy=""
export all_proxy=""
export no_proxy=""

if ! command -v qrencode >/dev/null 2>&1; then
  brew install qrencode
fi

echo "" | tee -a "$LOG"
echo "== linking (scan QR in Signal > Settings > Linked devices) ==" | tee -a "$LOG"
set +e
URI="$("$SIGNAL_CLI" --config "$CONFIG_DIR" -v link -n "SignalX-Mac" 2>&1 | tee -a "$LOG" | tail -n 1)"
RC=$?
set -e

if [ $RC -ne 0 ]; then
  echo "" | tee -a "$LOG"
  echo "Link failed. Log saved to: $LOG" | tee -a "$LOG"
  exit $RC
fi

printf '%s\n' "$URI" | tee "$APP_DIR/tsdevice-uri.txt" >/dev/null
echo "" | tee -a "$LOG"
echo "URI: $URI" | tee -a "$LOG"
printf '%s\n' "$URI" | qrencode -t UTF8

echo "" | tee -a "$LOG"
echo "== accounts ==" | tee -a "$LOG"
"$SIGNAL_CLI" --config "$CONFIG_DIR" listAccounts 2>&1 | tee -a "$LOG"
