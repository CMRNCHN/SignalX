/**
 * MessageSendingIndicator Component
 * 
 * Shows inline sending status for individual messages
 * Displays loading spinner, success checkmark, or error state
 */

import { useState, useEffect } from 'react';
import { Spinner } from './primitives';
import './MessageSendingIndicator.css';

export type MessageSendingState = 'idle' | 'queued' | 'sending' | 'sent' | 'failed' | 'retrying';

interface MessageSendingIndicatorProps {
  state: MessageSendingState;
  error?: string;
  retryCount?: number;
  maxRetries?: number;
  onRetry?: () => void;
}

export function MessageSendingIndicator({
  state,
  error,
  retryCount = 0,
  maxRetries = 10,
  onRetry,
}: MessageSendingIndicatorProps) {
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (state === 'sent') {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  if (state === 'idle') return null;

  if (state === 'queued') {
    return (
      <div className="message-sending-indicator queued" title="Message queued">
        <span className="indicator-icon">⏱</span>
        <span className="indicator-text">Queued</span>
      </div>
    );
  }

  if (state === 'sending') {
    return (
      <div className="message-sending-indicator sending" title="Sending message...">
        <Spinner size="small" />
        <span className="indicator-text">Sending...</span>
      </div>
    );
  }

  if (state === 'sent' && showSuccess) {
    return (
      <div className="message-sending-indicator sent" title="Message sent">
        <span className="indicator-icon success">✓</span>
        <span className="indicator-text">Sent</span>
      </div>
    );
  }

  if (state === 'retrying') {
    return (
      <div className="message-sending-indicator retrying" title={`Retrying... (attempt ${retryCount}/${maxRetries})`}>
        <span className="indicator-icon">🔄</span>
        <span className="indicator-text">
          Retrying ({retryCount}/{maxRetries})
        </span>
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <div className="message-sending-indicator failed" title={error || 'Failed to send'}>
        <span className="indicator-icon error">✗</span>
        <span className="indicator-text">
          Failed {error && `: ${error.substring(0, 50)}${error.length > 50 ? '...' : ''}`}
        </span>
        {onRetry && retryCount < maxRetries && (
          <button
            className="retry-button"
            onClick={onRetry}
            title="Retry sending"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return null;
}
