set -euo pipefail
cd /Users/cameroncohen/Developer/apps/signalx

command -v tmux >/dev/null || brew install tmux
command -v codex >/dev/null

WTROOT="$PWD/_worktrees"
OUT="$PWD/_ops/multi_agent"
HANDOFF="$OUT/HANDOFF"
PROG="$OUT/progress"
mkdir -p "$HANDOFF" "$PROG"

STATE="$OUT/STATE.json"
PLAN="$OUT/PLAN.md"
[ -f "$STATE" ] || printf '%s\n' '{"stage":"bootstrap","notes":[]}' > "$STATE"
[ -f "$PLAN" ] || printf '%s\n' "# SignalX Multi-Agent Plan\n" > "$PLAN"

cat > "$OUT/SX-KERNEL.assignment.txt" <<'A'
Refactor Rust backend:
- Split src-tauri/src/main.rs into api/, services/, runtime/, and app/state.rs.
- Preserve all existing Tauri command names.
- Ensure cargo build/test passes.
A

cat > "$OUT/SX-TRANSPORT.assignment.txt" <<'A'
Harden Signal-CLI + outbox:
- Ensure all sends go through outbox with retry/backoff and idempotency keys.
- Ensure receive loop persists events to SQLite and emits stable events.
- Ensure failures are visible via events/logs.
A

cat > "$OUT/SX-AI-RULES.assignment.txt" <<'A'
Rules + AI pipeline:
- Rules trigger on MessageReceived.
- AI generates DraftReady only (no direct send).
- Add confidence gating and enforce draft-only invariant in backend.
- Emit structured events for drafts and rule decisions.
A

cat > "$OUT/SX-UI.assignment.txt" <<'A'
React UI wiring:
- Threads list/view, drafts panel, approve/send flow.
- Subscribe to backend events and call backend commands.
- Add loading/error/empty states.
A

cat > "$OUT/SX-QA-RELEASE.assignment.txt" <<'A'
QA + release:
- Ensure cargo test, npm build, and tauri build pass.
- Add smoke test script(s).
- Produce release checklist and minimal runbook.
A

mkprompt() {
  local name="$1"
  local wd="$WTROOT/$name"
  local pf="$OUT/$name.prompt.txt"
  cat > "$pf" <<EOF
You are $name.
You MUST:
- Read $PLAN and $STATE first.
- Write a handoff file to $HANDOFF/$name.md describing:
  - What changed (files touched)
  - What is complete
  - What is blocked / what you need from others
  - Next exact steps
- Keep all existing APIs stable unless explicitly stated.
- After changes, run relevant checks and record results in the handoff.
Project root for your work: $wd
Shared artifacts:
- Plan: $PLAN
- State: $STATE
- Handoffs dir: $HANDOFF
Now execute your assignment:

$(cat "$OUT/$name.assignment.txt")
EOF
}

for name in SX-KERNEL SX-TRANSPORT SX-AI-RULES SX-UI SX-QA-RELEASE; do
  mkprompt "$name"
done

tmux kill-session -t SXMA 2>/dev/null || true
tmux new-session -d -s SXMA -n SX-KERNEL -c "$WTROOT/SX-KERNEL"
tmux new-window -t SXMA -n SX-TRANSPORT -c "$WTROOT/SX-TRANSPORT"
tmux new-window -t SXMA -n SX-AI-RULES -c "$WTROOT/SX-AI-RULES"
tmux new-window -t SXMA -n SX-UI -c "$WTROOT/SX-UI"
tmux new-window -t SXMA -n SX-QA-RELEASE -c "$WTROOT/SX-QA-RELEASE"

for w in SX-KERNEL SX-TRANSPORT SX-AI-RULES SX-UI SX-QA-RELEASE; do
  : > "$PROG/$w.log"
  tmux pipe-pane -t "SXMA:$w" -o "cat >> '$PROG/$w.log'"
done

for w in SX-KERNEL SX-TRANSPORT SX-AI-RULES SX-UI SX-QA-RELEASE; do
  tmux send-keys -t "SXMA:$w" "codex" C-m
  tmux load-buffer -b "sx_$w" "$OUT/$w.prompt.txt"
  tmux paste-buffer -t "SXMA:$w" -b "sx_$w"
  tmux send-keys -t "SXMA:$w" C-m
done

printf '%s\n' "SXMA started."
printf '%s\n' "tmux attach -t SXMA"
printf '%s\n' "tail -f $PROG/*.log | sed -E 's/\\x1B\\[[0-9;?]*[A-Za-z]//g; s/\\x1B\\][0-9;]*[^\\x07]*\\x07//g; s/\\r//g'"
