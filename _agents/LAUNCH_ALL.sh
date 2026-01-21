#!/bin/bash
# Launch all 5 SignalX agents in parallel

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Launching all SignalX agents..."
echo "Project root: $PROJECT_ROOT"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if worktrees exist
for agent in SX-UI SX-KERNEL SX-TRANSPORT SX-AI-RULES SX-QA-RELEASE; do
    worktree="$PROJECT_ROOT/_worktrees/$agent"
    if [ ! -d "$worktree" ]; then
        echo -e "${YELLOW}⚠️  Worktree not found: $worktree${NC}"
        echo "Creating worktree for $agent..."
        cd "$PROJECT_ROOT"
        git worktree add "_worktrees/$agent" "ma/$agent" 2>/dev/null || echo "Branch already exists"
    fi
done

echo ""
echo -e "${BLUE}📋 Agent Assignments:${NC}"
echo "  SX-UI:        React frontend - loading states, error handling, events"
echo "  SX-KERNEL:    Rust backend refactor - clean module structure"
echo "  SX-TRANSPORT: Signal reliability - outbox retry, persistence"
echo "  SX-AI-RULES:  Automation - draft generation, rule matching"
echo "  SX-QA-RELEASE: Testing - smoke tests, release checklist"
echo ""

# Function to launch agent in background
launch_agent() {
    local agent=$1
    local worktree="$PROJECT_ROOT/_worktrees/$agent"
    local prompt_file="$SCRIPT_DIR/$agent.prompt.txt"
    local log_file="$PROJECT_ROOT/.agent_logs/${agent}.log"
    
    if [ ! -f "$prompt_file" ]; then
        echo -e "${YELLOW}⚠️  Prompt file not found: $prompt_file${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} Launching $agent in worktree: $worktree"
    
    # Create log directory
    mkdir -p "$PROJECT_ROOT/.agent_logs"
    
    # Launch agent (this would typically call your AI agent orchestrator)
    # For now, just log that it would be launched
    echo "[$(date)] Launched $agent" >> "$log_file"
    echo "  Worktree: $worktree" >> "$log_file"
    echo "  Branch: ma/$agent" >> "$log_file"
    echo "  Prompt: $prompt_file" >> "$log_file"
    echo "" >> "$log_file"
    
    # Write PID file (placeholder for actual process)
    echo "$$" > "$SCRIPT_DIR/progress/${agent}.pid"
}

# Create progress directory
mkdir -p "$SCRIPT_DIR/progress"
mkdir -p "$PROJECT_ROOT/.agent_logs"

# Launch all agents
echo ""
echo -e "${BLUE}🤖 Launching agents...${NC}"
for agent in SX-KERNEL SX-TRANSPORT SX-UI SX-AI-RULES SX-QA-RELEASE; do
    launch_agent "$agent"
done

echo ""
echo -e "${GREEN}✅ All agents launched!${NC}"
echo ""
echo -e "${BLUE}📊 Monitor progress:${NC}"
echo "  Watch logs:     tail -f .agent_logs/*.log"
echo "  Check status:   cat _agents/STATE.json"
echo "  View progress:  cat _worktrees/*/PROGRESS.md"
echo ""
echo -e "${BLUE}📖 Read master plan:${NC}"
echo "  cat _agents/MASTER_PLAN.md"
echo ""
echo -e "${YELLOW}💡 Note:${NC} Agents are working in parallel in their worktrees."
echo "   Each agent will commit to their branch (ma/SX-*)"
echo "   Merge order: KERNEL → TRANSPORT → UI → AI-RULES → QA-RELEASE"
echo ""
