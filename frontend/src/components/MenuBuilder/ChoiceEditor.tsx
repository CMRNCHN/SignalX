import { useEffect, useState } from "react";
import { useMenus } from "../../context/SignalXContext";
import { Button } from "../shared/Button";

const ACTIONS = [
  { id: "list_catalog", label: "Send the product list" },
  { id: "place_order", label: "Create their order" },
  { id: "order_status", label: "Send order status" },
  { id: "handoff", label: "Hand off to you" },
];

export function ChoiceEditor() {
  const { menus, selectedChoiceId, setSelectedChoiceId, updateChoice, deleteChoice } = useMenus();
  const menu = menus[0];
  const choice = menu?.choices.find((c) => c.id === selectedChoiceId) ?? null;
  const [text, setText] = useState("");
  const [action, setAction] = useState("list_catalog");

  useEffect(() => {
    setText(choice?.text ?? "");
    setAction(choice?.action ?? "list_catalog");
  }, [choice?.id, choice?.text, choice?.action]);

  if (!menu) {
    return (
      <aside className="rounded-xl bg-[var(--panel)] p-4 text-[var(--text-dim)]">
        No menu loaded.
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col gap-4 overflow-auto rounded-xl bg-[var(--panel)] p-4">
      <h2 className="text-sm font-medium">Choice editor</h2>
      <label className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Choice</span>
        <select
          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2"
          value={selectedChoiceId ?? ""}
          onChange={(e) => setSelectedChoiceId(e.target.value || null)}
        >
          {menu.choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.text}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Text</span>
        <textarea
          className="min-h-[96px] rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Action</span>
        <select
          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          {ACTIONS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={!choice}
          onClick={() => {
            if (!choice) return;
            updateChoice(menu.id, { ...choice, text, action });
          }}
        >
          Save
        </Button>
        <Button
          variant="danger"
          disabled={!choice}
          onClick={() => {
            if (!choice) return;
            deleteChoice(menu.id, choice.id);
          }}
        >
          Delete
        </Button>
      </div>
    </aside>
  );
}
