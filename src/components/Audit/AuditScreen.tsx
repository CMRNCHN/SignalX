import { useMemo, useState } from "react";
import type { AutoReplyAuditEntry, CommerceAuditEvent } from "../../api";
import type { SimpleAuditEntry } from "../../api";

export type AuditSource = "all" | "ivr" | "commerce" | "outbox" | "auto-reply";

export type UnifiedAuditRow = {
  id: string;
  source: Exclude<AuditSource, "all">;
  created_at: number;
  thread_id: string;
  summary: string;
  outcome: string;
};

type Props = {
  autoReply: AutoReplyAuditEntry[];
  commerce: CommerceAuditEvent[];
  ivr: SimpleAuditEntry[];
  outbox: SimpleAuditEntry[];
  threadTitle: (id: string) => string;
  fmtTime: (ts: number) => string;
  onOpenThread: (threadId: string) => void;
};

export function unifyAuditRows(props: {
  autoReply: AutoReplyAuditEntry[];
  commerce: CommerceAuditEvent[];
  ivr: SimpleAuditEntry[];
  outbox: SimpleAuditEntry[];
}): UnifiedAuditRow[] {
  const rows: UnifiedAuditRow[] = [
    ...props.autoReply.map((e) => ({
      id: `auto-${e.id}`,
      source: "auto-reply" as const,
      created_at: e.created_at,
      thread_id: e.thread_id,
      summary: e.draft,
      outcome: e.outcome + (e.reason ? ` · ${e.reason}` : ""),
    })),
    ...props.commerce.map((e) => ({
      id: `commerce-${e.id}`,
      source: "commerce" as const,
      created_at: e.created_at,
      thread_id: e.thread_id || "",
      summary: e.summary,
      outcome: e.kind,
    })),
    ...props.ivr.map((e) => ({
      id: `ivr-${e.id}`,
      source: "ivr" as const,
      created_at: e.created_at,
      thread_id: e.thread_id,
      summary: e.summary,
      outcome: e.outcome,
    })),
    ...props.outbox.map((e) => ({
      id: `outbox-${e.id}`,
      source: "outbox" as const,
      created_at: e.created_at,
      thread_id: e.thread_id,
      summary: e.summary,
      outcome: e.outcome,
    })),
  ];
  rows.sort((a, b) => b.created_at - a.created_at);
  return rows;
}

const SOURCES: { id: AuditSource; label: string }[] = [
  { id: "all", label: "All sources" },
  { id: "ivr", label: "IVR" },
  { id: "commerce", label: "Commerce" },
  { id: "outbox", label: "Outbox" },
  { id: "auto-reply", label: "Auto-reply" },
];

export function AuditScreen({
  autoReply,
  commerce,
  ivr,
  outbox,
  threadTitle,
  fmtTime,
  onOpenThread,
}: Props) {
  const [source, setSource] = useState<AuditSource>("all");
  const [q, setQ] = useState("");
  const [threadQ, setThreadQ] = useState("");

  const rows = useMemo(
    () => unifyAuditRows({ autoReply, commerce, ivr, outbox }),
    [autoReply, commerce, ivr, outbox],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const threadNeedle = threadQ.trim().toLowerCase();
    return rows.filter((r) => {
      if (source !== "all" && r.source !== source) return false;
      const title = r.thread_id ? threadTitle(r.thread_id) : "";
      if (threadNeedle && !`${r.thread_id} ${title}`.toLowerCase().includes(threadNeedle)) {
        return false;
      }
      if (
        needle &&
        !`${r.summary} ${r.outcome} ${title} ${r.source}`.toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, source, q, threadQ, threadTitle]);

  return (
    <section className="thread-col wide">
      <header className="col-head">
        Audit
        <span className="col-meta">
          {filtered.length}/{rows.length}
        </span>
      </header>
      <div className="filter-strip">
        <input placeholder="Filter feed…" value={q} onChange={(e) => setQ(e.target.value)} />
        <input
          placeholder="Filter by thread…"
          value={threadQ}
          onChange={(e) => setThreadQ(e.target.value)}
          aria-label="Filter by thread"
        />
        <select
          aria-label="Audit source"
          value={source}
          onChange={(e) => setSource(e.target.value as AuditSource)}
        >
          {SOURCES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="audit-list">
        {rows.length === 0 && <p className="empty">No audit activity yet.</p>}
        {rows.length > 0 && filtered.length === 0 && (
          <p className="empty">No audit rows match these filters.</p>
        )}
        {filtered.map((e) => (
          <div key={e.id} className="audit-row">
            <div className="audit-top">
              <span className={`outcome outcome-${e.source}`}>{e.source}</span>
              <span className="thread-time">{fmtTime(e.created_at)}</span>
            </div>
            {e.thread_id ? (
              <button type="button" className="audit-thread linkish" onClick={() => onOpenThread(e.thread_id)}>
                {threadTitle(e.thread_id)}
              </button>
            ) : (
              <div className="audit-thread">—</div>
            )}
            <div className="snippet">{e.summary}</div>
            {e.outcome && <div className="reason">{e.outcome}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
