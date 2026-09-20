import type { MenuItem as ContextMenuItem } from "./components/ContextMenu";
import type { Order, Product, ContactMeta, ThreadSummary } from "./api";

/**
 * Context Menu Helpers
 * These functions generate context menu items for different object types.
 * They're designed to be used in screens to provide right-click functionality.
 *
 * Usage example:
 * ```
 * const items = getOrderContextMenuItems(orderId, order, {
 *   onEdit: () => setFocusOrderId(orderId),
 *   onDuplicate: () => duplicateAsDraft(orderId),
 *   // ... other handlers
 * });
 * ```
 */

interface OrderContextMenuHandlers {
  onEdit?: (orderId: string) => void;
  onDuplicate?: (orderId: string) => void;
  onSendInvoice?: (orderId: string) => void;
  onDelete?: (orderId: string) => void;
  onCopyId?: (orderId: string) => void;
}

export function getOrderContextMenuItems(
  orderId: string,
  _order: Order,
  handlers: OrderContextMenuHandlers,
  setStatus: (msg: string) => void,
): ContextMenuItem[] {
  return [
    {
      id: "edit",
      label: "Edit order",
      action: () => handlers.onEdit?.(orderId),
    },
    {
      id: "duplicate",
      label: "Duplicate as draft",
      action: () => handlers.onDuplicate?.(orderId),
    },
    {
      id: "send-invoice",
      label: "Send invoice",
      action: () => handlers.onSendInvoice?.(orderId),
    },
    {
      id: "copy-id",
      label: "Copy ID",
      action: () => {
        navigator.clipboard.writeText(orderId);
        setStatus("Copied order ID");
      },
    },
    { id: "divider", label: "", action: () => {}, divider: true },
    {
      id: "delete",
      label: "Delete order",
      danger: true,
      action: () => {
        if (window.confirm("Delete this order?")) {
          handlers.onDelete?.(orderId);
          setStatus("Order deleted");
        }
      },
    },
  ];
}

interface ProductContextMenuHandlers {
  onEdit?: (product: Product) => void;
  onAdjustStock?: (product: Product) => void;
  onDelete?: (productId: string) => void;
}

export function getProductContextMenuItems(
  product: Product,
  handlers: ProductContextMenuHandlers,
  setStatus: (msg: string) => void,
): ContextMenuItem[] {
  return [
    {
      id: "edit",
      label: "Edit product",
      action: () => handlers.onEdit?.(product),
    },
    {
      id: "adjust-stock",
      label: "Adjust stock",
      action: () => handlers.onAdjustStock?.(product),
    },
    {
      id: "copy-sku",
      label: "Copy SKU",
      action: () => {
        if (product.sku) {
          navigator.clipboard.writeText(product.sku);
          setStatus("Copied SKU");
        }
      },
    },
    {
      id: "copy-id",
      label: "Copy ID",
      action: () => {
        navigator.clipboard.writeText(product.id);
        setStatus("Copied product ID");
      },
    },
    { id: "divider", label: "", action: () => {}, divider: true },
    {
      id: "delete",
      label: "Delete product",
      danger: true,
      action: () => {
        if (window.confirm("Delete this product?")) {
          handlers.onDelete?.(product.id);
        }
      },
    },
  ];
}

interface ContactContextMenuHandlers {
  onEdit?: (contact: ContactMeta) => void;
  onMessage?: (contact: ContactMeta) => void;
  onDelete?: (contactId: string) => void;
}

export function getContactContextMenuItems(
  contact: ContactMeta,
  handlers: ContactContextMenuHandlers,
  setStatus: (msg: string) => void,
): ContextMenuItem[] {
  return [
    {
      id: "edit",
      label: "Edit contact",
      action: () => handlers.onEdit?.(contact),
    },
    {
      id: "new-dm",
      label: "New message",
      action: () => handlers.onMessage?.(contact),
    },
    {
      id: "copy-phone",
      label: "Copy phone",
      action: () => {
        const phone = contact.contact_id.replace(/^dm:/, "");
        navigator.clipboard.writeText(phone);
        setStatus("Copied phone");
      },
    },
    { id: "divider", label: "", action: () => {}, divider: true },
    {
      id: "delete",
      label: "Delete contact",
      danger: true,
      action: () => {
        if (window.confirm("Delete this contact?")) {
          handlers.onDelete?.(contact.contact_id);
        }
      },
    },
  ];
}

interface ThreadContextMenuHandlers {
  onExport?: (threadId: string) => void;
  onDelete?: (threadId: string) => void;
}

export function getThreadContextMenuItems(
  thread: ThreadSummary,
  handlers: ThreadContextMenuHandlers,
  setStatus: (msg: string) => void,
): ContextMenuItem[] {
  return [
    {
      id: "export",
      label: "Export thread",
      action: () => handlers.onExport?.(thread.id),
    },
    {
      id: "copy-id",
      label: "Copy ID",
      action: () => {
        navigator.clipboard.writeText(thread.id);
        setStatus("Copied thread ID");
      },
    },
    { id: "divider", label: "", action: () => {}, divider: true },
    {
      id: "delete",
      label: "Delete thread",
      danger: true,
      action: () => {
        if (window.confirm("Delete this thread?")) {
          handlers.onDelete?.(thread.id);
        }
      },
    },
  ];
}
