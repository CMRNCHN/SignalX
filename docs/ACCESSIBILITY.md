# SignalX Accessibility Features

Comprehensive accessibility documentation for SignalX, following WCAG 2.1 AA standards and best practices.

## Quick Start

Get started with SignalX accessibility features in 5 minutes.

### 1. Import What You Need

```tsx
// Single import for all accessibility features
import {
  // Components
  SkipLink,
  AccessibleModal,
  AccessibleTabs,
  Toast,
  ErrorBoundary,
  
  // Utilities
  announce,
  announceAssertive,
  generateId,
  srOnlyStyles,
  Keys,
  
  // Hooks
} from './utils/a11y';

// Or import from specific modules
import { useAnnounceLoading, useAnnounceCount } from './utils/a11yHooks';
```

### 2. Use Skip Links

```tsx
<SkipLink href="#main-content">Skip to main content</SkipLink>
<main id="main-content">
  {/* Your main content */}
</main>
```

### 3. Use Accessible Components

```tsx
<AccessibleModal open={isOpen} onClose={handleClose}>
  <h2>Modal Title</h2>
  <p>Modal content</p>
</AccessibleModal>
```

## Table of Contents

- [Quick Start](#quick-start)
- [Overview](#overview)
- [Components](#components)
- [Utilities](#utilities)
- [Testing](#testing)
- [Best Practices](#best-practices)
- [Migration Guide](#migration-guide)

## Overview

SignalX includes a complete suite of accessible components and utilities designed to make the application usable by everyone, including:

- **Keyboard Navigation**: Full keyboard support for all interactive elements
- **Screen Reader Support**: Semantic HTML, ARIA attributes, and live region announcements
- **Focus Management**: Visible focus indicators and focus trapping where appropriate
- **Motion Preferences**: Respects `prefers-reduced-motion` settings
- **High Contrast**: Compatible with high contrast modes

## Components

### SkipLink

Allows keyboard users to skip navigation and jump directly to main content.

**Usage:**

```tsx
import SkipLink from './components/SkipLink';

<SkipLink href="#main-content">Skip to main content</SkipLink>
<SkipLink href="#navigation">Skip to navigation</SkipLink>

// Don't forget to add corresponding IDs to your content
<main id="main-content">
  {/* Your main content */}
</main>
```

**Features:**
- Hidden until focused
- Smooth transition into view
- Customizable href and className

---

### AccessibleModal

A fully accessible modal dialog with focus trapping and keyboard support.

**Usage:**

```tsx
import AccessibleModal from './components/AccessibleModal';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title="My Modal Title"
      size="medium" // 'small' | 'medium' | 'large'
    >
      <p>Modal content goes here</p>
      <button onClick={() => setIsOpen(false)}>Close</button>
    </AccessibleModal>
  );
}
```

**Features:**
- Focus trap: Tab cycling stays within modal
- Escape key closes modal
- Click backdrop to close
- Prevents body scroll when open
- Restores focus to trigger element on close
- Respects `prefers-reduced-motion`
- Proper ARIA attributes (role, aria-modal, aria-labelledby)

**Keyboard Support:**
- `Escape`: Close modal
- `Tab`: Navigate forward through focusable elements (wraps around)
- `Shift + Tab`: Navigate backward through focusable elements (wraps around)

---

### AccessibleTabs

Fully accessible tab component following WAI-ARIA Tabs Pattern.

**Usage:**

```tsx
import AccessibleTabs, { Tab } from './components/AccessibleTabs';

const tabs: Tab[] = [
  { id: 'tab1', label: 'Overview', content: <Overview /> },
  { id: 'tab2', label: 'Settings', content: <Settings /> },
  { id: 'tab3', label: 'Help', content: <Help />, disabled: true },
];

function MyComponent() {
  return (
    <AccessibleTabs
      tabs={tabs}
      defaultActiveTab="tab1"
      orientation="horizontal" // or 'vertical'
      onChange={(tabId) => console.log('Active tab:', tabId)}
    />
  );
}
```

**Features:**
- Automatic focus management
- Roving tabindex (only active tab is in tab order)
- Disabled tabs support
- Horizontal and vertical orientations
- Proper ARIA attributes (role, aria-selected, aria-controls, etc.)

**Keyboard Support:**
- **Horizontal orientation:**
  - `Arrow Right`: Move to next tab
  - `Arrow Left`: Move to previous tab
- **Vertical orientation:**
  - `Arrow Down`: Move to next tab
  - `Arrow Up`: Move to previous tab
- **Both orientations:**
  - `Home`: Move to first tab
  - `End`: Move to last tab
  - `Tab`: Move focus to active tab panel

---

### Toast

Accessible notification toast with auto-dismiss and ARIA live regions.

**Usage:**

```tsx
import Toast from './components/Toast';

function MyComponent() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  return (
    <>
      <button onClick={() => setToast({ message: 'Success!', type: 'success' })}>
        Show Toast
      </button>
      
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={3000}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
```

**Features:**
- ARIA live region for screen reader announcements
- Auto-dismiss after duration
- Manual close button
- Three types: success, error, info
- Respects `prefers-reduced-motion`

---

### ErrorBoundary

Catches React errors and displays accessible error UI.

**Usage:**

```tsx
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary
      fallback={<CustomErrorUI />} // Optional custom fallback
      onError={(error, errorInfo) => {
        // Optional error logging
        console.error('Error caught:', error, errorInfo);
      }}
    >
      <MyApp />
    </ErrorBoundary>
  );
}
```

**Features:**
- ARIA alert role for error announcements
- Expandable error details
- Reset/retry functionality
- Custom fallback UI support

---

## Utilities

### Accessibility Utilities (`utils/accessibility.ts`)

**Generate IDs:**
```tsx
import { generateId } from './utils/accessibility';

const id = generateId('my-component'); // 'my-component-abc123def'
```

**Collapsible ARIA Props:**
```tsx
import { getCollapsibleAriaProps } from './utils/accessibility';

const props = getCollapsibleAriaProps(isOpen, contentId);
// { 'aria-expanded': true, 'aria-controls': 'content-id' }
```

**Button ARIA Props:**
```tsx
import { getButtonAriaProps } from './utils/accessibility';

const props = getButtonAriaProps('Close dialog', 'Closes the current dialog');
// { 'aria-label': 'Close dialog', 'aria-describedby': 'Closes...' }
```

**Field ARIA Props:**
```tsx
import { getFieldAriaProps } from './utils/accessibility';

const props = getFieldAriaProps('label-id', 'error-id', ['help-text-id']);
// { 'aria-labelledby': 'label-id', 'aria-describedby': 'error-id help-text-id', 'aria-invalid': true }
```

**Screen Reader Only Styles:**
```tsx
import { srOnlyStyles } from './utils/accessibility';

<span style={srOnlyStyles}>Hidden from visual users, announced to screen readers</span>
```

**Focus Visible Styles:**
```tsx
import { focusVisibleStyles } from './utils/accessibility';

<button style={{ ...myStyles, ':focus-visible': focusVisibleStyles }}>
  Click me
</button>
```

**User Preferences:**
```tsx
import { prefersHighContrast, prefersReducedMotion } from './utils/accessibility';

if (prefersReducedMotion()) {
  // Disable animations
}

if (prefersHighContrast()) {
  // Adjust colors for better contrast
}
```

---

### Keyboard Navigation Utilities (`utils/keyboard.ts`)

**Key Constants:**
```tsx
import { Keys } from './utils/keyboard';

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === Keys.ENTER) {
    // Handle Enter key
  }
}
```

**Focus Management:**
```tsx
import { 
  getFocusableElements, 
  focusFirstElement, 
  focusLastElement 
} from './utils/keyboard';

const container = document.getElementById('menu');
const focusableElements = getFocusableElements(container);
focusFirstElement(container);
```

**Arrow Navigation:**
```tsx
import { handleArrowNavigation } from './utils/keyboard';

function handleKeyDown(event: KeyboardEvent) {
  handleArrowNavigation(event, containerRef.current, 'vertical');
}
```

**Roving Tabindex Manager:**
```tsx
import { RovingTabIndexManager } from './utils/keyboard';

const manager = new RovingTabIndexManager(container, 0);

// Navigate
manager.next();
manager.previous();
manager.first();
manager.last();

// Update when DOM changes
manager.refresh();
```

**Keyboard Shortcuts:**
```tsx
import { createKeyboardShortcut } from './utils/keyboard';

const saveShortcut = createKeyboardShortcut('s', { ctrl: true });

function handleKeyDown(event: KeyboardEvent) {
  if (saveShortcut(event)) {
    handleSave();
  }
}
```

**Focus Trap:**
```tsx
import { trapFocus } from './utils/keyboard';

function handleKeyDown(event: KeyboardEvent) {
  trapFocus(modalRef.current, event);
}
```

**Activation Keys:**
```tsx
import { isActivationKey, handleClickWithKeyboard } from './utils/keyboard';

function handleKeyPress(event: KeyboardEvent) {
  handleClickWithKeyboard(event, () => {
    // Handle activation (Enter or Space)
  });
}
```

---

### Live Region Announcements (`utils/announcer.ts`)

**Basic Announcements:**
```tsx
import { announce, announceAssertive } from './utils/announcer';

// Polite announcement (won't interrupt current announcements)
announce('Page loaded successfully');

// Assertive announcement (will interrupt current announcements)
announceAssertive('Error: Failed to save');
```

**React Hook:**
```tsx
import { useLiveAnnouncer } from './utils/announcer';

function MyComponent() {
  const { announce, announceAssertive, clear } = useLiveAnnouncer();

  const handleSave = async () => {
    try {
      await save();
      announce('Changes saved successfully');
    } catch (error) {
      announceAssertive('Error: Failed to save changes');
    }
  };

  return <button onClick={handleSave}>Save</button>;
}
```

**Pre-built Announcement Messages:**
```tsx
import { announce, announcements } from './utils/announcer';

// Loading state
announce(announcements.loading('users'));

// Success
announce(announcements.saved('Contact'));

// Errors
announceAssertive(announcements.error('Network connection failed'));

// Results
announce(announcements.resultsFound(42, 'john'));

// Progress
announce(announcements.progressUpdate(3, 10));

// Navigation
announce(announcements.navigationChange('Settings page'));
```

**Available Announcement Templates:**
- `loading(item)` - "Loading {item}"
- `loaded(item)` - "{item} loaded"
- `error(message)` - "Error: {message}"
- `success(message)` - "Success: {message}"
- `saved(item)` - "{item} saved"
- `deleted(item)` - "{item} deleted"
- `selected(item)` - "{item} selected"
- `expanded(item)` - "{item} expanded"
- `collapsed(item)` - "{item} collapsed"
- `pageChanged(page, total)` - "Page {page} of {total}"
- `resultsFound(count, query)` - "{count} results found for '{query}'"
- `noResults(query)` - "No results found for '{query}'"
- `navigationChange(location)` - "Navigated to {location}"
- `formError(field, error)` - "{field}: {error}"
- `itemAdded(item, location)` - "{item} added to {location}"
- `itemRemoved(item, location)` - "{item} removed from {location}"
- `progressUpdate(current, total)` - "Progress: {current} of {total} complete"

---

## Testing

All accessibility components and utilities include comprehensive test coverage using Vitest and React Testing Library.

**Running Tests:**

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

**Test Files:**
- `SkipLink.test.tsx`
- `AccessibleModal.test.tsx`
- `AccessibleTabs.test.tsx`
- `Toast.test.tsx`
- `ErrorBoundary.test.tsx`
- `keyboard.test.ts`
- `announcer.test.ts`

---

## Best Practices

### General Guidelines

1. **Use Semantic HTML**: Always use the correct HTML elements (`<button>`, `<nav>`, `<main>`, etc.)
2. **Provide Text Alternatives**: Every image and icon should have appropriate alt text or aria-label
3. **Maintain Focus Order**: Ensure tab order follows visual order
4. **Keyboard Support**: All interactive elements must be keyboard accessible
5. **Color Contrast**: Maintain at least 4.5:1 contrast ratio for text
6. **Touch Targets**: Interactive elements should be at least 44x44 pixels

### Component-Specific Tips

**Buttons:**
```tsx
// ✅ Good: Clear label and proper element
<button onClick={handleClick} aria-label="Close dialog">
  ×
</button>

// ❌ Bad: Div used as button without proper attributes
<div onClick={handleClick}>×</div>
```

**Forms:**
```tsx
// ✅ Good: Associated label and error messages
<label htmlFor="email">Email</label>
<input
  id="email"
  type="email"
  aria-describedby={error ? 'email-error' : undefined}
  aria-invalid={!!error}
/>
{error && <span id="email-error" role="alert">{error}</span>}

// ❌ Bad: No label association, no error announcement
<input type="email" placeholder="Email" />
```

**Images:**
```tsx
// ✅ Good: Descriptive alt text
<img src="avatar.jpg" alt="John Doe's profile picture" />

// ✅ Good: Decorative image
<img src="decoration.svg" alt="" role="presentation" />

// ❌ Bad: Missing alt text
<img src="avatar.jpg" />
```

**Links:**
```tsx
// ✅ Good: Descriptive link text
<a href="/profile">View John Doe's profile</a>

// ❌ Bad: Generic link text
<a href="/profile">Click here</a>
```

**Dynamic Content:**
```tsx
// ✅ Good: Announce changes to screen readers
import { announce } from './utils/announcer';

function handleDelete() {
  deleteItem(id);
  announce(announcements.deleted('Contact'));
}

// ❌ Bad: Silent changes
function handleDelete() {
  deleteItem(id);
}
```

---

## Migration Guide

### Replacing Existing Modals

**Before:**
```tsx
<div role="dialog" aria-modal="true" style={{ ... }}>
  <div>
    <h2>My Dialog</h2>
    <button onClick={onClose}>Close</button>
    <div>{children}</div>
  </div>
</div>
```

**After:**
```tsx
<AccessibleModal
  isOpen={isOpen}
  onClose={onClose}
  title="My Dialog"
>
  {children}
</AccessibleModal>
```

### Adding Skip Links

Add skip links at the very beginning of your app:

```tsx
function App() {
  return (
    <>
      <SkipLink href="#main-content">Skip to main content</SkipLink>
      <SkipLink href="#navigation">Skip to navigation</SkipLink>
      
      <nav id="navigation">{/* ... */}</nav>
      <main id="main-content">{/* ... */}</main>
    </>
  );
}
```

### Adding Live Announcements

Replace alert/toast systems with accessible announcements:

**Before:**
```tsx
setNotification('Saved successfully');
```

**After:**
```tsx
import { announce, announcements } from './utils/announcer';

announce(announcements.saved('Contact'));
setNotification('Saved successfully'); // Keep visual notification
```

### Converting Custom Tabs

**Before:**
```tsx
const [activeTab, setActiveTab] = useState('tab1');

<div>
  <button onClick={() => setActiveTab('tab1')}>Tab 1</button>
  <button onClick={() => setActiveTab('tab2')}>Tab 2</button>
</div>
<div>{activeTab === 'tab1' ? <Tab1 /> : <Tab2 />}</div>
```

**After:**
```tsx
import AccessibleTabs from './components/AccessibleTabs';

const tabs = [
  { id: 'tab1', label: 'Tab 1', content: <Tab1 /> },
  { id: 'tab2', label: 'Tab 2', content: <Tab2 /> },
];

<AccessibleTabs tabs={tabs} />
```

---

## Keyboard Shortcuts Reference

### Global Navigation
- `Tab`: Move to next focusable element
- `Shift + Tab`: Move to previous focusable element
- `Enter`: Activate button/link
- `Space`: Activate button or toggle checkbox

### Modals
- `Escape`: Close modal
- `Tab`: Navigate within modal (focus trapped)

### Tabs
- `Arrow Keys`: Navigate between tabs
- `Home`: First tab
- `End`: Last tab
- `Tab`: Move to tab panel

### Lists/Menus
- `Arrow Up/Down`: Navigate items
- `Home`: First item
- `End`: Last item
- `Enter/Space`: Select item

---

## Resources

### Standards & Guidelines
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)

### Testing Tools
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WAVE](https://wave.webaim.org/)
- [Screen readers](https://www.nvaccess.org/) (NVDA for Windows, VoiceOver for macOS)

### Internal Documentation
- Component tests demonstrate proper usage
- Review test files for implementation examples

---

## Support

For questions or issues related to accessibility features, please:

1. Check this documentation
2. Review component tests for usage examples
3. Test with keyboard navigation and screen readers
4. Refer to WCAG 2.1 guidelines for specific requirements

---

**Version:** 1.0.0  
**Last Updated:** December 2025

