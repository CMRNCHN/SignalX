// Central export for all accessibility features in SignalX

// Components
export { default as SkipLink } from '../components/SkipLink';
export { default as AccessibleModal } from '../components/AccessibleModal';
export { default as AccessibleTabs } from '../components/AccessibleTabs';
export type { Tab } from '../components/AccessibleTabs';
export { default as Toast } from '../components/Toast';
export { default as ErrorBoundary } from '../components/ErrorBoundary';

// Accessibility utilities
export {
  generateId,
  getCollapsibleAriaProps,
  getButtonAriaProps,
  getFieldAriaProps,
  SKIP_LINK_TARGETS,
  srOnlyStyles,
  focusVisibleStyles,
  prefersHighContrast,
  prefersReducedMotion,
} from './accessibility';

// Keyboard utilities
export {
  Keys,
  isFocusable,
  getFocusableElements,
  focusFirstElement,
  focusLastElement,
  handleArrowNavigation,
  RovingTabIndexManager,
  createKeyboardShortcut,
  trapFocus,
  isActivationKey,
  handleClickWithKeyboard,
} from './keyboard';

// Live region announcements
export {
  LiveRegionAnnouncer,
  getAnnouncer,
  announce,
  announceAssertive,
  clearAnnouncements,
  announcements,
  useLiveAnnouncer,
} from './announcer';

// Re-export types
export type { default as React } from 'react';

