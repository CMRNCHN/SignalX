import type { ReactNode } from "react";

type Props = {
  icon?: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ icon = "○", title, description, action }: Props) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden>
        {icon}
      </span>
      <strong className="empty-state-title">{title}</strong>
      <p className="empty-state-desc">{description}</p>
      {action}
    </div>
  );
}
