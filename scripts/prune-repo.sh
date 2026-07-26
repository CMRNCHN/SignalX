#!/usr/bin/env zsh
# One-time repo structure cleanup: removes obsolete files and reorganizes scripts/docs.
# Review this script before running. Uses git rm where files are tracked.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== SignalX repo prune ==="

# --- Remove obsolete / duplicate / huge tracked files ---
OBSOLETE=(
  apply-signalx-cursor-bundle.sh
  _signalx_cursor_bundle.sh
  SignalX-Dev-Launcher.applescript
  go.mod
  go.sum
  server.js
)

for f in "${OBSOLETE[@]}"; do
  if [[ -e "$f" ]]; then
    echo "Removing $f"
    git rm -f "$f" 2>/dev/null || rm -f "$f"
  fi
done

# Planning stub folders (README-only)
for d in signal_auth_permissions signal_automation_rules signal_automation_scaffolding \
         signal_data_storage signal_layout_intelligence signal_tui_headless_mode; do
  if [[ -d "$d" ]]; then
    echo "Removing $d/"
    git rm -rf "$d" 2>/dev/null || rm -rf "$d"
  fi
done

# Empty / stale dirs
rm -rf gui bin 2>/dev/null || true

# --- Move docs ---
mkdir -p docs
for f in BUILD.md HANDOFF.md NEXT_STEPS.md STATUS.md VISION_ASSESSMENT.md AESTHETICS_TODO.md QUICKSTART.md; do
  if [[ -f "$f" ]]; then
    echo "Moving $f -> docs/"
    git mv "$f" "docs/$f" 2>/dev/null || mv "$f" "docs/$f"
  fi
done

# --- Move helper scripts (keep launchers at root) ---
mkdir -p scripts
for f in link-live.sh link-now.sh link-signal-cli.sh link-signal.sh \
         run-signal-link-qr.sh run-signal-link.sh signal-cli-check.sh \
         signal-cli-link-debug.sh signal-cli-link.sh fix-zshrc-and-signal-cli.sh \
         run-all.sh use-signalx-number.sh verify-build.sh; do
  if [[ -f "$f" ]]; then
    echo "Moving $f -> scripts/"
    git mv "$f" "scripts/$f" 2>/dev/null || mv "$f" "scripts/$f"
  fi
done

# Stop tracking secrets
if git ls-files --error-unmatch .signalx.env &>/dev/null; then
  echo "Untracking .signalx.env (keeps local file)"
  git rm --cached .signalx.env
fi
if git ls-files --error-unmatch .signal-cli-link/data/accounts.json &>/dev/null; then
  git rm -rf --cached .signal-cli-link 2>/dev/null || true
fi

chmod +x scripts/*.sh 2>/dev/null || true

echo ""
echo "Prune complete. Run ./scripts/cleanup.sh to drop build artifacts (~800MB)."
echo "Then: npm install && ./SignalX-Dev.command"
