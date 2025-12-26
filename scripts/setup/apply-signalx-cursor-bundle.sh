#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/cameroncohen/Developer/apps/signalx"
cd "$ROOT"

mkdir -p src src-tauri/src

# -------------------------
# src/App.css (fix stray Rust)
# -------------------------
cat > src/App.css <<'EOF'
/* SignalX Desktop - functional styling only (no aesthetics pass) */
:root {
  color-scheme: dark;
}

html, body, #root {
  height: 100%;
  margin: 0;
  padding: 0;
}

* {
  box-sizing: border-box;
}
EOF

# -------------------------
# src/App.tsx
# -------------------------
cat > src/App.tsx <<'EOF'
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };

async function unwrap<T>(p: Promise<any>, label: string): Promise<T> {
  const res = (await p) as ApiResponse<T>;
  if (!res || typeof res !== "object" || !("success" in res)) {
    throw new Error(`${label}: invalid response`);
  }
  if (!res.success) throw new Error(`${label}: ${res.error}`);
  return res.data;
}

type Direction = "Incoming" | "Outgoing";

export interface Message {
  id: string;
  thread_id: string;
  timestamp: number;
  sender: string;
  recipient?: string | null;
  content: string;
  direction: Direction;
  raw_json?: any | null;
}

export interface ThreadSummary {
  id: string;
  participants: string[];
  last_message_timestamp: number;
  unread_count: number;
  message_count: number;
}

type AccountChangedPayload = { account_id: string };

type Diagnostics = {
  env_path: string | null;
  app_data_dir: string;
  threads_dir: string;
  aliases_dir: string;
  search_dir: string;
  signal_cli_path: string;
  signal_cli_version: string | null;
  signal_cli_usable: boolean;
  signal_cli_last_error: string | null;
  config_path: string | null;
  number: string | null;
  active_account: string | null;
};

type ReceiveLoopState = {
  last_receive_ok_at: number | null;
  last_receive_error: string | null;
  consecutive_failures: number;
  backoff_ms: number;
  cooldown_until: number | null;
};

type AliasMap = Record<string, string>; // number -> alias

type SearchResult = {
  message_id: string;
  thread_id: string;
  timestamp: number;
  sender: string;
  snippet: string;
};

function fmtTime(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export default function App() {
  const [log, setLog] = useState<string[]>([]);
  const addLog = (msg: string) => {
    const t = new Date().toLocaleTimeString();
    setLog((prev) => [...prev.slice(-199), `[${t}] ${msg}`]);
  };

  const [accounts, setAccounts] = useState<string[]>([]);
  const [activeAccount, setActiveAccount] = useState<string | null>(null);

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);

  const [aliases, setAliases] = useState<AliasMap>({});
  const [aliasNumber, setAliasNumber] = useState("");
  const [aliasValue, setAliasValue] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [aiIntent, setAiIntent] = useState("polite");
  const [aiConstraints, setAiConstraints] = useState("short, clear, no emojis");
  const [aiOutput, setAiOutput] = useState<string>("");

  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [receiveState, setReceiveState] = useState<ReceiveLoopState | null>(null);

  const unlistenRefs = useRef<(() => void)[]>([]);

  const getThreadName = (t: ThreadSummary): string => {
    const first = t.participants?.[0] || t.id;
    return aliases[first] || aliases[t.id] || first || t.id;
  };

  const refreshDiagnostics = async () => {
    try {
      const d = await unwrap<Diagnostics>(invoke("get_diagnostics"), "get_diagnostics");
      setDiagnostics(d);
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const refreshReceiveLoopState = async () => {
    try {
      const s = await unwrap<ReceiveLoopState>(
        invoke("get_receive_loop_state"),
        "get_receive_loop_state"
      );
      setReceiveState(s);
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const refreshThreads = async () => {
    try {
      const t = await unwrap<ThreadSummary[]>(invoke("get_threads"), "get_threads");
      setThreads(t);
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const refreshAliases = async () => {
    try {
      const a = await unwrap<AliasMap>(invoke("list_aliases"), "list_aliases");
      setAliases(a || {});
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const loadThreadMessages = async (threadId: string) => {
    try {
      const m = await unwrap<Message[]>(
        invoke("get_thread_messages", { threadId }),
        "get_thread_messages"
      );
      setMessages(m);
      setSelectedThreadId(threadId);
      await unwrap<boolean>(invoke("mark_thread_read", { threadId }), "mark_thread_read");
      await refreshThreads();
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const boot = async () => {
    addLog("Boot…");
    try {
      const a = await unwrap<string[]>(invoke("list_accounts"), "list_accounts");
      setAccounts(a || []);
      const active = await unwrap<{ account_id: string | null }>(
        invoke("get_active_account"),
        "get_active_account"
      );
      setActiveAccount(active.account_id);
      await refreshThreads();
      await refreshAliases();
      await refreshDiagnostics();
      await refreshReceiveLoopState();
      addLog("Boot OK");
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  useEffect(() => {
    boot();
    // listeners
    (async () => {
      try {
        const u1 = await listen<Message>("message-received", async (event) => {
          const msg = event.payload;
          addLog(`event message-received: ${msg.thread_id} ${msg.id}`);
          // If currently viewing this thread, reload its messages for canonical backend state
          if (selectedThreadId && msg.thread_id === selectedThreadId) {
            await loadThreadMessages(selectedThreadId);
          }
          await refreshThreads();
        });
        const u2 = await listen<Message>("message-sent", async (event) => {
          const msg = event.payload;
          addLog(`event message-sent: ${msg.thread_id} ${msg.id}`);
          if (selectedThreadId && msg.thread_id === selectedThreadId) {
            await loadThreadMessages(selectedThreadId);
          }
          await refreshThreads();
        });
        const u3 = await listen<AccountChangedPayload>("account-changed", async (event) => {
          const { account_id } = event.payload;
          addLog(`event account-changed: ${account_id}`);
          setActiveAccount(account_id);
          setSelectedThreadId(null);
          setMessages([]);
          await refreshThreads();
          await refreshAliases();
          await refreshDiagnostics();
          await refreshReceiveLoopState();
        });

        unlistenRefs.current.push(u1, u2, u3);
      } catch (e: any) {
        addLog(`listen error: ${String(e?.message || e)}`);
      }
    })();

    return () => {
      for (const u of unlistenRefs.current) u();
      unlistenRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lightweight periodic diagnostics refresh (NOT receive polling)
  useEffect(() => {
    const id = window.setInterval(() => {
      refreshReceiveLoopState();
    }, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAccountChange = async (accountId: string) => {
    try {
      await unwrap<boolean>(invoke("set_active_account", { accountId }), "set_active_account");
      // backend emits account-changed; UI updates via listener
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const sendMessage = async () => {
    if (!selectedThreadId) return;
    const text = composerText.trim();
    if (!text) return;

    setSending(true);
    try {
      await unwrap<any>(
        invoke("send_message", { threadId: selectedThreadId, message: text }),
        "send_message"
      );
      setComposerText("");
    } catch (e: any) {
      addLog(String(e?.message || e));
    } finally {
      setSending(false);
    }
  };

  const setAlias = async () => {
    const num = aliasNumber.trim();
    const al = aliasValue.trim();
    if (!num || !al) return;
    try {
      await unwrap<boolean>(invoke("set_alias", { number: num, alias: al }), "set_alias");
      setAliasNumber("");
      setAliasValue("");
      await refreshAliases();
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const doSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await unwrap<SearchResult[]>(
        invoke("search_messages", {
          query: q,
          limit: 50,
          threadId: null,
        }),
        "search_messages"
      );
      setSearchResults(res || []);
    } catch (e: any) {
      addLog(String(e?.message || e));
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => doSearch(), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const openSearchResult = async (r: SearchResult) => {
    await loadThreadMessages(r.thread_id);
    // minimal: no scroll-to-message yet (can be added later)
  };

  const aiSummarize = async () => {
    if (!selectedThreadId) return;
    try {
      const out = await unwrap<string>(
        invoke("summarize_thread", { threadId: selectedThreadId, lastN: 50 }),
        "summarize_thread"
      );
      setAiOutput(out);
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const aiDraft = async () => {
    if (!selectedThreadId) return;
    try {
      const out = await unwrap<string>(
        invoke("draft_reply", {
          threadId: selectedThreadId,
          intent: aiIntent,
          constraints: aiConstraints,
          lastN: 50,
        }),
        "draft_reply"
      );
      setAiOutput(out);
      setComposerText(out);
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  const receiveBadge = (() => {
    if (!receiveState) return "unknown";
    if (receiveState.cooldown_until && Date.now() < receiveState.cooldown_until) return "cooldown";
    if (receiveState.consecutive_failures > 0) return `err(${receiveState.consecutive_failures})`;
    if (receiveState.last_receive_ok_at) return "ok";
    return "idle";
  })();

  return (
    <div style={{ display: "flex", height: "100%", background: "#0b0d10", color: "#e5e7eb", fontFamily: "system-ui" }}>
      {/* Sidebar */}
      <div style={{ width: 340, borderRight: "1px solid #1f2937", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #1f2937" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>SignalX</div>
            <button
              onClick={() => setShowDiagnostics((v) => !v)}
              style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer" }}
            >
              {showDiagnostics ? "Hide diag" : "Diag"}
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
            Receive: <span style={{ color: receiveBadge === "ok" ? "#10b981" : "#f59e0b" }}>{receiveBadge}</span>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={activeAccount || ""}
              onChange={(e) => onAccountChange(e.target.value)}
              style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
            >
              <option value="" disabled>
                Select account…
              </option>
              {accounts.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button
              onClick={() => boot()}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer" }}
            >
              ↻
            </button>
          </div>

          {/* Search */}
          <div style={{ marginTop: 10 }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
            />
            {searching ? (
              <div style={{ marginTop: 6, fontSize: 12, color: "#9ca3af" }}>Searching…</div>
            ) : null}
            {searchResults.length > 0 ? (
              <div style={{ marginTop: 8, maxHeight: 180, overflow: "auto", border: "1px solid #1f2937", borderRadius: 8 }}>
                {searchResults.map((r) => (
                  <div
                    key={r.message_id}
                    onClick={() => openSearchResult(r)}
                    style={{ padding: 10, borderBottom: "1px solid #1f2937", cursor: "pointer" }}
                  >
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>
                      {getThreadName({ id: r.thread_id, participants: [r.thread_id], last_message_timestamp: r.timestamp, unread_count: 0, message_count: 0 })}
                      {" • "}
                      {fmtTime(r.timestamp)}
                    </div>
                    <div style={{ fontSize: 13 }}>{r.snippet}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Threads */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {threads.length === 0 ? (
            <div style={{ padding: 12, color: "#9ca3af" }}>No threads.</div>
          ) : (
            threads.map((t) => (
              <div
                key={t.id}
                onClick={() => loadThreadMessages(t.id)}
                style={{
                  padding: 12,
                  borderBottom: "1px solid #1f2937",
                  cursor: "pointer",
                  background: selectedThreadId === t.id ? "#111827" : "transparent",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {getThreadName(t)}
                  </div>
                  {t.unread_count > 0 ? (
                    <div style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "#1f2937", color: "#e5e7eb" }}>
                      {t.unread_count}
                    </div>
                  ) : null}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af", display: "flex", justifyContent: "space-between" }}>
                  <span>{fmtTime(t.last_message_timestamp)}</span>
                  <span>{t.message_count} msg</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Aliases */}
        <div style={{ borderTop: "1px solid #1f2937", padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Aliases</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={aliasNumber}
              onChange={(e) => setAliasNumber(e.target.value)}
              placeholder="+1202…"
              style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
            />
            <input
              value={aliasValue}
              onChange={(e) => setAliasValue(e.target.value)}
              placeholder="Alias"
              style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
            />
            <button
              onClick={setAlias}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer" }}
            >
              Set
            </button>
          </div>
          <div style={{ marginTop: 8, maxHeight: 110, overflow: "auto", border: "1px solid #1f2937", borderRadius: 8 }}>
            {Object.keys(aliases).length === 0 ? (
              <div style={{ padding: 10, color: "#9ca3af", fontSize: 12 }}>No aliases yet.</div>
            ) : (
              Object.entries(aliases).map(([num, al]) => (
                <div key={num} style={{ padding: 10, borderBottom: "1px solid #1f2937", fontSize: 12 }}>
                  <div style={{ color: "#9ca3af" }}>{num}</div>
                  <div>{al}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: 12, borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>
              {selectedThread ? getThreadName(selectedThread) : "Select a thread"}
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              {selectedThread ? selectedThread.id : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => refreshThreads()}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer" }}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {selectedThreadId === null ? (
            <div style={{ color: "#9ca3af" }}>Choose a thread from the left.</div>
          ) : messages.length === 0 ? (
            <div style={{ color: "#9ca3af" }}>No messages in this thread.</div>
          ) : (
            messages.map((m) => {
              const from = aliases[m.sender] || m.sender;
              const outgoing = m.direction === "Outgoing";
              return (
                <div
                  key={m.id}
                  style={{
                    maxWidth: "78%",
                    marginLeft: outgoing ? "auto" : 0,
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 10,
                    background: outgoing ? "#111827" : "#1f2937",
                    border: "1px solid #374151",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                    {from} • {fmtTime(m.timestamp)}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer + AI */}
        <div style={{ borderTop: "1px solid #1f2937", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder="Type message…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #374151", background: "#0b0d10", color: "#e5e7eb" }}
            />
            <button
              onClick={sendMessage}
              disabled={!selectedThreadId || sending || !composerText.trim()}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #374151",
                background: sending ? "#374151" : "#111827",
                color: "#e5e7eb",
                cursor: sending ? "not-allowed" : "pointer",
                minWidth: 110,
              }}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 700 }}>AI Tools</div>
            <input
              value={aiIntent}
              onChange={(e) => setAiIntent(e.target.value)}
              placeholder="intent"
              style={{ flex: 1, padding: 8, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
            />
            <input
              value={aiConstraints}
              onChange={(e) => setAiConstraints(e.target.value)}
              placeholder="constraints"
              style={{ flex: 2, padding: 8, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
            />
            <button
              onClick={aiSummarize}
              disabled={!selectedThreadId}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer" }}
            >
              Summarize
            </button>
            <button
              onClick={aiDraft}
              disabled={!selectedThreadId}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer" }}
            >
              Draft
            </button>
          </div>

          {aiOutput ? (
            <div style={{ padding: 10, borderRadius: 10, border: "1px solid #1f2937", background: "#111827" }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>AI output</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{aiOutput}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Debug / Diagnostics */}
      <div style={{ width: 420, borderLeft: "1px solid #1f2937", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #1f2937", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Debug</div>
          <button
            onClick={() => {
              refreshDiagnostics();
              refreshReceiveLoopState();
              refreshAliases();
              refreshThreads();
            }}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer" }}
          >
            Refresh
          </button>
        </div>

        {showDiagnostics ? (
          <div style={{ padding: 12, borderBottom: "1px solid #1f2937", fontSize: 12, color: "#9ca3af" }}>
            <div style={{ color: "#e5e7eb", fontWeight: 700, marginBottom: 6 }}>Diagnostics</div>
            {diagnostics ? (
              <div style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(diagnostics, null, 2)}
              </div>
            ) : (
              <div>Loading…</div>
            )}

            <div style={{ color: "#e5e7eb", fontWeight: 700, marginTop: 10, marginBottom: 6 }}>Receive loop</div>
            {receiveState ? (
              <div style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(receiveState, null, 2)}
              </div>
            ) : (
              <div>Loading…</div>
            )}
          </div>
        ) : null}

        <div style={{ flex: 1, overflow: "auto", padding: 12, background: "#0b0d10", fontFamily: "monospace", fontSize: 11 }}>
          {log.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No logs yet.</div>
          ) : (
            log.map((l, i) => (
              <div key={i} style={{ color: "#9ca3af", marginBottom: 4 }}>
                {l}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
EOF

# -------------------------
# src-tauri/src/main.rs
# -------------------------
cat > src-tauri/src/main.rs <<'EOF'
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};

use tauri::{Emitter, Manager};

const RECEIVE_TIMEOUT_SECS: &str = "2";
const RECEIVE_MAX_MESSAGES: &str = "50";

const MAX_BACKOFF_MS: u64 = 5000;
const COOLDOWN_MS_AFTER_SELF_HEAL: u64 = 30_000;
const SELF_HEAL_FAILURE_THRESHOLD: u32 = 10;

// --------------------
// API helpers
// --------------------
fn ok(data: Value) -> Value {
  json!({ "success": true, "data": data })
}
fn ok_t<T: Serialize>(data: T) -> Value {
  json!({ "success": true, "data": data })
}
fn err(msg: String) -> Value {
  json!({ "success": false, "error": msg })
}

// --------------------
// ENV LOADING (portable)
// --------------------
#[derive(Clone, Debug, Serialize)]
struct EnvResolve {
  env_path: Option<String>,
  config_path: Option<String>,
  number: Option<String>,
  signal_cli_bin: String,
}

fn load_env() -> Result<Option<PathBuf>, String> {
  // 1) SIGNALX_ENV_PATH if set
  if let Ok(p) = std::env::var("SIGNALX_ENV_PATH") {
    let pb = PathBuf::from(&p);
    if pb.is_file() {
      dotenv::from_path(&pb).map_err(|e| format!("Failed to load SIGNALX_ENV_PATH {:?}: {}", pb, e))?;
      eprintln!("Loaded env from {:?}", pb);
      return Ok(Some(pb));
    } else {
      return Err(format!("SIGNALX_ENV_PATH set but file does not exist: {:?}", pb));
    }
  }

  let mut candidates: Vec<PathBuf> = Vec::new();

  if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
    let manifest_path = PathBuf::from(manifest_dir);
    if let Some(parent) = manifest_path.parent() {
      candidates.push(parent.join(".signalx.env"));
    }
  }

  if let Ok(cwd) = std::env::current_dir() {
    candidates.push(cwd.join(".signalx.env"));
  }

  if let Some(config_dir) = dirs_next::config_dir() {
    candidates.push(config_dir.join("SignalX").join(".signalx.env"));
    candidates.push(config_dir.join(".signalx.env"));
  }

  for p in candidates.iter().filter(|p| p.is_file()) {
    dotenv::from_path(p).map_err(|e| format!("Failed to load .signalx.env from {:?}: {}", p, e))?;
    eprintln!("Loaded env from {:?}", p);
    return Ok(Some(p.clone()));
  }

  Ok(None)
}

fn get_signal_config() -> Option<String> {
  std::env::var("SIGNALX_SIGNALCLI_CONFIG").ok()
}

fn get_signal_number() -> Option<String> {
  std::env::var("SIGNALX_NUMBER").ok()
}

// Priority: SIGNALX_SIGNALCLI_BIN > /opt/homebrew/bin/signal-cli > signal-cli
fn get_signal_cli_path() -> String {
  if let Ok(bin) = std::env::var("SIGNALX_SIGNALCLI_BIN") {
    return bin;
  }
  let default_path = "/opt/homebrew/bin/signal-cli";
  if Path::new(default_path).exists() {
    return default_path.to_string();
  }
  "signal-cli".to_string()
}

#[derive(Clone, Debug, Serialize)]
struct SignalCliInfo {
  bin: String,
  is_usable: bool,
  version: Option<String>,
  last_error: Option<String>,
}

fn probe_signal_cli(bin: &str) -> SignalCliInfo {
  // Try to run: signal-cli --version
  match Command::new(bin).arg("--version").output() {
    Ok(out) if out.status.success() => {
      let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
      SignalCliInfo { bin: bin.to_string(), is_usable: true, version: Some(v), last_error: None }
    }
    Ok(out) => {
      let e = String::from_utf8_lossy(&out.stderr).trim().to_string();
      SignalCliInfo { bin: bin.to_string(), is_usable: false, version: None, last_error: Some(e) }
    }
    Err(e) => SignalCliInfo { bin: bin.to_string(), is_usable: false, version: None, last_error: Some(format!("{}", e)) },
  }
}

fn build_signal_command(config: &str, number: Option<&str>) -> Command {
  let signal_cli = get_signal_cli_path();
  let mut cmd = Command::new(&signal_cli);

  // Always pass --config
  cmd.arg("--config").arg(config);

  // Output format for signal-cli 0.13.22
  cmd.arg("-o").arg("json");

  // Always pass -u if number is provided (required for send/receive/thread listing in many cases)
  if let Some(num) = number {
    cmd.arg("-u").arg(num);
  }

  cmd
}

// --------------------
// Models
// --------------------
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
enum Direction {
  Incoming,
  Outgoing,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Message {
  id: String,
  thread_id: String,
  timestamp: i64,
  sender: String,
  recipient: Option<String>,
  content: String,
  direction: Direction,
  raw_json: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ThreadSummary {
  id: String,
  participants: Vec<String>,
  last_message_timestamp: i64,
  unread_count: u32,
  message_count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ThreadData {
  id: String,
  participants: Vec<String>,
  last_message_timestamp: i64,
  unread_count: u32,
  messages: Vec<Message>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ThreadStateData {
  version: u32,
  threads: HashMap<String, ThreadData>,
}

impl ThreadStateData {
  fn v1() -> Self {
    Self { version: 1, threads: HashMap::new() }
  }
}

#[derive(Clone)]
struct ThreadState {
  account_id: String,
  data: Arc<Mutex<ThreadStateData>>,
  save_mutex: Arc<Mutex<()>>,
  storage_path: PathBuf,
  last_save_ok_at: Arc<Mutex<Option<i64>>>,
  last_save_error: Arc<Mutex<Option<String>>>,
}

impl ThreadState {
  fn new(account_id: String, storage_path: PathBuf) -> Self {
    Self {
      account_id,
      data: Arc::new(Mutex::new(ThreadStateData::v1())),
      save_mutex: Arc::new(Mutex::new(())),
      storage_path,
      last_save_ok_at: Arc::new(Mutex::new(None)),
      last_save_error: Arc::new(Mutex::new(None)),
    }
  }

  fn load(&self) {
    let path = self.storage_path.clone();
    if !path.is_file() {
      return;
    }
    match std::fs::read_to_string(&path) {
      Ok(s) => match serde_json::from_str::<ThreadStateData>(&s) {
        Ok(parsed) => {
          if let Ok(mut d) = self.data.lock() {
            *d = parsed;
          }
        }
        Err(e) => {
          eprintln!("ThreadState load: invalid JSON, starting fresh: {}", e);
          if let Ok(mut d) = self.data.lock() {
            *d = ThreadStateData::v1();
          }
        }
      },
      Err(e) => eprintln!("ThreadState load error: {}", e),
    }
  }

  fn save_atomic(&self) {
    let _guard = self.save_mutex.lock().unwrap();

    let tmp_path = self.storage_path.with_extension("json.tmp");
    let final_path = self.storage_path.clone();

    let data_snapshot = {
      let d = self.data.lock().unwrap();
      serde_json::to_string_pretty(&*d).unwrap_or_else(|_| "{}".to_string())
    };

    if let Some(parent) = final_path.parent() {
      let _ = std::fs::create_dir_all(parent);
    }

    let write_res = std::fs::write(&tmp_path, data_snapshot.as_bytes());
    if let Err(e) = write_res {
      *self.last_save_error.lock().unwrap() = Some(format!("{}", e));
      return;
    }

    // atomic-ish rename
    let rename_res = std::fs::rename(&tmp_path, &final_path);
    match rename_res {
      Ok(_) => {
        *self.last_save_ok_at.lock().unwrap() = Some(now_ms());
        *self.last_save_error.lock().unwrap() = None;
      }
      Err(e) => {
        *self.last_save_error.lock().unwrap() = Some(format!("{}", e));
      }
    }
  }

  fn add_message(&self, msg: Message, participants: Vec<String>) {
    let mut d = self.data.lock().unwrap();
    let entry = d.threads.entry(msg.thread_id.clone()).or_insert(ThreadData {
      id: msg.thread_id.clone(),
      participants: vec![],
      last_message_timestamp: 0,
      unread_count: 0,
      messages: vec![],
    });

    // participants merge
    let mut set: HashSet<String> = entry.participants.iter().cloned().collect();
    for p in participants {
      set.insert(p);
    }
    entry.participants = set.into_iter().collect();
    entry.participants.sort();

    // dedupe by id
    let exists = entry.messages.iter().any(|m| m.id == msg.id);
    if !exists {
      if msg.direction == Direction::Incoming {
        entry.unread_count = entry.unread_count.saturating_add(1);
      }
      entry.last_message_timestamp = std::cmp::max(entry.last_message_timestamp, msg.timestamp);
      entry.messages.push(msg);
      entry.messages.sort_by_key(|m| m.timestamp);
    }

    drop(d);
    self.save_atomic();
  }

  fn mark_thread_read(&self, thread_id: &str) -> bool {
    let mut d = self.data.lock().unwrap();
    if let Some(t) = d.threads.get_mut(thread_id) {
      t.unread_count = 0;
      drop(d);
      self.save_atomic();
      true
    } else {
      false
    }
  }

  fn get_threads(&self) -> Vec<ThreadSummary> {
    let d = self.data.lock().unwrap();
    let mut out: Vec<ThreadSummary> = d
      .threads
      .values()
      .map(|t| ThreadSummary {
        id: t.id.clone(),
        participants: t.participants.clone(),
        last_message_timestamp: t.last_message_timestamp,
        unread_count: t.unread_count,
        message_count: t.messages.len() as u32,
      })
      .collect();

    out.sort_by(|a, b| b.last_message_timestamp.cmp(&a.last_message_timestamp));
    out
  }

  fn get_thread_messages(&self, thread_id: &str) -> Vec<Message> {
    let d = self.data.lock().unwrap();
    d.threads
      .get(thread_id)
      .map(|t| t.messages.clone())
      .unwrap_or_else(Vec::new)
  }
}

// --------------------
// Alias manager (per account)
// --------------------
#[derive(Clone)]
struct AliasManager {
  dir: PathBuf,
  data: Arc<Mutex<HashMap<String, HashMap<String, String>>>>, // account -> (number->alias)
}

impl AliasManager {
  fn new(dir: PathBuf) -> Self {
    Self { dir, data: Arc::new(Mutex::new(HashMap::new())) }
  }

  fn path_for(&self, account_id: &str) -> PathBuf {
    self.dir.join(format!("{}.json", sanitize_filename(account_id)))
  }

  fn load_account(&self, account_id: &str) {
    let path = self.path_for(account_id);
    if !path.is_file() {
      return;
    }
    if let Ok(s) = std::fs::read_to_string(&path) {
      if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&s) {
        self.data.lock().unwrap().insert(account_id.to_string(), map);
      }
    }
  }

  fn save_account(&self, account_id: &str) {
    let path = self.path_for(account_id);
    if let Some(parent) = path.parent() {
      let _ = std::fs::create_dir_all(parent);
    }
    let map = self
      .data
      .lock()
      .unwrap()
      .get(account_id)
      .cloned()
      .unwrap_or_else(HashMap::new);

    let tmp = path.with_extension("json.tmp");
    if let Ok(s) = serde_json::to_string_pretty(&map) {
      if std::fs::write(&tmp, s.as_bytes()).is_ok() {
        let _ = std::fs::rename(&tmp, &path);
      }
    }
  }

  fn list_aliases(&self, account_id: &str) -> HashMap<String, String> {
    self.data
      .lock()
      .unwrap()
      .get(account_id)
      .cloned()
      .unwrap_or_else(HashMap::new)
  }

  fn set_alias(&self, account_id: &str, number: &str, alias: &str) {
    let mut d = self.data.lock().unwrap();
    let entry = d.entry(account_id.to_string()).or_insert_with(HashMap::new);
    entry.insert(number.to_string(), alias.to_string());
    drop(d);
    self.save_account(account_id);
  }

  fn get_alias(&self, account_id: &str, number: &str) -> Option<String> {
    self.data
      .lock()
      .unwrap()
      .get(account_id)
      .and_then(|m| m.get(number).cloned())
  }
}

// --------------------
// Search (simple in-memory scan, backend source-of-truth)
// --------------------
#[derive(Clone, Debug, Serialize)]
struct SearchResult {
  message_id: String,
  thread_id: String,
  timestamp: i64,
  sender: String,
  snippet: String,
}

fn search_in_messages(messages: &[Message], q: &str, limit: usize) -> Vec<SearchResult> {
  let qq = q.to_lowercase();
  let mut out: Vec<SearchResult> = vec![];

  for m in messages.iter() {
    let hay = m.content.to_lowercase();
    if hay.contains(&qq) {
      let snippet = make_snippet(&m.content, &qq, 120);
      out.push(SearchResult {
        message_id: m.id.clone(),
        thread_id: m.thread_id.clone(),
        timestamp: m.timestamp,
        sender: m.sender.clone(),
        snippet,
      });
      if out.len() >= limit {
        break;
      }
    }
  }

  // naive ranking: newest first
  out.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
  out.truncate(limit);
  out
}

fn make_snippet(text: &str, _q: &str, max_len: usize) -> String {
  if text.len() <= max_len {
    return text.to_string();
  }
  let mut s = text[..max_len].to_string();
  s.push(…);
  s
}

// --------------------
// AI tools (Ollama optional; never auto-send)
// --------------------
fn run_ollama(model: &str, prompt: &str) -> Result<String, String> {
  // Requires `ollama` in PATH
  let out = Command::new("ollama")
    .arg("run")
    .arg(model)
    .arg(prompt)
    .output()
    .map_err(|e| format!("ollama exec error: {}", e))?;

  if !out.status.success() {
    let e = String::from_utf8_lossy(&out.stderr).to_string();
    return Err(format!("ollama error: {}", e));
  }
  Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn ai_enabled() -> bool {
  std::env::var("SIGNALX_OLLAMA_MODEL").ok().map(|s| !s.trim().is_empty()).unwrap_or(false)
}

// --------------------
// Receive loop monitor
// --------------------
#[derive(Clone, Debug, Serialize)]
struct ReceiveLoopState {
  last_receive_ok_at: Option<i64>,
  last_receive_error: Option<String>,
  consecutive_failures: u32,
  backoff_ms: u64,
  cooldown_until: Option<i64>,
}

#[derive(Clone)]
struct ReceiveLoopMonitor {
  state: Arc<Mutex<ReceiveLoopState>>,
}

impl ReceiveLoopMonitor {
  fn new() -> Self {
    Self {
      state: Arc::new(Mutex::new(ReceiveLoopState {
        last_receive_ok_at: None,
        last_receive_error: None,
        consecutive_failures: 0,
        backoff_ms: 0,
        cooldown_until: None,
      })),
    }
  }

  fn on_success(&self) {
    let mut s = self.state.lock().unwrap();
    s.last_receive_ok_at = Some(now_ms());
    s.last_receive_error = None;
    s.consecutive_failures = 0;
    s.backoff_ms = 0;
    s.cooldown_until = None;
  }

  fn on_error(&self, e: String) {
    let mut s = self.state.lock().unwrap();
    s.last_receive_error = Some(e);
    s.consecutive_failures = s.consecutive_failures.saturating_add(1);
    let next = if s.backoff_ms == 0 { 250 } else { (s.backoff_ms * 2).min(MAX_BACKOFF_MS) };
    s.backoff_ms = next;

    // self-heal cooldown if too many consecutive failures
    if s.consecutive_failures >= SELF_HEAL_FAILURE_THRESHOLD {
      s.cooldown_until = Some(now_ms() + COOLDOWN_MS_AFTER_SELF_HEAL as i64);
      s.consecutive_failures = 0;
      s.backoff_ms = 0;
    }
  }

  fn snapshot(&self) -> ReceiveLoopState {
    self.state.lock().unwrap().clone()
  }
}

// --------------------
// Account manager
// --------------------
#[derive(Clone)]
struct AccountManager {
  base_threads_dir: PathBuf,
  active_account: Arc<Mutex<Option<String>>>,
  states: Arc<Mutex<HashMap<String, ThreadState>>>,
}

impl AccountManager {
  fn new(base_threads_dir: PathBuf) -> Self {
    Self {
      base_threads_dir,
      active_account: Arc::new(Mutex::new(None)),
      states: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  fn storage_path_for(&self, account_id: &str) -> PathBuf {
    self.base_threads_dir.join(format!("{}.json", sanitize_filename(account_id)))
  }

  fn get_or_create(&self, account_id: &str) -> ThreadState {
    let mut map = self.states.lock().unwrap();
    if let Some(ts) = map.get(account_id) {
      return ts.clone();
    }
    let ts = ThreadState::new(account_id.to_string(), self.storage_path_for(account_id));
    ts.load();
    map.insert(account_id.to_string(), ts.clone());
    ts
  }

  fn list_accounts(&self) -> Vec<String> {
    let mut out: Vec<String> = vec![];

    // from in-memory known accounts
    {
      let map = self.states.lock().unwrap();
      for k in map.keys() {
        out.push(k.clone());
      }
    }

    // from disk files
    if let Ok(entries) = std::fs::read_dir(&self.base_threads_dir) {
      for e in entries.flatten() {
        let p = e.path();
        if p.extension().and_then(|s| s.to_str()) == Some("json") {
          if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
            out.push(stem.to_string());
          }
        }
      }
    }

    out.sort();
    out.dedup();
    out
  }

  fn get_active(&self) -> Option<String> {
    self.active_account.lock().unwrap().clone()
  }

  fn set_active(&self, account_id: String) {
    *self.active_account.lock().unwrap() = Some(account_id);
  }
}

// --------------------
// Normalization
// --------------------
fn normalize_incoming_message(my_number: &str, v: &Value) -> Option<(Message, Vec<String>)> {
  let env = v.get("envelope")?;
  let ts = env.get("timestamp").and_then(|x| x.as_i64()).unwrap_or_else(now_ms);
  let source = env.get("source").or_else(|| env.get("sourceNumber")).and_then(|x| x.as_str()).unwrap_or("unknown");
  let source_device = env.get("sourceDevice").and_then(|x| x.as_i64()).unwrap_or(0);

  let data_msg = env.get("dataMessage").unwrap_or(&Value::Null);
  let content = data_msg
    .get("message")
    .and_then(|x| x.as_str())
    .map(|s| s.to_string())
    .unwrap_or_else(|| {
      // fallback
      v.to_string()
    });

  // group detection (best-effort)
  let mut thread_id = source.to_string();
  if let Some(group) = data_msg.get("groupInfo") {
    if let Some(gid) = group.get("groupId").and_then(|x| x.as_str()) {
      thread_id = format!("group:{}", gid);
    } else if let Some(gid) = group.get("groupId").and_then(|x| x.as_array()) {
      // sometimes bytes array; stringify
      thread_id = format!("group:{:?}", gid);
    }
  }

  let id = format!("incoming-{}-{}-{}", source, ts, source_device);

  let msg = Message {
    id,
    thread_id: thread_id.clone(),
    timestamp: ts,
    sender: source.to_string(),
    recipient: Some(my_number.to_string()),
    content,
    direction: Direction::Incoming,
    raw_json: Some(v.clone()),
  };

  // participants best-effort
  let mut participants: Vec<String> = vec![];
  if thread_id.starts_with("group:") {
    // if we can find members, include them; otherwise include sender + me
    if let Some(group) = data_msg.get("groupInfo") {
      if let Some(members) = group.get("members").and_then(|x| x.as_array()) {
        for m in members.iter().filter_map(|x| x.as_str()) {
          participants.push(m.to_string());
        }
      }
    }
    if participants.is_empty() {
      participants.push(source.to_string());
      participants.push(my_number.to_string());
    }
  } else {
    participants.push(source.to_string());
    participants.push(my_number.to_string());
  }

  Some((msg, participants))
}

fn normalize_outgoing_message(my_number: &str, thread_id: &str, recipient: &str, content: &str) -> (Message, Vec<String>) {
  let ts = now_ms();
  let id = format!("outgoing-{}-{}", recipient, ts);
  let msg = Message {
    id,
    thread_id: thread_id.to_string(),
    timestamp: ts,
    sender: my_number.to_string(),
    recipient: Some(recipient.to_string()),
    content: content.to_string(),
    direction: Direction::Outgoing,
    raw_json: None,
  };
  (msg, vec![my_number.to_string(), recipient.to_string()])
}

// --------------------
// Diagnostics
// --------------------
#[derive(Clone, Debug, Serialize)]
struct Diagnostics {
  env_path: Option<String>,
  app_data_dir: String,
  threads_dir: String,
  aliases_dir: String,
  search_dir: String,
  signal_cli_path: String,
  signal_cli_version: Option<String>,
  signal_cli_usable: bool,
  signal_cli_last_error: Option<String>,
  config_path: Option<String>,
  number: Option<String>,
  active_account: Option<String>,
}

// --------------------
// Tauri shared state
// --------------------
#[derive(Clone)]
struct AppState {
  env_path: Option<PathBuf>,
  app_data_dir: PathBuf,
  threads_dir: PathBuf,
  aliases_dir: PathBuf,
  search_dir: PathBuf,
  account_manager: AccountManager,
  alias_manager: AliasManager,
  receive_monitor: ReceiveLoopMonitor,
  signal_cli_info: Arc<Mutex<SignalCliInfo>>,
}

fn now_ms() -> i64 {
  use std::time::{SystemTime, UNIX_EPOCH};
  SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

fn sanitize_filename(s: &str) -> String {
  s.chars()
    .map(|c| if c.is_ascii_alphanumeric() || c == - || c == _ { c } else { _ })
    .collect()
}

// --------------------
// Tauri commands
// --------------------
#[tauri::command]
fn get_receive_loop_state(state: tauri::State<AppState>) -> Value {
  ok_t(state.receive_monitor.snapshot())
}

#[tauri::command]
fn get_diagnostics(state: tauri::State<AppState>) -> Value {
  let cli = state.signal_cli_info.lock().unwrap().clone();
  let diag = Diagnostics {
    env_path: state.env_path.as_ref().map(|p| p.to_string_lossy().to_string()),
    app_data_dir: state.app_data_dir.to_string_lossy().to_string(),
    threads_dir: state.threads_dir.to_string_lossy().to_string(),
    aliases_dir: state.aliases_dir.to_string_lossy().to_string(),
    search_dir: state.search_dir.to_string_lossy().to_string(),
    signal_cli_path: cli.bin,
    signal_cli_version: cli.version,
    signal_cli_usable: cli.is_usable,
    signal_cli_last_error: cli.last_error,
    config_path: get_signal_config(),
    number: get_signal_number(),
    active_account: state.account_manager.get_active(),
  };
  ok_t(diag)
}

#[tauri::command]
fn list_accounts(state: tauri::State<AppState>) -> Value {
  ok_t(state.account_manager.list_accounts())
}

#[tauri::command]
fn get_active_account(state: tauri::State<AppState>) -> Value {
  ok(json!({ "account_id": state.account_manager.get_active() }))
}

#[tauri::command]
fn set_active_account(app: tauri::AppHandle, state: tauri::State<AppState>, account_id: String) -> Value {
  let account_id = account_id.trim().to_string();
  if account_id.is_empty() {
    return err("account_id cannot be empty".to_string());
  }

  // ensure exists/loaded
  let _ts = state.account_manager.get_or_create(&account_id);
  state.alias_manager.load_account(&account_id);

  state.account_manager.set_active(account_id.clone());
  let _ = app.emit("account-changed", json!({ "account_id": account_id.clone() }));
  ok(json!(true))
}

#[tauri::command]
fn get_threads(state: tauri::State<AppState>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => {
      // fallback to SIGNALX_NUMBER if possible
      if let Some(n) = get_signal_number() {
        state.account_manager.set_active(n.clone());
        state.alias_manager.load_account(&n);
        n
      } else {
        return ok_t(Vec::<ThreadSummary>::new());
      }
    }
  };
  let ts = state.account_manager.get_or_create(&account);
  ok_t(ts.get_threads())
}

#[tauri::command]
fn get_thread_messages(state: tauri::State<AppState>, thread_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(Vec::<Message>::new()),
  };
  let ts = state.account_manager.get_or_create(&account);
  ok_t(ts.get_thread_messages(thread_id.trim()))
}

#[tauri::command]
fn mark_thread_read(state: tauri::State<AppState>, thread_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok(json!(false)),
  };
  let ts = state.account_manager.get_or_create(&account);
  ok(json!(ts.mark_thread_read(thread_id.trim())))
}

#[tauri::command]
fn list_aliases(state: tauri::State<AppState>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(HashMap::<String, String>::new()),
  };
  ok_t(state.alias_manager.list_aliases(&account))
}

#[tauri::command]
fn get_alias(state: tauri::State<AppState>, number: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok(json!(null)),
  };
  ok(json!(state.alias_manager.get_alias(&account, number.trim())))
}

#[tauri::command]
fn set_alias(state: tauri::State<AppState>, number: String, alias: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let n = number.trim();
  let a = alias.trim();
  if n.is_empty() || a.is_empty() {
    return err("number and alias required".to_string());
  }
  state.alias_manager.set_alias(&account, n, a);
  ok(json!(true))
}

#[tauri::command]
fn search_messages(state: tauri::State<AppState>, query: String, limit: u32, thread_id: Option<String>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(Vec::<SearchResult>::new()),
  };
  let ts = state.account_manager.get_or_create(&account);

  let q = query.trim();
  if q.is_empty() {
    return ok_t(Vec::<SearchResult>::new());
  }

  let limit = limit.max(1).min(500) as usize;

  let mut all: Vec<Message> = vec![];
  if let Some(tid) = thread_id {
    all = ts.get_thread_messages(tid.trim());
  } else {
    for t in ts.get_threads() {
      let msgs = ts.get_thread_messages(&t.id);
      all.extend(msgs);
    }
  }

  ok_t(search_in_messages(&all, q, limit))
}

#[tauri::command]
fn summarize_thread(state: tauri::State<AppState>, thread_id: String, last_n: Option<u32>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let ts = state.account_manager.get_or_create(&account);

  let n = last_n.unwrap_or(50).max(1).min(200) as usize;
  let mut msgs = ts.get_thread_messages(thread_id.trim());
  msgs.sort_by_key(|m| m.timestamp);
  if msgs.len() > n {
    msgs = msgs[msgs.len() - n..].to_vec();
  }

  let ctx = msgs
    .iter()
    .map(|m| format!("[{}] {}: {}", m.timestamp, m.sender, m.content))
    .collect::<Vec<_>>()
    .join("\n");

  if !ai_enabled() {
    return err("AI not configured. Set SIGNALX_OLLAMA_MODEL and ensure `ollama` is installed.".to_string());
  }

  let model = std::env::var("SIGNALX_OLLAMA_MODEL").unwrap();
  let prompt = format!(
    "Summarize this Signal thread in 6-10 bullets. Be factual. No emojis reinforces.\n\nTHREAD:\n{}",
    ctx
  );

  let out = std::thread::spawn(move || run_ollama(&model, &prompt)).join().unwrap_or_else(|_| Err("AI thread join failed".to_string()));
  match out {
    Ok(s) => ok(json!(s.trim().to_string())),
    Err(e) => err(e),
  }
}

#[tauri::command]
fn draft_reply(state: tauri::State<AppState>, thread_id: String, intent: String, constraints: Option<String>, last_n: Option<u32>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let ts = state.account_manager.get_or_create(&account);

  let n = last_n.unwrap_or(50).max(1).min(200) as usize;
  let mut msgs = ts.get_thread_messages(thread_id.trim());
  msgs.sort_by_key(|m| m.timestamp);
  if msgs.len() > n {
    msgs = msgs[msgs.len() - n..].to_vec();
  }

  let ctx = msgs
    .iter()
    .map(|m| format!("[{}] {}: {}", m.timestamp, m.sender, m.content))
    .collect::<Vec<_>>()
    .join("\n");

  if !ai_enabled() {
    return err("AI not configured. Set SIGNALX_OLLAMA_MODEL and ensure `ollama` is installed.".to_string());
  }

  let model = std::env::var("SIGNALX_OLLAMA_MODEL").unwrap();
  let c = constraints.unwrap_or_else(|| "short, clear".to_string());
  let prompt = format!(
    "Draft a reply to this Signal thread.\nIntent: {}\nConstraints: {}\nRules: Do not mention these rules. Return only the reply text.\n\nTHREAD:\n{}",
    intent, c, ctx
  );

  let out = std::thread::spawn(move || run_ollama(&model, &prompt)).join().unwrap_or_else(|_| Err("AI thread join failed".to_string()));
  match out {
    Ok(s) => ok(json!(s.trim().to_string())),
    Err(e) => err(e),
  }
}

#[tauri::command]
fn send_message(app: tauri::AppHandle, state: tauri::State<AppState>, thread_id: String, message: String) -> Value {
  let config = match get_signal_config() {
    Some(c) => c,
    None => return err("SIGNALX_SIGNALCLI_CONFIG not set".to_string()),
  };
  let my_number = match get_signal_number() {
    Some(n) => n,
    None => return err("SIGNALX_NUMBER not set".to_string()),
  };

  let thread_id = thread_id.trim().to_string();
  let text = message.trim().to_string();
  if thread_id.is_empty() || text.is_empty() {
    return err("threadId and message required".to_string());
  }

  // For now: DM thread_id is a phone number; group send requires more work (kept future)
  if thread_id.starts_with("group:") {
    return err("Group sending not implemented yet in this bundle (thread_id starts with group:).".to_string());
  }
  let recipient = thread_id.clone();

  // send via signal-cli (spawn_blocking)
  let cfg = config.clone();
  let num = my_number.clone();
  let txt = text.clone();
  let rec = recipient.clone();

  let res = tauri::async_runtime::block_on(async move {
    tokio::task::spawn_blocking(move || {
      let out = build_signal_command(&cfg, Some(&num))
        .arg("send")
        .arg("-m")
        .arg(&txt)
        .arg(&rec)
        .output()
        .map_err(|e| format!("failed to run signal-cli: {}", e))?;

      if !out.status.success() {
        let e = String::from_utf8_lossy(&out.stderr).to_string();
        return Err(format!("Failed to send message: {}", e));
      }
      Ok(())
    })
    .await
    .map_err(|e| format!("send join error: {}", e))?
  });

  if let Err(e) = res {
    return err(e);
  }

  // store + emit normalized outgoing
  let account = state.account_manager.get_active().unwrap_or_else(|| my_number.clone());
  let ts = state.account_manager.get_or_create(&account);
  let (msg, participants) = normalize_outgoing_message(&my_number, &recipient, &recipient, &text);
  ts.add_message(msg.clone(), participants);

  let _ = app.emit("message-sent", msg);
  ok(json!({ "status": "sent" }))
}

// --------------------
// Background receive loop
// --------------------
fn start_receive_loop(app: tauri::AppHandle, state: AppState) {
  tauri::async_runtime::spawn(async move {
    loop {
      // cooldown window (self-heal)
      let snap = state.receive_monitor.snapshot();
      if let Some(until) = snap.cooldown_until {
        if now_ms() < until {
          tokio::time::sleep(std::time::Duration::from_millis(250)).await;
          continue;
        }
      }

      // capture required env
      let config = match get_signal_config() {
        Some(c) => c,
        None => {
          state.receive_monitor.on_error("SIGNALX_SIGNALCLI_CONFIG not set".to_string());
          tokio::time::sleep(std::time::Duration::from_millis(500)).await;
          continue;
        }
      };
      let my_number = match get_signal_number() {
        Some(n) => n,
        None => {
          state.receive_monitor.on_error("SIGNALX_NUMBER not set".to_string());
          tokio::time::sleep(std::time::Duration::from_millis(500)).await;
          continue;
        }
      };

      // ensure active account fallback
      if state.account_manager.get_active().is_none() {
        state.account_manager.set_active(my_number.clone());
        state.alias_manager.load_account(&my_number);
      }

      let cfg = config.clone();
      let num = my_number.clone();

      let received: Result<Vec<Value>, String> = tokio::task::spawn_blocking(move || {
        let out = build_signal_command(&cfg, Some(&num))
          .arg("receive")
          .arg("--timeout")
          .arg(RECEIVE_TIMEOUT_SECS)
          .arg("--max-messages")
          .arg(RECEIVE_MAX_MESSAGES)
          .output()
          .map_err(|e| format!("failed to run signal-cli receive: {}", e))?;

        if !out.status.success() {
          let e = String::from_utf8_lossy(&out.stderr).to_string();
          return Err(format!("signal-cli receive error: {}", e));
        }

        let stdout = String::from_utf8_lossy(&out.stdout);
        // signal-cli outputs JSON per line when -o json is set; parse each non-empty line
        let lines: Vec<&str> = stdout.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
        let mut msgs: Vec<Value> = vec![];
        for line in lines {
          if let Ok(v) = serde_json::from_str::<Value>(line) {
            msgs.push(v);
          }
        }
        Ok(msgs)
      })
      .await
      .map_err(|e| format!("receive join error: {}", e))
      .and_then(|x| x);

      match received {
        Ok(list) => {
          state.receive_monitor.on_success();

          if !list.is_empty() {
            let account = state.account_manager.get_active().unwrap_or_else(|| my_number.clone());
            let ts = state.account_manager.get_or_create(&account);

            for v in list.iter() {
              if let Some((msg, participants)) = normalize_incoming_message(&my_number, v) {
                ts.add_message(msg.clone(), participants);
                let _ = app.emit("message-received", msg);
              }
            }
          }
        }
        Err(e) => {
          state.receive_monitor.on_error(e);
        }
      }

      // backoff
      let snap2 = state.receive_monitor.snapshot();
      if snap2.backoff_ms > 0 {
        tokio::time::sleep(std::time::Duration::from_millis(snap2.backoff_ms)).await;
      } else {
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
      }
    }
  });
}

// --------------------
// main
// --------------------
fn main() {
  let env_path = load_env().ok().flatten();

  let app_data_dir = dirs_next::data_dir()
    .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
    .join("SignalX");

  let threads_dir = app_data_dir.join("threads");
  let aliases_dir = app_data_dir.join("aliases");
  let search_dir = app_data_dir.join("search");

  let _ = std::fs::create_dir_all(&threads_dir);
  let _ = std::fs::create_dir_all(&aliases_dir);
  let _ = std::fs::create_dir_all(&search_dir);

  let cli_path = get_signal_cli_path();
  let cli_info = probe_signal_cli(&cli_path);

  let state = AppState {
    env_path: env_path.clone(),
    app_data_dir: app_data_dir.clone(),
    threads_dir: threads_dir.clone(),
    aliases_dir: aliases_dir.clone(),
    search_dir: search_dir.clone(),
    account_manager: AccountManager::new(threads_dir.clone()),
    alias_manager: AliasManager::new(aliases_dir.clone()),
    receive_monitor: ReceiveLoopMonitor::new(),
    signal_cli_info: Arc::new(Mutex::new(cli_info)),
  };

  tauri::Builder::default()
    .manage(state.clone())
    .setup(move |app| {
      // refresh signal-cli probe on startup
      let cli_path = get_signal_cli_path();
      let cli_info = probe_signal_cli(&cli_path);
      {
        let mut lock = state.signal_cli_info.lock().unwrap();
        *lock = cli_info;
      }

      // warm active account
      if let Some(n) = get_signal_number() {
        state.account_manager.set_active(n.clone());
        state.account_manager.get_or_create(&n);
        state.alias_manager.load_account(&n);
      }

      start_receive_loop(app.handle().clone(), state.clone());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_receive_loop_state,
      get_diagnostics,
      list_accounts,
      get_active_account,
      set_active_account,
      get_threads,
      get_thread_messages,
      mark_thread_read,
      list_aliases,
      get_alias,
      set_alias,
      search_messages,
      summarize_thread,
      draft_reply,
      send_message
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
EOF

# -------------------------
# Dev launcher: SignalX-Dev.command
# -------------------------
cat > ./SignalX-Dev.command <<'EOF'
#!/bin/zsh
set -e

ROOT="/Users/cameroncohen/Developer/apps/signalx"
LOG="$ROOT/run-dev.command.log"

echo "=== SignalX Dev Launcher ===" | tee "$LOG"
date | tee -a "$LOG"

cd "$ROOT" | tee -a "$LOG"

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found" | tee -a "$LOG"
  exit 1
fi

if ! command -v signal-cli >/dev/null 2>&1; then
  echo "ERROR: signal-cli not found (install via Homebrew)" | tee -a "$LOG"
  exit 1
fi

# Kill anything on 5173
if command -v lsof >/dev/null 2>&1; then
  PID="$(lsof -ti tcp:5173 || true)"
  if [ -n "$PID" ]; then
    echo "Killing process on port 5173: $PID" | tee -a "$LOG"
    kill -9 $PID || true
  fi
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "node_modules missing; running npm install..." | tee -a "$LOG"
  npm install 2>&1 | tee -a "$LOG"
fi

echo "Starting: npm run dev (Vite) + Tauri dev" | tee -a "$LOG"
echo "If Tauri says Waiting for frontend: open another terminal and run: npm run dev" | tee -a "$LOG"

# Start Vite in background
npm run dev -- --host 127.0.0.1 --port 5173 2>&1 | tee -a "$LOG" &
sleep 1

# Start Tauri (uses @tauri-apps/cli in node_modules)
npm run tauri dev 2>&1 | tee -a "$LOG"
EOF

chmod +x ./SignalX-Dev.command

echo
echo "✅ Applied SignalX Cursor Bundle:"
echo " - src/App.tsx"
echo " - src/App.css"
echo " - src-tauri/src/main.rs"
echo " - SignalX-Dev.command (chmod +x)"
echo
echo "Next:"
echo "  cd $ROOT"
echo "  npm run tauri dev"
echo "or double-click: SignalX-Dev.command"
