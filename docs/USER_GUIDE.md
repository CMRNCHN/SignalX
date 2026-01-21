# 📖 SignalX User Guide

Welcome to SignalX! This guide will help you get started with SignalX, a powerful desktop messaging client for Signal with integrated AI assistance.

---

## 🚀 Quick Start

### Installation

#### macOS
```bash
# Using Homebrew (recommended)
brew install signalx

# Or download DMG from releases
# https://github.com/[your-repo]/signalx/releases
```

#### Windows
```bash
# Using Chocolatey
choco install signalx

# Or download MSI installer from releases
```

#### Linux
```bash
# Ubuntu/Debian
sudo dpkg -i signalx_1.0.0_amd64.deb

# Arch Linux
yay -S signalx

# AppImage (all distros)
chmod +x SignalX-1.0.0.AppImage
./SignalX-1.0.0.AppImage
```

---

## 🔗 First-Time Setup

### Prerequisites

**1. Signal CLI Installation**

SignalX requires Signal CLI to communicate with the Signal network.

```bash
# macOS
brew install signal-cli

# Linux
# Follow instructions at: https://github.com/AsamK/signal-cli

# Windows
# Download from: https://github.com/AsamK/signal-cli/releases
```

**2. Link Your Signal Account**

You need to link SignalX with your existing Signal account:

```bash
# Method 1: QR Code (recommended)
signal-cli link -n "SignalX Desktop"

# This will display a QR code
# Scan it using your Signal mobile app:
# Signal App → Settings → Linked Devices → Link New Device

# Method 2: Phone Number Registration (new account)
signal-cli -u +1234567890 register
signal-cli -u +1234567890 verify CODE
```

**3. Set Environment Variables**

Tell SignalX which Signal number to use:

```bash
# macOS/Linux - Add to ~/.zshrc or ~/.bashrc
export SIGNALX_NUMBER="+1234567890"
export SIGNALX_SIGNALCLI_CONFIG="$HOME/.local/share/signal-cli"

# Windows - Add to Environment Variables
setx SIGNALX_NUMBER "+1234567890"
setx SIGNALX_SIGNALCLI_CONFIG "%APPDATA%\signal-cli"
```

**4. Test Signal CLI**

Verify everything works:

```bash
# Send a test message to yourself
signal-cli -u $SIGNALX_NUMBER send -m "Test" $SIGNALX_NUMBER

# Check if you received it
signal-cli -u $SIGNALX_NUMBER receive
```

---

## 🎯 Using SignalX

### Launching the Application

**GUI Mode (Graphical Interface)**
```bash
# macOS/Linux
signalx

# Or double-click the app icon

# Windows
signalx.exe
```

**TUI Mode (Terminal Interface)**
```bash
# Launch TUI directly
signalx-tui

# Or
signalx --mode tui
```

---

## 💬 Basic Operations

### Sending Your First Message

**In GUI Mode:**
1. Click "New Message" or press `Cmd+N` (Mac) / `Ctrl+N` (Windows/Linux)
2. Enter recipient's phone number (e.g., +1234567890)
3. Type your message
4. Click "Send" or press `Cmd+Enter`

**In TUI Mode:**
1. Press `c` for new message
2. Type recipient's number
3. Press `Enter` to select
4. Type your message
5. Press `Enter` to send

### Viewing Conversations

**GUI Mode:**
- Conversations appear in the left sidebar
- Click a conversation to view messages
- Unread messages show a blue badge
- Search using the search bar at the top

**TUI Mode:**
- Use `j/k` or arrow keys to navigate threads
- Press `Enter` to open a conversation
- Press `q` to quit or go back
- Press `/` to search

### Managing Contacts

**Add Contact Alias:**
1. Right-click a conversation (GUI) or press `a` in thread (TUI)
2. Choose "Set Alias"
3. Enter a friendly name
4. Aliases are saved locally and make conversations easier to find

**Search Contacts:**
- GUI: Type in search bar, filters in real-time
- TUI: Press `/` and start typing

---

## 🤖 AI Features

SignalX includes AI-powered features to help you communicate more efficiently.

### Smart Reply Suggestions

**Setup:**
1. Install Ollama: https://ollama.ai
2. Pull a model: `ollama pull llama2`
3. Set environment variable:
   ```bash
   export SIGNALX_OLLAMA_MODEL="llama2"
   ```

**Usage:**
1. Select a conversation
2. Click "AI Assist" or press `Cmd+Shift+A`
3. Choose intent: Reply, Summarize, Analyze
4. Review the AI-generated suggestion
5. Click "Use" to insert into composer
6. Edit if needed, then send

### Conversation Summaries

**Generate Summary:**
1. Open a conversation
2. Click "Tools" → "AI Tools" → "Summarize"
3. Wait 3-5 seconds
4. View summary in tools panel

### Automated Replies

**Create Auto-Reply Rule:**
1. Go to Settings → Automation
2. Click "New Rule"
3. Set trigger (e.g., "urgent" keyword)
4. Set action (e.g., "Generate reply")
5. Set constraints (e.g., "Keep it brief")
6. Save rule

---

## 🔍 Advanced Features

### Search Messages

**Full-Text Search:**
- GUI: Use search bar, searches all conversations
- TUI: Press `/`, type query, press Enter

**Search Tips:**
- Use quotes for exact phrases: `"meeting tomorrow"`
- Search by sender: `from:+1234567890`
- Search by date: `before:2024-01-01`

### Export Conversations

**Export to File:**
1. Open conversation
2. Click Tools → Export
3. Choose format: TXT, JSON, or Markdown
4. Select date range
5. Click "Export"
6. File saved to Downloads folder

**Export All Threads:**
```bash
signalx export --all --format json --output ~/signalx-backup.json
```

### Multi-Account Support

**Add Second Account:**
1. Link another Signal device using Signal CLI
2. Settings → Accounts → Add Account
3. Enter phone number
4. Switch accounts using dropdown in sidebar

---

## ⌨️ Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+N` | New message |
| `Cmd/Ctrl+K` | Quick search |
| `Cmd/Ctrl+,` | Settings |
| `Cmd/Ctrl+Q` | Quit |
| `Cmd/Ctrl+R` | Refresh conversations |

### In Conversation

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Navigate messages |
| `Cmd/Ctrl+F` | Search in conversation |
| `Cmd/Ctrl+E` | Export conversation |
| `Enter` | Send message (when focused) |
| `Shift+Enter` | New line in message |

### TUI Shortcuts

| Shortcut | Action |
|----------|--------|
| `?` | Show help |
| `j/k` | Navigate down/up |
| `/` | Search |
| `r` | Refresh |
| `i` | Enter compose mode |
| `Esc` | Cancel/Go back |
| `q` | Quit |

---

## 🔧 Settings & Preferences

### Accessing Settings

- GUI: Click gear icon or `Cmd/Ctrl+,`
- TUI: Type `:settings`

### Key Settings

**General:**
- Auto-start on login
- Minimize to system tray
- Default view (Threads/Contacts/Groups)

**Notifications:**
- Enable/disable notifications
- Sound preferences
- Show message preview in notifications

**Appearance:**
- Density mode (Compact/Normal/Spacious)
- High contrast mode
- Font size adjustment

**Privacy:**
- Read receipts
- Typing indicators
- Hide IP address (proxy settings)

**AI Features:**
- Ollama model selection
- Default intent
- Auto-reply enabled/disabled

---

## 🛠️ Troubleshooting

### SignalX won't start

**Check Signal CLI:**
```bash
signal-cli --version
# Should show version number

# Test connection
signal-cli -u $SIGNALX_NUMBER receive
```

**Check Environment Variables:**
```bash
echo $SIGNALX_NUMBER
# Should show your phone number

echo $SIGNALX_SIGNALCLI_CONFIG
# Should show path to signal-cli config
```

**Reset Configuration:**
```bash
# Backup first!
cp ~/.signalx/config.json ~/.signalx/config.json.backup

# Remove config
rm ~/.signalx/config.json

# Restart SignalX
signalx
```

### Messages not sending

**Verify Account:**
```bash
signal-cli -u $SIGNALX_NUMBER listIdentities
```

**Check Outbox:**
- GUI: Look for outbox indicator in header
- TUI: Type `:outbox` to see pending messages

**Manual Send:**
```bash
signal-cli -u $SIGNALX_NUMBER send -m "Test" +1234567890
```

### AI features not working

**Check Ollama:**
```bash
# Verify Ollama is running
curl http://localhost:11434/api/version

# Test model
ollama run llama2 "Hello"
```

**Check Logs:**
```bash
# View SignalX logs
tail -f ~/.signalx/logs/signalx.log
```

### Performance issues

**Large Conversation History:**
- Export old conversations
- Archive threads you don't need
- Clear message cache in Settings

**High CPU Usage:**
- Disable AI auto-suggestions
- Reduce notification frequency
- Check for Signal CLI updates

---

## 📚 Additional Resources

- **TUI Guide:** See `TUI_GUIDE.md` for terminal interface details
- **AI Features:** See `AI_FEATURES_GUIDE.md` for automation setup
- **FAQ:** See `FAQ.md` for common questions
- **GitHub Issues:** Report bugs at [repository URL]
- **Community:** Join Discord/Forum at [community URL]

---

## 🔄 Updates

SignalX checks for updates automatically. When an update is available:

1. Notification appears in app
2. Click "Update" to download
3. Restart SignalX to apply

**Manual Update Check:**
- GUI: Help → Check for Updates
- CLI: `signalx --check-update`

---

## 🎓 Pro Tips

1. **Use Aliases:** Give contacts friendly names for faster searching
2. **Keyboard First:** Learn shortcuts to navigate 2x faster
3. **AI Constraints:** Add context like "professional tone" or "keep brief"
4. **Export Regularly:** Backup important conversations
5. **TUI for Speed:** Use terminal interface for quick message sending
6. **Multiple Accounts:** Separate work and personal conversations
7. **Auto-Reply Rules:** Set up for common scenarios
8. **Search Operators:** Use advanced search to find anything instantly

---

## 💬 Getting Help

**In-App Help:**
- Press `?` in TUI
- Help → Documentation in GUI

**Command Line:**
```bash
signalx --help
```

**Online:**
- Documentation: [docs URL]
- Video Tutorials: [YouTube URL]
- Community Forum: [forum URL]

---

**Welcome to SignalX! Happy messaging! 🎉**

*Version 1.0.0 | Last Updated: December 2025*
