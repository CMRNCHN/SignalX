# Troubleshooting SignalX

## Error: "signal-cli: error: too few arguments"

### Problem
Signal-cli is being invoked without a required subcommand (like `send`, `receive`, etc.).

### Common Causes

1. **Running signal-cli directly** - Signal-cli requires a subcommand:
   ```bash
   # ❌ Wrong - no subcommand
   signal-cli
   
   # ✅ Correct - with subcommand
   signal-cli send -m "message" +1234567890
   ```

2. **IDE/Code Runner** - If your IDE is trying to run signal-cli directly, it will fail. Use the headless binary instead:
   ```bash
   ./bin/signalx headless send --to "+1234567890" --text "message"
   ```

3. **Missing arguments in headless binary** - Ensure environment variables are set:
   ```bash
   export SIGNALX_SIGNALCLI_CONFIG=/Users/cameroncohen/.local/share/signal-cli
   export SIGNALX_NUMBER=+1234567890
   ```

### Solution

**For Headless Mode:**
```bash
# 1. Set environment variables
export SIGNALX_SIGNALCLI_CONFIG=/Users/cameroncohen/.local/share/signal-cli
export SIGNALX_NUMBER=+1234567890

# 2. Build the headless binary
cd src-tauri
cargo build --release --bin signalx-headless

# 3. Run through the wrapper
cd ../..
./bin/signalx headless send --to "+1234567890" --text "Test message"
```

**For GUI Mode:**
The GUI uses the existing Tauri commands which properly construct signal-cli commands. No action needed.

### Verification

Test signal-cli directly:
```bash
/opt/homebrew/bin/signal-cli --config /path/to/config -u +1234567890 send -m "test" +1234567890
```

If this works, the headless binary should also work once built and run correctly.

