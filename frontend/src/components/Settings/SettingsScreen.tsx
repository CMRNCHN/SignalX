import { useState } from "react";
import { Nav } from "../shared/Nav";
import { AccountTab } from "./AccountTab";
import { DeliveryTab } from "./DeliveryTab";
import { ThemeToggle } from "./ThemeToggle";

type Tab = "account" | "delivery" | "theme";

export function SettingsScreen() {
  const [tab, setTab] = useState<Tab>("theme");
  return (
    <div className="grid h-screen min-h-0 grid-cols-[minmax(180px,200px)_1fr] gap-2 overflow-hidden p-2">
      <Nav />
      <section className="flex min-h-0 flex-col gap-4 overflow-auto rounded-xl bg-[var(--panel)] p-4">
        <header>
          <h1 className="text-base font-medium">Settings</h1>
          <p className="text-sm text-[var(--text-dim)]">Fixture UI — theme is live; other tabs are stubs.</p>
        </header>
        <div className="flex gap-2">
          {(
            [
              ["theme", "Theme"],
              ["account", "Account"],
              ["delivery", "Delivery"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-lg px-4 py-2 ${
                tab === id ? "bg-[var(--accent-cta)] text-white" : "bg-[var(--panel-2)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "theme" && <ThemeToggle />}
        {tab === "account" && <AccountTab />}
        {tab === "delivery" && <DeliveryTab />}
      </section>
    </div>
  );
}
