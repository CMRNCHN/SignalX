import { EchoIcon } from "../../navIcons";

type SvgProps = { className?: string };

/** Stat-tile and pattern-card glyphs for the page dashboards. Same echo+shard
 *  treatment as the nav icons, for one visual system across the whole app. */

export function IconUnread(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 8l9 6 9-6" />
      <circle cx="19" cy="5" r="3.2" fill="currentColor" stroke="none" />
    </EchoIcon>
  );
}

export function IconNeedsReply(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <path d="M7 5h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-5l-3 3v-3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" />
      <circle cx="17.5" cy="16.5" r="3.6" />
      <path d="M17.5 14.7v2l1.5 1" strokeWidth={1.3} />
    </EchoIcon>
  );
}

export function IconQueued(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <path d="M4 7h11M4 11h11M4 15h7" />
      <path d="M18 17V8" />
      <path d="M14.5 11.5 18 8l3.5 3.5" />
    </EchoIcon>
  );
}

export function IconAutoReplyOn(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <path d="M7 5h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-5l-3 3v-3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" />
      <path d="M12 8l-2.5 4.5H12L9.5 17 14 11.5H11.5z" fill="currentColor" stroke="none" />
    </EchoIcon>
  );
}

export function IconLowStock(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <path d="M5 9.5 12 6l7 3.5v7L12 20l-7-3.5z" />
      <path d="M5 9.5 12 13l7-3.5M12 13v7" />
    </EchoIcon>
  );
}

export function IconBestSeller(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <circle cx="12" cy="9" r="5" />
      <path d="M9 13.5 7.5 20 12 17.5 16.5 20 15 13.5" />
    </EchoIcon>
  );
}

export function IconOutOfStock(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <path d="M5 9.5 12 6l7 3.5v7L12 20l-7-3.5z" strokeDasharray="2.5 2.5" />
      <path d="M9 9.5 15 15.5M15 9.5 9 15.5" strokeWidth={1.8} />
    </EchoIcon>
  );
}

export function IconTotalProducts(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <path d="M4 7 12 3l8 4" />
      <path d="M9 20v-6h6v6" />
    </EchoIcon>
  );
}

export function IconOpenOrders(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <path d="M6 3h12v15l-1.5-1.3-1.5 1.3-1.5-1.3-1.5 1.3-1.5-1.3-1.5 1.3-1.5-1.3z" />
      <path d="M9 8h6M9 11h6" />
    </EchoIcon>
  );
}

export function IconPendingInvoice(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <circle cx="10" cy="11" r="6" />
      <circle cx="15" cy="14" r="6" opacity={0.55} />
    </EchoIcon>
  );
}

export function IconFulfilled(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <path d="M8 13.5 11 16.5 16 9.5" />
    </EchoIcon>
  );
}

export function IconRevenue(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <path d="M5 19v-4M10 19v-7M15 19v-9M20 19v-12" />
    </EchoIcon>
  );
}

export function IconNewCustomer(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <path d="M6 19a6 6 0 0 1 12 0" />
      <circle cx="12" cy="8" r="4" />
    </EchoIcon>
  );
}

export function IconHaventHeard(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <path d="M7 5h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-5l-3 3v-3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" />
      <path d="M5 4l14 14" />
    </EchoIcon>
  );
}

export function IconDueToReorder(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <path d="M18 8.5A7 7 0 1 0 19 13" />
      <path d="M16.5 5.5 18 8.5l3-1" />
    </EchoIcon>
  );
}

export function IconNeedsFollowup(p: SvgProps) {
  return (
    <EchoIcon {...p}>
      <path d="M7 4v17" />
      <path d="M7 4h11l-2.5 4L18 12H7" />
    </EchoIcon>
  );
}
