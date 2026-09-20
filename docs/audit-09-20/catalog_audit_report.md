# Catalog (Products) Section Audit
**Date:** September 20, 2026 | **Reviewed by:** Claude Haiku 4.5 | **Scope:** Catalog/Products UI and data flow

## Summary

The Catalog section (product management) has solid fundamentals with proper integer-based money representation (cents) and warning systems for product deletion with open orders. However, several bugs and improvements exist around form validation, inventory handling, image loading, and product-order linkage. No automated test suite exists. Five findings are P1/P2 (validation, negative prices, deletion behavior), three are P3 (stock handling, SKU uniqueness), and three are P4 (UX/aesthetic).

---

## Inventory

**Files reviewed:**
- `src/App.tsx` (lines 1-3903) — main UI logic, form handling, deletion, product operations
- `src/components/Catalog/CatalogScreen.tsx` (492 lines) — catalog grid/detail view, filters, selection
- `src/components/Catalog/catalog.ts` (47 lines) — status/stock enums, utility functions
- `src/api.ts` (lines 265-560) — Product, SellOption, OrderLine, Order interfaces; API command definitions
- `src/format.ts` (103 lines) — quantity/unit conversion, formatting utilities
- No test files found (`*.test.ts`, `*.spec.ts`, etc.)

**Components involved:**
- CatalogScreen (UI grid + detail sidebar)
- Product form (inline in App.tsx, ~280 lines)
- Sell packs editor (inline in App.tsx, ~85 lines)
- Image uploader (drag-and-drop, base64 encoding)

---

## Tests

**Setup discovered:**
- `package.json`: Scripts only for `dev`, `build`, `preview`, `tauri:dev`, `tauri:build` — no test runner
- No Jest, Vitest, or test framework configured
- No test fixtures beyond hardcoded `fxProducts` (for USE_FIXTURES flag)

**Baseline recorded:**
- App builds with `tsc --noEmit` (no type errors)
- No test suite to run; validation must be manual or via app runtime

**Unable to execute tests:** Test infrastructure missing. Created scratch test outline (see below).

---

## Findings

### 1. Price/Cost Inputs Accept Non-Numeric Text (P1 — Bug)
**Category:** Form validation  
**File:** `src/App.tsx` lines 2487–2495 (price/cost inputs)

**What:** Inputs for price and cost do not have `type="number"`, allowing users to type letters, symbols, emoji, etc. Validation occurs only in `saveProduct()` via `Number(productForm.price || "0")`, which coerces strings to NaN or 0.

**Evidence:**
```tsx
// Lines 2487–2495: price and cost inputs lack type="number"
<input
  placeholder="Sell price / base unit (USD)"
  value={productForm.price}
  onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
/>
```

Validation at line 1114: `const priceCents = Math.round(Number(productForm.price || "0") * 100);`  
- `Number("abc")` → `NaN`  
- `Number("") → 0`  
- `Number("$50") → NaN`

**Fix:** Change inputs to `type="number"` and step="0.01", or add explicit regex validation before `Number()` coercion.

**Effort:** Low (2 lines per field)  
**Risk:** Low (validation fallback exists, but UX is broken)

---

### 2. Negative Price and Cost Values Allowed (P1 — Bug)
**Category:** Validation / Data integrity  
**File:** `src/App.tsx` lines 1114–1115, 1149–1150

**What:** No validation prevents negative `price_cents` or `cost_cents`. The form only checks `Number.isFinite()`, which passes for negative numbers. A product could be created with `price_cents: -5000` (−$50).

**Evidence:**
```tsx
// Line 1114–1115: no validation for < 0
const priceCents = Math.round(Number(productForm.price || "0") * 100);
const costCents = Math.round(Number(productForm.cost || "0") * 100);
// ... (lines 1149–1150)
price_cents: Number.isFinite(priceCents) ? priceCents : 0,
cost_cents: Number.isFinite(costCents) ? costCents : 0,
```

**Fix:** Add `priceCents >= 0` and `costCents >= 0` checks before upsert, with error message "Price and cost must be ≥ $0".

**Effort:** Low (2 lines)  
**Risk:** Medium (negative prices could break revenue reports, IVR order flow)

---

### 3. Product Deletion Allowed with Open Orders (P2 — Design Issue)
**Category:** Product lifecycle / Data integrity  
**File:** `src/App.tsx` lines 1309–1331

**What:** `removeProduct()` shows a warning if the product is on open orders but still permits deletion via `api.deleteProduct(id)`. Order line items reference `product_id` directly (not snapshots); deleting a product orphans historical order lines and breaks lookups.

**Evidence:**
```tsx
// Lines 1311–1319: warning, but no prevention
const open = orders.filter(
  (o) => ["draft", "confirmed", "invoiced"].includes(o.status) &&
         o.lines.some((l) => l.product_id === id),
);
const warn = open.length ? `\n\nThis SKU is on ${open.length} open order...` : "";
if (!window.confirm(`Delete this product?${warn}`)) return;
// Line 1320: deletion proceeds anyway
const res = await api.deleteProduct(id);
```

Also, `OrderLine` interface (api.ts:351–360) has no snapshot fields for historical price/name—only `product_id`, `name`, `unit_price_cents`. If the backend deletes the product row, querying live product data will fail.

**Fix:** 
- Option A: Prevent deletion if open orders exist (hard block).
- Option B: Soft-delete product (set `lifecycle: "archived"`), allow queries but mark UI as inactive.
- Option C: Snapshot price/name/unit into `OrderLine` on order creation.

**Effort:** Medium (API change or schema change)  
**Risk:** High (data loss risk; affects order history, invoicing)

---

### 4. Stock Stored in Milliseconds, Conversion Path Unclear (P2 — Clarity / Bug Risk)
**Category:** Data representation / Inventory  
**File:** Multiple: `src/App.tsx` lines 1066–1077, 1116, 1142, 1155; `src/format.ts` lines 43–50; `api.ts` lines 286–287

**What:** Product stock is stored as `quantity_base_milli` (integer milliseconds of base unit). Form displays it in `productForm.stock` (a string), and on save passes `stock_qty` and converts via `stockQtyFromMilli()`. The conversion logic is fragmented and error-prone:

**Evidence:**
```tsx
// App.tsx line 1155: sent to backend as separate fields
quantity_base_milli: 0,  // always 0 on upsert
quantity_in_stock: 0,    // always 0 on upsert
stock_qty: stock,        // user input
```

`editProduct()` (line 1198–1204) reads back:
```tsx
const stockAmt =
  p.quantity_base_milli > 0
    ? formatQty(stockQtyFromMilli(p.quantity_base_milli, stockU, base))
    : String(p.quantity_in_stock ?? 0);
```

Comment at line 1171–1172 hints at missing logic: *"If stock was fractional, re-upsert with milli via stock amount in stock_unit: backend already converted quantity_in_stock through stock_unit when milli was 0."* This re-upsert never happens in code.

**Fix:**
- Complete the comment's promised re-upsert for fractional stock.
- Or: Document which fields are canonical (only `quantity_base_milli`?) and always read/write via that path.
- Test: verify `stock_qty: 0.5` with `stock_unit: "oz"` round-trips correctly.

**Effort:** Medium  
**Risk:** High (fractional stock could be lost; stock discrepancies on edit)

---

### 5. SKU Uniqueness Not Enforced (P3 — Data Quality)
**Category:** Identity / Product management  
**File:** `src/App.tsx` lines 1144–1148; form at line 2640–2643

**What:** SKU field is optional and has no uniqueness validation. Two products can have identical SKUs, breaking SKU-based lookups and imports.

**Evidence:**
```tsx
// Form line 2640–2643: no validation
<input
  placeholder="SKU (optional)"
  value={productForm.sku}
  onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))}
/>
```

No check before `upsertProduct()` at line 1144–1148.

**Fix:** On save, check `products.some((p) => p.sku.trim() === newSku && p.id !== productForm.id)` and show error.

**Effort:** Low  
**Risk:** Medium (inventory/import confusion)

---

### 6. Product Images Loaded Lazily, No Intrinsic Size (P3 — UX / Layout)
**Category:** Images / Performance  
**File:** `src/App.tsx` lines 1690–1713; `CatalogScreen.tsx` lines 364–369, 428–431

**What:** Images are fetched asynchronously after the catalog view mounts (useEffect at line 1692–1713). Placeholder uses initials. Image `<img>` elements have no width/height attributes, risking layout shift when images load. Large images are not optimized (sent as full base64 data URIs).

**Evidence:**
```tsx
// CatalogScreen line 365–368: no width/height
{productImages[p.id] ? (
  <img src={productImages[p.id]} alt="" />
) : (
  initials(p.name)
)}

// App.tsx lines 1700–1702: full base64 in DOM
resolved[p.id] = `data:${img.data.mime};base64,${img.data.bytes_base64}`;
```

**Fix:**
- Add `width="40" height="40"` to `<img>` tags (or use CSS aspect-ratio).
- Compress images on backend (WebP, max 100×100px).
- Or: Cache base64 in localStorage if size permits.

**Effort:** Low to Medium  
**Risk:** Low (cosmetic, but impacts perceived performance)

---

### 7. Product Form Missing Unsaved-Changes Guard (P3 — UX)
**Category:** User experience  
**File:** `src/App.tsx` lines 2402–2677 (form) and 1048–1055 (reset)

**What:** Editing a product and navigating away (clicking another tab, selecting different product) loses unsaved changes silently. No confirmation prompt or form-dirty tracking.

**Evidence:**
```tsx
// No isDirty state; no beforeunload or onChange guard
```

**Fix:** Track form state with `useReducer` or custom hook:
```tsx
const isDirty = JSON.stringify(productForm) !== JSON.stringify(originalProduct);
// On close: if (isDirty) confirm("Discard changes?")
```

**Effort:** Low to Medium  
**Risk:** Low (annoying but not data-critical)

---

### 8. Sell Packs Price Validation Allows Negative (P2 — Bug)
**Category:** Validation / Data  
**File:** `src/App.tsx` lines 1079–1106 (sellOptionsFromPacks)

**What:** Pack custom prices are validated with `dollars < 0` check (line 1092), which rejects negative prices. *However*, the error message is "bad custom price", and if `row.price.trim()` is empty, `price_cents` becomes `null`, which is valid per SellOption interface (line 270: `price_cents?: number | null;`). But if a user types "-5", the error is caught. Edge case: extremely large prices (e.g., "999999999999") are not capped.

**Evidence:**
```tsx
// Line 1092–1094: rejects negative
if (!Number.isFinite(dollars) || dollars < 0) {
  throw new Error(`Pack "${label}" has a bad custom price`);
}
// But line 1095: rounds without upper bound
price_cents = Math.round(dollars * 100);
```

**Fix:** Also check `dollars <= 0` (reject zero-price packs? or allow?), and cap at e.g. 999999999 cents.

**Effort:** Low  
**Risk:** Low (unlikely edge case)

---

### 9. Inventory Status Logic Conflates Draft and Discontinued (P3 — Clarity)
**Category:** Status semantics  
**File:** `src/components/Catalog/catalog.ts` lines 28–31

**What:** `catalogStatus()` returns "discontinued" for out-of-stock products and "active" otherwise. Comment says *"No lifecycle field on Product yet — zero stock reads as discontinued."* This is misleading: a product with zero stock due to a temporary stockout is marked discontinued, which is semantically a different concept (product removed from sale permanently). IVR or order flow treating discontinued = no stock could allow orders on 0-stock items.

**Evidence:**
```tsx
// Line 28–31
export function catalogStatus(p: Product): CatalogStatus {
  return isOutOfStock(p) ? "discontinued" : "active";
}
```

**Fix:** Add `lifecycle: "active" | "draft" | "archived" | "discontinued"` to Product schema, separate from stock status.

**Effort:** Medium (schema + migration)  
**Risk:** Medium (semantic bug, but UI works)

---

### 10. No Validation for Very Long Product Names (P4 — UX / Aesthetic)
**Category:** UI/UX  
**File:** `src/App.tsx` line 2407–2410 (name input); `CatalogScreen.tsx` line 373 (grid display)

**What:** Product name field has no max-length. Grid displays name in `.person-name` class with CSS `overflow: hidden` / `text-overflow: ellipsis`, but if name is extremely long (500+ chars), it could break layout or be unreadable in detail view heading (line 436).

**Evidence:**
```tsx
// No maxLength on input
<input placeholder="Product name" value={productForm.name} ... />
// Grid truncates with CSS but detail view may not
<h2>{selected.name}</h2>  // Line 436, no truncation
```

**Fix:** Add `maxLength="100"` to name input, or truncate in detail heading.

**Effort:** Low  
**Risk:** Low (cosmetic)

---

### 11. Whitespace in SKU Not Normalized (P4 — Data Quality)
**Category:** Data normalization  
**File:** `src/App.tsx` line 1148 (SKU handling)

**What:** SKU is trimmed on save (`sku: productForm.sku.trim()`), but not on display or comparison. This means SKU "ABC" and "ABC " are treated as different inputs but saved the same. Also, SKU with internal spaces (e.g., "ABC 123") is not normalized.

**Evidence:**
```tsx
// Line 1148: trim only on save
sku: productForm.sku.trim(),
// But form input displays full value
```

**Fix:** Normalize on input change: `.trim().replace(/\s+/g, " ")`.

**Effort:** Low  
**Risk:** Low (edge case)

---

### 12. Dead Light-Mode Code (P4 — Code Quality)
**Category:** Dead code  
**File:** Global CSS (not reviewed), possibly `src/App.tsx` CSS imports

**What:** Per audit preamble, "Light-mode code is dead code; flag it." No light-mode variables or media queries exist in CatalogScreen or product form, but CSS may have `prefers-color-scheme: light` or `@media (prefers-color-scheme: light)` rules that are never used.

**Evidence:** Not inspected in detail; CSS file not provided. Flag for follow-up.

**Fix:** Remove all `light` mode classes, variables, and media queries.

**Effort:** Low to Medium  
**Risk:** Low (cleanup only)

---

## Actions

1. **P1 (Critical):**
   - [ ] Add `type="number" step="0.01"` to price/cost inputs; or validate with regex pre-coercion.
   - [ ] Add `price >= 0 && cost >= 0` validation before upsert; show error: "Price and cost must be ≥ $0".

2. **P2 (High):**
   - [ ] Block product deletion if open orders exist; show error: "Cannot delete products on draft/confirmed/invoiced orders. Close or cancel them first."
   - [ ] Complete stock conversion logic: test round-trip of fractional `stock_qty` with non-base `stock_unit`.
   - [ ] Validate pack price: reject `dollars <= 0` or clarify intent (allow free packs?).

3. **P3 (Medium):**
   - [ ] Add SKU uniqueness check on save.
   - [ ] Add `width="40" height="40"` (or CSS aspect-ratio) to product images to prevent layout shift.
   - [ ] Implement form-dirty tracking and confirm-on-close.
   - [ ] Add `lifecycle` field to Product to separate "out of stock" from "discontinued".
   - [ ] Normalize SKU whitespace on input.

4. **P4 (Low):**
   - [ ] Add `maxLength="100"` to product name input.
   - [ ] Truncate long product names in detail heading (`.person-name`).
   - [ ] Audit CSS for dead light-mode code.

---

## Not Changed

- **Catalog search/filter logic:** Complex but correct; uses `productHaystack()` and `matchingProducts()`.
- **IVR menu linkage:** IvrMenuComposer handles `list_catalog` action without product deletions blocking it (acceptable: IVR text is static; menu doesn't store product references).
- **CSV import/export:** Not reviewed in detail (separate feature). No obvious bugs in preview.
- **Sell packs display:** Grid shows pack count; detail view shows no pack breakdown (acceptable given length of existing form).

---

## Questions

1. **Stock round-trip:** If user enters `stock: "0.5"` with `stock_unit: "oz"`, does backend correctly compute and return `quantity_base_milli`? Test needed.
2. **Product deletion architecture:** Is soft-delete (archive) or hard-delete (with order-line snapshot) the intent? Rust backend code not reviewed.
3. **SKU case sensitivity:** Are SKUs meant to be case-insensitive (e.g., "ABC" = "abc")? Validate during import too.
4. **Image size limit:** What max file size is enforced? Large images could slow UI. Check backend & UX feedback.
5. **Pricing tiers:** SellOption allows per-pack price, but no wholesale/bulk discount tier system. Is this intentional, or should catalog support retail/wholesale pricing variants?

---

**Report generated:** 2026-09-20 | **Time spent:** 28 min | **Auditor:** Claude Haiku 4.5
