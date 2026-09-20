import type { MenuItem } from "./components/ContextMenu";

export interface ContextMenuHandlerParams {
  objectId: string;
  objectType: string;
  setStatus: (msg: string) => void;
  onAction?: (actionType: string, objectId: string) => void;
  onExport?: (objectId: string) => void;
  onEdit?: (objectId: string) => void;
  onDelete?: (objectId: string) => void;
  onAdjustStock?: (objectId: string) => void;
}

export function buildContextMenuItems(
  actionType: string,
  objectId: string,
  params: ContextMenuHandlerParams,
): MenuItem[] {
  const items: MenuItem[] = [];

  const handleAction = (
    id: string,
    label: string,
    action: string,
    isDanger = false,
  ) => {
    items.push({
      id,
      label,
      danger: isDanger,
      action: () => {
        if (action === "divider") return;
        params.onAction?.(action, objectId);
      },
    });
  };

  // Parse action type to determine what actions to add
  switch (actionType) {
    case "exportThread":
      handleAction("export", "Export thread", "exportThread");
      break;
    case "copyId":
      handleAction("copy-id", "Copy ID", "copyId");
      break;
    case "deleteThread":
      handleAction("delete", "Delete thread", "deleteThread", true);
      break;
    case "editOrder":
      handleAction("edit", "Edit order", "editOrder");
      break;
    case "duplicateOrder":
      handleAction("duplicate", "Duplicate as draft", "duplicateOrder");
      break;
    case "sendInvoice":
      handleAction("send-invoice", "Send invoice", "sendInvoice");
      break;
    case "deleteOrder":
      handleAction("delete", "Delete order", "deleteOrder", true);
      break;
    case "editProduct":
      handleAction("edit", "Edit product", "editProduct");
      break;
    case "adjustStock":
      handleAction("adjust-stock", "Adjust stock", "adjustStock");
      break;
    case "copySku":
      handleAction("copy-sku", "Copy SKU", "copySku");
      break;
    case "deleteProduct":
      handleAction("delete", "Delete product", "deleteProduct", true);
      break;
    case "editContact":
      handleAction("edit", "Edit contact", "editContact");
      break;
    case "newDm":
      handleAction("new-dm", "New message", "newDm");
      break;
    case "copyPhone":
      handleAction("copy-phone", "Copy phone", "copyPhone");
      break;
    case "deleteContact":
      handleAction("delete", "Delete contact", "deleteContact", true);
      break;
    case "copyDetails":
      handleAction("copy-details", "Copy details", "copyDetails");
      break;
  }

  return items;
}

export function executeContextMenuAction(
  action: string,
  objectId: string,
  data: any,
  setStatus: (msg: string) => void,
) {
  try {
    switch (action) {
      case "copyId":
      case "copySku":
      case "copyPhone":
      case "copyDetails": {
        const valueToCopy = data[action] || objectId;
        navigator.clipboard.writeText(String(valueToCopy));
        const actionLabel = {
          copyId: "ID",
          copySku: "SKU",
          copyPhone: "Phone",
          copyDetails: "Details",
        }[action];
        setStatus(`Copied ${actionLabel}`);
        break;
      }
      default:
        // Other actions should be handled by component-specific handlers
        break;
    }
  } catch {
    setStatus("Copy failed");
  }
}
