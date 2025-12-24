import React, { useEffect, useMemo, useState } from "react";

export type PendingReply = {
  message_id: string;
  thread_id: string;
  draft: string;
  intent: string;
  created_at: number;
};

export type Message = {
  id: string;
  thread_id: string;
  timestamp: number;
  sender: string;
  content: string;
  direction: "Incoming" | "Outgoing";
};

export type ReceiveLoopState = {
  last_receive_ok_at: number | null;
  last_receive_error: string | null;
  consecutive_failures: number;
  backoff_ms: number;
  cooldown_until: number | null;
};

type ExportResult = {
  path: string;
  format: string;
  message_count: number;
} | null;

type ToolsPanelProps = {
  visible: boolean;
  selectedThreadId: string | null;
  pendingReplies: PendingReply[];
  messages: Message[];
  aiIntent: string;
  setAiIntent: (v: string) => void;
  aiConstraints: string;
  setAiConstraints: (v: string) => void;
  aiOutput: string;
  onSummarize: () => void;
  onDraft: () => void;
  onExport: (format: "txt" | "json") => void;
  exportResult: ExportResult;
  onOpenExportFolder: (filePath: string) => void;
  receiveLoopState: ReceiveLoopState | null;
  agentEnabled: boolean;
  onOpenDiagnostics: () => void;
  onJumpToMessage: (messageId: string) => void;
};

function Card({
  title,
  right,
  children,
  defaultOpen = true,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: "1px solid var(--sx-border)",
        borderRadius: 12,
        background: "rgba(0,0,0,.18)",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "12px 12px",
          border: "none",
          background: "transparent",
          color: "var(--sx-text)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span style={{ fontWeight: 800 }}>{title}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {right}
          <span style={{ color: "#9ca3af", fontSize: 12 }}>
            {open ? "Hide" : "Show"}
          </span>
        </span>
      </button>
      {open ? (
        <div style={{ padding: "0 12px 12px 12px" }}>{children}</div>
      ) : null}
    </div>
  );
}

function fmtTime(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export const ToolsPanel: React.FC<ToolsPanelProps> = (props) => {
  const {
    visible,
    selectedThreadId,
    pendingReplies,
    messages,
    aiIntent,
    setAiIntent,
    aiConstraints,
    setAiConstraints,
    aiOutput,
    onSummarize,
    onDraft,
    onExport,
    exportResult,
    onOpenExportFolder,
    receiveLoopState,
    agentEnabled,
    onOpenDiagnostics,
    onJumpToMessage,
  } = props;

  const [threadSearch, setThreadSearch] = useState("");

  // UI prefs (stored locally)
  const [uiDensity, setUiDensity] = useState<string>(
    () => localStorage.getItem("signalx.ui.density") || "comfortable"
  );
  const [uiContrast, setUiContrast] = useState<string>(
    () => localStorage.getItem("signalx.ui.contrast") || "normal"
  );
  const [uiFontScale, setUiFontScale] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem("signalx.ui.fontScale") || "1");
    return Number.isFinite(v) ? Math.min(1.25, Math.max(0.85, v)) : 1;
  });

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.density = uiDensity;
    el.dataset.contrast = uiContrast;
    el.style.setProperty("--sx-font-scale", String(uiFontScale));
    localStorage.setItem("signalx.ui.density", uiDensity);
    localStorage.setItem("signalx.ui.contrast", uiContrast);
    localStorage.setItem("signalx.ui.fontScale", String(uiFontScale));
  }, [uiDensity, uiContrast, uiFontScale]);

  const threadSearchResults = useMemo(() => {
    const q = threadSearch.trim().toLowerCase();
    if (!selectedThreadId || !q) return [];
    const hits = messages
      .filter((m) => m.thread_id === selectedThreadId)
      .filter((m) => m.content.toLowerCase().includes(q))
      .slice(-50)
      .map((m) => ({
        id: m.id,
        timestamp: m.timestamp,
        sender: m.sender,
        snippet: m.content.slice(0, 140),
      }));
    return hits;
  }, [threadSearch, messages, selectedThreadId]);

  if (!visible) return null;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <Card title="UI" defaultOpen={false}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ width: 90, color: "var(--sx-muted)", fontSize: 12 }}>
              Density
            </label>
            <select
              value={uiDensity}
              onChange={(e) => setUiDensity(e.target.value)}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 10,
                border: "1px solid var(--sx-border)",
                background: "rgba(0,0,0,.22)",
                color: "var(--sx-text)",
              }}
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="spacious">Spacious</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ width: 90, color: "var(--sx-muted)", fontSize: 12 }}>
              Contrast
            </label>
            <select
              value={uiContrast}
              onChange={(e) => setUiContrast(e.target.value)}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 10,
                border: "1px solid var(--sx-border)",
                background: "rgba(0,0,0,.22)",
                color: "var(--sx-text)",
              }}
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ width: 90, color: "var(--sx-muted)", fontSize: 12 }}>
              Text size
            </label>
            <input
              type="range"
              min={0.9}
              max={1.15}
              step={0.01}
              value={uiFontScale}
              onChange={(e) => setUiFontScale(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ width: 44, color: "var(--sx-muted)", fontSize: 12 }}>
              {Math.round(uiFontScale * 100)}%
            </span>
          </div>

          <div style={{ color: "var(--sx-muted)", fontSize: 12, lineHeight: 1.4 }}>
            These settings apply immediately and are saved locally.
          </div>
        </div>
      </Card>

      {selectedThreadId ? null : (
        <div
          style={{
            padding: 12,
            border: "1px solid var(--sx-border)",
            borderRadius: 12,
            background: "rgba(0,0,0,.18)",
            color: "var(--sx-muted)",
          }}
        >
          Select a thread to see tools.
        </div>
      )}

      <Card
        title="AI Tools"
        defaultOpen={true}
        right={
          pendingReplies.length > 0 ? (
            <span
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 999,
                background: "#064e3b",
                border: "1px solid #10b981",
                color: "#d1fae5",
              }}
            >
              Drafts: {pendingReplies.length}
            </span>
          ) : null
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={aiIntent}
              onChange={(e) => setAiIntent(e.target.value)}
              placeholder="intent"
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #374151",
                background: "#111827",
                color: "#e5e7eb",
              }}
            />
            <input
              value={aiConstraints}
              onChange={(e) => setAiConstraints(e.target.value)}
              placeholder="constraints"
              style={{
                flex: 2,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #374151",
                background: "#111827",
                color: "#e5e7eb",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onSummarize}
              disabled={!selectedThreadId}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #374151",
                background: "#111827",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              Summarize
            </button>
            <button
              onClick={onDraft}
              disabled={!selectedThreadId}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #374151",
                background: "#111827",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              Draft
            </button>
          </div>
          {aiOutput ? (
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #1f2937",
                background: "#0f172a",
              }}
            >
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                AI output
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{aiOutput}</div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card title="Search" defaultOpen={false}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={threadSearch}
            onChange={(e) => setThreadSearch(e.target.value)}
            placeholder={
              selectedThreadId ? "Search this thread…" : "Select a thread first"
            }
            disabled={!selectedThreadId}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid #374151",
              background: "#111827",
              color: "#e5e7eb",
              opacity: selectedThreadId ? 1 : 0.5,
            }}
          />
          {threadSearchResults.length > 0 ? (
            <div
              style={{
                maxHeight: 220,
                overflow: "auto",
                border: "1px solid #1f2937",
                borderRadius: 10,
              }}
            >
              {threadSearchResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onJumpToMessage(r.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: 10,
                    border: "none",
                    background: "transparent",
                    color: "#e5e7eb",
                    cursor: "pointer",
                    borderBottom: "1px solid #1f2937",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    {r.sender} • {fmtTime(r.timestamp)}
                  </div>
                  <div style={{ fontSize: 13 }}>{r.snippet}</div>
                </button>
              ))}
            </div>
          ) : threadSearch.trim() ? (
            <div style={{ fontSize: 12, color: "#9ca3af" }}>No matches.</div>
          ) : null}
        </div>
      </Card>

      <Card title="Export" defaultOpen={false}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => onExport("txt")}
              disabled={!selectedThreadId}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #374151",
                background: "#111827",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              TXT
            </button>
            <button
              onClick={() => onExport("json")}
              disabled={!selectedThreadId}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #374151",
                background: "#111827",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              JSON
            </button>
          </div>
          {exportResult ? (
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #1f2937",
                background: "#0f172a",
              }}
            >
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                Exported {exportResult.message_count} messages (
                {exportResult.format.toUpperCase()})
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  wordBreak: "break-all",
                  color: "#e5e7eb",
                  marginBottom: 8,
                }}
              >
                {exportResult.path}
              </div>
              <button
                onClick={() => onOpenExportFolder(exportResult.path)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #374151",
                  background: "#1f2937",
                  color: "#e5e7eb",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Reveal in Finder
              </button>
            </div>
          ) : null}
        </div>
      </Card>

      <Card title="Automation Rules" defaultOpen={false}>
        <RulesSection selectedThreadId={selectedThreadId} />
      </Card>

      <Card title="Advanced" defaultOpen={false}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Receive loop:{" "}
            <span
              style={{
                color: receiveLoopState?.consecutive_failures
                  ? "#ef4444"
                  : "#10b981",
                fontWeight: 700,
              }}
            >
              {receiveLoopState?.consecutive_failures
                ? `Errors (${receiveLoopState.consecutive_failures})`
                : "Healthy"}
            </span>
            {receiveLoopState?.last_receive_ok_at
              ? ` • last ok ${fmtTime(receiveLoopState.last_receive_ok_at)}`
              : ""}
            {receiveLoopState?.backoff_ms
              ? ` • backoff ${receiveLoopState.backoff_ms}ms`
              : ""}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Agent mode:{" "}
            <span
              style={{
                fontWeight: 700,
                color: agentEnabled ? "#10b981" : "#9ca3af",
              }}
            >
              {agentEnabled ? "On" : "Off/Unknown"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Diagnostics/Debug are hidden by default. (Step 5: Developer Mode
            gating.)
          </div>
        </div>
      </Card>
    </div>
  );
};

function RulesSection({ selectedThreadId }: { selectedThreadId: string | null }) {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newRuleDsl, setNewRuleDsl] = useState("");
  const [activeAccount, setActiveAccount] = useState<string | null>(null);

  React.useEffect(() => {
    loadRules();
  }, [activeAccount]);

  const loadRules = async () => {
    if (!activeAccount) {
      try {
        const accountRes = await invoke<any>("get_active_account");
        if (accountRes.success && accountRes.data?.account_id) {
          setActiveAccount(accountRes.data.account_id);
        }
      } catch {
        // No active account
      }
      return;
    }

    setLoading(true);
    try {
      const response = await invoke<any>("rules_list", { accountId: activeAccount });
      if (response.success) {
        setRules(response.data || []);
      }
    } catch (err) {
      console.error("Failed to load rules:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (ruleId: string, enabled: boolean) => {
    try {
      await invoke("rules_toggle", { id: ruleId, enabled: !enabled });
      loadRules();
    } catch (err) {
      console.error("Failed to toggle rule:", err);
    }
  };

  const handleCreate = async () => {
    if (!activeAccount || !newRuleDsl.trim()) return;
    try {
      await invoke<any>("rules_upsert", {
        accountId: activeAccount,
        id: null,
        name: "New Rule",
        dsl: newRuleDsl,
      });
      setNewRuleDsl("");
      loadRules();
    } catch (err) {
      console.error("Failed to create rule:", err);
    }
  };

  const handleTest = async () => {
    if (!activeAccount || !selectedThreadId) return;
    // TODO: Get message body and from from selected thread
    try {
      const response = await invoke<any>("rules_run_once", {
        accountId: activeAccount,
        threadId: selectedThreadId,
        messageBody: "test message",
        messageFrom: "+1234567890",
      });
      if (response.success) {
        alert(`Rules executed: ${JSON.stringify(response.data)}`);
      }
    } catch (err) {
      console.error("Failed to test rules:", err);
    }
  };

  if (!activeAccount) {
    return <div style={{ fontSize: 12, color: "#9ca3af" }}>No active account</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={newRuleDsl}
          onChange={(e) => setNewRuleDsl(e.target.value)}
          placeholder='rule "Auto-Thanks"\nwhen message_in contains "thanks"\nthen draft "You'\''re welcome"'
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #374151",
            background: "#111827",
            color: "#e5e7eb",
            fontFamily: "monospace",
            fontSize: 12,
            minHeight: 80,
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleCreate}
          disabled={!newRuleDsl.trim()}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #374151",
            background: "#111827",
            color: "#e5e7eb",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Create Rule
        </button>
        <button
          onClick={handleTest}
          disabled={!selectedThreadId}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #374151",
            background: "#111827",
            color: "#e5e7eb",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Run Test
        </button>
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: "#9ca3af" }}>Loading rules...</div>
      ) : rules.length === 0 ? (
        <div style={{ fontSize: 12, color: "#9ca3af" }}>No rules defined</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rules.map((rule) => (
            <div
              key={rule.id}
              style={{
                padding: 10,
                border: "1px solid #374151",
                borderRadius: 8,
                background: "#111827",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: "#e5e7eb" }}>{rule.name}</span>
                <button
                  onClick={() => handleToggle(rule.id, rule.enabled)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #374151",
                    background: rule.enabled ? "#10b981" : "#374151",
                    color: "#ffffff",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  {rule.enabled ? "ON" : "OFF"}
                </button>
              </div>
              {rule.dsl && (
                <pre
                  style={{
                    fontSize: 11,
                    color: "#9ca3af",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    fontFamily: "monospace",
                  }}
                >
                  {rule.dsl}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
