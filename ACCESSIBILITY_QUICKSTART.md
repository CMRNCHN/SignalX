# Accessibility Quick Start Guide

Get started with SignalX accessibility features in 5 minutes.

## 1. Import What You Need

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

## 2. Add Skip Links (1 minute)

At the top of your app:

```tsx
<SkipLink href="#main-content">Skip to main content</SkipLink>
<main id="main-content">
  {/* Your main content */}
</main>
```

## 3. Replace Modals (2 minutes)

**Before:**

```tsx
{isOpen && (
  <div className="modal-overlay">
    <div className="modal">
      <h2>Title</h2>
      <button onClick={onClose}>Close</button>
      {children}
    </div>
  </div>
)}
```

**After:**

```tsx
<AccessibleModal isOpen={isOpen} onClose={onClose} title="Title">
  {children}
</AccessibleModal>
```

## 4. Add Announcements (30 seconds)

```tsx
import { announce, announcements } from './utils/announcer';

// When something happens:
announce(announcements.saved('Contact'));
```

## 5. Add Loading Announcements (30 seconds)

```tsx
import { useAnnounceLoading } from './utils/a11yHooks';

useAnnounceLoading(isLoading, 'Loading...', 'Loaded successfully');
```

## 6. Improve Forms (1 minute)

```tsx
<label htmlFor="email">Email</label>
<input
  id="email"
  type="email"
  aria-describedby={error ? 'email-error' : undefined}
  aria-invalid={!!error}
/>
{error && (
  <span id="email-error" role="alert">
    {error}
  </span>
)}
```

## Common Patterns

### Announcing Changes

```tsx
import { announce } from './utils/announcer';

const handleSave = async () => {
  await save();
  announce('Saved successfully');
};
```

### Accessible Buttons

```tsx
// Icon buttons need labels
<button aria-label="Close" onClick={onClose}>
  ×
</button>

// Or use title for tooltip + label
<button 
  aria-label="Settings" 
  title="Open settings"
  onClick={onSettings}
>
  ⚙️
</button>
```

### Search Results

```tsx
import { useAnnounceCount } from './utils/a11yHooks';

useAnnounceCount(results.length, 'result', 'results');
```

### Loading States

```tsx
import { useAnnounceLoading } from './utils/a11yHooks';

useAnnounceLoading(isLoading, 'Loading data', 'Data loaded');
```

### Keyboard Shortcuts

```tsx
import { useEscapeKey } from './utils/a11yHooks';

useEscapeKey(() => setIsOpen(false));
```

## Testing Checklist

- [ ] Can you navigate the entire UI with keyboard only?
- [ ] Do all images have alt text?
- [ ] Do all buttons have clear labels?
- [ ] Are loading states announced?
- [ ] Are errors announced?
- [ ] Does the Escape key close modals?

## Next Steps

1. Read the [full documentation](./ACCESSIBILITY.md)
2. Review [panel-specific enhancements](./PANEL_ACCESSIBILITY.md)
3. Check out the test files for more examples
4. Test with a screen reader (NVDA on Windows, VoiceOver on macOS)

## Need Help?

- Check component tests for usage examples
- Refer to WCAG 2.1 guidelines
- Use browser DevTools accessibility inspector
- Test with real users who use assistive technology

---

**Remember**: Accessibility is not a feature, it's a requirement. These tools make it easier to build an inclusive app for everyone.
