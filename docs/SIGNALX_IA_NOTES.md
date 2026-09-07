# SignalX — IA & UX Notes

Observations from the running app (2026-09-07). Split into fixes that land on `spacing-fix` now, and structural changes that need their own phase.

---

## The root pattern

Every list screen opens with a **creation form**, pushing the actual content below the fold:

| Screen | Opens with | Should open with |
|---|---|---|
| Contacts | "Create new contact" form | The contact list |
| Groups | "Create group" form | The group list (currently "No groups yet") |
| Catalog | "New product — Basic details" (3 card sections) | The product list |

Creation is an occasional action. Listing is the constant one. Every one of these should be a button in the panel header that opens a drawer, modal, or inline row — not a permanently expanded form.

This single change fixes the Contacts, Groups, and Catalog complaints together.

---

## Cheap fixes — do these on `spacing-fix`

### 1. Creation forms behind a button

Panel header gets a `+` or "New contact" / "New group" / "Add product" button. Form opens as a drawer or modal. List renders immediately on screen load.

Catalog specifically: the list already exists below the form (T-Ball, $150.00, 10 ea left). Just reorder and collapse the form.

### 2. Filters: vertical checkboxes → inline chips

Currently three stacked checkbox rows (Favorites / Hide muted / Auto-reply 6/6) eating ~90px of vertical space with a huge label gap.

Make them toggle chips on the same row as the filter input:

```
[ Filter contacts…        ]  ( Favorites ) ( Hide muted ) ( Auto-reply 6/6 )
```

Same treatment on Contacts and Groups. Matches the All / Unread / Needs send chips already used in Messages — consistency for free.

### 3. Kill the quick-actions grid

The centered 2×2 grid (Messages / Catalog / Orders / Customers) with "Select a thread, or jump to a quick action" is the Messages empty state, rendering on every screen. On Contacts and Groups the copy is simply wrong.

Replace with a per-screen empty state: one line of text, and at most one contextual action. The sidebar already handles navigation — the grid duplicates it.

### 4. Settings dead space

One narrow column in a wide window. Flow the cards into a responsive grid:

```css
grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
gap: 1rem;
```

Tab bar stays full width above it.

### 5. Minimum window width — not fullscreen

Forced fullscreen fights macOS window management and doesn't address the actual problem (content not filling available width). Instead, in `src-tauri/tauri.conf.json`:

```json
"minWidth": 1100,
"minHeight": 700
```

Below ~1100px the 4-panel layout can't breathe. Above it, `minmax()` handles the rest.

### 6. Settings icon

Currently a sun/asterisk. Should be a gear. Every other nav icon reads correctly.

---

## Structural — needs its own phase

### Sidebar: 11 items → 6

Current: Messages, Search, Contacts, Groups, Catalog, Customers, Orders, Sales, Outbox, Auto-reply log, Settings.

Overlaps:

| Items | Relationship | Proposal |
|---|---|---|
| Contacts + Customers | Different backends (`ContactMeta` vs `Customer`), same real-world entity | Merge into **People** with a role filter |
| Contacts + Groups | Groups are threads with >1 participant | Groups becomes a filter in People or Messages |
| Orders + Sales | Sales reports on Orders | Sales becomes a tab inside Orders |
| Outbox + Auto-reply log | Both are "what the system did or will do" | Merge into **Activity** with tabs |
| Search | Cross-cutting, not a destination | ⌘K palette |

Result: **Messages · People · Catalog · Orders · Activity · Settings**

### People, in detail

One screen, one list, a role filter: Customer / Supplier / Team / Other.

Detail pane composes both stores:
- Always: display name, number, categories, favorite, muted, auto-reply — from `ContactMeta`
- When a customer record exists: notes, balance, order history — from `Customer`

This matches how you actually think about it — everyone in the directory is a counterparty of some kind — and stops two backend tables from dictating two nav items.

**Note:** roles are not currently a backend concept. `ContactMeta.categories: string[]` already holds arbitrary tags ("incense cones buyer", "Saturday pickup"), so roles could ride on categories with a reserved prefix, or get their own field. Decide before building.

### Catalog: view vs edit

Catalog should default to browsing. Editing is a mode you enter on a selected product, not the default state of the screen. Same list/detail pattern as everything else.

---

## Sequencing

Fixes 1–6 are presentation-layer and belong on `spacing-fix` alongside the Tailwind sweep. Nothing there touches types or data flow.

The sidebar collapse and People merge touch data composition across two stores. That's Phase 3 work, after `App.tsx` is decomposed — merging screens inside a 3,900-line file is how you get a 4,500-line file.
