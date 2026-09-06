import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--accent-cta)] text-white hover:bg-[var(--accent-cta-hover)] disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--text)] hover:bg-[var(--panel-2)] border border-[var(--border)]",
  danger:
    "bg-transparent text-[var(--danger)] hover:bg-[var(--panel-2)] border border-[var(--border)]",
};

export function Button({ variant = "ghost", className = "", children, type, ...rest }: Props) {
  return (
    <button
      type={type ?? "button"}
      className={`rounded-lg px-4 py-2 text-left ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
