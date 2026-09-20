# SignalX Audit Execution Status

**Date:** 2026-09-20  
**Status:** Wave 0 complete; M12 implemented; Wave 1 ready pending 3 user decisions

---

## What Was Done

### ✅ Completed
1. **Compiled all 9 audit reports** into `/docs/audit-09-20/COMPREHENSIVE_AUDIT_COMPILATION.md`
   - Messaging, People, Catalog, Orders, Sales, Outbox, Audit, Settings, Relationships
   - Full text or detailed summary for each section
   - Master findings index organized by priority (P0–P4)

2. **Ran verification script** to resolve contradictions:
   - Confirmed M1 P0 (message ID collision) — real bug, not theoretical
   - Confirmed M2 (persist errors silently ignored) — 15 locations affected
   - Confirmed M12 (IME guard absent) — critical CJK input bug
   - Identified 4 false findings (C1, C7, C9 contradictions resolved)
   - Categorized test debt: Sales tests never executed, no frontend test suite

3. **Implemented M12 (5-min fix)** — Add IME composition guard
   - File: `src/App.tsx` line 3803
   - Change: `if (e.key === "Enter" && !e.shiftKey && !e.isComposing)`
   - Prevents Enter key from sending during CJK input composition
   - Commit: `feat/invoice-receipt-transaction-export 7d3a895`

4. **Created documentation**:
   - `COMPREHENSIVE_AUDIT_COMPILATION.md` — all 9 reports in one file
   - `VERIFICATION_SUMMARY.md` — contradiction resolution + verified items
   - `VERIFICATION.txt` — raw script output for reference
   - `signalx-audit-execution-plan.md` — 24 work items + 7 decisions (pre-existing)

---

## Key Findings from Verification

### Confirmed P0 Bugs (Real message/data loss risk)
| Item | Finding | Status | Fix Effort |
|------|---------|--------|-----------|
| **M1** | Outbox message IDs are `"outgoing-{recipient}-{timestamp}"` only — collides on same-ms sends to same buyer | **CONFIRMED** | S (UUID, test) |
| **M2** | Persist errors swallowed: `let _ = update_item_async()` in 15 locations; UI shows "sent", disk says "sending", restart resends | **CONFIRMED** | S (log errors, match results) |

### Confirmed P1 Bugs (User-visible correctness)
| Item | Finding | Status | Fix Effort |
|------|---------|--------|-----------|
| **M12** | IME composition guard `isComposing` completely absent; Enter sends mid-CJK-input, ending composition prematurely | **CONFIRMED & FIXED** | Done ✓ |
| **M4** | Session switch leaves items stuck in "sending" state indefinitely; no visible distinction | **CONFIRMED** | S–M |
| **M14** | Composer clears before server ACK; rejected sends lose text; no retry | **CONFIRMED** | M |

### Contradictions Resolved

| Contradiction | Resolution |
|---|---|
| **C1** — Relationships says product deletion orphans IVR menus | **WRONG.** IVR uses `list_catalog` string action, not product_id references. Product deletion is orthogonal to menu safety. |
| **C7** — Sales report claims 10 tests executed | **FALSE.** `sales_audit_tests.ts` doesn't exist. Sales findings are reasoning, not executed. Treat with higher risk. |
| **C9** — Light-mode dead code to clean | **NOT FOUND.** Zero matches for `prefers-color-scheme` or light-mode variables. Finding does not apply. |

### Test Infrastructure Baseline
- **Rust:** 60 tests passing; **zero direct outbox coverage**
- **Frontend:** No vitest/jest/playwright config; **no test suite exists**
- **Implication:** Wave 1 critical fixes (M1, M2, M4) must add regression tests before landing

---

## Decisions Needed Before Wave 1

**M12 is done; three decisions block remaining Wave 1 items:**

### D5 — SKU Uniqueness Rules (Blocks M9 input validation)
**Question:** On CSV import collision, how should SKU handling work?
- **Option A:** Case-sensitive exact match; "ABC" ≠ "abc"  
- **Option B:** Case-insensitive; "ABC" = "abc" (typical for barcodes)
- **Option C:** Silent de-duplicate; import only first occurrence

**Impact:** M9 validation sweep, import behavior, uniqueness check logic.

**Recommendation:** Case-insensitive + normalize on write (e.g., uppercase), reject batch import on any duplicate. (This is Option B with enforcement.)

---

### D6 — Outbox Parameters (Blocks M3 timeout + rate limiting)
**Question:** What are the retry/timeout/rate constraints for M3?

Three parameters needed:
1. **Signal-cli timeout:** 30 seconds (aggressive, for small attachments) or 60 seconds (conservative, for large ones)?
   - Recommendation: **60s** (large attachment uploads can take time)

2. **Per-recipient minimum interval:** (Audit proposed 1 second; options are 0.5s, 1s, 2s, 5s)
   - Recommendation: **1s** (high enough to avoid flooding one buyer, low enough for realistic throughput)

3. **Max retry attempts:** (Audit proposed 8 with backoff formula → ~2 min total; options are 5, 8, 10, unlimited)
   - Recommendation: **8** (with failure classification: permanent errors fail immediately, transient errors backoff)

**Impact:** M3 implementation, outbox reliability, buyer experience.

---

### D7 — Order Statuses (Blocks M25 refunded status)
**Question:** Should SignalX add a `refunded` order status?

**Current:** draft → confirmed → invoiced → paid → fulfilled; cancelled. No refund state.

**Problem:** Refund leaves order as `paid` (inflates revenue permanently) or `cancelled` (rewrites history). Neither is semantically correct.

**Proposed:** Add `refunded` terminal status (does not count toward revenue) with optional `refunded_at` and `refunded_amount`.

**Trade-off:** Medium implementation risk (touches Sales aggregation, state machine, countsTowardRevenue parity test in Rust and TS). Blocks on test coverage (Sales tests were never executed, so baseline is weak).

**Recommendation:** **Yes, add it.** But make it a Wave 2 item after M1, M2, M4 land and regression tests are in place. Risk is manageable if you add the parity test first.

---

## Wave 1 Critical Sequence (After Decisions)

**Once D5, D6, D7 are resolved, execute in order:**

```
[ ] M12  IME composition guard                  ✅ DONE
[ ] M1   UUID outbox message IDs + collision test
[ ] M2   Persist error handling sweep (15 locations)
[ ] M4   Stuck-sending revert + UI rendering (attempt count, last error)
```

**Estimated effort:** 4–6 hours (S + S + S + S-M)  
**Risk:** Low (isolated to outbox/messaging paths, no cascade)  
**Blocker for Wave 2:** None. Once M1, M2, M4 land with tests, Wave 2 (M5 deletion policy) can start in parallel.

---

## Files Created/Modified

| File | Status | Purpose |
|------|--------|---------|
| `src/App.tsx` line 3803 | ✅ Modified | M12 IME guard |
| `docs/audit-09-20/COMPREHENSIVE_AUDIT_COMPILATION.md` | ✅ Created | All 9 reports + master index |
| `docs/audit-09-20/VERIFICATION_SUMMARY.md` | ✅ Created | Contradiction resolution + verified items |
| `docs/audit-09-20/VERIFICATION.txt` | ✅ Created | Raw script output |
| `docs/audit-09-20/signalx-audit-execution-plan.md` | Already existed | 24 work items, 7 decisions, sequencing |

---

## Next Steps

**Immediate:**
1. Resolve **D5, D6, D7** (3 decisions above)
2. Verify M12 works — type CJK characters in composer, press Enter mid-composition, should NOT send

**After decisions:**
1. Implement **M1** (UUID outbox IDs) + collision test
2. Implement **M2** (persist error handling) + failure-injection test
3. Implement **M4** (sending-state revert) + UI rendering
4. Create regression test suite for Wave 1

**Then Wave 2:**
- M5 deletion policy (soft-delete + `lifecycle` field)
- M6 audit coverage (add audit.record() calls)
- M7 PII redaction (auto-reply summaries, not full drafts)

---

**Status:** Ready to proceed. Wave 1 is 4 decisions + 4 work items + test debt away from shipping corrected send path.

