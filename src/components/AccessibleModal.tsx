import React, { useEffect, useRef, ReactNode } from 'react';
import { prefersReducedMotion } from '../utils/accessibility';

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

const AccessibleModal: React.FC<AccessibleModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  size = 'medium',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).substr(2, 9)}`);

  // Trap focus within modal
  const trapFocus = (e: KeyboardEvent) => {
    if (!modalRef.current || e.key !== 'Tab') return;

    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement?.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement?.focus();
    }
  };

  // Handle escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Store currently focused element
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Focus modal after a brief delay to ensure it's rendered
      setTimeout(() => {
        const modalElement = modalRef.current;
        if (modalElement) {
          // Try to focus close button first, or modal itself
          const closeButton = modalElement.querySelector<HTMLElement>('[aria-label="Close"]');
          if (closeButton) {
            closeButton.focus();
          } else {
            modalElement.focus();
          }
        }
      }, 100);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Add event listeners
      document.addEventListener('keydown', trapFocus);
      document.addEventListener('keydown', handleEscape);

      return () => {
        // Restore body scroll
        document.body.style.overflow = '';

        // Remove event listeners
        document.removeEventListener('keydown', trapFocus);
        document.removeEventListener('keydown', handleEscape);

        // Restore focus to previously focused element
        if (previousActiveElement.current) {
          previousActiveElement.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeStyles = {
    small: { maxWidth: '400px' },
    medium: { maxWidth: '600px' },
    large: { maxWidth: '900px' },
  };

  const reducedMotion = prefersReducedMotion();

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: reducedMotion ? 'none' : 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        // Close when clicking backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        tabIndex={-1}
        className={`modal-content ${className}`}
        style={{
          backgroundColor: '#1A1C1F',
          borderRadius: '12px',
          padding: '24px',
          width: '90%',
          ...sizeStyles[size],
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          animation: reducedMotion ? 'none' : 'slideUp 0.3s ease-out',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h2
            id={titleId.current}
            style={{
              margin: 0,
              fontSize: '1.5rem',
              color: '#E0E0E0',
              fontWeight: 600,
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: '#E0E0E0',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ color: '#E0E0E0' }}>{children}</div>

        {/* Animations */}
        <style>{`
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes slideUp {
            from {
              transform: translateY(20px);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }

          .modal-content:focus {
            outline: 2px solid #3b82f6;
            outline-offset: 2px;
          }

          @media (prefers-reduced-motion: reduce) {
            .modal-overlay,
            .modal-content {
              animation: none !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default AccessibleModal;

