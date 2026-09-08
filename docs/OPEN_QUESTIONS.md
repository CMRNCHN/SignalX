# Open Questions: UI Architecture

Read-only audit of src/App.tsx and src/api.ts. Three architectural questions examined.

---

## 1. Message Arrival: Events vs. Polling

**Question**: Do inbound Signal messages arrive via Tauri events or a subscription, or does the UI poll on an interval?

**Answer**: **Tauri events** (primary) + **polling** (secondary).

- **Event subscription** (`src/App.tsx:524`): Messages arrive via `onEvent("message://new", ...)`. This handler triggers `refreshThreads()` and `refreshMessages()` when a new message event fires from the backend.
- **Polling** (`src/App.tsx:605–612`): A 15-second interval poll fetches `getReceiveLoopState()` and `checkAiStatus()` for health/status, not for new messages.

**Citation**: 
```typescript
// src/App.tsx:524
await onEvent<{ thread_id?: string }>("message://new", (p) => {
  void refreshThreads();
  const cur = selectedRef.current;
  if (p.thread_id && p.thread_id === cur) void refreshMessages(p.thread_id);
}),
```

And polling loop:
```typescript
// src/App.tsx:605–612
const poll = window.setInterval(() => {
  void api.getReceiveLoopState().then((r) => {
    if (r.success) setHealth(r.data);
  });
  void api.checkAiStatus().then((r) => {
    if (r.success) setAi(r.data);
  });
}, 15000);
```

---

## 2. Thread Preview Text Source

**Question**: The thread list renders message preview text, but ThreadSummary has only `last_message_timestamp` and no message text. Where does the preview come from?

**Answer**: **The thread list does NOT currently render message preview text.** This is a gap between the expected behavior and implementation.

The thread row (`src/App.tsx:1960–1984`) renders only:
- Avatar with contact initials
- Thread name (from `threadTitle()`)
- Time (from `last_message_timestamp`)
- Badge counts (unread, outbox pending)

There is no message preview/snippet field displayed.

**Citation**:
```typescript
// src/App.tsx:1973–1982
<div className="thread-row-body">
  <div className="thread-row-top">
    <span className="thread-name">{threadTitle(t.id, contacts, groups, customers)}</span>
    <span className="thread-time">{fmtTime(t.last_message_timestamp)}</span>
  </div>
  <div className="thread-row-meta">
    {t.unread_count > 0 && <span className="badge">{t.unread_count}</span>}
    {t.outbox_count > 0 && <span className="badge muted">{t.outbox_count} pending</span>}
  </div>
</div>
```

**ThreadSummary schema** (`src/api.ts:21–28`):
```typescript
export interface ThreadSummary {
  id: string;
  participants: string[];
  last_message_timestamp: number;
  unread_count: number;
  message_count: number;
  outbox_count: number;
}
```

**Implication**: To render message previews, either (a) extend ThreadSummary with a `last_message_content` field from the backend, or (b) fetch the latest message separately after fetching threads.

---

## 3. Contact Notes: Storage and Persistence

**Question**: The profile rail has a notes field with a save button, but ContactMeta has no notes field. Where are contact notes stored and what command persists them?

**Answer**: **Notes are stored in the `Customer` type, not `ContactMeta`.** They are persisted via `api.upsertCustomer()`.

The notes field in ProfileRail is bound to the `Customer.notes` field, not a ContactMeta field. When saved, the UI calls:

```typescript
// src/App.tsx:4044–4047
const res = await api.upsertCustomer({
  ...profileCustomer,
  notes,
});
```

**Citation**:
- ProfileRail notes state (`src/ProfileRail.tsx:143`): `const [notes, setNotes] = useState(customer?.notes ?? "");`
- Notes save handler (`src/App.tsx:4038–4054`): Calls `api.upsertCustomer()` with updated notes.
- Customer type (`src/api.ts:319–325`):
  ```typescript
  export interface Customer {
    id: string;
    thread_id: string;
    display_name: string;
    notes: string;
    updated_at: number;
  }
  ```

**Constraint**: Notes can only be saved if the thread is linked as a customer. Attempting to save without a customer link shows: `"Link as customer before saving notes"` (`src/App.tsx:4041`).

---

## Architectural Implications

1. **Event-driven messaging** avoids polling every message; efficient for real-time notification.
2. **Missing preview text** is a UX gap; threads show only metadata, not recent message content. Fixing requires backend schema change or separate message fetch.
3. **Notes live in Customer, not ContactMeta** — two separate metadata tiers. ContactMeta is contact-level (favorite, muted, categories); Customer is transaction-level (display_name, notes, linked to thread).

---

## Correction — Thread Preview Text

**Statement**: My previous report stated the thread list renders no message preview. The running app proves otherwise.

**What I searched for and did not find**: 
- The inbox thread row JSX at `src/App.tsx:1960–1984` contains no `<div className="snippet">` or similar preview field
- No call to extract last message content from the `messages` state
- No conditional rendering of preview text
- No getLastMessage() helper or similar function

**What exists**: Search results DO render previews via `src/App.tsx:2022`: `<div className="snippet">{h.snippet}</div>`, where `SearchResult` includes a `snippet` field.

**Conclusion**: Either:
1. The preview text is injected via CSS pseudo-elements or JavaScript after render (not visible in JSX source)
2. The code differs from what's running
3. I missed a rendering path or conditional logic

**Citation of inbox thread row** (`src/App.tsx:1960–1984`):
```typescript
{filteredThreads.map((t) => (
  <button
    key={t.id}
    type="button"
    className={selectedId === t.id ? "thread-row active" : "thread-row"}
    onClick={() => {
      setSelectedId(t.id);
      setPanel("threads");
    }}
  >
    <span className="avatar-dot" aria-hidden>
      {initials(threadTitle(t.id, contacts, groups, customers))}
    </span>
    <div className="thread-row-body">
      <div className="thread-row-top">
        <span className="thread-name">{threadTitle(t.id, contacts, groups, customers)}</span>
        <span className="thread-time">{fmtTime(t.last_message_timestamp)}</span>
      </div>
      <div className="thread-row-meta">
        {t.unread_count > 0 && <span className="badge">{t.unread_count}</span>}
        {t.outbox_count > 0 && <span className="badge muted">{t.outbox_count} pending</span>}
      </div>
    </div>
  </button>
))}
```

No preview/snippet field is rendered in this JSX.
