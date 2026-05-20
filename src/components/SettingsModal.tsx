import React, { useEffect, useMemo, useRef, useState } from "react";
// Note: contact photos are rendered via backend byte streaming + blob URLs in App.tsx

export type CustomField = {
  id: string; // stable uuid
  key: string;
  type: "text" | "number" | "bool" | "date" | "tag";
  searchable: boolean;
  value: string; // normalized string form
};

export type ContactMeta = {
  contact_id: string;
  display_name: string | null;
  alias: string | null;
  categories: string[];
  favorite: boolean;
  muted: boolean;
  icon: string | null;
  photo_path: string | null;
  apple_contact_id: string | null;
  custom_fields: CustomField[];
  updated_at: number;
};

export type ContactMetaDraft = {
  display_name: string;
  alias: string;
  icon: string;
  categories: string[];
  favorite: boolean;
  muted: boolean;
  apple_contact_id: string;
  custom_fields: CustomField[];
};

const newFieldId = (): string => {
  // Tauri/WebView has WebCrypto; fall back to a simple timestamp id if needed.
  try {
    return crypto.randomUUID();
  } catch {
    return `cf_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
};

const normalizeCustomField = (f: any): CustomField => {
  const t = String(f?.type || f?.field_type || "text").toLowerCase();
  const type =
    t === "number" ? "number" : t === "bool" ? "bool" : t === "date" ? "date" : t === "tag" ? "tag" : "text";
  return {
    id: String(f?.id || newFieldId()),
    key: String(f?.key || ""),
    type,
    searchable: Boolean(f?.searchable ?? f?.is_searchable ?? true),
    value: String(f?.value ?? ""),
  };
};

export type SettingsModalProps = {
  open: boolean;
  onClose: () => void;

  contacts: Array<{
    id: string;
    display_name: string;
    number: string;
    unread_count: number;
    last_message_ts: number;
    meta: ContactMeta | null;
  }>;
  groups: Array<{
    id: string; // group:XYZ
    display_name: string;
    members: string[];
    unread_count: number;
    last_message_ts: number;
    meta: any | null;
  }>;
  categories: string[];
  groupCategories: string[];

  selectedContactId: string | null;
  onSelectContact: (contactId: string) => void;
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;

  onCreateContact: (contactId: string) => Promise<void>;
  onSetMuted: (contactId: string, muted: boolean) => Promise<void>;
  onCreateGroup: (groupId: string) => Promise<void>;
  onSetGroupMuted: (groupId: string, muted: boolean) => Promise<void>;

  onSaveDraft: (contactId: string, draft: ContactMetaDraft) => Promise<void>;
  onDeleteMeta: (contactId: string) => Promise<void>;
  onUploadPhoto: (contactId: string, bytes: number[], ext: string) => Promise<void>;
  onRemovePhoto: (contactId: string) => Promise<void>;
  onLinkAppleStub: (contactId: string, appleContactId: string) => Promise<void>;
  onUnlinkAppleStub: (contactId: string) => Promise<void>;

  onSaveGroupDraft: (groupId: string, draft: any) => Promise<void>;
  onDeleteGroupMeta: (groupId: string) => Promise<void>;
};

function fmt(ts: number) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  const {
    open,
    onClose,
    contacts,
    groups,
    categories,
    groupCategories,
    selectedContactId,
    onSelectContact,
    selectedGroupId,
    onSelectGroup,
    onCreateContact,
    onSetMuted,
    onCreateGroup,
    onSetGroupMuted,
    onSaveDraft,
    onDeleteMeta,
    onUploadPhoto,
    onRemovePhoto,
    onLinkAppleStub,
    onUnlinkAppleStub,
    onSaveGroupDraft,
    onDeleteGroupMeta,
  } = props;

  const [tab, setTab] = useState<"General" | "Accounts" | "Contacts" | "Developer">("Contacts");
  const [mode, setMode] = useState<"People" | "Groups">("People");
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(() => {
    if (!selectedContactId) return null;
    return contacts.find((c) => c.id === selectedContactId) || null;
  }, [contacts, selectedContactId]);

  const selectedGroup = useMemo(() => {
    if (!selectedGroupId) return null;
    return groups.find((g) => g.id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);

  const [draft, setDraft] = useState<ContactMetaDraft | null>(null);
  const [groupDraft, setGroupDraft] = useState<any | null>(null);
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab("Contacts");
    setMode("People");
  }, [open]);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      setDirty(false);
      return;
    }
    const m = selected.meta;
    setDraft({
      display_name: (m?.display_name ?? "") as string,
      alias: (m?.alias ?? "") as string,
      icon: (m?.icon ?? "") as string,
      categories: (m?.categories ?? []) as string[],
      favorite: !!m?.favorite,
      muted: !!m?.muted,
      apple_contact_id: (m?.apple_contact_id ?? "") as string,
      custom_fields: ((m?.custom_fields ?? []) as any[]).map(normalizeCustomField),
    });
    setDirty(false);
  }, [selected?.id]); // intentional: reset editor when switching contact

  useEffect(() => {
    if (!selectedGroup) {
      setGroupDraft(null);
      setDirty(false);
      return;
    }
    const m = selectedGroup.meta;
    setGroupDraft({
      display_name: (m?.display_name ?? "") as string,
      icon: (m?.icon ?? "") as string,
      categories: (m?.categories ?? []) as string[],
      favorite: !!m?.favorite,
      muted: !!m?.muted,
      custom_fields: ((m?.custom_fields ?? []) as any[]).map(normalizeCustomField),
      member_notes: (m?.member_notes ?? []) as string[],
    });
    setDirty(false);
  }, [selectedGroup?.id]);

  useEffect(() => {
    if (!open) return;
    if (mode === "People") {
      if (!selectedContactId) return;
      if (!draft) return;
    } else {
      if (!selectedGroupId) return;
      if (!groupDraft) return;
    }
    if (!dirty) return;

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (mode === "People") {
        onSaveDraft(selectedContactId as string, draft as ContactMetaDraft).catch(() => {});
      } else {
        onSaveGroupDraft(selectedGroupId as string, groupDraft).catch(() => {});
      }
    }, 350);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [open, selectedContactId, selectedGroupId, draft, groupDraft, dirty, onSaveDraft, onSaveGroupDraft, mode]);

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const meta = c.meta;
      const hay = [
        c.display_name,
        c.number,
        meta?.display_name || "",
        meta?.alias || "",
        (meta?.categories || []).join(" "),
        (meta?.custom_fields || [])
          .filter((f: any) => f.searchable ?? f.is_searchable)
          .map((f) => `${f.key} ${f.value}`)
          .join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, query]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const meta = g.meta;
      const hay = [
        g.display_name,
        g.id,
        (meta?.display_name || ""),
        (meta?.categories || []).join(" "),
        (meta?.custom_fields || [])
          .filter((f: any) => f.searchable ?? f.is_searchable)
          .map((f: any) => `${f.key} ${f.value}`)
          .join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [groups, query]);

  const photoSrc = useMemo(() => null, []);

  const pickPhoto = async () => {
    if (!selectedContactId) return;
    if (!fileRef.current) return;
    fileRef.current.value = "";
    fileRef.current.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedContactId) return;
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    const buf = await f.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buf));
    await onUploadPhoto(selectedContactId, bytes, ext);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 2500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(1200px, 96vw)",
          height: "min(820px, 90vh)",
          background: "#0b0d10",
          border: "1px solid #1f2937",
          borderRadius: 16,
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: 12, borderBottom: "1px solid #1f2937", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 900 }}>Settings</div>
          <button
            onClick={onClose}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer", fontSize: 12 }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: 10, borderBottom: "1px solid #1f2937", display: "flex", gap: 6 }}>
          {(["General", "Accounts", "Contacts", "Developer"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #374151",
                background: tab === t ? "#111827" : "transparent",
                color: tab === t ? "#e5e7eb" : "#9ca3af",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {tab !== "Contacts" ? (
          <div style={{ padding: 14, color: "#9ca3af" }}>
            TODO: {tab} settings.
          </div>
        ) : (
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "360px 1fr", minHeight: 0 }}>
            {/* Left list */}
            <div style={{ borderRight: "1px solid #1f2937", padding: 12, overflow: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                <button
                  onClick={() => setMode("People")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #374151",
                    background: mode === "People" ? "#111827" : "transparent",
                    color: mode === "People" ? "#e5e7eb" : "#9ca3af",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  People
                </button>
                <button
                  onClick={() => setMode("Groups")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #374151",
                    background: mode === "Groups" ? "#111827" : "transparent",
                    color: mode === "Groups" ? "#e5e7eb" : "#9ca3af",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  Groups
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={mode === "People" ? "Search contacts…" : "Search groups…"}
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #374151",
                    background: "#111827",
                    color: "#e5e7eb",
                  }}
                />
                <button
                  onClick={async () => {
                    if (mode === "Groups") {
                      const id = window.prompt("Add group (group id)", "group:");
                      if (id === null) return;
                      const v = id.trim();
                      if (!v) return;
                      await onCreateGroup(v);
                      onSelectGroup(v);
                      return;
                    }
                    const id = window.prompt("Add contact (phone number)", "+");
                    if (id === null) return;
                    const v = id.trim();
                    if (!v) return;
                    await onCreateContact(v);
                    onSelectContact(v);
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #374151",
                    background: "#111827",
                    color: "#e5e7eb",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                  title="Add contact"
                >
                  +
                </button>
              </div>
              <div style={{ marginTop: 10 }}>
                {mode === "People" ? (
                  filteredContacts.length === 0 ? (
                    <div style={{ padding: 10, color: "#9ca3af", fontSize: 12 }}>
                      No matches.
                    </div>
                  ) : (
                    filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => onSelectContact(c.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: 10,
                          borderRadius: 10,
                          border: "1px solid #1f2937",
                          background:
                            selectedContactId === c.id ? "#111827" : "transparent",
                          color: "#e5e7eb",
                          cursor: "pointer",
                          marginBottom: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 800,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {c.display_name}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            {c.meta?.muted ? (
                              <>
                                <span
                                  style={{
                                    fontSize: 11,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: "#0b0d10",
                                    border: "1px solid #374151",
                                    color: "#9ca3af",
                                  }}
                                >
                                  Muted
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onSetMuted(c.id, false).catch(() => {});
                                  }}
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: 999,
                                    border: "1px solid #374151",
                                    background: "#111827",
                                    color: "#e5e7eb",
                                    cursor: "pointer",
                                    fontSize: 11,
                                  }}
                                >
                                  Unmute
                                </button>
                              </>
                            ) : null}
                            {c.meta?.favorite ? (
                              <div style={{ color: "#fbbf24" }}>★</div>
                            ) : null}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>
                          {c.number}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          last: {fmt(c.last_message_ts)}
                        </div>
                      </button>
                    ))
                  )
                ) : filteredGroups.length === 0 ? (
                  <div style={{ padding: 10, color: "#9ca3af", fontSize: 12 }}>
                    No matches.
                  </div>
                ) : (
                  filteredGroups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => onSelectGroup(g.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid #1f2937",
                        background: selectedGroupId === g.id ? "#111827" : "transparent",
                        color: "#e5e7eb",
                        cursor: "pointer",
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.display_name}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {g.meta?.muted ? (
                            <>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#0b0d10", border: "1px solid #374151", color: "#9ca3af" }}>
                                Muted
                              </span>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onSetGroupMuted(g.id, false).catch(() => {});
                                }}
                                style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer", fontSize: 11 }}
                              >
                                Unmute
                              </button>
                            </>
                          ) : null}
                          {g.meta?.favorite ? <div style={{ color: "#fbbf24" }}>★</div> : null}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{g.members.length} members</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>last: {fmt(g.last_message_ts)}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right editor */}
            <div style={{ padding: 14, overflow: "auto" }}>
              {mode === "People" ? (
                !selected ? (
                  <div style={{ color: "#9ca3af" }}>Select a contact to edit.</div>
                ) : !draft ? (
                  <div style={{ color: "#9ca3af" }}>Loading…</div>
                ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>{selected.display_name}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{selected.number}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => selectedContactId && draft && onSaveDraft(selectedContactId, draft)}
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer", fontSize: 12 }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => selectedContactId && onDeleteMeta(selectedContactId)}
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #7f1d1d", background: "#1f2937", color: "#fecaca", cursor: "pointer", fontSize: 12 }}
                      >
                        Delete metadata
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "160px 1fr", gap: 14, alignItems: "start" }}>
                    {/* Photo */}
                    <div>
                      {photoSrc ? (
                        <img
                          src={photoSrc}
                          alt={selected.display_name}
                          style={{ width: 120, height: 120, borderRadius: 18, border: "1px solid #374151", objectFit: "cover" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 120,
                            height: 120,
                            borderRadius: 18,
                            border: "1px solid #374151",
                            background: "#111827",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 900,
                            fontSize: 22,
                          }}
                        >
                          {draft.icon ? draft.icon : selected.display_name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                        <button
                          onClick={pickPhoto}
                          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer", fontSize: 12 }}
                        >
                          Upload
                        </button>
                        <button
                          onClick={() => selectedContactId && onRemovePhoto(selectedContactId)}
                          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#0b0d10", color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
                        >
                          Remove
                        </button>
                        <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }} onChange={onFile} />
                      </div>
                    </div>

                    {/* Fields */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Display name</div>
                          <input
                            value={draft.display_name}
                            onChange={(e) => {
                              setDraft({ ...draft, display_name: e.target.value });
                              setDirty(true);
                            }}
                            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Icon</div>
                          <input
                            value={draft.icon}
                            onChange={(e) => {
                              setDraft({ ...draft, icon: e.target.value });
                              setDirty(true);
                            }}
                            placeholder="⭐ / 🧑‍💻"
                            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
                          />
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Alias override (optional)</div>
                        <input
                          value={draft.alias}
                          onChange={(e) => {
                            setDraft({ ...draft, alias: e.target.value });
                            setDirty(true);
                          }}
                          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
                        />
                      </div>

                      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#e5e7eb" }}>
                          <input
                            type="checkbox"
                            checked={draft.favorite}
                            onChange={(e) => {
                              setDraft({ ...draft, favorite: e.target.checked });
                              setDirty(true);
                            }}
                          />
                          Favorite
                        </label>
                        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#e5e7eb" }}>
                          <input
                            type="checkbox"
                            checked={draft.muted}
                            onChange={(e) => {
                              setDraft({ ...draft, muted: e.target.checked });
                              setDirty(true);
                            }}
                          />
                          Muted
                        </label>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Categories</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {categories.map((c) => {
                            const on = draft.categories.includes(c);
                            return (
                              <button
                                key={c}
                                onClick={() => {
                                  const next = on
                                    ? draft.categories.filter((x) => x !== c)
                                    : [...draft.categories, c];
                                  setDraft({ ...draft, categories: next });
                                  setDirty(true);
                                }}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  border: "1px solid #374151",
                                  background: on ? "#111827" : "transparent",
                                  color: on ? "#e5e7eb" : "#9ca3af",
                                  cursor: "pointer",
                                  fontSize: 12,
                                }}
                              >
                                {c}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                          <input
                            placeholder="Add new category…"
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              const v = (e.currentTarget.value || "").trim();
                              if (!v) return;
                              if (!draft.categories.includes(v)) {
                                setDraft({ ...draft, categories: [...draft.categories, v] });
                                setDirty(true);
                              }
                              e.currentTarget.value = "";
                            }}
                            style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
                          />
                          <div style={{ fontSize: 12, color: "#6b7280", alignSelf: "center" }}>Enter</div>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Apple Contact (stub)</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ flex: 1, fontFamily: "monospace", fontSize: 11, color: "#9ca3af" }}>
                            {draft.apple_contact_id || "not linked"}
                          </div>
                          <button
                            onClick={async () => {
                              if (!selectedContactId) return;
                              const id = window.prompt("Apple Contact ID (stub)", draft.apple_contact_id || "");
                              if (id === null) return;
                              const v = id.trim();
                              if (!v) return;
                              await onLinkAppleStub(selectedContactId, v);
                            }}
                            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer", fontSize: 12 }}
                          >
                            Link…
                          </button>
                          <button
                            onClick={async () => {
                              if (!selectedContactId) return;
                              await onUnlinkAppleStub(selectedContactId);
                            }}
                            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#0b0d10", color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
                          >
                            Unlink
                          </button>
                        </div>
                      </div>

                      <div style={{ borderTop: "1px solid #1f2937", paddingTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontWeight: 900 }}>Custom fields</div>
                          <button
                            onClick={() => {
                              setDraft({
                                ...draft,
                                custom_fields: [
                                  ...draft.custom_fields,
                                  { id: newFieldId(), key: "", value: "", type: "text", searchable: true },
                                ],
                              });
                              setDirty(true);
                            }}
                            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer", fontSize: 12 }}
                          >
                            + Add Field
                          </button>
                        </div>

                        {draft.custom_fields.length === 0 ? (
                          <div style={{ marginTop: 8, color: "#9ca3af", fontSize: 12 }}>No custom fields.</div>
                        ) : (
                          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                            {draft.custom_fields.map((f, idx) => (
                              <div key={f.id} style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 10, background: "#0b0d10" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 90px", gap: 8, alignItems: "center" }}>
                                  <input
                                    value={f.key}
                                    onChange={(e) => {
                                      const next = [...draft.custom_fields];
                                      next[idx] = { ...next[idx], key: e.target.value };
                                      setDraft({ ...draft, custom_fields: next });
                                      setDirty(true);
                                    }}
                                    placeholder="Key (e.g. Company)"
                                    style={{ padding: 8, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
                                  />
                                  <select
                                    value={f.type}
                                    onChange={(e) => {
                                      const next = [...draft.custom_fields];
                                      next[idx] = { ...next[idx], type: e.target.value as any };
                                      setDraft({ ...draft, custom_fields: next });
                                      setDirty(true);
                                    }}
                                    style={{ padding: 8, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", fontSize: 12 }}
                                  >
                                    {["text", "number", "bool", "date", "tag"].map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </select>
                                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#e5e7eb" }}>
                                    <input
                                      type="checkbox"
                                      checked={f.searchable}
                                      onChange={(e) => {
                                        const next = [...draft.custom_fields];
                                        next[idx] = { ...next[idx], searchable: e.target.checked };
                                        setDraft({ ...draft, custom_fields: next });
                                        setDirty(true);
                                      }}
                                    />
                                    Searchable
                                  </label>
                                  <button
                                    onClick={() => {
                                      const next = draft.custom_fields.filter((_, i) => i !== idx);
                                      setDraft({ ...draft, custom_fields: next });
                                      setDirty(true);
                                    }}
                                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#0b0d10", color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
                                  >
                                    Delete
                                  </button>
                                </div>
                                <textarea
                                  value={f.value}
                                  onChange={(e) => {
                                    const next = [...draft.custom_fields];
                                    next[idx] = { ...next[idx], value: e.target.value };
                                    setDraft({ ...draft, custom_fields: next });
                                    setDirty(true);
                                  }}
                                  placeholder="Value"
                                  style={{ marginTop: 8, width: "100%", padding: 10, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", minHeight: 60 }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
                )
              ) : !selectedGroup ? (
                <div style={{ color: "#9ca3af" }}>Select a group to edit.</div>
              ) : !groupDraft ? (
                <div style={{ color: "#9ca3af" }}>Loading…</div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>{selectedGroup.display_name}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{selectedGroup.members.length} members</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => selectedGroupId && groupDraft && onSaveGroupDraft(selectedGroupId, groupDraft)}
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer", fontSize: 12 }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => selectedGroupId && onDeleteGroupMeta(selectedGroupId)}
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #7f1d1d", background: "#1f2937", color: "#fecaca", cursor: "pointer", fontSize: 12 }}
                      >
                        Delete metadata
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 12, background: "#0b0d10" }}>
                      <div style={{ fontWeight: 900, marginBottom: 10 }}>Group</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Display name</div>
                          <input
                            value={groupDraft.display_name}
                            onChange={(e) => { setGroupDraft({ ...groupDraft, display_name: e.target.value }); setDirty(true); }}
                            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Icon</div>
                          <input
                            value={groupDraft.icon}
                            onChange={(e) => { setGroupDraft({ ...groupDraft, icon: e.target.value }); setDirty(true); }}
                            placeholder="👥 / ⭐"
                            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
                          />
                        </div>
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 14, alignItems: "center" }}>
                        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#e5e7eb" }}>
                          <input type="checkbox" checked={groupDraft.favorite} onChange={(e) => { setGroupDraft({ ...groupDraft, favorite: e.target.checked }); setDirty(true); }} />
                          Favorite
                        </label>
                        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#e5e7eb" }}>
                          <input type="checkbox" checked={groupDraft.muted} onChange={(e) => { setGroupDraft({ ...groupDraft, muted: e.target.checked }); setDirty(true); }} />
                          Muted
                        </label>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Categories</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {groupCategories.map((c) => {
                            const on = (groupDraft.categories || []).includes(c);
                            return (
                              <button
                                key={c}
                                onClick={() => {
                                  const next = on ? groupDraft.categories.filter((x: string) => x !== c) : [...groupDraft.categories, c];
                                  setGroupDraft({ ...groupDraft, categories: next });
                                  setDirty(true);
                                }}
                                style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #374151", background: on ? "#111827" : "transparent", color: on ? "#e5e7eb" : "#9ca3af", cursor: "pointer", fontSize: 12 }}
                              >
                                {c}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ borderTop: "1px solid #1f2937", paddingTop: 12, marginTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontWeight: 900 }}>Custom fields</div>
                          <button
                            onClick={() => {
                              const prev = (groupDraft.custom_fields || []) as CustomField[];
                              setGroupDraft({
                                ...groupDraft,
                                custom_fields: [
                                  ...prev,
                                  { id: newFieldId(), key: "", value: "", type: "text", searchable: true },
                                ],
                              });
                              setDirty(true);
                            }}
                            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", cursor: "pointer", fontSize: 12 }}
                          >
                            + Add Field
                          </button>
                        </div>

                        {((groupDraft.custom_fields || []) as CustomField[]).length === 0 ? (
                          <div style={{ marginTop: 8, color: "#9ca3af", fontSize: 12 }}>No custom fields.</div>
                        ) : (
                          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                            {((groupDraft.custom_fields || []) as CustomField[]).map((f, idx) => (
                              <div key={f.id} style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 10, background: "#0b0d10" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 90px", gap: 8, alignItems: "center" }}>
                                  <input
                                    value={f.key}
                                    onChange={(e) => {
                                      const next = [...((groupDraft.custom_fields || []) as CustomField[])];
                                      next[idx] = { ...next[idx], key: e.target.value };
                                      setGroupDraft({ ...groupDraft, custom_fields: next });
                                      setDirty(true);
                                    }}
                                    placeholder="Key (e.g. Topic)"
                                    style={{ padding: 8, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
                                  />
                                  <select
                                    value={f.type}
                                    onChange={(e) => {
                                      const next = [...((groupDraft.custom_fields || []) as CustomField[])];
                                      next[idx] = { ...next[idx], type: e.target.value as any };
                                      setGroupDraft({ ...groupDraft, custom_fields: next });
                                      setDirty(true);
                                    }}
                                    style={{ padding: 8, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb", fontSize: 12 }}
                                  >
                                    {["text", "number", "bool", "date", "tag"].map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </select>
                                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#e5e7eb" }}>
                                    <input
                                      type="checkbox"
                                      checked={f.searchable}
                                      onChange={(e) => {
                                        const next = [...((groupDraft.custom_fields || []) as CustomField[])];
                                        next[idx] = { ...next[idx], searchable: e.target.checked };
                                        setGroupDraft({ ...groupDraft, custom_fields: next });
                                        setDirty(true);
                                      }}
                                    />
                                    Searchable
                                  </label>
                                  <button
                                    onClick={() => {
                                      const next = ((groupDraft.custom_fields || []) as CustomField[]).filter((_: any, i: number) => i !== idx);
                                      setGroupDraft({ ...groupDraft, custom_fields: next });
                                      setDirty(true);
                                    }}
                                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #374151", background: "#0b0d10", color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
                                  >
                                    Delete
                                  </button>
                                </div>
                                <input
                                  value={f.value}
                                  onChange={(e) => {
                                    const next = [...((groupDraft.custom_fields || []) as CustomField[])];
                                    next[idx] = { ...next[idx], value: e.target.value };
                                    setGroupDraft({ ...groupDraft, custom_fields: next });
                                    setDirty(true);
                                  }}
                                  placeholder="Value"
                                  style={{ marginTop: 8, width: "100%", padding: 10, borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 12, background: "#0b0d10" }}>
                      <div style={{ fontWeight: 900, marginBottom: 10 }}>Members (read-only)</div>
                      <div style={{ maxHeight: 240, overflow: "auto", border: "1px solid #1f2937", borderRadius: 10 }}>
                        {selectedGroup.members.length === 0 ? (
                          <div style={{ padding: 10, color: "#9ca3af", fontSize: 12 }}>No members listed.</div>
                        ) : (
                          selectedGroup.members.map((m: string) => (
                            <div key={m} style={{ padding: 10, borderBottom: "1px solid #1f2937", fontSize: 12 }}>
                              {m}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


