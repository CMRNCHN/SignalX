import { Scope, ActionButton } from "../types";

interface ActionPanelProps {
  scope: Scope | null;
  itemId: string | null;
  onAction: (actionId: string) => void;
  loading?: boolean;
}

// Action map per scope
const ACTION_MAP: Record<Scope, ActionButton[]> = {
  people: [
    { id: "message", label: "Message", icon: "💬", onClick: () => {} },
    { id: "view_orders", label: "View Orders", icon: "📋", onClick: () => {} },
    { id: "send_menu", label: "Send Menu", icon: "🤖", onClick: () => {} },
    { id: "edit_profile", label: "Edit Profile", icon: "👤", onClick: () => {} },
    { id: "call_sms", label: "Call / SMS", icon: "📞", onClick: () => {} },
    { id: "more", label: "More options", icon: "⋯", onClick: () => {} },
  ],
  messages: [
    { id: "search", label: "Search", icon: "🔍", onClick: () => {} },
    { id: "pin", label: "Pin Thread", icon: "📌", onClick: () => {} },
    { id: "mute", label: "Mute", icon: "🔕", onClick: () => {} },
    { id: "archive", label: "Archive", icon: "🗑️", onClick: () => {} },
    { id: "more", label: "More options", icon: "⋯", onClick: () => {} },
  ],
  orders: [
    { id: "view_full", label: "View Full Order", icon: "📋", onClick: () => {} },
    { id: "message", label: "Message Customer", icon: "💬", onClick: () => {} },
    { id: "tracking", label: "Update Tracking", icon: "📦", onClick: () => {} },
    { id: "invoice", label: "Send Invoice", icon: "🧾", onClick: () => {} },
    { id: "stats", label: "View Stats", icon: "📊", onClick: () => {} },
    { id: "more", label: "More options", icon: "⋯", onClick: () => {} },
  ],
  catalog: [
    { id: "edit", label: "Edit Product", icon: "✏️", onClick: () => {} },
    { id: "sales", label: "View Sales", icon: "📊", onClick: () => {} },
    { id: "restock", label: "Restock Alert", icon: "📋", onClick: () => {} },
    { id: "price", label: "Adjust Price", icon: "🏷️", onClick: () => {} },
    { id: "export", label: "Export SKU", icon: "📤", onClick: () => {} },
    { id: "more", label: "More options", icon: "⋯", onClick: () => {} },
  ],
  bot_menus: [
    { id: "edit", label: "Edit Menu", icon: "✏️", onClick: () => {} },
    { id: "analytics", label: "View Analytics", icon: "📊", onClick: () => {} },
    { id: "test", label: "Test Menu", icon: "🧪", onClick: () => {} },
    { id: "duplicate", label: "Duplicate", icon: "📋", onClick: () => {} },
    { id: "delete", label: "Delete", icon: "🗑️", onClick: () => {}, variant: "danger" },
  ],
};

export function ActionPanel({ scope, itemId, onAction, loading }: ActionPanelProps) {
  if (!scope || !itemId) {
    return (
      <div className="action-panel action-empty">
        <p>Select an item for actions</p>
      </div>
    );
  }

  const actions = ACTION_MAP[scope] || [];

  return (
    <div className="action-panel">
      <p className="action-label">Quick Actions:</p>

      <div className="action-buttons">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`action-btn ${action.variant || "default"}`}
            onClick={() => onAction(action.id)}
            disabled={loading}
            title={action.label}
          >
            <span className="action-icon">{action.icon}</span>
            <span className="action-text">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Status info */}
      <div className="status-info">
        <p className="status-label">Status:</p>
        <p className="status-value">Loading…</p>
      </div>
    </div>
  );
}
