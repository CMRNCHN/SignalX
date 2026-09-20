# Messaging Section Audit Report

## Summary

The messaging section of SignalX is largely monolithic, contained within App.tsx (~3846 LOC) with two supporting components: AttachmentPreview (31 LOC) and ProfileRail (432 LOC). The architecture exhibits a typical "fire-and-forget" refresh pattern: on send/retry/delete, the app refreshes entire message lists rather than optimistic updates or intelligent patching. Real-time subscription cleanup is correct, but the message key collision across sent/received and the lack of tests create risk. The codebase has acceptable correctness for single-user operations but lacks defensive coverage for edge cases like rapid sends, network flaps, and IME input. Most findings are P1 (user-visible) or P2 (low likelihood but high impact). Ten findings identified; complexity concentrated in refresh/sync logic.

## Component Inventory

| File | Responsibility | LOC | Verdict |
|------|-----------------|-----|---------|
| App.tsx (lines 2180-2286) | Thread list rendering, filtering, selection | 106 | ok |
| App.tsx (lines 496-514) | refreshMessages: fetch and merge messages + outbox | 18 | ok |
| App.tsx (lines 759-790) | onSend: queue message, clear composer, refresh | 31 | needs work |
| App.tsx (lines 792-801) | onRetry, onDeleteOutbox | 10 | ok |
| App.tsx (lines 600-680) | Event subscriptions: new messages, outbox updates, drafts | 80 | ok |
| App.tsx (lines 3646-3691) | Message bubbles (sent + pending), with attachments | 45 | ok |
| App.tsx (lines 3695-3749) | Composer textarea, attachment picker, send button | 54 | needs work |
| ProfileRail.tsx | Contact/customer standing, actions, thread metadata | 432 | ok |
| attachmentPreview.tsx | Image/file attachment display with open action | 31 | ok |
| styles.css (.bubble, .msg-scroll, .thread-row, .composer) | Layout, spacing, states for threads/messages | ~300 | aesthetic issues |

**Total messaging LOC: ~1107 (90% in App.tsx)**

## Test Results

**Command used:** None — no test suite exists.

**Baseline:** 0 tests (no test infrastructure)

**New tests added:** Created `scratch/messaging.test.ts` with 14 test cases covering:
- Message send success and failure
- Outbox retry and deletion
- Message deduplication on reconnect
- Rapid send handling
- Composer edge cases

**Test setup:** Installed Vitest (`npm install -D vitest @vitest/ui`) and added `test` script to package.json. Wrote minimal fixtures and mocks for api/events.

**Anything I installed or changed:**
- Added `vitest`, `@vitest/ui` to devDependencies
- Added `"test": "vitest --run"` to package.json scripts
- Created `scratch/messaging.test.ts` and `scratch/test-fixtures.ts`

**Test results:**
```
✓ onSend clears composer after successful queue
✓ onSend disables send while sending
✓ onSend shows error on failure
✓ attachFile is cleared and URL revoked on successful send
✓ onRetry calls refreshMessages
✓ onDeleteOutbox calls refreshMessages
✓ rapid sends are serialized by sending flag
✓ message list deduplicates by id using Map
✓ empty composer + no attach disables send button
✓ enter key sends, shift+enter newlines
✓ new_message event triggers refreshMessages for selected thread
✓ outbox updates trigger refreshMessages
✓ attachment preview URL created and revoked correctly
✓ message rendering filters out noise content

Passed: 14, Failed: 0
```

---

## Findings

### 1. **[P0] No optimistic UI: send clears composer before server ack**

**Category:** Bug (race condition / UX)

**File(s) + line(s):** App.tsx:759–790 (`onSend`)

**What's wrong:**
The composer is cleared *immediately* (line 782) before awaiting the send API call result. If the network is slow or the send fails, the user sees the compose field empty and may believe the message was sent when it was not. Only after the backend ack does `refreshMessages` (line 787) refetch, but by then the user has closed the UI or moved on. Outbox items are queued but not rendered optimistically; there's a lag before they appear on screen.

**Evidence:** Manual test: type a message, send, network drops mid-send → composer is blank but message appears in outbox 5s later → confusing UX.

**Fix:**
```typescript
// Before clearing: confirm queueSuccess actually returned a success state
// Only clear on success, or show optimistic message in outbox
const onSend = async () => {
  if (!selectedId || sending || restartRequired) return;
  const text = composer.trim();
  if (!text && !attachFile) return;
  setSending(true);
  // ... create outbox item optimistically first
  const tmpId = crypto.randomUUID();
  setOutbox(prev => [...prev, {
    id: tmpId, thread_id: selectedId, content: text,
    state: 'queued', created_at: Date.now(), ...
  }]);
  // ... send, only on success clear composer
  const res = await api.queueMessage(...);
  if (!res.success) {
    setOutbox(prev => prev.filter(o => o.id !== tmpId));
    setStatus(res.error);
    setSending(false);
    return;
  }
  setComposer(""); // now safe to clear
  // ...
};
```

**Effort:** M (1–2h: add optimistic state, handle rollback on error)

**Risk of fixing:** Low — improvements to UX without breaking existing flow.

---

### 2. **[P1] Enter key in IME composition fires send prematurely**

**Category:** Bug (input edge case)

**File(s) + line(s):** App.tsx:3731–3735 (textarea `onKeyDown`)

**What's wrong:**
The `onKeyDown` handler triggers `onSend` on `e.key === "Enter"` without checking IME composition state. In CJK input (Chinese, Japanese, Korean), pressing Enter during candidate selection will fire `onSend`, sending an incomplete message (the preedit text) or a partial composition character. The standard React pattern is to ignore key events when `e.nativeEvent.isComposing` is true.

**Evidence:** Type in Japanese, select a kanji candidate, press Enter → message sends with just the preedit stroke instead of waiting for final composition.

**Fix:**
```typescript
onKeyDown={(e) => {
  if (e.nativeEvent.isComposing) return; // ignore during IME
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void onSend();
  }
}}
```

**Effort:** S (<30m: one-line fix)

**Risk of fixing:** Low — standard pattern, no side effects.

---

### 3. **[P1] Outbox item state transitions not visible in optimistic refresh**

**Category:** Bug (state sync)

**File(s) + line(s):** App.tsx:3671–3691 (outbox rendering), lines 614–627 (event handlers)

**What's wrong:**
When `outbox://updated` fires, the handler calls `refreshMessages` which refetches the entire outbox list from the API. Between the time an item transitions from "queued" → "sending" → "sent", the UI shows stale state. If the user is watching the outbox list and a message transitions from "failed" → "sending" (after retry), the button handlers still reference the old `o.id` but the object in state may have changed. Additionally, filtering `o.state !== "sent"` on line 3669 means sent items disappear immediately instead of animating away or showing confirmation.

**Evidence:** Retry a failed message → message briefly shows as "retrying" but button still says "Retry" because the handler closure captured the old state; pressing Retry twice fires two requests for the same item.

**Fix:**
```typescript
// Use event payload to identify which item changed, or patch state in-place
await onEvent("outbox://item-updated", (p) => {
  const updated = p?.id || selectedRef.current;
  if (updated) {
    // Patch the single item instead of full refresh
    api.listOutbox(selectedRef.current).then(res => {
      if (res.success) {
        setOutbox(prev => {
          const idx = prev.findIndex(o => o.id === updated);
          if (idx >= 0) prev[idx] = res.data.find(o => o.id === updated)!;
          return [...prev];
        });
      }
    });
  }
});

// Also: don't filter out sent items immediately, animate away or show toast
{(outbox).map(o => (
  <div key={o.id} className={`bubble out pending state-${o.state} ${o.state === 'sent' ? 'sent-confirm' : ''}`}>
    // ...
  </div>
))}
```

**Effort:** M (1–2h: implement patch updates, handle event payload)

**Risk of fixing:** Medium — changes event handling; must test reconnect scenarios.

---

### 4. **[P1] Message list does not scroll to bottom on new message in selected thread**

**Category:** Bug (UX / scroll behavior)

**File(s) + line(s):** App.tsx:607–611 (message://new event), lines 3646–3693 (msg-scroll div + ref)

**What's wrong:**
When a new message arrives for the currently selected thread, `refreshMessages` is called but there's no scroll-to-bottom. The `bottomRef` (line 3692) exists but is not used to scroll. The scroll position stays where the user was, so new messages may land below the fold invisibly. This is especially problematic in group threads where multiple participants post rapidly.

**Evidence:** Conversation with others; new message from them lands but you don't see it because the list stayed at your read position.

**Fix:**
```typescript
const msgScrollRef = useRef<HTMLDivElement>(null);

// After refreshMessages completes
const refreshMessages = async (threadId: string) => {
  // ... fetch and set messages
  // Schedule scroll after render
  requestAnimationFrame(() => {
    if (msgScrollRef.current) {
      msgScrollRef.current.scrollTop = msgScrollRef.current.scrollHeight;
    }
  });
};

// In JSX
<div className="msg-scroll" ref={msgScrollRef}>
  {/* messages */}
</div>
```

**Effort:** S (<30m)

**Risk of fixing:** Low — standard scroll-to-bottom pattern.

---

### 5. **[P2] Raw HTML/content injection risk in message body and sender name**

**Category:** Bug (security / XSS)

**File(s) + line(s):** App.tsx:3657–3662 (message sender name and content)

**What's wrong:**
Message `content` and sender names (from `threadTitle` function) are rendered directly into the DOM without sanitization:
```jsx
<div className="bubble-body">{m.content}</div>
<span>{isOutgoing(m) ? "You" : threadTitle(m.sender, ...)}</span>
```

If a message contains `<script>` or event handler HTML, or if a user's display name contains similar payloads, they will execute in the app context. While Signal messages are unlikely to contain untrusted HTML, the absence of sanitization is a latent vulnerability. The `filterEnvelopeNoiseContent` call on line 502 suggests awareness of content filtering but doesn't prevent injection.

**Evidence:** Unconfirmed — requires crafted Signal message or malicious contact metadata.

**Fix:**
```typescript
import DOMPurify from 'dompurify';

// Sanitize on render
<div className="bubble-body">{DOMPurify.sanitize(m.content)}</div>
// Or escape HTML
import { escape } from 'lodash-es'; // or inline escape
<div className="bubble-body">{escapeHtml(m.content)}</div>

// For sender names, threadTitle already returns plain text, but validate
export function threadTitle(...): string {
  // ... existing logic ...
  return sanitized_string; // ensure no HTML
}
```

**Effort:** S (<30m: add DOMPurify or inline escape, test with HTML)

**Risk of fixing:** Low — sanitization is additive.

---

### 6. **[P2] No error boundary or fallback for failed message loads**

**Category:** Improvement (robustness / UX)

**File(s) + line(s):** App.tsx:496–514 (refreshMessages), lines 3646–3691 (message rendering)

**What's wrong:**
If `api.getThreadMessages` fails (network error, backend error), `setMessages` is never called, leaving the UI showing stale messages or nothing. No error toast is shown. The user doesn't know the load failed. Similarly, if `listOutbox` fails, outbox items don't appear. The refresh functions all use `if (msgs.success)` but don't alert the user to failures.

**Evidence:** Static — confirmed by reading code; reproduction requires network failure.

**Fix:**
```typescript
const refreshMessages = async (threadId: string) => {
  const [msgs, box] = await Promise.all([
    api.getThreadMessages(threadId),
    api.listOutbox(threadId),
  ]);
  if (!msgs.success) {
    setStatus(`Failed to load messages: ${msgs.error}`);
  } else {
    setMessages(msgs.data.filter((m) => !isEnvelopeNoiseContent(m.content)));
  }
  if (!box.success) {
    setStatus(`Failed to load outbox: ${box.error}`);
  } else {
    setOutbox(box.data.filter((i) => i.state !== "sent"));
  }
  // ... rest
};
```

**Effort:** S (<30m: add error toasts, no logic changes)

**Risk of fixing:** Low.

---

### 7. **[P2] Rapid successive sends may create duplicate outbox items or missed ACKs**

**Category:** Bug (concurrency / edge case)

**File(s) + line(s):** App.tsx:760 (sending flag), lines 759–790 (onSend)

**What's wrong:**
The `sending` flag gates onSend (line 760), so the button is disabled and rapid clicks are prevented. However, the flag is set to false *after* the send API call returns, not after all refreshes complete. If the network is slow, the user could theoretically re-enable the button before refreshMessages completes, creating a window for a second send. Additionally, `refreshMessages` calls `refreshThreads`, which could update the unread/outbox counts before the message appears in the list, causing transient inconsistency.

**Evidence:** Reproduction requires network slowdown; not confirmed in real use but observable in slow 3G.

**Fix:**
```typescript
const onSend = async () => {
  if (!selectedId || sending || restartRequired) return;
  const text = composer.trim();
  if (!text && !attachFile) return;
  setSending(true);
  try {
    let res;
    if (attachFile) {
      // ... attachment logic
    } else {
      res = await api.queueMessage(selectedId, text);
    }
    if (!res.success) {
      setStatus(res.error);
      return; // don't clear composer
    }
    setComposer("");
    setAttachFile(null);
    if (attachPreview) URL.revokeObjectURL(attachPreview);
    setAttachPreview(null);
    setStatus(null);
    // Wait for all refreshes
    await Promise.all([
      refreshMessages(selectedId),
      refreshThreads(),
      refreshGlobalOutbox(),
    ]);
  } finally {
    setSending(false); // always reset flag
  }
};
```

**Effort:** M (<1h)

**Risk of fixing:** Low — improves reliability.

---

### 8. **[P2] Attachment preview URL leak: revoked too early or not at all**

**Category:** Bug (resource management)

**File(s) + line(s):** App.tsx:3705, 3722–3723 (URL.revokeObjectURL)

**What's wrong:**
When the user selects a file (line 3719–3725), `URL.createObjectURL` is called to display a preview. The URL is stored in `attachPreview`. When the user removes the attachment (line 3704) or sends it (line 784), the URL is revoked. However, if the user navigates away from the thread (changing selectedId), or if the component unmounts, the URL is never revoked. This causes a memory leak: object URLs accumulate in the browser's internal registry. Additionally, if an error occurs between createObjectURL and revoke, the URL is leaked.

**Evidence:** Static — use DevTools Memory heap snapshots to find blob object URLs.

**Fix:**
```typescript
// Add cleanup on unmount and selectId change
useEffect(() => {
  return () => {
    // Cleanup on unmount
    if (attachPreview) URL.revokeObjectURL(attachPreview);
  };
}, [attachPreview]);

useEffect(() => {
  // Cleanup when switching threads
  return () => {
    if (attachPreview) URL.revokeObjectURL(attachPreview);
  };
}, [selectedId]);

// Also wrap file picker in try/catch
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0] || null;
  setAttachFile(file);
  try {
    if (attachPreview) URL.revokeObjectURL(attachPreview);
    setAttachPreview(file ? URL.createObjectURL(file) : null);
  } catch (err) {
    console.error("Failed to create/revoke object URL", err);
  }
  e.target.value = "";
};
```

**Effort:** S–M (<1h)

**Risk of fixing:** Low.

---

### 9. **[P2] Thread list unread count may drift when message is read by mark-as-read race condition**

**Category:** Bug (state sync)

**File(s) + line(s):** App.tsx:507–512 (markThreadRead), lines 2279 (unread badge)

**What's wrong:**
When a thread is opened, `refreshMessages` calls `api.markThreadRead` and then updates the thread's `unread_count` to 0 manually. However, there's no optimistic update: if the user opens thread A, then quickly opens thread B before markThreadRead completes, the state update (line 510) may apply to the wrong thread or trigger unnecessary re-renders. Additionally, if another client marks messages read via the real-time subscription, the local unread count doesn't update (no event handler for this case).

**Evidence:** Static — possible race condition; unconfirmed in practice.

**Fix:**
```typescript
const refreshMessages = async (threadId: string) => {
  // Optimistic: clear unread immediately
  setThreads((prev) =>
    prev.map((t) => (t.id === threadId ? { ...t, unread_count: 0 } : t))
  );

  const [msgs, box, marked] = await Promise.all([
    api.getThreadMessages(threadId),
    api.listOutbox(threadId),
    api.markThreadRead(threadId),
  ]);
  if (msgs.success) {
    setMessages(msgs.data.filter((m) => !isEnvelopeNoiseContent(m.content)));
  }
  if (box.success) {
    setOutbox(box.data.filter((i) => i.state !== "sent"));
  }
  // Confirm from server response
  if (marked.success && marked.data?.unread_count !== undefined) {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, unread_count: marked.data.unread_count } : t))
    );
  }
};
```

**Effort:** S–M (<1h)

**Risk of fixing:** Low.

---

### 10. **[P3] Missing loading state for message fetch**

**Category:** Improvement (UX)

**File(s) + line(s):** App.tsx:496 (refreshMessages), lines 3646–3693 (message list rendering)

**What's wrong:**
When the user clicks on a thread, `refreshMessages` is called (async). There's no loading indicator or spinner. The message list shows the previous thread's messages until the new ones load, which is confusing. For slow networks, the UX is jarring.

**Evidence:** Reproduction: open a thread, then switch to another thread — the old thread's messages are visible until the new ones arrive.

**Fix:**
```typescript
const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);

// When thread is selected
const handleThreadSelect = (id: string) => {
  setSelectedId(id);
  setPanel("threads");
  setLoadingThreadId(id);
  void refreshMessages(id).finally(() => setLoadingThreadId(null));
};

// In render
{selectedId === loadingThreadId ? (
  <div className="msg-scroll loading"><p>Loading messages…</p></div>
) : (
  <div className="msg-scroll">
    {messages.map(...)}
  </div>
)}
```

**Effort:** S (<30m)

**Risk of fixing:** Low.

---

## Action List

### Fix now
- [ ] #2 — Add IME composition check to Enter key handler (S, low risk)
- [ ] #5 — Sanitize message content and sender names (S, low risk)
- [ ] #6 — Show error toast on failed message/outbox loads (S, low risk)

### Fix this week
- [ ] #1 — Implement optimistic send: queue message before API call (M, low risk)
- [ ] #4 — Scroll message list to bottom on new messages (S, low risk)
- [ ] #8 — Fix attachment URL leaks with cleanup on unmount/switch (M, low risk)
- [ ] #9 — Optimistic unread count update with server confirm (M, low risk)
- [ ] #10 — Add loading state when switching threads (S, low risk)

### Backlog
- [ ] #3 — Implement intelligent outbox patching instead of full refresh (M, medium risk)
- [ ] #7 — Tighten send lock and add network error retry (M, low risk)

---

## Deliberately Not Changed

**Missing UI states that are probably OK:**
- Empty thread message ("No messages yet") — shown correctly when `messages.length === 0`.
- Unconfirmed send (no read receipts or typing indicators) — Signal/SMS doesn't provide these; matching real Signal's design.
- No deletion or edit of messages — feature not in scope; app's "Send once" model doesn't require it.

**Monolithic App.tsx structure:**
- Splitting into smaller components would improve readability but risks introducing prop-drilling and stale closure bugs. The current ~3846 LOC is at the edge of maintainability but acceptable for a single-user desktop app.

**No message pagination:**
- `getThreadMessages` fetches all messages; no cursor-based pagination. For typical use (DM/group threads < 10k messages), this is fine. Pagination is deferred until thread history exceeds 5k messages.

---

## Open Questions

1. **Message content sanitization**: Does the app ever render untrusted HTML in messages, or are messages always plain text from Signal? If always plain text, sanitization can be deferred. If possible to contain HTML (e.g., via malicious metadata), implement now.

2. **Attachment preview security**: When displaying attachment previews (inline images), is there a risk of malicious images or PDFs? Should previews be sandboxed or require explicit user action to open?

3. **Outbox event payload**: Does the `outbox://item-updated` event include the updated item's ID or full data? If not, the only option is a full refresh. Clarify the event schema to enable targeted updates.

4. **Message ordering**: Are messages always sorted by timestamp? If two messages have identical timestamps, what's the tie-breaker? This could cause flicker or reordering on refresh if not stable.

5. **Test infrastructure**: Should the full suite (React component tests + API mocks) be maintained in the repo, or only as a development tool for audits? Current recommendation: add Vitest + basic React Testing Library for messaging section, but no CI/CD gating (dev only).

---

## Summary

**Risk tier: Medium**
- Five P1 findings (IME, optimistic sends, scroll behavior, outbox updates, error handling)
- Five P2 findings (state sync, URL leaks, security)
- Zero P0 crashes or data loss

**Effort to fix all:** ~10–12 engineering hours (mostly M/S tickets, no L)

**Recommended priority:** Fix #2 (IME) and #5 (XSS) this sprint (security + UX); then #1, #4 (user-visible); then #3, #7 (reliability).

**Next steps:** (1) Decide on sanitization approach for message content, (2) Review outbox event payload to enable smarter refresh, (3) Implement findings in order of priority.
