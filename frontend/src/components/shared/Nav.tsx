import { useAppScreen } from "../../context/SignalXContext";
import type { ScreenId } from "../../context/types";
import {
  IconAudit,
  IconCatalog,
  IconContacts,
  IconMessages,
  IconOrders,
  IconOutbox,
  IconSettings,
} from "../../navIcons";

const ITEMS: { id: ScreenId; label: string; icon: typeof IconMessages }[] = [
  { id: "inbox", label: "Inbox", icon: IconMessages },
  { id: "people", label: "People", icon: IconContacts },
  { id: "menu", label: "Menu Builder", icon: IconAudit },
  { id: "catalog", label: "Catalog", icon: IconCatalog },
  { id: "orders", label: "Orders", icon: IconOrders },
  { id: "sales", label: "Sales", icon: IconAudit },
  { id: "outbox", label: "Outbox", icon: IconOutbox },
  { id: "audit", label: "Audit", icon: IconAudit },
  { id: "settings", label: "Settings", icon: IconSettings },
];

export function Nav() {
  const { screen, setScreen } = useAppScreen();
  return (
    <aside className="flex h-full min-h-0 flex-col gap-4 rounded-xl bg-[var(--panel)] p-4">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-semibold uppercase tracking-wide text-[var(--text)]">
          SignalX
        </span>
        <span
          className="h-2.5 w-2.5 rounded-full bg-[var(--ok)]"
          title="Fixture session"
        />
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {ITEMS.map(({ id, label, icon: Icon }) => {
          const active = screen === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setScreen(id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left ${
                active
                  ? "bg-[var(--panel-2)] text-[var(--text)] ring-1 ring-[var(--accent-cta)]"
                  : "text-[var(--text-dim)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
              }`}
            >
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
