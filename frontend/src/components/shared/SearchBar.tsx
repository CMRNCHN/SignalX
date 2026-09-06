import type { InputHTMLAttributes } from "react";
import { IconSearch } from "../../navIcons";

type Props = InputHTMLAttributes<HTMLInputElement>;

export function SearchBar({ className = "", ...rest }: Props) {
  return (
    <label className={`flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 ${className}`}>
      <span className="text-[var(--text-dim)]">
        <IconSearch />
      </span>
      <input
        className="w-full bg-transparent outline-none placeholder:text-[var(--text-dim)]"
        {...rest}
      />
    </label>
  );
}
