/**
 * FeatureHint Component
 * 
 * Contextual tooltips that appear to highlight features
 * Auto-dismiss after being shown once
 */

import { useEffect, useState } from 'react';
import { useOnboarding } from '../hooks/useOnboarding';
import './FeatureHint.css';

export interface FeatureHintProps {
  id: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  children: React.ReactNode;
}

export function FeatureHint({
  id,
  title,
  description,
  position = 'bottom',
  delay = 1000,
  children,
}: FeatureHintProps) {
  const { hasSeenHint, dismissHint, hintsEnabled, hasCompleted } = useOnboarding();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show if:
    // 1. Hints are enabled
    // 2. User has completed onboarding (or skipped)
    // 3. Haven't seen this hint before
    if (hintsEnabled && hasCompleted && !hasSeenHint(id)) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [id, delay, hasSeenHint, hintsEnabled, hasCompleted]);

  const handleDismiss = () => {
    setIsVisible(false);
    dismissHint(id);
  };

  return (
    <div className="feature-hint-container">
      {children}
      {isVisible && (
        <div className={`feature-hint feature-hint-${position}`}>
          <div className="feature-hint-content">
            <div className="feature-hint-header">
              <span className="feature-hint-title">{title}</span>
              <button
                className="feature-hint-close"
                onClick={handleDismiss}
                aria-label="Dismiss hint"
              >
                ×
              </button>
            </div>
            <p className="feature-hint-description">{description}</p>
            <button
              className="feature-hint-got-it"
              onClick={handleDismiss}
            >
              Got it!
            </button>
          </div>
          <div className={`feature-hint-arrow feature-hint-arrow-${position}`} />
        </div>
      )}
    </div>
  );
}
