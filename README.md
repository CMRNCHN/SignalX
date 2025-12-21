# SignalX

SignalX is a terminal-first secure messaging and operations toolkit. It provides a modular TUI/CLI architecture for controlled communication, automation workflows, and signal-based interaction boundaries.

## Features

- 🖥️ **Terminal User Interface (TUI)** - Interactive blessed-based interface
- 🔧 **Command Line Interface (CLI)** - Scriptable command-line tools
- 📦 **Modular Architecture** - Extensible plugin system
- 🔐 **Security-First** - Permission boundaries and access control
- 📝 **Comprehensive Logging** - File and console logging with log levels
- ⚙️ **Flexible Configuration** - JSON config files and environment variables

## Architecture

SignalX follows a clean, modular architecture:

```
SignalX/
├── src/
│   ├── cli/           # CLI entry point and commands
│   ├── tui/           # Terminal UI interface
│   ├── config/        # Configuration loading
│   ├── logger/        # Logging infrastructure
│   ├── core/          # Core types and utilities
│   └── modules/       # Pluggable modules
│       ├── messaging/     # Message transmission
│       ├── routing/       # Signal routing
│       └── permissions/   # Access control
```

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run SignalX
npm start
```

## Usage

### Start TUI Mode

```bash
# Start with default configuration
signalx start

# Start with custom configuration
signalx start --config ./config.json
```

### Check Status

```bash
signalx status
```

### View Configuration

```bash
signalx config
```

### Get Help

```bash
signalx --help
signalx start --help
```

## Configuration

SignalX can be configured via JSON files or environment variables.

### Configuration File

Copy `config.example.json` to `config.json` and customize:

```json
{
  "app": {
    "name": "SignalX",
    "version": "0.1.0",
    "environment": "development"
  },
  "logging": {
    "level": "info",
    "file": "./logs/signalx.log",
    "console": true
  },
  "modules": {
    "messaging": { "enabled": true },
    "routing": { "enabled": true },
    "permissions": { "enabled": true }
  }
}
```

### Environment Variables

- `SIGNALX_ENV` - Environment (development, production, test)
- `SIGNALX_LOG_LEVEL` - Log level (debug, info, warn, error)
- `SIGNALX_LOG_FILE` - Path to log file

## Modules

### Messaging Module

Handles secure message transmission and reception. Future enhancements include:
- End-to-end encryption
- Message queuing and delivery confirmation
- Multiple protocol support

### Routing Module

Manages signal routing and event distribution. Future enhancements include:
- Event-driven architecture
- Signal filtering and transformation
- Routing rules and conditions

### Permissions Module

Manages access control and permission boundaries. Future enhancements include:
- Role-based access control (RBAC)
- Attribute-based access control (ABAC)
- Audit logging

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Lint code
npm run lint

# Format code
npm run format
```

## Dependencies

SignalX uses minimal dependencies:
- **blessed** - Terminal UI framework
- **commander** - CLI argument parsing
- **TypeScript** - Type safety and modern JavaScript

## Contributing

Contributions are welcome! Please ensure your code follows the existing style and passes all linting checks.

## License

MIT License - See LICENSE file for details
