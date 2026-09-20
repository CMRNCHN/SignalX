# Context Menus System

This document explains how to use the right-click context menu system in SignalX.

## Overview

SignalX now has a comprehensive right-click context menu system that allows users to:
- Right-click any object/element to see a context menu with relevant actions
- Add new menu items to any context menu
- Edit menu configurations to customize what appears
- Delete menu items they don't want

## Components

### Core Components

1. **ContextMenu** (`src/components/ContextMenu/ContextMenu.tsx`)
   - The main menu component that displays context menus
   - Shows menu items and action buttons at the bottom
   - Handles keyboard and click-outside events

2. **useContextMenu** Hook (`src/components/ContextMenu/useContextMenu.ts`)
   - State management hook for tracking menu position and items
   - `openContextMenu(e, items, objectId?)` - open a context menu
   - `closeContextMenu()` - close the menu
   - `position`, `items`, `currentObjectId` - accessible state

3. **MenuEditor** (`src/components/ContextMenu/MenuEditor.tsx`)
   - Modal dialog for editing menu configurations
   - Allows adding/removing/configuring menu items
   - Persists changes to localStorage

4. **Menu Manager** (`src/components/ContextMenu/menuManager.ts`)
   - Manages menu storage and retrieval
   - `loadMenus()` - load all menu configurations
   - `saveMenus(menus)` - save menu configurations
   - `getMenuByObjectType(type)` - get menu for an object type
   - `updateMenu(menu)` - save/update a specific menu
   - `deleteMenu(menuId)` - delete a menu
   - `resetMenus()` - reset to default menus

## Default Menus

The system comes with pre-configured menus for:

### Thread Menu
- Export thread
- Copy ID
- **Delete thread** (danger action)

### Order Menu
- Edit order
- Duplicate as draft
- Send invoice
- Copy ID
- **Delete order** (danger action)

### Product Menu
- Edit product
- Adjust stock
- Copy SKU
- Copy ID
- **Delete product** (danger action)

### Contact Menu
- Edit contact
- New message
- Copy phone
- **Delete contact** (danger action)

### Audit Entry Menu
- Copy details

## Integration Examples

### Threads (Already Integrated)

Threads have context menu support built-in. Right-click any thread in the Messages panel to see options.

```typescript
onContextMenu={(e) => {
  const items = getThreadContextMenu(threadId);
  contextMenu.openContextMenu(e, items, threadId);
}}
```

### Adding Context Menus to Other Screens

To add context menus to Orders, Products, or Contacts, follow this pattern:

#### Orders Screen Example

```typescript
import { useContextMenu, ContextMenu } from "./components/ContextMenu";
import { getOrderContextMenuItems } from "./contextMenuHelpers";

function OrdersScreen() {
  const contextMenu = useContextMenu();

  return (
    <>
      {orders.map((order) => (
        <div
          key={order.id}
          onContextMenu={(e) => {
            const items = getOrderContextMenuItems(order.id, order, {
              onEdit: (id) => setFocusOrderId(id),
              onDuplicate: (id) => duplicateAsDraft(id),
              onSendInvoice: (id) => sendInvoice(id),
              onDelete: (id) => removeOrder(id),
            }, setStatus);
            contextMenu.openContextMenu(e, items, order.id);
          }}
        >
          {/* Order content */}
        </div>
      ))}

      <ContextMenu
        position={contextMenu.position}
        items={contextMenu.items}
        onClose={contextMenu.closeContextMenu}
        onEditMenu={() => {
          // Open menu editor for this menu type
        }}
      />
    </>
  );
}
```

#### Products Screen Example

```typescript
import { getProductContextMenuItems } from "./contextMenuHelpers";

{products.map((product) => (
  <div
    key={product.id}
    onContextMenu={(e) => {
      const items = getProductContextMenuItems(product, {
        onEdit: (p) => editProduct(p),
        onAdjustStock: (p) => adjustStock(p, 0),
        onDelete: (id) => removeProduct(id),
      }, setStatus);
      contextMenu.openContextMenu(e, items, product.id);
    }}
  >
    {/* Product content */}
  </div>
))}
```

#### Contacts Screen Example

```typescript
import { getContactContextMenuItems } from "./contextMenuHelpers";

{contacts.map((contact) => (
  <div
    key={contact.contact_id}
    onContextMenu={(e) => {
      const items = getContactContextMenuItems(contact, {
        onEdit: (c) => {
          setContactForm({
            phone: c.contact_id.replace(/^dm:/, ""),
            name: c.display_name || "",
          });
        },
        onMessage: (c) => {
          setSelectedId(c.contact_id);
          setPanel("threads");
        },
        onDelete: (id) => deleteContact(id),
      }, setStatus);
      contextMenu.openContextMenu(e, items, contact.contact_id);
    }}
  >
    {/* Contact content */}
  </div>
))}
```

## Using the Menu Editor

### Opening the Menu Editor

Right-click any object, then click the "⚙ Edit menu" button at the bottom of the context menu.

### Customizing Menu Items

In the menu editor you can:
1. **Edit existing items** - Change the label, action type, or mark as "danger"
2. **Delete items** - Click the ✕ button next to any item
3. **Add new items** - Fill in the "New item label" field, select an action type, and click "+ Add"
4. **Mark as danger** - Check the "Danger" checkbox for destructive actions

### Available Action Types

Standard action types include:
- `exportThread` - Export a thread
- `copyId` - Copy object ID to clipboard
- `deleteThread` - Delete a thread
- `editOrder` - Edit an order
- `duplicateOrder` - Duplicate an order as draft
- `sendInvoice` - Send an invoice
- `deleteOrder` - Delete an order
- `editProduct` - Edit a product
- `adjustStock` - Adjust product stock
- `copySku` - Copy SKU to clipboard
- `deleteProduct` - Delete a product
- `editContact` - Edit a contact
- `newDm` - Start a new direct message
- `copyPhone` - Copy phone number
- `deleteContact` - Delete a contact
- `copyDetails` - Copy audit entry details

### Saving and Resetting

- **Save menu** - Saves your customizations to localStorage
- **Cancel** - Discards changes
- **Reset menus** - Reset all menus to defaults (can be done via menuManager.resetMenus())

## Adding Menu Items at Bottom

Every context menu includes action buttons at the bottom:

```
│ Regular menu item  │
│ Another item       │
├────────────────────┤
│ + Add item         │  ← Add new items to this menu
│ ⚙ Edit menu        │  ← Customize the menu
│ ✕ Delete menu      │  ← Delete this menu configuration
```

### Add Item
Clicking "+ Add item" opens a quick input to add a new menu item without opening the full editor.

### Edit Menu
Opens the full MenuEditor where you can manage all aspects of the menu.

### Delete Menu
Removes the menu configuration (falls back to defaults on next use).

## Styling

Context menus use the app's design system variables:
- `--surface-2` - Background
- `--border` - Borders
- `--text` - Text color
- `--text-dim` - Dimmed text (for disabled items)
- `--shadow-lg` - Drop shadow

Danger actions (like delete) are styled in red (#ff6b6b).

## Storage

Menu configurations are stored in `localStorage` under the key `signalx-menus`.

```javascript
// Load custom menus
const menus = localStorage.getItem('signalx-menus');

// Clear custom menus (resets to defaults)
localStorage.removeItem('signalx-menus');
```

## Creating Custom Menus

To add a new menu type, extend the `MenuConfig` in `menuManager.ts`:

```typescript
const MY_CUSTOM_MENU: MenuConfig = {
  id: "custom-menu",
  name: "Custom Menu",
  objectType: "customObject",
  items: [
    { id: "action1", label: "Do something", actionType: "customAction1" },
    { id: "divider1", label: "", actionType: "divider" },
    { id: "delete", label: "Delete", actionType: "customDelete", danger: true },
  ],
};
```

Then use in your component:

```typescript
const items = getMenuByObjectType("customObject")?.items.map(item => ({
  id: item.id,
  label: item.label,
  danger: item.danger,
  action: () => {
    // Handle action based on item.actionType
  },
})) || [];

contextMenu.openContextMenu(event, items, objectId);
```

## API Reference

### ContextMenu Component Props

```typescript
interface ContextMenuProps {
  position: ContextMenuPosition | null;  // { x: number; y: number } | null
  items: MenuItem[];                      // Array of menu items
  onClose: () => void;                   // Close handler
  onAddItem?: () => void;                // Add item handler
  onEditMenu?: () => void;               // Edit menu handler
  onDeleteMenu?: () => void;             // Delete menu handler
}
```

### MenuItem Type

```typescript
interface MenuItem {
  id: string;
  label: string;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}
```

### useContextMenu Hook

```typescript
const {
  position,           // Current menu position
  items,              // Current menu items
  currentObjectId,    // ID of object menu opened on
  openContextMenu,    // (e: React.MouseEvent, items: MenuItem[], objectId?: string) => void
  closeContextMenu,   // () => void
} = useContextMenu();
```

## Best Practices

1. **Always provide context** - Include the object ID when opening menus so handlers know what they're acting on
2. **Confirm destructive actions** - Always show a confirmation dialog for delete operations
3. **Update state after actions** - Call `setStatus()` to show user feedback
4. **Test accessibility** - Ensure keyboard navigation and screen reader support
5. **Keep menus focused** - Only show actions relevant to the object type
6. **Use danger styling** - Mark destructive actions with `danger: true`

## Troubleshooting

### Menu doesn't appear
- Check that `contextMenu.position` is not null
- Verify `onContextMenu` event is properly attached
- Check browser console for errors

### Actions don't execute
- Verify the action function is defined and bound correctly
- Check that closure captures the right variables
- Ensure `setStatus` is accessible in the handler

### Custom menus not saving
- Check browser localStorage is enabled
- Verify no errors in browser console
- Try clearing localStorage and reopening the app

### Menu editor not opening
- Ensure `menuEditorOpen` state is managed
- Check that `editingMenu` ID is set correctly
- Verify MenuEditor component is rendered
