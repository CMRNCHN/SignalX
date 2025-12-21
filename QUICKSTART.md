# SignalX Quick Start Guide

## Installation

```bash
# Clone the repository
git clone https://github.com/CMRNCHN/SignalX.git
cd SignalX

# Install dependencies
npm install

# Build the project
npm run build
```

## Running SignalX

### Start the TUI Interface

```bash
npm start
# or
node dist/cli/index.js start
```

### Command Line Options

```bash
# Check status
node dist/cli/index.js status

# View configuration
node dist/cli/index.js config

# Use custom config file
node dist/cli/index.js start --config ./my-config.json

# Get help
node dist/cli/index.js --help
```

## TUI Navigation

Once in the TUI interface:

- **q** or **Ctrl+C**: Quit the application
- **?**: Show help screen
- **m**: Refresh modules status
- **↑/↓**: Navigate (context-sensitive)
- **Enter**: Select/Execute

## Configuration

### Using Config Files

1. Copy the example configuration:
   ```bash
   cp config.example.json config.json
   ```

2. Edit `config.json` to customize:
   ```json
   {
     "app": {
       "environment": "development"
     },
     "logging": {
       "level": "info",
       "file": "./logs/signalx.log"
     },
     "modules": {
       "messaging": { "enabled": true },
       "routing": { "enabled": true },
       "permissions": { "enabled": true }
     }
   }
   ```

3. Start with your config:
   ```bash
   node dist/cli/index.js start --config config.json
   ```

### Using Environment Variables

```bash
# Set log level
SIGNALX_LOG_LEVEL=debug node dist/cli/index.js start

# Set environment
SIGNALX_ENV=production node dist/cli/index.js start

# Set log file location
SIGNALX_LOG_FILE=/var/log/signalx.log node dist/cli/index.js start
```

## Module Overview

### Messaging Module
Handles secure message transmission and reception.
- Future: End-to-end encryption
- Future: Message queuing
- Future: Multiple protocols (TCP, WebSocket)

### Routing Module
Manages signal routing and event distribution.
- Future: Event-driven architecture
- Future: Signal filtering and transformation
- Future: Routing rules and conditions

### Permissions Module
Manages access control and permission boundaries.
- Future: Role-based access control (RBAC)
- Future: Attribute-based access control (ABAC)
- Future: Audit logging

## Development

```bash
# Run linter
npm run lint

# Format code
npm run format

# Build for development
npm run dev
```

## Logs

Logs are written to `./logs/signalx.log` by default. Each module has its own logger instance for better traceability.

Log levels: `debug`, `info`, `warn`, `error`

## Troubleshooting

### Build Errors
```bash
# Clean and rebuild
rm -rf dist/
npm run build
```

### Module Not Loading
Check the configuration file and ensure the module is enabled:
```json
{
  "modules": {
    "moduleName": { "enabled": true }
  }
}
```

### Logs Not Appearing
- Check the log level in your configuration
- Ensure the logs directory exists and is writable
- Check console output if `logging.console` is set to `true`

## Next Steps

1. Customize your configuration
2. Explore the module implementations in `src/modules/`
3. Extend modules with your own functionality
4. Add new modules following the existing patterns

For more information, see the main [README.md](README.md).
