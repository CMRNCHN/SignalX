# SignalX Multi-Agent System

This folder contains all agent-related prompts, scripts, and orchestration tools for SignalX development.

## Structure

```
_agents/
├── AGENT*.prompt.txt         # Agent prompt files (AGENT1-5)
├── AGENT*.assignment.txt     # Agent assignments
├── SX-*.prompt.txt          # SignalX specialized agents
├── SX-*.assignment.txt      # SX agent assignments
├── HANDOFF/                 # Agent handoff documentation
├── progress/                # Runtime logs and PIDs
├── *.sh                     # Orchestration scripts
├── STATE.json               # Agent state tracking
└── README.md                # This file
```

## Available Agents

### Legacy Agents (AGENT1-5)
- **AGENT1-FRONTEND**: UI/UX and React components
- **AGENT2-BACKEND**: Rust Tauri backend
- **AGENT3-AUTOMATION**: Automation rules system
- **AGENT4-PLUGINS**: Plugin architecture
- **AGENT5-TESTING**: Testing and QA

### SignalX Specialized Agents (SX-*)
- **SX-UI**: User interface development
- **SX-KERNEL**: Core backend systems
- **SX-TRANSPORT**: Signal protocol integration
- **SX-AI-RULES**: AI and automation features
- **SX-QA-RELEASE**: Quality assurance and release

## Scripts

### Orchestration
- `orchestrate.sh` - Main orchestration script
- `sx_orchestrate.sh` - SignalX-specific orchestration
- `sx_orchestrate_tmux.sh` - tmux-based orchestration
- `launch.sh` - Quick launch script

### Individual Agent Runners
- `run_SX-UI.sh`
- `run_SX-KERNEL.sh`
- `run_SX-TRANSPORT.sh`
- `run_SX-AI-RULES.sh`
- `run_SX-QA-RELEASE.sh`

### Utilities
- `progress.sh` - Check agent progress
- `sx_kick_codex.sh` - Restart specific agents

## Usage

### Run All Agents
```bash
cd _agents
./orchestrate.sh
```

### Run Specific Agent
```bash
cd _agents
./run_SX-UI.sh
```

### Check Progress
```bash
cd _agents
./progress.sh
```

### View Logs
```bash
tail -f _agents/progress/*.log
```

## State Management

Agent state is tracked in `STATE.json`, which includes:
- Current agent phase
- Completion status
- Dependencies
- Last update timestamp

## Notes

- This folder is separate from the main SignalX application code
- Logs and PIDs in `progress/` are runtime files (gitignored)
- Handoff documentation in `HANDOFF/` tracks agent transitions
- All agent prompts should be version controlled

---

**Parent Directory**: SignalX application code lives in `../` (project root)
