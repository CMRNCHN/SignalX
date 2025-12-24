# Packages Directory

This directory contains modular packages that extend SignalX functionality.

## Available Packages

### `signal_auth_permissions/`
Authentication and permissions management.

### `signal_automation_rules/`
Automation rules engine.

### `signal_automation_scaffolding/`
Automation scaffolding and infrastructure:
- `src/automation/` - Core automation engine, outbox, rules, and types

### `signal_config_secrets/`
Configuration and secrets management:
- `src/config/` - Environment and configuration handling

### `signal_data_storage/`
Data storage and persistence layer.

### `signal_layout_intelligence/`
Layout and UI intelligence:
- `src/layout/` - Layout store, resizer, and snap points

### `signal_logging_observability/`
Logging and observability:
- `src/logging/` - Logger implementation

### `signal_packaging_release/`
Packaging and release management:
- Release notes templates and versioning

### `signal_plugin_system/`
Plugin system infrastructure:
- `src/plugins/` - Plugin registry and types

### `signal_testing_ci/`
Testing and CI/CD:
- `scripts/` - Preflight and smoke test scripts

### `signal_tui_headless_mode/`
TUI and headless mode support:
- `cli/` - CLI implementation with package.json

## Package Structure

Each package follows a consistent structure:
- `README.md` - Package documentation
- `docs/` - Additional documentation
- `src/` - Source code (when applicable)

## Integration

Packages are designed to be modular and can be integrated into the main application as needed. Refer to each package's README for specific integration instructions.

