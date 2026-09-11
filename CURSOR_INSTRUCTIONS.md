# Cursor Instructions: Implement Search Functionality

**Branch**: `feat/search-functionality`

**Goal**: Wire up the 3-panel layout with real search functionality across all 5 scopes.

**Estimated time**: 7 hours

---

## Context

The 3-panel layout scaffolding is complete and on `main`:
- **Panel 1 (Sidebar, 200px)**: Navigator with collapsible scopes
- **Panel 2 (Center)**: Detail view that displays full information
- **Panel 3 (Right, 200px)**: Quick action buttons

All TypeScript types, component structure, and state management hooks are ready. You're implementing the meat: search, data fetching, detail views, actions.

**Reference**: Read `src/components/ThreePanelLayout/HANDOFF.md` for the full breakdown. This document is the summary.

---

## Your Task: Implement Search in 8 Steps

### Step 1: Add CSS/Styling (60 min)

**File**: `src/components/ThreePanelLayout/layout.css` (create new)

Create styles for the 3-panel grid layout:

```css
.three-panel-layout {
  display: grid;
  grid-template-columns: 200px 1fr 200px;
  height: calc(100vh - 60px); /* Account for header */
  gap: 1px;
  background: var(--border);
}

.panel {
  overflow-y: auto;
  background: var(--surface-1);
  padding: 16px;
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

/* Sidebar */
.sidebar-search input {
  width: 100%;
  height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text);
}

.scope-section {
  margin-bottom: 16px;
}

.scope-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 120ms ease;
}

.scope-header:hover {
  background: var(--surface-3);
  border-color: var(--border-strong);
}

.scope-header.selected {
  background: var(--surface-3);
  border-color: var(--accent);
  color: var(--text);
}

.scope-caret {
  width: 12px;
  display: inline-block;
}

.scope-icon {
  font-size: 14px;
}

.scope-label {
  flex: 1;
}

.scope-count {
  font-size: 10px;
  opacity: 0.6;
}

.scope-results {
  margin-top: 4px;
  margin-left: 12px;
  border-left: 1px solid var(--border);
  padding-left: 8px;
}

.scope-result-item {
  display: block;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  background: var(--surface-1);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 10px;
  margin-bottom: 4px;
  transition: all 120ms ease;
}

.scope-result-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.scope-result-item.active {
  background: var(--surface-3);
  border-color: var(--accent);
  color: var(--text);
  font-weight: 500;
}

.result-item-name {
  font-weight: 500;
}

.result-item-subtitle {
  font-size: 9px;
  opacity: 0.6;
  margin-top: 2px;
}

/* Detail View */
.detail-view {
  min-height: 100%;
}

.detail-empty,
.detail-loading,
.detail-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  color: var(--text-dim);
  text-align: center;
}

.detail-error {
  color: var(--danger);
}

/* Action Panel */
.action-panel {
  display: flex;
  flex-direction: column;
}

.action-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 12px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 10px;
  font-weight: 500;
  transition: all 120ms ease;
}

.action-btn:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: var(--border-strong);
  color: var(--text);
}

.action-btn.danger {
  color: var(--danger);
  border-color: hsl(8 30% 38%);
}

.action-btn.danger:hover:not(:disabled) {
  background: hsl(8 22% 16%);
  border-color: hsl(8 38% 46%);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-icon {
  font-size: 14px;
}

.action-text {
  flex: 1;
  text-align: left;
}

.status-info {
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 10px;
}

.status-label {
  color: var(--text-dim);
  margin-bottom: 4px;
}

.status-value {
  color: var(--text);
  font-weight: 500;
}

/* Mobile: Stack into tabs */
@media (max-width: 1024px) {
  .three-panel-layout {
    grid-template-columns: 1fr;
  }

  .panel {
    display: none;
  }

  .panel.active {
    display: block;
  }
}
```

Import this in `App.tsx`:
```typescript
import "./components/ThreePanelLayout/layout.css";
```

---

### Step 2: Implement Search Across All Scopes (90 min)

**Files**:
- `hooks/useThreePanel.ts` — Implement `handleSearch`
- `utils/search.ts` (create) — Search logic per scope

**What to do**:

Create search functions for each scope. Search should match:
- **People**: name, email, phone, tags, notes
- **Orders**: order ID, customer name, status
- **Messages**: thread participants, last message content
- **Catalog**: product name, SKU, description, category
- **Bot Menus**: menu name

Example structure:
```typescript
// utils/search.ts
export async function searchAllScopes(query: string) {
  if (!query.trim()) {
    return {
      messages: [],
      people: [],
      catalog: [],
      orders: [],
      bot_menus: [],
    };
  }

  const [messages, people, catalog, orders, bot_menus] = await Promise.all([
    api.searchMessages(query),
    api.searchPeople(query),
    api.searchCatalog(query),
    api.searchOrders(query),
    api.searchBotMenus(query),
  ]);

  return { messages, people, catalog, orders, bot_menus };
}

export function searchPeople(query: string, people: Person[]) {
  const needle = query.toLowerCase();
  return people.filter(p =>
    p.name.toLowerCase().includes(needle) ||
    p.email?.toLowerCase().includes(needle) ||
    p.phone?.includes(needle) ||
    p.tags.some(t => t.toLowerCase().includes(needle)) ||
    p.notes?.toLowerCase().includes(needle)
  );
}

// Similar functions for Orders, Messages, Catalog, BotMenus
```

Update `useThreePanel.ts`:
```typescript
const handleSearch = useCallback((query: string) => {
  setSidebarState((prev) => ({
    ...prev,
    searchQuery: query,
  }));

  // Fetch results for all scopes
  if (!query.trim()) {
    setSidebarState((prev) => ({
      ...prev,
      scopeCounts: { messages: 0, people: 0, catalog: 0, orders: 0, bot_menus: 0 },
      scopeResults: { messages: [], people: [], catalog: [], orders: [], bot_menus: [] },
    }));
    return;
  }

  void (async () => {
    const results = await searchAllScopes(query);
    setSidebarState((prev) => ({
      ...prev,
      scopeCounts: {
        messages: results.messages.length,
        people: results.people.length,
        catalog: results.catalog.length,
        orders: results.orders.length,
        bot_menus: results.bot_menus.length,
      },
      scopeResults: results,
    }));
  })();
}, []);
```

---

### Step 3: Implement Detail Views (120 min)

**File**: `detail/DetailView.tsx` — Replace placeholder functions

Implement each detail component:

```typescript
function PeopleDetail({ data }: { data: Person }) {
  return (
    <div className="detail-view people-detail">
      <h2>{data.name}</h2>
      <p className="label">{data.type}</p>

      {/* Metrics */}
      <div className="metrics-grid">
        <div className="metric">
          <p className="label">Lifetime Value</p>
          <p className="value">${(data.lifetimeCents / 100).toFixed(2)}</p>
        </div>
        <div className="metric">
          <p className="label">Outstanding</p>
          <p className="value">${(data.openCents / 100).toFixed(2)}</p>
        </div>
        <div className="metric">
          <p className="label">Orders</p>
          <p className="value">{data.orderCount}</p>
        </div>
        <div className="metric">
          <p className="label">Messages</p>
          <p className="value">{data.messageCount || "N/A"}</p>
        </div>
      </div>

      {/* Sections */}
      <h3>Recent Orders</h3>
      {/* List orders */}

      <h3>Profile</h3>
      <p>Phone: {data.phone || "N/A"}</p>
      <p>Email: {data.email || "N/A"}</p>
      <p>Tags: {data.tags.join(", ")}</p>
      <p>Notes: {data.notes || "None"}</p>
    </div>
  );
}

// Similar for Orders, Catalog, Messages, BotMenus
// Keep it simple initially — just show the data
```

---

### Step 4: Wire Up Detail Fetching (60 min)

**File**: `hooks/useThreePanel.ts` — Implement data fetching on selection

When user clicks an item, fetch its full data:

```typescript
const handleSelectItem = useCallback(
  async (itemId: string) => {
    const scope = sidebarState.selectedScope;
    if (!scope) return;

    setSidebarState((prev) => ({
      ...prev,
      selectedItemId: itemId,
    }));

    setDetailState((prev) => ({
      ...prev,
      selectedScope: scope,
      selectedItemId: itemId,
      loading: true,
      error: null,
    }));

    try {
      let data;
      switch (scope) {
        case "people":
          data = await api.getPerson(itemId);
          break;
        case "orders":
          data = await api.getOrder(itemId);
          break;
        case "messages":
          data = await api.getThread(itemId);
          break;
        case "catalog":
          data = await api.getProduct(itemId);
          break;
        case "bot_menus":
          data = await api.getBotMenu(itemId);
          break;
      }

      setDetailState((prev) => ({
        ...prev,
        itemData: data,
        loading: false,
      }));
    } catch (error) {
      setDetailState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Unknown error",
        loading: false,
      }));
    }
  },
  [sidebarState.selectedScope]
);
```

---

### Step 5: Wire Up Action Buttons (90 min)

**File**: `actions/ActionPanel.tsx` — Connect click handlers

```typescript
export function ActionPanel({ scope, itemId, onAction, loading }: ActionPanelProps) {
  const handleAction = async (actionId: string) => {
    try {
      switch (actionId) {
        case "message":
          // Navigate to Messages or open compose modal
          await api.openMessageCompose(itemId);
          break;
        case "view_orders":
          // Fetch person's orders
          await api.getPersonOrders(itemId);
          break;
        case "send_menu":
          // Open menu selector modal
          await api.sendBotMenu(itemId);
          break;
        // ... etc for each action
      }
    } catch (error) {
      console.error("Action failed:", error);
    }
  };

  // Rest of component...
}
```

---

### Step 6: Add Scope-Specific Filters (90 min)

**File**: `sidebar/FilterPanel.tsx` — Implement filter UI

Add actual filter controls:

```typescript
export function FilterPanel({ scope, filters, onFilterChange }: FilterPanelProps) {
  if (scope === "people") {
    return (
      <div className="filter-panel">
        <label>
          <span>Type:</span>
          <select onChange={(e) => onFilterChange("people", "type", e.target.value)}>
            <option value="">All</option>
            <option value="supplier">Supplier</option>
            <option value="customer">Customer</option>
            <option value="team">Team</option>
          </select>
        </label>
      </div>
    );
  }

  // Similar for Orders, Catalog, etc.
}
```

Wire up filter changes to re-fetch results.

---

### Step 7: Responsive Design (45 min)

Add media query to `layout.css`:

```css
@media (max-width: 1024px) {
  .three-panel-layout {
    grid-template-columns: 1fr;
  }

  .panel {
    display: none;
  }

  .panel.active {
    display: block;
  }
}
```

Add tab navigation component for mobile.

---

### Step 8: Polish & Test (60 min)

- Test all 5 scopes with search
- Test scope expansion/collapse
- Test item selection → detail loading
- Test action buttons
- Test filters narrowing results
- Check for console errors
- Test on mobile viewport

---

## Testing Checklist

Before marking as complete:

- [ ] Search finds items in all 5 scopes
- [ ] Scopes expand/collapse with results
- [ ] Click item → detail loads with correct data
- [ ] Action buttons appear + work
- [ ] Filters narrow results
- [ ] No console errors
- [ ] Responsive on tablet/mobile
- [ ] Loading states visible
- [ ] Error states handled

---

## Branch & PR

- **Branch**: `feat/search-functionality` (already created)
- **When done**: Push commits and create PR back to `main`
- **Title**: "feat: implement 3-panel search functionality"
- **Description**: List the 8 steps completed + testing status

---

## API Endpoints Needed (Check `src/api.ts`)

Make sure these exist or create them:
```
GET /search/people?q=Karen
GET /search/orders?q=Karen
GET /search/messages?q=Karen
GET /search/catalog?q=Karen
GET /search/bot_menus?q=Karen

GET /people/:id
GET /orders/:id
GET /messages/:threadId
GET /catalog/:productId
GET /bot_menus/:menuId
```

---

## Questions?

1. Before starting: Check `src/components/ThreePanelLayout/HANDOFF.md` for detailed breakdown
2. Use existing styles/patterns from `src/styles.css`
3. Check `src/api.ts` for existing API call patterns
4. Reference `src/components/People/PeopleScreen.tsx` for People detail examples

**Start with Step 1 (Styling), then follow the priority order above.**

Good luck! 🚀
