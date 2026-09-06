import type { ReactNode } from "react";

type Tone = "muted" | "ok" | "warn" | "danger" | "cta";

const tones: Record<Tone, string> = {
  muted: "bg-[var(--panel-2)] text-[var(--text-dim)]",
  ok: "bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] text-[var(--ok)]",
  warn: "bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] text-[var(--warn)]",
  danger: "bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] text-[var(--danger)]",
  cta: "bg-[color-mix(in_srgb,var(--accent-cta)_18%,transparent)] text-[var(--accent-cta)]",
};

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}
