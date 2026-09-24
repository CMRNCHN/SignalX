import type { RefObject } from "react";
import type { ContactMeta, Customer, GroupMeta, Message, OutboxItem } from "../../api";
import { AttachmentPreview } from "../../attachmentPreview";
import { fmtTime, isGroupThread, isOutgoing, threadTitle } from "../../format";

/** A gap longer than this between two messages gets a separator. */
const SEPARATOR_GAP_MS = 5 * 60 * 1000;

type Props = {
  threadId: string;
  messages: Message[];
  /** Outbox items for this thread only, rendered as pending bubbles. */
  pending: OutboxItem[];
  contacts: ContactMeta[];
  groups: GroupMeta[];
  customers: Customer[];
  bottomRef: RefObject<HTMLDivElement | null>;
  onRetry: (outboxId: string) => void;
  onDiscard: (outboxId: string) => void;
};

/** Scrollable message history followed by this thread's pending sends. */
export function MessageList({
  threadId,
  messages,
  pending,
  contacts,
  groups,
  customers,
  bottomRef,
  onRetry,
  onDiscard,
}: Props) {
  const senderLabel = (m: Message) => {
    if (isOutgoing(m)) return "You";
    return isGroupThread(threadId)
      ? threadTitle(m.sender, contacts, groups, customers)
      : threadTitle(threadId || m.sender, contacts, groups, customers);
  };

  return (
    <div className="msg-scroll">
      {messages.map((m, idx) => {
        const prev = idx > 0 ? messages[idx - 1] : null;
        const senderChanged = prev && (isOutgoing(m) !== isOutgoing(prev) || m.sender !== prev.sender);
        const timeGap = prev && m.timestamp - prev.timestamp > SEPARATOR_GAP_MS;
        const showSeparator = idx > 0 && (senderChanged || timeGap);

        return (
          <div key={m.id}>
            {showSeparator && <div className="msg-separator" />}
            <div className={isOutgoing(m) ? "bubble out" : "bubble in"}>
              <div className="bubble-meta">
                <span>{senderLabel(m)}</span>
                <span>{fmtTime(m.timestamp)}</span>
              </div>
              <div className="bubble-body">{m.content}</div>
              {m.attachment_path && <AttachmentPreview path={m.attachment_path} />}
            </div>
          </div>
        );
      })}
      {pending.map((o) => (
        <div key={o.id} className={`bubble out pending state-${o.state}`}>
          <div className="bubble-meta">
            <span>
              {o.state}
              {o.attempt_count > 0 ? ` (attempt ${o.attempt_count})` : ""}
            </span>
            <span>{fmtTime(o.created_at)}</span>
          </div>
          <div className="bubble-body">{o.content}</div>
          {o.attachment_path && <AttachmentPreview path={o.attachment_path} />}
          {o.last_error && <div className="bubble-err">{o.last_error}</div>}
          <div className="bubble-actions">
            {o.state === "failed" && (
              <button type="button" onClick={() => onRetry(o.id)}>
                Retry
              </button>
            )}
            <button type="button" onClick={() => onDiscard(o.id)}>
              Discard
            </button>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
