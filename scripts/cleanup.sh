#!/usr/bin/env zsh
# Reclaim disk space and remove generated/local junk. Safe to re-run.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== SignalX cleanup ==="
echo "Project: $ROOT"
echo ""

before=$(du -sh . | cut -f1)
echo "Size before: $before"
echo ""

# Build artifacts (recreated on next build)
if [[ -d src-tauri/target ]]; then
  echo "Removing src-tauri/target/ ..."
  rm -rf src-tauri/target
fi
if [[ -d dist ]]; then
  echo "Removing dist/ ..."
  rm -rf dist
fi

# macOS junk
find . -name '.DS_Store' -delete 2>/dev/null || true

# Logs
rm -f run-dev.command.log 2>/dev/null || true
rm -f ./*.log 2>/dev/null || true

# Optional: reclaim node_modules (~80MB). Uncomment if you want a minimal tree.
# rm -rf node_modules

after=$(du -sh . | cut -f1)
echo ""
echo "Size after:  $after"
echo "Done. Rebuild with: ./run-dev.sh or ./SignalX-Dev.command"
