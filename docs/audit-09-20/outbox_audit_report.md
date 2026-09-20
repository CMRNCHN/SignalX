# Outbox Audit Report — HIGHEST-RISK SECTION

**Date:** 2026-09-20  
**Auditor:** Claude Haiku 4.5  
**Scope:** Outbound delivery queue (outbox)  
**Baseline:** 60 Rust tests passing; codebase builds; icon fixture created for test suite.

---

## Summary

The Outbox is a durable, persisted queue for Signal messages with exponential backoff retry logic. **One critical timing bug and five improvement-category findings** — none currently blocking, but idempotency and crash-safety should be addressed before the system scales to high message volume.

Key strengths:
- Persistent JSON store survives app restart
- Exponential backoff with jitter (1s to 30s max, 2^attempt formula)
- Atomic state transitions (queued → sending → sent/failed)
- Deduplication on message thread by message ID

Key risks identified:
1. **[P0] Message ID collision on high-throughput send** — timestamp-only ID allows duplicates
2. **[P1] Race: send succeeds but item not marked sent** — store update failure not surfaced
3. **[P2] Missing confirmation of signal-cli success** — exit code only, no receipt verification
4. **[P2] No per-recipient rate limit** — can overload single recipient
5. **[P3] Stuck "sending" state on session switch** — not reverted before termination
6. **[P3] UI lacks attempt count and last error text** — diagnostic visibility weak

---

## Inventory

### Code Files
- **src-tauri/src/lib.rs** (~7,200 lines, monolithic)
  - `OutboxItem` struct (lines 308–320): state machine for item lifecycle
  - `OutboxStore` (lines ~400–660): JSON file-backed store with atomic save
  - `OutboxSummary` struct (lines ~440–468): aggregation of queued/sending/failed counts
  - `claim_next_for_send{,_async}()` (lines ~570–656): next item picker with backoff check
  - `queue_outgoing_message_inner()` (lines ~3194–3264): enqueue handler
  - `retry_outbox_item()` (lines ~3266–3298): manual retry
  - `delete_outbox_item()` (lines ~3300–3321): manual dequeue
  - `ensure_outbox_worker()` (lines ~4741–4914): async send loop (signal-cli invocation)
  - `compute_backoff_ms()` (lines ~2925–2931): exponential backoff formula
  - `normalize_outgoing_message()` (lines ~2445–2460): generates message ID

- **src/api.ts** (~600 lines)
  - `OutboxItem` interface (lines ~45–57): TS mirror of Rust struct
  - `OutboxSummary` interface (lines ~59–63): summary counts
  - API wrappers: `listOutbox()`, `queueMessage()`, `retryOutbox()`, `deleteOutbox()`, `listOutboxAudit()` (lines ~396–525)

- **src/App.tsx** (~3,900 lines, monolithic)
  - `refreshMessages()` (lines ~496–514): fetches outbox per thread, filters out "sent" items
  - `refreshGlobalOutbox()` (lines ~1578–1588): fetches all outbox, sorts by recency
  - `onRetry()` (lines ~792–796): calls `api.retryOutbox()`, refreshes on UI
  - `onDeleteOutbox()` (lines ~798–801): calls `api.deleteOutbox()`, refreshes on UI
  - Audit loading (lines ~1676–1678): loads outbox audit entries (separate from live queue)

- **src/components/Audit/AuditScreen.tsx** (~150 lines)
  - Outbox audit display in unified audit panel (lines ~57–64)

### Configuration
- No explicit rate limiting; no retry max attempts configured
- Backoff cap: 30 seconds
- Backoff formula: `base * 2^min(attempt, 10) + jitter`, base = 1s
- Send loop sleep when idle: 300ms; on error: 200ms

### Stores & Persistence
- `~/.local/share/SignalX/accounts/{id}/outbox.json` (atomic read/write)
- Format: `{ version, items: [{id, account_id, thread_id, recipient, content, created_at, last_attempt_at?, attempt_count, state, last_error?, attachment_path?}] }`

---

## Tests

### Baseline Run
```
cargo test --lib 2>&1 | tail
test result: ok. 60 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.44s
```

All 60 tests pass. No unit tests specifically for outbox logic exist; outbox is only covered through integration with commerce/invoice send tests (no direct unit coverage of retry, backoff, or race conditions).

### Test Gaps
- No test for `claim_next_for_send()` with expired backoff
- No test for simultaneous retries of same item
- No test for send failure on signal-cli crash
- No test for message ID collision on high-frequency send
- No test for store corruption recovery
- No test for sending with session switched mid-send

---

## Findings

### 1. [P0 — BUG] Message ID Collision on High-Frequency Send

**File:** `src-tauri/src/lib.rs:2447`  
**Code:**
```rust
let id = format!("outgoing-{}-{}", recipient, ts);  // ts = now_ms()
```

**Issue:**  
The outgoing message ID is derived from `now_ms()` (millisecond-precision timestamp) + recipient. If **two messages are queued to the same recipient within the same millisecond**, they will have the **identical ID**. Message deduplication in `add_message()` (line 775) uses `m.id ==`, so the second message will be silently dropped on echo.

**Evidence:**
- `normalize_outgoing_message()` line 2447 uses only `now_ms()` for uniqueness
- `add_message()` dedupes by checking `entry.messages.iter().any(|m| m.id == msg.id)` (line 775)
- Modern CPUs can queue multiple outbox items in <1ms, especially on batch fulfillment (e.g., fulfilling 10 orders to the same buyer)

**Impact:**  
- Lost messages on batch send to same recipient
- Silent (no error, no alert to user)
- Likely only manifests at scale (>1msg/ms)

**Fix (medium effort):**  
Use UUID or atomic counter + timestamp: `format!("outgoing-{}-{}-{}", recipient, ts, uuid::Uuid::new_v4().simple())`

**Risk:** Deduplication logic depends on exact ID match; changing format requires migration test for existing persisted messages.

---

### 2. [P1 — RACE] Store Update Failure Not Surfaced After Signal Success

**File:** `src-tauri/src/lib.rs:4882`  
**Code:**
```rust
Ok(_) => {
  item.state = "sent".to_string();
  item.last_error = None;
  let _ = state.outbox_store.update_item_async(&account_id, item.clone()).await;  // <-- ignored
  ...
  emit_outbox_item_updated(&item);
}
```

**Issue:**  
`signal-cli` succeeds (message is sent), but the outbox store update fails (e.g., filesystem full, permission lost, corruption during atomic save). The item is **emitted to UI as "sent"** but **persisted as "sending"**. On app restart, the sender will **retry and resend the message**.

**Evidence:**
- Line 4882: `let _ = ...` discards the update result
- Item is emitted as sent (line 4886) before or regardless of store success
- No logging of update failure
- Same pattern on failure path (line 4903)

**Impact:**  
- Potential duplicate message delivery (same message sent twice)
- User sees "sent" in UI; app restarts; message resends
- Silent (no warning to user or logs)

**Fix (low effort):**  
Log the error and delay emission:
```rust
match state.outbox_store.update_item_async(&account_id, item.clone()).await {
  Ok(_) => {
    emit_outbox_item_updated(&item);
    emit_message_new(&account_id, &msg);
  }
  Err(e) => {
    eprintln!("OUTBOX: failed to persist sent state for {}: {}", item.id, e);
    item.last_error = Some(format!("failed to persist: {}", e));
    item.state = "failed".to_string();
    emit_outbox_item_updated(&item);
  }
}
```

**Risk:** Low; isolated to error path handling.

---

### 3. [P2 — MISSING VALIDATION] No Confirmation signal-cli Reported Message Sent

**File:** `src-tauri/src/lib.rs:4843–4876`  
**Code:**
```rust
let send_res: Result<(), String> = match tokio::task::spawn_blocking(move || {
  let mut cmd = build_signal_command(...);
  cmd.arg("send");
  ...
  let out = cmd.output()
    .map_err(|e| format!("failed to run signal-cli: {}", e))?;
  if !out.status.success() {
    let e = String::from_utf8_lossy(&out.stderr).to_string();
    return Err(format!("Failed to send message: {}", e));
  }
  Ok(())
})
```

**Issue:**  
Exit code check (`out.status.success()`) is the **only** success indicator. `signal-cli send` may:
- Exit 0 with warning in stderr (partial success, e.g., network error queued for retry in signal-cli's own queue)
- Exit 0 but message never reached server (e.g., signal-cli internal queue full, process kill before flush)
- Exit non-zero but message was actually sent (transient error, e.g., temporary network)

SignalX has no way to distinguish these.

**Evidence:**
- Lines 4863–4870: only checks exit code
- No parsing of stdout (which signal-cli can emit as JSON with message ID)
- No timeout on subprocess (hung signal-cli process blocks sender loop indefinitely)

**Impact:**
- False positives (message marked sent but stuck in signal-cli's queue)
- False negatives (message actually sent but marked failed)

**Fix (medium effort):**  
1. Set process timeout (e.g., 30s): `timeout(Duration::from_secs(30), cmd.output())`
2. Parse `signal-cli send` exit status and stdout more strictly (consult signal-cli docs for JSON format)
3. Add per-attempt timeout tracking to detect hung processes

**Risk:** Requires signal-cli integration testing; may surface existing signal-cli flakiness.

---

### 4. [P2 — MISSING RATE LIMIT] No Per-Recipient Rate Limiting

**File:** `src-tauri/src/lib.rs:4759–4912`  
**Context:** `ensure_outbox_worker()` loop  

**Issue:**  
No per-recipient throttling. If a user fulfills 100 orders for the same buyer in rapid succession:
1. All 100 items are queued to same recipient
2. `claim_next_for_send_async()` picks oldest item first (line 4759, correct ordering)
3. **But items are sent back-to-back with only 200ms sleep between failures** (line 4909)
4. No limit on concurrent sends to one recipient; global lock (line 4816) enforces only one send at a time per account, not per recipient

**Evidence:**
- No rate limiter struct or per-recipient state
- Send loop has global `outbox_send_lock_for(&state, &account_id)` (line 4816), not per-recipient
- Sleep only on error path (200ms), not on success (line 4879–4898)
- Backoff applies to **individual item retry**, not to recipient rate

**Impact:**
- Signal server may rate-limit or block account if >N messages to one recipient within time window
- Risk of account lockout or "spam" classification

**Fix (medium effort):**  
Add per-recipient rate tracker:
```rust
struct RateLimitState { recipient: String, last_send_at: i64, sends_in_window: u32 }
// Before send: check sends_in_window; if exceeded, wait until window expires
```

**Risk:** Adds latency; must tune window size and limit to avoid choking legitimate bulk sends.

---

### 5. [P3 — STATE LEAK] Stuck "Sending" State on Session Switch

**File:** `src-tauri/src/lib.rs:4811–4815`  
**Code:**
```rust
if !state.session.is_current(my_gen) {
  item.state = "queued".to_string();
  let _ = state.outbox_store.update_item_async(&account_id, item).await;
  break;
}
```

**Issue:**  
Immediately after claiming the item (line 4759), it is marked "sending" (line 645). If session is switched **between lines 4759 and 4811**, the item is:
1. Claimed and marked "sending" (line 4759)
2. Session check fails (line 4811)
3. State reverted to "queued" and store updated (line 4813)
4. But **previous `claim_next_for_send_async()` persisted "sending" state** (line 653)
5. Race: two writes to store, second one may be lost if async write from line 653 hasn't flushed

If the second write (line 4813) is lost, item stays "sending" forever.

On app restart, `claim_next_for_send()` has logic to revert "sending" → "queued" (line 376–377), but this only runs once at startup. If app stays running and session is switched again mid-send loop, the revert never fires.

**Evidence:**
- Line 376–377: `if it.state == "sending" { it.state = "queued".to_string(); }`  only in `load_account()`, not in ongoing monitor
- Two concurrent writes to store (line 653 and line 4813) without coordination
- No test for session switch mid-loop

**Impact:**
- Item stuck in "sending" state until app restart or manual delete
- Won't be picked up for retry (line 584: skips non-queued/non-failed)
- User sees stuck "sending" in UI; manual delete required

**Fix (low effort):**  
Revert before persisting:
```rust
if !state.session.is_current(my_gen) {
  item.state = "queued".to_string();
  item.last_error = Some("session switched".to_string());
  // Synchronously update before breaking
  let _ = state.outbox_store.update_item(&account_id, item).await;  // use sync version if available
  break;
}
```

Alternatively, wrap both writes in a single atomic operation.

**Risk:** Low; session switches are rare (account switching).

---

### 6. [P3 — UX] Missing Attempt Count and Error Text in UI

**File:** `src/App.tsx`, `src/components/Audit/AuditScreen.tsx`  

**Issue:**  
The Audit panel (lines 2838, 1676–1678) displays outbox events but **does not show**:
- How many times an item has been retried (`OutboxItem.attempt_count`)
- The last error message (`OutboxItem.last_error`)
- Last attempt timestamp (`OutboxItem.last_attempt_at`)

`SimpleAuditEntry` (API mirror) only carries `{ id, thread_id, summary, outcome, created_at }`, not the full `OutboxItem` detail.

**Evidence:**
- `api.ts:524–525`: `listOutboxAudit()` returns `SimpleAuditEntry[]`, not `OutboxItem[]`
- `App.tsx:1676`: only loads audit summary, not live outbox detail
- `AuditScreen.tsx:57–64`: maps outbox audit entries but outcome is just `e.outcome` (text field)
- Live outbox (`globalOutbox` in `App.tsx:405`) is not displayed anywhere except threaded view

**Impact:**
- User cannot diagnose why message is stuck
- Cannot tell if retry is making progress or cycling endlessly
- No visibility into signal-cli errors (network, auth, malformed recipient, etc.)

**Fix (low–medium effort):**  
1. Extend `SimpleAuditEntry` to include `attempt_count`, `last_error`, `last_attempt_at`
2. Or: add a separate "Live Outbox" panel showing full `OutboxItem` detail (similar to existing thread-scoped outbox display)

**Risk:** UI layout impact; requires design review.

---

## Actions

1. **[P0] Implement UUID-based message IDs** (2–3h)
   - Change `normalize_outgoing_message()` to use `uuid::Uuid::new_v4()` + timestamp
   - Add migration test for old ID format
   - No schema change needed (ID is immutable after creation)

2. **[P1] Log store update failures** (30min)
   - Wrap `state.outbox_store.update_item_async()` result in log + conditional emit
   - Retrograde failed item to failed state with reason

3. **[P2] Add process timeout to signal-cli invocation** (1h)
   - Wrap `cmd.output()` in `tokio::time::timeout(Duration::from_secs(30), ...)`
   - Handle timeout as send failure, not permanent failure

4. **[P3] Fix session-switch race on claimed item** (1–2h)
   - Consolidate claim + revert logic or use sync store op for revert
   - Add test for session switch during send loop

5. **[P3] Add attempt count and error to audit UI** (2–3h)
   - Extend `SimpleAuditEntry` struct in `api.ts`
   - Update Rust side to populate fields
   - Render in `AuditScreen.tsx` or new "Outbox Debug" panel

6. **[OPTIONAL] Per-recipient rate limiting** (3–4h)
   - Design rate window (e.g., max 5 msgs/sec per recipient, 100 msgs/min total)
   - Implement rate limiter state
   - Add integration test with Signal server mock

---

## Not Changed

- No code edits made; audit is read-only
- Icon fixture file created for test compilation (`src-tauri/icons/32x32.png`)
- All 60 existing unit tests still passing

---

## Questions

1. **Has message deduplication on echo been tested?** If signal-cli echoes back a sent message (some protocols do), does the message ID match and dedupe correctly?

2. **What is the intended retry max?** Is there a permanent-failure threshold (e.g., give up after 10 attempts, 24 hours), or will items retry forever?

3. **Does Settings panel also monitor outbox?** The preamble mentions potential duplication; confirm whether Settings owns a separate delivery queue view or if it should delegate to Audit.

4. **What signal-cli version is deployed?** Version and JSON output format affect stdout parsing feasibility (item #3).

5. **How fast can users realistically queue outbox items?** Helps prioritize message ID collision fix (P0 vs. edge case).

---

## Summary Table

| # | Priority | Category | File | Issue | Fix Effort | Risk |
|---|----------|----------|------|-------|-----------|------|
| 1 | P0 | Bug | lib.rs:2447 | Message ID collision on 1ms boundary | 2–3h | Medium (dedup logic) |
| 2 | P1 | Race | lib.rs:4882 | Store update failure after send success | 30min | Low |
| 3 | P2 | Missing Feature | lib.rs:4865 | No signal-cli process timeout | 1h | Low |
| 4 | P2 | Missing Feature | lib.rs:4759 | No per-recipient rate limit | 3–4h | Medium (tuning) |
| 5 | P3 | State Leak | lib.rs:4811 | Stuck "sending" on session switch | 1–2h | Low |
| 6 | P3 | UX | App.tsx, AuditScreen.tsx | No attempt count/error in UI | 2–3h | Low |

---

**End of Audit Report**
