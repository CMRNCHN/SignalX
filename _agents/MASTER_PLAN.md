# SignalX Multi-Agent Master Plan
**Updated:** January 19, 2026  
**Objective:** Complete all remaining work to ship SignalX MVP

---

## 🎯 Critical Path to MVP

### High Priority (Must Have for MVP)
1. **Backend Stability** - Refactor main.rs into clean modules
2. **Signal Transport** - Harden outbox with retry logic and idempotency
3. **React UI** - Wire up all events, loading states, error handling
4. **QA & Testing** - Comprehensive testing and release preparation

### Medium Priority (Nice to Have)
5. **AI/Rules Integration** - Draft generation with confidence gating
6. **Polish** - Performance optimization, final UI touches

---

## 🤖 Agent Assignments

### SX-UI (React Frontend Specialist)
**Branch:** `ma/SX-UI`  
**Worktree:** `_worktrees/SX-UI`

**Primary Tasks:**
1. Wire up all Tauri commands in React components
2. Subscribe to backend events (`message-received`, `outbox-updated`, `features-updated`)
3. Add comprehensive loading states (skeleton screens, spinners)
4. Add empty states for all panels
5. Implement error boundaries and error recovery
6. Fix any React warnings/errors
7. Test all user flows (login, send message, view threads)

**Deliverables:**
- All components use `invoke()` and `listen()` from `src/utils/tauri.ts`
- Loading states for: thread list, message list, send operations
- Empty states for: no threads, no messages, no contacts
- Error recovery UI for failed operations
- No console errors in browser

---

### SX-KERNEL (Rust Backend Architect)
**Branch:** `ma/SX-KERNEL`  
**Worktree:** `_worktrees/SX-KERNEL`

**Primary Tasks:**
1. Refactor `src-tauri/src/main.rs` into clean module structure:
   - `api/` - Tauri command handlers
   - `services/` - Business logic (messaging, storage, auth)
   - `runtime/` - Background tasks and event loops
   - `app/state.rs` - Application state management
2. Preserve ALL existing Tauri command names (no breaking changes)
3. Improve error handling consistency
4. Add structured logging throughout
5. Ensure `cargo build` and `cargo test` pass
6. Document module boundaries

**Deliverables:**
- Clean module structure in `src-tauri/src/`
- All commands still work (no regressions)
- Comprehensive error types
- `cargo clippy` passes with no warnings
- Module documentation

---

### SX-TRANSPORT (Signal Protocol Specialist)
**Branch:** `ma/SX-TRANSPORT`  
**Worktree:** `_worktrees/SX-TRANSPORT`

**Primary Tasks:**
1. Harden outbox system:
   - Idempotency keys for all sends
   - Exponential backoff with jitter
   - Retry limits and dead letter queue
   - Persist outbox state across restarts
2. Improve receive loop:
   - Persist all events to SQLite immediately
   - Emit stable, versioned events to frontend
   - Handle duplicate message detection
3. Error visibility:
   - Emit detailed error events
   - Log all Signal CLI failures
   - Track success/failure metrics
4. Test failure scenarios (network timeout, CLI crash, etc.)

**Deliverables:**
- Robust outbox with retry logic
- SQLite persistence for messages and events
- Comprehensive error events
- Test suite for failure scenarios
- Documentation of retry strategy

---

### SX-AI-RULES (Automation & AI Integration)
**Branch:** `ma/SX-AI-RULES`  
**Worktree:** `_worktrees/SX-AI-RULES`

**Primary Tasks:**
1. Connect automation rules to `MessageReceived` events
2. Implement AI draft generation (draft-only, no auto-send)
3. Add confidence scoring to rule matches
4. Enforce draft-only invariant in backend
5. Emit structured events for drafts and rule decisions
6. Create UI for viewing/approving drafts
7. Add rule management interface

**Deliverables:**
- Rules trigger on incoming messages
- AI generates drafts (never auto-sends)
- Confidence gating (0-100 score)
- Events: `draft-ready`, `rule-matched`, `rule-skipped`
- Draft approval UI
- Rule management panel

---

### SX-QA-RELEASE (Quality Assurance & Release)
**Branch:** `ma/SX-QA-RELEASE`  
**Worktree:** `_worktrees/SX-QA-RELEASE`

**Primary Tasks:**
1. Ensure `cargo test` passes
2. Ensure `npm run build` passes
3. Ensure `npm run tauri build` produces working DMG
4. Create comprehensive smoke test scripts:
   - Test account login
   - Test sending/receiving messages
   - Test thread management
   - Test search functionality
   - Test export functionality
5. Create release checklist
6. Write minimal runbook for deployment
7. Set up automated testing in CI

**Deliverables:**
- All builds pass (cargo, npm, tauri)
- Smoke test suite (`scripts/smoke-test.sh`)
- Release checklist (`docs/RELEASE_CHECKLIST.md`)
- Deployment runbook
- CI/CD pipeline configured
- Test coverage report

---

## 🔄 Integration & Coordination

### Merge Strategy
1. Each agent works in their worktree on their branch
2. Agents commit frequently with clear messages
3. When ready, create PR from agent branch to `mvp-ship-now`
4. Review and merge sequentially:
   - SX-KERNEL first (foundation)
   - SX-TRANSPORT second (core functionality)
   - SX-UI third (frontend)
   - SX-AI-RULES fourth (features)
   - SX-QA-RELEASE last (validation)

### Conflict Resolution
- Agents should pull from `mvp-ship-now` regularly
- If conflicts arise, coordinate in `_agents/HANDOFF/` files
- Use `STATE.json` to track completion status

---

## 📊 Success Metrics

### MVP Ready When:
- ✅ All cargo/npm builds pass
- ✅ DMG installs and runs on clean macOS
- ✅ Can log in with Signal account
- ✅ Can send/receive messages reliably
- ✅ Outbox handles failures gracefully
- ✅ UI has proper loading/error states
- ✅ No critical bugs
- ✅ Smoke tests pass
- ✅ Documentation complete

---

## 🚀 Launch Commands

```bash
# Launch all agents in parallel (tmux)
cd _agents && ./sx_orchestrate_tmux.sh

# Monitor progress
cd _agents && ./progress.sh

# Check agent status
cat _agents/STATE.json

# View agent logs
tail -f .agent_logs/*.log
```

---

**Status:** Ready to launch all agents  
**Expected Completion:** 2-3 days of parallel work  
**Next Action:** Run orchestration script
