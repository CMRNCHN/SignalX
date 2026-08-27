import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  IvrChoice,
  IvrMenus,
  IvrNode,
  IvrPreviewStep,
  Product,
} from "./api";

const IVR_ACTIONS = [
  { id: "", label: "Nothing extra" },
  { id: "list_catalog", label: "Send the product list" },
  { id: "offer_product", label: "Offer bound product" },
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

type ViewMode = "visual" | "text";

type ChoiceRow = {
  key: string;
  digit: string;
  goto: string;
  action: string;
  reply: string;
  productId: string;
};

function actionLabel(id: string): string {
  return IVR_ACTIONS.find((a) => a.id === id)?.label ?? id;
}

function captureBadge(slot: string): string {
  if (slot === "order_idx") return "asks product #";
  if (slot === "order_qty") return "asks quantity";
  if (slot === "note") return "asks for a note";
  return "asks a question";
}

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
    productId: c.product_id ?? "",
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
    if (row.productId.trim()) choice.product_id = row.productId.trim();
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

/** Breadth-first columns from the starting screen for the visual canvas. */
function layoutColumns(menus: IvrMenus): string[][] {
  const columns: string[][] = [];
  const seen = new Set<string>();
  let frontier = menus.nodes[menus.entry] ? [menus.entry] : Object.keys(menus.nodes).slice(0, 1);
  while (frontier.length) {
    const col = frontier.filter((id) => menus.nodes[id] && !seen.has(id));
    for (const id of col) seen.add(id);
    if (col.length) columns.push(col);
    const next: string[] = [];
    for (const id of col) {
      const n = menus.nodes[id];
      if (n?.choices) {
        for (const c of Object.values(n.choices)) {
          const g = c.goto?.trim();
          if (g && menus.nodes[g] && !seen.has(g)) next.push(g);
        }
      }
      const ag = n?.after_capture?.goto?.trim();
      if (ag && menus.nodes[ag] && !seen.has(ag)) next.push(ag);
    }
    frontier = [...new Set(next)];
  }
  for (const id of Object.keys(menus.nodes)) {
    if (!seen.has(id)) columns.push([id]);
  }
  return columns;
}

function menusToScript(menus: IvrMenus): string {
  const lines: string[] = [];
  lines.push(`# Buyer menu`);
  lines.push(`First screen: ${menus.entry}`);
  lines.push(`Remember for: ${Math.round(menus.session_ttl_ms / 60_000)} minutes`);
  lines.push("");
  for (const id of nodeIds(menus)) {
    const n = menus.nodes[id];
    lines.push(`## ${id}${id === menus.entry ? "  ← start" : ""}`);
    lines.push(n.prompt || "(no message)");
    if (n.on_unknown) lines.push(`Unknown: ${n.on_unknown}`);
    if (n.capture_slot) {
      lines.push(`Ask: ${captureBadge(n.capture_slot)}`);
      if (n.after_capture) {
        lines.push(
          `  then → ${n.after_capture.goto}` +
            (n.after_capture.action ? ` · ${actionLabel(n.after_capture.action)}` : "") +
            (n.after_capture.reply ? ` · “${n.after_capture.reply}”` : ""),
        );
      }
    }
    if (n.choices) {
      for (const [digit, c] of Object.entries(n.choices)) {
        const bits = [
          `${digit} → ${c.goto?.trim() || "stay"}`,
          c.product_id ? `product ${c.product_id}` : "",
          c.action ? actionLabel(c.action) : "",
          c.reply ? `“${c.reply}”` : "",
        ].filter(Boolean);
        lines.push(`  ${bits.join(" · ")}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

export function screensBoundToProduct(
  menus: IvrMenus | null,
  productId: string,
): { nodeId: string; digit: string; action: string }[] {
  if (!menus || !productId) return [];
  const out: { nodeId: string; digit: string; action: string }[] = [];
  for (const [nodeId, node] of Object.entries(menus.nodes)) {
    for (const [digit, c] of Object.entries(node.choices || {})) {
      if ((c.product_id || "").trim() === productId) {
        out.push({ nodeId, digit, action: c.action || "" });
      }
    }
  }
  return out;
}

export function bindProductToMenu(
  menus: IvrMenus,
  product: Product,
  nodeId?: string,
): IvrMenus {
  const next = structuredClone(menus);
  const targetId = nodeId && next.nodes[nodeId] ? nodeId : next.entry;
  const node = next.nodes[targetId];
  if (!node) return next;
  const used = new Set(Object.keys(node.choices || {}));
  let digit = "1";
  for (let i = 1; i <= 9; i++) {
    if (!used.has(String(i))) {
      digit = String(i);
      break;
    }
  }
  node.choices = node.choices || {};
  node.choices[digit] = {
    goto: next.nodes.order_qty ? "order_qty" : next.entry,
    action: "offer_product",
    product_id: product.id,
  };
  const line = `${digit} · ${product.name}`;
  if (!node.prompt.includes(product.name)) {
    node.prompt = `${node.prompt.trimEnd()}\n${line}`;
  }
  return next;
}

export interface IvrMenuComposerProps {
  menus: IvrMenus | null;
  busy?: boolean;
  error?: string | null;
  previewSteps?: IvrPreviewStep[];
  products?: Product[];
  layout?: "embedded" | "page";
  onChange: (menus: IvrMenus) => void;
  onSave: () => void;
  onReload: () => void;
  onResetDemo: () => void;
  onPreview: (inputs: string[]) => void;
  onClose?: () => void;
  listHeader?: ReactNode;
}

export function IvrMenuComposer({
  menus,
  busy,
  error,
  previewSteps = [],
  products = [],
  layout = "embedded",
  onChange,
  onSave,
  onReload,
  onResetDemo,
  onPreview,
  onClose,
  listHeader,
}: IvrMenuComposerProps) {
  const working = menus ?? emptyMenus();
  const ids = useMemo(() => nodeIds(working), [working]);
  const columns = useMemo(() => layoutColumns(working), [working]);
  const [viewMode, setViewMode] = useState<ViewMode>("visual");
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
    if (showJson && menus) setJsonDraft(JSON.stringify(menus, null, 2));
  }, [showJson, menus]);

  const selected = working.nodes[selectedId];
  const choiceRows = choicesToRows(selected);
  const script = useMemo(() => menusToScript(working), [working]);
  const ttlMinutes = Math.round(working.session_ttl_ms / 60_000);
  const livePreview =
    previewSteps.length > 0
      ? previewSteps[previewSteps.length - 1]
      : null;

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

  const setChoiceRowsFor = (nodeId: string, rows: ChoiceRow[]) => {
    patchNode(nodeId, { choices: rowsToChoices(rows) });
  };

  const setChoiceRows = (rows: ChoiceRow[]) => setChoiceRowsFor(selectedId, rows);

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
      { key: `new-${Date.now()}`, digit, goto: working.entry, action: "", reply: "", productId: "" },
    ]);
  };

  const addNode = () => {
    const base = "step";
    let n = 1;
    while (working.nodes[`${base}_${n}`]) n += 1;
    const id = `${base}_${n}`;
    patchMenus((m) => {
      m.nodes[id] = {
        prompt:
          "Tell the buyer what to reply with (for example: 1 for products, 0 for the main menu).",
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
        if (node.after_capture?.goto === id) node.after_capture.goto = m.entry;
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
        if (node.after_capture?.goto === from) node.after_capture.goto = to;
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
      node.after_capture = node.after_capture ?? {
        reply: "Got it.",
        goto: m.entry,
        action: null,
      };
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

  const renderChoiceEditor = (nodeId: string, rows: ChoiceRow[]) => (
    <div className="ivr-choice-table" role="table">
      <div className="ivr-choice-row head has-product" role="row">
        <span>Digit</span>
        <span>Next screen</span>
        <span>Product</span>
        <span>Extra action</span>
        <span>Label / reply</span>
        <span />
      </div>
      {rows.map((row, idx) => (
        <div className="ivr-choice-row has-product" role="row" key={row.key}>
          <input
            value={row.digit}
            disabled={busy}
            aria-label="Digit"
            onChange={(e) => {
              const next = [...rows];
              next[idx] = { ...row, digit: e.target.value };
              setChoiceRowsFor(nodeId, next);
            }}
          />
          <select
            value={row.goto}
            disabled={busy}
            aria-label="Next screen"
            onChange={(e) => {
              const next = [...rows];
              next[idx] = { ...row, goto: e.target.value };
              setChoiceRowsFor(nodeId, next);
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
            value={row.productId}
            disabled={busy}
            aria-label="Bound product"
            onChange={(e) => {
              const next = [...rows];
              next[idx] = { ...row, productId: e.target.value };
              setChoiceRowsFor(nodeId, next);
            }}
          >
            <option value="">No product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={row.action}
            disabled={busy}
            aria-label="Extra action"
            onChange={(e) => {
              const next = [...rows];
              next[idx] = { ...row, action: e.target.value };
              setChoiceRowsFor(nodeId, next);
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
            placeholder="Optional label"
            aria-label="Label"
            onChange={(e) => {
              const next = [...rows];
              next[idx] = { ...row, reply: e.target.value };
              setChoiceRowsFor(nodeId, next);
            }}
          />
          <button
            type="button"
            className="ghost-btn"
            disabled={busy}
            aria-label="Remove choice"
            onClick={() => setChoiceRowsFor(nodeId, rows.filter((_, i) => i !== idx))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );

  const renderInspector = () => {
    if (!selected) return <p className="hint">Pick a screen to edit.</p>;
    return (
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
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
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
            placeholder={"Hi — reply with a number:\n1 · See products\n0 · Main menu"}
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
              patchNode(selectedId, { on_unknown: e.target.value || null })
            }
          />
        </label>

        <div className="settings-section-label">When they reply with a number</div>
        {renderChoiceEditor(selectedId, choiceRows)}
        <button type="button" className="ghost-btn" disabled={busy} onClick={addChoice}>
          + Add a number choice
        </button>

        <div className="settings-section-label">Or ask them a question</div>
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
                      after_capture: { ...selected.after_capture!, goto: e.target.value },
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
                      after_capture: { ...selected.after_capture!, reply: e.target.value },
                    })
                  }
                />
              </label>
            </>
          )}
        </div>
      </>
    );
  };

  return (
    <div className={`ivr-composer ivr-composer-${viewMode} ivr-composer-${layout}`}>
      <div className="ivr-composer-toolbar">
        <div className="ivr-composer-toolbar-main">
          {onClose && (
            <button type="button" className="ghost-btn" onClick={onClose}>
              ← Catalog
            </button>
          )}
          <div className="ivr-view-toggle" role="tablist" aria-label="Menu editor view">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "visual"}
              className={viewMode === "visual" ? "ivr-view-btn active" : "ivr-view-btn"}
              onClick={() => setViewMode("visual")}
            >
              Visual
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "text"}
              className={viewMode === "text" ? "ivr-view-btn active" : "ivr-view-btn"}
              onClick={() => setViewMode("text")}
            >
              Text
            </button>
          </div>
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
            <span className="field-label">Remember (min)</span>
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
        </div>
        <div className="row-actions">
          <button type="button" className="ghost-btn" disabled={busy} onClick={addNode}>
            + Screen
          </button>
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

      {viewMode === "visual" ? (
        <div className="ivr-visual">
          {layout === "page" && (
            <div className="ivr-screen-list" aria-label="Screens">
              {listHeader}
              {ids.map((id) => {
                const n = working.nodes[id];
                const bound = n?.choices
                  ? Object.values(n.choices).filter((c) => c.product_id).length
                  : 0;
                return (
                  <button
                    type="button"
                    key={id}
                    className={selectedId === id ? "ivr-screen-list-row active" : "ivr-screen-list-row"}
                    onClick={() => setSelectedId(id)}
                  >
                    <strong>{id}</strong>
                    <span>
                      {[
                        id === working.entry ? "start" : "",
                        bound
                          ? `${bound} bound product${bound === 1 ? "" : "s"}`
                          : "no products",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="ivr-canvas-wrap">
            <div className="ivr-canvas" aria-label="Menu flow">
              {columns.map((col, colIdx) => (
                <div className="ivr-canvas-col" key={`col-${colIdx}`}>
                  {colIdx > 0 && <div className="ivr-col-connector" aria-hidden />}
                  {col.map((id) => {
                    const n = working.nodes[id];
                    const choices = n?.choices ? Object.entries(n.choices) : [];
                    const active = selectedId === id;
                    const isStart = id === working.entry;
                    return (
                      <button
                        type="button"
                        key={id}
                        className={
                          active
                            ? "ivr-screen-card active"
                            : isStart
                              ? "ivr-screen-card start"
                              : "ivr-screen-card"
                        }
                        onClick={() => setSelectedId(id)}
                      >
                        <div className="ivr-screen-card-top">
                          <strong>{id}</strong>
                          <div className="ivr-node-badges">
                            {isStart && <span className="ivr-badge entry">start</span>}
                            {n?.capture_slot && (
                              <span className="ivr-badge capture">
                                {captureBadge(n.capture_slot)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="ivr-screen-bubble">
                          {n?.prompt || "No message yet"}
                        </div>
                        {choices.length > 0 && (
                          <div className="ivr-screen-exits">
                            {choices.map(([digit, c]) => (
                              <span className="ivr-exit-chip" key={`${id}-${digit}`}>
                                <em>{digit}</em>
                                <span aria-hidden>→</span>
                                {c.goto?.trim() || "stay"}
                                {c.product_id
                                  ? ` · ${products.find((p) => p.id === c.product_id)?.name || "product"}`
                                  : ""}
                                {c.action ? ` · ${actionLabel(c.action)}` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                        {n?.after_capture?.goto && (
                          <div className="ivr-screen-exits">
                            <span className="ivr-exit-chip capture">
                              answer → {n.after_capture.goto}
                              {n.after_capture.action
                                ? ` · ${actionLabel(n.after_capture.action)}`
                                : ""}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="ivr-visual-side">
            <div className="ivr-phone" aria-label="Buyer preview">
              <div className="ivr-phone-notch" />
              <div className="ivr-phone-screen">
                <div className="ivr-phone-label">Buyer sees</div>
                <div className="ivr-phone-thread">
                  {(livePreview?.reply || selected?.prompt || "Pick a screen or tap numbers below.")
                    .split("\n")
                    .map((line, i) => (
                      <p key={i}>{line || "\u00a0"}</p>
                    ))}
                </div>
                {simPath.length > 0 && (
                  <div className="ivr-phone-path">You pressed: {simPath.join(" → ")}</div>
                )}
              </div>
              <div className="ivr-dialpad" role="group" aria-label="Test number pad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((d) =>
                  d === "*" || d === "#" ? (
                    <span key={d} className="ivr-dial-spacer" />
                  ) : (
                    <button
                      key={d}
                      type="button"
                      className="ivr-dial-key"
                      disabled={busy}
                      onClick={() => pressSimDigit(d)}
                    >
                      {d}
                    </button>
                  ),
                )}
              </div>
              <div className="row-actions ivr-phone-actions">
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
              <p className="hint tight ivr-phone-hint">
                Test uses the <strong>last saved</strong> menu.
              </p>
            </div>

            <div className="ivr-inspector ivr-inspector-panel">
              <div className="field-label">Edit selected screen</div>
              {renderInspector()}
            </div>
          </div>
        </div>
      ) : (
        <div className="ivr-text">
          <div className="ivr-text-script">
            <div className="ivr-text-script-head">
              <span className="field-label">Script overview</span>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => void navigator.clipboard.writeText(script)}
              >
                Copy script
              </button>
            </div>
            <pre className="ivr-script-pre">{script}</pre>
          </div>

          <div className="ivr-text-editors">
            {ids.map((id) => {
              const n = working.nodes[id];
              const rows = choicesToRows(n);
              const open = selectedId === id;
              return (
                <details
                  key={id}
                  className="ivr-text-block"
                  open={open}
                  onToggle={(e) => {
                    if ((e.target as HTMLDetailsElement).open) setSelectedId(id);
                  }}
                >
                  <summary>
                    <strong>{id}</strong>
                    {id === working.entry ? " · start" : ""}
                    {n?.capture_slot ? ` · ${captureBadge(n.capture_slot)}` : ""}
                    <span className="ivr-text-summary-snip">
                      {(n?.prompt || "").split("\n")[0].slice(0, 60)}
                    </span>
                  </summary>
                  <div className="ivr-text-block-body">
                    {open ? (
                      renderInspector()
                    ) : (
                      <p className="hint tight">Open to edit this screen.</p>
                    )}
                    {!open && rows.length > 0 && (
                      <ul className="ivr-text-choice-list">
                        {rows.map((r) => (
                          <li key={r.key}>
                            {r.digit} → {r.goto || "stay"}
                            {r.action ? ` · ${actionLabel(r.action)}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}

      <details
        className="settings-details ivr-json-details"
        open={showJson}
        onToggle={(e) => setShowJson((e.target as HTMLDetailsElement).open)}
      >
        <summary>Expert edit (raw file)</summary>
        <p className="hint tight">
          Paste or tweak the whole menu file. Load into the editor, then Save menu to go live.
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
