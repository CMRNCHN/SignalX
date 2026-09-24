import { useState } from "react";
import type { AiStatus, DeviceLinkStatus, Diagnostics, SessionStatus } from "../../api";
import { DeviceLinkQr } from "../../DeviceLinkQr";
import { canInvoke } from "../../runtime";

type Props = {
  setupNeeded: boolean;
  diagnostics: Diagnostics | null;
  /** Human-readable receive-loop health, e.g. "Receive loop healthy". */
  receiveLabel: string;
  ai: AiStatus | null;
  linkBusy: boolean;
  linkStatus: DeviceLinkStatus | null;
  linkUri: string | null;
  linkCopied: boolean;
  onStartLink: () => void;
  onCancelLink: () => void;
  onCopyLinkUri: () => void;
  session: SessionStatus | null;
  /** Resolves true when the PIN was changed, so the form can clear itself. */
  onSetPin: (accountId: string, currentPin: string, newPin: string) => Promise<boolean>;
  addNumber: string;
  onAddNumberChange: (value: string) => void;
  addLabel: string;
  onAddLabelChange: (value: string) => void;
  addPin: string;
  onAddPinChange: (value: string) => void;
  rosterBusy: boolean;
  onAddAccount: () => void;
};

function statusTone(setupNeeded: boolean, diagnostics: Diagnostics | null): string {
  if (setupNeeded) return "warn";
  return diagnostics?.signal_cli_usable ? "ok" : "danger";
}

function statusText(setupNeeded: boolean, diagnostics: Diagnostics | null): string {
  if (setupNeeded) return "Needs link";
  if (!canInvoke() || !diagnostics) return "Preview";
  return diagnostics.signal_cli_usable ? "Ready" : "signal-cli issue";
}

function linkTone(busy: boolean, status: DeviceLinkStatus | null): string {
  if (status?.state === "success") return "ok";
  if (status?.state === "error") return "danger";
  if (busy || status?.state === "waiting") return "warn";
  return "muted";
}

function linkText(busy: boolean, status: DeviceLinkStatus | null): string {
  if (busy || status?.state === "waiting") return "WAITING";
  if (status?.state === "success") return "LINKED";
  if (status?.state === "error") return "FAILED";
  if (status?.state === "cancelled") return "CANCELLED";
  return "IDLE";
}

/** Account tab: health status, device linking, and the multi-number roster. */
export function AccountSettings({
  setupNeeded,
  diagnostics,
  receiveLabel,
  ai,
  linkBusy,
  linkStatus,
  linkUri,
  linkCopied,
  onStartLink,
  onCancelLink,
  onCopyLinkUri,
  session,
  onSetPin,
  addNumber,
  onAddNumberChange,
  addLabel,
  onAddLabelChange,
  addPin,
  onAddPinChange,
  rosterBusy,
  onAddAccount,
}: Props) {
  const [pinCurrent, setPinCurrent] = useState("");
  const [pinNew, setPinNew] = useState("");

  return (
    <>
      <div className="settings-card">
        <div className="settings-card-head">
          <h3>Status</h3>
          <span className={`status-pill status-${statusTone(setupNeeded, diagnostics)}`}>
            {statusText(setupNeeded, diagnostics)}
          </span>
        </div>
        <dl className="diag-grid diag-grid-4">
          <div>
            <dt>Account</dt>
            <dd title={diagnostics?.number || undefined}>{diagnostics?.number || "Not set"}</dd>
          </div>
          <div>
            <dt>Receive</dt>
            <dd title={receiveLabel}>{receiveLabel}</dd>
          </div>
          <div>
            <dt>signal-cli</dt>
            <dd>
              {diagnostics?.signal_cli_usable ? diagnostics.signal_cli_version || "ok" : "broken"}
            </dd>
          </div>
          <div>
            <dt>AI</dt>
            <dd>
              {ai?.configured
                ? ai.ollama_reachable
                  ? ai.ollama_model || "ollama"
                  : "unreachable"
                : "off"}
            </dd>
          </div>
        </dl>
        {diagnostics?.signal_cli_last_error && (
          <p className="hint tight warn-text">{diagnostics.signal_cli_last_error}</p>
        )}
        <details className="settings-details">
          <summary>Paths &amp; diagnostics</summary>
          <dl className="diag-list">
            <div>
              <dt>Config</dt>
              <dd>{diagnostics?.config_path || "—"}</dd>
            </div>
            <div>
              <dt>Env file</dt>
              <dd>{diagnostics?.env_path || "—"}</dd>
            </div>
            <div>
              <dt>signal-cli bin</dt>
              <dd>{diagnostics?.signal_cli_path || "—"}</dd>
            </div>
            <div>
              <dt>App data</dt>
              <dd>{diagnostics?.app_data_dir || "—"}</dd>
            </div>
          </dl>
        </details>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <h3>Device link</h3>
          <span className={`status-pill status-${linkTone(linkBusy, linkStatus)}`}>
            {linkText(linkBusy, linkStatus)}
          </span>
        </div>
        <p className="hint tight">
          Link this Mac to your Signal phone. After it says Linked, add the number to the roster
          with a PIN — do not relaunch to switch identities.
        </p>
        <div className="row-actions">
          <button
            type="button"
            className="action-btn primary"
            disabled={linkBusy || !diagnostics?.signal_cli_usable}
            onClick={onStartLink}
          >
            Start linking
          </button>
          <button type="button" className="ghost-btn" disabled={!linkBusy} onClick={onCancelLink}>
            Cancel
          </button>
        </div>
        {linkUri && (
          <div className="device-link-panel">
            <DeviceLinkQr uri={linkUri} />
            <div className="device-link-uri">
              <code className="device-link-uri-text" title={linkUri}>
                {linkUri}
              </code>
              <button type="button" className="action-btn" onClick={onCopyLinkUri}>
                {linkCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
        {linkStatus?.message && (
          <p className={`hint tight ${linkStatus.state === "error" ? "warn-text" : ""}`}>
            {linkStatus.message}
          </p>
        )}
        {!diagnostics?.config_path && (
          <p className="hint tight warn-text">
            Set <code>SIGNALX_SIGNALCLI_CONFIG</code> in <code>.signalx.env</code> before linking.
          </p>
        )}
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <h3>Roster</h3>
        </div>
        <p className="hint tight">
          Each number is a separate shop (catalog, orders, IVR). Only one session is live. Switching
          stops receive and the outbox for the previous number.
        </p>
        <ul className="roster-list">
          {(session?.accounts ?? []).map((a) => (
            <li key={a.id} className={a.is_active ? "roster-row active" : "roster-row"}>
              <div>
                <strong>{a.label || a.e164}</strong>
                <span className="hint tight">
                  {" "}
                  ••••{a.last4}
                  {a.has_pin ? " · PIN" : " · no PIN"}
                  {a.is_active ? " · live" : ""}
                </span>
              </div>
              {a.is_active && (
                <form
                  className="roster-pin-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onSetPin(a.id, pinCurrent, pinNew).then((ok) => {
                      if (!ok) return;
                      setPinCurrent("");
                      setPinNew("");
                    });
                  }}
                >
                  <input
                    type="password"
                    placeholder="Current PIN (blank if none)"
                    value={pinCurrent}
                    onChange={(e) => setPinCurrent(e.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="New PIN"
                    value={pinNew}
                    onChange={(e) => setPinNew(e.target.value)}
                    required
                  />
                  <button type="submit" className="ghost-btn">
                    Set PIN
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {(session?.linked_unseen ?? []).length > 0 && (
          <p className="hint tight">
            Linked in signal-cli but not in roster: {session?.linked_unseen.join(", ")}. Add below.
          </p>
        )}
        <form
          className="roster-add"
          onSubmit={(e) => {
            e.preventDefault();
            onAddAccount();
          }}
        >
          <input
            placeholder="+15551234567"
            value={addNumber}
            onChange={(e) => onAddNumberChange(e.target.value)}
            required
          />
          <input
            placeholder="Label (optional)"
            value={addLabel}
            onChange={(e) => onAddLabelChange(e.target.value)}
          />
          <input
            type="password"
            placeholder="PIN (4+ chars)"
            value={addPin}
            onChange={(e) => onAddPinChange(e.target.value)}
            required
          />
          <button type="submit" className="action-btn primary" disabled={rosterBusy}>
            Add to roster
          </button>
        </form>
      </div>
    </>
  );
}
