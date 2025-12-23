#!/usr/bin/env bash
set -e

APP_DIR="/Users/cameroncohen/Developer/apps/signalx"
CONFIG_DIR="$APP_DIR/.signal-cli"
mkdir -p "$CONFIG_DIR"

SIGNAL_CLI="$(command -v signal-cli)"

URI="$("$SIGNAL_CLI" --config "$CONFIG_DIR" link -n "SignalX-Mac" | tail -n 1)"

echo "$URI"
echo "$URI" | qrencode -t UTF8

"$SIGNAL_CLI" --config "$CONFIG_DIR" listAccounts || true
