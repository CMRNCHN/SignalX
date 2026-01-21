import React, { useEffect } from "react";
import { ErrorMessage } from "./ErrorMessage";
import { Button } from "./primitives";
import "./Toast.css";

export type ToastType = "error" | "success" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

export const ToastComponent: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(toast.id);
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onDismiss]);

  const handleDismiss = () => {
    onDismiss(toast.id);
  };

  if (toast.type === "error") {
    return <ErrorMessage error={toast.message} onDismiss={handleDismiss} variant="toast" />;
  }

  const typeClass = `toast-${toast.type}`;
  const icon = {
    success: "✓",
    info: "ℹ️",
    warning: "⚠️",
    error: "⚠️",
  }[toast.type];

  return (
    <div className={`toast ${typeClass}`} role="alert">
      <div className="toast-content">
        <span className="toast-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="toast-message">{toast.message}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="toast-dismiss"
          aria-label="Dismiss notification"
        >
          ×
        </Button>
      </div>
    </div>
  );
};

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <ToastComponent key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export default ToastContainer;
