# SignalX Desktop - Quick Start Guide

## 🚀 First Time Setup

### 1. Prerequisites Check
```bash
# Verify dependencies
./scripts/test-features.sh
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
./SignalX-Dev.command
```

## 🧪 Testing Features

### Quick Smoke Test (5 minutes)
1. **Launch app**: `./SignalX-Dev.command`
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
./scripts/test-features.sh
```

## 🤖 AI Features (Optional)

### Setup AI Tools
```bash
./scripts/setup-ai.sh
```

This will:
- Install Ollama (if needed)
- Start the Ollama HTTP server (`ollama serve`)
- Pull a language model
- Configure `.signalx.env` with `SIGNALX_OLLAMA_MODEL` and `SIGNALX_OLLAMA_URL`

### Test AI Features
1. Select a thread with messages
2. Click **"Summarize"** → Should show thread summary
3. Click **"Draft"** → Should fill composer (doesn't auto-send)

## 📦 Production Build

### Build the App
```bash
npm run tauri build
```

### Verify Build
```bash
./verify-build.sh
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
1. Verify Ollama server is running: `ollama serve` (in a separate terminal)
2. Check HTTP API: `curl -s http://localhost:11434/api/tags`
3. Check `.signalx.env` has `SIGNALX_OLLAMA_MODEL` set
4. In the app Diagnostics panel, confirm `ollama_reachable: true`
5. List pulled models: `ollama list`

## 📁 Important Directories

- **App Data**: `~/Library/Application Support/SignalX/`
  - `threads/` - Thread state files
  - `aliases/` - Contact aliases
  - `export/` - Exported threads
- **Logs**: `run-dev.command.log` (in project root)
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

## 📚 Documentation

- **Status & Testing**: `STATUS.md`
- **Build Instructions**: `BUILD.md`
- **Feature Handoff**: `HANDOFF.md`
- **Main README**: `README.md`

## 🆘 Getting Help

1. Check `run-dev.command.log` for errors
2. Review Diagnostics panel in app
3. Verify all prerequisites with `./scripts/test-features.sh`
4. Check Health badge status


