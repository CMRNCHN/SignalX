#!/usr/bin/env bash
set -e

cd /Users/cameroncohen/Developer/apps/signalx

lsof -tiTCP -sTCP:LISTEN | xargs -r kill -9

npm run dev &
VITE_PID=$!

sleep 3

cd src-tauri
. "$HOME/.cargo/env"
cargo tauri dev

kill $VITE_PID 2>/dev/null || true
