#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/Users/cameroncohen/Developer/apps/signalx"
CFG="$APP_DIR/.signal-cli-link"
mkdir -p "$CFG"

unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy NO_PROXY no_proxy

URI="$(/opt/homebrew/bin/signal-cli --config "$CFG" link -n "SignalX-Mac" 2>/tmp/signalx_link_err.txt | tr -d '\r' | tail -n 1 || true)"
if [[ -z "${URI:-}" ]] || [[ "$URI" != sgnl://linkdevice* ]]; then
  echo "Link failed. Last error output:"
  tail -n 50 /tmp/signalx_link_err.txt
  exit 1
fi

echo "$URI" > /tmp/signalx-uri.txt
echo "$URI" | qrencode -o /tmp/signalx-qr.png -s 10
open /tmp/signalx-qr.png
echo "QR opened in Preview: /tmp/signalx-qr.png"
