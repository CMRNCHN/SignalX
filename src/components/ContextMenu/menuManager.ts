export interface MenuItemConfig {
  id: string;
  label: string;
  actionType: string;
  disabled?: boolean;
  danger?: boolean;
}

export interface MenuConfig {
  id: string;
  name: string;
  objectType: string;
  items: MenuItemConfig[];
  isCustom?: boolean;
}

const STORAGE_KEY = "signalx-menus";

const DEFAULT_MENUS: MenuConfig[] = [
  {
    id: "thread-menu",
    name: "Thread Menu",
    objectType: "thread",
    items: [
      { id: "export", label: "Export thread", actionType: "exportThread" },
      { id: "copy-id", label: "Copy ID", actionType: "copyId" },
      { id: "divider1", label: "", actionType: "divider" },
      { id: "delete", label: "Delete thread", actionType: "deleteThread", danger: true },
    ],
  },
  {
    id: "order-menu",
    name: "Order Menu",
    objectType: "order",
    items: [
      { id: "edit", label: "Edit order", actionType: "editOrder" },
      { id: "duplicate", label: "Duplicate as draft", actionType: "duplicateOrder" },
      { id: "send-invoice", label: "Send invoice", actionType: "sendInvoice" },
      { id: "copy-id", label: "Copy ID", actionType: "copyId" },
      { id: "divider1", label: "", actionType: "divider" },
      { id: "delete", label: "Delete order", actionType: "deleteOrder", danger: true },
    ],
  },
  {
    id: "product-menu",
    name: "Product Menu",
    objectType: "product",
    items: [
      { id: "edit", label: "Edit product", actionType: "editProduct" },
      { id: "adjust-stock", label: "Adjust stock", actionType: "adjustStock" },
      { id: "copy-sku", label: "Copy SKU", actionType: "copySku" },
      { id: "divider1", label: "", actionType: "divider" },
      { id: "delete", label: "Delete product", actionType: "deleteProduct", danger: true },
    ],
  },
  {
    id: "contact-menu",
    name: "Contact Menu",
    objectType: "contact",
    items: [
      { id: "edit", label: "Edit contact", actionType: "editContact" },
      { id: "new-dm", label: "New message", actionType: "newDm" },
      { id: "copy-phone", label: "Copy phone", actionType: "copyPhone" },
      { id: "divider1", label: "", actionType: "divider" },
      { id: "delete", label: "Delete contact", actionType: "deleteContact", danger: true },
    ],
  },
  {
    id: "audit-menu",
    name: "Audit Entry Menu",
    objectType: "auditEntry",
    items: [
      { id: "copy-details", label: "Copy details", actionType: "copyDetails" },
    ],
  },
];

export function loadMenus(): MenuConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const customMenus = JSON.parse(stored) as MenuConfig[];
      // Merge custom menus with defaults, preferring custom
      const customMap = new Map(customMenus.map((m) => [m.id, m]));
      const defaultMap = new Map(DEFAULT_MENUS.map((m) => [m.id, m]));
      defaultMap.forEach((menu, id) => {
        if (!customMap.has(id)) {
          customMap.set(id, menu);
        }
      });
      return Array.from(customMap.values());
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_MENUS;
}

export function saveMenus(menus: MenuConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(menus));
  } catch {
    // Ignore storage errors
  }
}

export function getMenuByObjectType(objectType: string): MenuConfig | undefined {
  const menus = loadMenus();
  return menus.find((m) => m.objectType === objectType);
}

export function updateMenu(menu: MenuConfig): void {
  const menus = loadMenus();
  const index = menus.findIndex((m) => m.id === menu.id);
  if (index >= 0) {
    menus[index] = menu;
  } else {
    menus.push(menu);
  }
  saveMenus(menus);
}

export function deleteMenu(menuId: string): void {
  const menus = loadMenus();
  const filtered = menus.filter((m) => m.id !== menuId);
  saveMenus(filtered);
}

export function resetMenus(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
