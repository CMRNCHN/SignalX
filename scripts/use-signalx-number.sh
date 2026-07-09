#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/Users/cameroncohen/Developer/apps/signalx"
NUMBER="+12023500459"
CONFIG_DIR="$HOME/.local/share/signal-cli"

mkdir -p "$APP_DIR"

signal-cli --version >/dev/null

signal-cli -u "$NUMBER" updateProfile --name "SignalX" >/dev/null || true
signal-cli -u "$NUMBER" updateProfile --name "SignalX" --about "SignalX CLI" >/dev/null || true

signal-cli -u "$NUMBER" send -m "SignalX CLI OK ✅" "$NUMBER"

cat > "$APP_DIR/.signalx.env" <<ENV
SIGNALX_NUMBER=$NUMBER
SIGNALX_SIGNALCLI_CONFIG=$CONFIG_DIR
ENV

echo "OK"
echo "NUMBER=$NUMBER"
echo "CONFIG_DIR=$CONFIG_DIR"
echo "ENV_FILE=$APP_DIR/.signalx.env"
