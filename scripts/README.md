# Scripts Directory

This directory contains all shell scripts organized by purpose.

## Directory Structure

### `setup/`
Scripts for initial project setup and configuration:
- `setup-ai.sh` - Configure AI services
- `apply-signalx-cursor-bundle.sh` - Apply Cursor bundle configuration
- `_signalx_cursor_bundle.sh` - Internal bundle script

### `dev/`
Development and runtime scripts:
- `run-dev.sh` - Start development server
- `run-all.sh` - Run all development services
- `SignalX-Dev.command` - macOS launcher for development
- `SignalX-Dev-Launcher.applescript` - AppleScript launcher

### `signal-cli/`
Signal CLI integration and linking scripts:
- `signal-cli-check.sh` - Verify signal-cli installation
- `signal-cli-link.sh` - Link Signal device
- `signal-cli-link-debug.sh` - Debug linking process
- `link-signal-cli.sh` - Alternative linking method
- `link-signal.sh` - Link Signal account
- `link-live.sh` - Link with live configuration
- `link-now.sh` - Quick link command
- `run-signal-link.sh` - Run Signal linking process
- `run-signal-link-qr.sh` - Run linking with QR code
- `use-signalx-number.sh` - Configure SignalX phone number
- `fix-zshrc-and-signal-cli.sh` - Fix shell configuration

### `testing/`
Testing and verification scripts:
- `test-features.sh` - Run feature tests
- `verify-build.sh` - Verify build output

### `build/`
Build-related scripts (currently empty, reserved for future use)

## Usage

All scripts should be run from the project root directory. For example:

```bash
./scripts/dev/run-dev.sh
./scripts/signal-cli/signal-cli-link.sh
```

