import type { Contact, Thread } from "../../context/types";
import { Avatar } from "../shared/Avatar";
import { Badge } from "../shared/Badge";
import { fmtTime } from "../shared/format";

export function ThreadItem({
  thread,
  contact,
  active,
  onSelect,
}: {
  thread: Thread;
  contact: Contact | undefined;
  active: boolean;
  onSelect: () => void;
}) {
  const title = contact?.alias || contact?.name || thread.buyerId;
  const lastTs = thread.messages[thread.messages.length - 1]?.timestamp ?? 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left ${
        active ? "bg-[var(--panel-2)] ring-1 ring-[var(--accent-cta)]" : "hover:bg-[var(--panel-2)]"
      }`}
    >
      <Avatar label={title} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-[var(--text)]">{title}</span>
          <span className="shrink-0 text-xs text-[var(--text-dim)]">{fmtTime(lastTs)}</span>
        </div>
        <p className="mt-1 truncate text-[var(--text-dim)]">{thread.lastMessage}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {thread.unread > 0 && <Badge tone="cta">{thread.unread}</Badge>}
          {thread.needsSend && <Badge tone="warn">Needs send</Badge>}
          {thread.kind === "group" && <Badge>Group</Badge>}
        </div>
      </div>
    </button>
  );
}
