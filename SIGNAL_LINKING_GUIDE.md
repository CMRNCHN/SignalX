# Signal Device Linking Guide

## Current Status

✅ Environment configured with your number: `+17742083223`  
✅ signal-cli installed at: `/opt/homebrew/bin/signal-cli`  
✅ Tauri app is launching...  

## What to Expect

When the SignalX desktop window opens, you'll see:

```
┌─────────────────────────────────────────┐
│ No accounts detected yet.               │
│ If you have SIGNALX_NUMBER set,        │
│ restart the app; otherwise link a       │
│ Signal device first.                    │
│                                         │
│ [Link New Device] button                │
└─────────────────────────────────────────┘
```

## Step-by-Step Linking Process

### Option 1: Link as Secondary Device (Recommended)

1. **In SignalX Desktop**: Click **"Link New Device"** button
2. **A QR code will appear** in the desktop app
3. **On your phone** (primary Signal device):
   - Open Signal app
   - Go to Settings → Linked Devices
   - Tap "+" to add a new device
   - **Scan the QR code** shown in SignalX
4. **Give it a name** like "SignalX Desktop"
5. **Wait for sync** - Your contacts and messages will sync automatically

This is the **easiest method** and doesn't require phone number verification.

### Option 2: Register New Number (Advanced)

⚠️ **Only use this if** you want to register a brand new phone number with Signal.

1. In SignalX, initiate registration
2. You'll receive an SMS verification code at +17742083223
3. Enter the code when prompted
4. Complete the registration process

**Warning**: This will register your number as a primary Signal account. Most users should use Option 1 instead.

## Troubleshooting

### "Tauri not available" message

**Solution**: You're running in browser mode. The Tauri desktop window should open separately - look for it in your Dock or Alt+Tab.

### Window doesn't appear

```bash
# Check if it's running
ps aux | grep -i signalx

# Check logs
tail -f ~/.cursor/projects/*/terminals/3.txt
```

### Backend errors

Use the new debugging tools:

1. Open DevTools in the Tauri window (Cmd+Option+I)
2. Check console: `window.__signalxLogs`
3. Try: `window.signalxSelfFix.retryTauri()`

### Port already in use

```bash
# Kill any existing processes
lsof -ti:5173 | xargs kill -9
cd /Users/cameroncohen/Developer/_active/misc/apps/signalx
source .signalx.env
npm run tauri:dev
```

## After Linking Success

Once linked, you should see:

1. ✅ Your number in the account dropdown
2. ✅ Contacts list populated
3. ✅ Existing conversations loaded
4. ✅ Ability to send/receive messages

## Testing the Connection

1. Send yourself a test message from your phone
2. It should appear in SignalX desktop within seconds
3. Reply from desktop - should appear on phone

## Environment File Reference

Your `.signalx.env` file is configured:

```bash
SIGNALX_NUMBER=+17742083223
SIGNALX_SIGNALCLI_CONFIG=/Users/cameroncohen/.local/share/signal-cli
SIGNALX_SIGNALCLI_BIN=/opt/homebrew/bin/signal-cli
```

## Next Steps After Linking

1. **Explore the UI**
   - Browse conversations
   - Send messages
   - Use search

2. **Try Advanced Features**
   - Set up automation rules
   - Install plugins
   - Configure AI features (optional)

3. **Check Health Status**
   - Look for health badge in sidebar
   - Should be green once linked

## Need Help?

1. Check `docs/TROUBLESHOOTING.md`
2. Use self-fix utilities: `window.signalxSelfFix`
3. View logs: `window.__signalxLogs`
4. Check terminal output in `~/.cursor/projects/*/terminals/`

---

**Current Time**: The Tauri window should be opening now!  
**Look for**: A new window titled "SignalX" in your application dock.
