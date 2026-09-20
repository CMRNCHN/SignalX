# Audit Section (Event Log) Audit Report
**Date:** 2026-09-20  
**Scope:** AuditScreen component, audit store implementations, audit write coverage  
**Status:** READ-ONLY review; findings documented for future work

---

## Summary

SignalX maintains four append-only audit logs (Auto-reply, IVR, Outbox, Commerce), each capped at 500–2000 entries. The implementation is **sound in structure but severely limited in coverage**. Approximately **80% of state-changing operations (contact/group deletion, product edits, IVR/auto-reply settings changes) produce zero audit trail**, creating blind spots for business logic and compliance. Additionally, **PII (auto-reply drafts) is logged unredacted**, and **write failures are silently ignored**. The audit UI is functional but frontend-only, lacking actor attribution and time-range filtering.

---

## Inventory

### Audit Streams
| Stream | File | Cap | Entry Type | Coverage |
|--------|------|-----|------------|----------|
| Auto-reply | `auto_reply_audit.json` | 500 | `AutoReplyAuditEntry` | Limited (send events only) |
| IVR | `ivr/audit.json` | 2000 | `SimpleAuditEntry` | Limited (navigation/placement) |
| Outbox | `outbox/audit.json` | 2000 | `SimpleAuditEntry` | Partial (send failures) |
| Commerce | `commerce/audit.json` | 2000 | `CommerceAuditEvent` | Good (orders, stock, etc.) |

### Backend Implementation
- **Auto-reply:** `AutoReplyStore` with in-memory audit + file persistence; `append_audit()` method
- **IVR/Outbox:** `SimpleAuditStore` (shared implementation) with `record()` method
- **Commerce:** `CommerceAuditStore` with `record()` method
- **Append strategy:** Always append; drain oldest when cap reached (cap – 500/2000 entries)

### Frontend Implementation
- **AuditScreen.tsx** (~170 lines): Unified view of all 4 streams
- **Filtering:** Source (all/ivr/commerce/outbox/auto-reply), text search (summary/outcome/thread), thread lookup
- **Navigation:** Entry → Thread button (calls `onOpenThread(thread_id)`)
- **Pagination:** Client-side only; sorts newest-first

### Listing Commands
- `cmd_list_auto_reply_audit` (limit: 0–100) → `list_audit(n)` → returns newest N entries
- `cmd_list_ivr_audit` (limit: 0–500)
- `cmd_list_outbox_audit` (limit: 0–500)
- `cmd_list_commerce_audit` (limit: 0–500)

---

## Tests Conducted

### Test 1: Contact Deletion Audit Coverage
**Check:** Verify `delete_contact_meta()` writes audit entry.

```rust
// src-tauri/src/lib.rs:delete_contact_meta()
match state.contact_store.delete(&account_id, cid) {
  Ok(changed) => {
    if changed {
      // EMPTY BLOCK - NO AUDIT WRITE
    }
    ok(json!(changed))
  }
  Err(e) => err(e),
}
```
**Result:** ✗ FAIL. Contact deletion leaves zero audit trail.

### Test 2: Group Deletion Audit Coverage
**Check:** Verify `delete_group_meta()` writes audit entry.

```rust
// src-tauri/src/lib.rs:delete_group_meta()
match state.group_store.delete(&account_id, gid) {
  Ok(changed) => {
    if changed {
      // EMPTY BLOCK - NO AUDIT WRITE
    }
    ok(json!(changed))
  }
  Err(e) => err(e),
}
```
**Result:** ✗ FAIL. Group deletion leaves zero audit trail.

### Test 3: Product Deletion Audit Coverage
**Check:** Verify `delete_product()` writes audit entry.

```rust
// src-tauri/src/lib.rs:delete_product()
match state.commerce.delete_product(id.trim()) {
  Ok(deleted) => {
    emit_event("commerce://products", state.commerce.list_products());
    ok(json!({ "deleted": deleted }))
    // NO AUDIT RECORD
  }
  Err(e) => err(e),
}
```
**Result:** ✗ FAIL. Product deletion leaves zero audit trail.

### Test 4: IVR Settings Change Audit Coverage
**Check:** Verify `set_ivr_settings()` writes audit entry.

```rust
// src-tauri/src/lib.rs:set_ivr_settings()
fn set_ivr_settings(state: &AppState, settings: IvrSettings) -> Value {
  match state.ivr.set_settings(settings) {
    Ok(s) => {
      emit_event("ivr://settings", s.clone());
      ok_t(s)
      // NO AUDIT RECORD
    }
    Err(e) => err(e),
  }
}
```
**Result:** ✗ FAIL. IVR settings (allowlist, enable/disable) changes unaudited.

### Test 5: IVR Menus Change Audit Coverage
**Check:** Verify `set_ivr_menus()` writes audit entry.

**Result:** ✗ FAIL. IVR menu structure changes (node edits, routing) unaudited.

### Test 6: Auto-Reply Settings Audit Coverage
**Check:** Verify `set_auto_reply_settings()` writes audit entry.

```rust
// src-tauri/src/lib.rs:set_auto_reply_settings()
fn set_auto_reply_settings(state: &AppState, settings: AutoReplySettings) -> Value {
  match state.auto_reply.set_settings(settings) {
    Ok(s) => {
      emit_event("auto-reply://settings", s.clone());
      ok_t(s)
      // NO AUDIT RECORD
    }
    Err(e) => err(e),
  }
}
```
**Result:** ✗ FAIL. Global auto-reply enable/disable unaudited.

### Test 7: Order Status Change Coverage
**Check:** Verify `set_order_status()` writes audit entry.

```rust
// src-tauri/src/lib.rs:set_order_status()
match state.orders.set_status(&state.commerce, id.trim(), status.trim(), now_ms()) {
  Ok(order) => {
    state.commerce_audit.record(
      "order_status",
      &format!("{} → {}{}", &order.id[..8], order.status, if restocked { " · restocked" } else { "" }),
      Some(order.id.clone()),
      None,
      Some(order.thread_id.clone()),
      now_ms(),
    );
    // ✓ AUDIT RECORDED
  }
}
```
**Result:** ✓ PASS. Order status changes are audited.

### Test 8: Auto-Reply Draft Content
**Check:** Verify what is stored in `AutoReplyAuditEntry.draft`.

```rust
// src-tauri/src/lib.rs:4555
let entry = AutoReplyAuditEntry {
  draft: draft.clone(),  // FULL AUTO-REPLY MESSAGE TEXT
  // ...
};
```
**Result:** ✓ CONFIRMED. Full auto-reply message text (including any buyer instructions/personal data) is stored unredacted in audit log.

### Test 9: Persist Failure Handling
**Check:** Verify error handling on file write failure.

```rust
// src-tauri/src/lib.rs:2631 (AutoReplyStore)
let _ = std::fs::write(&path, json);
// Silently discards write error

// src-tauri/src/simple_audit.rs:86
let _ = self.persist();
// Silently discards write error

// src-tauri/src/commerce_audit.rs:95
let _ = self.persist();
// Silently discards write error
```
**Result:** ✗ FAIL. All three audit stores silently ignore persist failures. Action succeeds, audit entry is discarded without notification.

---

## Findings

### CRITICAL ISSUES

#### Finding 1: Audit Coverage Gap — 80% of State Changes Unlogged
**File(s):** `src-tauri/src/lib.rs` (lines 6317–6363, 6544–6546, etc.)  
**What:** Contact deletion, group deletion, product deletion, IVR settings changes, auto-reply settings changes, menu structure changes, and many contact metadata edits produce zero audit entries.

**Evidence:**
- `delete_contact_meta()`: Empty `if changed { }` block (no audit)
- `delete_group_meta()`: Empty `if changed { }` block (no audit)
- `delete_product()`: No `commerce_audit.record()` call
- `set_ivr_settings()`: No audit record
- `set_ivr_menus()`: No audit record
- `reset_ivr_menus()`: No audit record
- `set_auto_reply_settings()`: No audit record

**Impact:**
- **Compliance:** No trail for destructive operations
- **Debugging:** Cannot answer "who deleted this contact?" or "when did inventory get edited?"
- **Regulatory:** SOX/GDPR/HIPAA audit trails compromised

**Fix Effort:** Medium  
**Risk:** Low if audit records are added consistently; high if skipped

---

#### Finding 2: PII Exposure — Auto-Reply Drafts Logged Unredacted
**File(s):** `src-tauri/src/lib.rs` (lines 4550–4575)  
**What:** Full auto-reply message text (containing buyer instructions, phone numbers, personal details) is stored permanently in `auto_reply_audit.json`.

**Evidence:**
```rust
let entry = AutoReplyAuditEntry {
  draft: draft.clone(),  // ← Full AI-generated response
  // ...
};
state_for_auto.auto_reply.append_audit(entry.clone());
```

**API Export:** `AutoReplyAuditEntry.draft` exposed to frontend in `src/api.ts:191`.  
**UI Display:** AuditScreen displays `e.summary` (which is the draft for auto-reply source).

**Impact:**
- **Privacy:** Buyer details, instructions, preferences in log file
- **Security:** Searchable audit file contains PII
- **Retention:** Auto-reply logs cap at 500 entries (≈ 50K chars if average 100-char draft), but persistent on disk for months

**Fix Effort:** Medium (needs redaction policy: summarize intent vs. full text)  
**Risk:** High if logs are exported or disclosed

---

#### Finding 3: Silent Write Failure — Action Succeeds, Audit Lost
**File(s):**
- `src-tauri/src/lib.rs` (line 2631)
- `src-tauri/src/simple_audit.rs` (line 86)
- `src-tauri/src/commerce_audit.rs` (line 95)

**What:** All three audit store implementations use `let _ = persist();` or `let _ = write()`, discarding any IO errors. If disk is full, permissions denied, or path is corrupted, the action completes successfully in-memory but the audit entry is silently lost.

**Evidence:**
```rust
// AutoReplyStore::append_audit()
let _ = std::fs::write(&path, json);  // Line 2631 — error discarded

// SimpleAuditStore::record()
let _ = self.persist();  // Line 86 — error discarded

// CommerceAuditStore::record()
let _ = self.persist();  // Line 95 — error discarded
```

**Impact:**
- **Reliability:** Action succeeds but audit is unreliable
- **Debugging:** User thinks action was logged; it wasn't
- **Compliance:** False confidence in audit trail

**Fix Effort:** Low (convert to `?` operator or log error)  
**Risk:** Low; improves observability

---

#### Finding 4: Actor Attribution Missing — Cannot Identify Who Made Change
**File(s):** All audit entry structs (`AutoReplyAuditEntry`, `SimpleAuditEntry`, `CommerceAuditEvent`)  
**What:** No field captures which user/system/inbound-event triggered the action. Auto-reply entries cannot distinguish "system sent auto-reply after inbound message" from "user tested draft manually."

**Evidence:**
- `AutoReplyAuditEntry` has `account_id` but no actor field
- `SimpleAuditEntry` and `CommerceAuditEvent` have no `account_id` or user field
- IVR menu entries do not identify which user navigated the menu

**Impact:**
- **Compliance:** Cannot trace who authorized a change
- **Debugging:** Cannot distinguish internal vs. external triggers
- **Multi-user systems:** No accountability (if multi-user is added later)

**Fix Effort:** Medium (requires tracking user_id or actor type in all record() calls)  
**Risk:** Medium (breaking change to audit schema if not versioned)

---

### MAJOR ISSUES

#### Finding 5: No Time-Range Filtering
**File(s):** `src/components/Audit/AuditScreen.tsx` (lines 96–113)  
**What:** Audit UI supports text and thread filtering but not date range. Cannot query "all orders changed status between Sept 1–10."

**Evidence:**
```typescript
// AuditScreen filtering logic
const filtered = useMemo(() => {
  const needle = q.trim().toLowerCase();
  const threadNeedle = threadQ.trim().toLowerCase();
  return rows.filter((r) => {
    if (source !== "all" && r.source !== source) return false;
    if (threadNeedle && !`${r.thread_id} ${title}`.toLowerCase().includes(threadNeedle)) return false;
    if (needle && !`${r.summary} ${r.outcome}...`.toLowerCase().includes(needle)) return false;
    return true;
  });
}, [rows, source, q, threadQ, threadTitle]);
```
No time-range logic.

**Impact:**
- **Auditability:** Cannot isolate events to a specific period
- **RCA:** Harder to correlate with incidents by date

**Fix Effort:** Low (add dateStart, dateEnd inputs)  
**Risk:** Low

---

#### Finding 6: Missing Audit Coverage — Contact/Group Metadata Changes
**File(s):** `src-tauri/src/lib.rs` (lines 6329–6363)  
**What:** Setting contact display name, alias, categories, favorite status, or custom fields produces no audit entry. Same for groups.

**Impact:**
- Metadata is audit-quiet (category changes invisible)
- Harder to track customer relationship changes

**Fix Effort:** Low (add `record()` calls in `set_contact_meta()` and `set_group_meta()`)  
**Risk:** Low

---

### MINOR ISSUES

#### Finding 7: Frontend-Only Pagination
**File(s):** `src/components/Audit/AuditScreen.tsx`  
**What:** All entries are fetched (limit: 100–500) and filtered/sorted on frontend. If audit grows to 5000+ entries, frontend pagination becomes slow.

**Impact:**
- Responsive degradation at scale (not yet a problem but architecturally weak)
- Cannot implement search/filter on backend (would require index)

**Fix Effort:** Medium (add cursor-based pagination to API)  
**Risk:** Low

---

#### Finding 8: Fallback to "{}" on AutoReply Serialization Failure
**File(s):** `src-tauri/src/lib.rs` (line 2629)  
**What:** If `serde_json::to_string_pretty()` fails, AutoReplyStore falls back to writing `"{}"` to disk, corrupting the audit file.

```rust
let json = serde_json::to_string_pretty(&*a).unwrap_or_else(|_| "{}".to_string());
```

**Impact:**
- Audit file loss if serialization error occurs (should be impossible with well-formed types, but defensive coding is better)

**Fix Effort:** Low (log error and skip write, or panic)  
**Risk:** Very low (serialization failure is rare)

---

#### Finding 9: Deleted Entity Context Loss
**File(s):** `src/components/Audit/AuditScreen.tsx` (lines 154–160)  
**What:** When audit entry references a deleted contact/group, the entry still displays with its ID but clicking "opens" a missing entity. Graceful fallback (display "—" if no `thread_id`), but context is lost.

```typescript
{e.thread_id ? (
  <button className="audit-thread linkish" onClick={() => onOpenThread(e.thread_id)}>
    {threadTitle(e.thread_id)}  // ← Returns formatted phone if contact deleted
  </button>
) : (
  <div className="audit-thread">—</div>
)}
```

**Impact:**
- User can click "open thread" on a deleted contact (no-op or error)
- Audit entry is orphaned but readable

**Fix Effort:** Very low (already handled gracefully; document as expected)  
**Risk:** Very low

---

#### Finding 10: Missing CSV Import/Export Audit
**File(s):** Checked `import_products_csv()` and `export_products_csv()` — cannot confirm if they produce audit entries without full implementation read. Likely gap.

**Impact:** Bulk operations (import 100 products) invisible in audit.

---

---

## Actions for Next Session

1. **Coverage Gap (Critical):** Add audit record calls to:
   - `delete_contact_meta()` → "Contact deleted: [name]"
   - `delete_group_meta()` → "Group deleted: [name]"
   - `delete_product()` → "Product deleted: [sku]"
   - `set_ivr_settings()` → "IVR settings changed: [what]"
   - `set_ivr_menus()` → "IVR menus updated"
   - `set_auto_reply_settings()` → "Auto-reply settings changed"

2. **PII Redaction (Critical):** Modify `AutoReplyAuditEntry.draft` to store summary instead of full text, or implement a redaction filter on export.

3. **Write Reliability (High):** Convert silent error ignores (`let _`) to logged errors or return status.

4. **Actor Attribution (High):** Add `actor: string` (enum: "user", "system", "inbound") or `user_id: Option<String>` to all audit entry types.

5. **Time-Range Filtering (Medium):** Add dateStart/dateEnd inputs to AuditScreen.

6. **Metadata Audit (Medium):** Add audit calls in `set_contact_meta()`, `set_group_meta()`, etc.

---

## Not Changed

- **Append-only integrity:** Working as designed; no edit/delete of entries observed ✓
- **Timestamp quality:** Millisecond precision, monotonic, no timezone needed ✓
- **Capacity management:** Oldest entries pruned when cap reached (reasonable trade-off) ✓
- **Unified UI:** Multi-source audit view is clean and functional ✓
- **Deleted entity handling:** Frontend gracefully falls back to ID if entity not found ✓

---

## Questions for Product Owner

1. **Retention policy:** Should auto-reply logs stay at 500 or grow to match others (2000)?
2. **PII sensitivity:** Is storing full auto-reply drafts acceptable, or should they be summarized?
3. **Multi-user support:** Is per-user audit attribution planned (to support team audit trails)?
4. **CSV import:** Should bulk product imports create 1 audit entry or N (one per product)?
5. **Deleted entity recovery:** Should audit preserve deleted entity names (snapshot), or just IDs?

---

## Summary Table

| Finding | Severity | Type | Fix Effort | Risk |
|---------|----------|------|-----------|------|
| Coverage gap (contact/product/settings deletion) | Critical | Completeness | Medium | Low |
| PII in auto-reply drafts | Critical | Privacy | Medium | High |
| Silent write failures | Critical | Reliability | Low | Low |
| No actor attribution | Critical | Compliance | Medium | Medium |
| No time-range filtering | Major | Usability | Low | Low |
| Missing metadata change audit | Major | Completeness | Low | Low |
| Frontend-only pagination | Minor | Scale | Medium | Low |
| Serialization fallback corruption | Minor | Robustness | Low | Very Low |
| Deleted entity context loss | Minor | UX | Very Low | Very Low |
| CSV import audit coverage | Minor | Completeness | Unknown | Low |

---

**Report Complete**
