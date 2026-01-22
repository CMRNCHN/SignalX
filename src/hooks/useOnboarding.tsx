/**
 * Onboarding System Hook
 * 
 * Manages multi-step onboarding tour and contextual hints
 * Persists state to localStorage
 */

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { logWithScope } from '../utils/logger';

const logFn = logWithScope('useOnboarding');
const log = {
  info: (msg: string, meta?: Record<string, unknown>) => logFn('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => logFn('warn', msg, meta),
  error: (msg: string, meta?: unknown) => logFn('error', msg, typeof meta === 'object' ? meta as Record<string, unknown> : { error: meta }),
  debug: (msg: string, meta?: Record<string, unknown>) => logFn('debug', msg, meta),
};

export type OnboardingStep = 
  | 'welcome'           // Initial welcome screen
  | 'account-select'    // Account selection (existing)
  | 'feature-tour'      // Feature overview
  | 'outbox-intro'      // OutboxStatus introduction
  | 'message-status'    // Message sending explained
  | 'retry-system'      // Retry logic showcase
  | 'first-message'     // Guided first message
  | 'complete';         // Tour complete

export interface OnboardingState {
  // Tour state
  isActive: boolean;
  currentStep: OnboardingStep;
  hasCompleted: boolean;
  hasSkipped: boolean;
  
  // Feature hints
  hintsEnabled: boolean;
  shownHints: Set<string>;
  
  // Actions
  startTour: () => void;
  skipTour: () => void;
  nextStep: () => void;
  previousStep: () => void;
  goToStep: (step: OnboardingStep) => void;
  completeTour: () => void;
  
  // Hints
  showHint: (hintId: string) => void;
  dismissHint: (hintId: string) => void;
  hasSeenHint: (hintId: string) => boolean;
  resetHints: () => void;
}

const STORAGE_KEY = 'signalx-onboarding';
const HINTS_KEY = 'signalx-hints';

const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'account-select',
  'feature-tour',
  'outbox-intro',
  'message-status',
  'retry-system',
  'first-message',
  'complete',
];

function loadState(): { completed: boolean; skipped: boolean } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { completed: false, skipped: false };
    return JSON.parse(stored);
  } catch (e) {
    log.error('Failed to load onboarding state', e);
    return { completed: false, skipped: false };
  }
}

function saveState(completed: boolean, skipped: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed, skipped }));
  } catch (e) {
    log.error('Failed to save onboarding state', e);
  }
}

function loadHints(): Set<string> {
  try {
    const stored = localStorage.getItem(HINTS_KEY);
    if (!stored) return new Set();
    return new Set(JSON.parse(stored));
  } catch (e) {
    log.error('Failed to load hints', e);
    return new Set();
  }
}

function saveHints(hints: Set<string>) {
  try {
    localStorage.setItem(HINTS_KEY, JSON.stringify(Array.from(hints)));
  } catch (e) {
    log.error('Failed to save hints', e);
  }
}

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [hasCompleted, setHasCompleted] = useState(false);
  const [hasSkipped, setHasSkipped] = useState(false);
  const [hintsEnabled, setHintsEnabled] = useState(true);
  const [shownHints, setShownHints] = useState<Set<string>>(new Set());

  // Load state on mount
  useEffect(() => {
    const { completed, skipped } = loadState();
    setHasCompleted(completed);
    setHasSkipped(skipped);
    setShownHints(loadHints());

    // Auto-start tour if not completed or skipped
    if (!completed && !skipped) {
      setIsActive(true);
      log.info('Starting onboarding tour');
    }
  }, []);

  const startTour = () => {
    log.info('Starting onboarding tour');
    setIsActive(true);
    setCurrentStep('welcome');
    setHasSkipped(false);
  };

  const skipTour = () => {
    log.info('Skipping onboarding tour');
    setIsActive(false);
    setHasSkipped(true);
    saveState(false, true);
  };

  const nextStep = () => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      const nextStep = STEP_ORDER[currentIndex + 1];
      log.info('Moving to next step', nextStep);
      setCurrentStep(nextStep);
    } else {
      completeTour();
    }
  };

  const previousStep = () => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex > 0) {
      const prevStep = STEP_ORDER[currentIndex - 1];
      log.info('Moving to previous step', prevStep);
      setCurrentStep(prevStep);
    }
  };

  const goToStep = (step: OnboardingStep) => {
    log.info('Going to step', step);
    setCurrentStep(step);
  };

  const completeTour = () => {
    log.info('Completing onboarding tour');
    setIsActive(false);
    setHasCompleted(true);
    setCurrentStep('complete');
    saveState(true, false);
  };

  const showHint = (hintId: string) => {
    if (!shownHints.has(hintId)) {
      const newHints = new Set(shownHints);
      newHints.add(hintId);
      setShownHints(newHints);
      saveHints(newHints);
      log.info('Showing hint', hintId);
    }
  };

  const dismissHint = (hintId: string) => {
    if (!shownHints.has(hintId)) {
      const newHints = new Set(shownHints);
      newHints.add(hintId);
      setShownHints(newHints);
      saveHints(newHints);
      log.info('Dismissing hint', hintId);
    }
  };

  const hasSeenHint = (hintId: string) => {
    return shownHints.has(hintId);
  };

  const resetHints = () => {
    log.info('Resetting all hints');
    setShownHints(new Set());
    saveHints(new Set());
  };

  const value: OnboardingState = {
    isActive,
    currentStep,
    hasCompleted,
    hasSkipped,
    hintsEnabled,
    shownHints,
    startTour,
    skipTour,
    nextStep,
    previousStep,
    goToStep,
    completeTour,
    showHint,
    dismissHint,
    hasSeenHint,
    resetHints,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingState {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}
