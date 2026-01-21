# 🖥️ SignalX TUI Guide

**Terminal User Interface - Power User Edition**

The SignalX TUI (Terminal User Interface) is a fast, keyboard-driven interface for Signal messaging. Perfect for power users, SSH sessions, and anyone who prefers the terminal.

---

## 🚀 Quick Start

### Launching TUI

```bash
# Direct launch
signalx-tui

# Or via main binary
signalx --mode tui

# With specific account
SIGNALX_NUMBER="+1234567890" signalx-tui
```

### First Launch

On first launch, you'll see:
```
┌─────────────────────────────────────┐
│ SignalX TUI v1.0.0                 │
│                                     │
│ No threads found.                   │
│ Press 'r' to refresh                │
│ Press '?' for help                  │
└─────────────────────────────────────┘
```

Press `r` to load your conversations.

---

## 🎨 Interface Overview

```
┌────────────────────────────────────────────────────┐
│ SignalX TUI  |  Threads: 15  |  Unread: 3         │ ← Header
├────────────────────────────────────────────────────┤
│                                                    │
│ ┌──────────────────────────────┐                  │
│ │ Alice                    [2] │  ← Thread List   │
│ │ Hey! Can we meet tomorrow?   │                  │
│ │ 10:30 AM                     │                  │
│ ├──────────────────────────────┤                  │
│ │ Bob Smith                    │                  │
│ │ Thanks for the update        │                  │
│ │ Yesterday                    │                  │
│ └──────────────────────────────┘                  │
│                                                    │
│ ┌──────────────────────────────┐                  │
│ │ Alice: Hey! Can we meet...   │  ← Messages      │
│ │ 10:30 AM                     │                  │
│ │                              │                  │
│ │ You: Sure! What time?        │                  │
│ │ 10:35 AM                     │                  │
│ └──────────────────────────────┘                  │
│                                                    │
├────────────────────────────────────────────────────┤
│ [Normal] Type 'i' to compose | Press '?' for help │ ← Status
└────────────────────────────────────────────────────┘
```

---

## ⌨️ Keyboard Shortcuts

### Essential Navigation

| Key | Action |
|-----|--------|
| `?` | Show help screen |
| `q` | Quit (or go back) |
| `Esc` | Cancel current action |
| `r` | Refresh threads and messages |

### Thread Navigation

| Key | Action |
|-----|--------|
| `j` or `↓` | Move down in thread list |
| `k` or `↑` | Move up in thread list |
| `Enter` | Open selected thread |
| `g + g` | Jump to top of list |
| `G` | Jump to bottom of list |
| `1-9` | Jump to thread number N |

### Message Navigation

| Key | Action |
|-----|--------|
| `j` or `↓` | Scroll messages down |
| `k` or `↑` | Scroll messages up |
| `PgDn` | Scroll page down |
| `PgUp` | Scroll page up |
| `Home` | Jump to first message |
| `End` | Jump to latest message |

### Composing Messages

| Key | Action |
|-----|--------|
| `i` | Enter compose mode |
| `c` | New message (select recipient) |
| `r` | Reply to current thread |
| `Esc` | Cancel compose |
| `Enter` | Send message |
| `Ctrl+U` | Clear input |
| `Ctrl+W` | Delete word backward |

### Search & Filter

| Key | Action |
|-----|--------|
| `/` | Enter search mode |
| `n` | Next search result |
| `N` | Previous search result |
| `Esc` | Clear search |

### Advanced Features

| Key | Action |
|-----|--------|
| `m + letter` | Set bookmark (e.g., `m + a`) |
| `' + letter` | Jump to bookmark (e.g., `' + a`) |
| `y + y` | Copy current message |
| `:` | Command mode |
| `Tab` | Switch between threads/messages |

---

## 🎯 Common Workflows

### Sending a Quick Message

```
1. Press 'c' for new message
2. Type recipient number: +1234567890
3. Press Enter
4. Type message
5. Press Enter to send
```

### Reading New Messages

```
1. Launch TUI (new messages highlighted)
2. Use j/k to navigate to conversation
3. Press Enter to open
4. Read messages (auto-scrolls to latest)
5. Press 'q' to return to thread list
```

### Searching Conversations

```
1. Press '/' to enter search mode
2. Type search query: "meeting"
3. Press Enter
4. Messages containing "meeting" are highlighted
5. Press 'n' for next result, 'N' for previous
6. Press Esc to clear search
```

### Replying to Messages

```
1. Navigate to thread with j/k
2. Press Enter to open
3. Press 'i' to enter compose mode
4. Type reply
5. Press Enter to send
```

---

## 🔍 Search Features

### Basic Search

Press `/` and type your query:
```
/urgent
```

Results highlight in the message list with a subtle background.

### Search Operators

```
# Search in sender
/from:alice

# Search by date
/after:2024-01-01
/before:2024-12-31

# Exact phrase
/"exact phrase here"

# Multiple terms (AND)
/meeting tomorrow

# Exclude term (NOT)
/project -cancelled
```

### Search Navigation

- `n` - Next result
- `N` - Previous result
- `Enter` - Jump to selected result
- `Esc` - Clear search and return

---

## 📋 Command Mode

Press `:` to enter command mode, then type commands:

### Available Commands

| Command | Description |
|---------|-------------|
| `:quit` or `:q` | Quit TUI |
| `:refresh` or `:r` | Reload threads |
| `:search <query>` | Search messages |
| `:export txt` | Export to text |
| `:export json` | Export to JSON |
| `:new` | New message |
| `:help` | Show help |
| `:settings` | Open settings (if GUI available) |
| `:clear` | Clear screen |

### Command Examples

```
:search meeting tomorrow
:export txt
:new +1234567890
```

---

## 🚀 Power User Features

### Bookmarks

Set bookmarks for quick navigation:

```
# Set bookmark 'a' on current thread
m + a

# Jump to bookmark 'a'
' + a

# Set multiple bookmarks
m + b  (for "Bob")
m + w  (for "Work")
m + f  (for "Family")
```

Bookmarks persist across sessions.

### Clipboard Operations

```
# Copy current message
y + y

# Paste into compose field
(use your terminal's paste: Cmd+V or Ctrl+Shift+V)
```

### Quick Thread Jumping

```
# Jump to thread 1-9
1  (jumps to first thread)
5  (jumps to fifth thread)
9  (jumps to ninth thread)
```

### Batch Operations

```
# Mark all as read (command mode)
:markread

# Export multiple threads
:export json --threads 1,2,3
```

---

## ⚙️ Configuration

### Environment Variables

```bash
# Set your Signal number
export SIGNALX_NUMBER="+1234567890"

# Set Signal CLI config path
export SIGNALX_SIGNALCLI_CONFIG="$HOME/.local/share/signal-cli"

# Set TUI color scheme
export SIGNALX_TUI_THEME="dark"  # dark, light, or high-contrast

# Set refresh interval (seconds)
export SIGNALX_TUI_REFRESH=60
```

### Config File

TUI settings are stored in `~/.signalx/tui-config.json`:

```json
{
  "theme": "dark",
  "auto_scroll": true,
  "show_timestamps": true,
  "mouse_enabled": false,
  "vim_mode": true,
  "bookmarks": {
    "a": "dm:+1234567890",
    "b": "dm:+0987654321"
  }
}
```

### Color Schemes

**Dark (Default):**
- Background: Black (#000000)
- Text: White (#FFFFFF)
- Accent: Cyan (#00FFFF)
- Unread: Yellow (#FFFF00)

**Light:**
- Background: White (#FFFFFF)
- Text: Black (#000000)
- Accent: Blue (#0000FF)
- Unread: Red (#FF0000)

**High Contrast:**
- Background: Black (#000000)
- Text: White (#FFFFFF)
- Accent: Bright Green (#00FF00)
- Unread: Bright Yellow (#FFFF00)

---

## 🎨 Customization

### Keybinding Remapping

Edit `~/.signalx/tui-keys.json`:

```json
{
  "quit": "q",
  "help": "?",
  "search": "/",
  "compose": "i",
  "new_message": "c",
  "refresh": "r",
  "next": "j",
  "prev": "k"
}
```

### Status Bar Format

Edit `~/.signalx/tui-statusbar.json`:

```json
{
  "left": "SignalX TUI | Threads: {thread_count}",
  "center": "{current_thread}",
  "right": "Unread: {unread_count} | {time}"
}
```

---

## 🐛 Troubleshooting

### TUI Won't Start

**Check Environment:**
```bash
echo $SIGNALX_NUMBER
# Should show your phone number

which signal-cli
# Should show path to signal-cli
```

**Run with Debug:**
```bash
RUST_LOG=debug signalx-tui
```

### No Threads Appearing

**Manual Refresh:**
```bash
# In TUI, press 'r'
# Or restart with:
signalx-tui --force-refresh
```

**Check Signal CLI:**
```bash
signal-cli -u $SIGNALX_NUMBER receive
signal-cli -u $SIGNALX_NUMBER listGroups
```

### Keyboard Shortcuts Not Working

**Check Terminal Compatibility:**
```bash
# Test key codes
sed -n l
# Press your keys and verify codes
```

**Known Issues:**
- Some terminals don't support all key combinations
- Try alternative keys (arrows instead of j/k)
- Disable mouse support if using tmux/screen

### Display Issues

**Wrong Colors:**
```bash
# Check terminal TERM variable
echo $TERM
# Should be: xterm-256color or similar

# Force 256 colors
TERM=xterm-256color signalx-tui
```

**Broken Layout:**
```bash
# Resize terminal to at least 80x24
# Or use:
signalx-tui --min-size 80x24
```

### Performance Issues

**Reduce Thread Count:**
```bash
# Archive old threads
:archive --older-than 90d

# Limit displayed threads
signalx-tui --max-threads 50
```

**Disable Features:**
```json
// ~/.signalx/tui-config.json
{
  "mouse_enabled": false,
  "animations": false,
  "emoji_rendering": false
}
```

---

## 🔧 Advanced Tips

### SSH Usage

Run TUI over SSH:
```bash
# On remote server
ssh user@server
SIGNALX_NUMBER="+1234567890" signalx-tui
```

### Tmux Integration

```bash
# Create dedicated tmux session
tmux new-session -s signalx signalx-tui

# Detach: Ctrl+B, D
# Reattach: tmux attach -t signalx
```

### Screen Sessions

```bash
# Run in screen
screen -S signalx signalx-tui

# Detach: Ctrl+A, D
# Reattach: screen -r signalx
```

### Automation

```bash
# Send message via CLI
echo "Hello!" | signalx-tui --send +1234567890

# Pipe messages
cat message.txt | signalx-tui --send +1234567890

# Monitor for new messages
signalx-tui --watch --on-message "./notify.sh"
```

---

## 📊 Status Indicators

### Thread Status

- `[N]` - N unread messages
- `📌` - Pinned thread
- `🔕` - Muted thread
- `👥` - Group conversation
- `💬` - Direct message

### Message Status

- `✓` - Sent
- `✓✓` - Delivered
- `👁` - Read
- `⏳` - Sending
- `❌` - Failed

### Connection Status

- `🟢` - Connected
- `🟡` - Connecting
- `🔴` - Disconnected

---

## 🎓 Pro Tips

1. **Learn Vim Motions:** j/k/g/G for lightning-fast navigation
2. **Use Bookmarks:** m+a to mark important threads
3. **Command Palette:** Type `:` for quick actions
4. **Search Power:** Use operators like `from:` and `after:`
5. **Clipboard Mastery:** y+y to copy, terminal paste to insert
6. **Stay in TUI:** Most operations faster than GUI
7. **Script It:** Combine with bash for automation
8. **SSH Sessions:** Access messages from anywhere
9. **Multiple Windows:** Run multiple TUI instances
10. **Learn Shortcuts:** Press `?` frequently until memorized

---

## 📚 Related Documentation

- **User Guide:** See `USER_GUIDE.md` for general SignalX usage
- **AI Features:** See `AI_FEATURES_GUIDE.md` for automation
- **API Reference:** See `API_REFERENCE.md` for developers

---

## 🆘 Getting Help

**In-TUI Help:**
- Press `?` anytime for help screen
- Type `:help <topic>` for specific help

**Command Line:**
```bash
signalx-tui --help
```

**Online Resources:**
- TUI tutorial videos: [YouTube URL]
- Community forum: [Forum URL]
- GitHub issues: [Repo URL]

---

**Master the TUI and message at the speed of thought! ⚡**

*Version 1.0.0 | Last Updated: December 2025*
