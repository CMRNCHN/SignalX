import { useMemo, useState } from "react";
import { useContacts, useThreads } from "../../context/SignalXContext";
import type { Contact } from "../../context/types";
import { SearchBar } from "../shared/SearchBar";
import { ThreadItem } from "./ThreadItem";

export type ThreadFilter = "all" | "unread" | "needsSend" | "dms";
export type SegmentFilter = "favorite" | "vip" | "coresBuyer" | null;

const FILTERS: { id: ThreadFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "needsSend", label: "Needs send" },
  { id: "dms", label: "DMs" },
];

export function ThreadList({
  segment,
}: {
  segment: SegmentFilter;
}) {
  const { threads, selectedThreadId, setSelectedThreadId } = useThreads();
  const { contacts } = useContacts();
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const [q, setQ] = useState("");

  const byId = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return threads.filter((t) => {
      const contact = byId.get(t.buyerId);
      if (filter === "unread" && t.unread < 1) return false;
      if (filter === "needsSend" && !t.needsSend) return false;
      if (filter === "dms" && t.kind !== "dm") return false;
      if (segment === "favorite" && !contact?.meta?.favorite) return false;
      if (segment === "vip" && !contact?.meta?.vip) return false;
      if (segment === "coresBuyer" && !contact?.meta?.coresBuyer) return false;
      if (query) {
        const hay = `${contact?.name ?? ""} ${contact?.alias ?? ""} ${t.lastMessage}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [threads, byId, filter, segment, q]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 rounded-xl bg-[var(--panel)] p-4">
      <header className="text-sm font-medium text-[var(--text)]">Threads</header>
      <SearchBar
        placeholder="Filter threads…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-lg px-3 py-1 ${
              filter === f.id
                ? "bg-[var(--accent-cta)] text-white"
                : "bg-[var(--panel-2)] text-[var(--text-dim)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {visible.length === 0 && (
          <p className="p-3 text-[var(--text-dim)]">No threads match these filters.</p>
        )}
        {visible.map((t) => (
          <ThreadItem
            key={t.id}
            thread={t}
            contact={byId.get(t.buyerId)}
            active={selectedThreadId === t.id}
            onSelect={() => setSelectedThreadId(t.id)}
          />
        ))}
      </div>
    </section>
  );
}
