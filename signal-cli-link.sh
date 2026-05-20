#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/Users/cameroncohen/Developer/apps/signalx"
CONFIG_DIR="$APP_DIR/.signal-cli"
mkdir -p "$CONFIG_DIR"

SIGNAL_CLI="$(command -v signal-cli)"

if ! command -v qrencode >/dev/null 2>&1; then
  brew install qrencode
fi

URI="$("$SIGNAL_CLI" --config "$CONFIG_DIR" link -n "SignalX-Mac" | tr -d '\r' | tail -n 1)"

printf '%s\n' "$URI" | tee "$APP_DIR/tsdevice-uri.txt" >/dev/null
printf '\n%s\n\n' "$URI"
printf '%s\n' "$URI" | qrencode -t UTF8

"$SIGNAL_CLI" --config "$CONFIG_DIR" listAccounts || true
