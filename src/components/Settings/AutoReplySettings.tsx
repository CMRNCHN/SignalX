import type { AutoReplyAuditEntry, AutoReplySettings as AutoReplyConfig, ContactMeta, Customer, GroupMeta } from "../../api";
import { threadTitle } from "../../format";
import { AllowlistList } from "./AllowlistList";

type Props = {
  settings: AutoReplyConfig | null;
  onSave: (patch: Partial<AutoReplyConfig>) => void;
  onAllowCurrentChat: () => void;
  onRemoveFromAllowlist: (threadId: string) => void;
  audit: AutoReplyAuditEntry[];
  onOpenLog: () => void;
  contacts: ContactMeta[];
  groups: GroupMeta[];
  customers: Customer[];
};

/** Empty input clears an optional hour; otherwise parse it. */
const hourOrNull = (raw: string) => (raw === "" ? null : Number(raw));

/** Auto-reply tab: master switch, rate limits, quiet hours, allowlist, recent log. */
export function AutoReplySettings({
  settings,
  onSave,
  onAllowCurrentChat,
  onRemoveFromAllowlist,
  audit,
  onOpenLog,
  contacts,
  groups,
  customers,
}: Props) {
  return (
    <>
      <div className="settings-card">
        <div className="settings-card-head">
          <h3>Auto-reply</h3>
          <span className={`status-pill status-${settings?.enabled ? "warn" : "muted"}`}>
            {settings?.enabled ? "ON" : "OFF"}
          </span>
        </div>
        <p className="hint tight">
          Optional AI drafts that can send on their own. Keep this off unless you trust it — and
          only for chats you approve. Groups stay off unless you turn them on one by one.
        </p>
        {settings && (
          <>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => onSave({ enabled: e.target.checked })}
              />
              Turn on auto-reply for this account
            </label>
            <div className="settings-section-label">Safety limits</div>
            <div className="settings-grid">
              <label className="field-stack">
                <span className="field-label">Max replies per chat / hour</span>
                <input
                  type="number"
                  min={1}
                  value={settings.max_per_thread_per_hour}
                  onChange={(e) => onSave({ max_per_thread_per_hour: Number(e.target.value) || 1 })}
                />
              </label>
              <label className="field-stack">
                <span className="field-label">Max global / window</span>
                <input
                  type="number"
                  min={1}
                  value={settings.max_per_window}
                  onChange={(e) => onSave({ max_per_window: Number(e.target.value) || 1 })}
                />
              </label>
              <label className="field-stack">
                <span className="field-label">Quiet start (0–23)</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  placeholder="off"
                  value={settings.quiet_hours_start ?? ""}
                  onChange={(e) => onSave({ quiet_hours_start: hourOrNull(e.target.value) })}
                />
              </label>
              <label className="field-stack">
                <span className="field-label">Quiet end</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  placeholder="off"
                  value={settings.quiet_hours_end ?? ""}
                  onChange={(e) => onSave({ quiet_hours_end: hourOrNull(e.target.value) })}
                />
              </label>
            </div>
            <div className="allowlist-head">
              <span className="field-label">Allowed chats ({settings.allowlist.length})</span>
              <button type="button" className="ghost-btn" onClick={onAllowCurrentChat}>
                Add current chat
              </button>
            </div>
            {settings.allowlist.length === 0 ? (
              <p className="hint tight">Empty — nobody can auto-send.</p>
            ) : (
              <AllowlistList
                threadIds={settings.allowlist}
                contacts={contacts}
                groups={groups}
                customers={customers}
                onRemove={onRemoveFromAllowlist}
              />
            )}
          </>
        )}
      </div>
      <div className="settings-card">
        <div className="settings-card-head">
          <h3>Recent log</h3>
          <button type="button" className="ghost-btn" onClick={onOpenLog}>
            Open log
          </button>
        </div>
        {audit.length === 0 ? (
          <p className="hint tight">No auto-reply activity yet.</p>
        ) : (
          <ul className="settings-log">
            {audit.slice(0, 5).map((e) => (
              <li key={e.id}>
                <span className={`outcome outcome-${e.outcome.toLowerCase().replace(/\s+/g, "_")}`}>
                  {e.outcome}
                </span>
                <span>
                  {threadTitle(e.thread_id, contacts, groups, customers)}
                  {e.reason ? ` — ${e.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
