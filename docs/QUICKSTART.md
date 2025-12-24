# SignalX Desktop - Quick Start Guide

## 🚀 First Time Setup

### 1. Prerequisites Check
```bash
# Verify dependencies
./scripts/testing/test-features.sh
```

### 2. Configure Environment
Edit `.signalx.env`:
```bash
# REQUIRED
SIGNALX_SIGNALCLI_CONFIG=/Users/cameroncohen/.local/share/signal-cli
SIGNALX_NUMBER=+1YOURNUMBERHERE

# OPTIONAL
SIGNALX_SIGNALCLI_BIN=/opt/homebrew/bin/signal-cli
```

### 3. Launch Development Mode
```bash
# Double-click or run:
./scripts/dev/SignalX-Dev.command
```

## 🧪 Testing Features

### Quick Smoke Test (5 minutes)
1. **Launch app**: `./scripts/dev/SignalX-Dev.command`
2. **Verify**:
   - [ ] Active account appears in dropdown
   - [ ] Health badge shows in sidebar (green/yellow/red)
   - [ ] Threads list loads
   - [ ] Can select a thread and see messages
   - [ ] Can send a message
   - [ ] Incoming message appears (from another device)

### Feature Verification
Run the verification script:
```bash
./scripts/testing/test-features.sh
```

## 🤖 AI Features (Optional)

### Setup AI Tools
```bash
./scripts/setup/setup-ai.sh
```

This will:
- Install Ollama (if needed)
- Pull a language model
- Configure `.signalx.env`

### Test AI Features
1. Select a thread with messages
2. Click **"Summarize"** → Should show thread summary
3. Click **"Draft"** → Should fill composer (doesn't auto-send)

## 📦 Production Build

### Build the App
```bash
npm run tauri:build
```

### Verify Build
```bash
./scripts/testing/verify-build.sh
```

### Launch Production Build
```bash
open src-tauri/target/release/bundle/macos/SignalX.app
```

## 🔍 Troubleshooting

### App Won't Start
1. Check `run-dev.command.log` for errors
2. Verify `.signalx.env` exists and is configured
3. Ensure `signal-cli` is installed: `brew install signal-cli`

### Messages Not Appearing
1. Check Health badge in sidebar
2. Verify `SIGNALX_NUMBER` matches your Signal account
3. Check Diagnostics panel (click "Diag" button)

### Export Not Working
1. Verify thread has messages
2. Check export directory: `~/Library/Application Support/SignalX/export/`
3. Check console logs for errors

### AI Features Not Working
1. Verify Ollama is running: `ollama list`
2. Check `.signalx.env` has `SIGNALX_OLLAMA_MODEL` set
3. Test Ollama directly: `ollama run qwen2.5:7b-instruct "test"`

## 📁 Important Directories

- **App Data**: `~/Library/Application Support/SignalX/`
  - `threads/` - Thread state files
  - `aliases/` - Contact aliases
  - `export/` - Exported threads
- **Logs**: `run-dev.command.log` (in project root, created by dev launcher)
- **Config**: `.signalx.env` (in project root)

## 🎯 Common Tasks

### Switch Accounts
1. Select different account from dropdown
2. Threads will reload for that account

### Export a Thread
1. Select a thread
2. Click **"Export TXT"** or **"Export JSON"**
3. Click **"Open Folder"** to view exported file

### Check Health Status
- Look at Health badge in sidebar
- Hover for detailed diagnostics
- Green = healthy, Yellow = degraded, Red = error

### Search Messages
1. Type in search box (top of sidebar)
2. Results appear below
3. Click result to open thread

### Set Contact Aliases
1. Enter phone number in first field
2. Enter alias name in second field
3. Click **"Set"**

## 💾 Storage (SQLite)

SignalX now uses SQLite for persistent storage of accounts, threads, messages, contacts, and automation rules.

### Enable Storage
Storage is enabled by default. To verify:
```bash
python3 tools/signalx_features.py list
```

The database is stored at: `~/Library/Application Support/SignalX/signalx.db`

## 🔐 Authentication (Optional)

### Enable Auth
```bash
python3 tools/signalx_features.py on auth.enabled
```

### Login Defaults (Dev Mode)
On first run with auth enabled, a default admin user is created:
- **Username**: `admin`
- **Password**: `admin`

⚠️ **Change these credentials in production!**

### Login
1. Launch the app
2. If auth is enabled, you'll see a login screen
3. Enter credentials (default: admin/admin in dev mode)
4. Session is stored in memory (localStorage in dev)

## 🤖 Automation Rules

### Enable Rules
```bash
python3 tools/signalx_features.py on automation.rules
```

### Create Your First Rule
1. Open the **Tools** panel
2. Scroll to **Automation Rules** section
3. Enter DSL in the textarea:
```
rule "Auto-Thanks"
when message_in contains "thanks"
then draft "You're welcome — got you."
```
4. Click **Create Rule**
5. Toggle the rule **ON** to enable it

### Rule DSL Syntax
- `rule "Name"` - Rule name
- `when message_in contains "text"` - Condition: message contains text
- `when message_in from "+1234567890"` - Condition: message from number
- `then draft "response"` - Action: create draft
- `then send "response"` - Action: send message (requires `automation.send_enabled`)

### Test Rules
1. Select a thread
2. In Rules section, click **Run Test**
3. Rules will execute against the selected thread

### Enable Auto-Send (Dangerous!)
⚠️ **Warning**: Auto-send will automatically send messages without confirmation!
```bash
python3 tools/signalx_features.py on automation.send_enabled
```

## 🖥️ Headless Mode

Run SignalX without the GUI for automation and server deployments.

### Build Headless Binary
```bash
cd src-tauri
cargo build --release --bin signalx-headless
```

### Run Headless
```bash
# Start receive loop (polls for new messages)
./bin/signalx headless start

# Send a message
./bin/signalx headless send --to "+1234567890" --text "Hello"

# List rules
./bin/signalx headless rules list

# Run rules once
./bin/signalx headless rules run
```

### Headless with Auth
In headless mode, you can bypass auth in dev:
```bash
./bin/signalx headless --as admin start
```

⚠️ **Warning**: Only use `--as admin` in development!

## 📚 Documentation

- **Status & Testing**: `docs/STATUS.md`
- **Build Instructions**: `docs/BUILD.md`
- **Feature Handoff**: `docs/HANDOFF.md`
- **Main README**: `README.md`

## 🆘 Getting Help

1. Check `run-dev.command.log` for errors
2. Review Diagnostics panel in app
3. Verify all prerequisites with `./scripts/testing/test-features.sh`
4. Check Health badge status

## 🎯 Quick Reference

### Run GUI
```bash
./scripts/dev/SignalX-Dev.command
```

### Run Headless
```bash
cd src-tauri && cargo build --release --bin signalx-headless
./bin/signalx headless start
```

### Enable Rules
```bash
python3 tools/signalx_features.py on automation.rules
```

### Create First Rule
1. Open Tools panel → Automation Rules
2. Enter DSL and click "Create Rule"
3. Toggle rule ON

### Login Defaults (Dev Only)
- Username: `admin`
- Password: `admin`


