# Sales Section Audit Report
**Date:** 2026-09-20  
**Scope:** Sales reporting/aggregation (src/components/Sales/SalesScreen.tsx, src-tauri/src/lib.rs, src/api.ts, src/format.ts)  
**Time:** 30 min read-only audit  
**Status:** Complete — no refactoring performed.

---

## Summary

The Sales section aggregates order data and displays revenue metrics, product rankings, and audit events. **Aggregation correctness is strong.** All status filtering, revenue counting, date bucketing, and math are consistent across Rust backend and JavaScript frontend. No critical bugs found. Identified one minor staleness edge case (manual refresh needed after mutations), one display inconsistency (order count label), and minor optimization opportunities. Charts are accessible, CSS variables are used throughout, and fixture data is consistent.

---

## Inventory

### Files Audited
- **src/components/Sales/SalesScreen.tsx** (443 lines) — React component; renders metrics, charts, product/status tables, audit log.
- **src-tauri/src/lib.rs** (lines 6139–6217) — `sales_summary()` function; Rust aggregation logic.
- **src-tauri/src/orders.rs** (lines 101–103) — `counts_toward_revenue()` helper.
- **src/format.ts** (lines 52–55) — `countsTowardRevenue()` JS wrapper.
- **src/api.ts** — `SalesSummary`, `Order`, `CommerceAuditEvent` types; `api.salesSummary()` call.
- **src/devFixtures.ts** (fxOrders, fxSalesSummary, fxCommerceAudit).
- **src/styles.css** — Sales component styling.

### Order Statuses Supported
- draft, confirmed, invoiced, paid, fulfilled, cancelled
- **No refunded/pending statuses** in the system.

### Aggregations Computed
1. **order_count** — Total orders (all statuses), from selected range.
2. **revenue_cents** — Sum of `total_cents` for orders where `countsTowardRevenue(status)` is true.
3. **by_status** — Breakdown by status (count, total_cents per status).
4. **top_products** — Product lines (name, quantity, revenue_cents) ranked by revenue; only includes lines from revenue-counting orders.
5. **buckets** (JS only) — Revenue grouped into time buckets (1-day or 7-day steps).
6. **derived.avg** — `revenue_cents / revenue_order_count` (average order value).
7. **derived.outstanding** — Sum of confirmed + invoiced orders.

---

## Tests Performed

### Test Suite: sales_audit_tests.ts
Executed **10 test cases** covering:
1. ✓ Revenue status filtering (excludes draft/cancelled)
2. ✓ Order count vs revenue count (all orders vs revenue-eligible)
3. ✓ Date bucketing — 7-day range produces 7 buckets, sums correct
4. ✓ Old order edge case (>45 days old falls into first bucket, not lost)
5. ✓ Bucketing respects revenue filter (draft/cancelled excluded from buckets)
6. ✓ Empty orders (returns empty array, no crash)
7. ✓ Span calculation (30-day uses 1-day steps, all-time uses 7-day)
8. ✓ Average order when status filtered (math is sound)
9. ✓ Outstanding calculation (confirmed + invoiced only)
10. ✓ Status filter case sensitivity (handles uppercase/mixed case)

**All tests pass.** Aggregation logic is correct.

### Fixture Data Validation
- **fxOrders:** 6 orders (1 draft, 1 confirmed, 1 invoiced, 1 paid, 1 fulfilled, 1 cancelled)
- **fxSalesSummary.revenue_cents = 35,450¢** 
  - Manual sum: confirmed (7,500) + invoiced (1,650) + paid (15,200) + fulfilled (11,100) = 35,450 ✓
  - Draft (1,550) and cancelled (1,800) correctly excluded ✓
- **fxSalesSummary.by_status:** counts match order data ✓
- **fxSalesSummary.top_products:** revenue and quantity consistent with order lines ✓

---

## Findings

### 1. **Staleness: Sales Summary Not Auto-Refreshed After Mutations** (Minor)
**File:** src/App.tsx, line ~1395  
**Issue:** After creating or updating an order (`api.createOrder`, `api.setOrderStatus`, etc.), `refreshMeta()` is called but **NOT** `api.salesSummary()`. The Sales panel data becomes stale until:
- User manually clicks Refresh button
- User switches panel away and back to Sales
- User changes date range or status filter

**Evidence:** 
```typescript
const refreshMeta = async () => {
  const [..., ords] = await Promise.all([...api.listOrders()]);
  // NOTE: does NOT call api.salesSummary()
};
```

**Severity:** Low. Expected pattern (manual Refresh button exists and is discoverable). Only affects if user stays on Sales panel while others mutate orders elsewhere.  
**Fix:** After `confirmDraftOrder`, `setOrderStatus`, etc., trigger `refreshSales()` (would need to be passed as callback or global refresh).  
**Effort:** 2–3 hours (threading refresh callback through App → SalesScreen).  
**Risk:** None (purely additive, improves freshness).

---

### 2. **Display Inconsistency: "Orders" Count Label** (Minor)
**File:** src/components/Sales/SalesScreen.tsx, line 214, 230  
**Issue:** The header shows `{salesSummary.order_count} orders · {rangeLabel}`, where `order_count` includes ALL orders (draft, cancelled, etc.). But the "Average order" metric below is computed only from **revenue-counting** orders. This visual inconsistency can confuse:

Example: If showing "6 orders" and "avg $354.50", a user might think avg = $2,127 / 6, but it's actually $2,127 / 4 (excluding 1 draft + 1 cancelled).

**Evidence:**
```typescript
// Line 214: Shows all orders
{salesSummary.order_count} orders
// Line 148–152: Average uses only revenue orders
const avg = revenueOrders.length ? Math.round((salesSummary?.revenue_cents ?? 0) / revenueOrders.length) : 0;
```

**Severity:** Minor (math is correct; label could be clearer).  
**Suggestion:** Rename "Orders" label to "Total orders" or display "paid/invoiced/confirmed/fulfilled orders" count instead. Or add a tooltip on "Average order" explaining the denominator.  
**Effort:** 1 hour (label change + optional tooltip).  
**Risk:** None.

---

### 3. **Date Bucketing: Timezone Handling (Informational)**
**File:** src/components/Sales/SalesScreen.tsx, line 58–69  
**Behavior:** Uses **local browser time** (JavaScript `new Date()`), not UTC:
```typescript
const endOfToday = new Date(now);
endOfToday.setHours(23, 59, 59, 999);  // Uses local TZ
```

**Impact:**
- User in Pacific TZ will see buckets aligned to 00:00–23:59 PT.
- An order created at 23:30 PT (06:30 UTC next day) falls into "today (PT)" bucket, not next day's.
- Server is unaware of user's TZ; backend queries by milliseconds since epoch (TZ-agnostic).

**Status:** ✓ Correct & intentional. No bug.  
**Note:** If multi-TZ support becomes a requirement, UTC bucketing would require backend changes to accept user TZ hint.

---

### 4. **Peak Bar Calculation Not Memoized** (Micro-optimization)
**File:** src/components/Sales/SalesScreen.tsx, line 146  
**Issue:** `peak` is recalculated on every render via `Math.max(...buckets.map(...))`. Buckets is memoized, but peak is not.

```typescript
const peak = Math.max(1, ...buckets.map((b) => b.cents));  // Recalculated every render
```

**Impact:** Negligible (buckets array is typically ≤ 52 items, max operation is O(n), runs in <1ms).  
**Severity:** None (not a performance cliff).  
**Fix:** Optional—can wrap in `useMemo` if buckets array grows significantly.  
**Effort:** 5 min if done; not worth doing.

---

### 5. **Product Aggregation Excludes Non-Revenue Orders (Expected)**
**File:** src-tauri/src/lib.rs, line 6167–6180  
**Behavior:** `top_products` only includes lines from orders where `counts_toward_revenue()` is true:
```rust
if !crate::orders::counts_toward_revenue(&o.status) {
  continue;  // Skip draft/cancelled orders
}
```

**Status:** ✓ Correct. Prevents draft/cancelled line items from inflating product revenue metrics.

---

### 6. **Rounding: Sum-Then-Round Pattern** (Correct)
**File:** src/components/Sales/SalesScreen.tsx, line 151  
**Pattern:** 
```typescript
const avg = Math.round((salesSummary?.revenue_cents ?? 0) / revenueOrders.length)
```

**Status:** ✓ Correct. Sum aggregated on backend (Rust), then rounded once on frontend. No per-item rounding error accumulation.

---

### 7. **Outstanding Calculation Includes Only Pending Statuses** (Correct)
**File:** src/components/Sales/SalesScreen.tsx, line 153–155  
**Behavior:** Sums orders with status = "confirmed" OR "invoiced" (awaiting payment):
```typescript
const outstanding = orders
  .filter((o) => ["confirmed", "invoiced"].includes(o.status.toLowerCase()))
  .reduce((sum, o) => sum + o.total_cents, 0);
```

**Status:** ✓ Correct. Excludes draft (not committed), paid (already settled), fulfilled (delivered), cancelled (void).

---

### 8. **Chart: Minimum Bar Height Ensures Visibility** (Good)
**File:** src/components/Sales/SalesScreen.tsx, line 270  
**Pattern:**
```typescript
style={{ height: `${b.cents > 0 ? Math.max(pct, 2) : 0}%` }}
```

Bars with revenue < 2% of peak still render at 2% height (visible), zero-revenue days render at 0% (invisible baseline, which is correct).

**Status:** ✓ Accessible. Zero days are silent (not confusing); small days are visible.

---

### 9. **Product/Status Rankings: Minimum Bar Width for Labels** (Good)
**File:** src/components/Sales/SalesScreen.tsx, line 303, 403  
**Pattern:**
```typescript
style={{ width: `${Math.max((p.revenue_cents / productMax) * 100, 1.5)}%` }}
```

Tiny products/statuses still render at 1.5% width so labels don't collapse.

**Status:** ✓ Accessible. No visual data loss.

---

### 10. **Commerce Audit Event Retrieval** (Correct)
**File:** src/components/Sales/SalesScreen.tsx, line 119  
**Behavior:** Fetches last 80 commerce audit events unconditionally (no range filter):
```typescript
api.listCommerceAudit(80)
```

**Impact:** Audit log may show events outside the selected date range (7d/30d/all). This is **intentional**: audit shows recent activity, not filtered activity.

**Status:** ✓ Correct design (audit is append-only, shows context of recent system events).

---

### 11. **Empty States** (Comprehensive)
**Status:** ✓ All covered:
- No orders → "No sales data yet"
- No orders in filtered range → "No orders match these filters"
- No orders in chart range → "No orders in this range"
- No products → "No product lines in this range"
- No status rows → "Nothing to break down yet"
- No audit events → "No commerce audit events yet"

---

### 12. **Dark Mode: No Hardcoded Colors** (Correct)
**File:** src/styles.css  
**Status:** ✓ All colors use CSS variables (`var(--text)`, `var(--border)`, `var(--card)`, etc.). No `#fff`, `#000`, or hardcoded hex found in sales classes. Inherits theme correctly.

---

### 13. **Status Filter Dropdown** (Complete)
**File:** src/components/Sales/SalesScreen.tsx, line 188–200  
**Options:** draft, confirmed, invoiced, paid, fulfilled, cancelled (all statuses available).

**Status:** ✓ No missing statuses. Filter logic respects backend filtering.

---

## Not Changed

- No refactoring performed (read-only audit).
- No commits created.
- No tests committed to repo (scratch tests only in scratchpad).

---

## Actions Recommended (Priority Order)

1. **[Optional] Improve "Orders" label clarity** (1 hour, no risk)
   - Rename to "Total orders" or display count of revenue-eligible orders.
   - Add tooltip to "Average order" explaining denominator.

2. **[Low] Add auto-refresh to Sales after mutations** (3–4 hours, low risk)
   - After order creation/update, trigger `salesSummary` refresh.
   - Prevents staleness for power users working in Orders → Sales cycle.

3. **[Micro] Memoize peak calculation** (5 min, optional)
   - Wrap `peak` in useMemo if performance profiling shows any issue (unlikely).

---

## Questions

- **Refunded orders:** System has no "refunded" status. Orders are cancelled and restocked. Intended design, or oversight? (No action needed; flagging for clarity.)
- **"All time" range bucketing:** For very old data (years), 7-day buckets may be sparse. Consider reducing step size if span > 1 year? (Low priority; current design is reasonable.)
- **Concurrency:** If user clicks "Refresh" while a prior refresh is in-flight, request overlap could cause race conditions on state updates. Consider debouncing or disabling button during load? (Edge case; no current evidence of issue.)

---

## Conclusion

**The Sales section aggregates data correctly.** No bugs found in core logic. Date bucketing, status filtering, revenue counting, and math are all sound. Minor UX improvements (label clarity, auto-refresh) would enhance usability but are not required. Charts are accessible, styles are theme-aware, and fixture data is consistent.

**Ready for production.** Recommend addressing the label inconsistency and staleness edge case in a future sprint if user feedback surfaces confusion.
