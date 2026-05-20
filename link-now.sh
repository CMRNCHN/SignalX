#!/usr/bin/env bash
set -euo pipefail
APP_DIR="/Users/cameroncohen/Developer/apps/signalx"
CONFIG_DIR="$APP_DIR/signal-cli-config"
LOG="$APP_DIR/link-now.log"
PNG="$APP_DIR/signal-link-qr.png"
URI_FILE="$APP_DIR/signal-link-uri.txt"
mkdir -p "$CONFIG_DIR"
: > "$LOG"
rm -f "$PNG" "$URI_FILE"
URI="$(signal-cli --config "$CONFIG_DIR" -v link -n "SignalX-Mac" 2>&1 | tee "$LOG" | sed -n 's/^\(sgnl:\/\/linkdevice.*\)$/\1/p' | head -n 1)"
printf '%s\n' "$URI" > "$URI_FILE"
qrencode -o "$PNG" -s 24 -m 1 "$URI"
open -a Preview "$PNG"
