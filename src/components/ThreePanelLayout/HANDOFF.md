# 3-Panel Layout Implementation Handoff

## Current State

**Scaffolded components** (starter code with TypeScript types and structure):
- `ThreePanelLayout.tsx` — Main container
- `sidebar/Sidebar.tsx` — Navigator with scopes, search, filters
- `detail/DetailView.tsx` — Dynamic detail view per scope
- `actions/ActionPanel.tsx` — Quick actions + status info
- `hooks/useThreePanel.ts` — State management hook
- `types.ts` — All TypeScript interfaces

**Your job**: Connect these pieces and implement the detailed views + styling.

---

## Priority Order (In This Order)

### 1. Add CSS/Styling (~/60 minutes)
**File**: `src/styles.css` or `src/components/ThreePanelLayout/layout.css`

Add styles for:
```css
.three-panel-layout {
  display: grid;
  grid-template-columns: 200px 1fr 200px;
  height: 100vh;
  gap: 1px;
  background: var(--border);
}

.panel {
  overflow-y: auto;
  background: var(--surface-1);
}

.panel-sidebar {
  background: var(--surface-rail);
}

.panel-detail {
  background: var(--surface-main);
}

.panel-actions {
  background: var(--surface-list);
}

/* Sidebar styles */
.sidebar-search { /* input styling */ }
.scope-section { /* collapsible section styling */ }
.scope-result-item { /* nested item styling */ }
.scope-header { /* header with arrow, icon, label, count */ }
.filter-panel { /* filters styling */ }

/* Detail view styles */
.detail-view { /* base styling */ }
.detail-empty { /* placeholder */ }
.detail-loading { /* loading state */ }
.detail-error { /* error state */ }

/* Action panel styles */
.action-panel { /* base styling */ }
.action-buttons { /* grid of buttons */ }
.action-btn { /* button styling */ }
.status-info { /* status badge + info */ }
```

Reference: Look at existing `src/styles.css` for variable names and patterns.

---

### 2. Implement Sidebar Data Flow (~/90 minutes)

**What to do**:
- Connect sidebar to real data (people, orders, messages, catalog, bot_menus)
- Implement search across all scopes (mock API or real backend)
- Populate `scopeResults` in state
- Update `scopeCounts` dynamically
- Handle scope expansion/collapse with animations

**Files to update**:
- `sidebar/Sidebar.tsx` — Add real data fetching
- `hooks/useThreePanel.ts` — Implement search + fetch logic
- Add API calls to `api.ts` or create `utils/apiCalls.ts`

**Expected behavior**:
```
1. User types "Karen" in search
2. All 5 scopes are queried in parallel
3. Results appear nested under each scope (People shows 2 matches)
4. Counts update (Messages: 2, People: 2, Catalog: 3, Orders: 1)
5. Click People scope to expand → shows Karen Smith + Karen Lee
6. Click Karen Smith → detail loads in Panel 2
```

---

### 3. Implement Detail Views (~/120 minutes)

**File**: `detail/DetailView.tsx` — Implement each placeholder function

Replace placeholder implementations with real views:

#### PeopleDetail
```
Header: Name + Type badge + Status
Metrics grid (4 cols): Lifetime | Outstanding | Orders | Messages
Sections (scrollable):
  - Recent Orders (list of order cards)
  - Recent Messages (thread list)
  - Bot Menu History (menus sent)
  - Profile Details (phone, email, address, tags, notes)
```

#### OrderDetail
```
Header: Order ID + Customer + Status badge
Metrics grid: Total | Status | Items | Payment
Sections:
  - Order Timeline (status transitions)
  - Line Items (products, qty, price)
  - Customer Info
  - Fulfillment / Tracking
```

#### CatalogDetail
```
Header: Product name + SKU + Status badge
Metrics grid: Price | Stock | Sold (lifetime) | Status
Sections:
  - Product Info (description, SKU, category, tags)
  - Pricing & Stock
  - Sell Options (variants)
  - Usage Stats
```

#### MessagesDetail
```
Header: Participant name + Thread type + Last activity
Conversation (scrollable bubbles):
  - Messages with timestamps
  - Bot menu responses as blocks
Input bar: Type message + Send button
```

#### BotMenuDetail
```
Header: Menu name + Type + Status
Sections:
  - Menu Flow (first message + options A/B/C/D)
  - Configuration (trigger, linked to)
  - Usage Stats (times shown, response rate, most selected)
  - Edit Mode button
```

**Key files to update**:
- `detail/DetailView.tsx` — Implement detail components
- May need sub-components: `detail/PeopleDetail.tsx`, `detail/OrderDetail.tsx`, etc.

---

### 4. Hook Up Detail Fetching (~/60 minutes)

**What to do**:
- When user clicks an item in sidebar, fetch its full data
- Load state shows while fetching
- Display data in detail view
- Handle errors gracefully

**Files to update**:
- `hooks/useThreePanel.ts` — Implement `onFetchData` logic
- `hooks/useThreePanel.ts` → `handleSelectItem` already calls this hook param

**Expected behavior**:
```
1. User clicks "Karen Smith" in sidebar
2. Loading indicator appears in Panel 2
3. API call: GET /people/karen-smith-id
4. Detail loads: Profile + Orders + Messages + Stats
5. Action buttons populate in Panel 3 (Message, View Orders, Send Menu, etc.)
```

---

### 5. Wire Up Action Buttons (~/90 minutes)

**What to do**:
- Each action button does something relevant
- "Message" → open compose modal or navigate to messages
- "View Orders" → fetch person's orders, display in list
- "Send Menu" → modal to choose + send bot menu
- "Edit Profile" → open edit form
- Etc. per scope

**Files to update**:
- `actions/ActionPanel.tsx` — Wire up click handlers
- `hooks/useThreePanel.ts` — Add action handling logic
- May need to add navigation/modal context

**Expected behavior**:
```
1. User clicks "Send Menu" button
2. Modal opens: "Choose a menu to send"
3. User picks "Check Order Status" menu
4. API call: POST /people/:id/send-menu { menu_id: "..." }
5. Success toast: "Menu sent to Karen Smith"
6. Menu appears in conversation
```

---

### 6. Add Scope-Specific Filters (~/90 minutes)

**What to do**:
- Filters appear below scopes (People scope shows: Type, Status)
- Clicking filter updates results
- Counts update based on filter + search

**Files to update**:
- `sidebar/FilterPanel.tsx` — Implement actual filter UI (dropdowns or buttons)
- `hooks/useThreePanel.ts` — Implement filter state + re-fetch on change

**Expected behavior**:
```
1. User searches "Karen" (results: 2 people, 3 catalog, 1 order)
2. User clicks "Type: Supplier" in filters (People section)
3. People results narrow to suppliers only named Karen (1 result)
4. People count updates: People (1) instead of (2)
5. Click filter again to remove it
```

---

### 7. Responsive Design (~/45 minutes)

**What to do**:
- Desktop (1600px+): All 3 panels visible
- Tablet (1024px): Panels shrink, still visible
- Mobile (< 1024px): Tabs to switch between panels

**Files to update**:
- `layout.css` or `styles.css` — Add media queries
- May need small "Tab" component to switch panels on mobile

---

### 8. Polish & Bug Fixes (~/60 minutes)

- Test all scopes (People, Messages, Orders, Catalog, Bot Menus)
- Test search + filters together
- Test action buttons
- Handle edge cases (empty state, loading, errors)
- Scroll behavior
- Animations for expand/collapse

---

## File Structure Summary

```
src/components/ThreePanelLayout/
├── ThreePanelLayout.tsx          [DONE]
├── types.ts                       [DONE]
├── index.ts                       [DONE]
├── HANDOFF.md                     [YOU ARE HERE]
│
├── sidebar/
│   ├── Sidebar.tsx               [DONE - needs data]
│   ├── SidebarSearch.tsx          [DONE]
│   ├── ScopeSection.tsx           [DONE]
│   └── FilterPanel.tsx            [DONE - needs UI]
│
├── detail/
│   └── DetailView.tsx             [DONE - needs implementation]
│
├── actions/
│   └── ActionPanel.tsx            [DONE - needs handlers]
│
├── hooks/
│   └── useThreePanel.ts           [DONE - needs API calls]
│
└── layout.css                     [TODO]
```

---

## Important Notes

### TypeScript Types
All types are pre-defined in `types.ts`. Use them!

```typescript
import { Person, Order, Product, BotMenu, Message, Scope } from "./types";
```

### State Management
The `useThreePanel` hook manages all state. Don't create additional state hooks unless necessary.

### API Integration
When you need to fetch data, add API calls. Check `src/api.ts` for existing patterns:
```typescript
const res = await api.getPeople(); // or whatever the pattern is
```

### Styling
Keep styles minimal at first. Use existing CSS variables:
- `--surface-rail`, `--surface-list`, `--surface-main` for panel backgrounds
- `--text`, `--text-dim` for text
- `--border` for dividers
- `--accent` for highlights

---

## Testing Checklist

Before declaring "done":

- [ ] Search works for all 5 scopes
- [ ] Scopes expand/collapse smoothly
- [ ] Clicking an item loads its detail
- [ ] Detail view shows correct data per scope
- [ ] Action buttons appear + are clickable
- [ ] Filters narrow results correctly
- [ ] No console errors
- [ ] Responsive on mobile/tablet
- [ ] Loading states work
- [ ] Error states work
- [ ] Empty state works

---

## Questions Before Starting?

If anything is unclear, clarify with Claude before starting. The blueprint is solid; now it's just implementation.

**Start with #1 (Styling), then follow the priority order above.**

Good luck! 🚀
