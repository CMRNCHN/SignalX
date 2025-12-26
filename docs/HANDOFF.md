# SignalX Desktop - Handoff Document

## Current Status

### Configuration

- **`.signalx.env`** (redacted):
  ```
  SIGNALX_SIGNALCLI_CONFIG=/Users/cameroncohen/.local/share/signal-cli
  SIGNALX_NUMBER=+1[REDACTED]
  SIGNALX_SIGNALCLI_BIN=/opt/homebrew/bin/signal-cli
  # SIGNALX_OLLAMA_MODEL=qwen2.5:7b-instruct (commented out)
  ```

### Launcher

- **`scripts/dev/SignalX-Dev.command`** exists and is executable
- Logs to: `run-dev.command.log` (will be created on first run)
- Launcher handles:
  - Port 5173 cleanup
  - npm install check
  - Vite + Tauri dev startup

### Current Implementation

- Basic receive badge exists (shows "ok" or error states)
- Backend has `get_receive_loop_state()` command
- Event-driven architecture (no polling)
- Backend is source of truth for messages

---

## Next Tasks (In Order)

### A) Enhanced Health Badge

**Location**: `src/App.tsx` sidebar (currently line ~388)

**Requirements**:

- Use `get_receive_loop_state()` data
- Color logic:
  - **Green**: `last_receive_ok_at` < 15 seconds ago
  - **Yellow**: 15-60 seconds ago
  - **Red**: > 60 seconds ago OR `consecutive_failures > 0`
- Tooltip shows:
  - `backoff_ms`
  - `consecutive_failures` (error_count)
  - `last_receive_error` (if any)

**Implementation notes**:

- Calculate time delta: `Date.now() - (receiveState.last_receive_ok_at || 0)`
- Use HTML `title` attribute or a proper tooltip library
- Replace current simple badge at line 388

---

### B) Production Build Command

**Task**: Add build instructions and verify output

**Commands**:

```bash
npm run tauri build
```

**Deliverables**:

1. Document output path (typically `src-tauri/target/release/bundle/`)
2. Document how to run the built `.app` on macOS
3. Add to README or create `BUILD.md`

**Expected output location**:

- macOS: `src-tauri/target/release/bundle/macos/SignalX.app`

---

### C) Export Tools

**Backend**: Add new Tauri command `export_thread`

**Signature**:

```rust
#[tauri::command]
fn export_thread(
    state: tauri::State<AppState>,
    thread_id: String,
    format: String, // "txt" or "json"
) -> Value
```

**Requirements**:

1. Export thread messages to file in `app_data_dir/export/`
2. Return file path in response
3. Format:
   - `.txt`: Human-readable format (timestamp, sender, content)
   - `.json`: Full message objects as JSON array

**Frontend**: Add export UI

- Button in thread header (next to "Refresh")
- Dropdown or buttons for format selection
- Show "Open folder" button after export
- Use Tauri's `open` command to reveal file in Finder

**Tauri API needed**:

```typescript
import { open } from "@tauri-apps/api/shell";
// After export:
await open(pathToFile);
```

---

## Constraints (Must Maintain)

1. **Backend is source of truth**: No localStorage for canonical messages
2. **No polling**: Event-driven only (use Tauri events)
3. **API format**: All commands return `{success: true, data: T}` or `{success: false, error: string}`

---

## Acceptance Checklist

Before marking as "done", verify:

- [ ] Account switching doesn't crash
- [ ] Threads load and open
- [ ] Unread counts change when opening a thread
- [ ] App restarts and history persists (disk persistence works)
- [ ] Search returns results
- [ ] Alias set/get works
- [ ] AI summarize/draft produces output (if Ollama configured)

---

## Optional: AI Tools Setup

To enable AI features:

1. Install Ollama:

   ```bash
   brew install ollama
   ollama pull qwen2.5:7b-instruct
   ```

2. Update `.signalx.env`:

   ```
   SIGNALX_OLLAMA_MODEL=qwen2.5:7b-instruct
   ```

3. Verify:
   - `summarize_thread(thread_id)` returns readable summary
   - `draft_reply(thread_id, intent)` returns draft (never auto-sends)

---

## Testing Notes

After implementing each task:

- Test with real Signal account
- Verify no crashes on account switch
- Check disk persistence (close/reopen app)
- Verify export files are readable

---

## File Locations

- Frontend: `src/App.tsx`
- Backend: `src-tauri/src/main.rs`
- Config: `.signalx.env`
- Launcher: `scripts/dev/SignalX-Dev.command`
- Log: `run-dev.command.log` (created on first run)
