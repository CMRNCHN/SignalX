// Central export for all accessibility features in SignalX

// Components
export { default as SkipLink } from '../components/SkipLink';
export { default as AccessibleModal } from '../components/AccessibleModal';
export { default as AccessibleTabs } from '../components/AccessibleTabs';
export type { Tab } from '../components/AccessibleTabs';
export { default as Toast } from '../components/Toast';
export { default as ErrorBoundary } from '../components/ErrorBoundary';

// Form Components
export {
  FormField,
  TextInput,
  TextArea,
  Checkbox,
  RadioGroup,
  Select,
} from '../components/AccessibleForm';

// Additional Components
export { AccessibleMenu, type MenuItem } from '../components/AccessibleMenu';
export { Tooltip } from '../components/AccessibleTooltip';
export { Accordion, type AccordionItem } from '../components/AccessibleAccordion';

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

// Accessibility Hooks
export {
  useAnnounceOnMount,
  useAnnounceLoading,
  useAnnounceCount,
  useFocusOnCondition,
  useFocusTrap,
  useRovingTabIndex,
  useEscapeKey,
  useAnnounceNavigation,
  useFocusError,
  useAnnounceListChanges,
} from './a11yHooks';

// Keyboard Shortcuts Manager
export {
  getShortcutsManager,
  registerShortcut,
  unregisterShortcut,
  useKeyboardShortcut,
  useShortcutsManager,
  registerDefaultShortcuts,
  KeyboardShortcutsHelp,
  type KeyboardShortcut,
} from './keyboardShortcuts';

// Accessibility Testing (development only)
export {
  checkA11y,
  logA11yIssues,
  testKeyboardNav,
  checkContrast,
  enableA11yChecking,
  generateA11yReport,
  type A11yIssue,
} from './a11yTesting';

