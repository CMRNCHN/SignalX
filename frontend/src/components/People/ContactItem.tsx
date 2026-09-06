import type { Contact } from "../../context/types";
import { Avatar } from "../shared/Avatar";
import { Badge } from "../shared/Badge";

export function ContactItem({
  contact,
  active,
  onSelect,
}: {
  contact: Contact;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left ${
        active ? "bg-[var(--panel-2)] ring-1 ring-[var(--accent-cta)]" : "hover:bg-[var(--panel-2)]"
      }`}
    >
      <Avatar label={contact.name} />
      <div className="min-w-0">
        <p className="truncate font-medium">{contact.alias || contact.name}</p>
        <p className="truncate text-sm text-[var(--text-dim)]">{contact.phone}</p>
      </div>
      <div className="ml-auto flex flex-wrap justify-end gap-1">
        {contact.meta?.vip && <Badge tone="warn">VIP</Badge>}
        {contact.meta?.favorite && <Badge tone="cta">Fav</Badge>}
      </div>
    </button>
  );
}
