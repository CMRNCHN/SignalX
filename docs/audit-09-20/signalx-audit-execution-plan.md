# SignalX Audit → Execution Plan

Source: `docs/audit-09-20/COMPREHENSIVE_AUDIT_COMPILATION.md` (96 claimed findings, 9 reports).
This collapses them into 24 work items, resolves the contradictions between agents, and sequences them so shared fixes land before per-section ones.

---

## 0. Read this before trusting the numbers

**Four of the nine reports are not in the compilation.** They're stubs pointing at files that weren't inlined:

| Report | State in compilation |
|---|---|
| People | Stub — "20+ KB of detailed findings… see people_audit_report.md". 5 bullets only. |
| Orders | Stub — "~23 KB… see orders_audit_report.md". 4 bullets only. |
| Sales | Findings 3–13 elided ("Brevity") |
| Outbox | Findings 3–6 elided |
| Settings | Findings 4–13 elided |
| Audit | Findings 6–10 elided |

So the compilation contains roughly 35 actual findings, not 96. The master index and the "96 findings" headline are counting content that isn't there. **Before planning from this, concatenate the real reports** — the individual `.md` files exist in `docs/audit-09-20/`.

Also: the agents disagreed with each other in six places, and the master index disagrees with its own finding bodies in three. Those are resolved in §2.

---

## 1. Verify the contested claims (run first, ~2 min)

```bash
cd /Users/cameroncohen/Developer/projects/SignalX && { \
echo "### 1. swallowed persist errors (Outbox#2 + Audit#3)"; \
grep -rnE 'let _ = .*(persist|save|update_item|record\(|append_audit)' src-tauri/src/ || echo "none"; \
echo; echo "### 2. outbox message id format (Outbox#1 P0)"; \
grep -rn 'outgoing-' src-tauri/src/ || echo "none"; \
echo; echo "### 3. does the claimed sales test file exist?"; \
find . -name 'sales_audit_tests*' -not -path './node_modules/*' -not -path './target/*' 2>/dev/null | grep . || echo "NOT FOUND — sales tests were not executed"; \
echo; echo "### 4. test infrastructure actually configured?"; \
grep -A12 '"scripts"' package.json; ls vitest.config.* jest.config.* playwright.config.* 2>/dev/null || echo "no frontend test config"; \
echo; echo "### 5. rust test count"; \
(cd src-tauri && cargo test --lib 2>&1 | tail -3); \
echo; echo "### 6. does IVR actually reference product ids? (Catalog vs Relationships contradiction)"; \
grep -rnE 'product_id|list_catalog' src-tauri/src/ src/components/ | grep -iE 'ivr|menu' || echo "no ivr→product references found — Catalog report is right, Relationships Trace 2 is wrong"; \
echo; echo "### 7. IME guard present? (Messaging#2)"; \
grep -rn 'isComposing' src/ || echo "ABSENT — confirmed bug"; \
echo; echo "### 8. unwrap/expect count on rust paths"; \
grep -cE '\.unwrap\(\)|\.expect\(' src-tauri/src/lib.rs; \
echo; echo "### 9. dangerouslySetInnerHTML (Messaging#5 XSS claim)"; \
grep -rn 'dangerouslySetInnerHTML' src/ || echo "none — XSS finding is not P0"; \
echo; echo "### 10. light-mode dead code"; \
grep -rnE 'prefers-color-scheme|light-mode|--light|\btheme.*light' src/ --include='*.css' --include='*.tsx' --include='*.ts' | head -30 || echo "none"; \
echo; echo "### 11. hardcoded px values in styles.css (spacing defect)"; \
grep -roE '[0-9]+px' src/styles.css | sed 's/.*://' | sort | uniq -c | sort -rn | head -20; \
echo; echo "### 12. line counts"; \
wc -l src/App.tsx src-tauri/src/lib.rs; \
} 2>&1 | tee docs/audit-09-20/VERIFICATION.txt
```

---

## 2. Contradictions and miscategorizations — resolved

| # | Conflict | Resolution |
|---|---|---|
| C1 | **Catalog** "Not Changed": *IVR menu doesn't store product references.* **Relationships** Trace 2: *Product deletion orphans IVR menu nodes — Severity High.* | Directly opposed. Check #6 above decides it. Don't scope M5 around IVR breakage until confirmed. |
| C2 | Master index lists **Messaging #5 (XSS)** as **P0**. The finding body says React auto-escapes, current protocol is text-only, risk **"Very low."** | Index is wrong. Demote to a documented assumption + lint rule (M16). Do not spend P0 time here. |
| C3 | Master index lists **Outbox #2** as **P0**; the finding itself says **P1**. Appendix calls **Messaging #1** "P0 optimistic send"; the finding says P1. | Index inflates. Real P0 set is **Outbox #1 and Outbox #2** only — both can duplicate or drop real messages to real buyers. |
| C4 | **Catalog #8** titled *"Sell Packs Price Validation Allows Negative"*; body shows negative **is** rejected and the actual gap is no upper bound. | Title is wrong. Re-scope to "no upper bound on pack price." |
| C5 | **Catalog #4** reads `quantity_base_milli` as **milliseconds**. | Misread — `milli` is thousandths of a base unit. The underlying concern (a promised re-upsert that never happens, fragmented conversion) is still real. Keep the finding, drop the framing. |
| C6 | **Relationships** Part VI: *"All destructive actions require confirmation."* **Settings #3**: IVR "Reset to Demo" has **no** confirmation. | Relationships is wrong. M11 sweeps every destructive action instead of trusting either. |
| C7 | **Sales** claims 10 tests executed in `sales_audit_tests.ts`, all passing. **Catalog** (same codebase, same day) says no test runner exists. | Check #3 above. If the file isn't there, Sales' "tests" were reasoned, not run — treat every Sales finding as `unconfirmed`. |
| C8 | **Relationships** Part III calls orphaning *"intentional design — soft-delete philosophy"* while **People #1** and **Catalog #3** treat it as a defect. | There is no soft-delete implemented; calling the absence a philosophy is post-hoc. This is the decision in D1 — you decide, then it's intentional. |

---

## 3. Master items (deduped)

Each item absorbs several reported findings. `⚠ decision` means it's blocked on you (§5).

### Wave 1 — Send path correctness (real messages to real buyers)

**M1 · Non-unique outbox message IDs**
Absorbs: Outbox #1, Rel P0-1, Trace 3.
`format!("outgoing-{}-{}", recipient, ts)` collides for same-recipient sends inside one millisecond; `add_message()` dedupes on exact id, so the second message is silently dropped. Batch-fulfilling multiple orders to one buyer is the realistic trigger.
Fix: append a UUID or process-atomic counter to the id. Contrary to the audit's "migration test required" — there's no migration: existing ids still compare equal to themselves, and the format is only ever produced going forward.
Verify: queue 50 messages to one recipient in a tight loop, assert 50 distinct ids; separately assert a genuine echo duplicate is still deduped.
Effort S · Risk low

**M2 · Swallowed persistence results on state transitions**
Absorbs: Outbox #2, Audit #3, Rel P0-2.
`let _ = update_item_async(...)` after a successful signal-cli send: the UI shows "sent", disk says "sending", restart resends. Identical `let _ = persist()` pattern in all four audit stores. One class, one sweep.
Fix: match on the result; on Err log, set `last_error`, mark failed, emit. Same for audit stores.
Verify: force a write failure (read-only store dir), assert terminal state is `failed`, assert restart does not resend.
Effort S · Risk low

**M3 · No signal-cli timeout, no per-recipient rate limit** ⚠ decision
Absorbs: Outbox #3, #4.
A hung signal-cli blocks the queue indefinitely; nothing throttles a burst to one recipient.

**M4 · "sending" state can persist indefinitely**
Absorbs: Outbox #5, Messaging #10, Rel Part I #3.
Session switch leaves in-flight items stuck; Messaging also never surfaces `sending` distinctly, so the user can't tell stuck from slow. Revert in-flight → queued atomically on teardown, and render the state.
Effort S–M · Risk low

**M12 · IME composition guard** — add `!e.isComposing`. 5 minutes, do it while reading this.

### Wave 2 — Deletion policy (one decision unblocks four findings)

**M5 · Deletion & referential integrity** ⚠ decision D1
Absorbs: People #1, Catalog #3, Catalog #9, Rel Part III, Rel Trace 2.
Nothing cascades and nothing blocks; deletion leaves orphaned threads, orders, outbox items, and menu references. `OrderLine` already snapshots name and unit price, which means **soft-delete is the cheap answer** — history stays readable, pickers filter archived, hard delete gets blocked. Needs a `lifecycle` field on Product (which also fixes Catalog #9's conflation of out-of-stock with discontinued) and the equivalent on contacts.

**M6 · Audit coverage on state-changing operations**
Absorbs: Audit #1, Rel P1.
~80% of mutations write nothing. Depends on M2 (writes must be reliable first) and M5 (must know what delete means).
Effort M · Risk low

**M7 · PII in auto-reply audit log** ⚠ decision D3
Absorbs: Audit #2, Rel Part IV #2. Full draft text with buyer details persisted unredacted and exportable.

**M8 · No actor attribution** — Audit #4. Versioned additive schema change. Effort M.

### Wave 3 — Validation & data quality (one pass, not per-field patches)

**M9 · Input validation sweep**
Absorbs: Catalog #1, #2, #5, #8, #10, #11, Settings #1.
Seven separate findings that are one missing layer: numeric fields accept text and negatives, no upper bounds, SKU has no uniqueness or normalization, name has no max length, PIN has no enforced minimum. Build one validation helper and apply it, rather than patching seven inputs and leaving the eighth.
⚠ decision D5 (SKU case sensitivity) · Effort M · Risk low

**M10 · Stock unit round-trip**
Absorbs: Catalog #4 (reframed per C5). The comment promises a re-upsert for fractional stock that the code never performs.
Verify: `stock_qty: 0.5, stock_unit: "oz"` survives save → read → save.
Effort M · Risk medium (silent stock loss)

**M11 · Destructive-action guards** — sweep every destructive path rather than trusting Rel Part VI. Absorbs Settings #3. Effort S.

### Wave 4 — Messaging UX

**M14 · Send lifecycle: optimistic insert, failure retains text, retry**
Absorbs: Messaging #1, #6 — same function, one fix. Today the composer clears before the queue call resolves and a rejected `queueMessage()` loses the text outright.
Effort M · Risk low

**M13 · Scroll-to-bottom** — Messaging #4. Stick-to-bottom only when already near bottom; otherwise show a "new messages" affordance. Unconditional `scrollIntoView` on every arrival will yank people out of scrollback. Effort S.

**M15 · Mark-as-read race + read-state persistence** ⚠ decision D2. Absorbs Messaging #3 and the open question that read state is in-memory only.

**M16 · Close out the XSS finding** — per C2: document the plaintext assumption, add a lint rule banning `dangerouslySetInnerHTML`. Effort S. **Not P0.**

**M17 · Attachment memory & layout**
Absorbs: Messaging #7, #8, Catalog #6 — all one root cause: full base64 held in React state and the DOM, with no intrinsic sizing and no eviction. Move to file-path/blob-URL references, add explicit width/height, window the list.
⚠ decision D4 (size cap) · Effort L · Risk low

### Wave 5 — Freshness & consistency

**M18 · Central invalidation on mutation**
Absorbs: Sales #1, Rel Part IV #3.
The audit proposes threading a refresh callback from App into SalesScreen (2–3h). That builds the wrong thing — it fixes one instance of a class and adds prop drilling right before you decompose. Do it as invalidation inside the shared query layer instead, and every section gets freshness for free.
Effort M · Risk low · **Do before Wave 6.**

**M19 · Sales order-count denominator** — Sales #2. Label says "6 orders", average divides by 4. Rename or add the revenue-eligible count. Effort S.

**M20 · ContactMeta/GroupMeta notes asymmetry** — Rel Part I #1, People #3. Add `notes` to ContactMeta in both Rust and `api.ts`.

**M21 · E.164 normalization at every entry point** — People #2. Normalize on write, not on display, or duplicates keep accruing.

**M25 · Add `refunded` order status** (per D7)
New terminal status excluded from revenue, with `refunded_at`. The catch: `countsTowardRevenue()` exists twice — `src-tauri/src/orders.rs:101` and `src/format.ts:52` — so adding a status means editing both, which is exactly the enum-drift risk Relationships flagged in Part I. Add a test asserting the two implementations agree on every status, or generate the TS side from the Rust enum.
Effort M · Risk medium (touches Sales aggregation and the order state machine)

### Wave 6 — Structure

**M22 · Shared modules, then extraction**
Rel Part VII's extraction order (Catalog → Sales → Settings → Audit → People → Orders → Messaging) is sound. Its prerequisite list is not: it marks the query layer as a 4–6h task but then orders extraction independently of it. **M18/queries.ts and nav.ts must land before the first extraction**, or each extracted section reimplements fetching and you do the work twice.

**M23 · Remove light-mode dead code** — Catalog #12 plus global CSS. Check #10 sizes it.

**M24 · Spacing token pass per section** — the original defect that started this whole effort (ad-hoc 1–24px). Check #11 tells you which values dominate. Rel Part VI rates this "Very Low"; it's the reason you began, so rate it yourself.

---

## 4. Sequenced plan

```
[ ] W0  Run §1 verification block; concatenate the 4 missing reports    (30 min)
[ ] W0  Resolve C1 and C7 from that output                              (10 min)
[ ] W1  M12 IME guard                                                    (5 min)
[ ] W1  M1  UUID outbox ids + collision test                             (S)
[ ] W1  M2  persistence error handling sweep + failure-injection test    (S)
[ ] W1  M4  sending-state revert + UI (attempt count, last error)        (S–M)
[ ] W1  M3  60s timeout, 1s/recipient, 8 attempts, fail-fast on permanent errors
[ ] W2  M5  lifecycle field + archive semantics + reference checks       (M)
[ ] W2  M6  audit coverage on mutations                   (after M2, M5)
[ ] W2  M7  summary-only auto-reply audit entries                        (M)
[ ] W2  M8  actor attribution
[ ] W3  M9  validation sweep incl. SKU normalization + CSV import        (M)
[ ] W3  M10 stock round-trip + test
[ ] W3  M11 destructive-action guards
[ ] W4  M14 send lifecycle
[ ] W4  M13 scroll behavior
[ ] W4  M15 last_read_at + derived unread (absorbs M3/Messaging#3)       (M)
[ ] W4  M16 close XSS finding
[ ] W4  M17 path-based attachments + 25 MB cap                           (L)
[ ] W5  M18 query layer + invalidation                    ← gates Wave 6
[ ] W5  M25 refunded status + countsTowardRevenue parity test
[ ] W5  M19 / M20 / M21
[ ] W6  M22 nav.ts, then extraction in Rel's order, Messaging last
[ ] W6  M23 / M24
```

Nothing is blocked on a decision now. Waves 1 and 2 are the only ones touching correctness of real outbound messages and of your audit trail; Wave 3 down is quality.

---

## 5. Decisions — resolved

**D1 · Deletion → soft-delete with `lifecycle`.**
Add `lifecycle: "active" | "archived"` to Product and ContactMeta (default `active`). Hard delete permitted only when zero references exist; otherwise archive. Archived rows are filtered out of product pickers, IVR `list_catalog`, new-order search, and contact lists, but stay resolvable for historical reads. Audit entry on both archive and hard delete.
Why: order lines already snapshot name and unit price, so history survives either way — but hard-blocking means a product that was ever ordered can never be removed from the catalog, which is unusable in practice. The same field also settles Catalog #9 (out-of-stock conflated with discontinued) at no extra cost.
If buyer-data erasure ever becomes a requirement, that's a separate explicit "purge contact" path that redacts message content too — don't fold it into delete.

**D2 · Read state → persist, and derive the count.**
Store `last_read_at: i64` per thread. Compute `unread_count` from messages newer than it rather than storing a counter.
Why: in-memory read state means every restart re-marks everything unread, which makes the nav badge meaningless. Deriving instead of storing also eliminates Messaging #3 outright — there's no counter left to drift, so the optimistic-update/revert fix that report proposed becomes unnecessary. **M15 absorbs M3.**

**D3 · Audit PII → store a summary, never the body.**
Log `thread_id`, timestamp, trigger, template/model id, outcome, character count, and a stable hash of the draft. Drop the full text.
Why: the audit's job is "did we auto-reply here, when, and did it land" — the body already lives in the message store. Keeping a second copy in a separate file with its own retention and export path is pure added exposure. In-place redaction (regex-stripping phone numbers) is the worse option: lossy, and it never catches everything.

**D4 · Attachments → 25 MB hard cap, warn at 5 MB.**
Set it well under whatever signal-cli accepts, and reject above it with a clear message rather than truncating.
Why: the cap matters much less once M17 lands — the real fix is to stop holding base64 in React state at all. Pass file paths to Rust and let the backend read from disk; render inbound attachments from blob URLs or `convertFileSrc`, not data URIs. The cap is the guard, not the solution.

**D5 · SKU → case-insensitive unique, normalized on write, enforced on import.**
Trim, collapse internal whitespace, uppercase on write. Uniqueness checked across **all** products including archived — otherwise archiving and reusing a SKU breaks historical lookups. Empty SKU stays allowed and exempt (it's optional).
CSV import enforces the same rule and **rejects the whole batch** with a row-numbered error list rather than applying partially. Bulk import is where duplicates actually get created.

**D6 · Outbox numbers.**
- signal-cli timeout: **60s** per attempt, then kill the process, mark the attempt failed, back off. (30s would false-fail on a large attachment upload.)
- Per-recipient minimum interval: **1s**. Enough to avoid flooding one buyer; far above any real seller's volume.
- Max attempts: **8** — with the existing formula (base 1s, 2^attempt, 30s cap) that's roughly two minutes of retrying before permanent failure. Today there's no maximum at all, so an unreachable recipient retries forever at 30s intervals.
- Add failure classification: a permanent error (unregistered number, invalid recipient) fails immediately with zero retries instead of burning all 8 attempts.
- Permanent `failed` must be visually distinct from pending in the UI, with attempt count and last error text — that's the Outbox #6 item folded into M4.

**D7 · Order statuses → add `refunded`, skip `pending`.**
`pending` is unnecessary: `draft` and `confirmed` already cover the pre-payment states, and a third would overlap `confirmed` ambiguously.
`refunded` is a real gap. Today a refund has nowhere to go — leaving it `paid` inflates revenue permanently, and marking it `cancelled` rewrites history for an order that did happen and did move stock and money. Add it as a terminal status that does **not** count toward revenue, with `refunded_at` and a refunded amount if partial refunds are ever needed. See **M25**.


---

## 6. Test debt that pins all of this

There is effectively no frontend test suite (Catalog report) and 60 Rust tests with zero direct outbox coverage (Outbox report). Before Wave 1 fixes land, these need to exist, because every one of them is a bug that already shipped once:

1. Outbox: id uniqueness under same-millisecond burst to one recipient
2. Outbox: persistence failure after signal-cli success → terminal state, no resend on restart
3. Outbox: `claim_next_for_send()` with expired backoff; simultaneous retry of one item
4. Outbox: session switch mid-send
5. Catalog: fractional stock round-trip through `stock_unit`
6. Orders: state machine transitions — enumerate legal ones in Rust and in the UI, then diff
7. Sales: re-run the 10 cases the Sales report claims to have run, as actual executable tests
8. E2E: order confirm → outbox → echo → audit entry → sales figure (Rel Part IX lists five such gaps)
