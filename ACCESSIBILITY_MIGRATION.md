# 🔄 Accessibility Migration Guide

Step-by-step guide to integrate SignalX accessibility features into existing code.

## 📋 Table of Contents

1. [Quick Wins (15 minutes)](#quick-wins-15-minutes)
2. [Forms Migration (30 minutes)](#forms-migration-30-minutes)
3. [Modal Migration (20 minutes)](#modal-migration-20-minutes)
4. [Keyboard Shortcuts (15 minutes)](#keyboard-shortcuts-15-minutes)
5. [Panel Enhancements (1-2 hours)](#panel-enhancements-1-2-hours)
6. [Testing & Validation](#testing--validation)

---

## Quick Wins (15 minutes)

### 1. Enable Development Checking (2 min)

Add to your main App file:

```tsx
// src/main.tsx or src/App.tsx
import { enableA11yChecking } from './utils/a11y';

// In development only
if (process.env.NODE_ENV === 'development') {
  enableA11yChecking();
}
```

**Result**: Accessibility issues logged to console on page load.

### 2. Add Skip Links (3 min)

At the top of your App component:

```tsx
import { SkipLink } from './utils/a11y';

function App() {
  return (
    <>
      <SkipLink href="#main-content">Skip to main content</SkipLink>
      <SkipLink href="#navigation">Skip to navigation</SkipLink>
      
      {/* Your existing app */}
      <nav id="navigation">{/* ... */}</nav>
      <main id="main-content">{/* ... */}</main>
    </>
  );
}
```

**Result**: Keyboard users can skip navigation.

### 3. Add Basic Announcements (5 min)

Replace existing notifications:

```tsx
// Before
setNotification('Saved successfully');

// After
import { announce, announcements } from './utils/a11y';

announce(announcements.saved('Contact'));
setNotification('Saved successfully');
```

**Result**: Screen readers announce changes.

### 4. Add Loading Announcements (5 min)

```tsx
import { useAnnounceLoading } from './utils/a11y';

function MyComponent() {
  const [loading, setLoading] = useState(false);
  
  useAnnounceLoading(loading, 'Loading data', 'Data loaded');
  
  // ... rest of component
}
```

**Result**: Loading states announced to screen readers.

---

## Forms Migration (30 minutes)

### Before: Basic Form

```tsx
function ContactForm() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  return (
    <form>
      <label>Name</label>
      <input 
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {error && <div>{error}</div>}
      <button type="submit">Submit</button>
    </form>
  );
}
```

### After: Accessible Form

```tsx
import { FormField, TextInput } from './utils/a11y';

function ContactForm() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  return (
    <form>
      <FormField 
        label="Name" 
        error={error}
        required
        hint="Enter your full name"
      >
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={!!error}
        />
      </FormField>
      <button type="submit">Submit</button>
    </form>
  );
}
```

### Benefits
- ✅ Proper label association
- ✅ Error announcements
- ✅ Required field indicators
- ✅ Help text support
- ✅ Consistent styling

### Complete Form Example

```tsx
import { 
  FormField, 
  TextInput, 
  TextArea,
  Checkbox,
  RadioGroup,
  Select 
} from './utils/a11y';

function CompleteForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
    plan: '',
    subscribe: false,
  });
  const [errors, setErrors] = useState({});

  return (
    <form onSubmit={handleSubmit}>
      <FormField label="Name" error={errors.name} required>
        <TextInput
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={!!errors.name}
        />
      </FormField>

      <FormField label="Email" error={errors.email} required>
        <TextInput
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          error={!!errors.email}
        />
      </FormField>

      <RadioGroup
        name="plan"
        label="Select plan"
        options={[
          { value: 'free', label: 'Free' },
          { value: 'pro', label: 'Pro' },
        ]}
        value={formData.plan}
        onChange={(plan) => setFormData({ ...formData, plan })}
        required
      />

      <Checkbox
        label="Subscribe to newsletter"
        checked={formData.subscribe}
        onChange={(e) => setFormData({ ...formData, subscribe: e.target.checked })}
      />

      <button type="submit">Submit</button>
    </form>
  );
}
```

---

## Modal Migration (20 minutes)

### Before: Custom Modal

```tsx
function MyModal({ isOpen, onClose, children }) {
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose}>×</button>
        {children}
      </div>
    </div>
  );
}
```

### After: AccessibleModal

```tsx
import { AccessibleModal } from './utils/a11y';

function MyModal({ isOpen, onClose, children }) {
  return (
    <AccessibleModal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Modal Title"
      size="medium"
    >
      {children}
    </AccessibleModal>
  );
}
```

### Benefits
- ✅ Focus trap (Tab cycles through modal only)
- ✅ Escape key closes
- ✅ Click backdrop closes
- ✅ Focus returns to trigger on close
- ✅ Body scroll prevention
- ✅ Proper ARIA attributes
- ✅ Reduced motion support

---

## Keyboard Shortcuts (15 minutes)

### Setup Global Shortcuts

```tsx
// src/App.tsx
import { registerDefaultShortcuts } from './utils/a11y';

function App() {
  useEffect(() => {
    registerDefaultShortcuts({
      onNewMessage: () => setNewMessageModalOpen(true),
      onSearch: () => setSearchOpen(true),
      onSettings: () => setSettingsOpen(true),
      onHelp: () => setHelpOpen(true),
      onRefresh: () => handleRefresh(),
      onToggleSidebar: () => setSidebarOpen(!sidebarOpen),
    });
  }, []);

  return <div>{/* Your app */}</div>;
}
```

### Add Component-Specific Shortcuts

```tsx
import { useKeyboardShortcut } from './utils/a11y';

function ChatPanel() {
  useKeyboardShortcut({
    id: 'send-message',
    key: 'Enter',
    meta: true,
    description: 'Send message',
    handler: handleSend,
    category: 'Chat',
  });

  return <div>{/* Chat UI */}</div>;
}
```

### Show Keyboard Help

```tsx
import { KeyboardShortcutsHelp } from './utils/a11y';

function HelpModal() {
  return (
    <AccessibleModal isOpen={isOpen} onClose={onClose} title="Help">
      <KeyboardShortcutsHelp />
    </AccessibleModal>
  );
}
```

---

## Panel Enhancements (1-2 hours)

### ChatPanel Example

```tsx
import { 
  useAnnounceListChanges,
  useAnnounceLoading,
  announce,
  announcements 
} from './utils/a11y';

function ChatPanel({ messages, onSend, isLoading }) {
  // Announce new messages
  useAnnounceListChanges(messages, 'message');

  // Announce loading
  useAnnounceLoading(isLoading, 'Sending message', 'Message sent');

  const handleSend = async (content) => {
    await onSend(content);
    announce(announcements.success('Message sent'));
  };

  return (
    <div role="main" aria-label="Chat conversation">
      {/* Add proper ARIA attributes */}
      <div 
        role="log" 
        aria-live="polite" 
        aria-relevant="additions"
        aria-label="Chat messages"
      >
        {messages.map(msg => (
          <div 
            key={msg.id}
            role="article"
            aria-label={`Message from ${msg.sender} at ${msg.time}`}
          >
            {msg.content}
          </div>
        ))}
      </div>

      {/* Send form with proper labels */}
      <form onSubmit={handleSubmit} aria-label="Send message">
        <label htmlFor="message-input" className="sr-only">
          Message
        </label>
        <input
          id="message-input"
          type="text"
          placeholder="Type a message..."
          aria-label="Message input"
        />
        <button type="submit" aria-label="Send message">
          Send
        </button>
      </form>
    </div>
  );
}
```

### ContactsPanel Example

```tsx
import { 
  useAnnounceCount,
  useAnnounceLoading,
  useRovingTabIndex 
} from './utils/a11y';

function ContactsPanel({ contacts, onSelect, isLoading }) {
  const [search, setSearch] = useState('');
  const listRef = useRef(null);
  
  const filtered = contacts.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Announce search results
  useAnnounceCount(filtered.length, 'contact', 'contacts');

  // Announce loading
  useAnnounceLoading(isLoading, 'Loading contacts', 'Contacts loaded');

  // Keyboard navigation
  useRovingTabIndex(listRef, '.contact-item', 'vertical');

  return (
    <div role="region" aria-label="Contacts">
      <label htmlFor="contacts-search" className="sr-only">
        Search contacts
      </label>
      <input
        id="contacts-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search contacts..."
        aria-describedby="search-results"
      />
      <div id="search-results" role="status" aria-live="polite" className="sr-only">
        {filtered.length} contacts found
      </div>

      <div ref={listRef} role="list" aria-label="Contacts list">
        {filtered.map(contact => (
          <button
            key={contact.id}
            className="contact-item"
            role="listitem"
            onClick={() => onSelect(contact)}
            aria-label={`${contact.name}, ${contact.phone}`}
          >
            {contact.name}
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## Testing & Validation

### 1. Automated Testing

Run in development console:

```javascript
// Check for accessibility issues
window.checkA11y();

// Test keyboard navigation
window.testKeyboardNav();

// View contrast requirements
window.checkContrast();

// Generate full report
window.generateA11yReport();
```

### 2. Manual Keyboard Testing

1. **Tab Navigation**
   - Press Tab repeatedly
   - Verify all interactive elements are reachable
   - Verify focus is visible
   - Verify tab order follows visual order

2. **Modal Testing**
   - Open a modal
   - Press Tab (should cycle within modal)
   - Press Escape (should close)
   - Click outside (should close)
   - Verify focus returns to trigger

3. **Menu Testing**
   - Open menu
   - Press Arrow Up/Down
   - Press Home/End
   - Press Enter to select
   - Press Escape to close

### 3. Screen Reader Testing

**macOS - VoiceOver:**
```bash
# Enable: Cmd + F5
# Navigate: Control + Option + Arrow Keys
# Interact: Control + Option + Space
```

**Windows - NVDA:**
```
# Download: https://www.nvaccess.org/
# Navigate: Arrow keys
# Interact: Enter/Space
# Browse mode: NVDA + Space
```

### 4. Checklist

- [ ] All images have alt text
- [ ] All buttons have accessible names
- [ ] All form inputs have labels
- [ ] All modals trap focus
- [ ] Escape closes modals
- [ ] Loading states are announced
- [ ] Errors are announced
- [ ] Search results counts are announced
- [ ] Keyboard shortcuts work
- [ ] Tab order is logical
- [ ] Focus is always visible
- [ ] No positive tabindex values
- [ ] Unique IDs only
- [ ] Main landmark present
- [ ] ARIA attributes correct

---

## 🎯 Migration Priorities

### Priority 1: Critical (Week 1)
- [ ] Add SkipLinks
- [ ] Replace modals with AccessibleModal
- [ ] Add basic announcements
- [ ] Fix form labels

### Priority 2: Important (Week 2-3)
- [ ] Migrate all forms to accessible components
- [ ] Add keyboard shortcuts
- [ ] Enhance panels with live regions
- [ ] Add loading announcements

### Priority 3: Enhancement (Week 4+)
- [ ] Add tooltips where helpful
- [ ] Use accordions for FAQs
- [ ] Add menus for actions
- [ ] Comprehensive testing

---

## 📞 Need Help?

1. **Quick Questions**: Check ACCESSIBILITY_QUICKSTART.md
2. **API Reference**: See ACCESSIBILITY.md
3. **Examples**: Review src/examples/AccessibleDashboard.tsx
4. **Patterns**: Check PANEL_ACCESSIBILITY.md
5. **Issues**: Run `window.checkA11y()` in console

---

## 🏁 Success Metrics

You'll know migration is successful when:
- ✅ No console errors from `checkA11y()`
- ✅ Can navigate entire app with keyboard only
- ✅ Screen reader users can use all features
- ✅ Loading states are announced
- ✅ Form errors are announced
- ✅ Focus is always visible
- ✅ All modals trap focus properly

---

**Remember**: Accessibility is a journey, not a destination. Start with quick wins, test often, and iterate based on feedback.

Good luck! 🚀

