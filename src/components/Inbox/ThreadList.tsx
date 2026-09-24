import type { Dispatch, MouseEvent, SetStateAction } from "react";
import type { ContactMeta, Customer, GroupMeta, ThreadSummary } from "../../api";
import { avatarTint, fmtTime, initials, threadTitle } from "../../format";
import { IconCompose } from "../../navIcons";

export type ThreadFilter = {
  kind: "all" | "dm" | "group";
  unread: boolean;
  pending: boolean;
};

export const EMPTY_THREAD_FILTER: ThreadFilter = { kind: "all", unread: false, pending: false };

type Props = {
  threads: ThreadSummary[];
  filteredThreads: ThreadSummary[];
  selectedId: string | null;
  contacts: ContactMeta[];
  groups: GroupMeta[];
  customers: Customer[];
  filter: ThreadFilter;
  onFilterChange: Dispatch<SetStateAction<ThreadFilter>>;
  newDmOpen: boolean;
  onToggleNewDm: () => void;
  newDmPhone: string;
  onNewDmPhoneChange: (value: string) => void;
  newDmError: string | null;
  onStartNewDm: () => void;
  onSelectThread: (id: string) => void;
  onThreadContextMenu: (e: MouseEvent, id: string) => void;
};

/** Messages column: new-DM strip, filter chips, and the thread rows. */
export function ThreadList({
  threads,
  filteredThreads,
  selectedId,
  contacts,
  groups,
  customers,
  filter,
  onFilterChange,
  newDmOpen,
  onToggleNewDm,
  newDmPhone,
  onNewDmPhoneChange,
  newDmError,
  onStartNewDm,
  onSelectThread,
  onThreadContextMenu,
}: Props) {
  return (
    <section className="thread-col">
      <header className="col-head">
        Messages
        <button
          type="button"
          className={newDmOpen ? "icon-btn active" : "icon-btn"}
          aria-label="New message"
          aria-pressed={newDmOpen}
          title="New message"
          onClick={onToggleNewDm}
        >
          <IconCompose />
        </button>
      </header>
      {newDmOpen && (
        <div className="compose-strip">
          <input
            autoFocus
            placeholder="+15551234567"
            value={newDmPhone}
            onChange={(e) => onNewDmPhoneChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onStartNewDm()}
            aria-invalid={!!newDmError}
          />
          <button type="button" className="action-btn primary" onClick={onStartNewDm}>
            Start
          </button>
          {newDmError && <span className="warn-text">{newDmError}</span>}
        </div>
      )}
      <div className="filter-strip">
        <div className="chip-row">
          {(["all", "dm", "group"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={filter.kind === k ? "chip active" : "chip"}
              onClick={() => onFilterChange((f) => ({ ...f, kind: k }))}
            >
              {k === "all" ? "All" : k === "dm" ? "Direct" : "Groups"}
            </button>
          ))}
          <span className="chip-sep" aria-hidden />
          <button
            type="button"
            className={filter.unread ? "chip active" : "chip"}
            aria-pressed={filter.unread}
            onClick={() => onFilterChange((f) => ({ ...f, unread: !f.unread }))}
          >
            Unread
          </button>
          <button
            type="button"
            className={filter.pending ? "chip active" : "chip"}
            aria-pressed={filter.pending}
            onClick={() => onFilterChange((f) => ({ ...f, pending: !f.pending }))}
          >
            Pending
          </button>
          <span className="chip-count">
            {filteredThreads.length}/{threads.length}
          </span>
        </div>
      </div>
      <div className="thread-list">
        {threads.length === 0 && (
          <p className="empty">No threads yet — open a chat above or wait for Signal traffic.</p>
        )}
        {threads.length > 0 && filteredThreads.length === 0 && (
          <p className="empty">No threads match these filters.</p>
        )}
        {filteredThreads.map((t) => {
          const name = threadTitle(t.id, contacts, groups, customers);
          return (
            <button
              key={t.id}
              type="button"
              className={selectedId === t.id ? "thread-row active p-3 gap-3" : "thread-row p-3 gap-3"}
              onClick={() => onSelectThread(t.id)}
              onContextMenu={(e) => onThreadContextMenu(e, t.id)}
            >
              <span className="avatar-dot" style={avatarTint(t.id)} aria-hidden>
                {initials(name)}
              </span>
              <div className="thread-row-body">
                <div className="thread-row-top">
                  <span className="thread-name">{name}</span>
                  <span className="thread-time">{fmtTime(t.last_message_timestamp)}</span>
                </div>
                <div className="thread-row-meta">
                  {t.last_preview ? (
                    <span className="snippet">{t.last_preview}</span>
                  ) : (
                    <span className="snippet muted">No messages yet</span>
                  )}
                  {t.unread_count > 0 && <span className="badge">{t.unread_count}</span>}
                  {t.outbox_count > 0 && <span className="badge muted">{t.outbox_count} pending</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
