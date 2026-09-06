import { useTheme } from "../../context/ThemeContext";
import type { ThemePreference } from "../../context/types";

const OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

export function ThemeToggle() {
  const { theme, setTheme, effectiveTheme } = useTheme();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--text-dim)]">
        Appearance. Saved on this device. Active: {effectiveTheme}.
      </p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setTheme(o.id)}
            className={`rounded-lg px-4 py-2 ${
              theme === o.id
                ? "bg-[var(--accent-cta)] text-white"
                : "bg-[var(--panel-2)] text-[var(--text)]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
