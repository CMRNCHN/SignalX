import type { ReactNode } from "react";
import { WhyTip } from "../WhyTip";

export type DashboardStat = {
  key: string;
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  urgent?: boolean;
  onClick?: () => void;
};

export type DashboardCardAction = { label: string; onClick: () => void };

export type DashboardCard = {
  key: string;
  icon?: ReactNode;
  avatarLabel?: string;
  kicker: string;
  title: string;
  body: ReactNode;
  why?: string;
  primary?: DashboardCardAction;
  secondary?: DashboardCardAction;
  urgent?: boolean;
};

export type DashboardShortcut = {
  key: string;
  label: string;
  onClick: () => void;
  primary?: boolean;
};

export type PageDashboardProps = {
  title: string;
  subtitle: string;
  stats: DashboardStat[];
  sectionLabel: string;
  cards: DashboardCard[];
  shortcuts: DashboardShortcut[];
};

/** The page-specific landing screen shown before drilling into a list —
 *  same shell for Messages, Catalog, Orders and People, driven entirely by
 *  the data each page's builder in dashboards.ts computes. */
export function PageDashboard({
  title,
  subtitle,
  stats,
  sectionLabel,
  cards,
  shortcuts,
}: PageDashboardProps) {
  return (
    <div className="dash">
      <div className="dash-head">
        <h1>{title}</h1>
        <p className="dash-sub">{subtitle}</p>
      </div>

      {stats.length > 0 && (
        <div className="dash-stats">
          {stats.map((s) => {
            const Tag = s.onClick ? "button" : "div";
            return (
              <Tag
                key={s.key}
                type={s.onClick ? "button" : undefined}
                className={s.urgent ? "dash-tile urgent" : "dash-tile"}
                onClick={s.onClick}
              >
                <div className="dash-tile-top">
                  <span className="dash-tile-ico" aria-hidden>
                    {s.icon}
                  </span>
                  <span className="dash-tile-k">{s.label}</span>
                </div>
                <div className="dash-tile-v">{s.value}</div>
                {s.detail && <div className="dash-tile-who">{s.detail}</div>}
              </Tag>
            );
          })}
        </div>
      )}

      {cards.length > 0 && (
        <>
          <p className="dash-section-label">
            <span className="dash-dot" aria-hidden />
            {sectionLabel}
          </p>
          {cards.map((c) => (
            <div key={c.key} className={c.urgent ? "dash-card urgent" : "dash-card"}>
              <div className={c.icon ? "dash-card-av icon" : "dash-card-av"}>
                {c.icon ?? c.avatarLabel ?? ""}
              </div>
              <div className="dash-card-body">
                <div className="dash-card-kicker">{c.kicker}</div>
                <div className="dash-card-title">{c.title}</div>
                <div className="dash-card-text">
                  {c.body}
                  {c.why && <WhyTip why={c.why} />}
                </div>
                {(c.primary || c.secondary) && (
                  <div className="dash-card-ask">
                    {c.primary && (
                      <button
                        type="button"
                        className={c.urgent ? "dash-btn urgent" : "dash-btn primary"}
                        onClick={c.primary.onClick}
                      >
                        {c.primary.label}
                      </button>
                    )}
                    {c.secondary && (
                      <button type="button" className="dash-btn ghost" onClick={c.secondary.onClick}>
                        {c.secondary.label}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {shortcuts.length > 0 && (
        <div className="dash-shortcuts">
          {shortcuts.map((s) => (
            <button
              key={s.key}
              type="button"
              className={s.primary ? "dash-sbtn primary" : "dash-sbtn"}
              onClick={s.onClick}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A slim, non-blocking strip above a page's real screen carrying that page's
 *  single top nudge (its dashboard's first card). Renders nothing when the
 *  page has nothing worth surfacing right now. */
export function PageNoticeBar({ card }: { card?: DashboardCard }) {
  if (!card) return null;
  return (
    <div className={card.urgent ? "page-notice urgent" : "page-notice"}>
      <span className="page-notice-kicker">{card.kicker}</span>
      <span className="page-notice-text">
        <b>{card.title}</b> — {card.body}
      </span>
      {(card.primary || card.secondary) && (
        <span className="page-notice-actions">
          {card.primary && (
            <button
              type="button"
              className={card.urgent ? "page-notice-btn urgent" : "page-notice-btn primary"}
              onClick={card.primary.onClick}
            >
              {card.primary.label}
            </button>
          )}
          {card.secondary && (
            <button type="button" className="page-notice-btn ghost" onClick={card.secondary.onClick}>
              {card.secondary.label}
            </button>
          )}
        </span>
      )}
    </div>
  );
}
