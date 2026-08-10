import { useEffect, useMemo, useState } from "react";
import type {
  IvrAfterCapture,
  IvrChoice,
  IvrMenus,
  IvrNode,
  IvrPreviewStep,
} from "./api";

const IVR_ACTIONS = [
  { id: "", label: "Nothing extra" },
  { id: "list_catalog", label: "Send the product list" },
  { id: "place_order", label: "Create their order" },
  { id: "order_status", label: "Send order status" },
  { id: "handoff", label: "Hand off to you" },
] as const;

const CAPTURE_PRESETS: { id: string; label: string }[] = [
  { id: "", label: "No — only number replies" },
  { id: "order_idx", label: "Ask which product # they want" },
  { id: "order_qty", label: "Ask how many they want" },
  { id: "note", label: "Ask them to type a note" },
];

function actionLabel(id: string): string {
  return IVR_ACTIONS.find((a) => a.id === id)?.label ?? id;
}

function captureBadge(slot: string): string {
  if (slot === "order_idx") return "asks product #";
  if (slot === "order_qty") return "asks quantity";
  if (slot === "note") return "asks for a note";
  return "asks a question";
}

type ChoiceRow = {
  key: string;
  digit: string;
  goto: string;
  action: string;
  reply: string;
};

function emptyMenus(): IvrMenus {
  return {
    version: 4,
    entry: "main",
    session_ttl_ms: 1_800_000,
    nodes: {
      main: {
        prompt: "Hi — reply with a number:\n1 · See products\n0 · Menu",
        choices: {
          "1": { action: "list_catalog", reply: "Here's the catalog." },
          "0": { goto: "main" },
        },
        on_unknown: "Reply with a number from the menu.",
      },
    },
  };
}

function cloneMenus(m: IvrMenus): IvrMenus {
  return structuredClone(m);
}

function nodeIds(menus: IvrMenus): string[] {
  return Object.keys(menus.nodes).sort((a, b) => {
    if (a === menus.entry) return -1;
    if (b === menus.entry) return 1;
    return a.localeCompare(b);
  });
}

function choicesToRows(node: IvrNode | undefined): ChoiceRow[] {
  if (!node?.choices) return [];
  return Object.entries(node.choices).map(([digit, c], i) => ({
    key: `${digit}-${i}`,
    digit,
    goto: c.goto ?? "",
    action: c.action ?? "",
    reply: c.reply ?? "",
  }));
}

function rowsToChoices(rows: ChoiceRow[]): Record<string, IvrChoice> {
  const out: Record<string, IvrChoice> = {};
  for (const row of rows) {
    const digit = row.digit.trim();
    if (!digit) continue;
    const choice: IvrChoice = {};
    if (row.goto.trim()) choice.goto = row.goto.trim();
    if (row.action.trim()) choice.action = row.action.trim();
    if (row.reply.trim()) choice.reply = row.reply.trim();
    out[digit] = choice;
  }
  return out;
}

function slugifyNodeId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function flowEdges(menus: IvrMenus): { from: string; digit: string; to: string; action: string }[] {
  const edges: { from: string; digit: string; to: string; action: string }[] = [];
  for (const [id, node] of Object.entries(menus.nodes)) {
    if (node.choices) {
      for (const [digit, c] of Object.entries(node.choices)) {
        edges.push({
          from: id,
          digit,
          to: c.goto?.trim() || "·",
          action: c.action || "",
        });
      }
    }
    if (node.after_capture?.goto) {
      edges.push({
        from: id,
        digit: "⇢",
        to: node.after_capture.goto,
        action: node.after_capture.action || "capture",
      });
    }
  }
  return edges;
}

export interface IvrMenuComposerProps {
  menus: IvrMenus | null;
  busy?: boolean;
  error?: string | null;
  previewSteps?: IvrPreviewStep[];
  onChange: (menus: IvrMenus) => void;
  onSave: () => void;
  onReload: () => void;
  onResetDemo: () => void;
  onPreview: (inputs: string[]) => void;
}

export function IvrMenuComposer({
  menus,
  busy,
  error,
  previewSteps = [],
  onChange,
  onSave,
  onReload,
  onResetDemo,
  onPreview,
}: IvrMenuComposerProps) {
  const working = menus ?? emptyMenus();
  const ids = useMemo(() => nodeIds(working), [working]);
  const [selectedId, setSelectedId] = useState<string>(working.entry);
  const [simPath, setSimPath] = useState<string[]>([]);
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");

  useEffect(() => {
    if (!ids.includes(selectedId)) {
      setSelectedId(working.entry || ids[0] || "main");
    }
  }, [ids, selectedId, working.entry]);

  useEffect(() => {
    if (showJson && menus) {
      setJsonDraft(JSON.stringify(menus, null, 2));
    }
  }, [showJson, menus]);

  const selected = working.nodes[selectedId];
  const choiceRows = choicesToRows(selected);
  const edges = useMemo(() => flowEdges(working), [working]);

  const patchMenus = (fn: (m: IvrMenus) => void) => {
    const next = cloneMenus(working);
    fn(next);
    onChange(next);
  };

  const patchNode = (id: string, patch: Partial<IvrNode>) => {
    patchMenus((m) => {
      const node = m.nodes[id];
      if (!node) return;
      m.nodes[id] = { ...node, ...patch };
    });
  };

  const setChoiceRows = (rows: ChoiceRow[]) => {
    patchNode(selectedId, { choices: rowsToChoices(rows) });
  };

  const addChoice = () => {
    const used = new Set(choiceRows.map((r) => r.digit));
    let digit = "1";
    for (let i = 0; i <= 9; i++) {
      if (!used.has(String(i))) {
        digit = String(i);
        break;
      }
    }
    setChoiceRows([
      ...choiceRows,
      {
        key: `new-${Date.now()}`,
        digit,
        goto: working.entry,
        action: "",
        reply: "",
      },
    ]);
  };

  const addNode = () => {
    const base = "step";
    let n = 1;
    while (working.nodes[`${base}_${n}`]) n += 1;
    const id = `${base}_${n}`;
    patchMenus((m) => {
      m.nodes[id] = {
        prompt: "Tell the buyer what to reply with (for example: 1 for products, 0 for the main menu).",
        choices: { "0": { goto: m.entry } },
        on_unknown: "Please reply with one of the numbers on the menu.",
      };
    });
    setSelectedId(id);
  };

  const deleteNode = (id: string) => {
    if (id === working.entry) {
      window.alert("This is the first screen buyers see. Pick a different starting screen first.");
      return;
    }
    if (!window.confirm(`Remove the “${id}” screen from this menu?`)) return;
    patchMenus((m) => {
      delete m.nodes[id];
      for (const node of Object.values(m.nodes)) {
        if (node.choices) {
          for (const c of Object.values(node.choices)) {
            if (c.goto === id) c.goto = m.entry;
          }
        }
        if (node.after_capture?.goto === id) {
          node.after_capture.goto = m.entry;
        }
      }
    });
    setSelectedId(working.entry);
  };

  const renameNode = (from: string, toRaw: string) => {
    const to = slugifyNodeId(toRaw);
    if (!to || to === from) return;
    if (working.nodes[to]) {
      window.alert(`A screen named “${to}” already exists. Pick another name.`);
      return;
    }
    patchMenus((m) => {
      m.nodes[to] = m.nodes[from];
      delete m.nodes[from];
      if (m.entry === from) m.entry = to;
      for (const node of Object.values(m.nodes)) {
        if (node.choices) {
          for (const c of Object.values(node.choices)) {
            if (c.goto === from) c.goto = to;
          }
        }
        if (node.after_capture?.goto === from) {
          node.after_capture.goto = to;
        }
      }
    });
    setSelectedId(to);
  };

  const setCapture = (slot: string) => {
    patchMenus((m) => {
      const node = m.nodes[selectedId];
      if (!node) return;
      if (!slot) {
        node.capture_slot = null;
        node.after_capture = null;
        return;
      }
      node.capture_slot = slot;
      const ac: IvrAfterCapture = node.after_capture ?? {
        reply: "Got it.",
        goto: m.entry,
        action: null,
      };
      node.after_capture = ac;
    });
  };

  const applyJsonDraft = () => {
    try {
      const parsed = JSON.parse(jsonDraft) as IvrMenus;
      onChange(parsed);
      setSelectedId(parsed.entry);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const pressSimDigit = (d: string) => {
    const next = [...simPath, d];
    setSimPath(next);
    onPreview(next);
  };

  const clearSim = () => {
    setSimPath([]);
    onPreview([]);
  };

  const ttlMinutes = Math.round(working.session_ttl_ms / 60_000);

  return (
    <div className="ivr-composer">
      <div className="ivr-composer-toolbar">
        <div className="ivr-composer-toolbar-main">
          <label className="field-stack compact">
            <span className="field-label">First screen</span>
            <select
              value={working.entry}
              disabled={busy}
              onChange={(e) =>
                patchMenus((m) => {
                  m.entry = e.target.value;
                })
              }
            >
              {ids.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="field-stack compact">
            <span className="field-label">Remember for (min)</span>
            <input
              type="number"
              min={1}
              value={ttlMinutes}
              disabled={busy}
              title="How long a chat stays in this menu before starting over"
              onChange={(e) =>
                patchMenus((m) => {
                  m.session_ttl_ms = Math.max(1, Number(e.target.value) || 1) * 60_000;
                })
              }
            />
          </label>
          <div className="ivr-composer-stat">
            <span>{ids.length}</span> screens · <span>{edges.length}</span> choices
          </div>
        </div>
        <div className="row-actions">
          <button type="button" className="ghost-btn" disabled={busy} onClick={onReload}>
            Discard edits
          </button>
          <button type="button" className="ghost-btn" disabled={busy} onClick={onResetDemo}>
            Start from demo
          </button>
          <button type="button" className="action-btn primary" disabled={busy} onClick={onSave}>
            {busy ? "Saving…" : "Save menu"}
          </button>
        </div>
      </div>

      {error && (
        <p className="warn-text" role="alert">
          {error}
        </p>
      )}

      <div className="ivr-composer-layout">
        <aside className="ivr-node-rail" aria-label="Menu screens">
          <div className="ivr-node-rail-head">
            <span className="field-label">Screens</span>
            <button type="button" className="ghost-btn" disabled={busy} onClick={addNode}>
              + Screen
            </button>
          </div>
          <ul className="ivr-node-list">
            {ids.map((id) => {
              const n = working.nodes[id];
              const choiceCount = n?.choices ? Object.keys(n.choices).length : 0;
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={
                      selectedId === id ? "ivr-node-item active" : "ivr-node-item"
                    }
                    onClick={() => setSelectedId(id)}
                  >
                    <div className="ivr-node-item-top">
                      <strong>{id}</strong>
                      <div className="ivr-node-badges">
                        {id === working.entry && <span className="ivr-badge entry">start</span>}
                        {n?.capture_slot && (
                          <span className="ivr-badge capture">
                            {captureBadge(n.capture_slot)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ivr-node-item-sub">
                      {(n?.prompt || "").split("\n")[0].slice(0, 48) || "No message yet"}
                      {choiceCount > 0 ? ` · ${choiceCount} choices` : ""}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="ivr-inspector">
          {!selected ? (
            <p className="hint">Pick a screen on the left, or add a new one.</p>
          ) : (
            <>
              <div className="ivr-inspector-head">
                <label className="field-stack">
                  <span className="field-label">Screen name</span>
                  <input
                    key={selectedId}
                    defaultValue={selectedId}
                    disabled={busy}
                    placeholder="e.g. main, browse, checkout"
                    onBlur={(e) => renameNode(selectedId, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="ghost-btn danger-text"
                  disabled={busy || selectedId === working.entry}
                  onClick={() => deleteNode(selectedId)}
                >
                  Remove
                </button>
              </div>

              <label className="field-stack">
                <span className="field-label">Message to the buyer</span>
                <textarea
                  className="ivr-prompt"
                  rows={5}
                  value={selected.prompt}
                  disabled={busy}
                  placeholder={"Hi — reply with a number:\n1 · See products\n2 · Place an order\n0 · Main menu"}
                  onChange={(e) => patchNode(selectedId, { prompt: e.target.value })}
                />
              </label>

              <label className="field-stack">
                <span className="field-label">If they type something that isn’t on the menu</span>
                <input
                  value={selected.on_unknown ?? ""}
                  disabled={busy}
                  placeholder="e.g. Please reply with 1, 2, or 0."
                  onChange={(e) =>
                    patchNode(selectedId, {
                      on_unknown: e.target.value || null,
                    })
                  }
                />
              </label>

              <div className="settings-section-label">When they reply with a number</div>
              <p className="hint tight">
                Map each number to the next screen and (optionally) something SignalX should do —
                like sending the catalog or creating an order.
              </p>
              <div className="ivr-choice-table" role="table">
                <div className="ivr-choice-row head" role="row">
                  <span>They type</span>
                  <span>Next screen</span>
                  <span>Also do</span>
                  <span>Custom reply</span>
                  <span />
                </div>
                {choiceRows.map((row, idx) => (
                  <div className="ivr-choice-row" role="row" key={row.key}>
                    <input
                      value={row.digit}
                      disabled={busy}
                      aria-label="What they type"
                      onChange={(e) => {
                        const next = [...choiceRows];
                        next[idx] = { ...row, digit: e.target.value };
                        setChoiceRows(next);
                      }}
                    />
                    <select
                      value={row.goto}
                      disabled={busy}
                      aria-label="Next screen"
                      onChange={(e) => {
                        const next = [...choiceRows];
                        next[idx] = { ...row, goto: e.target.value };
                        setChoiceRows(next);
                      }}
                    >
                      <option value="">Stay here</option>
                      {ids.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                    <select
                      value={row.action}
                      disabled={busy}
                      aria-label="Also do"
                      onChange={(e) => {
                        const next = [...choiceRows];
                        next[idx] = { ...row, action: e.target.value };
                        setChoiceRows(next);
                      }}
                    >
                      {IVR_ACTIONS.map((a) => (
                        <option key={a.id || "none"} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={row.reply}
                      disabled={busy}
                      placeholder="Optional text"
                      aria-label="Custom reply"
                      onChange={(e) => {
                        const next = [...choiceRows];
                        next[idx] = { ...row, reply: e.target.value };
                        setChoiceRows(next);
                      }}
                    />
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={busy}
                      aria-label="Remove choice"
                      onClick={() => setChoiceRows(choiceRows.filter((_, i) => i !== idx))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="ghost-btn" disabled={busy} onClick={addChoice}>
                + Add a number choice
              </button>

              <div className="settings-section-label">Or ask them a question</div>
              <p className="hint tight">
                Instead of (or after) number choices, wait for their next message — for example
                which product number or how many they want — then move on.
              </p>
              <div className="settings-grid">
                <label className="field-stack">
                  <span className="field-label">What to collect</span>
                  <select
                    value={selected.capture_slot ?? ""}
                    disabled={busy}
                    onChange={(e) => setCapture(e.target.value)}
                  >
                    {CAPTURE_PRESETS.map((s) => (
                      <option key={s.id || "off"} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selected.capture_slot && selected.after_capture && (
                  <>
                    <label className="field-stack">
                      <span className="field-label">Then go to screen</span>
                      <select
                        value={selected.after_capture.goto}
                        disabled={busy}
                        onChange={(e) =>
                          patchNode(selectedId, {
                            after_capture: {
                              ...selected.after_capture!,
                              goto: e.target.value,
                            },
                          })
                        }
                      >
                        {ids.map((id) => (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-stack">
                      <span className="field-label">Then also</span>
                      <select
                        value={selected.after_capture.action ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          patchNode(selectedId, {
                            after_capture: {
                              ...selected.after_capture!,
                              action: e.target.value || null,
                            },
                          })
                        }
                      >
                        {IVR_ACTIONS.map((a) => (
                          <option key={a.id || "none"} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-stack" style={{ gridColumn: "1 / -1" }}>
                      <span className="field-label">Quick reply after they answer</span>
                      <input
                        value={selected.after_capture.reply}
                        disabled={busy}
                        placeholder="e.g. Got it — one moment…"
                        onChange={(e) =>
                          patchNode(selectedId, {
                            after_capture: {
                              ...selected.after_capture!,
                              reply: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="ivr-side-panel">
          <div className="ivr-flow-map">
            <div className="field-label">How it connects</div>
            <p className="hint tight">
              A quick map of every choice. Tap a row to jump to that screen.
            </p>
            <ul className="ivr-edge-list">
              {edges.length === 0 ? (
                <li className="hint tight">No choices yet — add numbers on the middle panel.</li>
              ) : (
                edges.map((e, i) => (
                  <li key={`${e.from}-${e.digit}-${e.to}-${i}`}>
                    <button
                      type="button"
                      className="ivr-edge"
                      onClick={() => setSelectedId(e.from)}
                    >
                      <code>{e.from}</code>
                      <span className="ivr-edge-digit">{e.digit}</span>
                      <span className="ivr-edge-arrow">→</span>
                      <code>{e.to === "·" ? "stay" : e.to}</code>
                      {e.action ? (
                        <span className="ivr-badge" title={e.action}>
                          {actionLabel(e.action)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="ivr-sim">
            <div className="field-label">Test as a buyer</div>
            <p className="hint tight">
              Tap numbers like a customer would. Uses the <strong>last saved</strong> menu.
              {simPath.length ? ` Path: ${simPath.join(" → ")}` : ""}
            </p>
            <div className="ivr-dialpad" role="group" aria-label="Test number pad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
                <button
                  key={d}
                  type="button"
                  className="ivr-dial-key"
                  disabled={busy}
                  onClick={() => pressSimDigit(d)}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="row-actions">
              <button type="button" className="ghost-btn" onClick={clearSim}>
                Start over
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={busy || simPath.length === 0}
                onClick={() => onPreview(simPath)}
              >
                Run again
              </button>
            </div>
            {previewSteps.length > 0 && (
              <ol className="ivr-preview-list">
                {previewSteps.map((step, i) => (
                  <li key={`${step.input}-${i}`}>
                    <button
                      type="button"
                      className="ivr-preview-jump"
                      onClick={() => setSelectedId(step.node_id)}
                    >
                      <strong>{step.input || "·"}</strong> → {step.node_id}
                      {step.action ? ` · ${actionLabel(step.action)}` : ""}
                      {step.handed_off ? " · handed to you" : ""}
                    </button>
                    {step.reply ? <pre className="ivr-preview-reply">{step.reply}</pre> : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>

      <details
        className="settings-details ivr-json-details"
        open={showJson}
        onToggle={(e) => setShowJson((e.target as HTMLDetailsElement).open)}
      >
        <summary>Expert edit (raw file)</summary>
        <p className="hint tight">
          For power users who want to paste or tweak the whole menu at once. Apply loads it into
          this editor — then press <strong>Save menu</strong> to go live.
        </p>
        <textarea
          className="ivr-menus-json"
          rows={12}
          spellCheck={false}
          value={jsonDraft}
          onChange={(e) => setJsonDraft(e.target.value)}
        />
        <button type="button" className="ghost-btn" onClick={applyJsonDraft}>
          Load into editor
        </button>
      </details>
    </div>
  );
}
