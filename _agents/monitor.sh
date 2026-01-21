#!/bin/bash
# Real-time monitoring dashboard for all agents

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

clear

while true; do
    tput cup 0 0
    
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║          SignalX Multi-Agent Status Dashboard                     ║${NC}"
    echo -e "${CYAN}║          $(date '+%Y-%m-%d %H:%M:%S')                                      ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Agent status
    echo -e "${BLUE}🤖 Agent Status:${NC}"
    echo ""
    
    for agent in SX-KERNEL SX-TRANSPORT SX-UI SX-AI-RULES SX-QA-RELEASE; do
        worktree="$PROJECT_ROOT/_worktrees/$agent"
        
        if [ -d "$worktree" ]; then
            cd "$worktree"
            
            # Get branch info
            branch=$(git rev-parse --abbrev-ref HEAD)
            commits=$(git rev-list --count HEAD ^mvp-ship-now 2>/dev/null || echo "0")
            status=$(git status --porcelain | wc -l | tr -d ' ')
            
            # Status indicator
            if [ "$commits" -gt "0" ]; then
                status_icon="${GREEN}●${NC}"
                status_text="Active ($commits commits)"
            else
                status_icon="${YELLOW}○${NC}"
                status_text="Idle"
            fi
            
            # Changes indicator
            if [ "$status" -gt "0" ]; then
                changes_text="${YELLOW}[$status changes]${NC}"
            else
                changes_text=""
            fi
            
            printf "  $status_icon %-15s %-20s %s\n" "$agent" "$status_text" "$changes_text"
        else
            printf "  ${RED}✗${NC} %-15s ${RED}Worktree not found${NC}\n" "$agent"
        fi
    done
    
    echo ""
    echo -e "${BLUE}📊 Recent Activity:${NC}"
    echo ""
    
    # Show last 5 commits across all agents
    cd "$PROJECT_ROOT/_worktrees"
    for agent in SX-KERNEL SX-TRANSPORT SX-UI SX-AI-RULES SX-QA-RELEASE; do
        if [ -d "$agent" ]; then
            cd "$agent"
            last_commit=$(git log -1 --format="%ar: %s" 2>/dev/null || echo "No commits")
            printf "  %-15s %s\n" "$agent:" "$last_commit"
            cd ..
        fi
    done
    
    echo ""
    echo -e "${BLUE}📝 Latest Logs:${NC}"
    echo ""
    
    # Show last few log lines
    if [ -d "$PROJECT_ROOT/.agent_logs" ]; then
        for log in "$PROJECT_ROOT/.agent_logs"/*.log; do
            if [ -f "$log" ]; then
                agent=$(basename "$log" .log)
                last_line=$(tail -1 "$log" 2>/dev/null || echo "No logs")
                printf "  %-15s %s\n" "$agent:" "$last_line"
            fi
        done
    fi
    
    echo ""
    echo -e "${CYAN}──────────────────────────────────────────────────────────────────${NC}"
    echo -e "  ${YELLOW}Press Ctrl+C to exit${NC}  |  Refreshing every 5 seconds..."
    echo ""
    
    sleep 5
done
