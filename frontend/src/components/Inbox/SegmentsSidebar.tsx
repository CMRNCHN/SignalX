import type { SegmentFilter } from "./ThreadList";

export type { SegmentFilter };

const SEGMENTS: { id: Exclude<SegmentFilter, null>; label: string }[] = [
  { id: "favorite", label: "Favorite" },
  { id: "vip", label: "VIP" },
  { id: "coresBuyer", label: "Become cores buyer" },
];

export function SegmentsSidebar({
  segment,
  onChange,
}: {
  segment: SegmentFilter;
  onChange: (next: SegmentFilter) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Segments</p>
      {SEGMENTS.map((s) => {
        const active = segment === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(active ? null : s.id)}
            className={`rounded-lg px-3 py-2 text-left ${
              active
                ? "bg-[var(--panel-2)] text-[var(--text)] ring-1 ring-[var(--accent-cta)]"
                : "text-[var(--text-dim)] hover:bg-[var(--panel-2)]"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
