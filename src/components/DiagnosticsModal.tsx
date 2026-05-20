import React from "react";

type DiagnosticsModalProps = {
  open: boolean;
  onClose: () => void;
  diagnosticsJson: any;
  receiveStateJson: any;
  logs: string[];
};

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({ open, onClose, diagnosticsJson, receiveStateJson, logs }) => {
  if (!open) return null;

  const dump = JSON.stringify(
    {
      diagnostics: diagnosticsJson,
      receive_loop: receiveStateJson,
      logs,
    },
    null,
    2
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dump);
    } catch {
      // ignore; clipboard may be denied
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(1100px, 96vw)",
          height: "min(780px, 88vh)",
          background: "#0b0d10",
          border: "1px solid #1f2937",
          borderRadius: 16,
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: 12, borderBottom: "1px solid #1f2937", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800 }}>Diagnostics</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={copy}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer", fontSize: 12 }}
            >
              Copy dump
            </button>
            <button
              onClick={onClose}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer", fontSize: 12 }}
            >
              Close
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
          <div style={{ borderRight: "1px solid #1f2937", overflow: "auto" }}>
            <div style={{ padding: 12, borderBottom: "1px solid #1f2937" }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>get_diagnostics</div>
              <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 11, color: "#e5e7eb", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(diagnosticsJson, null, 2)}
              </pre>
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>get_receive_loop_state</div>
              <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 11, color: "#e5e7eb", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(receiveStateJson, null, 2)}
              </pre>
            </div>
          </div>

          <div style={{ overflow: "auto" }}>
            <div style={{ padding: 12, borderBottom: "1px solid #1f2937" }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Debug log</div>
              <div style={{ fontFamily: "monospace", fontSize: 11 }}>
                {logs.length === 0 ? <div style={{ color: "#6b7280" }}>No logs yet.</div> : null}
                {logs.slice(-600).map((l, idx) => (
                  <div key={idx} style={{ color: "#9ca3af", marginBottom: 4 }}>
                    {l}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: 12, color: "#9ca3af", fontSize: 12 }}>
              Tip: close this modal to return to Threads + Conversation + Tools.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


