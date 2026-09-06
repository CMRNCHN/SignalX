import type { ScreenId } from "../context/types";
import { Nav } from "./shared/Nav";

const COPY: Record<Exclude<ScreenId, "inbox" | "people" | "menu" | "settings">, string> = {
  catalog: "Catalog is a stub in Phase 1.",
  orders: "Orders is a stub in Phase 1.",
  sales: "Sales is a stub in Phase 1.",
  outbox: "Outbox is a stub in Phase 1.",
  audit: "Audit is a stub in Phase 1.",
};

export function StubScreen({ id }: { id: keyof typeof COPY }) {
  return (
    <div className="grid h-screen min-h-0 grid-cols-[minmax(180px,200px)_1fr] gap-2 overflow-hidden p-2">
      <Nav />
      <section className="flex items-center justify-center rounded-xl bg-[var(--panel)] p-4 text-[var(--text-dim)]">
        {COPY[id]} Coming in a later phase.
      </section>
    </div>
  );
}
