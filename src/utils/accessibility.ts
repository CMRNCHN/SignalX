// Accessibility utilities for SignalX

/**
 * Generate a unique ID for ARIA relationships
 */
export const generateId = (prefix = 'sx') => `${prefix}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Common ARIA attributes for collapsible sections
 */
export const getCollapsibleAriaProps = (isOpen: boolean, contentId?: string) => ({
  'aria-expanded': isOpen,
  'aria-controls': contentId,
});

/**
 * Common ARIA attributes for buttons
 */
export const getButtonAriaProps = (label?: string, description?: string) => ({
  ...(label && { 'aria-label': label }),
  ...(description && { 'aria-describedby': description }),
});

/**
 * Common ARIA attributes for form fields
 */
export const getFieldAriaProps = (labelId?: string, errorId?: string, describedBy?: string[]) => {
  const describedByIds = [
    ...(labelId ? [labelId] : []),
    ...(errorId ? [errorId] : []),
    ...(describedBy || []),
  ];

  return {
    ...(labelId && { 'aria-labelledby': labelId }),
    ...(describedByIds.length > 0 && { 'aria-describedby': describedByIds.join(' ') }),
    ...(errorId && { 'aria-invalid': true }),
  };
};

/**
 * Skip link component props
 */
export const SKIP_LINK_TARGETS = {
  MAIN_CONTENT: 'main-content',
  NAVIGATION: 'navigation',
} as const;

/**
 * Screen reader only text styles
 */
export const srOnlyStyles: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * Focus visible styles for better keyboard navigation
 */
export const focusVisibleStyles = {
  outline: '2px solid #3b82f6',
  outlineOffset: '2px',
};

/**
 * High contrast mode detection
 */
export const prefersHighContrast = () => window.matchMedia('(prefers-contrast: high)').matches;

/**
 * Reduced motion detection
 */
export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
