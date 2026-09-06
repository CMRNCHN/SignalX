export function Avatar({ label, size = "md" }: { label: string; size?: "sm" | "md" }) {
  const parts = label.replace(/^\+/, "").trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length === 0
      ? "?"
      : parts.length === 1
        ? parts[0].slice(0, 2).toUpperCase()
        : (parts[0][0] + parts[1][0]).toUpperCase();
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--panel-2)] text-[var(--text-dim)] ${dim}`}
      aria-hidden
    >
      {initials}
    </span>
  );
}
