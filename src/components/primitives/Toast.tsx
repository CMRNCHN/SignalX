import React, { useEffect } from 'react';
import './Toast.css';
import { Button } from './Button';

export interface ToastProps {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({
  id,
  message,
  type = 'info',
  duration = 5000,
  onDismiss,
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [id, duration, onDismiss]);

  return (
    <div
      className={`sx-toast sx-toast--${type}`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="sx-toast__content">
        <span className="sx-toast__message">{message}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDismiss(id)}
          className="sx-toast__close"
          aria-label="Dismiss"
        >
          ×
        </Button>
      </div>
    </div>
  );
};

export default Toast;
