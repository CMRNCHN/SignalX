import type { ReactNode } from "react";

/** Inline line icons for the SignalX rail — no icon package. */
type SvgProps = { className?: string };

function IconShell({ children, className }: SvgProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconMessages(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </IconShell>
  );
}

export function IconSearch(p: SvgProps) {
  return (
    <IconShell {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </IconShell>
  );
}

export function IconContacts(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </IconShell>
  );
}

export function IconGroups(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconShell>
  );
}

export function IconCatalog(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7L12 12l8.7-5" />
      <path d="M12 22V12" />
    </IconShell>
  );
}

export function IconCustomers(p: SvgProps) {
  return (
    <IconShell {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M15 8h4M15 12h4M7 16h10" />
    </IconShell>
  );
}

export function IconOrders(p: SvgProps) {
  return (
    <IconShell {...p}>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.5L21 8H7" />
    </IconShell>
  );
}

export function IconAudit(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </IconShell>
  );
}

export function IconSettings(p: SvgProps) {
  return (
    <IconShell {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </IconShell>
  );
}

export function IconOutbox(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M22 12H2" />
      <path d="M5 12l1.5 7h11L19 12" />
      <path d="M12 12V3" />
      <path d="M8 7l4-4 4 4" />
    </IconShell>
  );
}

export function IconImage(p: SvgProps) {
  return (
    <IconShell {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </IconShell>
  );
}
