# SignalX Project Structure

This document describes the organized structure of the SignalX repository.

## Directory Overview

```
signalx/
├── bin/                    # Executable binaries
│   └── signalx            # SignalX CLI wrapper
│
├── docs/                   # Project documentation
│   ├── README.md          # Documentation index
│   ├── BUILD.md           # Build instructions
│   ├── QUICKSTART.md      # Quick start guide
│   ├── STATUS.md          # Project status
│   ├── NEXT_STEPS.md      # Roadmap and next steps
│   ├── HANDOFF.md         # Handoff documentation
│   ├── AESTHETICS_TODO.md # UI/UX tasks
│   └── VISION_ASSESSMENT.md
│
├── packages/               # Modular packages/extensions
│   ├── README.md          # Packages overview
│   ├── signal_auth_permissions/
│   ├── signal_automation_rules/
│   ├── signal_automation_scaffolding/
│   ├── signal_config_secrets/
│   ├── signal_data_storage/
│   ├── signal_layout_intelligence/
│   ├── signal_logging_observability/
│   ├── signal_packaging_release/
│   ├── signal_plugin_system/
│   ├── signal_testing_ci/
│   └── signal_tui_headless_mode/
│
├── scripts/                # Shell scripts organized by purpose
│   ├── README.md          # Scripts documentation
│   ├── setup/             # Setup and configuration
│   │   ├── setup-ai.sh
│   │   ├── apply-signalx-cursor-bundle.sh
│   │   └── _signalx_cursor_bundle.sh
│   ├── dev/               # Development scripts
│   │   ├── run-dev.sh
│   │   ├── run-all.sh
│   │   ├── SignalX-Dev.command
│   │   └── SignalX-Dev-Launcher.applescript
│   ├── signal-cli/        # Signal CLI integration
│   │   ├── signal-cli-check.sh
│   │   ├── signal-cli-link.sh
│   │   ├── signal-cli-link-debug.sh
│   │   ├── link-signal-cli.sh
│   │   ├── link-signal.sh
│   │   ├── link-live.sh
│   │   ├── link-now.sh
│   │   ├── run-signal-link.sh
│   │   ├── run-signal-link-qr.sh
│   │   ├── use-signalx-number.sh
│   │   └── fix-zshrc-and-signal-cli.sh
│   ├── testing/           # Testing and verification
│   │   ├── test-features.sh
│   │   └── verify-build.sh
│   └── build/             # Build scripts (reserved)
│
├── src/                    # React frontend source
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/        # React components
│   └── *.css             # Stylesheets
│
├── src-tauri/             # Tauri backend (Rust)
│   ├── src/              # Rust source code
│   ├── Cargo.toml        # Rust dependencies
│   ├── tauri.conf.json   # Tauri configuration
│   └── icons/            # App icons
│
├── tools/                 # Development tools
│   ├── index.html
│   └── signalx_features.py
│
├── .editorconfig          # Editor configuration
├── .prettierrc            # Prettier configuration
├── .nvmrc                 # Node version
├── .gitignore            # Git ignore rules
├── package.json           # Node dependencies
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite configuration
├── README.md              # Main project README
├── CONTRIBUTING.md        # Contribution guidelines
└── PROJECT_STRUCTURE.md  # This file
```

## Key Directories

### `scripts/`
All shell scripts are organized by purpose:
- **setup/**: Initial setup and configuration
- **dev/**: Development workflow scripts
- **signal-cli/**: Signal CLI integration and linking
- **testing/**: Testing and verification scripts
- **build/**: Build-related scripts (reserved for future use)

### `packages/`
Modular packages that extend SignalX functionality. Each package follows a consistent structure with README, docs, and source code.

### `docs/`
All project documentation is centralized here, making it easy to find and maintain.

### `src/` and `src-tauri/`
Main application source code for frontend (React) and backend (Rust/Tauri).

## File Organization Principles

1. **Separation of Concerns**: Scripts, docs, and packages are clearly separated
2. **Modularity**: Packages are self-contained and can be developed independently
3. **Discoverability**: README files in each major directory explain contents
4. **Consistency**: Similar files are grouped together (e.g., all scripts in `scripts/`)

## Configuration Files

- `.editorconfig`: Ensures consistent code formatting across editors
- `.prettierrc`: JavaScript/TypeScript formatting rules
- `.nvmrc`: Specifies Node.js version
- `.vscode/settings.json`: VS Code workspace settings

## Getting Started

See `docs/QUICKSTART.md` for setup instructions and `CONTRIBUTING.md` for contribution guidelines.

