# SignalX - Quick Reference Card

**Version:** 0.1.0 (Alpha)  
**Last Updated:** December 25, 2025  
**Purpose:** One-page overview of the entire project

---

## 🎯 What is SignalX?

A **native desktop Signal client** with AI assistance, automation, and power-user features.

**Tech Stack:** Tauri (Rust) + React (TypeScript) + Signal CLI  
**Platforms:** macOS, Linux, Windows  
**Status:** Core working, extensions planned

---

## 📊 Current Status at a Glance

| Component | Status | Priority |
|-----------|--------|----------|
| **GUI App** | ✅ Working | - |
| **Messaging** | ✅ Working | - |
| **Contacts** | ✅ Working | - |
| **AI Integration** | ✅ Working | - |
| **Export Tools** | ✅ Working | - |
| **TUI Mode** | ❌ Planned | HIGH |
| **Keyboard Shortcuts** | ❌ Planned | HIGH |
| **Auto-Reply** | ⚠️ Scaffolded | HIGH |
| **Plugins** | ⚠️ Scaffolded | MEDIUM |
| **Layout System** | ⚠️ Scaffolded | MEDIUM |

**Legend:** ✅ Done | ⚠️ Partial | ❌ Todo

---

## 🗂️ File Structure (Simplified)

```
signalx/
├── 📄 PRODUCT_ROADMAP.md         ← Complete development plan
├── 📄 IMPLEMENTATION_GUIDE.md    ← Step-by-step instructions
├── 📄 README.md                   ← Project overview
│
├── 📚 docs/                       ← All documentation
│   ├── STATUS.md                  ← Current implementation status
│   ├── NEXT_STEPS.md             ← Immediate actions
│   ├── BUILD.md                   ← Build instructions
│   └── QUICKSTART.md             ← Getting started
│
├── 🎨 src/                        ← React frontend
│   ├── App.tsx                    ← Main app component
│   ├── components/                ← UI components
│   └── utils/                     ← Utilities
│
├── 🦀 src-tauri/                  ← Rust backend
│   ├── src/
│   │   ├── main.rs                ← Main app + commands
│   │   ├── auth.rs                ← Auth (scaffolded)
│   │   ├── storage.rs             ← Storage (scaffolded)
│   │   └── rules.rs               ← Automation rules (scaffolded)
│   └── Cargo.toml                 ← Rust dependencies
│
├── 📦 packages/                   ← Extension modules
│   ├── signal_automation_scaffolding/
│   ├── signal_layout_intelligence/
│   ├── signal_plugin_system/
│   ├── signal_tui_headless_mode/
│   └── [7 more packages]
│
├── 🔧 scripts/                    ← Shell scripts
│   ├── dev/                       ← Development tools
│   │   └── SignalX-Dev.command    ← macOS launcher ⭐
│   ├── signal-cli/                ← Signal CLI setup
│   └── testing/                   ← Test scripts
│
├── 🛠️ tools/
│   └── signalx_features.py        ← Feature flag manager
│
└── ⚙️ Configuration
    ├── package.json               ← Node dependencies
    ├── Cargo.toml                 ← Rust dependencies
    ├── .signalx.env               ← Environment config
    └── tsconfig.json              ← TypeScript config
```

---

## 🚀 Quick Start Commands

### Development
```bash
# Launch app (macOS)
./scripts/dev/SignalX-Dev.command

# Or manually
npm run tauri:dev

# Frontend only
npm run dev
```

### Testing
```bash
# Unit tests
npm run test

# Feature check
./scripts/testing/test-features.sh

# Lint & format
npm run lint:fix
npm run format
```

### Building
```bash
# Production build
npm run tauri:build

# Output location
open src-tauri/target/release/bundle/macos/SignalX.app
```

---

## 🎨 Key Features Implemented

### ✅ Working Now
- **Messaging**: Send/receive Signal messages
- **Threads**: View and manage conversations
- **Contacts**: Custom fields, search, metadata
- **Groups**: Group chats with metadata
- **AI Tools**: Draft replies, summarize threads (Ollama)
- **Export**: Save threads as TXT/JSON
- **Health Monitoring**: Real-time receive status
- **Search**: Find threads, contacts, groups
- **Outbox**: Reliable message queuing
- **Agent Mode**: Headless draft generation

### ⚠️ Partially Done
- **Automation**: Types defined, engine not active
- **Layout**: Code exists, not integrated in UI
- **Plugins**: Framework ready, no plugins yet
- **Logging**: Logger exists, not integrated

### ❌ To Build
- **TUI Mode**: Terminal interface (high priority)
- **Keyboard Shortcuts**: Power-user navigation
- **Auto-Reply**: Rule-based automation
- **Media**: Images/videos
- **Notifications**: Desktop alerts

---

## 📋 Next Steps (In Order)

### Week 1: Stabilization
1. Run smoke tests
2. Fix any bugs found
3. Test production build
4. Update documentation

### Weeks 2-4: TUI Mode
1. Add ratatui dependency
2. Create TUI module
3. Implement keyboard navigation
4. Connect to backend
5. Polish and test

### Week 5: Keyboard Shortcuts
1. Create shortcut manager
2. Add global shortcuts
3. Build shortcuts modal
4. Test all shortcuts

### Weeks 6-7: Auto-Reply
1. Complete rules engine
2. Add safety mechanisms
3. Build rule management UI
4. Extensive testing

**Full timeline:** See `IMPLEMENTATION_GUIDE.md`

---

## 🗺️ Package System

SignalX is modular. Each package in `packages/` adds specific functionality:

| Package | Purpose | Status |
|---------|---------|--------|
| `signal_auth_permissions` | Multi-user auth | Planned |
| `signal_automation_rules` | Advanced rules DSL | Scaffolded |
| `signal_automation_scaffolding` | Core automation | Scaffolded |
| `signal_config_secrets` | Config validation | Scaffolded |
| `signal_data_storage` | SQLite persistence | Planned |
| `signal_layout_intelligence` | Adaptive UI layout | Coded |
| `signal_logging_observability` | Structured logging | Coded |
| `signal_packaging_release` | Release management | Docs only |
| `signal_plugin_system` | Plugin framework | Coded |
| `signal_testing_ci` | Test automation | Scripts only |
| `signal_tui_headless_mode` | Terminal UI | Planned |

---

## 🔧 Configuration

### Environment File: `.signalx.env`
```bash
SIGNALX_SIGNALCLI_CONFIG=/path/to/signal-cli
SIGNALX_NUMBER=+1234567890
SIGNALX_SIGNALCLI_BIN=/usr/local/bin/signal-cli
SIGNALX_OLLAMA_MODEL=qwen2.5:7b-instruct  # Optional
```

### Feature Flags
```bash
# List all features
python3 tools/signalx_features.py list --repo-local

# Enable a feature
python3 tools/signalx_features.py on ui.panel.ai --repo-local

# Apply preset
python3 tools/signalx_features.py preset minimal --repo-local
```

---

## 🎓 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Sidebar  │  │ Threads  │  │   Chat   │  │AI Tools │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │ Tauri Commands
┌────────────────────────▼────────────────────────────────┐
│                   Rust Backend (Tauri)                   │
│  ┌────────────┐  ┌──────────┐  ┌────────┐  ┌─────────┐ │
│  │  Threads   │  │ Contacts │  │  Rules │  │ Storage │ │
│  └────────────┘  └──────────┘  └────────┘  └─────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │ Process spawning
┌────────────────────────▼────────────────────────────────┐
│                      Signal CLI                          │
│          (Handles Signal protocol & encryption)          │
└──────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. User action in React UI
2. Invoke Tauri command via `@tauri-apps/api`
3. Rust handler processes request
4. Calls Signal CLI if needed
5. Updates state & emits events
6. Frontend receives events & updates UI

---

## 📖 Documentation Index

| Document | Purpose |
|----------|---------|
| `PRODUCT_ROADMAP.md` | Complete feature list & timeline |
| `IMPLEMENTATION_GUIDE.md` | Step-by-step development guide |
| `README.md` | Project overview & setup |
| `PROJECT_STRUCTURE.md` | File organization |
| `docs/STATUS.md` | Current implementation status |
| `docs/NEXT_STEPS.md` | Immediate action items |
| `docs/BUILD.md` | Build & deployment |
| `docs/QUICKSTART.md` | New user getting started |
| `docs/HANDOFF.md` | Developer handoff notes |
| `docs/VISION_ASSESSMENT.md` | Vision vs reality |
| `docs/AESTHETICS_TODO.md` | UI customization guide |
| `THE_BASICS.md` | Quick stabilization notes |

---

## 🐛 Troubleshooting

### App won't launch
```bash
# Check logs
tail -30 run-dev.command.log

# Verify config
cat .signalx.env

# Check dependencies
./scripts/testing/test-features.sh
```

### Messages not appearing
1. Check health badge (should be green)
2. Verify `SIGNALX_NUMBER` in `.signalx.env`
3. Click "Diag" button for diagnostics
4. Test Signal CLI: `signal-cli -u YOURNUMBER receive`

### Build fails
```bash
# Clean and rebuild
cd src-tauri
cargo clean
cd ..
npm run tauri:build
```

### Import errors
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

---

## 🎯 Success Metrics

**MVP Requirements:**
- [ ] Send/receive messages reliably
- [ ] No crashes during normal use
- [ ] Data persists across restarts
- [ ] Production build works
- [ ] Basic documentation complete

**V1.0 Requirements:**
- [ ] TUI mode functional
- [ ] Keyboard shortcuts working
- [ ] Auto-reply safe and tested
- [ ] 80%+ test coverage
- [ ] Comprehensive documentation
- [ ] Signed builds for all platforms

---

## 💡 Design Principles

1. **Safety First**: Never auto-send without explicit permission
2. **Backend Truth**: Rust backend is source of truth, React displays
3. **Event-Driven**: No polling, use Tauri events
4. **Modular**: Features can be enabled/disabled
5. **Keyboard-Friendly**: Power users should fly
6. **Privacy-Focused**: No telemetry without consent

---

## 🔗 Key Files to Know

| File | What It Does |
|------|--------------|
| `src/App.tsx` | Main React component, UI layout |
| `src-tauri/src/main.rs` | All Tauri commands, main logic |
| `src-tauri/src/rules.rs` | Automation rules (to complete) |
| `.signalx.env` | Configuration & secrets |
| `package.json` | Node dependencies & scripts |
| `Cargo.toml` | Rust dependencies |

---

## 📞 Quick Support

**Error in logs?**
→ Check `run-dev.command.log`, search for "ERROR" or "WARN"

**Feature not working?**
→ Run `./scripts/testing/test-features.sh`

**Want to add a feature?**
→ See `IMPLEMENTATION_GUIDE.md` for step-by-step

**Need architecture context?**
→ Read `PRODUCT_ROADMAP.md`

---

## 🚦 Development Status by Phase

```
Phase 1: Stabilization     ████████░░ 80% (Week 1)
Phase 2: Vision Features   ██░░░░░░░░ 20% (Weeks 2-7)
Phase 3: Extensions        █░░░░░░░░░ 10% (Weeks 8-11)
Phase 4: Production        ░░░░░░░░░░  0% (Weeks 12-14)
```

**Current Focus:** Complete Phase 1 testing

---

## ✅ Today's Quick Checklist

Before starting work:
- [ ] Pull latest: `git pull origin main`
- [ ] Check environment: `cat .signalx.env`
- [ ] Run tests: `npm run test`
- [ ] Review issues: Check GitHub

During work:
- [ ] Test frequently: `npm run dev`
- [ ] Commit often: Clear messages
- [ ] Document changes: Update relevant docs

Before finishing:
- [ ] Run linter: `npm run lint:fix`
- [ ] Full test: `npm run test:run`
- [ ] Push changes: `git push`
- [ ] Update TODO: Mark completed tasks

---

**This reference card should be your starting point each day. Print it, bookmark it, or keep it open in a tab.**

**Most Important:** Start with `IMPLEMENTATION_GUIDE.md` Phase 1, Day 1. Follow it step by step.

---

## 🎓 Learning Path

**New to the project?** Read in this order:
1. This file (you're here!)
2. `README.md` - Project overview
3. `docs/QUICKSTART.md` - Get it running
4. `PRODUCT_ROADMAP.md` - Understand the vision
5. `IMPLEMENTATION_GUIDE.md` - Start building

**Ready to contribute?** Start here:
1. Run smoke tests (Implementation Guide, Phase 1)
2. Pick a feature from Phase 2
3. Create feature branch
4. Follow implementation steps
5. Test thoroughly
6. Submit PR

---

**Version Control:**
- Document Version: 1.0
- SignalX Version: 0.1.0-alpha
- Last Updated: 2025-12-25
- Next Review: After Phase 1 complete

