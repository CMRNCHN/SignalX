# SignalX Logging & Self-Fix System

## Overview

SignalX now includes comprehensive logging and self-healing functionality to improve debugging, error handling, and resilience in both browser and Tauri environments.

## Components

### 1. Structured Logger (`src/utils/logger.ts`)

A centralized logging system that captures all application logs with timestamps, scopes, and metadata.

#### Features

- **Scoped Logging**: Create loggers bound to specific modules/components
- **Multiple Log Levels**: debug, info, warn, error
- **Metadata Support**: Attach arbitrary data to log entries
- **Global Access**: Logs are exposed on `window.__signalxLogs` for debugging
- **Automatic Rotation**: Keeps last 500 log entries
- **Global Error Handlers**: Captures unhandled errors and promise rejections

#### Usage

```typescript
import { logWithScope } from './utils/logger';

const log = logWithScope('MyComponent');

log('info', 'Component mounted');
log('error', 'Failed to load data', { reason: 'timeout', endpoint: '/api/data' });
log('warn', 'Deprecated method called');
log('debug', 'State updated', { newState });
```

#### Browser Console Access

```javascript
// View all captured logs
window.__signalxLogs

// Example log entry:
// {
//   level: 'error',
//   scope: 'boot',
//   message: 'Failed to load accounts',
//   meta: { error: 'Network timeout' },
//   timestamp: '2026-01-16T14:22:33.456Z'
// }
```

### 2. Resilient Tauri Wrapper (`src/utils/tauri.ts`)

A wrapper around Tauri APIs that gracefully handles browser-only mode and provides self-healing capabilities.

#### Features

- **Automatic Fallback**: Works in browser without Tauri backend
- **Polling & Waiting**: Waits up to 2 seconds for Tauri to become available
- **Throttled Warnings**: Prevents log spam with 5-second throttle
- **Fallback Values**: Supports default return values when Tauri unavailable
- **Self-Fix Utilities**: Global debugging helpers
- **Error Logging**: All Tauri errors are logged with context

#### Usage

```typescript
import { invoke, listen, isTauriAvailable } from './utils/tauri';

// Invoke with automatic fallback
const accounts = await invoke<string[]>('list_accounts', {}, { fallback: [] });

// Check availability
if (isTauriAvailable()) {
  console.log('Running in Tauri');
} else {
  console.log('Running in browser');
}

// Listen to events (gracefully no-ops in browser)
const unlisten = await listen<Message>('message-received', (event) => {
  console.log('Received:', event.payload);
});
```

### 3. Self-Fix Console Utilities

Global debugging utilities exposed on `window.signalxSelfFix`:

```javascript
// Retry Tauri connection if it failed
window.signalxSelfFix.retryTauri()

// Set development account number
window.signalxSelfFix.setDevAccount('7742083223')

// Clear development account number
window.signalxSelfFix.clearDevAccount()

// Dump all logs to console
window.signalxSelfFix.dumpLogs()
```

## Integration

### Application Bootstrap (`src/main.tsx`)

```typescript
import { registerGlobalErrorHandlers } from "./utils/logger";
import { registerSelfFix } from "./utils/tauri";

// Initialize at app startup
registerGlobalErrorHandlers();
registerSelfFix();
```

### Component Usage

All components now use the resilient wrappers instead of direct `@tauri-apps` imports:

**Before:**
```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
```

**After:**
```typescript
import { invoke, listen } from "./utils/tauri";
import { logWithScope } from "./utils/logger";

const log = logWithScope('ComponentName');
```

## Testing

Run the comprehensive test suite:

```bash
./scripts/testing/test-logging-self-fix.sh
```

This verifies:
- ✓ Logger and Tauri wrapper files exist
- ✓ All exports are present
- ✓ Initialization in main.tsx
- ✓ No direct @tauri-apps imports in components
- ✓ All components use resilient wrappers
- ✓ Logging is used throughout the app

## Benefits

### 1. **Better Debugging**
- All logs captured with timestamps and context
- Easy to filter by scope/level
- Viewable in browser console at any time

### 2. **Resilience**
- App works in browser for UI development
- Graceful degradation when Tauri unavailable
- Auto-retry logic for transient failures

### 3. **Self-Healing**
- Console utilities to fix common issues
- Retry failed connections
- Override settings for testing

### 4. **Error Handling**
- All unhandled errors captured
- Promise rejections logged
- Tauri command failures logged with context

### 5. **Developer Experience**
- Consistent API across all components
- Less boilerplate error handling
- Clear logs for troubleshooting

## Architecture

```
┌─────────────────────────────────────────┐
│           Application Code              │
│  (App.tsx, hooks, components)           │
└───────────────┬─────────────────────────┘
                │
                │ uses
                ↓
┌─────────────────────────────────────────┐
│      Resilient Wrappers Layer           │
│  ┌─────────────────┐ ┌───────────────┐  │
│  │  logger.ts      │ │  tauri.ts     │  │
│  │  - Scoped logs  │ │  - invoke()   │  │
│  │  - Error capture│ │  - listen()   │  │
│  │  - Log rotation │ │  - Fallbacks  │  │
│  └─────────────────┘ └───────────────┘  │
└───────────────┬─────────────────────────┘
                │
                │ calls
                ↓
┌─────────────────────────────────────────┐
│         Tauri Backend / Browser         │
│  @tauri-apps/api (in Tauri)             │
│  or browser environment (dev mode)      │
└─────────────────────────────────────────┘
```

## Configuration

### Log Settings

Adjust in `src/utils/logger.ts`:

```typescript
const MAX_LOGS = 500;  // Number of logs to keep
```

### Tauri Availability Settings

Adjust in `src/utils/tauri.ts`:

```typescript
const TAURI_WAIT_MS = 2000;      // Max wait time for Tauri
const TAURI_POLL_MS = 100;       // Polling interval
const LOG_THROTTLE_MS = 5000;    // Warning throttle
```

## Troubleshooting

### Issue: "Tauri not available" warnings in browser

**Expected behavior** - This is normal when running `npm run dev`. The app gracefully falls back to browser-only mode.

**To silence warnings**: They're already throttled to once per 5 seconds.

### Issue: Need to test Tauri-specific features in browser

**Solution**: Use fallback values:

```typescript
const data = await invoke<MyData>('my_command', {}, {
  fallback: mockData  // Use mock data in browser
});
```

### Issue: Logs not appearing

**Check**:
1. Open browser console
2. Type `window.__signalxLogs`
3. Verify logs are being captured

### Issue: Need to debug Tauri connection

**Use self-fix utilities**:
```javascript
// Check Tauri availability
window.signalxSelfFix.retryTauri()

// Dump all logs
console.table(window.signalxSelfFix.dumpLogs())
```

## Future Enhancements

- [ ] Log persistence to file in Tauri mode
- [ ] Log export functionality
- [ ] Performance metrics integration
- [ ] Remote error reporting (optional)
- [ ] Log filtering UI component
- [ ] Auto-recovery strategies

## Related Documentation

- [Error Handling](./TROUBLESHOOTING.md)
- [Testing Guide](./SIMPLE_TESTING_STEPS.md)
- [Development Workflow](./QUICKSTART.md)
