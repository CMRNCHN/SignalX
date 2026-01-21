import React from "react";
import { Select, Badge } from "./primitives";
import "./Sidebar.css";

type View = "messages" | "contacts" | "threads" | "ai-tools" | "settings";

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  notificationCount?: number;
  accounts?: string[];
  activeAccount?: string | null;
  onAccountChange?: (accountId: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  notificationCount = 0,
  accounts = [],
  activeAccount,
  onAccountChange,
}) => {
  const items: { view: View; icon: string; label: string }[] = [
    { view: "messages", icon: "💬", label: "Messages" },
    { view: "contacts", icon: "📂", label: "Contacts" },
    { view: "threads", icon: "🧵", label: "Threads" },
    { view: "ai-tools", icon: "🧠", label: "AI Tools" },
    { view: "settings", icon: "🔧", label: "Settings" },
  ];

  return (
    <aside className="sidebar">
      <h1 className="sidebar-title">SignalX</h1>
      {accounts.length > 0 && (
        <div className="sidebar-account-selector">
          <label
            htmlFor="account-select"
            style={{
              fontSize: "0.75rem",
              color: "#8D94A1",
              marginBottom: "4px",
              display: "block",
            }}
          >
            Account
          </label>
          <Select
            id="account-select"
            value={activeAccount || ""}
            onChange={(e) => {
              if (onAccountChange && e.target.value) {
                onAccountChange(e.target.value);
              }
            }}
            options={accounts.map(account => ({ value: account, label: account }))}
            size="sm"
            fullWidth
          />
        </div>
      )}
      <nav className="sidebar-nav">
        <ul>
          {items.map((item) => (
            <li
              key={item.view}
              className={`sidebar-item ${
                activeView === item.view ? "active" : ""
              }`}
              onClick={() => onViewChange(item.view)}
              style={{ position: "relative" }}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
              {item.view === "messages" && notificationCount > 0 && (
                <Badge
                  variant="error"
                  size="sm"
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                  }}
                >
                  {notificationCount > 99 ? "99+" : notificationCount}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
