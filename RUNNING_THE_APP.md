# How to Run SignalX

## 🚀 Quick Start

### Prerequisites
1. **Node.js** (v16+ recommended) - [Install Node.js](https://nodejs.org/)
2. **Rust & Cargo** - Required for Tauri backend
   ```bash
   # Install Rust (if not already installed)
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
3. **Tauri CLI** - Install with:
   ```bash
   cargo install tauri-cli
   ```

### Installation
```bash
# Install dependencies
npm install
```

## 🎯 Running the Application

### Development Mode (Recommended)
Runs the app with hot-reload for both frontend and backend:

```bash
npm run tauri:dev
```

This will:
- Start the Vite dev server for React frontend
- Compile and run the Rust backend
- Open the Tauri window automatically
- Enable hot-reload on file changes

### Alternative: Frontend Only (Web Preview)
If you just want to see the React UI without the Tauri backend:

```bash
npm run dev
```

Then open `http://localhost:5173` in your browser (Vite default port).

### Production Build
Build a native desktop application:

```bash
npm run tauri:build
```

**Output locations:**
- **macOS**: `src-tauri/target/release/bundle/macos/SignalX.app`
- A DMG installer is also created in the same directory

### Using the Dev Launcher Script
On macOS, you can use the convenient launcher:

```bash
./scripts/dev/SignalX-Dev.command
```

## 🧪 Testing

### Run Tests
```bash
# Run all tests
npm test

# Run tests once (CI mode)
npm run test:run

# Run with coverage
npm run test:coverage

# Full automated test suite
npm run test:full
```

### Linting & Formatting
```bash
# Check for linting errors
npm run lint

# Auto-fix linting errors
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

## 📝 Notes

- The app stores data in `~/Library/Application Support/SignalX/` on macOS
- For Signal CLI integration, see `README.md` section on "Integrating Signal CLI"
- Development mode requires both Node.js and Rust toolchains
