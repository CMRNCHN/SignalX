# SignalX Vision Assessment

## Your Original Vision
You wanted: **A TUI (Terminal User Interface) with added features** - essentially a simple, keyboard-driven Signal client with:
- Automations & autoreplies
- Groups support
- Extensive contact details
- AI integration (drafting, summarizing, responding)
- Keyboard shortcuts
- Useful tools
- Placeholders for local file integration (business features)

## Current Reality
The project has become a **full Tauri + React desktop GUI application** with:
- Complex UI with multiple panels (Sidebar, Dashboard, Chat, AI Tools, Contacts, etc.)
- Mouse-driven interface
- Heavy React frontend
- Desktop app architecture

---

## Feature Comparison

### ✅ **IMPLEMENTED**

1. **Groups** ✅
   - Group metadata storage
   - Group search with custom fields
   - Group categories
   - Location: `src-tauri/src/main.rs` (group_store, group_meta commands)

2. **Extensive Contact Details** ✅
   - Custom fields (text, number, bool, date, tag)
   - Searchable custom fields
   - Contact photos
   - Apple Contacts linking
   - Categories
   - Location: `src-tauri/src/main.rs` (contact_store, contact_meta commands)

3. **AI Integration** ✅ (Partial)
   - ✅ Drafting replies (`draft_reply`)
   - ✅ Summarizing threads (`summarize_thread`)
   - ❌ **Auto-responding** (only creates drafts, never auto-sends)
   - Uses Ollama for local AI
   - Location: `src-tauri/src/main.rs` (lines 1754-1782, 3012-3052)

4. **Useful Tools** ✅
   - Thread export (TXT/JSON)
   - Message search
   - Contact/group search
   - Outbox (reliable message sending with retry)
   - Diagnostics panel
   - Location: Various commands in `main.rs`

5. **Agent Mode** ✅ (Headless)
   - Can run without GUI (`--agent` flag)
   - Generates drafts automatically on new messages
   - But: **doesn't auto-send** (by design - "do not auto-send")
   - Location: `src-tauri/src/main.rs` (lines 3642-3649, 3366-3399)

### ❌ **NOT IMPLEMENTED**

1. **TUI Interface** ❌
   - Current: Full React GUI with panels
   - Missing: Terminal-based interface (like `ncurses`, `ratatui`, or similar)
   - Would need: Complete rewrite or separate TUI mode

2. **Autoreplies** ❌
   - Current: Agent mode creates drafts but **never auto-sends**
   - Missing: Rule-based auto-reply system
   - Missing: Conditional auto-replies (time-based, keyword-based, etc.)
   - Code explicitly prevents auto-sending: `"do not auto-send"` constraint

3. **Keyboard Shortcuts** ❌
   - Current: No keyboard shortcuts implemented
   - Missing: Power user shortcuts for navigation, sending, etc.
   - Would need: Keyboard event handlers in React

4. **Automations** ❌
   - Current: Only agent mode (draft generation)
   - Missing: Rule-based automations
   - Missing: Workflow automation
   - Missing: Scheduled messages
   - Missing: Conditional actions

5. **Local File Integration (Business)** ❌
   - Current: No file integration
   - Missing: Placeholders for business file integration
   - Missing: Trackr/inventory integration mentioned in README

---

## Architecture Analysis

### Current Stack
- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust (Tauri)
- **UI**: Full desktop GUI with multiple panels
- **Size**: ~82MB (mostly node_modules)

### What You Wanted
- **Interface**: TUI (Terminal User Interface)
- **Approach**: Simple, keyboard-driven
- **Focus**: Automation and power-user features

---

## The Gap

The project has **drifted significantly** from your vision:

1. **Interface Paradigm**: GUI vs TUI
   - You wanted: Terminal-based, keyboard-driven
   - You have: Desktop app with mouse-driven panels

2. **Complexity**: 
   - You wanted: Simple TUI with added features
   - You have: Complex React application with multiple components

3. **Automation**:
   - You wanted: Autoreplies and automations
   - You have: Draft generation only (no auto-sending)

4. **Keyboard Focus**:
   - You wanted: Keyboard shortcuts as primary interface
   - You have: Mouse-driven GUI with no shortcuts

---

## Options to Get Back on Track

### Option 1: Add TUI Mode (Recommended)
Keep the GUI but add a **TUI mode** that can run alongside or instead of the GUI:
- Use a Rust TUI library (like `ratatui` or `crossterm`)
- Add `--tui` flag to run terminal interface
- Share the same backend (Rust code)
- Keyboard shortcuts in TUI mode
- Simpler, focused interface

### Option 2: Simplify the GUI
- Remove complex panels
- Add keyboard shortcuts to existing GUI
- Make it more keyboard-driven
- Focus on core features

### Option 3: Build TUI from Scratch
- Start fresh with a TUI-focused architecture
- Use existing Rust backend as reference
- Build simple terminal interface
- Add features incrementally

### Option 4: Hybrid Approach
- Keep GUI for complex operations
- Add TUI mode for quick actions
- Share backend between both

---

## Missing Features to Implement

### High Priority (Core Vision)
1. **Autoreply System**
   - Rule-based auto-replies
   - Conditional logic (time, keywords, sender)
   - Enable/disable per thread or contact

2. **Keyboard Shortcuts**
   - Navigation (j/k for threads, Enter to open)
   - Sending (Cmd+Enter or Ctrl+Enter)
   - Quick actions (Cmd+S for search, etc.)

3. **TUI Mode**
   - Terminal interface option
   - Keyboard-driven navigation
   - Simple, focused view

### Medium Priority
4. **Automations**
   - Workflow rules
   - Scheduled messages
   - Conditional actions

5. **Local File Integration**
   - Business file placeholders
   - Trackr integration hooks

---

## Recommendation

**Start with Option 1**: Add a TUI mode to the existing project.

**Why?**
- Your Rust backend is solid and feature-rich
- You can reuse all the backend logic
- TUI can be added as an alternative interface
- Keep GUI for when you need it
- Faster path to your vision

**Next Steps:**
1. Add `ratatui` or `crossterm` dependency
2. Create `tui.rs` module
3. Add `--tui` flag to main
4. Implement keyboard shortcuts
5. Add autoreply system to backend
6. Connect TUI to existing backend commands

Would you like me to:
1. **Create a TUI mode** using the existing backend?
2. **Add keyboard shortcuts** to the current GUI?
3. **Implement autoreply system** in the backend?
4. **Simplify the GUI** to be more keyboard-focused?

Let me know which direction you'd like to go!

