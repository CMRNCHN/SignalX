import { useMemo, useState } from "react";
import type { ContactMeta, Customer, GroupMeta, OutboxItem, OutboxSummary } from "../../api";
import { threadTitle } from "../../format";

type SortColumn = "created_at" | "thread_id" | "state" | "attempt_count";
type Sort = { column: SortColumn; asc: boolean };

type Props = {
  items: OutboxItem[];
  summary: OutboxSummary | null;
  contacts: ContactMeta[];
  groups: GroupMeta[];
  customers: Customer[];
  onRefresh: () => Promise<void>;
  onRetry: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenThread: (threadId: string) => void;
};

/** Global send queue: sortable table, multi-select, bulk retry/clear. */
export function OutboxScreen({
  items,
  summary,
  contacts,
  groups,
  customers,
  onRefresh,
  onRetry,
  onDelete,
  onOpenThread,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>({ column: "created_at", asc: false });

  const title = (threadId: string) => threadTitle(threadId, contacts, groups, customers);

  const counts = useMemo(() => {
    const queued = items.filter((o) => o.state === "queued").length;
    const sending = items.filter((o) => o.state === "sending").length;
    const failed = items.filter((o) => o.state === "failed").length;
    // The local list can be empty before the first refresh; fall back to the daemon's summary.
    if (queued + sending + failed === 0 && summary) return summary;
    return { queued, sending, failed };
  }, [items, summary]);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        let cmp = 0;
        switch (sort.column) {
          case "thread_id":
            cmp = title(a.thread_id).localeCompare(title(b.thread_id));
            break;
          case "state":
            cmp = a.state.localeCompare(b.state);
            break;
          case "attempt_count":
            cmp = (a.attempt_count || 0) - (b.attempt_count || 0);
            break;
          default:
            cmp = b.created_at - a.created_at;
        }
        return sort.asc ? cmp : -cmp;
      }),
    [items, sort, contacts, groups, customers],
  );

  const selectedFailed = items.filter((o) => selected.has(o.id) && o.state === "failed").map((o) => o.id);

  const toggleSort = (column: SortColumn) =>
    setSort((s) => ({ column, asc: s.column === column ? !s.asc : false }));

  const sortMark = (column: SortColumn) => sort.column === column && (sort.asc ? "▲" : "▼");

  const toggleSelected = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const afterBulk = () => {
    setSelected(new Set());
    void onRefresh();
  };

  return (
    <section className="thread-col wide">
      <header className="col-head">
        <div>
          <div>Outbox</div>
          <div className="col-head-sub">
            {counts.queued} queued · {counts.sending} sending · {counts.failed} failed
          </div>
        </div>
      </header>
      <div className="filter-strip">
        <button type="button" className="action-btn" onClick={() => void onRefresh()}>
          Refresh
        </button>
        {selected.size > 0 && (
          <>
            <span className="col-meta">{selected.size} selected</span>
            <button
              type="button"
              className="action-btn"
              disabled={selectedFailed.length === 0}
              onClick={() => {
                if (selectedFailed.length > 0) {
                  void Promise.all(selectedFailed.map((id) => onRetry(id))).then(afterBulk);
                }
              }}
            >
              Retry all
            </button>
            <button
              type="button"
              className="action-btn danger"
              onClick={() => {
                if (confirm(`Delete ${selected.size} message${selected.size === 1 ? "" : "s"}?`)) {
                  void Promise.all(Array.from(selected).map((id) => onDelete(id))).then(afterBulk);
                }
              }}
            >
              Clear selected
            </button>
          </>
        )}
        {items.length > 0 && selected.size === 0 && (
          <span className="col-meta">Last refreshed just now</span>
        )}
      </div>
      <div className="outbox-table">
        {items.length === 0 && <p className="empty">Outbox clear — nothing queued or failed.</p>}
        {items.length > 0 && (
          <div className="outbox-head">
            <span onClick={() => toggleSort("thread_id")} title="Click to sort">
              To {sortMark("thread_id")}
            </span>
            <span>Preview</span>
            <span onClick={() => toggleSort("state")} title="Click to sort">
              Status {sortMark("state")}
            </span>
            <span onClick={() => toggleSort("attempt_count")} title="Click to sort">
              Attempts {sortMark("attempt_count")}
            </span>
            <span>Actions</span>
          </div>
        )}
        {sorted.map((o) => (
          <div key={o.id}>
            <div
              className={`outbox-row state-${o.state} ${selected.has(o.id) ? "selected" : ""}`}
              onClick={(e) => {
                if ((e.target as HTMLElement).tagName !== "BUTTON") toggleSelected(o.id);
              }}
              style={{ cursor: "pointer" }}
            >
              <div className="outbox-to">
                <strong>{title(o.thread_id)}</strong>
              </div>
              <div className="outbox-preview">
                {o.attachment_path && <span className="attach-chip">📎</span>}
                {o.content.slice(0, 100) || (o.attachment_path ? "(attachment)" : "(empty)")}
                {o.content.length > 100 ? "…" : ""}
              </div>
              <span
                className={`status-pill status-${
                  o.state === "failed" ? "danger" : o.state === "sending" ? "warn" : "muted"
                }`}
              >
                {o.state}
              </span>
              <span className="outbox-attempts">
                {o.attempt_count > 0 ? `${o.attempt_count} attempt${o.attempt_count === 1 ? "" : "s"}` : "—"}
              </span>
              <div className="row-actions">
                {o.state === "failed" && (
                  <button
                    type="button"
                    className="action-btn primary"
                    onClick={() => void onRetry(o.id).then(onRefresh)}
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    if (confirm("Delete this message from the outbox?")) {
                      void onDelete(o.id).then(onRefresh);
                    }
                  }}
                >
                  Discard
                </button>
                <button type="button" className="ghost-btn" onClick={() => onOpenThread(o.thread_id)}>
                  Open
                </button>
              </div>
            </div>
            {o.last_error && (
              <div className="outbox-error">
                <span className="error-icon">⚠️</span>
                <div>
                  <div className="error-message">This number isn't on Signal</div>
                  <div className="error-detail">{o.last_error}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
