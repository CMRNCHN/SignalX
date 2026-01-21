import React from 'react';
import { getUserFriendlyMessage } from '../utils/errorHandler';
import './ErrorMessage.css';

interface ErrorMessageProps {
  error: unknown;
  onDismiss?: () => void;
  variant?: 'inline' | 'toast' | 'banner';
  className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  error,
  onDismiss,
  variant = 'inline',
  className = '',
}) => {
  const message = getUserFriendlyMessage(error);
  const variantClass = `error-${variant}`;

  if (variant === 'toast') {
    return (
      <div className={`error-toast ${className}`} role="alert">
        <div className="error-toast-content">
          <span className="error-icon" aria-hidden="true">⚠️</span>
          <span className="error-text">{message}</span>
          {onDismiss && (
            <button
              className="error-dismiss"
              onClick={onDismiss}
              aria-label="Dismiss error"
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'banner') {
    return (
      <div className={`error-banner ${className}`} role="alert">
        <span className="error-icon" aria-hidden="true">⚠️</span>
        <span className="error-text">{message}</span>
        {onDismiss && (
          <button
            className="error-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss error"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`error-inline ${className}`} role="alert">
      <span className="error-icon" aria-hidden="true">⚠️</span>
      <span className="error-text">{message}</span>
    </div>
  );
};

export default ErrorMessage;
















