# Contributing to SignalX

Thank you for your interest in contributing to SignalX! This document provides guidelines and information for contributors.

## Project Structure

```
signalx/
├── src/                    # React frontend source code
├── src-tauri/             # Tauri backend (Rust)
├── packages/              # Modular packages/extensions
│   ├── signal_automation_scaffolding/
│   ├── signal_config_secrets/
│   └── ...
├── scripts/               # Shell scripts organized by purpose
│   ├── setup/            # Setup and configuration scripts
│   ├── dev/              # Development scripts
│   ├── signal-cli/       # Signal CLI integration scripts
│   └── testing/          # Testing and verification scripts
├── docs/                  # Project documentation
├── tools/                 # Development tools and utilities
└── bin/                   # Executable binaries
```

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd signalx
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   - Create `.signalx.env` file (see `docs/QUICKSTART.md`)
   - Set required environment variables

4. **Run development server**
   ```bash
   ./scripts/dev/SignalX-Dev.command
   # or
   npm run tauri:dev
   ```

## Code Style

- **TypeScript/React**: Follow the existing code style
- **Rust**: Follow Rust standard formatting (`cargo fmt`)
- **Shell scripts**: Use consistent indentation (2 spaces)
- **EditorConfig**: Use `.editorconfig` for consistent formatting
- **Prettier**: Use `.prettierrc` for JavaScript/TypeScript formatting

## Making Changes

1. **Create a branch** for your changes
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the project structure:
   - Frontend code goes in `src/`
   - Backend code goes in `src-tauri/src/`
   - New packages go in `packages/`
   - Scripts go in `scripts/` with appropriate subdirectory

3. **Test your changes**
   ```bash
   ./scripts/testing/test-features.sh
   npm run tauri:build  # Verify build works
   ```

4. **Commit your changes** with clear, descriptive commit messages

5. **Submit a pull request**

## Package Development

When creating new packages in `packages/`:

- Follow the existing package structure
- Include a `README.md` with package documentation
- Place detailed docs in `docs/` subdirectory
- Keep source code in `src/` if applicable

## Script Organization

When adding new scripts:

- **Setup scripts**: `scripts/setup/`
- **Development scripts**: `scripts/dev/`
- **Signal CLI scripts**: `scripts/signal-cli/`
- **Testing scripts**: `scripts/testing/`
- **Build scripts**: `scripts/build/`

## Documentation

- Update relevant documentation in `docs/` when making changes
- Keep README files up to date
- Document new features and APIs

## Questions?

Refer to:
- `docs/QUICKSTART.md` - Quick start guide
- `docs/BUILD.md` - Build instructions
- `README.md` - Main project documentation

