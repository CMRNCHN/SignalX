# SignalX - Implementation Guide
## From Current State to Finished Product

**Created:** December 25, 2025  
**Purpose:** Step-by-step guide to complete SignalX development  
**Prerequisite:** Read `PRODUCT_ROADMAP.md` first

---

## 🎯 Overview

This guide provides concrete, actionable steps to transform SignalX from its current state (core features working, extensions scaffolded) into a production-ready product.

**Current State:** ✅ Core messaging works, ⚠️ Extensions incomplete, ❌ TUI missing  
**Target State:** ✅ All features functional, ✅ Production quality, ✅ Well documented

---

## 📊 Development Phases

### **Phase 1: Stabilization & Testing** ⚡ START HERE
**Duration:** 1 week  
**Goal:** Ensure existing features work perfectly

### **Phase 2: Original Vision Features** 🎨
**Duration:** 5-6 weeks  
**Goal:** TUI mode, keyboard shortcuts, auto-reply

### **Phase 3: Extension Integration** 🔌
**Duration:** 4 weeks  
**Goal:** Activate scaffolded packages

### **Phase 4: Production Readiness** 🚀
**Duration:** 2-3 weeks  
**Goal:** Testing, docs, distribution

---

## Phase 1: Stabilization & Testing (Week 1)

### Day 1-2: Smoke Testing & Bug Discovery

#### Step 1: Environment Setup
```bash
cd /Users/cameroncohen/Developer/apps/signalx

# Verify configuration
cat .signalx.env
# Should contain:
# SIGNALX_SIGNALCLI_CONFIG
# SIGNALX_NUMBER
# SIGNALX_SIGNALCLI_BIN

# Check dependencies
./scripts/testing/test-features.sh
```

#### Step 2: Run Application
```bash
# Launch dev mode
./scripts/dev/SignalX-Dev.command

# Watch logs
tail -f run-dev.command.log
```

#### Step 3: Manual Testing
Test each feature systematically:

- [ ] **Account Management**
  - Switch accounts
  - Verify account loads correctly
  - Check diagnostics panel

- [ ] **Thread Management**
  - List threads
  - Open thread
  - See message history
  - Unread count updates

- [ ] **Messaging**
  - Send message
  - Receive message (use another device)
  - Message appears in both devices
  - Delivery confirmation

- [ ] **Search**
  - Search threads
  - Search contacts
  - Search groups
  - Verify results

- [ ] **Contacts**
  - View contact list
  - Edit contact (add custom field)
  - Set alias
  - Search contacts

- [ ] **Export**
  - Select thread
  - Export as TXT
  - Export as JSON
  - Verify files created
  - Open folder button works

- [ ] **AI Features** (if Ollama configured)
  - Summarize thread
  - Draft reply
  - Verify draft appears (doesn't auto-send)

- [ ] **Persistence**
  - Restart app
  - Verify threads persist
  - Verify aliases persist
  - Check data directory

#### Step 4: Document Bugs
Create a bug list in `BUGS.md`:
```markdown
# Bug List

## Critical (Blocks usage)
- [ ] Bug description
  - Steps to reproduce
  - Expected behavior
  - Actual behavior

## High (Major inconvenience)
- [ ] Bug description

## Medium (Minor issue)
- [ ] Bug description

## Low (Enhancement)
- [ ] Bug description
```

### Day 3-4: Bug Fixes

#### Bug Fix Workflow
For each bug:

1. **Create branch**
   ```bash
   git checkout -b fix/bug-description
   ```

2. **Identify root cause**
   - Check logs: `run-dev.command.log`
   - Use diagnostics panel
   - Add debug logging if needed

3. **Implement fix**
   - Make minimal changes
   - Follow existing code style
   - Add comments if complex

4. **Test fix**
   ```bash
   npm run lint
   npm run test
   ./scripts/testing/test-features.sh
   ```

5. **Commit and merge**
   ```bash
   git commit -am "Fix: [bug description]"
   git checkout main
   git merge fix/bug-description
   ```

### Day 5: Production Build Testing

#### Build & Test
```bash
# Clean build
npm run tauri:build

# Verify build output
ls -lh src-tauri/target/release/bundle/macos/SignalX.app

# Test production app
open src-tauri/target/release/bundle/macos/SignalX.app

# Full test cycle (30 minutes)
# - Send/receive messages
# - Search functionality
# - Export features
# - App restart (persistence)
# - No console errors
```

### Day 6-7: Documentation Updates

#### Update Docs
1. **Update STATUS.md**
   - Mark bugs as fixed
   - Update feature status
   - Add testing notes

2. **Update QUICKSTART.md**
   - Verify all instructions work
   - Add troubleshooting tips
   - Update screenshots if needed

3. **Create TESTING.md**
   ```markdown
   # Testing Guide
   
   ## Automated Tests
   - Unit tests: `npm run test`
   - Feature tests: `./scripts/testing/test-features.sh`
   
   ## Manual Tests
   - Smoke test checklist
   - Regression test checklist
   
   ## Bug Reporting
   - Where to report
   - What information to include
   ```

---

## Phase 2: Original Vision Features (Weeks 2-7)

### Week 2-4: TUI Mode Implementation

#### Week 2: Setup & Layout

**Monday: Dependency Setup**
```bash
cd src-tauri

# Add TUI dependencies
cargo add ratatui crossterm --features crossterm/event-stream
cargo add tokio --features full

# Verify compilation
cargo check
```

**Tuesday: Create TUI Module**
```bash
# Create directory structure
mkdir -p src/tui
touch src/tui/mod.rs
touch src/tui/app.rs
touch src/tui/ui.rs
touch src/tui/events.rs
```

File: `src-tauri/src/tui/mod.rs`
```rust
pub mod app;
pub mod ui;
pub mod events;

pub use app::TuiApp;
```

File: `src-tauri/src/tui/app.rs`
```rust
use std::io;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    Terminal,
};

pub struct TuiApp {
    pub should_quit: bool,
    pub selected_thread: usize,
    pub threads: Vec<String>,
}

impl TuiApp {
    pub fn new() -> Self {
        Self {
            should_quit: false,
            selected_thread: 0,
            threads: vec![],
        }
    }

    pub async fn run(&mut self) -> io::Result<()> {
        // Setup terminal
        enable_raw_mode()?;
        let mut stdout = io::stdout();
        execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
        let backend = CrosstermBackend::new(stdout);
        let mut terminal = Terminal::new(backend)?;

        // Main loop
        while !self.should_quit {
            terminal.draw(|f| super::ui::draw(f, self))?;
            self.handle_events().await?;
        }

        // Cleanup
        disable_raw_mode()?;
        execute!(
            terminal.backend_mut(),
            LeaveAlternateScreen,
            DisableMouseCapture
        )?;
        terminal.show_cursor()?;

        Ok(())
    }

    async fn handle_events(&mut self) -> io::Result<()> {
        if event::poll(std::time::Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                match key.code {
                    KeyCode::Char('q') => self.should_quit = true,
                    KeyCode::Char('j') | KeyCode::Down => {
                        if self.selected_thread < self.threads.len().saturating_sub(1) {
                            self.selected_thread += 1;
                        }
                    }
                    KeyCode::Char('k') | KeyCode::Up => {
                        if self.selected_thread > 0 {
                            self.selected_thread -= 1;
                        }
                    }
                    _ => {}
                }
            }
        }
        Ok(())
    }
}
```

File: `src-tauri/src/tui/ui.rs`
```rust
use ratatui::{
    backend::Backend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use super::app::TuiApp;

pub fn draw<B: Backend>(f: &mut Frame<B>, app: &TuiApp) {
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(30),
            Constraint::Percentage(70),
        ])
        .split(f.size());

    // Thread list (left panel)
    let threads: Vec<ListItem> = app
        .threads
        .iter()
        .enumerate()
        .map(|(i, t)| {
            let style = if i == app.selected_thread {
                Style::default().bg(Color::DarkGray).fg(Color::White)
            } else {
                Style::default()
            };
            ListItem::new(Line::from(t.as_str())).style(style)
        })
        .collect();

    let threads_widget = List::new(threads)
        .block(Block::default().title("Threads").borders(Borders::ALL));

    f.render_widget(threads_widget, chunks[0]);

    // Message panel (right panel)
    let message_panel = Paragraph::new("Messages will appear here")
        .block(Block::default().title("Messages").borders(Borders::ALL));

    f.render_widget(message_panel, chunks[1]);

    // Status bar
    let status = Paragraph::new(Line::from(vec![
        Span::raw("Press "),
        Span::styled("q", Style::default().add_modifier(Modifier::BOLD)),
        Span::raw(" to quit, "),
        Span::styled("j/k", Style::default().add_modifier(Modifier::BOLD)),
        Span::raw(" to navigate"),
    ]))
    .style(Style::default().bg(Color::DarkGray));

    // This would go in a bottom bar - implement with additional layout split
}
```

**Wednesday: Add TUI Binary**
File: `src-tauri/src/bin/tui.rs`
```rust
use app_lib::tui::TuiApp;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut app = TuiApp::new();
    app.run().await?;
    Ok(())
}
```

Update `Cargo.toml`:
```toml
[[bin]]
name = "signalx-tui"
path = "src/bin/tui.rs"
```

**Thursday: Connect to Backend**
- Import thread loading logic from `main.rs`
- Add command to fetch threads
- Display real thread data in TUI
- Test navigation

**Friday: Testing & Refinement**
```bash
# Build TUI
cargo build --bin signalx-tui

# Run TUI
./target/debug/signalx-tui

# Test:
# - Threads appear
# - Navigation works (j/k)
# - Quit works (q)
```

#### Week 3: Message Display & Composer

**Tasks:**
1. Split right panel into messages + composer
2. Load and display messages for selected thread
3. Implement message composer
4. Add send functionality
5. Real-time message updates

**Key Files:**
- `src/tui/app.rs` - Add message state
- `src/tui/ui.rs` - Layout with composer
- `src/tui/input.rs` - Text input handling

#### Week 4: Polish & Features

**Tasks:**
1. Add search interface
2. Implement contact view
3. Add settings panel
4. Keyboard shortcuts help
5. Colors and styling
6. Error handling
7. Documentation

**Deliverable:** Fully functional TUI mode

---

### Week 5: Keyboard Shortcuts (GUI)

#### Monday-Tuesday: Shortcut System

File: `src/utils/shortcuts.ts`
```typescript
export type ShortcutKey = string;
export type ShortcutHandler = (e: KeyboardEvent) => void;

export interface Shortcut {
  key: ShortcutKey;
  description: string;
  handler: ShortcutHandler;
  category: 'navigation' | 'messaging' | 'tools' | 'general';
}

export class ShortcutManager {
  private shortcuts: Map<ShortcutKey, Shortcut> = new Map();

  register(shortcut: Shortcut) {
    this.shortcuts.set(shortcut.key, shortcut);
  }

  handle(e: KeyboardEvent): boolean {
    const key = this.getKeyString(e);
    const shortcut = this.shortcuts.get(key);
    
    if (shortcut) {
      e.preventDefault();
      shortcut.handler(e);
      return true;
    }
    return false;
  }

  private getKeyString(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.metaKey || e.ctrlKey) parts.push('Cmd');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    parts.push(e.key);
    return parts.join('+');
  }

  getAllShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }
}

export const shortcuts = new ShortcutManager();

// Define shortcuts
shortcuts.register({
  key: 'Cmd+k',
  description: 'Search threads and contacts',
  category: 'navigation',
  handler: () => {
    // Open search modal
    document.querySelector('[data-search-trigger]')?.click();
  },
});

shortcuts.register({
  key: 'Cmd+Enter',
  description: 'Send message',
  category: 'messaging',
  handler: () => {
    document.querySelector('[data-send-button]')?.click();
  },
});

// Add more shortcuts...
```

#### Wednesday: Integrate into App

Update `src/App.tsx`:
```typescript
import { useEffect } from 'react';
import { shortcuts } from './utils/shortcuts';

function App() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      shortcuts.handle(e);
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ... rest of app
}
```

#### Thursday-Friday: Shortcuts UI & Help

File: `src/components/ShortcutsModal.tsx`
```typescript
import React from 'react';
import { shortcuts } from '../utils/shortcuts';

export function ShortcutsModal({ isOpen, onClose }: Props) {
  const allShortcuts = shortcuts.getAllShortcuts();
  const byCategory = groupBy(allShortcuts, 'category');

  return (
    <div className={`modal ${isOpen ? 'open' : ''}`}>
      <div className="modal-content">
        <h2>Keyboard Shortcuts</h2>
        
        {Object.entries(byCategory).map(([category, shortcuts]) => (
          <div key={category} className="shortcut-category">
            <h3>{category}</h3>
            {shortcuts.map(s => (
              <div key={s.key} className="shortcut-row">
                <kbd>{s.key}</kbd>
                <span>{s.description}</span>
              </div>
            ))}
          </div>
        ))}
        
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
```

**Deliverable:** Full keyboard navigation in GUI

---

### Week 6-7: Auto-Reply System

#### Week 6: Backend Implementation

**Monday-Tuesday: Rules Engine**

File: `src-tauri/src/rules.rs` (complete implementation)
```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub enabled: bool,
    pub name: String,
    pub conditions: Vec<Condition>,
    pub actions: Vec<Action>,
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Condition {
    KeywordMatch { keywords: Vec<String>, case_sensitive: bool },
    SenderMatch { senders: Vec<String> },
    TimeWindow { start: String, end: String },
    ThreadMatch { thread_ids: Vec<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Action {
    SendReply { template: String },
    CreateDraft { template: String },
    AddTag { tag: String },
    Forward { to: String },
}

pub struct RuleEngine {
    rules: Vec<Rule>,
}

impl RuleEngine {
    pub fn new() -> Self {
        Self { rules: vec![] }
    }

    pub fn add_rule(&mut self, rule: Rule) {
        self.rules.push(rule);
        self.rules.sort_by_key(|r| -r.priority);
    }

    pub fn evaluate(&self, message: &IncomingMessage) -> Option<Action> {
        for rule in &self.rules {
            if !rule.enabled {
                continue;
            }

            if self.matches(rule, message) {
                return rule.actions.first().cloned();
            }
        }
        None
    }

    fn matches(&self, rule: &Rule, message: &IncomingMessage) -> bool {
        rule.conditions.iter().all(|c| self.check_condition(c, message))
    }

    fn check_condition(&self, condition: &Condition, message: &IncomingMessage) -> bool {
        match condition {
            Condition::KeywordMatch { keywords, case_sensitive } => {
                let body = if *case_sensitive {
                    message.body.clone()
                } else {
                    message.body.to_lowercase()
                };

                keywords.iter().any(|kw| {
                    let keyword = if *case_sensitive {
                        kw.clone()
                    } else {
                        kw.to_lowercase()
                    };
                    body.contains(&keyword)
                })
            }
            Condition::SenderMatch { senders } => {
                senders.contains(&message.sender)
            }
            Condition::TimeWindow { start, end } => {
                // Implement time check
                true // placeholder
            }
            Condition::ThreadMatch { thread_ids } => {
                thread_ids.contains(&message.thread_id)
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct IncomingMessage {
    pub thread_id: String,
    pub sender: String,
    pub body: String,
    pub timestamp: i64,
}
```

**Wednesday: Safety Mechanisms**

Add to `src-tauri/src/main.rs`:
```rust
#[tauri::command]
fn toggle_auto_reply_armed(
    state: State<AppState>,
    thread_id: String,
    armed: bool,
) -> Result<Value, String> {
    // Store armed state per thread
    let mut armed_threads = state.armed_threads.lock().unwrap();
    if armed {
        armed_threads.insert(thread_id.clone());
    } else {
        armed_threads.remove(&thread_id);
    }

    // Log the change
    log::info!("Auto-reply {} for thread {}", 
        if armed { "ARMED" } else { "DISARMED" },
        thread_id
    );

    Ok(json!({ "success": true, "armed": armed }))
}

// In receive loop:
fn handle_incoming_message(message: IncomingMessage, state: &AppState) {
    // Check if auto-reply is armed for this thread
    let armed = state.armed_threads.lock().unwrap().contains(&message.thread_id);
    
    if armed {
        // Evaluate rules
        if let Some(action) = state.rule_engine.lock().unwrap().evaluate(&message) {
            match action {
                Action::SendReply { template } => {
                    // Apply rate limiting
                    if !check_rate_limit(&message.thread_id, state) {
                        log::warn!("Rate limit exceeded for thread {}", message.thread_id);
                        return;
                    }

                    // Log before sending
                    log::info!("Auto-reply triggered: thread={}, rule={}", 
                        message.thread_id, "rule_id");

                    // Send reply
                    send_auto_reply(&message.thread_id, &template, state);
                }
                Action::CreateDraft { template } => {
                    create_draft(&message.thread_id, &template, state);
                }
                _ => {}
            }
        }
    } else {
        // Always create draft, never auto-send if not armed
        if let Some(action) = state.rule_engine.lock().unwrap().evaluate(&message) {
            if let Action::SendReply { template } = action {
                create_draft(&message.thread_id, &template, state);
            }
        }
    }
}
```

#### Week 7: Frontend UI

**Monday-Wednesday: Rule Management UI**

File: `src/components/AutoReplyPanel.tsx`
```typescript
import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: any[];
  actions: any[];
}

export function AutoReplyPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [editing, setEditing] = useState<Rule | null>(null);

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    const result = await invoke('get_rules');
    setRules(result.data);
  }

  async function saveRule(rule: Rule) {
    await invoke('save_rule', { rule });
    await loadRules();
    setEditing(null);
  }

  async function deleteRule(id: string) {
    if (confirm('Delete this rule?')) {
      await invoke('delete_rule', { ruleId: id });
      await loadRules();
    }
  }

  return (
    <div className="auto-reply-panel">
      <h2>Auto-Reply Rules</h2>
      
      <div className="warning-box">
        ⚠️ Auto-reply must be explicitly armed per thread. Rules create drafts by default.
      </div>

      <button onClick={() => setEditing({ 
        id: '', name: '', enabled: true, conditions: [], actions: [] 
      })}>
        + New Rule
      </button>

      <div className="rules-list">
        {rules.map(rule => (
          <div key={rule.id} className="rule-card">
            <h3>{rule.name}</h3>
            <span className={rule.enabled ? 'enabled' : 'disabled'}>
              {rule.enabled ? '✓ Enabled' : '✗ Disabled'}
            </span>
            <button onClick={() => setEditing(rule)}>Edit</button>
            <button onClick={() => deleteRule(rule.id)}>Delete</button>
          </div>
        ))}
      </div>

      {editing && (
        <RuleEditor 
          rule={editing}
          onSave={saveRule}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
```

**Thursday: Armed Toggle in Thread**

Update `src/components/ThreadHeader.tsx`:
```typescript
function ThreadHeader({ threadId }: Props) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    invoke('get_auto_reply_status', { threadId })
      .then(result => setArmed(result.data.armed));
  }, [threadId]);

  async function toggleArmed() {
    const newArmed = !armed;
    await invoke('toggle_auto_reply_armed', { threadId, armed: newArmed });
    setArmed(newArmed);
  }

  return (
    <div className="thread-header">
      <h2>{threadName}</h2>
      
      <button 
        onClick={toggleArmed}
        className={`armed-toggle ${armed ? 'armed' : 'disarmed'}`}
      >
        {armed ? '🔴 Auto-Reply ARMED' : '⚪ Auto-Reply Off'}
      </button>
    </div>
  );
}
```

**Friday: Testing**
- Create test rules
- Verify drafts are created
- Test armed mode (careful!)
- Check rate limiting
- Verify logging

**Deliverable:** Safe, functional auto-reply system

---

## Phase 3: Extension Integration (Weeks 8-11)

### Week 8: Layout Intelligence

**Tasks:**
1. Import layout store into App.tsx
2. Add resize handles to sidebar
3. Add resize handle to composer
4. Implement snap points
5. Add workspace presets
6. Persist layout changes

**Files to Modify:**
- `src/App.tsx`
- `src/components/Sidebar.tsx`
- `src/components/ChatPanel.tsx`
- `src/components/SettingsModal.tsx`

**Implementation:**
```typescript
// In App.tsx
import { loadLayout, saveLayout, applyHtmlDatasets } from '../packages/signal_layout_intelligence/src/layout/layoutStore';

function App() {
  const [layout, setLayout] = useState(loadLayout());

  useEffect(() => {
    applyHtmlDatasets(layout);
    saveLayout(layout);
  }, [layout]);

  function updateLayout(changes: Partial<LayoutState>) {
    setLayout(prev => ({ ...prev, ...changes }));
  }

  // Use layout.sidebarW, layout.composerH in styles
}
```

### Week 9: Plugin System

**Tasks:**
1. Complete plugin registry
2. Create example plugins:
   - Message templates
   - Quick replies
   - Link preview
3. Add plugin loading
4. Build plugin UI
5. Document plugin API

**Create:**
- `src/plugins/templates/`
- `src/plugins/quickreplies/`
- `docs/PLUGIN_DEVELOPMENT.md`

### Week 10: Enhanced Logging

**Tasks:**
1. Integrate logging package
2. Add structured logging throughout app
3. Create log viewer panel (feature-flagged)
4. Implement log export
5. Add sensitive data redaction

### Week 11: Polish & Integration Testing

**Tasks:**
1. Test all integrated features together
2. Fix integration bugs
3. Performance optimization
4. Memory leak testing
5. Update all documentation

---

## Phase 4: Production Readiness (Weeks 12-14)

### Week 12: Comprehensive Testing

#### Automated Tests
```bash
# Create test suite
mkdir -p tests/integration
mkdir -p tests/e2e

# Install test dependencies
npm install --save-dev @playwright/test

# Write tests
```

File: `tests/e2e/smoke.spec.ts`
```typescript
import { test, expect } from '@playwright/test';

test('basic message flow', async ({ page }) => {
  await page.goto('http://localhost:5173');
  
  // Wait for app to load
  await expect(page.locator('.sidebar')).toBeVisible();
  
  // Select a thread
  await page.locator('.thread-item').first().click();
  
  // Verify messages load
  await expect(page.locator('.message')).toHaveCount(greaterThan(0));
  
  // Send a message
  await page.locator('.composer textarea').fill('Test message');
  await page.locator('.composer button[type=submit]').click();
  
  // Verify message appears
  await expect(page.locator('.message').last()).toContainText('Test message');
});
```

#### Manual Testing Checklist
Create `tests/MANUAL_TESTS.md` with comprehensive checklist

### Week 13: Documentation

#### Create User Guide
```markdown
# docs/USER_GUIDE.md
- Installation
- First-time setup
- Basic usage
- Advanced features
- Keyboard shortcuts
- Troubleshooting
- FAQ
```

#### Create Video Tutorials
1. Installation and setup (5 min)
2. Basic messaging (5 min)
3. Keyboard shortcuts (3 min)
4. Auto-reply setup (10 min)
5. TUI mode (5 min)

#### API Documentation
Generate API docs:
```bash
# For Rust
cargo doc --no-deps --open

# For TypeScript
npx typedoc --out docs/api src/
```

### Week 14: Distribution

#### Code Signing (macOS)
```bash
# Get Apple Developer certificate
# Add to Keychain

# Update tauri.conf.json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAMID)"
    }
  }
}

# Build signed app
npm run tauri:build
```

#### Create Installers
```bash
# macOS DMG - automatic with Tauri
# Output: src-tauri/target/release/bundle/dmg/

# Windows installer
npm run tauri:build -- --target x86_64-pc-windows-msvc

# Linux packages
npm run tauri:build -- --target x86_64-unknown-linux-gnu
```

#### Release Automation
File: `.github/workflows/release.yml`
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-and-release:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - uses: actions-rs/toolchain@v1
      
      - name: Install dependencies
        run: npm install
      
      - name: Build
        run: npm run tauri:build
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            src-tauri/target/release/bundle/dmg/*.dmg
            src-tauri/target/release/bundle/macos/*.app
```

---

## 📋 Daily Development Workflow

### Morning Routine (15 min)
```bash
# 1. Pull latest changes
git pull origin main

# 2. Check for dependency updates
npm outdated

# 3. Run tests
npm run test

# 4. Check issues/PRs
# Review GitHub issues and PRs

# 5. Plan day
# Update TODO list
```

### Development Session
```bash
# 1. Create feature branch
git checkout -b feature/name

# 2. Make changes
# Edit files

# 3. Test frequently
npm run dev  # Test in browser
npm run test # Run unit tests

# 4. Lint before commit
npm run lint:fix

# 5. Commit with clear message
git commit -am "Feature: clear description"

# 6. Push and create PR
git push origin feature/name
```

### End of Day (10 min)
```bash
# 1. Run full test suite
npm run test:run

# 2. Update documentation
# If you added features, update relevant docs

# 3. Push all changes
git push

# 4. Update progress
# Mark completed tasks in TODO list

# 5. Plan tomorrow
# Write list of tasks for next day
```

---

## 🎯 Success Criteria Checklist

### Phase 1 Complete When:
- [ ] No critical bugs in bug list
- [ ] All smoke tests pass
- [ ] Production build works
- [ ] Documentation up to date

### Phase 2 Complete When:
- [ ] TUI mode fully functional
- [ ] All keyboard shortcuts work
- [ ] Auto-reply system tested and safe
- [ ] User documentation complete

### Phase 3 Complete When:
- [ ] All packages integrated
- [ ] Plugins working
- [ ] Logging comprehensive
- [ ] No performance regressions

### Phase 4 Complete When:
- [ ] 90%+ test coverage
- [ ] All docs complete
- [ ] Signed builds for all platforms
- [ ] Release process automated
- [ ] Zero known critical bugs

---

## 🚨 Important Reminders

### Safety First
- Never auto-send without explicit user action
- Always log automation actions
- Rate limit automated messages
- Make it easy to disable features

### Code Quality
- Write tests for new features
- Keep functions small and focused
- Document complex logic
- Follow existing code style

### User Experience
- Provide clear error messages
- Show loading states
- Make actions reversible
- Keyboard shortcuts for power users

### Performance
- Lazy load when possible
- Cache expensive operations
- Profile before optimizing
- Set performance budgets

---

## 📞 Getting Help

### Resources
- **Documentation**: Check `docs/` folder first
- **Issues**: Search existing GitHub issues
- **Architecture**: Review `PRODUCT_ROADMAP.md`
- **Code Examples**: Look at existing components

### When Stuck
1. Read error messages carefully
2. Check logs: `run-dev.command.log`
3. Use diagnostics panel in app
4. Search codebase for similar patterns
5. Create minimal reproduction
6. Document and ask for help

---

## ✅ Quick Reference

### Common Commands
```bash
# Development
npm run dev                    # Frontend dev server
npm run tauri:dev             # Full app dev mode
./scripts/dev/SignalX-Dev.command  # macOS launcher

# Testing
npm run test                  # Unit tests
npm run test:coverage         # With coverage
./scripts/testing/test-features.sh  # Feature tests

# Building
npm run build                 # Frontend only
npm run tauri:build          # Production build

# Code Quality
npm run lint                  # Check linting
npm run lint:fix             # Auto-fix
npm run format               # Format code

# Debugging
tail -f run-dev.command.log  # Watch logs
cargo build --bin signalx-tui  # Build TUI
```

### File Locations
- Logs: `run-dev.command.log`
- Config: `.signalx.env`
- Data: `~/Library/Application Support/SignalX/`
- Build: `src-tauri/target/release/bundle/`

---

**This guide should be referenced daily during development. Update it as you learn better practices or encounter common issues.**

**Next Step:** Start with Phase 1, Day 1. Work through systematically. Don't skip steps.

