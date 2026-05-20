import React from "react";
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
          <select
            id="account-select"
            value={activeAccount || ""}
            onChange={(e) => {
              if (onAccountChange && e.target.value) {
                onAccountChange(e.target.value);
              }
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              backgroundColor: "#272c33",
              border: "1px solid #3a4149",
              borderRadius: "6px",
              color: "#cbd2d9",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            {accounts.map((account) => (
              <option key={account} value={account}>
                {account}
              </option>
            ))}
          </select>
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
                <span
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    backgroundColor: "#FFB1A8",
                    color: "#1A1C1F",
                    borderRadius: "10px",
                    padding: "2px 6px",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    minWidth: "18px",
                    textAlign: "center",
                  }}
                >
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
