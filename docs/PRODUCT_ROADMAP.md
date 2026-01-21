# SignalX - Complete Product Roadmap & File Map

**Last Updated:** December 25, 2025  
**Status:** Core features implemented, extensions scaffolded  
**Goal:** Production-ready Signal desktop client with AI, automation, and business features

---

## 📊 Executive Summary

**What SignalX Is:**
A modern Signal messaging desktop client built with Tauri + React, featuring:
- Native desktop app (macOS/Linux/Windows)
- AI-powered message assistance (drafting, summarization)
- Contact management with custom fields
- Automation framework (draft-first, safety-focused)
- Headless/TUI mode capability
- Extensible plugin architecture

**Current State:**
- ✅ Core GUI functional (threads, contacts, messaging)
- ✅ AI integration working (Ollama)
- ✅ Export tools implemented
- ✅ Production builds working
- ⚠️ Extensions scaffolded but not fully integrated
- ⚠️ TUI mode planned but not implemented
- ❌ Automation rules not yet active
- ❌ Plugin system defined but no plugins exist

---

## 📁 Complete File Map

### **Root Structure**
```
signalx/
├── 📄 Core Documentation
│   ├── README.md                    # Main project overview
│   ├── CONTRIBUTING.md              # Contribution guidelines
│   ├── PROJECT_STRUCTURE.md         # This structure overview
│   ├── THE_BASICS.md               # Quick stabilization guide
│   └── PRODUCT_ROADMAP.md          # This file
│
├── 📚 Documentation (docs/)
│   ├── README.md                    # Docs index
│   ├── BUILD.md                     # Build instructions
│   ├── QUICKSTART.md               # Getting started guide
│   ├── STATUS.md                   # Current implementation status
│   ├── NEXT_STEPS.md               # Immediate action items
│   ├── HANDOFF.md                  # Developer handoff doc
│   ├── AESTHETICS_TODO.md          # UI/UX customization guide
│   └── VISION_ASSESSMENT.md        # Vision vs reality analysis
│
├── 🎨 Frontend (src/)
│   ├── main.tsx                    # App entry point
│   ├── App.tsx                     # Main app component
│   ├── App.css                     # App styles
│   ├── index.css                   # Global styles
│   ├── styles.css                  # Additional styles
│   ├── components/                 # React components
│   │   ├── Sidebar.tsx/css         # Navigation sidebar
│   │   ├── TileDashboard.tsx/css   # Dashboard tiles
│   │   ├── ChatPanel.tsx/css       # Message thread view
│   │   ├── ContactsPanel.tsx/css   # Contact management
│   │   ├── ThreadsPanel.tsx/css    # Thread list
│   │   ├── AIToolsPanel.tsx/css    # AI features
│   │   ├── DevicePanel.tsx/css     # Device management
│   │   ├── ToolsPanel.tsx          # Tools panel
│   │   ├── LoginModal.tsx          # Login dialog
│   │   ├── SettingsModal.tsx       # Settings dialog
│   │   ├── NewMessageModal.tsx     # New message dialog
│   │   ├── DiagnosticsModal.tsx    # System diagnostics
│   │   ├── ErrorBoundary.tsx       # Error handling
│   │   ├── Toast.tsx               # Toast notifications
│   │   └── SkipLink.tsx            # Accessibility helper
│   ├── utils/
│   │   └── accessibility.ts        # A11y utilities
│   └── test/
│       └── setup.ts                # Test configuration
│
├── 🦀 Backend (src-tauri/)
│   ├── Cargo.toml                  # Rust dependencies
│   ├── tauri.conf.json            # Tauri configuration
│   ├── build.rs                    # Build script
│   ├── src/
│   │   ├── main.rs                 # Main Tauri app & commands
│   │   ├── lib.rs                  # Library exports
│   │   ├── auth.rs                 # Authentication (scaffolded)
│   │   ├── storage.rs              # Data storage (scaffolded)
│   │   ├── features.rs             # Feature flags (scaffolded)
│   │   ├── rules.rs                # Automation rules (scaffolded)
│   │   └── bin/
│   │       └── headless.rs         # Headless mode binary
│   ├── icons/                      # App icons (all platforms)
│   ├── capabilities/
│   │   └── default.json           # Tauri permissions
│   └── gen/schemas/               # Generated schemas
│
├── 📦 Extension Packages (packages/)
│   ├── README.md                   # Packages overview
│   ├── signal_auth_permissions/
│   │   └── README.md              # Auth system (planned)
│   ├── signal_automation_rules/
│   │   └── README.md              # Rule engine (planned)
│   ├── signal_automation_scaffolding/
│   │   ├── README.md              # Automation framework
│   │   ├── docs/automation_scaffolding.md
│   │   └── src/automation/
│   │       ├── types.ts           # Type definitions ✅
│   │       ├── rules.ts           # Rule definitions
│   │       ├── engine.ts          # Automation engine
│   │       └── outbox.ts          # Message queue
│   ├── signal_config_secrets/
│   │   ├── README.md              # Config management
│   │   ├── docs/config_secrets.md
│   │   └── src/config/
│   │       └── env.ts             # Environment handling
│   ├── signal_data_storage/
│   │   └── README.md              # Storage layer (planned)
│   ├── signal_layout_intelligence/
│   │   ├── README.md              # Layout system
│   │   ├── docs/layout_intelligence.md
│   │   └── src/layout/
│   │       ├── layoutStore.ts     # Layout state ✅
│   │       ├── resizer.ts         # Resize handlers
│   │       └── snapPoints.ts      # Snap-to-grid
│   ├── signal_logging_observability/
│   │   ├── README.md              # Logging system
│   │   ├── docs/logging_observability.md
│   │   └── src/logging/
│   │       └── logger.ts          # Logger implementation
│   ├── signal_packaging_release/
│   │   ├── README.md              # Release management
│   │   ├── docs/packaging_release.md
│   │   ├── VERSION                # Version file
│   │   └── RELEASE_NOTES_TEMPLATE.md
│   ├── signal_plugin_system/
│   │   ├── README.md              # Plugin framework
│   │   ├── docs/plugin_system.md
│   │   └── src/plugins/
│   │       ├── types.ts           # Plugin types ✅
│   │       └── registry.ts        # Plugin registry
│   ├── signal_testing_ci/
│   │   ├── README.md              # Testing framework
│   │   ├── docs/testing_ci.md
│   │   └── scripts/
│   │       ├── preflight.sh       # Pre-flight checks
│   │       └── smoke.sh           # Smoke tests
│   └── signal_tui_headless_mode/
│       ├── README.md              # TUI/headless mode
│       ├── docs/tui_headless.md
│       └── cli/
│           ├── package.json       # TUI dependencies
│           └── src/
│               ├── index.ts       # TUI entry point
│               └── ui.ts          # TUI interface
│
├── 🔧 Scripts (scripts/)
│   ├── README.md                  # Scripts documentation
│   ├── setup/                     # Setup scripts
│   │   ├── setup-ai.sh           # AI setup (Ollama)
│   │   ├── apply-signalx-cursor-bundle.sh
│   │   └── _signalx_cursor_bundle.sh
│   ├── dev/                       # Development scripts
│   │   ├── run-dev.sh            # Dev server
│   │   ├── run-all.sh            # Full stack dev
│   │   ├── SignalX-Dev.command   # macOS launcher ✅
│   │   └── SignalX-Dev-Launcher.applescript
│   ├── signal-cli/                # Signal CLI integration
│   │   ├── signal-cli-check.sh
│   │   ├── signal-cli-link.sh
│   │   ├── signal-cli-link-debug.sh
│   │   ├── link-signal-cli.sh
│   │   ├── link-signal.sh
│   │   ├── link-live.sh
│   │   ├── link-now.sh
│   │   ├── run-signal-link.sh
│   │   ├── run-signal-link-qr.sh
│   │   ├── use-signalx-number.sh
│   │   └── fix-zshrc-and-signal-cli.sh
│   ├── testing/                   # Testing scripts
│   │   ├── test-features.sh      # Feature tests
│   │   └── verify-build.sh       # Build verification
│   └── build/                     # Build scripts (future)
│
├── 🛠️ Tools (tools/)
│   ├── index.html                 # Tools dashboard
│   └── signalx_features.py        # Feature flag manager
│
├── 🗂️ Binary (bin/)
│   └── signalx                    # CLI wrapper
│
├── ⚙️ Configuration Files
│   ├── package.json               # Node dependencies
│   ├── package-lock.json          # Locked versions
│   ├── tsconfig.json              # TypeScript config
│   ├── vite.config.ts             # Vite bundler config
│   ├── vitest.config.ts           # Test runner config
│   ├── .signalx.env               # Environment variables (gitignored)
│   ├── .gitignore                 # Git ignore rules
│   ├── .editorconfig              # Editor settings
│   ├── .prettierrc                # Code formatter
│   └── .nvmrc                     # Node version
│
└── 📊 Runtime Data (not in repo)
    └── ~/Library/Application Support/SignalX/
        ├── threads/               # Thread state files
        ├── aliases/               # Contact aliases
        ├── export/                # Exported threads
        ├── outbox/                # Message queue
        └── search/                # Search indices
```

---

## 🎯 Feature Status Matrix

### ✅ **COMPLETED & WORKING**

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| **GUI App** | ✅ | `src/App.tsx` | Full React interface |
| **Tauri Backend** | ✅ | `src-tauri/src/main.rs` | All core commands implemented |
| **Thread Management** | ✅ | Main backend | Load/display/send messages |
| **Contact Management** | ✅ | Main backend | Custom fields, search, metadata |
| **Group Support** | ✅ | Main backend | Group metadata, categories |
| **AI Integration** | ✅ | Main backend | Draft, summarize via Ollama |
| **Message Export** | ✅ | Main backend | TXT/JSON export |
| **Health Monitoring** | ✅ | Sidebar component | Color-coded status badge |
| **Production Build** | ✅ | `npm run tauri:build` | DMG/App bundle working |
| **Outbox/Queue** | ✅ | Main backend | Reliable message sending |
| **Search** | ✅ | Main backend | Thread/contact/group search |
| **Agent Mode** | ✅ | Headless binary | Draft-only, no auto-send |

### ⚠️ **PARTIALLY IMPLEMENTED**

| Feature | Status | Location | What's Missing |
|---------|--------|----------|----------------|
| **Layout Intelligence** | ⚠️ | `packages/signal_layout_intelligence/` | TypeScript defined, not integrated into UI |
| **Automation Scaffolding** | ⚠️ | `packages/signal_automation_scaffolding/` | Types defined, engine not connected |
| **Plugin System** | ⚠️ | `packages/signal_plugin_system/` | Framework defined, no actual plugins |
| **Logging/Observability** | ⚠️ | `packages/signal_logging_observability/` | Logger exists, not integrated |
| **Testing Framework** | ⚠️ | `packages/signal_testing_ci/` | Scripts exist, not comprehensive |

### ❌ **PLANNED BUT NOT IMPLEMENTED**

| Feature | Status | Location | Priority |
|---------|--------|----------|----------|
| **TUI Mode** | ❌ | `packages/signal_tui_headless_mode/cli/` | HIGH - Original vision |
| **Keyboard Shortcuts** | ❌ | Not started | HIGH - Power user need |
| **Auto-Reply System** | ❌ | Rules scaffolded only | HIGH - Key automation feature |
| **Auth/Permissions** | ❌ | `packages/signal_auth_permissions/` | MEDIUM - Multi-user |
| **Advanced Rules Engine** | ❌ | `packages/signal_automation_rules/` | MEDIUM - Conditional automation |
| **Data Storage Layer** | ❌ | `packages/signal_data_storage/` | MEDIUM - SQLite persistence |
| **Business/Trackr Integration** | ❌ | Not started | LOW - Placeholders only |
| **Media Handling** | ❌ | Not started | MEDIUM - Images/videos |
| **Desktop Notifications** | ❌ | Not started | MEDIUM - UX improvement |
| **Message Reactions** | ❌ | Not started | LOW - Nice to have |
| **Thread Search** | ❌ | Not started | MEDIUM - Within-thread search |

---

## 🚀 Development Roadmap

### **Phase 1: Core Stabilization** (CURRENT)
**Goal:** Ensure existing features work reliably

#### Tasks:
1. ✅ Fix all compilation errors
2. ✅ Verify GUI functionality (threads, send, receive)
3. ✅ Test production build
4. ✅ Document current state
5. ⚠️ Run comprehensive smoke tests
6. ⚠️ Fix any discovered bugs

**Timeline:** Complete  
**Blockers:** None  
**Success Criteria:** App runs without crashes, messages send/receive reliably

---

### **Phase 2: Original Vision Features** (NEXT)
**Goal:** Align with original TUI + automation vision

#### 2.1 TUI Mode Implementation
**Priority:** HIGH  
**Effort:** 2-3 weeks  
**Dependencies:** Core stabilization complete

**Tasks:**
- [ ] Add `ratatui` or `crossterm` dependency to Rust
- [ ] Create `src-tauri/src/tui.rs` module
- [ ] Implement keyboard-driven thread navigation
- [ ] Build message composer in terminal
- [ ] Add `--tui` flag to launch TUI instead of GUI
- [ ] Share backend commands between GUI and TUI
- [ ] Document TUI keyboard shortcuts

**Files to Create:**
- `src-tauri/src/tui.rs` - Main TUI module
- `src-tauri/src/tui/` - TUI components directory
  - `layout.rs` - Terminal layout manager
  - `input.rs` - Keyboard input handler
  - `render.rs` - Terminal rendering
- `docs/TUI_GUIDE.md` - TUI user guide

**Integration Points:**
- Reuse all commands from `main.rs`
- Use existing thread/message data structures
- Connect to same Signal CLI backend

---

#### 2.2 Keyboard Shortcuts (GUI)
**Priority:** HIGH  
**Effort:** 1 week  
**Dependencies:** None

**Tasks:**
- [ ] Add keyboard event handler to `App.tsx`
- [ ] Implement thread navigation (j/k, arrows)
- [ ] Add quick send shortcut (Cmd/Ctrl+Enter)
- [ ] Create search shortcut (Cmd/Ctrl+K)
- [ ] Add settings shortcut (Cmd/Ctrl+,)
- [ ] Show shortcut hints in UI
- [ ] Add "Keyboard Shortcuts" help modal

**Files to Modify:**
- `src/App.tsx` - Add global keyboard listener
- `src/components/ChatPanel.tsx` - Send shortcuts
- `src/components/ThreadsPanel.tsx` - Navigation shortcuts
- `src/components/SettingsModal.tsx` - Shortcuts documentation

**New Files:**
- `src/utils/shortcuts.ts` - Shortcut definitions and handler
- `src/components/ShortcutsModal.tsx` - Help dialog

---

#### 2.3 Auto-Reply System
**Priority:** HIGH  
**Effort:** 2 weeks  
**Dependencies:** Phase 1 complete

**Tasks:**
- [ ] Complete `src-tauri/src/rules.rs` implementation
- [ ] Add rule evaluation to message receive loop
- [ ] Create safety mechanisms:
  - Per-thread "Armed" toggle in UI
  - Feature flag: `automation.autoreply` (default OFF)
  - Dry-run mode for testing
- [ ] Build UI for rule management
- [ ] Add rule templates (time-based, keyword-based, etc.)
- [ ] Implement rate limiting to prevent spam
- [ ] Add logging for all auto-replies

**Files to Create/Modify:**
- `src-tauri/src/rules.rs` - Complete implementation
- `src/components/AutoReplyPanel.tsx` - Rule management UI
- `src/components/ThreadHeader.tsx` - Add "Armed" toggle
- `packages/signal_automation_rules/README.md` - Update docs

**Safety Requirements:**
- Never auto-send without explicit per-thread permission
- Log every auto-reply with timestamp and reason
- Provide easy disable/pause mechanism
- Show preview before enabling auto-reply

---

### **Phase 3: Extension Integration** (MEDIUM PRIORITY)
**Goal:** Activate scaffolded packages

#### 3.1 Layout Intelligence Integration
**Priority:** MEDIUM  
**Effort:** 1 week  

**Tasks:**
- [ ] Import layout store into `App.tsx`
- [ ] Add resize handlers to sidebar/composer
- [ ] Implement snap points
- [ ] Add workspace presets to settings
- [ ] Persist layout state
- [ ] Add double-click reset

**Files to Modify:**
- `src/App.tsx` - Use layout store
- `src/components/Sidebar.tsx` - Add resize handle
- `src/components/ChatPanel.tsx` - Add composer resize
- `src/components/SettingsModal.tsx` - Workspace presets

---

#### 3.2 Plugin System Activation
**Priority:** MEDIUM  
**Effort:** 2 weeks  

**Tasks:**
- [ ] Complete plugin registry implementation
- [ ] Create sample plugins:
  - Message templates plugin
  - Quick replies plugin
  - Custom tool plugin
- [ ] Add plugin discovery mechanism
- [ ] Build plugin settings UI
- [ ] Document plugin development guide

**Files to Create:**
- `src/plugins/` - Plugin directory
  - `templates/` - Template plugin
  - `quickreplies/` - Quick reply plugin
- `docs/PLUGIN_DEVELOPMENT.md` - Plugin guide

---

#### 3.3 Enhanced Logging
**Priority:** MEDIUM  
**Effort:** 1 week  

**Tasks:**
- [ ] Integrate logging package into backend
- [ ] Add structured log levels
- [ ] Create log viewer panel (feature-flagged)
- [ ] Add log export functionality
- [ ] Implement sensitive data redaction

**Files to Modify:**
- `src-tauri/src/main.rs` - Add logger initialization
- `src-tauri/src/lib.rs` - Export logging utilities

**New Files:**
- `src/components/LogViewerPanel.tsx` - Log viewer UI

---

### **Phase 4: Advanced Features** (LOWER PRIORITY)
**Goal:** Nice-to-have enhancements

#### 4.1 Media Handling
**Priority:** MEDIUM  
**Effort:** 3 weeks  

**Tasks:**
- [ ] Add image send/receive support
- [ ] Implement image preview in threads
- [ ] Add video support
- [ ] File attachment handling
- [ ] Media gallery view

---

#### 4.2 Desktop Notifications
**Priority:** MEDIUM  
**Effort:** 1 week  

**Tasks:**
- [ ] Add Tauri notification plugin
- [ ] Implement notification on new message
- [ ] Add notification preferences
- [ ] Support notification actions (reply, mark read)

---

#### 4.3 Business/Trackr Integration
**Priority:** LOW  
**Effort:** 4+ weeks (depends on requirements)

**Tasks:**
- [ ] Define Trackr API schema
- [ ] Create inventory lookup commands
- [ ] Build pricing calculator
- [ ] Add product catalog browser
- [ ] Implement order tracking

---

#### 4.4 Authentication System
**Priority:** LOW (unless multi-user needed)  
**Effort:** 2 weeks  

**Tasks:**
- [ ] Complete `src-tauri/src/auth.rs`
- [ ] Fix argon2 password hashing
- [ ] Build login UI
- [ ] Add user management
- [ ] Implement role-based permissions

---

### **Phase 5: Quality & Distribution** (ONGOING)
**Goal:** Production-ready quality

#### 5.1 Comprehensive Testing
**Priority:** HIGH  
**Effort:** Ongoing  

**Tasks:**
- [ ] Expand unit test coverage
- [ ] Add integration tests
- [ ] Create end-to-end test suite (Playwright)
- [ ] Set up CI/CD pipeline
- [ ] Add automated smoke tests

**Files to Create:**
- `tests/integration/` - Integration test suite
- `tests/e2e/` - End-to-end tests
- `.github/workflows/ci.yml` - CI pipeline

---

#### 5.2 Distribution & Packaging
**Priority:** MEDIUM  
**Effort:** 1 week  

**Tasks:**
- [ ] Set up code signing (macOS)
- [ ] Create installer scripts
- [ ] Build update mechanism
- [ ] Set up release automation
- [ ] Create distribution channels

---

#### 5.3 Documentation
**Priority:** HIGH  
**Effort:** Ongoing  

**Tasks:**
- [ ] User guide (with screenshots)
- [ ] Video tutorials
- [ ] API documentation
- [ ] Plugin development guide
- [ ] Troubleshooting guide
- [ ] FAQ

---

## 📋 Implementation Guidelines

### **Development Workflow**

1. **Feature Branch Strategy**
   ```bash
   git checkout -b feature/tui-mode
   # Develop feature
   git commit -am "Add TUI mode implementation"
   git push origin feature/tui-mode
   # Create PR for review
   ```

2. **Testing Before Merge**
   ```bash
   npm run test              # Run unit tests
   npm run lint              # Check code style
   ./scripts/testing/preflight.sh  # Pre-flight checks
   npm run tauri:build       # Verify production build
   ```

3. **Code Review Checklist**
   - [ ] All tests pass
   - [ ] No linter errors
   - [ ] Documentation updated
   - [ ] Changelog entry added
   - [ ] Feature flag added (if applicable)

### **Architecture Principles**

1. **Safety First**
   - All automation is opt-in
   - Draft-first for any auto-send features
   - Explicit user confirmation for destructive actions
   - Rate limiting on automated messages

2. **Backend as Source of Truth**
   - All state managed in Rust backend
   - Frontend uses events, not polling
   - Persist critical data to disk immediately

3. **Feature Flags**
   - All experimental features behind flags
   - Use `tools/signalx_features.py` to manage
   - Document default flag states

4. **Modular Design**
   - Packages are independent
   - Clear integration points
   - Easy to enable/disable features

### **Code Style**

**TypeScript/React:**
- Use functional components with hooks
- TypeScript for all new code
- CSS modules for component styles
- ESLint + Prettier for formatting

**Rust:**
- Follow Rust conventions (rustfmt)
- Use `Result<T, E>` for error handling
- Async/await for I/O operations
- Document public APIs with doc comments

### **Testing Strategy**

**Unit Tests:**
- Test business logic in isolation
- Mock external dependencies
- Aim for 80%+ coverage

**Integration Tests:**
- Test component interactions
- Use real Signal CLI in test mode
- Verify data persistence

**E2E Tests:**
- Test complete user workflows
- Automated UI testing with Playwright
- Run on multiple platforms

---

## 🎓 Getting to Production

### **Minimum Viable Product (MVP) Checklist**

#### Core Functionality
- [x] Send/receive messages reliably
- [x] Thread management
- [x] Contact management
- [x] Production build works
- [ ] No crashes on normal usage
- [ ] Data persists across restarts

#### UX Requirements
- [x] Intuitive UI layout
- [ ] Keyboard shortcuts functional
- [ ] Fast response times (< 100ms for UI actions)
- [ ] Clear error messages
- [ ] Helpful loading states

#### Quality Assurance
- [ ] All smoke tests pass
- [ ] No memory leaks
- [ ] No security vulnerabilities
- [ ] Privacy-preserving (no telemetry without consent)
- [ ] Accessible (WCAG 2.1 AA)

#### Documentation
- [x] User quick start guide
- [x] Build instructions
- [ ] Troubleshooting guide
- [ ] Video demo
- [ ] FAQ

#### Distribution
- [ ] Code signed (macOS)
- [ ] Installer created
- [ ] Release notes written
- [ ] Update mechanism working
- [ ] Support channel established

---

### **Phase-by-Phase Release Strategy**

#### **v0.1.0 - Alpha** (Current)
**Focus:** Core messaging works  
**Audience:** Internal testing only  
**Features:** Send, receive, threads, contacts, basic AI

#### **v0.2.0 - Beta** (Phase 2 Complete)
**Focus:** TUI + automation  
**Audience:** Early adopters, power users  
**Features:** + TUI mode, keyboard shortcuts, auto-reply (opt-in)

#### **v0.3.0 - RC** (Phase 3 Complete)
**Focus:** Extension integration  
**Audience:** Public beta  
**Features:** + Layout intelligence, plugins, enhanced logging

#### **v1.0.0 - Production** (Phase 5 Complete)
**Focus:** Stable, documented, distributed  
**Audience:** General public  
**Features:** All MVP requirements met, comprehensive docs

#### **v1.x - Enhancements** (Phase 4)
**Focus:** Advanced features  
**Audience:** All users  
**Features:** Media, notifications, business integration

---

## 🔧 Development Setup Guides

### **Quick Start for New Developers**

```bash
# 1. Clone repository
git clone <repo-url>
cd signalx

# 2. Install dependencies
npm install

# 3. Set up Signal CLI
brew install signal-cli
# Link your Signal account (see docs/QUICKSTART.md)

# 4. Configure environment
cp .signalx.env.example .signalx.env
# Edit .signalx.env with your settings

# 5. Run development server
./scripts/dev/SignalX-Dev.command

# 6. Run tests
npm run test
```

### **Working on Specific Features**

#### TUI Development:
```bash
# Add TUI dependencies
cd src-tauri
cargo add ratatui crossterm

# Run in TUI mode
cargo run -- --tui

# Or build TUI binary
cargo build --release --bin signalx-tui
```

#### Plugin Development:
```bash
# Create new plugin
mkdir -p src/plugins/my-plugin
cd src/plugins/my-plugin
# Follow packages/signal_plugin_system/docs/plugin_system.md

# Test plugin
npm run dev  # Plugin should appear in Tools menu
```

#### Package Integration:
```bash
# Import package into main app
# Example: Layout intelligence

# In App.tsx:
import { loadLayout, saveLayout } from '../packages/signal_layout_intelligence/src/layout/layoutStore'

# Use in component
const [layout, setLayout] = useState(loadLayout())
```

---

## 📞 Support & Resources

### **Documentation**
- Quick Start: `docs/QUICKSTART.md`
- Build Guide: `docs/BUILD.md`
- Vision: `docs/VISION_ASSESSMENT.md`
- Status: `docs/STATUS.md`

### **Scripts**
- Dev Launcher: `./scripts/dev/SignalX-Dev.command`
- Feature Tests: `./scripts/testing/test-features.sh`
- Build Verify: `./scripts/testing/verify-build.sh`

### **Tools**
- Feature Flags: `python3 tools/signalx_features.py list`
- Signal CLI Check: `./scripts/signal-cli/signal-cli-check.sh`

### **Logs**
- Dev Log: `run-dev.command.log`
- App Data: `~/Library/Application Support/SignalX/`

---

## 🎯 Success Metrics

### **Technical Metrics**
- Build time: < 2 minutes
- Test coverage: > 80%
- Performance: UI response < 100ms
- Memory usage: < 200MB idle
- Bundle size: < 50MB

### **User Metrics**
- Time to first message: < 30 seconds
- Messages sent/day: Track usage
- Feature adoption: Monitor feature flags
- Crash rate: < 0.1%
- Support tickets: Track issues

---

## 🗺️ Long-Term Vision

**Year 1:**
- Stable desktop app on macOS/Linux/Windows
- TUI mode for power users
- Basic automation working
- Small but active user base

**Year 2:**
- Rich plugin ecosystem
- Business features (Trackr integration)
- Mobile companion app (stretch)
- Community contributions

**Year 3:**
- Industry-standard Signal client
- Enterprise features
- White-label options
- Sustainable revenue model

---

## ✅ Next Immediate Actions (Priority Order)

1. **Run Smoke Tests** (30 minutes)
   ```bash
   ./scripts/testing/test-features.sh
   ./scripts/dev/SignalX-Dev.command
   # Manually test: send, receive, restart
   ```

2. **Fix Any Bugs Found** (1-2 days)
   - Document issues
   - Create bug fix branch
   - Test fixes thoroughly

3. **Start TUI Development** (2-3 weeks)
   - Create feature branch
   - Add ratatui dependency
   - Build basic TUI layout
   - Test keyboard navigation

4. **Implement Keyboard Shortcuts** (1 week)
   - Can be parallel with TUI
   - Quick win for power users
   - Improves GUI experience

5. **Build Auto-Reply System** (2 weeks)
   - Complete rules.rs
   - Add UI controls
   - Extensive safety testing

---

**This roadmap is a living document. Update as priorities change and features are completed.**

**Last Review:** December 25, 2025  
**Next Review:** After Phase 2 completion or major milestone

