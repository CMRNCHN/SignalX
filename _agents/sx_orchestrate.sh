set -euo pipefail
cd /Users/cameroncohen/Developer/apps/signalx

WTROOT="$PWD/_worktrees"
OUT="$PWD/_ops/multi_agent"
HANDOFF="$OUT/HANDOFF"
PROG="$OUT/progress"
mkdir -p "$HANDOFF" "$PROG"

STATE="$OUT/STATE.json"
PLAN="$OUT/PLAN.md"

[ -f "$STATE" ] || printf '%s\n' '{"stage":"bootstrap","notes":[]}' > "$STATE"
[ -f "$PLAN" ] || printf '%s\n' "# SignalX Multi-Agent Plan\n" > "$PLAN"

run_agent() {
  local name="$1"
  local wd="$WTROOT/$name"
  local log="$PROG/$name.log"
  local prompt_file="$OUT/$name.prompt.txt"
  local sh_file="$OUT/run_$name.sh"

  cat > "$prompt_file" <<EOF
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

  cat > "$sh_file" <<EOF
cd "$wd"
codex "\$(cat "$prompt_file")"
EOF
  chmod +x "$sh_file"

  (
    cd "$wd"
    script -q "$log" "$sh_file" >/dev/null 2>&1 || true
  ) &
  echo $! > "$PROG/$name.pid"
}

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

for f in "$PROG"/*.pid; do
  [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true
done

: > "$PROG/SX-KERNEL.log"
: > "$PROG/SX-TRANSPORT.log"
: > "$PROG/SX-AI-RULES.log"
: > "$PROG/SX-UI.log"
: > "$PROG/SX-QA-RELEASE.log"

run_agent SX-KERNEL
run_agent SX-TRANSPORT
run_agent SX-AI-RULES
run_agent SX-UI
run_agent SX-QA-RELEASE

printf '%s\n' "Started 5 agents with pseudo-TTY logs."
printf '%s\n' "tail -f $PROG/*.log"
