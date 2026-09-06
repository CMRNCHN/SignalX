import { useContacts } from "../../context/SignalXContext";
import { Avatar } from "../shared/Avatar";
import { Badge } from "../shared/Badge";

export function ContactDetail() {
  const { contacts, selectedContactId } = useContacts();
  const contact = contacts.find((c) => c.id === selectedContactId);
  if (!contact) {
    return <p className="text-[var(--text-dim)]">Select a person to view details.</p>;
  }
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar label={contact.name} />
        <div>
          <h2 className="text-base font-medium">{contact.name}</h2>
          {contact.alias && <p className="text-sm text-[var(--text-dim)]">{contact.alias}</p>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Phone</dt>
          <dd className="mt-1">{contact.phone}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Email</dt>
          <dd className="mt-1">{contact.email ?? "—"}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-1">
        {contact.meta?.favorite && <Badge tone="cta">Favorite</Badge>}
        {contact.meta?.vip && <Badge tone="warn">VIP</Badge>}
        {contact.meta?.coresBuyer && <Badge tone="ok">Cores buyer</Badge>}
      </div>
      {contact.meta?.notes && <p className="text-[var(--text-dim)]">{contact.meta.notes}</p>}
    </section>
  );
}
