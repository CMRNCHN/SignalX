# Foundation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SignalX trustworthy on exactly one Signal account so IVR and commerce can safely send through the outbox.

**Architecture:** Keep the single Tauri + Rust binary. Add small pure helpers (`sanitize_filename`, `canonical_account_id`, outbox path join, path-under-root check) with unit tests. Bind bootstrap/receive/outbox/UI to that one id; delete multi-account IPC and direct send; lock CSP and `open_path`.

**Tech Stack:** Rust (Tauri 2), React/TypeScript, signal-cli via env config

## Global Constraints

- Single account only: identity is `SIGNALX_NUMBER` (raw for signal-cli; sanitized for all storage keys).
- All outbound traffic goes through the outbox — no direct `send_message` IPC.
- No new services, gateways, or module splits of `lib.rs` in this plan (YAGNI).
- Do not delete orphan thread/outbox JSON files on disk.
- Never commit `.signalx.env`.

## File map

| File | Role |
|------|------|
| `src-tauri/src/lib.rs` | Helpers, OutboxStore path, AccountManager bootstrap, receive target, remove multi-account + send commands, harden `open_path` |
| `src-tauri/capabilities/default.json` | Drop internal toggle-devtools |
| `src-tauri/tauri.conf.json` | Non-null CSP |
| `src/api.ts` | Drop account-switch + send APIs; fix `OutboxSummary` |
| `src/App.tsx` | Replace account `<select>` with configured-number label |
| `docs/STATUS.md`, `docs/HANDOFF.md`, `docs/QUICKSTART.md`, `docs/BUILD.md`, `docs/NEXT_STEPS.md` | Match single-account GUI reality |

---

### Task 1: Pure helpers + unit tests (TDD)

**Files:**
- Modify: `src-tauri/src/lib.rs` (add helpers near `sanitize_filename`; add `#[cfg(test)]` module at end of file or after helpers)
- Test: same file via `cargo test`

**Interfaces:**
- Produces:
  - `fn sanitize_filename(s: &str) -> String` (existing)
  - `fn canonical_account_id_from_number(number: &str) -> String` — trim + sanitize
  - `fn outbox_path_for(dir: &Path, account_id: &str) -> PathBuf` — `dir.join(format!("{}.json", sanitize_filename(account_id)))`
  - `fn path_is_under_root(root: &Path, candidate: &Path) -> bool` — canonicalize both when possible; reject if candidate escapes root

- [ ] **Step 1: Write failing tests**

Add at the bottom of `lib.rs` (or after the helpers section):

```rust
#[cfg(test)]
mod foundation_tests {
  use super::*;
  use std::path::PathBuf;

  #[test]
  fn sanitize_replaces_phone_plus_and_path_sep() {
    assert_eq!(sanitize_filename("+12025551212"), "_12025551212");
    assert_eq!(sanitize_filename("../etc/passwd"), "______passwd");
    assert!(!sanitize_filename("a/../../b").contains('/'));
    assert!(!sanitize_filename("a/../../b").contains('.'));
  }

  #[test]
  fn canonical_account_id_trims_and_sanitizes() {
    assert_eq!(
      canonical_account_id_from_number("  +12025551212\n"),
      "_12025551212"
    );
  }

  #[test]
  fn outbox_path_stays_under_dir() {
    let dir = PathBuf::from("/tmp/signalx-outbox-test");
    let p = outbox_path_for(&dir, "../../etc/passwd");
    assert_eq!(p, dir.join("______passwd.json"));
    assert!(p.starts_with(&dir));
  }

  #[test]
  fn path_under_root_rejects_escape() {
    let tmp = std::env::temp_dir().join(format!("signalx-root-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&tmp);
    let inside = tmp.join("exports").join("a.json");
    let _ = std::fs::create_dir_all(inside.parent().unwrap());
    std::fs::write(&inside, b"x").unwrap();
    assert!(path_is_under_root(&tmp, &inside));
    let outside = std::env::temp_dir().join("signalx-outside-escape");
    std::fs::write(&outside, b"y").unwrap();
    assert!(!path_is_under_root(&tmp, &outside));
    let _ = std::fs::remove_dir_all(&tmp);
    let _ = std::fs::remove_file(&outside);
  }
}
```

Also add the stub so the file compiles only after Step 3 — for Step 1, if helpers are missing, tests fail to compile/link which is fine; prefer adding empty stubs that `todo!()` or wrong implementations so tests fail assertions.

- [ ] **Step 2: Run tests — expect fail**

Run: `cd src-tauri && cargo test foundation_tests -- --nocapture`  
Expected: compile error (missing symbols) or assertion failures.

- [ ] **Step 3: Implement helpers**

Near existing `sanitize_filename`:

```rust
fn canonical_account_id_from_number(number: &str) -> String {
  sanitize_filename(number.trim())
}

fn outbox_path_for(dir: &Path, account_id: &str) -> PathBuf {
  dir.join(format!("{}.json", sanitize_filename(account_id)))
}

fn path_is_under_root(root: &Path, candidate: &Path) -> bool {
  let Ok(root) = root.canonicalize() else {
    return false;
  };
  let Ok(cand) = candidate.canonicalize() else {
    return false;
  };
  cand.starts_with(&root)
}
```

Change `OutboxStore::path_for` to:

```rust
fn path_for(&self, account_id: &str) -> PathBuf {
  outbox_path_for(&self.dir, account_id)
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `cd src-tauri && cargo test foundation_tests -- --nocapture`  
Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
Add foundation helpers and path-containment unit tests.

EOF
)"
```

---

### Task 2: Bind runtime to canonical single account

**Files:**
- Modify: `src-tauri/src/lib.rs` (`get_signal_number` callers for storage, `AccountManager`, `bootstrap_accounts`, `require_active_account` / `get_threads` fallbacks, receive loop persist target ~3920, `run` setup)

**Interfaces:**
- Consumes: `canonical_account_id_from_number`
- Produces: `fn configured_account_id() -> Option<String>` = `get_signal_number().map(|n| canonical_account_id_from_number(&n))`
- Storage keys always use configured/canonical id; signal-cli still uses raw `get_signal_number()`

- [ ] **Step 1: Add `configured_account_id` and fix AccountManager keying**

```rust
fn configured_account_id() -> Option<String> {
  get_signal_number().map(|n| canonical_account_id_from_number(&n))
}
```

In `AccountManager::get_or_create`, normalize the key:

```rust
fn get_or_create(&self, account_id: &str) -> ThreadState {
  let account_id = sanitize_filename(account_id.trim());
  // ... use account_id for map key and ThreadState::new(..., self.storage_path_for(&account_id))
}
```

Remove or stop using `list_accounts` disk-stem enumeration for IPC (function can remain unused until deleted in Task 3).

- [ ] **Step 2: Bootstrap only the configured account**

```rust
fn bootstrap_accounts(state: &AppState) {
  let Some(id) = configured_account_id() else {
    eprintln!("SignalX: SIGNALX_NUMBER not set — receive/outbox will not start");
    return;
  };
  state.account_manager.set_active(id.clone());
  state.account_manager.get_or_create(&id);
  state.alias_manager.load_account(&id);
  state.contact_store.load_account(&id);
  state.group_store.load_account(&id);
}
```

- [ ] **Step 3: Receive loop persists to configured account only**

Where receive currently does `state.account_manager.get_active().unwrap_or_else(|| my_number.clone())`, use:

```rust
let account = match configured_account_id() {
  Some(id) => id,
  None => continue, // or skip persist; workers should not run without config
};
```

Ensure `start_receive_loop` / `ensure_outbox_worker` in `run()` only start when `configured_account_id()` is `Some` **and** `get_signal_config()` is `Some`.

```rust
.setup(move |app| {
  set_app_handle(app.handle().clone());
  let runtime_state: AppState = (*app.state::<AppState>()).clone();
  let agent_mode = Some(AgentModeConfig::enabled_default());
  if configured_account_id().is_some() && get_signal_config().is_some() {
    start_receive_loop(runtime_state.clone(), agent_mode);
    if let Some(a) = configured_account_id() {
      ensure_outbox_worker(runtime_state, a);
    }
  } else {
    eprintln!("SignalX: not configured — skipping receive/outbox workers");
  }
  Ok(())
})
```

Apply the same guard in `run_headless` if it starts workers unconditionally.

- [ ] **Step 4: `require_active_account` / thread helpers**

Make `require_active_account` return `configured_account_id()` (and ensure active is set), not an arbitrary UI-selected id:

```rust
fn require_active_account(state: &AppState) -> Result<String, Value> {
  let id = configured_account_id().ok_or_else(|| err("SIGNALX_NUMBER not set".to_string()))?;
  if state.account_manager.get_active().as_ref() != Some(&id) {
    state.account_manager.set_active(id.clone());
    let _ = state.account_manager.get_or_create(&id);
  }
  Ok(id)
}
```

Update `get_threads` fallback similarly (no inventing accounts from disk stems).

- [ ] **Step 5: Compile check**

Run: `cd src-tauri && cargo test foundation_tests && cargo check`  
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
Bind receive, outbox, and storage to one configured Signal account.

EOF
)"
```

---

### Task 3: Remove multi-account IPC and direct send

**Files:**
- Modify: `src-tauri/src/lib.rs` (delete commands + handler entries; delete `set_active_account` / `list_accounts` API handlers used only by those commands)
- Modify: `src/api.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: optional `cmd_get_account` returning `{ account_id, number }` for UI label — or reuse `cmd_get_diagnostics` fields `number` / `active_account`. Prefer **no new command**: UI reads `diagnostics.number`.

- [ ] **Step 1: Delete Rust commands**

Remove from `lib.rs`:
- `fn list_accounts`, `fn get_active_account`, `fn set_active_account` (handler fns)
- `cmd_list_accounts`, `cmd_get_active_account`, `cmd_set_active_account`, `cmd_send_message`
- Their entries in `generate_handler![]`
- Keep internal `send_message` only if still used; if only used by `cmd_send_message`, delete the command wrapper and leave the fn unused or delete both if unused elsewhere.

Grep: `send_message(` and `cmd_send_message` — remove IPC surface entirely.

- [ ] **Step 2: Update `src/api.ts`**

- Remove `listAccounts`, `getActiveAccount`, `setActiveAccount` from `api`.
- Fix `OutboxSummary`:

```ts
export interface OutboxSummary {
  queued: number;
  sending: number;
  failed: number;
}
```

- [ ] **Step 3: Update `src/App.tsx`**

- Remove `accounts` state, `onSelectAccount`, and the `<select className="account-select">`.
- On bootstrap, call `api.getDiagnostics()` and show `number` as a read-only label (e.g. `<div className="account-label">{number ?? "Not configured"}</div>`).
- If diagnostics show no number, set status to a clear configure message pointing at `.signalx.env`.

- [ ] **Step 4: Verify**

Run: `cd src-tauri && cargo check`  
Run: `npx tsc --noEmit` (from repo root)  
Expected: no errors; `rg "cmd_set_active_account|cmd_list_accounts|cmd_send_message" src src-tauri` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src/api.ts src/App.tsx
git commit -m "$(cat <<'EOF'
Remove account switching and direct-send IPC; UI shows one number.

EOF
)"
```

---

### Task 4: Harden `open_path` + webview CSP

**Files:**
- Modify: `src-tauri/src/lib.rs` (`open_path` / `cmd_open_path` — pass `app_data_dir` from state)
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Restrict `open_path`**

Change signature to use state:

```rust
fn open_path(state: &AppState, path: String) -> Value {
  let candidate = PathBuf::from(path.trim());
  if !path_is_under_root(&state.app_data_dir, &candidate) {
    return err("path must be under the SignalX app data directory".to_string());
  }
  // existing platform open logic on candidate
  ...
}

#[tauri::command]
fn cmd_open_path(state: State<'_, AppState>, path: String) -> Value {
  open_path(&state, path)
}
```

Note: `canonicalize` requires the path to exist — exports should exist before open. If create-then-open races, open the parent export dir only when the file path fails canonicalize but parent is under root (keep minimal: require existing path under root).

- [ ] **Step 2: CSP**

In `tauri.conf.json`:

```json
"security": {
  "csp": "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
}
```

(Adjust if Vite dev breaks — may need `http://localhost:5173` in `connect-src`/`script-src` for `tauri dev`. Prefer the narrowest CSP that still allows `npm run tauri dev`.)

- [ ] **Step 3: Capabilities**

Remove `"core:webview:allow-internal-toggle-devtools"` from `capabilities/default.json`.

- [ ] **Step 4: Verify**

Run: `cd src-tauri && cargo test foundation_tests && cargo check`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "$(cat <<'EOF'
Restrict open_path to app data and enable production CSP.

EOF
)"
```

---

### Task 5: Docs match reality

**Files:**
- Modify: `docs/STATUS.md`, `docs/HANDOFF.md`, `docs/QUICKSTART.md`, `docs/BUILD.md`, `docs/NEXT_STEPS.md`

- [ ] **Step 1: Rewrite STATUS + HANDOFF briefly**

State:
- GUI is the default (`npm run tauri dev`); headless optional.
- Single Signal account from `.signalx.env`.
- Outbox is the only send path.
- Orphan multi-stem files on disk are ignored.
- Next: IVR menu responder.

- [ ] **Step 2: Fix build command strings**

Replace every `npm run tauri:build` with `npm run tauri build` in QUICKSTART and BUILD.

- [ ] **Step 3: Trim NEXT_STEPS**

Mark Phases 1–5 GUI rebuild as done; list remaining product phases: IVR → catalog/customers → orders/invoices → AI polish.

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md docs/HANDOFF.md docs/QUICKSTART.md docs/BUILD.md docs/NEXT_STEPS.md
git commit -m "$(cat <<'EOF'
Update docs for single-account GUI and correct tauri build command.

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Canonical single account / sanitize storage | 1–2 |
| Receive/outbox bind to configured account | 2 |
| Remove account switcher IPC + UI | 3 |
| One send path / remove `cmd_send_message` | 3 |
| Outbox path sanitize | 1 |
| `open_path` under app data | 4 |
| CSP + drop devtools permission | 4 |
| OutboxSummary + docs | 3, 5 |
| Unit tests | 1 |
| Missing config → workers don't start | 2 |

## Execution

After this plan is saved, implement **inline in this session** (user requested full steam ahead). Commit after each task. When Task 5 completes, smoke-check `cargo test` + `cargo check` + `tsc`, then move to IVR design/plan as the next product slice.
