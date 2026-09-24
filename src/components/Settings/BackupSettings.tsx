type ImportMode = "replace" | "merge";

type Props = {
  password: string;
  onPasswordChange: (value: string) => void;
  busy: boolean;
  /** An import landed; writes are locked until the app restarts. */
  restartRequired: boolean;
  importMode: ImportMode;
  onImportModeChange: (mode: ImportMode) => void;
  onExportBundle: () => void;
  onExportChatOnly: () => void;
  onImportFile: (file: File | null) => void;
  onQuitForRestart: () => void;
};

/** Backup tab: export/import data bundles and the post-import restart gate. */
export function BackupSettings({
  password,
  onPasswordChange,
  busy,
  restartRequired,
  importMode,
  onImportModeChange,
  onExportBundle,
  onExportChatOnly,
  onImportFile,
  onQuitForRestart,
}: Props) {
  return (
    <>
      <div className="settings-card">
        <div className="settings-card-head">
          <h3>Backup &amp; migrate</h3>
        </div>
        <p className="hint tight">
          Bundles cover your catalog, customers, orders, buyer menu, chats, and outbox — not your
          Signal login. Re-link Signal on a new computer. Leave the password blank for an
          unencrypted zip.
        </p>
        <label className="field-stack">
          <span className="field-label">Optional password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Blank = unencrypted"
            disabled={busy || restartRequired}
          />
        </label>
        <div className="backup-actions">
          <button
            type="button"
            className="action-btn primary"
            disabled={busy || restartRequired}
            onClick={onExportBundle}
          >
            {busy ? "Working…" : "Export data bundle"}
          </button>
          <button type="button" className="ghost-btn" disabled={busy} onClick={onExportChatOnly}>
            Export chat only
          </button>
        </div>
        <div className="backup-import">
          <div className="profile-section-title">Import</div>
          <div className="profile-toggles">
            {(["replace", "merge"] as const).map((mode) => (
              <label key={mode} className="toggle compact">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === mode}
                  disabled={restartRequired}
                  onChange={() => onImportModeChange(mode)}
                />
                {mode === "replace" ? "Replace" : "Merge"}
              </label>
            ))}
          </div>
          <label className="field-stack">
            <span className="field-label">Choose .zip bundle</span>
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={busy || restartRequired}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                onImportFile(f);
              }}
            />
          </label>
        </div>
        {restartRequired && (
          <div className="restart-gate">
            <p>
              Restart SignalX to apply imported data. Writes stay locked until you quit and reopen.
            </p>
            <button type="button" className="action-btn primary" onClick={onQuitForRestart}>
              Quit now
            </button>
          </div>
        )}
      </div>
      <div className="settings-card">
        <div className="settings-card-head">
          <h3>What’s in a bundle</h3>
        </div>
        <p className="hint tight">
          Catalog, people records, orders, buyer menu, chats, and outbox. Signal login stays on the
          device — re-link after you move.
        </p>
      </div>
    </>
  );
}
