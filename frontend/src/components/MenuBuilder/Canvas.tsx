import { useMenus } from "../../context/SignalXContext";

export function Canvas() {
  const { menus, selectedChoiceId } = useMenus();
  const menu = menus[0];
  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl bg-[var(--panel)] p-4">
      <h2 className="mb-4 text-sm font-medium">{menu?.name ?? "Menu"}</h2>
      <div className="flex flex-1 items-center justify-center rounded-xl bg-[var(--panel-2)] text-[var(--text-dim)]">
        Canvas area — visual IVR design goes here
      </div>
      {menu && (
        <ul className="mt-4 flex flex-col gap-2">
          {menu.choices.map((c, i) => (
            <li
              key={c.id}
              className={`rounded-lg px-3 py-2 ${
                selectedChoiceId === c.id ? "ring-1 ring-[var(--accent-cta)] bg-[var(--panel-2)]" : "bg-[var(--panel-2)]"
              }`}
            >
              {i + 1}. {c.text} · {c.action}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
