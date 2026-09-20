# Context Menu Implementation Summary

## What Was Implemented

A complete right-click context menu system for all objects in SignalX with customization capabilities.

## Files Created

### Core Components
- `src/components/ContextMenu/ContextMenu.tsx` - Main menu component
- `src/components/ContextMenu/ContextMenu.css` - Menu styling
- `src/components/ContextMenu/useContextMenu.ts` - State management hook
- `src/components/ContextMenu/MenuEditor.tsx` - Menu customization dialog
- `src/components/ContextMenu/MenuEditor.css` - Editor styling
- `src/components/ContextMenu/menuManager.ts` - Menu persistence and management
- `src/components/ContextMenu/index.ts` - Export barrel

### Utilities
- `src/contextMenuHelpers.ts` - Helper functions for building context menus
- `src/contextMenuHandlers.ts` - Action handler utilities (reference)

### Documentation
- `CONTEXT_MENUS.md` - Complete usage guide
- `CONTEXT_MENU_IMPLEMENTATION.md` - This file

## Currently Integrated

### Threads (Messages Panel)
✅ **Fully integrated** - Right-click any thread to see options:
- Export thread
- Copy ID
- Delete thread (with confirmation)
- Edit menu
- Add custom items

## Ready to Integrate

Helper functions are provided for easily adding context menus to:

### Orders
Use `getOrderContextMenuItems()` from `contextMenuHelpers.ts`
- Edit order
- Duplicate as draft
- Send invoice
- Copy ID
- Delete order

### Products
Use `getProductContextMenuItems()` from `contextMenuHelpers.ts`
- Edit product
- Adjust stock
- Copy SKU
- Copy ID
- Delete product

### Contacts
Use `getContactContextMenuItems()` from `contextMenuHelpers.ts`
- Edit contact
- New message
- Copy phone
- Delete contact

## Features

### Context Menu Features
- ✅ Right-click to open customizable menus
- ✅ Keyboard support (Escape to close)
- ✅ Click-outside to close
- ✅ Object-specific actions
- ✅ Danger actions styling
- ✅ Menu item dividers

### Customization Features
- ✅ Add custom menu items
- ✅ Edit existing menu items
- ✅ Delete menu items
- ✅ Mark items as "danger" (destructive)
- ✅ Change action types
- ✅ Persistent storage (localStorage)
- ✅ Reset to defaults

### Menu Management
- ✅ Default menus for each object type
- ✅ localStorage-based persistence
- ✅ Menu configurations merge with defaults
- ✅ Per-object-type customization

## How to Use (Threads - Currently Working)

1. **Right-click any thread** in the Messages panel
2. **Context menu appears** with options:
   - Regular menu items (Export, Copy ID, Delete)
   - Divider
   - Action buttons at bottom (+ Add item, ⚙ Edit menu)

3. **Click "+ Add item"** to quickly add a new menu item
4. **Click "⚙ Edit menu"** to fully customize the menu
5. **In menu editor:**
   - Edit labels and action types
   - Toggle "Danger" for destructive actions
   - Delete items with ✕ button
   - Add new items at the bottom
   - Save or cancel

## How to Extend (Add to Other Screens)

### Example: Adding to Orders

```typescript
// In OrdersScreen.tsx
import { useContextMenu, ContextMenu } from "./ContextMenu";
import { getOrderContextMenuItems } from "./contextMenuHelpers";

function OrdersScreen() {
  const contextMenu = useContextMenu();

  return (
    <>
      {orders.map((order) => (
        <div
          key={order.id}
          onContextMenu={(e) => {
            contextMenu.openContextMenu(
              e,
              getOrderContextMenuItems(order.id, order, {
                onEdit: (id) => setFocusOrderId(id),
                onDuplicate: (id) => duplicateAsDraft(id),
                onSendInvoice: (id) => sendInvoice(id),
                onDelete: (id) => removeOrder(id),
              }, setStatus),
              order.id
            );
          }}
        >
          {/* Order rendering */}
        </div>
      ))}

      <ContextMenu
        position={contextMenu.position}
        items={contextMenu.items}
        onClose={contextMenu.closeContextMenu}
        onEditMenu={() => setMenuEditorOpen(true)}
      />
    </>
  );
}
```

## Storage Details

### localStorage Key
`signalx-menus`

### Menu Structure
```typescript
interface MenuConfig {
  id: string;                    // Unique menu ID
  name: string;                  // Display name
  objectType: string;            // Type of object ("thread", "order", etc.)
  items: MenuItemConfig[];       // Array of menu items
  isCustom?: boolean;            // Custom flag
}

interface MenuItemConfig {
  id: string;
  label: string;
  actionType: string;            // Action to perform
  disabled?: boolean;
  danger?: boolean;
}
```

### Default Menus
- Thread Menu: `thread-menu`
- Order Menu: `order-menu`
- Product Menu: `product-menu`
- Contact Menu: `contact-menu`
- Audit Menu: `audit-menu`

## Styling System

### Color Variables Used
- `--surface-1`, `--surface-2`, `--surface-3` - Backgrounds
- `--text`, `--text-dim` - Text colors
- `--border`, `--border-strong` - Borders
- `--shadow-lg` - Drop shadow
- `#ff6b6b` - Danger/delete actions (red)

### Menu Item States
- **Normal** - Regular menu item
- **Hover** - Lighter background
- **Disabled** - Dimmed, cursor: not-allowed
- **Danger** - Red text/border

### Editor States
- **Button hover** - Surface-3 background
- **Disabled button** - 50% opacity
- **Danger button** - Red styling

## Performance Considerations

### Rendering
- Menus only render when `position` is not null
- Virtual scrolling for menus with many items (400px max height)
- Z-index: 1000 for menu, 2000 for editor

### Storage
- localStorage limits: ~5-10MB per domain
- Default menus: ~1.5KB
- Custom menus stored only when modified

### Keyboard & Mouse
- ESC key closes menu
- Click outside closes menu
- No bubbling prevents unintended menu closure

## Security Considerations

- ✅ No eval/dynamic code execution
- ✅ All actions are pre-defined
- ✅ Confirmation dialogs for destructive operations
- ✅ localStorage is domain-scoped
- ✅ No sensitive data in menu configs

## Testing Checklist

- [ ] Right-click thread - menu appears
- [ ] Click menu item - action executes
- [ ] Press ESC - menu closes
- [ ] Click outside - menu closes
- [ ] Click "+ Add item" - can add new item
- [ ] Click "⚙ Edit menu" - editor opens
- [ ] In editor: add, edit, delete items
- [ ] Save menu - persists to localStorage
- [ ] Refresh page - custom menu items appear
- [ ] Danger items confirm before executing
- [ ] Multiple menu types work independently

## Future Enhancements

### Potential Additions
- [ ] Keyboard navigation (arrows, enter)
- [ ] Search/filter in menu editor
- [ ] Menu item icons/emojis
- [ ] Submenu support
- [ ] Contextual item enabling/disabling
- [ ] Menu presets/templates
- [ ] Export/import menu configs
- [ ] Undo/redo for menu changes
- [ ] Keyboard shortcuts display
- [ ] Analytics on menu usage

### Integration Opportunities
- [ ] Add to Orders screen (ready to integrate)
- [ ] Add to Products screen (ready to integrate)
- [ ] Add to Contacts screen (ready to integrate)
- [ ] Add to Audit entries
- [ ] Add to Search results
- [ ] Add to Outbox items

## Quick Reference

### Core Imports
```typescript
import {
  ContextMenu,
  useContextMenu,
  MenuEditor,
  getMenuByObjectType,
  updateMenu,
  type MenuItem,
  type MenuConfig,
} from "./components/ContextMenu";
```

### Helper Imports
```typescript
import {
  getThreadContextMenuItems,
  getOrderContextMenuItems,
  getProductContextMenuItems,
  getContactContextMenuItems,
} from "./contextMenuHelpers";
```

### Basic Integration Pattern
```typescript
const contextMenu = useContextMenu();

onContextMenu={(e) => {
  contextMenu.openContextMenu(e, menuItems, objectId);
}}

// In JSX:
<ContextMenu
  position={contextMenu.position}
  items={contextMenu.items}
  onClose={contextMenu.closeContextMenu}
  onEditMenu={() => { /* handle */ }}
/>
```

## Support

For detailed usage information, see `CONTEXT_MENUS.md`.
For implementation examples, see inline comments in `contextMenuHelpers.ts`.
