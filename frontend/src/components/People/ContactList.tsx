import { useMemo, useState } from "react";
import { useContacts } from "../../context/SignalXContext";
import { SearchBar } from "../shared/SearchBar";
import { ContactItem } from "./ContactItem";

export function ContactList() {
  const { contacts, selectedContactId, setSelectedContactId } = useContacts();
  const [q, setQ] = useState("");
  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((c) =>
      `${c.name} ${c.alias ?? ""} ${c.phone} ${c.email ?? ""}`.toLowerCase().includes(query),
    );
  }, [contacts, q]);

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <SearchBar placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {visible.length === 0 && <p className="p-3 text-[var(--text-dim)]">No contacts match.</p>}
        {visible.map((c) => (
          <ContactItem
            key={c.id}
            contact={c}
            active={selectedContactId === c.id}
            onSelect={() => setSelectedContactId(c.id)}
          />
        ))}
      </div>
    </section>
  );
}
