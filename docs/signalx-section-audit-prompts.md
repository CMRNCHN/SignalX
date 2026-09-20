# SignalX Section Audit Prompts

Eight section audits + one relationship audit, same format as the messaging audit.

**Run order:** People → Catalog → Orders → Sales → Outbox → Audit → Settings → Relationships. The relationship audit reads every prior report, so run it last. Sections 1–7 are independent and can run in parallel agents.

**Reports go to:** `tmp/<section>_audit_report.md` (matching `tmp/messaging_audit_report.md`).

---

## SHARED PREAMBLE

Prepend this to every section prompt below.

```
Repo: /Users/cameroncohen/Developer/projects/SignalX
Live app: src/App.tsx (~3,903 lines, monolithic) + src-tauri/ (Tauri, signal-cli). This is the base and what ships.
src/api.ts is the single source of truth for data shapes and mirrors the Rust structs — treat any component type that disagrees with it as a defect.
App is dark-only. Light-mode code is dead code; flag it.
Ignore branch origin/cursor/cloud-agent-1788721043385-delzg (Phase 1 fixture UI) and src-tauri/src/demo.rs (stale, unreferenced). Neither is a source of truth.
Read CLAUDE.md and .cursor/rules/ before starting and stay inside them.

This is a READ-AND-REPORT task. Do not commit, do not open PRs, do not refactor. You may create scratch test files and a throwaway branch only.

The section likely does not exist as its own file — it's a region of App.tsx plus hooks, Tauri commands, and Rust handlers. Locate it by symbol and by the nav item that routes to it, and inventory the whole vertical slice: UI region → state/hooks → src/api.ts calls → #[tauri::command] → Rust module → persistence.

TIME BUDGET: 30 minutes of active work. Track elapsed time.
  0–5    inventory + map the vertical slice end to end
  5–15   static review pass, piece by piece
  15–25  write and run tests, reproduce suspected bugs
  25–30  consolidate, rank, write the report
Do not stop early because it "looks fine." Extra time goes to error paths, empty/loading states, and concurrency.

TESTING
- Discover the test setup yourself: package.json scripts, then Cargo.toml / Makefile / justfile, then config files (vitest.config.*, jest.config.*, playwright.config.*), then existing *.test.* / *.spec.* / #[cfg(test)] blocks. State the command you found. Frontend and Rust are separate suites — check both.
- Record baseline pass/fail and flaky tests. If the suite won't run, fix only what's needed and note exactly what you changed.
- If no test infrastructure exists for this layer, stand up the minimum (matching runner, test script) and list every file and dependency you added.
- For each suspected bug, write a FAILING TEST that reproduces it before calling it real. Can't reproduce → label it `unconfirmed` and say what you tried.
- Do not modify existing tests to make them pass. Keep new tests in a scratch dir and list their paths.

ALSO CHECK IN EVERY SECTION
- Bugs: stale closures, missing effect deps, subscription/listener cleanup, unhandled promise rejections, Tauri invoke errors swallowed silently, unwrap()/expect() on user-reachable paths, ordering and timezone bugs, unsanitized user content rendered as HTML.
- Improvement: re-render churn, over-broad context, missing memo boundaries, waterfall/N+1 invokes on mount, missing empty/loading/offline/error/permission-denied states, accessibility (focus order, keyboard-only operation, icon-button labels, live regions, hit targets).
- Simplification: duplicated logic that belongs in a shared hook, components over ~200 LOC or holding more than one responsibility (propose the split), dead code, unused props, obsolete flags, state that could be derived, prop drilling past two levels.
- Aesthetic: hardcoded spacing/color/radius/font values instead of the CSS var() tokens and Tailwind scale (4/8/12/16/24/32) — this app's known defect is ad-hoc 1–24px spacing, so flag every instance; cramped panels and wasted space; fixed widths where minmax() belongs; layout shift on load; long-value overflow and truncation; inconsistent density vs. the other sections.

REPORT FORMAT — return a single markdown file at tmp/<section>_audit_report.md, nothing else:

## Summary
3–5 sentences: health, biggest risk, where complexity concentrates.

## Vertical Slice Inventory
| Layer | File | Symbol/region | LOC | Verdict (ok / needs work / rewrite) |

## Test Results
Command(s) used, or "no suite existed — set up <runner>"
Baseline: X passed / Y failed / Z skipped
New tests added: <paths> — N passed, M failing (each failure = a confirmed bug below)
Anything installed or changed to make tests run: <list, or none>

## Findings
Numbered. Each:
- **[P0|P1|P2] Title**
- Category: bug | improvement | simplification | aesthetic
- File(s) + line(s)
- What's wrong (2–3 sentences)
- Evidence: failing test name, repro steps, or "static — unconfirmed"
- Fix: concrete change, code sketch if under 15 lines
- Effort: S (<30m) | M (<2h) | L (>2h)
- Risk of fixing: low | medium | high
- Crosses into: <other sections touched, or none>

## Action List
`[ ] #<id> — <one-line action> (<effort>)`, grouped: Fix now / Fix this week / Backlog.

## Deliberately Not Changed
Looks wrong, probably intentional — say why you left it.

## Open Questions
Needs my decision before work proceeds.

No praise, no filler, no "consider possibly maybe." Every finding gets a file path. Priority is user impact × likelihood, not ease of fixing. Fewer than 10 real findings means you didn't look hard enough — go back.

When the report is written, stop. Do not begin fixing.
```

---

## 1. PEOPLE

```
Audit the People section (contacts) per the preamble above.

Section-specific:
- Phone number handling: E.164 normalization on every entry path, duplicate contacts from format variance (+1 vs 1 vs bare), matching an inbound Signal message to an existing contact, contacts with no name, contacts with multiple numbers.
- Contact → thread link: opening a contact's conversation, contact with zero threads, thread whose contact was deleted.
- Contact → order history: does People show it, and is it the same query Orders uses or a duplicate?
- ContactMeta has no notes field (known gap). Check whether the UI implies notes exist anywhere and where notes are actually persisted, if at all.
- Segments/filters (Favorite, VIP, Become core buyer): where segment membership is stored, whether filters compose or overwrite, filter state persisted across navigation, empty filter result state, count accuracy vs. rendered rows.
- 2-panel layout: selection persistence on list refresh, detail panel when selection is deleted mid-view, keyboard navigation of the list.
- Contact deletion/merge: what happens to their threads, orders, and audit entries. Referential integrity or orphans?
- Search: debounce, case/diacritic handling, searching by number vs. name, no-results state.
```

---

## 2. CATALOG

```
Audit the Catalog section (products) per the preamble above.

Section-specific:
- Money representation: integer minor units vs. float anywhere in the slice. Any float arithmetic on prices is a P0 — trace it from Rust struct through api.ts to display.
- Pricing tiers (wholesale/retail): which tier applies where, what happens when a tier is unset, tier resolution duplicated between Catalog and Orders.
- Availability status: source of truth, whether an unavailable product can still be selected in a menu or ordered, stock decrement path if any.
- Product ↔ IVR menu linkage: deleting or renaming a product referenced by a live menu, product with no menu, menu pointing at a deleted product. Check IvrMenuComposer.tsx for how it resolves products.
- Product deletion with open orders referencing it — do order line items snapshot price/name, or resolve live? If they resolve live, historical orders mutate; that's a P0.
- Identity: SKU/id uniqueness enforcement, case sensitivity, whitespace in names, very long names in the grid.
- Create/edit form: validation on price (negative, zero, non-numeric), required fields, unsaved-changes guard, optimistic update vs. refetch, failure surfacing.
- Images/media if present: missing image fallback, intrinsic sizing to prevent layout shift, oversized asset handling.
```

---

## 3. ORDERS

```
Audit the Orders section per the preamble above.

Section-specific:
- Order state machine: enumerate every status and every legal transition, in Rust and in the UI separately, then diff them. Any transition the UI allows that the backend doesn't (or vice versa) is a finding.
- Illegal/duplicate transitions: double-click on a fulfill button, fulfilling an already-cancelled order, concurrent status change from an inbound message while the detail panel is open.
- Line item snapshots: name, unit price, and tier captured at order time vs. resolved from Catalog at render time. Totals recomputed on the fly or stored? Do they agree?
- Totals arithmetic: rounding, quantity × price in minor units, discounts/fees if any, total vs. sum of lines mismatch.
- Buyer instruction capture: length limits, newlines, emoji, unsanitized rendering, truncation in the list view.
- Fulfillment: what message it triggers, whether it enqueues to Outbox and whether a failed send leaves the order marked fulfilled anyway (P0 if so).
- List view: sort default, pagination/virtualization for large volumes, duplicate fetches, filter + sort composition, unread/new-order indicator accuracy.
- Cancel/refund path: exists? reversible? does it flow to Sales and Audit?
- Order → contact and order → thread navigation, and orders from a deleted contact.
```

---

## 4. SALES

```
Audit the Sales section (reporting/aggregation) per the preamble above.

Section-specific:
- Aggregation correctness is the whole section. For every figure shown, trace the exact query or reduce that produces it and state in plain language what it counts.
- Which order statuses are included: are cancelled, refunded, and pending orders in or out of revenue? Is that consistent across every figure on the screen?
- Date bucketing: local timezone vs. UTC, day boundary definition, DST transitions, week start, "last 30 days" inclusive/exclusive endpoints. Off-by-one on range edges.
- Rounding: sum-then-round vs. round-then-sum, percentage and average calculations, division by zero on empty ranges.
- Whether aggregates are computed in Rust/SQL or in JS over a full fetch — if the latter, flag the scaling cliff and say at what row count it breaks.
- Caching/staleness: does Sales reflect an order fulfilled one second ago, and is there any invalidation on order mutation?
- Empty and sparse states: no orders at all, one order, a range with zero orders, a single-product catalog.
- Charts if present: axis starting at non-zero, misleading scale, no accessible text alternative, missing value labels, color-only encoding.
- Export if present: CSV escaping of commas/quotes/newlines in product names, encoding, currency formatting.
```

---

## 5. OUTBOX

```
Audit the Outbox section (outbound delivery queue) per the preamble above.
This section is the highest-risk surface in the app — it sends real messages to real buyers. Weight findings accordingly.

Section-specific:
- Idempotency: can one logical message send twice? Check retry, app restart mid-send, double-click, and a Tauri command that succeeds after the frontend gave up.
- Retry policy: backoff or tight loop, max attempts, whether a permanently failed message is distinguishable from a pending one, and whether a stuck "sending" state can ever clear.
- Ordering: are messages to one recipient guaranteed in-order, and does retry of an earlier message reorder it after a later one?
- signal-cli failure surfacing: exit codes and stderr parsed or ignored, error text shown to the user vs. swallowed, unwrap()/expect() on the send path (P0), timeout on a hung process, zombie processes.
- Queue persistence: does the queue survive app restart, where is it stored, is it corrupt-tolerant, is it unbounded?
- Rate limiting per recipient and overall — exists? What happens on a bulk fulfill of many orders at once?
- Cancel/dequeue: can a pending message be pulled before it sends, and is that race-free against the sender picking it up?
- Relationship to Orders and Messages: a sent outbox message should appear in the thread exactly once; check for the duplicate-on-echo case when signal-cli reports the sent message back.
- UI: does it surface enough to diagnose a failure (attempt count, last error, timestamps), and is the destructive "retry all" guarded?
- Note: Settings reportedly also monitors the delivery queue — flag the duplication and say which should own it.
```

---

## 6. AUDIT

```
Audit the Audit section (event log) per the preamble above.

Section-specific:
- Coverage: list every state-changing action in the app (order transitions, catalog edits, contact deletion, menu changes, settings changes, sends) and check which actually write an audit entry. Gaps are the primary finding class here.
- Append-only integrity: can entries be edited or deleted through any code path? Is anything in the UI or Rust layer capable of mutating history?
- Write reliability: is the audit write in the same transaction/error path as the action it records, or can the action succeed while the log write silently fails?
- Timestamps and clock source: monotonic vs. wall clock, timezone stored, ordering of entries written in the same millisecond, display timezone.
- PII: phone numbers, buyer instructions, and message bodies in log entries — is that intended, is it needed, is it exportable?
- Actor attribution: who/what performed the action (user vs. inbound buyer vs. system retry), and whether that's distinguishable.
- Scale: pagination or virtualization over a long log, full-table fetch on mount, search/filter pushed to the query or done in JS, retention/pruning policy.
- Filtering: by entity, actor, time range, event type — do filters compose, and is the count accurate?
- Navigation: can an entry link back to the entity it describes, and what happens when that entity was since deleted?
```

---

## 7. SETTINGS

```
Audit the Settings section per the preamble above.

Section-specific:
- Secrets: signal-cli account identity, any tokens or credentials — where stored, plaintext on disk or keychain, logged anywhere, rendered in the DOM, included in error messages. Any secret in plaintext or logs is a P0.
- Persistence: storage location and format, write timing (per-keystroke vs. on blur vs. explicit save), partial-write corruption, what happens on malformed config at startup.
- Schema migration: config written by an older build, unknown keys, missing keys, defaults. Does the app start or crash?
- Validation: every field — bad phone number, bad path, out-of-range number, empty required value. Is invalid input rejected at entry or accepted and then breaking a downstream section?
- Blast radius: for each setting, name which sections read it and whether they pick up a change live or only after restart. Settings that silently require a restart are a finding.
- Light-mode remnants: the app is dark-only. Any theme toggle, light token set, or ThemeContext branch still present is dead code — inventory it for removal.
- Delivery queue monitoring living here: overlap with Outbox (see that audit), which owns it, and whether both read the same source.
- Destructive actions (reset, clear data, unlink account): confirmation, irreversibility warning, what they actually delete.
- signal-cli path/version assumptions: hardcoded paths, missing-binary handling, version mismatch behavior.
```

---

## 8. RELATIONSHIPS (run last)

```
Audit the RELATIONSHIPS between sections per the preamble above, with these changes:
- Read every existing report first: tmp/messaging_audit_report.md and tmp/{people,catalog,orders,sales,outbox,audit,settings}_audit_report.md. Collect every finding marked "Crosses into" and treat those as your starting leads, not your conclusions.
- Time budget is 45 minutes, not 30: 0–10 map, 10–25 review, 25–40 test, 40–45 report.
- Report goes to tmp/relationships_audit_report.md.
- This audit outranks the section audits: if a section report proposed a local fix to something that is actually a shared-contract problem, say so explicitly and supersede it.

Nav: Messages | People | Catalog | Orders | Sales | Outbox | Audit | Settings

What to audit:

TYPE CONTRACTS
- src/api.ts is the source of truth. Diff every section's local types against it and against the Rust structs in src-tauri/. List every divergence, with the direction of drift and which layer is wrong.
- Any entity shape defined in more than one place. Any field that exists in Rust but is dropped in TS, or invented in TS.

DATA FLOW / END-TO-END TRACES
Trace each of these all the way through and report where it breaks, duplicates, or silently drops:
1. Inbound buyer message → thread appears in Messages → contact resolved or created in People → menu session state
2. Buyer navigates IVR menu → product resolved from Catalog (price + tier + availability) → order created in Orders
3. Seller fulfills in Orders → message enqueued in Outbox → sent via signal-cli → echoed into the Messages thread → order status updated → entry written in Audit → figure updated in Sales
4. Catalog price edit → in-flight orders, historical orders, and Sales totals
5. Contact deleted in People → their threads, orders, outbox items, and audit entries
6. Settings change → every section that reads it
For each trace: does every step that should write an Audit entry do so, and does any step update two stores that can disagree?

REFERENTIAL INTEGRITY
- Every cross-entity reference (order→product, order→contact, thread→contact, menu→product, outbox→order, audit→entity). For each: what happens when the target is deleted or renamed. Cascade, orphan, or crash — name which.
- Snapshot vs. live resolution for anything historical (order line items, audit entries, sales rows). Live resolution of historical data is a P0 class.

SHARED STATE AND DUPLICATION
- Every hook/context and which sections consume it. Contexts too broad (a Settings change re-rendering Orders).
- The same query implemented more than once (e.g. a contact's orders in both People and Orders). Pick the one that should survive.
- Duplicated formatting logic: money, phone numbers, dates, relative timestamps. There should be one formatter each; list every ad-hoc reimplementation.
- Duplicated status/enum mappings between TS and Rust that can silently fall out of sync.

NAVIGATION AND SHELL
- Routing/section-switch mechanism: is section state a single source of truth, does it survive reload, are deep links or back/forward supported at all?
- Per-section state on navigate away and back: selection, scroll position, filters, unsaved form state (unsaved-change loss is a finding).
- Mount/unmount cost: refetch storms on every section switch, listeners registered per section and not cleaned up, data fetched by sections that aren't visible.
- Nav itself: unread/pending badge accuracy against the underlying counts, keyboard navigation, focus moving into the section on switch, active-item affordance.

CONSISTENCY (the aesthetic half)
- Build a comparison table across all eight sections: outer padding, panel gap, row height, header treatment, empty state, loading state, error state, primary-action placement, destructive-action guard. Every inconsistency is a finding with the majority pattern named as the target.
- Hardcoded values vs. tokens, per section, counted. Which sections are worst.
- Layout primitives: which sections use the minmax() grid and the 4/8/12/16/24/32 scale and which still carry ad-hoc 1–24px spacing.

DECOMPOSITION PLAN
- App.tsx is ~3,903 lines. Propose the extraction order for decomposing it by section, ordered by (lowest coupling × highest current pain) first. For each unit: proposed path, what moves, what stays, what shared module has to be created first, and what would break.
- Name the shared modules that must exist before any section can be safely extracted (types, formatters, query layer, nav state).

Extra report sections, after Findings:
## Contract Drift Table
| Entity | Rust struct | src/api.ts | Section-local type | Divergence | Which is wrong |

## Trace Results
One block per trace above: steps, where it breaks, audit coverage, stores that can disagree.

## Consistency Matrix
The eight-section comparison table.

## Extraction Order
Ordered decomposition plan with prerequisites.

## Superseded Section Findings
Section report findings that this audit reclassifies, with the correct shared fix.
```
