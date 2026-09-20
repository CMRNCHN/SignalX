# People Section (Contacts) Audit Report
**Date**: 2026-09-20  
**Scope**: People/Contacts UI, state management, data models  
**Repository**: /Users/cameroncohen/Developer/projects/SignalX

## Summary

The People section provides a 2-panel directory of contacts, groups, and customers with order history, notes, preferences, and action items. The audit found **20 distinct issues** spanning data model inconsistency (notes field asymmetry), phone number handling (weak E.164 validation, duplicate risk), contact deletion (orphaned threads), CSV export omissions, and UX gaps (contact-thread linking, preference redundancy). Two issues are high-priority: the Customer-based notes system creating optional notes for contacts, and contact deletion leaving orphaned threads. Most remaining issues are low-risk but represent maintenance and consistency problems.

## Vertical Slice Inventory

### Entry Points and Navigation
- **People nav item** (App.tsx) → PeopleScreen component
- **Contact form** (PeopleScreen.tsx:525-574): "Add a person" creates contact via normalizePhoneInput + setContactMeta
- **Group form** (PeopleScreen.tsx:553-573): "Create a group" via createSignalGroup

### Data Flow
1. **Fetch**: App.tsx calls `api.listContactMeta()`, `api.listGroupMeta()`, `api.listCustomers()`, `api.listOrders()` on mount and refresh
2. **Build**: `buildDirectory(contacts, groups, customers, threads, orders)` merges all sources → Person[]
3. **Display**: PeopleScreen filters and sorts Person[] → visible list → detail panel
4. **Mutations**:
   - Favorites/muted: `api.setContactMeta()` or `api.setGroupMeta()`
   - Notes: `api.upsertCustomer()` (contacts) or `api.setGroupMeta()` (groups)
   - Delete: `api.deleteContactMeta()` + `api.deleteCustomer()` (contacts)
   - Archive: localStorage `signalx.archived` (local only, not persistent to backend)

### Type Definitions
- **ContactMeta** (api.ts:138-147): `contact_id`, `display_name`, `alias`, `categories[]`, `favorite`, `muted`, `auto_reply_enabled`, `updated_at`
  - **No notes field**
- **GroupMeta** (api.ts:149-158): `group_id`, `display_name`, `categories[]`, `favorite`, `muted`, `auto_reply_enabled`, `notes`, `updated_at`
  - **Has notes field**
- **Customer** (api.ts:343-349): `id`, `thread_id`, `display_name`, `notes`, `updated_at`
  - Notes stored separately; not tied to contact_id directly
- **ThreadSummary** (api.ts:34-43): `id`, `participants[]`, `last_message_timestamp`, `unread_count`, `message_count`, `outbox_count`, `last_preview`

### Rust Backend (src-tauri/src/lib.rs)
- **contact_store**: File-based JSON storage per account; `list()`, `get()`, `upsert_patch()`, `delete()`
- **normalize_contact_id()** (line 1561): Adds "dm:" prefix to raw phone numbers; no E.164 validation
- **discover_peer_names()** (line 1000): Extracts names from message metadata for auto-learning

---

## Test Results

No test infrastructure exists in the codebase (no package.json test scripts, no .test.ts files, no vitest/jest config). Manual static analysis only.

---

## Findings

### 1. Data Model: Notes Field Asymmetry
**Category**: Bug — Data Model  
**File**: `src/api.ts:138-158`, `src/components/People/people.ts:119-120, 160`  
**What**: ContactMeta lacks a notes field; GroupMeta includes one. Contact notes are stored in the Customer record instead, making them optional (only exist if a Customer record is created).  
**Evidence**:
- ContactMeta (lines 138-147): no `notes` field
- GroupMeta (lines 149-158): includes `notes?: string | null`
- buildDirectory() (people.ts:119): `notes: customer?.notes ?? ""`
- buildDirectory() (people.ts:160): `notes: (g.notes || "").trim()`
- Groups store notes in GroupMeta; contacts defer to Customer

**Impact**: Contacts can have notes but only if a Customer record exists. Deleting a Customer orphans the notes. Two-tier storage is confusing and increases maintenance burden.

**Fix Effort**: Medium (requires schema migration and API adjustment)  
**Risk**: Medium — notes loss if Customer record deleted; inconsistent contract

---

### 2. Phone Normalization: Weak E.164 Validation
**Category**: Bug — Phone Number Handling  
**File**: `src/App.tsx:278-284`  
**What**: `normalizePhoneInput()` accepts phone numbers with only 7-15 digits and a `+` prefix, without validating E.164 country code ranges.  
**Evidence**:
```typescript
function normalizePhoneInput(raw: string): string | null {
  const digits = raw.trim().replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) return null;
  const rest = digits.slice(1);
  if (rest.length < 7 || rest.length > 15 || !/^\d+$/.test(rest)) return null;
  return `+${rest}`;
}
```
- Accepts 7-digit numbers (e.g., `+1234567`) which are invalid for most regions
- No country code validation
- E.164 standard is typically 10–15 digits (depends on country)

**Impact**: Invalid phone numbers can be added; will be stored and displayed as-is.

**Fix Effort**: Low (add min/max bounds closer to E.164 spec)  
**Risk**: Low — invalid numbers are visible in UI, so error is discoverable

---

### 3. Phone Format Variance: Duplicate Contact Risk
**Category**: Bug — Phone Matching  
**File**: `src-tauri/src/lib.rs:1561-1571` (normalize_contact_id), `src/App.tsx:1270`  
**What**: Phone numbers are normalized to `dm:+E164` format in the backend, but users can add the same contact in different formats (e.g., `+1234567` and `1234567`), creating duplicate contact records.  
**Evidence**:
- `addContact()` calls `setContactMeta(dm:${phone}, ...)` where phone is already normalized
- Backend `normalize_contact_id()` adds `dm:` to raw numbers but doesn't deduplicate existing variants
- Example: User A adds `+15551234567`, User B adds `15551234567` → two ContactMeta records

**Impact**: Duplicate contacts in the directory; split metadata (favorite, muted, notes).

**Fix Effort**: Low (deduplicate on create/add)  
**Risk**: Medium — users see duplicate rows; confusion and fragmented state

---

### 4. Contact Deletion: Orphaned Threads
**Category**: Bug — Data Integrity  
**File**: `src/components/People/PeopleScreen.tsx:295-310`  
**What**: `deletePerson()` deletes ContactMeta and Customer record but leaves ThreadSummary, messages, and outbox items intact. A deleted contact's thread remains accessible.  
**Evidence**:
```typescript
const deletePerson = async (p: Person) => {
  if (p.kind !== "contact") return;
  const res = await api.deleteContactMeta(p.key);
  if (!res.success) {
    setStatus(res.error);
    return;
  }
  if (p.customerId) await api.deleteCustomer(p.customerId);
  // No cleanup of: ThreadSummary, messages, outbox items
  const next = new Set(archived);
  next.delete(p.key);
  persistArchived(next);
  setConfirmDelete(null);
  onSelectKey(null);
  setStatus(`Deleted ${p.name}`);
  onRefresh();
};
```

**Impact**: Orphaned threads; users can still open the thread and send/receive messages to the deleted contact.

**Fix Effort**: Medium (clean up threads and messages on delete)  
**Risk**: High — referential integrity violation; silent data inconsistency

---

### 5. CSV Export: Notes Omitted
**Category**: Missing Feature — Data Export  
**File**: `src/components/People/PeopleScreen.tsx:312-336`  
**What**: `exportCsv()` exports name, subtitle, type, orders, lifetime_cents, open_cents, and tags, but **excludes notes**.  
**Evidence**:
```typescript
const exportCsv = () => {
  const head = "name,subtitle,type,orders,lifetime_cents,open_cents,tags\n";
  const body = directory
    .map((p) =>
      [
        JSON.stringify(p.name),
        JSON.stringify(p.subtitle),
        p.type,
        p.orderCount,
        p.lifetimeCents,
        p.openCents,
        JSON.stringify(p.tags.join(" ")),
      ].join(","),
    )
    .join("\n");
  // Notes are not included
};
```

**Impact**: Notes data is lost when exporting directory; users must re-enter notes if importing elsewhere.

**Fix Effort**: Low (add notes column to CSV)  
**Risk**: Low — feature gap; no data loss in app

---

### 6. Contact-Thread Linking: No Thread = No Chat
**Category**: Bug — Missing Fallback  
**File**: `src/components/People/people.ts:95`  
**What**: If no ThreadSummary exists for a contact, `threadId` falls back to `contact_id` (e.g., `dm:+1234567`). Opening chat with a non-existent thread ID may fail silently.  
**Evidence**:
```typescript
threadId: thread?.id ?? c.contact_id,
```
- If contact has no messages yet, `threadFor()` returns undefined
- threadId becomes contact_id instead of a valid thread ID
- "Open chat" button uses this threadId; outcome depends on Tauri handler

**Impact**: New contacts with no message history may not open chat correctly.

**Fix Effort**: Low (ensure thread creation on "Open chat" or pre-create on add)  
**Risk**: Medium — silent failure; user clicks button, nothing happens

---

### 7. Contact Without Display Name: UX Friction
**Category**: UX Issue  
**File**: `src/components/People/PeopleScreen.tsx:690-776`  
**What**: Contacts can exist with no display name or alias, falling back to formatted phone number. The UI shows an "Unnamed" warning and offers an inline input to add a name, but this is a friction point.  
**Evidence**:
- Line 97 (people.ts): `name: (c.display_name || c.alias || "").trim() || formatPhone(c.contact_id)`
- Line 690 (PeopleScreen.tsx): `selected.name === selected.subtitle && selected.kind === "contact"` triggers "Unnamed" warning
- Line 693–707: Shows inline input to add name via blur event

**Impact**: Users see "Unnamed — this is just a number" warning; minor friction on first view.

**Fix Effort**: Low (add name during contact creation)  
**Risk**: Low — UX friction only; functionality works

---

### 8. Filter Redundancy: Favorite as Tag and Preference
**Category**: UX Inconsistency  
**File**: `src/components/People/people.ts:105-108`, `src/components/People/PeopleScreen.tsx:462-472, 842-845`  
**What**: "favorite" status appears both as a tag (filterable via tag menu) and as a dedicated "Favourite" toggle in the Preferences section. Two UI paths do the same thing.  
**Evidence**:
- people.ts line 107: `...(c.favorite ? ["favorite"] : [])`
- PeopleScreen.tsx line 462–472: Favorite appears in tag filter menu
- PeopleScreen.tsx line 842–845: Separate "Favourite" toggle button in Preferences
- Both toggle `favorite` via `patchPerson()`

**Impact**: User confusion; redundant UI control.

**Fix Effort**: Low (remove favorite from tags array)  
**Risk**: Low — no data loss; cosmetic only

---

### 9. Missing Keyboard Navigation
**Category**: UX Gap  
**File**: `src/components/People/PeopleScreen.tsx:577-650`  
**What**: People list (`.people-list`) has no keyboard navigation. Users cannot navigate with arrow keys or select with Enter.  
**Evidence**:
- `.person-card` buttons (line 594) have no `onKeyDown` handler
- No focus trap or navigation loop
- Tab key works but arrow keys do not

**Impact**: Less efficient navigation for keyboard users; accessibility gap.

**Fix Effort**: Medium (add arrow key handlers)  
**Risk**: Low — nice-to-have; mouse/touch works

---

### 10. Archive State Not Synced
**Category**: Architecture Note — Known Gap  
**File**: `src/components/People/PeopleScreen.tsx:162-178`  
**What**: Archive state is stored in `localStorage` only, not in the backend. Archive doesn't sync across devices or tabs.  
**Evidence**:
- Line 165: `localStorage.getItem("signalx.archived")`
- Line 174: `localStorage.setItem("signalx.archived", ...)`
- Comment (lines 161–162): "The backend has no archive column, so this is a local hide-list."

**Impact**: Archive state is device-local; private browsing loses state.

**Fix Effort**: Medium (add archive column to backend)  
**Risk**: Low — intentional design decision; documented

---

### 11. Incomplete Phone Formatting: Non-US Numbers
**Category**: Cosmetic Issue — Phone Display  
**File**: `src/format.ts:57-64`  
**What**: `formatPhone()` only formats 10-digit US numbers as `(XXX) XXX-XXXX`. International numbers display as raw E.164.  
**Evidence**:
```typescript
const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
if (local.length !== 10) return v;  // Non-US numbers skip formatting
return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
```
- E.164 numbers like `+442071838750` display unformatted
- Only US numbers get `(XXX) XXX-XXXX` treatment

**Impact**: Inconsistent display; non-US numbers look "raw."

**Fix Effort**: Low (add intl-tel-input library or locale-aware formatting)  
**Risk**: Low — cosmetic only; functionality works

---

### 12. Notes Saving: Inconsistent Code Path
**Category**: Maintenance Issue  
**File**: `src/components/People/PeopleScreen.tsx:261-280`  
**What**: `saveNotes()` uses different APIs for contacts (upsertCustomer) and groups (setGroupMeta), reflecting the data model asymmetry.  
**Evidence**:
```typescript
const saveNotes = async (p: Person) => {
  if (notesDraft === null) return;
  const res =
    p.kind === "group"
      ? await api.setGroupMeta(p.key, { notes: notesDraft })
      : await api.upsertCustomer({
            id: p.customerId ?? "",
            thread_id: p.threadId,
            display_name: p.name,
            notes: notesDraft,
            updated_at: Date.now(),
          });
  ...
};
```

**Impact**: Maintenance burden; notes semantics differ; potential for bugs if contract changes.

**Fix Effort**: Low (cosmetic refactor once data model fixed)  
**Risk**: Low — works correctly but confusing

---

### 13. Customer Matching: Potential Mismatch
**Category**: Bug Risk — Data Consistency  
**File**: `src/components/People/people.ts:81-82`  
**What**: Contact-to-customer matching uses `stripThreadPrefix()` on both sides, which could match different formats if both exist in the database.  
**Evidence**:
```typescript
const customer = customers.find(
  (x) => stripThreadPrefix(x.thread_id) === stripThreadPrefix(c.contact_id),
);
```
- If database has Customer with `thread_id = "dm:+1234567"` and Contact with `contact_id = "+1234567"`, they match
- No validation that the match is unique

**Impact**: Notes could be linked to the wrong contact if variant formats exist.

**Fix Effort**: Low (enforce consistent format on load)  
**Risk**: Medium — rare but possible; data corruption

---

### 14. Message Fetch: Fixture Fallback in Production
**Category**: Test Code Path  
**File**: `src/components/People/PeopleScreen.tsx:232-237`  
**What**: If `api.getThreadMessages()` fails and `USE_FIXTURES` is true, the component shows fixture data (fxMessages) instead of empty state.  
**Evidence**:
```typescript
const res = await api.getThreadMessages(selected.threadId);
const live = res.success ? res.data : [];
const rows = live.length
  ? live
  : USE_FIXTURES
    ? fxMessages.filter((m) => m.thread_id === selected.threadId)
    : [];
```

**Impact**: User sees fixture data that doesn't belong to their account if API fails in dev mode.

**Fix Effort**: Low (remove fixture fallback or gate behind dev flag)  
**Risk**: Low — only affects dev; USE_FIXTURES should be false in production

---

### 15. Unread Count Derivation: Zero Fallback
**Category**: Logic Issue  
**File**: `src/components/People/people.ts:86-87`  
**What**: If ThreadSummary is missing, unreadCount and pendingCount default to 0 instead of being recalculated from messages/outbox.  
**Evidence**:
```typescript
const unreadCount = thread?.unread_count ?? 0;
const pendingCount = thread?.outbox_count ?? 0;
```

**Impact**: Person card could show "0 unread" even if messages exist but ThreadSummary wasn't fetched yet.

**Fix Effort**: Low (add fallback count)  
**Risk**: Low — ThreadSummary should always exist; eventual consistency

---

### 16. Muted Tag in Filter
**Category**: UX Inconsistency  
**File**: `src/components/People/people.ts:108`  
**What**: "muted" status is added to tags (line 108), making it filterable like other tags, but the UI doesn't have a dedicated "Muted" filter button in the toolbar.  
**Evidence**:
```typescript
tags: [
  ...cats.filter((t) => t !== "supplier"),
  ...(c.favorite ? ["favorite"] : []),
  ...(c.muted ? ["muted"] : []),  // Line 108: muted in tags
]
```
- "muted" appears in tag filter menu (line 462–472)
- "muted" has dedicated Preferences toggle (line 849–852)
- But UI doesn't highlight if "muted" tag filter is active

**Impact**: Minor UX confusion; tag filtering works but is not discoverable.

**Fix Effort**: Low (add visual indicator for muted filter)  
**Risk**: Low — cosmetic only

---

### 17. Search Implementation: Unused Backend API
**Category**: Unused Code  
**File**: `src/api.ts:465-468`  
**What**: `api.searchContacts()` and `api.searchGroups()` are defined but never called by PeopleScreen. Only local filtering is used.  
**Evidence**:
- api.ts lines 465–468: `searchContacts()` and `searchGroups()` wrappers defined
- PeopleScreen.tsx: Uses local string matching (line 203) instead of calling backend search
- Backend search behavior is untested

**Impact**: Backend search code exists but is unmaintained; unclear if it works correctly.

**Fix Effort**: Low (document or remove unused APIs)  
**Risk**: Low — works as-is; dead code

---

### 18. Visible List Sorting: Locale-Aware
**Category**: Logic Check  
**File**: `src/components/People/PeopleScreen.tsx:206-207`  
**What**: Visible list is sorted using `name.localeCompare()`, which is correct for alphabetical sorting but may differ from sort order in database/backend.  
**Evidence**:
```typescript
return rows.sort((a, b) =>
  sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
);
```

**Status**: No issues found. Implementation is correct.

---

### 19. Selection Persistence: Stale After Delete
**Category**: Minor UX Bug  
**File**: `src/components/People/PeopleScreen.tsx:211-214`  
**What**: If detail panel is viewing a contact and it gets deleted/archived elsewhere, `selectedKey` becomes stale. The next refresh sets detail panel to null (correct behavior) but could cause visual flicker.  
**Evidence**:
```typescript
const selected = useMemo(
  () => directory.find((p) => p.key === selectedKey) ?? null,
  [directory, selectedKey],
);
```
- `deletePerson()` calls `onSelectKey(null)`, so deletion is handled correctly
- But if data changes due to archive/unarchive, detail panel switches on refresh

**Impact**: Minor visual flicker when viewing archived contact and list refreshes.

**Fix Effort**: Low (add transition or guard)  
**Risk**: Low — UX polish only

---

### 20. Empty State: No Directory Count
**Category**: UX Gap  
**File**: `src/components/People/PeopleScreen.tsx:655-677`  
**What**: When no contact is selected, the detail panel shows directory summary (unread, need attention, outstanding, lifetime) but no message if the directory is empty.  
**Evidence**:
- Line 578–580: Shows "No one matches these filters" in list if visible.length === 0
- Line 655–677: Shows summary in detail panel even if directory is empty (no message about empty state)

**Impact**: Unclear feedback if user has zero contacts; summary shows "0 people."

**Fix Effort**: Low (add message: "Add your first contact to get started")  
**Risk**: Low — minor UX polish

---

## Action List

### High Priority
1. **Fix contact deletion to clean up threads/messages** (Finding 4)
2. **Unify notes storage: Add notes field to ContactMeta** (Finding 1)

### Medium Priority
3. **Deduplicate contacts on add to prevent format variance** (Finding 3)
4. **Add pre-thread creation on "Open chat" or ensure chat handles missing thread** (Finding 6)
5. **Include notes column in CSV export** (Finding 5)
6. **Fix customer matching to avoid variant format collisions** (Finding 13)

### Low Priority
7. Tighten E.164 validation in normalizePhoneInput (Finding 2)
8. Remove favorite from tags array (redundancy) (Finding 8)
9. Add keyboard navigation to people list (Finding 9)
10. Clean up fixture fallback in message fetch (Finding 14)
11. Add intl-tel-input for phone formatting (Finding 11)
12. Document or remove unused searchContacts/searchGroups APIs (Finding 17)
13. Add visual indicator for muted tag filter (Finding 16)
14. Add empty state message to detail panel (Finding 20)
15. Add transition/guard to prevent detail panel flicker (Finding 19)

---

## Deliberately Not Changed

- **Archive stored in localStorage**: Intentional design; documented as known gap. Backend doesn't have archive column.
- **Filter AND composition**: Intentional; UI design is clear and correct.
- **Groups vs. Contacts symmetry**: Notes in GroupMeta but not ContactMeta is a design choice; fixing it requires schema migration.
- **US-centric phone formatting**: Acceptable trade-off; non-US numbers display correctly, just unformatted.

---

## Open Questions

1. **Should contact deletion delete threads and messages, or keep them archived?** Current behavior allows reopening deleted contact; design intent is unclear.
2. **Is searchContacts() used anywhere, or is it dead code?** Backend search is untested and unused by PeopleScreen.
3. **Should archive state sync to backend for multi-device support?** Currently local-only; design decision unclear.
4. **What is the intent for contacts without a display name?** "Unnamed" warning suggests they should have names, but add flow doesn't require name input.

---

## Notes for Future Reference

- Test infrastructure is absent; no tests exist for People section
- USE_FIXTURES dev flag is active in codebase; ensure it's false in production builds
- Phone normalization is permissive (7-15 digits); stricter E.164 validation recommended
- Thread creation logic should be reviewed; contact-thread link assumes thread always exists
- Notes are optional for contacts (only if Customer record); consider making mandatory
