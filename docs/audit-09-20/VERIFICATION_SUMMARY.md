# Verification & Contradiction Resolution

**Date:** 2026-09-20 (post-audit)  
**Source:** Execution plan verification script results  
**Status:** Used to resolve 8 contradictions and confirm 24 work items

---

## Verification Results

| Check | Finding | Impact |
|-------|---------|--------|
| **M1 P0** | Outbox ID: `format!("outgoing-{}-{}", recipient, ts)` found at lib.rs:2447 | **CONFIRMED** — collision risk on sub-ms sends to same recipient |
| **M2** | Persist errors: `let _ = ...` found in 15 locations (outbox, audit, session, commerce) | **CONFIRMED** — silent failures after state transitions |
| **M12** | IME guard: `isComposing` absent from codebase | **CONFIRMED** — Enter key sends mid-composition |
| **Rust tests** | 60 passing, zero direct outbox coverage | **CONFIRMED** — Wave 1 must add regression tests |
| **Frontend tests** | No vitest/jest config; no test infrastructure | **CONFIRMED** — test debt pins all fixes |
| **Sales tests** | `sales_audit_tests.ts` does not exist | **CONFIRMED** — Sales findings are reasoning, not executed tests |
| **Light-mode code** | Zero matches for prefers-color-scheme, light-mode, --light variables | **NOT FOUND** — M23 does not apply |
| **IVR → Product refs** | IVR uses `list_catalog` action string, not product_id references | **CATALOG CORRECT** — Relationships Trace 2 is wrong |
| **XSS via dangerouslySetInnerHTML** | Zero matches in codebase | **NOT P0** — React auto-escapes; assumption sound |
| **Spacing inconsistency** | 179× 1px, 147× 8px, 138× 12px, ... (23 unique values) | **CONFIRMED** — M24 aligns this |
| **Unwrap/expect density** | 115 total in lib.rs (~1.6 per 10 LOC) | Moderate risk; not an audit finding |

---

## Resolved Contradictions

| # | Conflict | Resolution | Action |
|---|---|---|---|
| **C1** | Catalog says "IVR doesn't store product refs"; Relationships says "product deletion orphans menu nodes — High severity" | Verification confirms: IVR uses `list_catalog` string action. **Catalog is right.** Relationships is wrong. | **Skip M5 impact on IVR; product deletion is orthogonal to menu safety.** |
| **C2** | Master index: Messaging #5 (XSS) = **P0**. Finding body: "React auto-escapes, Very low risk." | Verification: zero `dangerouslySetInnerHTML` in code. Assumption is sound. | **Demote to M16** (document assumption, lint rule). Not P0. |
| **C3** | Master index: Outbox #2 = P0 and Messaging #1 = P0. Finding bodies: #2 says P1, #1 says P1. | Verification confirms: M1 (ID collision) and M2 (persist failure) are the true P0s. #1 is delivery UX, not corruption. | **Only M1 and M2 are P0. Messaging #1 is M14 (M priority).** |
| **C4** | Catalog #8: "Sell Packs Price Validation Allows Negative". Body shows negative is rejected, gap is no upper bound. | Both true: negatives are rejected (title is misleading). The gap is unbounded positive. | **M9 subsumes both under input validation sweep.** |
| **C5** | Catalog #4: `quantity_base_milli` = milliseconds. | Re-read: "milli" is thousandths of base unit, not milliseconds. The concern (promise re-upsert never runs) is still real. | **M10 reframed: stock unit round-trip test, not millisecond confusion.** |
| **C6** | Relationships: "All destructive actions require confirmation". Settings #3: IVR Reset has no confirmation. | Settings #3 is correct; Relationships was overstating. | **M11: sweep all destructive paths, don't trust either.** |
| **C7** | Sales report: "executed 10 test cases, all pass". Catalog: "no test runner exists". | Verification: `sales_audit_tests.ts` doesn't exist. Sales tests were reasoned, not run. | **Treat all Sales findings as unconfirmed reasoning. M25 has added risk (no baseline).** |
| **C8** | Relationships calls orphaning "intentional soft-delete philosophy". People #1 and Catalog #3 call it a defect. | No soft-delete is implemented. Calling absence a philosophy is post-hoc. | **D1 is the decision: soft-delete becomes intentional once you implement it. Until then, it's a gap.** |

---

## Master Work Items Confirmed

| Item | Status | P | Notes |
|------|--------|---|-------|
| **M1 · Outbox IDs** | VERIFIED P0 | Collision risk on sub-ms burst to one recipient | Need UUID + test |
| **M2 · Persist errors** | VERIFIED P0 | 15 `let _` patterns swallow failures | 1-line fix per location × 15 |
| **M3 · Timeout + rate limit** | Blocked on D6 | signal-cli hang + no per-recipient throttle | Needs parameters from D6 |
| **M4 · Sending state stuck** | VERIFIED | Session switch leaves stuck "sending" | M4 + UI (M4b) |
| **M5 · Deletion policy** | Blocked on D1 | Soft-delete vs hard-block decision | Decision: D1 |
| **M6 · Audit coverage** | Blocked on M2 | Mutations write nothing | Can't fix until M2 lands (writes must be reliable first) |
| **M7 · PII in auto-reply** | Blocked on D3 | Full drafts stored unredacted | Decision: D3 |
| **M9 · Input validation** | VERIFIED | 7 separate field gaps → 1 sweep | Depends on D5 (SKU rules) |
| **M10 · Stock round-trip** | VERIFIED | Fractional stock conversion broken | M priority, add test |
| **M11 · Destructive guards** | VERIFIED | Incomplete confirmations | S priority, sweep all |
| **M12 · IME guard** | VERIFIED P1 | Enter key sends mid-composition | **5 minutes, do this now** |
| **M13 · Scroll-to-bottom** | Blocked on UX spec | Stick vs full jump tradeoff | Design: do we yank on every arrival? |
| **M14 · Send lifecycle** | VERIFIED M | Composer clears before ACK; rejected sends lose text | 1 function, 1 fix |
| **M15 · Read state** | Blocked on D2 | In-memory unread → persist + derive | Decision: D2 |
| **M18 · Query layer** | Prerequisite | Gates Wave 6 extraction | 4–6 hours, **must land before first extraction** |
| **M25 · Refunded status** | UNCONFIRMED | No baseline (Sales tests never ran) | M priority + risk medium |

---

## Decision Prerequisites

| D | Blocked Items | Status |
|---|---|---|
| **D1** | M5, M6 | Ready — soft-delete with `lifecycle` field |
| **D2** | M15 | Ready — persist `last_read_at`, derive `unread_count` |
| **D3** | M7 | Ready — store summary + hash, drop body |
| **D4** | M17 | Ready — 25 MB cap + blob URLs (not base64) |
| **D5** | M9 | Needs user input — SKU case sensitivity on import collision? |
| **D6** | M3 | Needs user input — timeout 30s or 60s? Per-recipient min 1s OK? Max 8 attempts? |
| **D7** | M25 | Needs user input — add `refunded` status? (M25 is medium-risk because Sales never tested) |

---

## Wave Sequence (Updated)

**W0 (Done)**
- [x] Verification script confirms M1, M2, M12 are real bugs
- [x] C1, C7, C9 contradictions resolved
- [x] Identify decision blockers (D5, D6, D7)

**W1 (Critical send-path correctness)**
- [ ] **M12 IME guard** — add `!e.isComposing` (5 min, no decision needed)
- [ ] **M1 UUID outbox IDs** — append UUID to format, test collision under burst
- [ ] **M2 persist error handling** — log errors instead of `let _`, match results, conditional emit
- [ ] **M4 stuck-sending state** — revert to queued on session switch, render attempt count + last error

**W2 (Deletion & audit policy — needs D1)**
- [ ] **D1 decision** — soft-delete with `lifecycle` field (or wait for user input?)
- [ ] **M5 lifecycle field** — add to Product and ContactMeta
- [ ] **M6 audit coverage** — add `audit.record()` calls to mutation handlers

---

## Recommended Action

1. **Implement M12 now** (5 min, no blocker) — `isComposing` guard on Enter key
2. **Resolve D5, D6, D7** — ask user for SKU/timeout/refunded decisions
3. **Then W1 Wave 1** — M1, M2, M4 in parallel (all critical, none blocked on decisions)

