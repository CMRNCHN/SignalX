# SignalX Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         SignalX                              │
│                  Terminal Operations Toolkit                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
      ┌──────────────┐               ┌──────────────┐
      │     CLI      │               │     TUI      │
      │  Entry Point │               │   Interface  │
      └──────┬───────┘               └──────┬───────┘
             │                              │
             └──────────────┬───────────────┘
                            │
                            ▼
                   ┌────────────────┐
                   │  Core System   │
                   │  - Config      │
                   │  - Logger      │
                   │  - Types       │
                   └────────┬───────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
    ┌──────────┐      ┌──────────┐     ┌──────────┐
    │Messaging │      │ Routing  │     │Permission│
    │  Module  │      │  Module  │     │  Module  │
    └──────────┘      └──────────┘     └──────────┘
```

## Component Overview

### 1. Entry Points

#### CLI (`src/cli/index.ts`)
- Command-line interface using Commander.js
- Commands: `start`, `status`, `config`
- Handles argument parsing and command routing
- Initializes modules based on configuration

#### TUI (`src/tui/index.ts`)
- Terminal UI using blessed library
- Interactive interface with keyboard navigation
- Real-time status display
- Multiple panels: header, modules, console, logs, footer

### 2. Core System

#### Configuration (`src/config/`)
- `ConfigLoader` class for loading and merging configs
- Supports JSON config files
- Environment variable overrides
- Default configuration fallback

#### Logger (`src/logger/`)
- `SimpleLogger` implementation
- Log levels: debug, info, warn, error
- File and console output
- Module-specific logger instances
- Timestamped log entries

#### Core Types & Utils (`src/core/`)
- TypeScript interfaces and types
- Common utility functions
- Error handling utilities

### 3. Modules

All modules implement the `Module` interface:
```typescript
interface Module {
  name: string;
  initialize(config: ModuleConfig, logger: Logger): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

#### Messaging Module (`src/modules/messaging/`)
- Handles message transmission
- Placeholder for encryption
- Future: Multiple protocol support

#### Routing Module (`src/modules/routing/`)
- Signal routing and distribution
- Route management (signal → destinations)
- Placeholder for event-driven architecture

#### Permissions Module (`src/modules/permissions/`)
- Access control management
- Grant/check/revoke permissions
- Future: RBAC/ABAC support

## Data Flow

### Application Startup

```
1. CLI Entry
   ↓
2. Load Configuration
   ├─ Read config file (if provided)
   ├─ Apply environment variables
   └─ Merge with defaults
   ↓
3. Initialize Logger
   ├─ Create log directory
   └─ Set log level
   ↓
4. Initialize Modules
   ├─ Messaging Module
   ├─ Routing Module
   └─ Permissions Module
   ↓
5. Start Modules
   ↓
6. Launch TUI (if start command)
   ↓
7. Handle User Input
   ↓
8. On Exit:
   ├─ Stop all modules
   └─ Clean up resources
```

### Configuration Resolution Order

```
1. Default Configuration
   ↓
2. Config File (if provided)
   ↓
3. Environment Variables
   ↓
4. Final Configuration
```

Environment variables take highest precedence:
- `SIGNALX_ENV` → `app.environment`
- `SIGNALX_LOG_LEVEL` → `logging.level`
- `SIGNALX_LOG_FILE` → `logging.file`

## Module Lifecycle

```
┌─────────────┐
│ Unloaded    │
└──────┬──────┘
       │ initialize(config, logger)
       ▼
┌─────────────┐
│ Initialized │
└──────┬──────┘
       │ start()
       ▼
┌─────────────┐
│   Running   │ ◄─── Normal operations
└──────┬──────┘
       │ stop()
       ▼
┌─────────────┐
│   Stopped   │
└─────────────┘
```

## Extensibility Points

### Adding New Modules

1. Create module directory: `src/modules/mymodule/`
2. Implement `Module` interface
3. Add module config to `ModulesConfig` type
4. Register in CLI initialization
5. Update default configuration

### Adding New CLI Commands

1. Add command to `src/cli/index.ts`:
```typescript
program
  .command('mycommand')
  .description('My command description')
  .action((options) => {
    // Implementation
  });
```

### Customizing TUI

1. Edit `src/tui/index.ts`
2. Add new blessed components
3. Implement keyboard handlers
4. Update layout as needed

## Dependencies

### Production Dependencies
- **blessed** (0.1.81): Terminal UI framework
- **commander** (11.1.0): CLI argument parsing

### Development Dependencies
- **TypeScript** (5.3.0): Type safety
- **ESLint** (8.54.0): Code linting
- **Prettier** (3.1.0): Code formatting

## Security Considerations

1. **Permission Module**: Foundation for access control
2. **Logging**: Audit trail of all operations
3. **Configuration**: Sensitive data should use environment variables
4. **Future**: Implement encryption in messaging module
5. **Future**: Add authentication/authorization layer

## Performance Characteristics

- **Startup Time**: Fast (~100ms for all modules)
- **Memory**: Minimal footprint (~50MB base)
- **Logging**: Async file I/O for performance
- **Modules**: Lazy initialization if disabled

## Testing Strategy

1. **Unit Tests**: Individual module functions
2. **Integration Tests**: Module interaction
3. **Manual Tests**: TUI interface verification
4. **CLI Tests**: Command output validation

## Future Enhancements

### Short-term
- Add unit tests with Jest
- Implement message encryption
- Add configuration validation
- Enhanced error handling

### Medium-term
- WebSocket support for messaging
- Plugin system for modules
- Configuration hot-reload
- Performance monitoring

### Long-term
- Distributed architecture
- Multi-user support
- Database persistence
- REST API interface
