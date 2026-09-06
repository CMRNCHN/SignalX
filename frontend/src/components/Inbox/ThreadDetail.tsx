import { useEffect, useRef, useState } from "react";
import { useContacts, useThreads } from "../../context/SignalXContext";
import { Button } from "../shared/Button";
import { fmtTime } from "../shared/format";

export function ThreadDetail() {
  const { threads, selectedThreadId, appendLocalReply } = useThreads();
  const { contacts } = useContacts();
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const thread = threads.find((t) => t.id === selectedThreadId) ?? null;
  const contact = contacts.find((c) => c.id === thread?.buyerId);

  useEffect(() => {
    setDraft("");
    bottom.current?.scrollIntoView({ block: "end" });
  }, [selectedThreadId, thread?.messages.length]);

  if (!thread) {
    return (
      <main className="flex h-full min-h-0 flex-col items-center justify-center gap-3 rounded-xl bg-[var(--panel)] p-4">
        <h1 className="text-2xl font-semibold">SignalX</h1>
        <p className="text-[var(--text-dim)]">Select a thread to read and reply.</p>
      </main>
    );
  }

  const title = contact?.alias || contact?.name || thread.buyerId;

  return (
    <main className="flex h-full min-h-0 flex-col rounded-xl bg-[var(--panel)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <div>
          <h2 className="text-base font-medium">{title}</h2>
          <p className="text-sm text-[var(--text-dim)]">{contact?.phone ?? thread.buyerId}</p>
        </div>
        <span className="text-sm text-[var(--text-dim)]">{thread.status}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        {thread.messages.map((m) => {
          const outgoing = m.role === "seller";
          return (
            <div key={m.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-xl px-3 py-2 ${
                  outgoing
                    ? "bg-[var(--bubble-out)] text-[var(--text)]"
                    : "bg-[var(--bubble-in)] text-[var(--text)]"
                }`}
              >
                <p>{m.text}</p>
                <p className="mt-1 text-xs text-[var(--text-dim)]">{fmtTime(m.timestamp)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form
        className="flex gap-2 border-t border-[var(--border)] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          appendLocalReply(thread.id, draft);
          setDraft("");
        }}
      >
        <textarea
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 outline-none"
          placeholder="Write a message… (Enter to send)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              appendLocalReply(thread.id, draft);
              setDraft("");
            }
          }}
        />
        <Button variant="primary" type="submit" disabled={!draft.trim()}>
          Send
        </Button>
      </form>
    </main>
  );
}
