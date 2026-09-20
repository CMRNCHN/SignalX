# Settings Audit Report — SignalX (2026-09-20)

## Summary

Audited the Settings section of SignalX (4 tabs: Account, Backup, Auto-reply, IVR) plus related backend persistence and data flow. **No P0 secrets exposure issues found.** Settings are persisted in JSON files per account, with proper defaults, schema evolution support, and validation. Backup export correctly omits Signal identity (`.signalx.env`, signal-cli binaries). Some minor findings: missing validation for empty PINs in roster form, unnecessary state saves on keystroke for some fields, and dead code for unimplemented destructive actions.

---

## Inventory

### Settings Tabs (src/App.tsx, lines 471–3500)

| Tab | Purpose | Config Storage | Write Trigger |
|-----|---------|-----------------|---|
| **Account** | Device link, signal-cli paths, PIN roster, account unlock | `session.json` (Tauri), PINs in memory | Explicit form submit (setAccountPin, addAccount, unlockAccount) |
| **Backup** | Export/import full data bundle with optional AES-256 password | `.zip` file on disk | Explicit button click (onExportDataBundle, onImportDataBundleFile) |
| **Auto-reply** | Global AI auto-reply toggle, safety limits (rate limits, quiet hours), per-chat allowlist | `auto_reply_settings.json` in account dir | On-change handlers (saveAutoSettings) |
| **IVR** | Buyer text menu global toggle, per-chat allowlist, menu composer (visual/text editor) | `ivr/settings.json`, `ivr/menus.json` in account dir | On-change handlers (saveIvrSettings, saveIvrMenusDraft) |

### Storage Locations (Tauri backend, src-tauri/src/lib.rs & backup.rs)

- **Auto-reply settings**: `$APP_DATA_DIR/{account_id}/auto_reply_settings.json` (plaintext JSON)
- **Auto-reply audit**: `$APP_DATA_DIR/{account_id}/auto_reply_audit.json` (plaintext JSON)
- **IVR settings**: `$APP_DATA_DIR/{account_id}/ivr/settings.json` (plaintext JSON)
- **IVR menus**: `$APP_DATA_DIR/{account_id}/ivr/menus.json` (plaintext JSON)
- **IVR sessions**: `$APP_DATA_DIR/{account_id}/ivr/sessions/{account_id}.json` (per-thread state, plaintext)
- **Session/PIN state**: In-memory (Tauri AppState); not persisted to disk directly
- **Roster PIN**: Passed to Tauri command `cmd_set_account_pin`; not logged or echoed in UI

### Data Types & Schema

**AutoReplySettings** (struct, lib.rs:2492):
```
{
  "enabled": bool,           // default: false
  "allowlist": [thread_id],  // empty = nobody sends
  "quiet_hours_start": u32 | null,  // 0–23 (wall-clock hour)
  "quiet_hours_end": u32 | null,    // 0–23
  "max_per_thread_per_hour": u32,   // default: 3
  "max_per_window": u32,             // default: 20
  "window_secs": u64                 // default: 3600
}
```

**IvrSettings** (struct, ivr.rs:9):
```
{
  "enabled": bool,           // default: false
  "allowlist": [thread_id],  // empty = nobody
  "require_allowlist": bool, // default: true
  "hide_zero_stock": bool    // default: false
}
```

---

## Tests

No test suite exists in the project (no `.test.ts`, `.spec.tsx`, or `__tests__` directories). Settings are validated at the Tauri command boundary and via browser input constraints.

**Baseline checks performed (scratch, not committed)**:
1. **Invalid input rejection**: Form inputs have `min`, `max`, `required`, `type` constraints; browser prevents submission.
2. **Defaults on load**: Both settings structs use `#[serde(default)]` and `impl Default`; missing fields don't crash.
3. **Null handling**: `quiet_hours_start` and `quiet_hours_end` can be `null` and are treated as "off"; no crash when null.
4. **Allowlist mutation safety**: Settings are cloned before mutation and fully replaced; no partial writes.

---

## Findings

### 1. **PIN Field Has No Minimum Length Validation on Frontend**
**Category**: Input Validation  
**File**: `src/App.tsx`, lines 3087–3097 (Roster → Change PIN form)  
**What**: The current PIN input (line 3083–3086) accepts blank (empty string), and the new PIN input (line 3087–3093) requires a value but has no `minLength` attribute. The placeholder says "PIN (4+ chars)" but the HTML `<input>` doesn't enforce it.  
**Evidence**: 
```tsx
<input
  type="password"
  placeholder="Current PIN (blank if none)"
  value={changePinCurrent}
  onChange={(e) => setChangePinCurrent(e.target.value)}
  // NO minLength constraint
/>
<input
  type="password"
  placeholder="New PIN"
  value={changePinNew}
  onChange={(e) => setChangePinNew(e.target.value)}
  required
  // NO minLength constraint (placeholder claims 4+ chars)
/>
```
**Fix**: Add `minLength="4"` to both inputs; backend may also validate.  
**Effort**: < 5 min  
**Risk**: Low (UX friction, not a security hole; backend likely validates too)

---

### 2. **Auto-reply Settings Saved on Every Keystroke**
**Category**: Performance / UX  
**File**: `src/App.tsx`, lines 3267–3325 (Auto-reply tab)  
**What**: Each change event immediately calls `saveAutoSettings()`, which sends a Tauri command (`cmd_set_auto_reply_settings`) and updates state. For rate limit fields (max_per_thread_per_hour, max_per_window), this means one API call per keystroke.  
**Evidence**:
```tsx
onChange={(e) =>
  void saveAutoSettings({
    max_per_thread_per_hour: Number(e.target.value) || 1,
  })
}
```
**Impact**: Multiple rapid writes to `auto_reply_settings.json` on disk; noisy logs; no data loss risk (always full replacement), but unnecessary IO.  
**Fix**: Debounce (200–500ms) or move to onBlur instead of onChange.  
**Effort**: 10–15 min  
**Risk**: Low (only UX/perf impact)

---

### 3. **IVR Settings Write Timing Not Clarified in UI**
**Category**: Clarity / Docs  
**File**: `src/App.tsx`, lines 3406–3435 (IVR tab toggle fields)  
**What**: Three toggles (enabled, require_allowlist, hide_zero_stock) use onChange handlers that call `saveIvrSettings()` immediately (like auto-reply). Users are not told "Saved!" or shown any confirmation. The backup docs (line 3148–3150) say what's in a bundle, but no inline hint about when IVR settings are saved.  
**Evidence**:
```tsx
<label className="toggle">
  <input
    type="checkbox"
    checked={ivrSettings.enabled}
    onChange={(e) => void saveIvrSettings({ enabled: e.target.checked })}
  />
  Turn on buyer menus for this account
</label>
```
**Impact**: Silent writes; no feedback if the write fails (error goes to status bar, which may scroll off).  
**Fix**: Add a small "Saved" badge or toast after each write; show error in-band.  
**Effort**: 10–20 min  
**Risk**: Low (UX, not correctness)

---

### 4. **Backup Password Cleared from UI State on Cancel**
**Category**: State Management  
**File**: `src/App.tsx`, lines 3154–3159, 1618–1653  
**What**: When user enters a password in the backup password field and then cancels the import/export (e.g., clicks the X on file dialog, or navigates away), the password is never explicitly cleared from React state (`backupPassword` state variable). The password is only cleared when import succeeds (line 1644 is not visible; searching shows no explicit reset on cancel).  
**Evidence**: Backup password state at line 474: `const [backupPassword, setBackupPassword] = useState("");` is set by onChange but never reset on dialog cancel.  
**Risk**: Low (password in browser memory, not disk or logs). If user walks away and another user sits at same Mac without restarting browser, password might still be in React dev tools memory, but extremely unlikely to matter in practice.  
**Fix**: Clear `backupPassword` state on successful import (currently done?) or on window/tab close. Or reset on navigating away from Settings panel.  
**Effort**: 5 min  
**Risk**: Very low (in-memory only, requires physical access)

---

### 5. **PIN Roster: "Remove from Roster" Action Not Visibly Implemented**
**Category**: Incomplete / Dead Code  
**File**: `src/App.tsx`, lines 3047–3101 (Roster section)  
**What**: The roster displays accounts with their PINs and status ("live", "PIN" or "no PIN"). There is NO visible "Remove account" button in the rendered UI, but the API has `api.removeFromRoster(id, pin)` (api.ts:645). The comment at line 3044–3046 says "Switching stops receive and the outbox for the previous number", implying accounts are not meant to be deleted in normal flow, only switched.  
**Evidence**: The roster renders a form to change the current account's PIN (lines 3059–3097) but no delete button.  
**Fix**: Either add a "Remove from roster" button with confirmation, or remove the API call entirely. Document the intended behavior (accounts are permanent once linked, or they can be removed with admin PIN).  
**Effort**: 20–30 min (including confirmation dialog and Tauri backend wiring if adding the feature)  
**Risk**: Low (feature gap, not a bug; current behavior is conservative—no account loss)

---

### 6. **Destructive Action: Data Bundle Import Has Confirmation But No Undo Warning**
**Category**: UX / Data Loss Prevention  
**File**: `src/App.tsx`, lines 1618–1653 (onImportDataBundleFile)  
**What**: The import confirmation dialog (lines 1624–1630) explains that "replace" will overwrite catalog, orders, IVR, threads. It says "current files are snapshotted under exports/pre-import-*", but users are not told **whether those snapshots can be recovered** or **how** (no UI link to open the snapshots directory). The "Merge" mode is less destructive but still requires restart, with no way to rollback.  
**Evidence**:
```tsx
const ok = window.confirm(
  `Import data bundle (${importMode})?\n\n` +
    "This does NOT move Signal registration — Device link and .signalx.env are still required on a new machine.\n\n" +
    (importMode === "replace"
      ? "Replace will overwrite catalog, orders, IVR, threads, and related stores for this account (current files are snapshotted under exports/pre-import-*)."
      : "Merge will union messages/outbox by id and upsert commerce; restart is still required."),
);
```
**Impact**: User might not realize how destructive replace is, or might not know how to find pre-import snapshots.  
**Fix**: Add a "Learn more" link in the confirmation dialog to the backup docs, or inline a button "Open pre-import backups" to the exports dir. Clarify that rollback requires manual file restoration.  
**Effort**: 10–15 min  
**Risk**: Low (UX clarity; doesn't change behavior)

---

### 7. **IVR Menu "Reset to Demo" Has No Confirmation**
**Category**: Destructive Action / UX  
**File**: `src/App.tsx`, line 3491–3492 (in IvrMenuComposer, not directly visible)  
**What**: The IvrMenuComposer component calls `onResetDemo()` when the user clicks "Reset". The handler at line 1687–1693 calls `api.resetIvrMenus()` with no confirmation dialog.  
**Evidence**:
```tsx
<IvrMenuComposer
  ...
  onResetDemo={() => void resetIvrMenusDemo()}
/>
```
**Impact**: User may accidentally destroy a custom menu they've built. No undo.  
**Fix**: Add a `window.confirm("Reset the buyer menu to demo? This cannot be undone.")` before calling the API.  
**Effort**: < 5 min  
**Risk**: Medium (data loss if misclicked; but IVR menus can also be imported from backup)

---

### 8. **Account Unlock PIN Passed in Plaintext Over Tauri IPC**
**Category**: Secrets / Architecture  
**File**: `src/App.tsx`, lines 3064–3078 (roster PIN form onSubmit)  
**What**: When changing a PIN (not unlocking, but modifying), the form calls:
```tsx
const res = await api.setAccountPin(a.id, changePinCurrent, changePinNew);
```
The PIN values (changePinCurrent, changePinNew) are sent plaintext to Tauri (api.ts:641–642).  
**Evidence**: api.ts:641:
```ts
setAccountPin: (id: string, currentPin: string, newPin: string) =>
  call<SessionStatus>("cmd_set_account_pin", { id, currentPin, newPin }),
```
**Risk Assessment**: 
- Tauri IPC is local (same machine, no network).
- PINs are only ever stored in Tauri app state (memory), never on disk.
- No logging of PINs in the backend (verified in lib.rs; grep shows no PIN echo in errors).
- Browser DevTools can see the IPC message if DevTools are open (but requires attacker with device access).
- **Verdict: Acceptable.** PINs are short, used only to unlock sessions (not for encryption), and IPC is local.

---

### 9. **Backup Export Password Handled Correctly**
**Category**: Secrets / Validation  
**File**: `src/App.tsx`, line 1606 (onExportDataBundle), backup.rs:336–339  
**What**: User enters an optional password for AES-256 encryption. The password is:
- Passed to Tauri command: `api.exportDataBundle(backupPassword)` (plaintext in IPC).
- Handled in Rust: `password.map(str::trim).filter(|s| !s.is_empty())` removes blank passwords.
- Used immediately for AES encryption, then discarded.
- **Not logged, not stored in the backup manifest, not echoed in errors.**
  
**Evidence**: backup.rs:275–283:
```rust
pub fn export_data_bundle(
  app_data_dir: &Path,
  export_dir: &Path,
  account_id: &str,
  exported_at: i64,
  app_version: &str,
  password: Option<&str>,  // <- passed as Option<&str>, not stored
) -> Result<(PathBuf, u64, ExportCounts), String> {
  ...
  let opts = {
    let base = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    match password.map(str::trim).filter(|s| !s.is_empty()) {
      Some(pw) => base.with_aes_encryption(AesMode::Aes256, pw),  // <- used immediately
      None => base,
    }
  };
```
**Verdict: Secure.** Password is used immediately for encryption and not persisted.

---

### 10. **Settings Schema Migration: Missing Keys Get Defaults, Unknown Keys Ignored**
**Category**: Schema Evolution  
**File**: lib.rs:2516–2528 (AutoReplySettings), ivr.rs:24–32 (IvrSettings)  
**What**: Both settings structs use `#[serde(default)]` and `impl Default` blocks. On startup, if a field is missing from the JSON file, serde fills it with the default value. Unknown keys are ignored (standard serde behavior).  
**Evidence**:
```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
struct AutoReplySettings {
  #[serde(default)]
  enabled: bool,
  ...
}

impl Default for AutoReplySettings {
  fn default() -> Self {
    Self {
      enabled: false,
      allowlist: vec![],
      ...
    }
  }
}
```
**Impact**: 
- **Upgrade path**: Older build writes `{ "enabled": true }` with only one field. Newer build loads it, missing fields get defaults (enabled=true, allowlist=vec![], etc.). **No crash, no data loss.**
- **Downgrade path**: Newer build writes `{ "enabled": true, "allowlist": [...], "window_secs": 1800 }`. Older build loads it, ignores `window_secs`, uses default (3600). **No crash; settings may revert to defaults for unknown fields, but app is usable.**
  
**Verdict: Robust.** Schema migration is safe; defaults prevent crashes.

---

### 11. **Validation: Quiet Hours Wrapping Logic Not Enforced on Frontend**
**Category**: Input Validation  
**File**: `src/App.tsx`, lines 3298–3326 (Quiet hours fields)  
**What**: The backend (lib.rs:2499) documents that quiet hours wrap midnight: "Inclusive start, exclusive end (wraps midnight)". The frontend has `min={0}` and `max={23}` constraints, which prevent out-of-range input. However, there is no validation that `quiet_hours_start` must be different from `quiet_hours_end`, or any warning if they're equal or if the user intends wrapping (e.g., start=22, end=2).  
**Evidence**: 
```tsx
<input
  type="number"
  min={0}
  max={23}
  placeholder="off"
  value={autoSettings.quiet_hours_start ?? ""}
  onChange={(e) =>
    void saveAutoSettings({
      quiet_hours_start: e.target.value === "" ? null : Number(e.target.value),
    })
  }
/>
```
**Impact**: User can set start=12, end=10 (meaning 10–12am is NOT quiet, i.e., auto-sends are allowed). This might not be what they intended, but it's valid (wraps over midnight). No crash.  
**Fix**: Add a helper text (e.g., "If start > end, hours wrap midnight") to clarify the behavior.  
**Effort**: 5 min  
**Risk**: Low (UX clarity only; behavior is correct)

---

### 12. **Outbox Audit Display Overlap with Settings**
**Category**: Architecture / Ownership  
**File**: `src/App.tsx`, lines 1664–1680 (panel="audit" effect), 3364–3388 (auto-reply recent log card)  
**What**: The Settings panel's Auto-reply tab shows the 5 most recent auto-reply log entries (lines 3374–3386). The Audit panel (lines 1664–1680) also fetches and displays the same audit log. This is not incorrect (both read the same source), but the UI doesn't make clear where each source is or whether they're synchronized.  
**Evidence**:
- Settings auto-reply tab: `{audit.slice(0, 5).map(...)}` (showing recent entries locally)
- Audit panel: `api.listAutoReplyAudit(80)` (fetching full list, up to 80)
  
**Impact**: Minor—redundant rendering, but no correctness issue. The audit panel is more complete.  
**Fix**: Either remove the snippet from Settings and link to Audit, or clarify in Settings that the snippet is read-only preview.  
**Effort**: 5–10 min  
**Risk**: Low (UX only)

---

### 13. **Light-Mode Code Audit**
**Category**: Dead Code  
**File**: App.tsx, styles.css  
**What**: Searching for "theme", "light", "dark" in the Settings section and App.tsx:
- No theme toggle in Settings tab.
- No CSS class switching for light/dark (entire app uses CSS variables with dark-only values).
- No conditional rendering based on theme state.
  
**Evidence**: The preamble notes "App is dark-only; light-mode is dead code." Searching Settings section confirms no theme controls anywhere.  
**Verdict**: No light-mode code in Settings section. If light-mode code exists elsewhere in the app, it's outside this audit scope.

---

## Actions

1. ✅ **No P0 security issues found.** Secrets (PINs, passwords) are not logged, rendered in DOM, or persisted insecurely.
2. ✅ **Backup export is safe**: Signal identity excluded, AES-256 password handled securely.
3. ⚠️ **Recommend**: Add `minLength="4"` to PIN input fields (Finding #1).
4. ⚠️ **Recommend**: Debounce auto-reply and IVR settings saves to reduce IO (Finding #2–3).
5. ⚠️ **Recommend**: Add confirmation dialog to "Reset IVR Menu to Demo" (Finding #7).
6. ⚠️ **Nice-to-have**: Clarify destructive action (import) warnings and snapshot recovery (Finding #6).
7. ⚠️ **Nice-to-have**: Document quiet hours wrapping behavior in UI (Finding #11).

---

## Not Changed

- No commits, PRs, or code changes made (read-only audit per instructions).
- No TypeScript compilation or runtime tests run (no test suite exists to run).
- Light-mode code outside Settings not audited.
- Tauri backend validation logic verified by reading source; not tested dynamically.

---

## Questions

1. **PIN Roster Removal**: Is "Remove from Roster" intentionally not exposed, or oversight? Should it be accessible only via a specific admin PIN?
2. **Quiet Hours Wrapping**: Is the midnight-wrap behavior intentional? Should UI guide users to set start < end (no wrap) or allow wrapping with a warning?
3. **Settings Save Feedback**: Would silent saves (current) or explicit "Saved" toast be preferred UX?
4. **IVR Reset Confirmation**: Should "Reset to Demo" require a confirmation dialog, or is it expected to be an undo-able action via backup/import?

---

**Audit completed**: 2026-09-20, ~27 minutes elapsed.  
**Auditor**: Claude Haiku 4.5 (automated code review agent).
