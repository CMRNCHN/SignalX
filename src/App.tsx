import { useEffect, useRef, useState } from "react";
import {
  api,
  errMsg,
  onEvent,
  unwrap,
  type AiStatus,
  type AutoReplyAuditEntry,
  type AutoReplySettings,
  type ContactMeta,
  type Diagnostics,
  type GroupMeta,
  type Message,
  type OutboxItem,
  type ReceiveLoopState,
  type SearchResult,
  type ThreadAutoReplyStatus,
  type ThreadSummary,
} from "./api";

type Panel = "threads" | "search" | "contacts" | "groups" | "audit" | "settings";

function healthTone(s: ReceiveLoopState | null): "green" | "yellow" | "red" {
  if (!s) return "yellow";
  if (s.cooldown_until && s.cooldown_until > Date.now()) return "red";
  if (s.last_receive_error) return s.consecutive_failures > 3 ? "red" : "yellow";
  if (s.last_receive_ok_at) return "green";
  return "yellow";
}

function healthLabel(s: ReceiveLoopState | null): string {
  if (!s) return "Connecting…";
  if (s.cooldown_until && s.cooldown_until > Date.now()) return "Self-heal cooldown";
  if (s.last_receive_error) return s.last_receive_error.slice(0, 80);
  if (s.last_receive_ok_at) return "Receive loop healthy";
  return "Waiting for first receive";
}

function fmtTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function threadTitle(id: string, contacts: ContactMeta[], groups: GroupMeta[]): string {
  if (id.startsWith("group:")) {
    const g = groups.find((x) => x.group_id === id || x.group_id === id.replace(/^group:/, ""));
    return g?.display_name || id.replace(/^group:/, "Group ");
  }
  const raw = id.replace(/^dm:/, "");
  const c = contacts.find(
    (x) => x.contact_id === id || x.contact_id === raw || x.contact_id === `dm:${raw}`,
  );
  return c?.display_name || c?.alias || raw || id;
}

function isOutgoing(m: Message): boolean {
  const d = String(m.direction).toLowerCase();
  return d === "outgoing" || d.includes("out");
}

export default function App() {
  const [panel, setPanel] = useState<Panel>("threads");
  const [accountNumber, setAccountNumber] = useState<string | null>(null);
  const [health, setHealth] = useState<ReceiveLoopState | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<SearchResult[]>([]);
  const [contacts, setContacts] = useState<ContactMeta[]>([]);
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [autoSettings, setAutoSettings] = useState<AutoReplySettings | null>(null);
  const [threadAuto, setThreadAuto] = useState<ThreadAutoReplyStatus | null>(null);
  const [audit, setAudit] = useState<AutoReplyAuditEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const refreshThreads = async () => {
    const res = await api.getThreads();
    if (res.success) setThreads(res.data);
  };

  const refreshMessages = async (threadId: string) => {
    const [msgs, box] = await Promise.all([
      api.getThreadMessages(threadId),
      api.listOutbox(threadId),
    ]);
    if (msgs.success) setMessages(msgs.data);
    if (box.success) setOutbox(box.data.filter((i) => i.state !== "sent"));
    await api.markThreadRead(threadId);
  };

  const refreshMeta = async () => {
    const [c, g, ar, au] = await Promise.all([
      api.listContactMeta(),
      api.listGroupMeta(),
      api.getAutoReplySettings(),
      api.listAutoReplyAudit(80),
    ]);
    if (c.success) setContacts(c.data);
    if (g.success) setGroups(g.data);
    if (ar.success) setAutoSettings(ar.data);
    if (au.success) setAudit(au.data);
  };

  const bootstrap = async () => {
    const [diag, recv, aiStatus] = await Promise.all([
      api.getDiagnostics(),
      api.getReceiveLoopState(),
      api.checkAiStatus(),
    ]);
    const d = unwrap(diag, null as unknown as Diagnostics | null);
    setAccountNumber(d?.number ?? null);
    if (!d?.number) {
      setStatus("Not configured — set SIGNALX_NUMBER and SIGNALX_SIGNALCLI_CONFIG in .signalx.env");
    }
    setHealth(unwrap(recv, null as unknown as ReceiveLoopState));
    setAi(unwrap(aiStatus, null as unknown as AiStatus));
    await refreshThreads();
    await refreshMeta();
  };

  useEffect(() => {
    void bootstrap();
    const unsubs: Array<() => void> = [];
    void (async () => {
      unsubs.push(
        await onEvent<{ thread_id?: string }>("message://new", (p) => {
          void refreshThreads();
          const cur = selectedRef.current;
          if (p.thread_id && p.thread_id === cur) void refreshMessages(p.thread_id);
        }),
      );
      unsubs.push(
        await onEvent("outbox://updated", () => {
          void refreshThreads();
          const cur = selectedRef.current;
          if (cur) void refreshMessages(cur);
        }),
      );
      unsubs.push(
        await onEvent("outbox://item-updated", () => {
          const cur = selectedRef.current;
          if (cur) void refreshMessages(cur);
        }),
      );
      unsubs.push(
        await onEvent<ReceiveLoopState>("receive://health", (s) => setHealth(s)),
      );
      unsubs.push(
        await onEvent<{ pending?: { draft: string; thread_id: string } }>("agent://draft", (p) => {
          if (p.pending && p.pending.thread_id === selectedRef.current) {
            setComposer((c) => c || p.pending!.draft);
            setStatus("AI draft ready — review before sending");
          }
        }),
      );
      unsubs.push(
        await onEvent("auto-reply://audit", () => {
          void api.listAutoReplyAudit(80).then((r) => {
            if (r.success) setAudit(r.data);
          });
        }),
      );
      unsubs.push(
        await onEvent<AutoReplySettings>("auto-reply://settings", (s) => setAutoSettings(s)),
      );
    })();
    const poll = window.setInterval(() => {
      void api.getReceiveLoopState().then((r) => {
        if (r.success) setHealth(r.data);
      });
      void api.checkAiStatus().then((r) => {
        if (r.success) setAi(r.data);
      });
    }, 15000);
    return () => {
      unsubs.forEach((u) => u());
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setOutbox([]);
      setThreadAuto(null);
      setSummaryText(null);
      return;
    }
    void refreshMessages(selectedId);
    void api.getThreadAutoReply(selectedId).then((r) => {
      if (r.success) setThreadAuto(r.data);
    });
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, outbox]);

  const onSend = async () => {
    if (!selectedId || !composer.trim() || sending) return;
    setSending(true);
    const text = composer.trim();
    const res = await api.queueMessage(selectedId, text);
    setSending(false);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setComposer("");
    setStatus(null);
    await refreshMessages(selectedId);
    await refreshThreads();
  };

  const onRetry = async (id: string) => {
    const res = await api.retryOutbox(id);
    if (!res.success) setStatus(res.error);
    if (selectedId) await refreshMessages(selectedId);
  };

  const onDeleteOutbox = async (id: string) => {
    await api.deleteOutbox(id);
    if (selectedId) await refreshMessages(selectedId);
  };

  const onSearch = async () => {
    if (!searchQ.trim()) {
      setSearchHits([]);
      return;
    }
    const res = await api.searchMessages(searchQ.trim());
    if (res.success) setSearchHits(res.data);
    else setStatus(res.error);
  };

  const onSummarize = async () => {
    if (!selectedId) return;
    setAiBusy(true);
    setSummaryText(null);
    const res = await api.summarizeThread(selectedId);
    setAiBusy(false);
    if (res.success) setSummaryText(res.data);
    else setStatus(res.error);
  };

  const onDraft = async () => {
    if (!selectedId) return;
    setAiBusy(true);
    const res = await api.draftReply(selectedId, "helpful concise reply", "do not auto-send");
    setAiBusy(false);
    if (res.success) {
      setComposer(res.data);
      setStatus("Draft filled into composer — review before send");
    } else setStatus(res.error);
  };

  const onExportThread = async () => {
    if (!selectedId) return;
    const res = await api.exportThread(selectedId, "json");
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    const path =
      res.data && typeof res.data === "object" && "path" in res.data
        ? String((res.data as { path: string }).path)
        : null;
    if (path) {
      await api.openPath(path);
      setStatus(`Exported to ${path}`);
    } else setStatus("Export complete");
  };

  const toggleThreadAuto = async (enabled: boolean) => {
    if (!selectedId) return;
    if (selectedId.startsWith("group:") && enabled) {
      const ok = window.confirm(
        "Enable auto-reply for this group? Groups are off by default.",
      );
      if (!ok) return;
    }
    const res = await api.setThreadAutoReply(selectedId, enabled);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    const st = await api.getThreadAutoReply(selectedId);
    if (st.success) setThreadAuto(st.data);
    await refreshMeta();
  };

  const saveAutoSettings = async (patch: Partial<AutoReplySettings>) => {
    if (!autoSettings) return;
    const next = { ...autoSettings, ...patch };
    const res = await api.setAutoReplySettings(next);
    if (res.success) setAutoSettings(res.data);
    else setStatus(res.error);
  };

  const tone = healthTone(health);
  const title = selectedId ? threadTitle(selectedId, contacts, groups) : "SignalX";

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark">SignalX</span>
          <span className={`health health-${tone}`} title={healthLabel(health)} />
        </div>

        <label className="field-label">Account</label>
        <div className="account-label" title={accountNumber ?? undefined}>
          {accountNumber ?? "Not configured"}
        </div>

        <div className={`ai-pill ${ai?.configured && ai.ollama_reachable ? "ok" : "warn"}`}>
          {ai?.configured
            ? ai.ollama_reachable
              ? `AI · ${ai.ollama_model || "ollama"}`
              : "AI · unreachable"
            : "AI · not configured"}
        </div>

        {autoSettings?.enabled && (
          <div className="auto-global-banner">Auto-reply ON</div>
        )}

        <nav className="nav">
          {(
            [
              ["threads", "Messages"],
              ["search", "Search"],
              ["contacts", "Contacts"],
              ["groups", "Groups"],
              ["audit", "Auto-reply log"],
              ["settings", "Settings"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={panel === id ? "nav-btn active" : "nav-btn"}
              onClick={() => setPanel(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="rail-foot">
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void api.exportAccount("json").then((r) => setStatus(errMsg(r) || "Account exported"))}
          >
            Export account
          </button>
        </div>
      </aside>

      {panel === "threads" && (
        <section className="thread-col">
          <header className="col-head">Threads</header>
          <div className="thread-list">
            {threads.length === 0 && (
              <p className="empty">No threads yet. Waiting for Signal traffic…</p>
            )}
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                className={selectedId === t.id ? "thread-row active" : "thread-row"}
                onClick={() => {
                  setSelectedId(t.id);
                  setPanel("threads");
                }}
              >
                <div className="thread-row-top">
                  <span className="thread-name">{threadTitle(t.id, contacts, groups)}</span>
                  <span className="thread-time">{fmtTime(t.last_message_timestamp)}</span>
                </div>
                <div className="thread-row-meta">
                  {t.unread_count > 0 && <span className="badge">{t.unread_count}</span>}
                  {t.outbox_count > 0 && <span className="badge muted">{t.outbox_count} pending</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === "search" && (
        <section className="thread-col">
          <header className="col-head">Search</header>
          <div className="search-box">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void onSearch()}
              placeholder="Search messages…"
            />
            <button type="button" onClick={() => void onSearch()}>
              Go
            </button>
          </div>
          <div className="thread-list">
            {searchHits.map((h) => (
              <button
                key={`${h.thread_id}-${h.message_id}`}
                type="button"
                className="thread-row"
                onClick={() => {
                  setSelectedId(h.thread_id);
                  setPanel("threads");
                }}
              >
                <div className="thread-row-top">
                  <span className="thread-name">{threadTitle(h.thread_id, contacts, groups)}</span>
                  <span className="thread-time">{fmtTime(h.timestamp)}</span>
                </div>
                <div className="snippet">{h.snippet}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === "contacts" && (
        <section className="thread-col">
          <header className="col-head">Contacts</header>
          <div className="thread-list">
            {contacts.map((c) => (
              <button
                key={c.contact_id}
                type="button"
                className="thread-row"
                onClick={() => {
                  const tid = c.contact_id.startsWith("dm:")
                    ? c.contact_id
                    : `dm:${c.contact_id}`;
                  setSelectedId(tid);
                  setPanel("threads");
                }}
              >
                <div className="thread-row-top">
                  <span className="thread-name">
                    {c.display_name || c.alias || c.contact_id}
                  </span>
                  {c.auto_reply_enabled && <span className="badge danger">Auto</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === "groups" && (
        <section className="thread-col">
          <header className="col-head">Groups</header>
          <div className="thread-list">
            {groups.map((g) => (
              <button
                key={g.group_id}
                type="button"
                className="thread-row"
                onClick={() => {
                  setSelectedId(g.group_id.startsWith("group:") ? g.group_id : `group:${g.group_id}`);
                  setPanel("threads");
                }}
              >
                <div className="thread-row-top">
                  <span className="thread-name">{g.display_name || g.group_id}</span>
                  {g.auto_reply_enabled && <span className="badge danger">Auto</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === "audit" && (
        <section className="thread-col wide">
          <header className="col-head">Auto-reply audit</header>
          <div className="audit-list">
            {audit.length === 0 && <p className="empty">No auto-reply activity yet.</p>}
            {audit.map((e) => (
              <div key={e.id} className="audit-row">
                <div className="audit-top">
                  <span className={`outcome outcome-${e.outcome}`}>{e.outcome}</span>
                  <span className="thread-time">{fmtTime(e.created_at)}</span>
                </div>
                <div className="audit-thread">{e.thread_id}</div>
                <div className="snippet">{e.draft}</div>
                {e.reason && <div className="reason">{e.reason}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {panel === "settings" && (
        <section className="thread-col wide">
          <header className="col-head">Settings</header>
          <div className="settings-body">
            <h3>Auto-reply (global)</h3>
            <p className="hint">
              Off by default. Even when on, only allowlisted + opted-in threads can auto-send.
              Groups stay off unless explicitly enabled per thread.
            </p>
            {autoSettings && (
              <>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={autoSettings.enabled}
                    onChange={(e) => void saveAutoSettings({ enabled: e.target.checked })}
                  />
                  Master switch (kill-switch when off)
                </label>
                <label className="field-label">Max per thread / window</label>
                <input
                  type="number"
                  min={1}
                  value={autoSettings.max_per_thread_per_hour}
                  onChange={(e) =>
                    void saveAutoSettings({
                      max_per_thread_per_hour: Number(e.target.value) || 1,
                    })
                  }
                />
                <label className="field-label">Max global / window</label>
                <input
                  type="number"
                  min={1}
                  value={autoSettings.max_per_window}
                  onChange={(e) =>
                    void saveAutoSettings({ max_per_window: Number(e.target.value) || 1 })
                  }
                />
                <label className="field-label">Quiet hours start (0–23, blank = off)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={autoSettings.quiet_hours_start ?? ""}
                  onChange={(e) =>
                    void saveAutoSettings({
                      quiet_hours_start: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
                <label className="field-label">Quiet hours end</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={autoSettings.quiet_hours_end ?? ""}
                  onChange={(e) =>
                    void saveAutoSettings({
                      quiet_hours_end: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
                <label className="field-label">Allowlist ({autoSettings.allowlist.length})</label>
                <pre className="allowlist">{autoSettings.allowlist.join("\n") || "(empty — nobody)"}</pre>
              </>
            )}
          </div>
        </section>
      )}

      {(panel === "audit" || panel === "settings") ? null : (
      <main className="convo">
        {!selectedId ? (
          <div className="convo-empty">
            <h1>SignalX</h1>
            <p>Select a thread to read and reply.</p>
          </div>
        ) : (
          <>
            <header className="convo-head">
              <div>
                <h2>{title}</h2>
                <div className="convo-sub">{selectedId}</div>
              </div>
              <div className="convo-actions">
                {threadAuto?.effective && (
                  <span className="auto-thread-badge">Auto-reply ON</span>
                )}
                <label className="toggle compact">
                  <input
                    type="checkbox"
                    checked={!!threadAuto?.opted_in}
                    onChange={(e) => void toggleThreadAuto(e.target.checked)}
                  />
                  Opt-in auto
                </label>
                <button type="button" className="ghost-btn" disabled={aiBusy || !ai?.configured} onClick={() => void onSummarize()}>
                  Summarize
                </button>
                <button type="button" className="ghost-btn" disabled={aiBusy || !ai?.configured} onClick={() => void onDraft()}>
                  Draft reply
                </button>
                <button type="button" className="ghost-btn" onClick={() => void onExportThread()}>
                  Export
                </button>
              </div>
            </header>

            {summaryText && (
              <div className="summary-box">
                <div className="summary-head">
                  <strong>Summary</strong>
                  <button type="button" className="ghost-btn" onClick={() => setSummaryText(null)}>
                    Dismiss
                  </button>
                </div>
                <pre>{summaryText}</pre>
              </div>
            )}

            <div className="msg-scroll">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={isOutgoing(m) ? "bubble out" : "bubble in"}
                >
                  <div className="bubble-meta">
                    <span>{isOutgoing(m) ? "You" : m.sender}</span>
                    <span>{fmtTime(m.timestamp)}</span>
                  </div>
                  <div className="bubble-body">{m.content}</div>
                </div>
              ))}
              {outbox.map((o) => (
                <div key={o.id} className={`bubble out pending state-${o.state}`}>
                  <div className="bubble-meta">
                    <span>{o.state}</span>
                    <span>{fmtTime(o.created_at)}</span>
                  </div>
                  <div className="bubble-body">{o.content}</div>
                  {o.last_error && <div className="bubble-err">{o.last_error}</div>}
                  <div className="bubble-actions">
                    {o.state === "failed" && (
                      <button type="button" onClick={() => void onRetry(o.id)}>
                        Retry
                      </button>
                    )}
                    <button type="button" onClick={() => void onDeleteOutbox(o.id)}>
                      Discard
                    </button>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {status && <div className="status-bar">{status}</div>}

            <div className="composer">
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
                placeholder="Write a message… (Enter to send, Shift+Enter for newline)"
                rows={3}
              />
              <button
                type="button"
                className="send-btn"
                disabled={sending || !composer.trim()}
                onClick={() => void onSend()}
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
          </>
        )}
      </main>
      )}
    </div>
  );
}
