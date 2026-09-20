# SignalX Comprehensive Code Audit — September 20, 2026

**Scope:** 9 section audits + relationships synthesis. Full vertical slice coverage: UI → state → API → Tauri → Rust → persistence.

**Duration:** ~3.5 hours (30 min × 7 sections + 45 min relationships + setup/synthesis)

**Reports Location:** `/Users/cameroncohen/Developer/projects/SignalX/docs/audit-09-20/`

---

## Report Index

### Individual Section Audits (1–8)

| Section | Findings | Risk Level | Key Issue | Report |
|---------|----------|-----------|-----------|--------|
| **Messaging** | 10 | Medium | No optimistic send; IME composition bug; scroll to bottom missing | [messaging_audit_report.md](messaging_audit_report.md) |
| **People** | 20 | Medium-High | Deletion orphans threads; phone format duplicates; notes fragmentation | [people_audit_report.md](people_audit_report.md) |
| **Catalog** | 12 | Medium | Price validation broken; product deletion allowed with open orders | [catalog_audit_report.md](catalog_audit_report.md) |
| **Orders** | 12 | Low | State machine sound; minor edge cases on unknown status | [orders_audit_report.md](orders_audit_report.md) |
| **Sales** | 13 | Low | Aggregation correct; staleness edge case (manual refresh needed) | [sales_audit_report.md](sales_audit_report.md) |
| **Outbox** | 6 | **HIGH** | **P0: Message ID collision on fast sends; store update race after send** | [outbox_audit_report.md](outbox_audit_report.md) |
| **Audit** | 10 | Medium | 80% coverage gap; silent write failures; PII exposure | [audit_audit_report.md](audit_audit_report.md) |
| **Settings** | 13 | Low | No P0 issues; keystroke saves; IVR reset unconfirmed | [settings_audit_report.md](settings_audit_report.md) |

### Cross-Section Synthesis (9)

| Title | Key Findings | Report |
|-------|--------------|--------|
| **Relationships & Type Contracts** | 11 critical cross-section issues; type drift (ContactMeta vs GroupMeta); referential integrity gaps; decomposition plan for App.tsx extraction | [relationships_audit_report.md](relationships_audit_report.md) |

---

## Top 10 Findings by Priority

### P0 (Immediate — Affects Real Messages)
1. **Outbox message ID collision** — Two messages in same millisecond to same recipient deduplicated as duplicates (Outbox #1)
2. **Outbox store failure race** — Item marked "sent" but stored as "sending"; resends on restart (Outbox #2)
3. **Message content XSS risk** — No sanitization on message body or contact names (Messaging #5)

### P1 (High Impact — User-Visible)
4. **Enter key in IME composition** — CJK input fires send prematurely (Messaging #2)
5. **No optimistic send feedback** — Composer clears before server ack; confusing on slow networks (Messaging #1)
6. **Audit coverage gap** — Contact/product/IVR deletion unaudited (Audit #1)
7. **Message list doesn't scroll to bottom** — New messages land invisibly (Messaging #4)
8. **Contact deletion orphans threads** — No cleanup of messages/outbox (People #1)
9. **Auto-reply PII in audit logs** — Unredacted drafts with buyer instructions (Audit #2)
10. **Product deletion allows open orders** — Breaks historical order tracking (Catalog #3)

---

## Risk Assessment

| Risk Tier | Count | Sections | Recommended Action |
|-----------|-------|----------|-------------------|
| **Critical** (P0–P1) | 10 | Messaging, Outbox, Audit, People, Catalog | Fix this sprint — affects real users & data |
| **High** (P2) | 15 | People, Catalog, Outbox, Audit, Settings, Sales | Fix this quarter — robustness & consistency |
| **Medium** (P3) | 8 | Messaging, Catalog, Outbox, Settings | Backlog — minor UX & edge cases |

**Total findings across all audits:** 96

---

## Shared Modules Needed Before Refactoring

(From Relationships audit extraction plan)

1. **QueryLayer** — Unified API for all sections (replace current scattered `.then()` chains)
2. **Event System** — Typed event subscriptions (replace current loose `onEvent()` pattern)
3. **NavState** — Persistent routing with deep links (replace useState panel)
4. **Formatters** — Shared functions (phone, money, dates, timestamps)
5. **Types** — Single source of truth (audit & enforce against Rust structs)

---

## Extraction Roadmap (Relationships Audit)

**Lowest coupling × highest current pain → extract first:**

1. **Catalog/Products** (2–3h) — No cross-references, self-contained UI
2. **Sales** (2–3h) — Read-only aggregation, no mutations
3. **Orders** (4–5h) — Depends on Catalog; medium coupling
4. **Settings** (2–3h) — Isolated state, few listeners
5. **Audit** (2–3h) — Read-only log, no side effects
6. **People** (4–6h) — Order/thread references; create ContactQueryLayer
7. **Outbox** (3–4h) — Highest risk; leave last to stabilize first
8. **Messaging** (4–6h) — Core; requires all shared modules ready

**Total effort to decompose:** 23–31 hours (phased, ~1 week)

---

## How to Use These Reports

**For immediate action:**
1. Read [relationships_audit_report.md](relationships_audit_report.md) **Summary** section (2 min) for cross-section context
2. Scan the **Top 10 Findings** table above to prioritize
3. Dive into section reports by priority (Outbox → Messaging → People → Catalog)
4. Use each report's **Action List** (Fix now / Fix this week / Backlog) to scope sprints

**For architecture:**
1. Review the **Extraction Order** in [relationships_audit_report.md](relationships_audit_report.md)
2. Create shared modules (QueryLayer, Event system) before extracting any section
3. Expect 23–31 hours total; phase over 1 month to avoid regression

**For code review:**
- Compare each finding's **Fix** section against proposed PRs
- Check that cross-section findings are resolved in Relationships report, not just section reports
- Verify no findings are superseded (marked in Relationships report)

---

## Notes

- **No existing tests:** Audit added Vitest fixtures but created no persistent test suite. Recommend adding one per section.
- **Light-mode code:** Dead code flagged in Catalog, Settings, possibly others. Cleanup opportunity.
- **Dark-only assumption:** App is dark-only; all light-mode tokens are unused.
- **Monolithic App.tsx:** ~3,903 LOC; decomposition plan provided in Relationships report.
- **Rust unit tests:** 60+ in src-tauri/; all passing baseline before audit.

---

**Report generated:** September 20, 2026  
**Auditors:** Claude (Haiku 4.5)  
**Effort:** ~3.5 hours active audit work  
**Status:** Read-only. Do not commit or begin fixes until review complete.
