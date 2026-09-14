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
  IconArchive,
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
  IconTrash,
  IconTruck,
  IconX,
} from "../../navIcons";
import { USE_FIXTURES, fxMessages } from "../../devFixtures";
import { WhyTip } from "../WhyTip";
import { useEscapeLayer } from "../../overlayEscape";
import { actionsFor, buildDirectory, insightsFor, type Person, type PersonStatus, type PersonType } from "./people";

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

function orderTone(status: string): "ok" | "warn" | "danger" | "muted" {
  const s = status.toLowerCase();
  if (s === "paid" || s === "fulfilled" || s === "completed") return "ok";
  if (s === "cancelled" || s === "canceled" || s === "failed") return "danger";
  if (s === "invoiced" || s === "sent" || s === "pending" || s === "confirmed") return "warn";
  return "muted";
}

function standingPreview(
  p: Person,
  money: (cents: number) => string,
  snippet: string | null | undefined,
): string {
  if (p.unreadCount > 0 && snippet) return snippet.slice(0, 140);
  const bits: string[] = [];
  if (p.openCents > 0) bits.push(`${money(p.openCents)} open`);
  if (p.orderCount > 0) bits.push(`${p.orderCount} order${p.orderCount === 1 ? "" : "s"}`);
  if (p.pendingCount > 0) bits.push(`${p.pendingCount} queued`);
  if (bits.length) return bits.join(" · ");
  if (snippet) return snippet.slice(0, 140);
  if (snippet === null) return "No messages yet";
  return "…";
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
  onNavigate: (panel: "orders" | "outbox") => void;
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
  searchQuery?: string;
  searchQueryTick?: number;
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
  onNavigate,
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
  searchQuery = "",
  searchQueryTick = 0,
}: Props) {
  const [q, setQ] = useState(searchQuery);
  const [activeTypes, setActiveTypes] = useState<PersonType[]>([]);
  const [activeStatuses, setActiveStatuses] = useState<PersonStatus[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sortAsc, setSortAsc] = useState(true);
  const [menu, setMenu] = useState<null | "add" | "filter" | "status" | "tags" | "more">(null);
  const [composer, setComposer] = useState<null | "contact" | "group">(null);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [recent, setRecent] = useState<Message[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  useEscapeLayer(!!menu, () => setMenu(null));
  useEscapeLayer(!!composer, () => setComposer(null));
  useEscapeLayer(!!confirmDelete, () => setConfirmDelete(null));
  // The backend has no archive column, so this is a local hide-list. Swap it
  // for a real field once one exists — nothing else depends on the shape.
  const [archived, setArchived] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("signalx.archived") ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });

  const persistArchived = (next: Set<string>) => {
    setArchived(next);
    try {
      localStorage.setItem("signalx.archived", JSON.stringify([...next]));
    } catch {
      /* private mode — archive stays in memory for this session */
    }
  };

  useEffect(() => {
    setQ(searchQuery);
  }, [searchQuery, searchQueryTick]);

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
      if (archived.has(p.key) !== showArchived) return false;
      if (activeTypes.length && !activeTypes.includes(p.type)) return false;
      if (activeStatuses.length && !activeStatuses.some((s) => p.statuses.includes(s))) return false;
      if (activeTags.length && !activeTags.some((t) => p.tags.includes(t))) return false;
      if (!needle) return true;
      const hay = `${p.name} ${p.subtitle} ${p.tags.join(" ")} ${p.notes} ${p.key} ${p.threadId}`.toLowerCase();
      return hay.includes(needle);
    });
    return rows.sort((a, b) =>
      sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
    );
  }, [directory, q, activeTypes, activeStatuses, activeTags, sortAsc, archived, showArchived]);

  const selected = useMemo(
    () => directory.find((p) => p.key === selectedKey) ?? null,
    [directory, selectedKey],
  );

  const previewByThreadId = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const t of threads) map[t.id] = t.last_preview || null;
    return map;
  }, [threads]);

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


  const toggle = <T,>(list: T[], set: (v: T[]) => void, item: T) =>
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const patchPerson = async (p: Person, patch: { favorite?: boolean; muted?: boolean }) => {
    const res =
      p.kind === "contact"
        ? await api.setContactMeta(p.key, patch)
        : await api.setGroupMeta(p.key, patch);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    onRefresh();
  };

  const saveNotes = async (p: Person) => {
    if (notesDraft === null) return;
    const res =
      p.kind === "group"
        ? await api.setGroupMeta(p.key, { notes: notesDraft })
        : await api.upsertCustomer({
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

  const toggleArchive = (p: Person) => {
    const next = new Set(archived);
    if (next.has(p.key)) {
      next.delete(p.key);
      setStatus(`${p.name} restored to the directory`);
    } else {
      next.add(p.key);
      setStatus(`${p.name} archived`);
      onSelectKey(null);
    }
    persistArchived(next);
  };

  const deletePerson = async (p: Person) => {
    if (p.kind !== "contact") return;
    const res = await api.deleteContactMeta(p.key);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    if (p.customerId) await api.deleteCustomer(p.customerId);
    const next = new Set(archived);
    next.delete(p.key);
    persistArchived(next);
    setConfirmDelete(null);
    onSelectKey(null);
    setStatus(`Deleted ${p.name}`);
    onRefresh();
  };

  const exportCsv = () => {
    const head = "name,subtitle,type,orders,lifetime_cents,open_cents,tags\n";
    const body = directory
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
    setStatus(`Exported ${directory.length} directory rows`);
  };

  return (
    <>
      {menu && <div className="menu-scrim" onClick={() => setMenu(null)} />}

      <section className="thread-col people-col">
        <header className="people-toolbar">
          <div className="people-search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              aria-label="Search people"
            />
            {q && (
              <button type="button" className="icon-btn tiny" onClick={() => setQ("")} aria-label="Clear search">
                <IconX />
              </button>
            )}
          </div>

          <div className="people-tools">
            <div className="menu-anchor">
              <button
                type="button"
                className="tool-btn add"
                aria-label="Add"
                title="Add a person or group"
                onClick={() => setMenu(menu === "add" ? null : "add")}
              >
                <IconPlus />
                <span className="tool-label">Add</span>
                <IconChevronDown className="caret" />
              </button>
              {menu === "add" && (
                <div className="menu-pop">
                  <button type="button" onClick={() => { setComposer("contact"); setMenu(null); }}>
                    Add a person
                  </button>
                  <button type="button" onClick={() => { setComposer("group"); setMenu(null); }}>
                    Create a group
                  </button>
                </div>
              )}
            </div>

            <div className="menu-anchor">
              <button
                type="button"
                className={activeTypes.length ? "tool-btn active" : "tool-btn"}
                aria-label="Filter by type"
                title="Type"
                onClick={() => setMenu(menu === "filter" ? null : "filter")}
              >
                <IconFilter />
                <span className="tool-label">Type</span>
                <IconChevronDown className="caret" />
                {activeTypes.length > 0 && <span className="tool-dot" />}
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
                  {activeTypes.length > 0 && (
                    <button type="button" className="menu-reset" onClick={() => setActiveTypes([])}>
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="menu-anchor">
              <button
                type="button"
                className={activeStatuses.length ? "tool-btn active" : "tool-btn"}
                aria-label="Filter by status"
                title="Status"
                onClick={() => setMenu(menu === "status" ? null : "status")}
              >
                <IconCheckCheck />
                <span className="tool-label">Status</span>
                <IconChevronDown className="caret" />
                {activeStatuses.length > 0 && <span className="tool-dot" />}
              </button>
              {menu === "status" && (
                <div className="menu-pop">
                  <span className="menu-label">Status</span>
                  {STATUSES.map((st) => (
                    <button key={st} type="button" onClick={() => toggle(activeStatuses, setActiveStatuses, st)}>
                      <span className={activeStatuses.includes(st) ? "tick on" : "tick"} />
                      {st}
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

            <div className="menu-anchor">
              <button
                type="button"
                className={activeTags.length ? "tool-btn active" : "tool-btn"}
                aria-label="Filter by tag"
                title="Tags"
                onClick={() => setMenu(menu === "tags" ? null : "tags")}
              >
                <IconTag />
                <span className="tool-label">Tags</span>
                <IconChevronDown className="caret" />
                {activeTags.length > 0 && <span className="tool-dot" />}
              </button>
              {menu === "tags" && (
                <div className="menu-pop">
                  <span className="menu-label">Tags</span>
                  {allTags.length === 0 && <span className="menu-label">None yet</span>}
                  {allTags.map((t) => (
                    <button key={t} type="button" onClick={() => toggle(activeTags, setActiveTags, t)}>
                      <span className={activeTags.includes(t) ? "tick on" : "tick"} />
                      {t}
                    </button>
                  ))}
                  {activeTags.length > 0 && (
                    <button type="button" className="menu-reset" onClick={() => setActiveTags([])}>
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className={sortAsc ? "tool-btn" : "tool-btn active"}
              aria-label={sortAsc ? "Sorted A to Z" : "Sorted Z to A"}
              title={sortAsc ? "Sorted A–Z" : "Sorted Z–A"}
              onClick={() => setSortAsc((v) => !v)}
            >
              <IconSort />
            </button>
            {(q || activeTypes.length || activeStatuses.length || activeTags.length) && (
              <button
                type="button"
                className="tool-btn"
                onClick={() => {
                  setQ("");
                  setActiveTypes([]);
                  setActiveStatuses([]);
                  setActiveTags([]);
                }}
              >
                Clear filters
              </button>
            )}

            <div className="menu-anchor">
              <button
                type="button"
                className="tool-btn"
                aria-label="More actions"
                title="More"
                onClick={() => setMenu(menu === "more" ? null : "more")}
              >
                <IconMore />
              </button>
              {menu === "more" && (
                <div className="menu-pop right">
                  <button type="button" onClick={() => { setShowArchived((v) => !v); setMenu(null); }}>
                    {showArchived ? "Hide archived" : `Show archived (${archived.size})`}
                  </button>
                  <button type="button" onClick={exportCsv}>
                    Export directory CSV
                  </button>
                </div>
              )}
            </div>
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
            const preview = previewByThreadId[p.threadId];
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
                  <span>{standingPreview(p, money, preview)}</span>
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
                {selected.name === selected.subtitle && selected.kind === "contact" && (
                  <label className="field-stack">
                    <span className="field-label">Name</span>
                    <input
                      defaultValue=""
                      placeholder="Add a display name"
                      onBlur={(e) => {
                        const name = e.target.value.trim();
                        if (!name) return;
                        void api
                          .setContactMeta(selected.key, { display_name: name })
                          .then((res) => {
                            if (!res.success) setStatus(res.error);
                            else onRefresh();
                          });
                      }}
                    />
                  </label>
                )}
              </div>
              <div className="people-detail-actions">
                <button
                  type="button"
                  className="act-btn"
                  onClick={() => onOpenChat(selected.threadId)}
                >
                  <IconMessages />
                  <span>Open chat</span>
                </button>
                <button
                  type="button"
                  className={archived.has(selected.key) ? "act-btn active" : "act-btn"}
                  onClick={() => toggleArchive(selected)}
                  title={
                    archived.has(selected.key)
                      ? "Return to the directory"
                      : "Hide from the directory without deleting"
                  }
                >
                  <IconArchive />
                  <span>{archived.has(selected.key) ? "Unarchive" : "Archive"}</span>
                </button>
                {confirmDelete === selected.key ? (
                  <>
                    <button
                      type="button"
                      className="act-btn danger"
                      onClick={() => void deletePerson(selected)}
                    >
                      <IconTrash />
                      <span>Confirm delete</span>
                    </button>
                    <button type="button" className="act-btn" onClick={() => setConfirmDelete(null)}>
                      <span>Cancel</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="act-btn"
                    disabled={selected.kind !== "contact"}
                    onClick={() => setConfirmDelete(selected.key)}
                    title={
                      selected.kind === "contact"
                        ? "Delete this person and their linked customer record"
                        : "Groups can't be deleted from here — leave the group in Signal instead"
                    }
                  >
                    <IconTrash />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </header>

            {archived.has(selected.key) && (
              <p className="people-archived-note">
                Archived — hidden from the directory. Stored on this device only;
                Signal and the daemon are untouched.
              </p>
            )}

            {selected.name === selected.subtitle && selected.kind === "contact" && (
              <p className="people-unnamed-note">
                Unnamed — this is just a number until you add a name from Add, or notes below.
              </p>
            )}

            {!(selected.orderCount === 0 && selected.messageCount === 0 && selected.lifetimeCents === 0) && (
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
            )}

            <div className="people-detail-cols">
              <div className="people-col-main">
            <section className="people-block actions">
              <h3>Action items</h3>
              {(() => {
                const rows = actionsFor(selected, money);
                if (rows.length === 0) {
                  return <p className="hint tight">Nothing outstanding — nobody is waiting on you.</p>;
                }
                return (
                  <ul className="people-actions">
                    {rows.map((a) => (
                      <li key={a.id} className={a.urgent ? "urgent" : ""}>
                        <div className="people-action-text">
                          <strong>
                            {a.label}
                            <WhyTip why={a.why} label={`Why: ${a.label}`} />
                          </strong>
                          {a.detail && <span>{a.detail}</span>}
                        </div>
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() =>
                            a.target === "chat"
                              ? onOpenChat(selected.threadId)
                              : onNavigate(a.target)
                          }
                        >
                          {a.cta}
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </section>

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
                      <li key={r.text}>
                        <span>{r.text}</span>
                        <WhyTip why={r.why} label={`Why: ${r.text}`} />
                      </li>
                    ))}
                  </ul>
                );
              })()}
              <p className="hint tight people-insight-note">
                Computed from this record. AI summaries appear here once a model is configured.
              </p>
            </section>

              </div>

              <div className="people-col-side">
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
                        <span className={`status-pill status-${orderTone(o.status)}`}>
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
            </div>
          </div>
        )}
      </section>
    </>
  );
}
