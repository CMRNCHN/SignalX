# SignalX Desktop - Build Instructions

## Prerequisites

- Node.js (v18+ recommended)
- npm or yarn
- Rust toolchain (installed automatically by Tauri)
- Xcode Command Line Tools (macOS)

## Development Build

Run the app in development mode:

```bash
npm run tauri:dev
```

Or use the launcher:
```bash
./scripts/dev/SignalX-Dev.command
```

## Production Build

Build the production-ready app:

```bash
npm run tauri:build
```

This command will:
1. Build the frontend (Vite) → `dist/`
2. Build the Rust backend → `src-tauri/target/release/`
3. Bundle everything into a macOS app → `src-tauri/target/release/bundle/macos/SignalX.app`

## Build Output

### macOS

**Location**: `src-tauri/target/release/bundle/macos/SignalX.app`

**To run the built app**:

1. **Double-click**: Navigate to the folder and double-click `SignalX.app`
2. **Command line**:
   ```bash
   open src-tauri/target/release/bundle/macos/SignalX.app
   ```
3. **Drag to Applications**: Drag `SignalX.app` to your `/Applications` folder for system-wide access

### Other Platforms

- **Linux**: `src-tauri/target/release/bundle/appimage/SignalX.AppImage` or `.deb` package
- **Windows**: `src-tauri/target/release/bundle/msi/SignalX_0.1.0_x64_en-US.msi`

## Build Configuration

Build settings are configured in:
- `src-tauri/tauri.conf.json` - Tauri app configuration
- `vite.config.ts` - Frontend build configuration
- `package.json` - npm scripts

## Troubleshooting

### Build fails with "command not found: tauri"

Make sure dependencies are installed:
```bash
npm install
```

### Build fails with Rust errors

Ensure Rust toolchain is up to date:
```bash
rustup update
```

### App doesn't start after build

1. Check that `.signalx.env` exists in the project root
2. Verify `SIGNALX_SIGNALCLI_CONFIG` and `SIGNALX_NUMBER` are set
3. Check console logs for errors

### Code signing (macOS)

For distribution outside your Mac, you may need to:
1. Get an Apple Developer certificate
2. Update `src-tauri/tauri.conf.json` with your signing identity
3. Rebuild

## Build Size

Typical build sizes:
- macOS `.app`: ~50-100 MB (includes Rust runtime)
- Development build: Larger due to debug symbols

## Continuous Integration

Example GitHub Actions workflow:

```yaml
name: Build SignalX

on: [push, pull_request]

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm install
      - name: Build app
        run: npm run tauri:build
      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: SignalX.app
          path: src-tauri/target/release/bundle/macos/SignalX.app
```

