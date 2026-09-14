import type { ReactNode } from "react";

/** Inline line icons for the SignalX rail — no icon package. */
type SvgProps = { className?: string };

function IconShell({ children, className }: SvgProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
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
      <path d="M19.07 4.93l-2.12 2.12M6.93 19.07l-2.12 2.12M19.07 19.07l-2.12-2.12M6.93 4.93l-2.12-2.12M12 2.5v2.5M12 19v2.5M21.5 12h-2.5M5.5 12h-2.5" />
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

export function IconCompose(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M12 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
    </IconShell>
  );
}

export function IconSparkle(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </IconShell>
  );
}

export function IconReply(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M9 17l-5-5 5-5" />
      <path d="M4 12h11a5 5 0 0 1 5 5v2" />
    </IconShell>
  );
}

export function IconExport(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5-5 5 5" />
      <path d="M12 5v13" />
    </IconShell>
  );
}

export function IconBolt(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </IconShell>
  );
}

export function IconMenuList(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </IconShell>
  );
}

export function IconTruck(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M3 16V6a1 1 0 0 1 1-1h10v11" />
      <path d="M14 9h4l3 3v4h-7" />
      <circle cx="7.5" cy="17.5" r="2" />
      <circle cx="17.5" cy="17.5" r="2" />
    </IconShell>
  );
}

export function IconBag(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M6 2L4 6v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4z" />
      <path d="M4 6h16" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </IconShell>
  );
}

export function IconMail(p: SvgProps) {
  return (
    <IconShell {...p}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 6L2 7" />
    </IconShell>
  );
}

export function IconAlert(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </IconShell>
  );
}

export function IconClock(p: SvgProps) {
  return (
    <IconShell {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconShell>
  );
}

export function IconBot(p: SvgProps) {
  return (
    <IconShell {...p}>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 8V4M9 4h6" />
      <path d="M9 13h.01M15 13h.01" />
    </IconShell>
  );
}

export function IconCheckCheck(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M2 13l4 4L14 7" />
      <path d="M10 15l2 2L22 7" />
    </IconShell>
  );
}

export function IconTag(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M20.6 13.4L12 22l-9-9V4a1 1 0 0 1 1-1h9z" />
      <path d="M7.5 7.5h.01" />
    </IconShell>
  );
}

export function IconFilter(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </IconShell>
  );
}

export function IconSort(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M7 3v18M7 21l-3-3M7 21l3-3" />
      <path d="M17 21V3M17 3l-3 3M17 3l3 3" />
    </IconShell>
  );
}

export function IconMore(p: SvgProps) {
  return (
    <IconShell {...p}>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </IconShell>
  );
}

export function IconPlus(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M12 5v14M5 12h14" />
    </IconShell>
  );
}

export function IconChevronDown(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M6 9l6 6 6-6" />
    </IconShell>
  );
}

export function IconX(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M18 6L6 18M6 6l12 12" />
    </IconShell>
  );
}

export function IconCopy(p: SvgProps) {
  return (
    <IconShell {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </IconShell>
  );
}

export function IconStar(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M12 3l2.9 5.9 6.1.9-4.5 4.3 1.1 6.4-5.6-3-5.6 3 1.1-6.4L3 9.8l6.1-.9z" />
    </IconShell>
  );
}

export function IconTrash(p: SvgProps) {
  return (
    <IconShell {...p}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </IconShell>
  );
}

export function IconArchive(p: SvgProps) {
  return (
    <IconShell {...p}>
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </IconShell>
  );
}

export function IconInfo(p: SvgProps) {
  return (
    <IconShell {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </IconShell>
  );
}
