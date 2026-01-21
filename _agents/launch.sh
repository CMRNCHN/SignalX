set -euo pipefail
cd /Users/cameroncohen/Developer/apps/signalx

command -v tmux >/dev/null || brew install tmux
command -v cursor-agent >/dev/null

BASE="$(git rev-parse --abbrev-ref HEAD)"
WTROOT="$PWD/_worktrees"
mkdir -p "$WTROOT"
git worktree prune

mk() {
  local n="$1" b="ma/$1" d="$WTROOT/$1"
  git show-ref --verify --quiet "refs/heads/$b" || git branch "$b" "$BASE"
  [ -d "$d" ] || git worktree add "$d" "$b"
}

mk SX-KERNEL
mk SX-TRANSPORT
mk SX-AI-RULES
mk SX-UI
mk SX-QA-RELEASE

cat > _ops/multi_agent/progress.sh <<'P'
python3 - <<'PY'
from pathlib import Path
import subprocess, datetime
root=Path("/Users/cameroncohen/Developer/apps/signalx/_worktrees")
print("SX MULTI-AGENT STATUS", datetime.datetime.now().strftime("%H:%M:%S"))
for d in sorted(root.iterdir()):
    if not (d/".git").exists(): continue
    s=subprocess.check_output(["git","status","-sb"], cwd=d).decode().splitlines()[0]
    print(f"{d.name:14} {s}")
PY
P
chmod +x _ops/multi_agent/progress.sh

tmux kill-session -t SX 2>/dev/null || true
tmux new-session -d -s SX -n agents -c "$WTROOT/SX-KERNEL"
tmux split-window -h -c "$WTROOT/SX-TRANSPORT"
tmux split-window -v -t 0 -c "$WTROOT/SX-AI-RULES"
tmux split-window -v -t 1 -c "$WTROOT/SX-UI"
tmux select-layout tiled
tmux new-window -n qa -c "$WTROOT/SX-QA-RELEASE"
tmux new-window -n progress -c "$PWD"
tmux send-keys -t SX:progress "watch -n 5 ./_ops/multi_agent/progress.sh" C-m
tmux select-window -t SX:agents
tmux attach -t SX
