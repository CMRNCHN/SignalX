set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
OUT="$ROOT/.agent_logs/AGENTS_REPORT.txt"
: > "$OUT"
for w in signalx-docs signalx-tui signalx-ai; do
echo "==== $w ====" >> "$OUT"
if [ -d "$ROOT/.worktrees/$w" ]; then
echo "-- status --" >> "$OUT"
git -C "$ROOT/.worktrees/$w" status --porcelain >> "$OUT" || true
echo "-- diffstat --" >> "$OUT"
git -C "$ROOT/.worktrees/$w" diff --stat >> "$OUT" || true
echo "-- files changed --" >> "$OUT"
git -C "$ROOT/.worktrees/$w" diff --name-only >> "$OUT" || true
echo "-- last 80 lines of log --" >> "$OUT"
f="$ROOT/.agent_logs/${w#signalx-}.log"
if [ -f "$f" ]; then
tail -n 80 "$f" >> "$OUT" || true
else
ls -1 "$ROOT/.agent_logs" >> "$OUT" || true
fi
else
echo "MISSING_WORKTREE $ROOT/.worktrees/$w" >> "$OUT"
fi
echo >> "$OUT"
done
echo "$OUT"
