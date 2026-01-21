set -euo pipefail
cd /Users/cameroncohen/Developer/apps/signalx
OUT="$PWD/_ops/multi_agent"
WINS=(SX-KERNEL SX-TRANSPORT SX-AI-RULES SX-UI SX-QA-RELEASE)
for w in "${WINS[@]}"; do
  tmux send-keys -t "SXMA:$w" C-c
done
sleep 1
for w in "${WINS[@]}"; do
  tmux send-keys -t "SXMA:$w" "codex" C-m
done
sleep 2
for w in "${WINS[@]}"; do
  tmux load-buffer -b "sx_$w" "$OUT/$w.prompt.txt"
  tmux paste-buffer -t "SXMA:$w" -b "sx_$w"
  tmux send-keys -t "SXMA:$w" C-m
done
