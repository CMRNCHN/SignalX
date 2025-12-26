#!/usr/bin/env bash
set -euo pipefail

echo "== PATH / binaries =="
command -v signal-cli || true
command -v signal || true

echo
echo "== Try common locations if not in PATH =="
for p in \
  /opt/homebrew/bin/signal-cli \
  /usr/local/bin/signal-cli \
  "$HOME/bin/signal-cli" \
  "$HOME/.local/bin/signal-cli"
do
  if [[ -x "$p" ]]; then
    echo "found: $p"
    SIGNAL_CLI="$p"
    break
  fi
done

echo
echo "== Use signal-cli from PATH if found =="
: "${SIGNAL_CLI:=$(command -v signal-cli || true)}"

if [[ -z "${SIGNAL_CLI:-}" ]]; then
  echo "signal-cli not found. Install it first (Homebrew recommended)."
  exit 1
fi

echo "using: $SIGNAL_CLI"

echo
echo "== Version =="
"$SIGNAL_CLI" --version || true

echo
echo "== Accounts (may be empty if not linked/registered) =="
"$SIGNAL_CLI" listAccounts || true

echo
echo "== Data dir (default) =="
echo "$HOME/.local/share/signal-cli"

echo
echo "Done."
