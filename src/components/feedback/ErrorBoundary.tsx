import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '../primitives';
import './ErrorBoundary.css';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'page' | 'section' | 'component';
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId?: string;
}

/**
 * Comprehensive Error Boundary Component
 * 
 * Provides error isolation and recovery for React components.
 * Supports multiple levels of error boundaries (page, section, component).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorId: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to error tracking service (if available)
    if (typeof window !== 'undefined' && (window as any).__errorTracker) {
      (window as any).__errorTracker.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
        tags: {
          errorBoundary: true,
          level: this.props.level || 'component',
        },
      });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { level = 'component', showDetails = true } = this.props;
      const { error, errorInfo, errorId } = this.state;

      return (
        <div
          className={`sx-error-boundary sx-error-boundary--${level}`}
          role="alert"
          aria-live="assertive"
        >
          <div className="sx-error-boundary__content">
            <div className="sx-error-boundary__icon" aria-hidden="true">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h3 className="sx-error-boundary__title">
              {level === 'page' ? 'Application Error' : 'Something went wrong'}
            </h3>

            <p className="sx-error-boundary__message">
              {error?.message || 'An unexpected error occurred'}
            </p>

            {showDetails && errorInfo && (
              <details className="sx-error-boundary__details">
                <summary className="sx-error-boundary__details-summary">
                  Technical Details
                </summary>
                <div className="sx-error-boundary__details-content">
                  <div className="sx-error-boundary__error-id">
                    Error ID: <code>{errorId}</code>
                  </div>
                  <pre className="sx-error-boundary__stack">
                    {error?.toString()}
                    {'\n\n'}
                    {errorInfo.componentStack}
                  </pre>
                </div>
              </details>
            )}

            <div className="sx-error-boundary__actions">
              <Button variant="primary" onClick={this.handleReset}>
                Try Again
              </Button>
              {level === 'page' && (
                <Button variant="secondary" onClick={this.handleReload}>
                  Reload Page
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
