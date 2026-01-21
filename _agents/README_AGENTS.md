# How to Work with Multi-Agent System

## Overview

SignalX uses 5 specialized AI agents working in parallel to complete MVP development:

- **SX-KERNEL**: Backend refactoring
- **SX-TRANSPORT**: Signal messaging reliability  
- **SX-UI**: React frontend integration
- **SX-AI-RULES**: Automation and AI features
- **SX-QA-RELEASE**: Testing and release prep

## Architecture

Each agent works in its own **git worktree** on a dedicated branch:

```
signalx/
├── _worktrees/
│   ├── SX-KERNEL/      (branch: ma/SX-KERNEL)
│   ├── SX-TRANSPORT/   (branch: ma/SX-TRANSPORT)
│   ├── SX-UI/          (branch: ma/SX-UI)
│   ├── SX-AI-RULES/    (branch: ma/SX-AI-RULES)
│   └── SX-QA-RELEASE/  (branch: ma/SX-QA-RELEASE)
├── _agents/
│   ├── MASTER_PLAN.md
│   ├── STATUS_DASHBOARD.md
│   ├── STATE.json
│   └── SX-*.prompt.txt (agent instructions)
└── .agent_logs/
    └── *.log (agent output)
```

## How It Works

### 1. Each Agent Has:
- **Worktree**: Independent working directory
- **Branch**: Isolated git branch  
- **Prompt**: Detailed instructions (`.prompt.txt`)
- **Assignment**: Specific tasks (`.assignment.txt`)
- **Progress**: Status tracking (`PROGRESS.md` in worktree)

### 2. Agents Work Independently:
- Agents don't block each other
- Each makes commits to their branch
- Work happens in parallel
- No merge conflicts during development

### 3. Integration Happens Later:
- Agents finish their work
- Branches merged in order:
  1. SX-KERNEL (foundation)
  2. SX-TRANSPORT (core)
  3. SX-UI (frontend)
  4. SX-AI-RULES (features)
  5. SX-QA-RELEASE (validation)

## Commands

### Launch All Agents
```bash
cd _agents && ./LAUNCH_ALL.sh
```

### Check Status
```bash
# View overall status
cat _agents/STATUS_DASHBOARD.md

# View agent state
cat _agents/STATE.json

# View individual progress
cat _worktrees/SX-UI/PROGRESS.md
cat _worktrees/SX-KERNEL/PROGRESS.md
# ... etc
```

### Monitor Logs
```bash
# Watch all agent logs
tail -f .agent_logs/*.log

# Watch specific agent
tail -f .agent_logs/SX-UI.log
```

### Check Git Status
```bash
cd _worktrees

# Check all worktrees
for dir in SX-*; do
  echo "=== $dir ==="
  cd $dir
  git status -sb
  cd ..
done
```

### View Agent Work
```bash
# See what agent changed
cd _worktrees/SX-UI
git log --oneline
git diff mvp-ship-now

# See all changes
git diff mvp-ship-now...ma/SX-UI
```

## Workflow

### For Agents:
1. Read your prompt file (`SX-*.prompt.txt`)
2. Work in your worktree (`_worktrees/SX-*`)
3. Make frequent commits with clear messages
4. Update `PROGRESS.md` with your status
5. When done, update `STATE.json` status to "complete"

### For Humans:
1. Launch agents: `./LAUNCH_ALL.sh`
2. Monitor: `cat STATUS_DASHBOARD.md`
3. Check progress: `cat _worktrees/*/PROGRESS.md`
4. Watch logs: `tail -f .agent_logs/*.log`
5. When agents done, review and merge branches

## Integration

### When Agent Completes:
1. Agent marks status as "complete" in `STATE.json`
2. Agent updates final `PROGRESS.md`
3. Agent commits all work to branch

### Merging Agent Work:
```bash
# From main repo (not worktree)
cd /path/to/signalx

# Merge in order
git checkout mvp-ship-now
git merge ma/SX-KERNEL
git merge ma/SX-TRANSPORT
git merge ma/SX-UI
git merge ma/SX-AI-RULES
git merge ma/SX-QA-RELEASE

# Run final tests
npm test
cargo test
npm run tauri build
```

## Troubleshooting

### Worktree Not Found
```bash
cd /path/to/signalx
git worktree add _worktrees/SX-UI ma/SX-UI
```

### Agent Stuck
```bash
# Check logs
tail -f .agent_logs/SX-UI.log

# Check git status
cd _worktrees/SX-UI && git status

# Restart agent (would re-run orchestration)
```

### Merge Conflicts
```bash
# Pull latest changes into agent branch
cd _worktrees/SX-UI
git fetch origin
git merge origin/mvp-ship-now

# Resolve conflicts
# Then continue work
```

## Best Practices

### For Agents:
- ✅ Commit frequently with clear messages
- ✅ Update PROGRESS.md after major milestones
- ✅ Test your changes before marking complete
- ✅ Document any assumptions or decisions
- ✅ Log errors and blockers

### For Orchestration:
- ✅ Keep agents isolated (separate worktrees)
- ✅ Merge in dependency order (KERNEL first)
- ✅ Run tests after each merge
- ✅ Keep STATUS_DASHBOARD.md updated
- ✅ Monitor agent logs for issues

## Files Reference

| File | Purpose |
|------|---------|
| `MASTER_PLAN.md` | Overall project plan |
| `STATUS_DASHBOARD.md` | Real-time status of all agents |
| `STATE.json` | Machine-readable agent state |
| `SX-*.prompt.txt` | Detailed agent instructions |
| `SX-*.assignment.txt` | Brief agent tasks |
| `LAUNCH_ALL.sh` | Script to launch all agents |
| `_worktrees/*/PROGRESS.md` | Individual agent progress |
| `.agent_logs/*.log` | Agent execution logs |

---

**Current Status:** All 5 agents launched and working on MVP completion  
**Expected Completion:** January 22, 2026  
**Next Review:** Check STATUS_DASHBOARD.md for updates
