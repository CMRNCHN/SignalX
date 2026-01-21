import { useState, useCallback } from 'react';
import { Toast, ToastType } from '../components/Toast';

let toastIdCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = 5000) => {
      const id = `toast-${++toastIdCounter}`;
      const toast: Toast = { id, message, type, duration };

      setToasts(prev => [...prev, toast]);

      return id;
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showError = useCallback(
    (message: string, duration?: number) => {
      return showToast(message, 'error', duration || 7000);
    },
    [showToast]
  );

  const showSuccess = useCallback(
    (message: string, duration?: number) => {
      return showToast(message, 'success', duration || 3000);
    },
    [showToast]
  );

  const showInfo = useCallback(
    (message: string, duration?: number) => {
      return showToast(message, 'info', duration);
    },
    [showToast]
  );

  const showWarning = useCallback(
    (message: string, duration?: number) => {
      return showToast(message, 'warning', duration || 5000);
    },
    [showToast]
  );

  return {
    toasts,
    showToast,
    dismissToast,
    showError,
    showSuccess,
    showInfo,
    showWarning,
  };
}
