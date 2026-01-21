/**
 * OutboxStatus Component
 * 
 * Displays real-time outbox statistics and status
 * Shows queued, sending, sent, and failed message counts
 */

import { useState } from 'react';
import { useOutboxEvents } from '../hooks/useBackendEvents';
import './OutboxStatus.css';

interface OutboxStatusProps {
  show?: boolean;
}

export function OutboxStatus({ show = true }: OutboxStatusProps) {
  const [stats, setStats] = useState({
    queued: 0,
    sending: 0,
    sent: 0,
    failed: 0,
  });
  
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<number>(0);

  useOutboxEvents({
    onStatsUpdated: (event) => {
      setStats({
        queued: Number(event.queued),
        sending: Number(event.sending),
        sent: Number(event.sent),
        failed: Number(event.failed),
      });
    },
    onMessageSent: (event) => {
      setLastSent(`Message sent to ${event.recipient}`);
      setLastError(null);
      setTimeout(() => setLastSent(null), 3000);
    },
    onSendFailed: (event) => {
      setLastError(`Failed: ${event.error} (attempt ${event.retry_count}/${event.max_retries})`);
      setTimeout(() => setLastError(null), 5000);
    },
    onRetryScheduled: (event) => {
      setRetrying(event.retry_count);
      setTimeout(() => setRetrying(0), 3000);
    },
    onMovedToDLQ: (event) => {
      setLastError(`Message failed permanently: ${event.reason}`);
      // Don't auto-clear DLQ errors
    },
  });

  if (!show) return null;

  const hasActivity = stats.queued > 0 || stats.sending > 0 || stats.failed > 0 || retrying > 0;

  return (
    <div className={`outbox-status ${hasActivity ? 'active' : ''}`}>
      {/* Success message */}
      {lastSent && (
        <div className="outbox-status-message success">
          ✓ {lastSent}
        </div>
      )}

      {/* Error message */}
      {lastError && (
        <div className="outbox-status-message error">
          ✗ {lastError}
        </div>
      )}

      {/* Stats bar */}
      {hasActivity && (
        <div className="outbox-stats-bar">
          {stats.sending > 0 && (
            <div className="outbox-stat sending">
              <span className="spinner">⟳</span> Sending: {stats.sending}
            </div>
          )}
          {stats.queued > 0 && (
            <div className="outbox-stat queued">
              ⏱ Queued: {stats.queued}
            </div>
          )}
          {stats.failed > 0 && (
            <div className="outbox-stat failed">
              ⚠ Failed: {stats.failed}
            </div>
          )}
          {retrying > 0 && (
            <div className="outbox-stat retrying">
              🔄 Retrying... (attempt {retrying})
            </div>
          )}
        </div>
      )}
    </div>
  );
}
