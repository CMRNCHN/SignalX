# 🤖 Automated Testing Agent

This directory contains automated testing tools for SignalX.

## Files

- `automated-testing-agent.js` - Main testing agent that automates all steps from `SIMPLE_TESTING_STEPS.md`
- `index.html` - Web-based testing interface (if available)

## Usage

### Quick Start

```bash
# From project root
./run-automated-tests.sh
```

This will:
1. ✅ Check environment and dependencies
2. 🔨 Build Tauri binary if needed
3. 🎭 Install Playwright browsers
4. 🚀 Run all automated tests
5. 📄 Generate `AUTOMATED_TEST_RESULTS.md`

### Manual Usage

```bash
# Run agent directly
node tools/automated-testing-agent.js

# Or use npm script (if added to package.json)
npm run test:auto
```

## What It Tests

The agent automates all 6 steps from `SIMPLE_TESTING_STEPS.md`:

1. **TUI Help Screen** - Tests `?` key functionality
2. **TUI Search** - Tests `/` search functionality
3. **GUI Launch** - Launches SignalX GUI application
4. **Accessibility Tools** - Runs `window.checkA11y()` and related functions
5. **Keyboard Navigation** - Tests Tab key navigation and focus rings
6. **SkipLinks** - Tests SkipLink appearance and functionality

## Requirements

- Node.js and npm
- Rust and Tauri CLI (for building)
- Playwright browsers (installed automatically)

## Output

- **Console Output**: Real-time test progress with emojis
- **Test Report**: `AUTOMATED_TEST_RESULTS.md` with detailed results
- **Exit Code**: 0 for all tests passed, 1 for failures

## Troubleshooting

### TUI Tests Fail
- Ensure Tauri binary is built: `npm run tauri:build`
- Check that `src-tauri/target/release/signalx-tui` exists

### GUI Tests Fail
- GUI launch may take time on first run
- Check that no other SignalX instances are running
- Verify development environment is set up

### Accessibility Tests Fail
- Ensure running in development mode (`npm run tauri:dev`)
- Check browser console for accessibility framework messages

## Customization

The agent can be modified by editing `automated-testing-agent.js`:

```javascript
// Configuration options
const CONFIG = {
  projectRoot: path.join(__dirname, '..'),
  tuiBinary: path.join(__dirname, '../src-tauri/target/release/signalx-tui'),
  guiUrl: 'http://localhost:3000',
  testTimeout: 30000,
  launchTimeout: 120000,
};
```

## Integration

Consider adding to `package.json`:

```json
{
  "scripts": {
    "test:auto": "node tools/automated-testing-agent.js",
    "test:ci": "./run-automated-tests.sh"
  }
}
```
