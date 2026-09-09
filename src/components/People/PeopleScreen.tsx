import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  api,
  type ContactMeta,
  type Customer,
  type GroupMeta,
  type Message,
  type Order,
  type ThreadSummary,
} from "../../api";
import {
  IconAlert,
  IconBag,
  IconBot,
  IconCheckCheck,
  IconChevronDown,
  IconClock,
  IconFilter,
  IconGroups,
  IconMail,
  IconMessages,
  IconMore,
  IconPlus,
  IconSort,
  IconTag,
  IconTruck,
  IconX,
} from "../../navIcons";
import { USE_FIXTURES, fxMessages, fxThreadPreviews } from "../../devFixtures";
import { buildDirectory, insightsFor, type Person, type PersonStatus, type PersonType } from "./people";

const TYPES: PersonType[] = ["Consumer", "Supplier", "Team"];
const STATUSES: PersonStatus[] = [
  "Unread",
  "Needs attention",
  "Pending send",
  "Auto-replied",
  "Read",
];

function typeIcon(t: PersonType): ReactNode {
  if (t === "Supplier") return <IconTruck />;
  if (t === "Team") return <IconGroups />;
  return <IconBag />;
}

function statusIcon(s: PersonStatus): ReactNode {
  switch (s) {
    case "Unread":
      return <IconMail />;
    case "Needs attention":
      return <IconAlert />;
    case "Pending send":
      return <IconClock />;
    case "Auto-replied":
      return <IconBot />;
    default:
      return <IconCheckCheck />;
  }
}

function statusSlug(s: PersonStatus): string {
  return s.toLowerCase().replace(/\s+/g, "-");
}

type Props = {
  contacts: ContactMeta[];
  groups: GroupMeta[];
  customers: Customer[];
  threads: ThreadSummary[];
  orders: Order[];
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
  onOpenChat: (threadId: string) => void;
  onRefresh: () => void;
  setStatus: (msg: string | null) => void;
  money: (cents: number) => string;
  fmtTime: (ts: number) => string;
  initials: (label: string) => string;
  avatarTint: (seed: string) => CSSProperties;
  contactForm: { phone: string; name: string };
  setContactForm: (f: { phone: string; name: string }) => void;
  addContact: () => void | Promise<void>;
  groupForm: { name: string; members: string };
  setGroupForm: (f: { name: string; members: string }) => void;
  createGroup: () => void | Promise<void>;
};

export function PeopleScreen({
  contacts,
  groups,
  customers,
  threads,
  orders,
  selectedKey,
  onSelectKey,
  onOpenChat,
  onRefresh,
  setStatus,
  money,
  fmtTime,
  initials,
  avatarTint,
  contactForm,
  setContactForm,
  addContact,
  groupForm,
  setGroupForm,
  createGroup,
}: Props) {
  const [q, setQ] = useState("");
  const [activeTypes, setActiveTypes] = useState<PersonType[]>([]);
  const [activeStatuses, setActiveStatuses] = useState<PersonStatus[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sortAsc, setSortAsc] = useState(true);
  const [menu, setMenu] = useState<null | "add" | "filter" | "status" | "tags" | "more">(null);
  const [composer, setComposer] = useState<null | "contact" | "group">(null);
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [recent, setRecent] = useState<Message[]>([]);

  const directory = useMemo(
    () => buildDirectory(contacts, groups, customers, threads, orders),
    [contacts, groups, customers, threads, orders],
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of directory) for (const t of p.tags) set.add(t);
    return [...set].sort();
  }, [directory]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = directory.filter((p) => {
      if (activeTypes.length && !activeTypes.includes(p.type)) return false;
      if (activeStatuses.length && !activeStatuses.some((s) => p.statuses.includes(s))) return false;
      if (activeTags.length && !activeTags.some((t) => p.tags.includes(t))) return false;
      if (!needle) return true;
      const hay = `${p.name} ${p.subtitle} ${p.tags.join(" ")} ${p.notes}`.toLowerCase();
      return hay.includes(needle);
    });
    return rows.sort((a, b) =>
      sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
    );
  }, [directory, q, activeTypes, activeStatuses, activeTags, sortAsc]);

  const selected = useMemo(
    () => directory.find((p) => p.key === selectedKey) ?? null,
    [directory, selectedKey],
  );

  // ThreadSummary carries no snippet, so the preview line needs one call per
  // thread. Capped and cached; a last_message field on the summary would remove this.
  useEffect(() => {
    const wanted = visible.slice(0, 30).filter((p) => !(p.threadId in previews));
    if (wanted.length === 0) return;
    let cancelled = false;
    void (async () => {
      const found: Record<string, string | null> = {};
      for (const p of wanted) {
        const res = await api.getThreadMessages(p.threadId);
        const live = res.success && res.data.length ? res.data[res.data.length - 1].content : null;
        found[p.threadId] = live ?? (USE_FIXTURES ? (fxThreadPreviews[p.threadId] ?? null) : null);
      }
      if (!cancelled) setPreviews((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => setNotesDraft(null), [selectedKey]);

  useEffect(() => {
    if (!selected) {
      setRecent([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await api.getThreadMessages(selected.threadId);
      const live = res.success ? res.data : [];
      const rows = live.length
        ? live
        : USE_FIXTURES
          ? fxMessages.filter((m) => m.thread_id === selected.threadId)
          : [];
      if (!cancelled) setRecent(rows.slice(-6).reverse());
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const activeFilterCount = activeTypes.length + activeTags.length;

  const toggle = <T,>(list: T[], set: (v: T[]) => void, item: T) =>
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const patchPerson = async (p: Person, patch: { favorite?: boolean; muted?: boolean }) => {
    const res =
      p.kind === "contact"
        ? await api.setContactMeta(p.key, patch)
        : await api.setGroupMeta(p.key, {});
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    onRefresh();
  };

  const saveNotes = async (p: Person) => {
    if (notesDraft === null) return;
    const res = await api.upsertCustomer({
      id: p.customerId ?? "",
      thread_id: p.threadId,
      display_name: p.name,
      notes: notesDraft,
      updated_at: Date.now(),
    });
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setStatus(`Saved notes for ${p.name}`);
    setNotesDraft(null);
    onRefresh();
  };

  const exportCsv = () => {
    const head = "name,subtitle,type,orders,lifetime_cents,open_cents,tags\n";
    const body = visible
      .map((p) =>
        [
          JSON.stringify(p.name),
          JSON.stringify(p.subtitle),
          p.type,
          p.orderCount,
          p.lifetimeCents,
          p.openCents,
          JSON.stringify(p.tags.join(" ")),
        ].join(","),
      )
      .join("\n");
    const blob = new Blob([head + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "signalx-directory.csv";
    a.click();
    URL.revokeObjectURL(url);
    setMenu(null);
    setStatus(`Exported ${visible.length} directory rows`);
  };

  return (
    <>
      {menu && <div className="menu-scrim" onClick={() => setMenu(null)} />}

      <section className="thread-col people-col">
        <header className="people-toolbar">
          <div className="people-toolbar-row">
            <div className="people-search">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search people…"
                aria-label="Search people"
              />
              {q && (
                <button type="button" className="icon-btn tiny" onClick={() => setQ("")} aria-label="Clear">
                  <IconX />
                </button>
              )}
            </div>
            <div className="menu-anchor">
              <button
                type="button"
                className="action-btn primary people-add"
                onClick={() => setMenu(menu === "add" ? null : "add")}
              >
                <IconPlus />
                <IconChevronDown />
              </button>
              {menu === "add" && (
                <div className="menu-pop right">
                  <button
                    type="button"
                    onClick={() => {
                      setComposer("contact");
                      setMenu(null);
                    }}
                  >
                    Add a person
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setComposer("group");
                      setMenu(null);
                    }}
                  >
                    Create a group
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="people-toolbar-row tools">
            <div className="menu-anchor grow">
              <button
                type="button"
                className={activeFilterCount ? "chip tool active" : "chip tool"}
                onClick={() => setMenu(menu === "filter" ? null : "filter")}
              >
                <IconFilter />
                Type
                {activeFilterCount > 0 && <span className="chip-badge">{activeFilterCount}</span>}
              </button>
              {menu === "filter" && (
                <div className="menu-pop">
                  <span className="menu-label">Contact type</span>
                  {TYPES.map((t) => (
                    <button key={t} type="button" onClick={() => toggle(activeTypes, setActiveTypes, t)}>
                      <span className={activeTypes.includes(t) ? "tick on" : "tick"} />
                      {t}
                    </button>
                  ))}
                  {allTags.length > 0 && <span className="menu-label">Tags</span>}
                  {allTags.map((t) => (
                    <button key={t} type="button" onClick={() => toggle(activeTags, setActiveTags, t)}>
                      <span className={activeTags.includes(t) ? "tick on" : "tick"} />
                      {t}
                    </button>
                  ))}
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      className="menu-reset"
                      onClick={() => {
                        setActiveTypes([]);
                        setActiveTags([]);
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="menu-anchor grow">
              <button
                type="button"
                className={activeStatuses.length ? "chip tool active" : "chip tool"}
                onClick={() => setMenu(menu === "status" ? null : "status")}
              >
                <IconTag />
                Status
                {activeStatuses.length > 0 && (
                  <span className="chip-badge">{activeStatuses.length}</span>
                )}
              </button>
              {menu === "status" && (
                <div className="menu-pop">
                  <span className="menu-label">Filter status</span>
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggle(activeStatuses, setActiveStatuses, s)}
                    >
                      <span className={activeStatuses.includes(s) ? "tick on" : "tick"} />
                      {s}
                    </button>
                  ))}
                  {activeStatuses.length > 0 && (
                    <button type="button" className="menu-reset" onClick={() => setActiveStatuses([])}>
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className={sortAsc ? "chip tool" : "chip tool active"}
              onClick={() => setSortAsc((v) => !v)}
              title={sortAsc ? "Sorted A–Z" : "Sorted Z–A"}
            >
              <IconSort />
              {sortAsc ? "A–Z" : "Z–A"}
            </button>

            <div className="menu-anchor">
              <button
                type="button"
                className="chip tool icon-only"
                onClick={() => setMenu(menu === "more" ? null : "more")}
                aria-label="More actions"
              >
                <IconMore />
              </button>
              {menu === "more" && (
                <div className="menu-pop right">
                  <button type="button" onClick={exportCsv}>
                    Export directory CSV
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="people-count">
            {visible.length} of {directory.length}
          </div>
        </header>

        {composer && (
          <div className="people-composer">
            <div className="people-composer-head">
              <strong>{composer === "group" ? "Create a group" : "Add a person"}</strong>
              <button type="button" className="icon-btn tiny" onClick={() => setComposer(null)}>
                <IconX />
              </button>
            </div>
            {composer === "contact" ? (
              <>
                <input
                  placeholder="Phone number"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                />
                <input
                  placeholder="Display name (optional)"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                />
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={() => void addContact()}
                >
                  Save person
                </button>
              </>
            ) : (
              <>
                <input
                  placeholder="Group name"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                />
                <input
                  placeholder="Members — +1555…, +1444…"
                  value={groupForm.members}
                  onChange={(e) => setGroupForm({ ...groupForm, members: e.target.value })}
                />
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={() => void createGroup()}
                >
                  Create group
                </button>
              </>
            )}
          </div>
        )}

        <div className="people-list">
          {visible.length === 0 && (
            <p className="hint">No one matches these filters.</p>
          )}
          {visible.map((p) => {
            const preview = previews[p.threadId];
            const attention = p.statuses.includes("Needs attention");
            const unread = p.unreadCount > 0;
            const cls = [
              "person-card",
              p.key === selectedKey ? "active" : "",
              unread ? "unread" : "",
              attention ? "attention" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button key={p.key} type="button" className={cls} onClick={() => onSelectKey(p.key)}>
                <div className="person-card-head">
                  <span className="person-avatar" style={avatarTint(p.key)} aria-hidden>
                    {initials(p.name)}
                    {unread && <span className="person-dot" />}
                  </span>
                  <div className="person-id">
                    <div className="person-name-row">
                      <span className="person-name">{p.name}</span>
                      <span className="person-type">{p.type}</span>
                    </div>
                    <div className="person-sub">{p.subtitle}</div>
                  </div>
                  <div className="person-badges">
                    {p.unreadCount > 0 && (
                      <span className="person-unread" title={`${p.unreadCount} unread`}>
                        <IconMail />
                        {p.unreadCount}
                      </span>
                    )}
                    <span className="person-ico" title={p.type}>
                      {typeIcon(p.type)}
                    </span>
                    {p.statuses.map((s) => (
                      <span key={s} className={`person-ico st-${statusSlug(s)}`} title={s}>
                        {statusIcon(s)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="person-preview">
                  <span>
                    {preview
                      ? preview.slice(0, 140)
                      : preview === null
                        ? "No messages yet"
                        : "…"}
                  </span>
                  {p.lastActivity && <em>{fmtTime(p.lastActivity)}</em>}
                </div>

                <div className="person-foot">
                  <div className="person-tags">
                    {p.orderCount > 0 && (
                      <span className="person-tag strong">
                        {p.orderCount} order{p.orderCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {p.tags.map((t) => (
                      <span key={t} className="person-tag">
                        #{t}
                      </span>
                    ))}
                  </div>
                  {p.lifetimeCents > 0 && (
                    <span className="person-value">{money(p.lifetimeCents)}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="convo people-detail">
        {!selected ? (
          <div className="people-detail-empty">
            <h2>{directory.length} people</h2>
            <p>Select someone to see their profile, orders, preferences and insights.</p>
            <dl className="people-rollup">
              <div>
                <dt>Unread</dt>
                <dd>{directory.reduce((n, p) => n + p.unreadCount, 0)}</dd>
              </div>
              <div>
                <dt>Need attention</dt>
                <dd>{directory.filter((p) => p.statuses.includes("Needs attention")).length}</dd>
              </div>
              <div>
                <dt>Outstanding</dt>
                <dd>{money(directory.reduce((n, p) => n + p.openCents, 0))}</dd>
              </div>
              <div>
                <dt>Lifetime</dt>
                <dd>{money(directory.reduce((n, p) => n + p.lifetimeCents, 0))}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="people-detail-body">
            <header className="people-detail-head">
              <span className="person-avatar lg" style={avatarTint(selected.key)} aria-hidden>
                {initials(selected.name)}
              </span>
              <div className="person-id">
                <div className="person-name-row">
                  <h2>{selected.name}</h2>
                  <span className="person-type">{selected.type}</span>
                </div>
                <div className="person-sub">{selected.subtitle}</div>
              </div>
              <button
                type="button"
                className="act-btn"
                onClick={() => onOpenChat(selected.threadId)}
              >
                <IconMessages />
                <span>Open chat</span>
              </button>
            </header>

            <dl className="people-stats">
              <div>
                <dt>Orders</dt>
                <dd>{selected.orderCount}</dd>
              </div>
              <div>
                <dt>Lifetime</dt>
                <dd>{money(selected.lifetimeCents)}</dd>
              </div>
              <div>
                <dt>Open</dt>
                <dd>{money(selected.openCents)}</dd>
              </div>
              <div>
                <dt>Messages</dt>
                <dd>{selected.messageCount}</dd>
              </div>
            </dl>

            <section className="people-block">
              <h3>Preferences</h3>
              <div className="people-prefs">
                <button
                  type="button"
                  className={selected.favorite ? "chip active" : "chip"}
                  onClick={() => void patchPerson(selected, { favorite: !selected.favorite })}
                >
                  Favourite
                </button>
                <button
                  type="button"
                  className={selected.muted ? "chip active" : "chip"}
                  onClick={() => void patchPerson(selected, { muted: !selected.muted })}
                >
                  Muted
                </button>
                <span className={selected.autoReply ? "chip active" : "chip"}>
                  Auto-reply {selected.autoReply ? "on" : "off"}
                </span>
              </div>
            </section>

            <section className="people-block">
              <h3>Notes</h3>
              <textarea
                className="people-notes"
                value={notesDraft ?? selected.notes}
                placeholder="Delivery preferences, payment terms, anything worth remembering."
                onChange={(e) => setNotesDraft(e.target.value)}
              />
              {notesDraft !== null && notesDraft !== selected.notes && (
                <div className="people-notes-actions">
                  <button
                    type="button"
                    className="action-btn primary"
                    onClick={() => void saveNotes(selected)}
                  >
                    Save notes
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => setNotesDraft(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </section>

            <section className="people-block">
              <h3>Insights</h3>
              {(() => {
                const rows = insightsFor(selected, money);
                if (rows.length === 0) {
                  return <p className="hint tight">Nothing notable yet — no orders or unread messages.</p>;
                }
                return (
                  <ul className="people-insights">
                    {rows.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                );
              })()}
              <p className="hint tight people-insight-note">
                Computed from this record. AI summaries appear here once a model is configured.
              </p>
            </section>

            <section className="people-block">
              <h3>Recent messages</h3>
              {recent.length === 0 ? (
                <p className="hint tight">No messages yet.</p>
              ) : (
                <ul className="people-messages">
                  {recent.map((m) => (
                    <li key={m.id} className={m.direction === "Outgoing" ? "out" : "in"}>
                      <div className="people-message-top">
                        <span>{m.direction === "Outgoing" ? "You" : selected.name}</span>
                        <em>{fmtTime(m.timestamp)}</em>
                      </div>
                      <p>{m.content}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="people-block">
              <h3>Order history</h3>
              {selected.orders.length === 0 ? (
                <p className="hint tight">No orders yet.</p>
              ) : (
                <ul className="people-orders">
                  {selected.orders.map((o) => (
                    <li key={o.id}>
                      <div className="people-order-top">
                        <span className="order-id">{o.id.slice(0, 12)}</span>
                        <span className={`status-pill status-${o.status === "cancelled" ? "muted" : "ok"}`}>
                          {o.status}
                        </span>
                      </div>
                      <div className="convo-sub">
                        {money(o.total_cents)} · {fmtTime(o.created_at)} ·{" "}
                        {o.lines.map((l) => `${l.name}×${l.quantity}`).join(", ")}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </section>
    </>
  );
}
