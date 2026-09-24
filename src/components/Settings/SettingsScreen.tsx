import type { ReactNode } from "react";

export type SettingsTab = "account" | "ivr" | "auto" | "backup";

const TABS: { id: SettingsTab; label: string; subtitle: string }[] = [
  { id: "account", label: "Account", subtitle: "Link Signal and check that messages are flowing" },
  { id: "ivr", label: "Buyer menu", subtitle: "Let buyers text a number — you write the menu" },
  { id: "auto", label: "Auto-reply", subtitle: "Optional AI replies — only for chats you allow" },
  { id: "backup", label: "Backup", subtitle: "Copy your catalog, orders, and chats to a file" },
];

type Props = {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  /** The active tab's body. */
  children: ReactNode;
};

/** Settings shell: header, tab strip, and the active tab's cards. */
export function SettingsScreen({ tab, onTabChange, children }: Props) {
  return (
    <section className="thread-col wide">
      <header className="col-head">
        <div>
          <div>Settings</div>
          <div className="col-head-sub">{TABS.find((t) => t.id === tab)?.subtitle}</div>
        </div>
      </header>
      <div className="work-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "work-tab active" : "work-tab"}
            onClick={() => onTabChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="settings-body wide-body">{children}</div>
    </section>
  );
}
