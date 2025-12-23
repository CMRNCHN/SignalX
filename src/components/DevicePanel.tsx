import React from 'react';
import './DevicePanel.css';

interface DevicePanelProps {
  accounts: string;
  accountsError?: string;
}

const DevicePanel: React.FC<DevicePanelProps> = ({ accounts, accountsError }) => {
  // Parse accounts if available
  const parseAccounts = (accountsStr: string) => {
    if (!accountsStr || accountsStr === "(no accounts)") return [];
    
    return accountsStr
      .split('\n')
      .filter(line => line.trim())
      .map((line, idx) => {
        const trimmed = line.trim();
        return {
          id: idx + 1,
          name: trimmed,
          status: 'Active' as const,
        };
      });
  };

  const sessions = accountsError 
    ? [{ id: 1, name: 'Error loading accounts', status: 'Offline' as const }]
    : parseAccounts(accounts);

  return (
    <div className="device-panel panel device-panel">
      <h2>Signal Accounts</h2>
      {accountsError ? (
        <div style={{ color: '#FFB1A8', fontSize: '0.85rem', padding: '8px' }}>
          {accountsError}
        </div>
      ) : sessions.length === 0 ? (
        <div style={{ color: '#8D94A1', fontSize: '0.85rem', padding: '8px' }}>
          No Signal accounts linked. Use signal-cli to link a device.
        </div>
      ) : (
        <ul className="sessions-list">
          {sessions.map(sess => (
            <li key={sess.id} className="session-row">
              <span className="session-name">{sess.name}</span>
              <span className={`session-status status-${sess.status.toLowerCase()}`}>{sess.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default DevicePanel;