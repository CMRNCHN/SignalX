# Panel Accessibility Enhancement Guide

This guide provides specific recommendations for enhancing the accessibility of the main panels (ChatPanel, ContactsPanel, ThreadsPanel) in SignalX.

## Overview

The three main panels can be significantly enhanced with:
- Live region announcements for dynamic content
- Keyboard navigation improvements
- Better focus management
- Screen reader announcements for state changes

## Recommended Enhancements

### 1. ChatPanel Enhancements

**Add ARIA landmarks:**
```tsx
<div className="chat-panel panel" role="main" aria-label="Conversation">
  {/* ... */}
</div>
```

**Announce new messages:**
```tsx
import { useAnnounceListChanges } from '../utils/a11yHooks';

// In component:
useAnnounceListChanges(messages, 'message', false);
```

**Add keyboard shortcuts:**
```tsx
import { useEscapeKey } from '../utils/a11yHooks';
import { Keys } from '../utils/keyboard';

// Clear messages with Escape
useEscapeKey(() => onClearMessages?.(), true);

// Send message with Ctrl/Cmd + Enter
const handleKeyDown = (e: React.KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === Keys.ENTER) {
    handleSubmit(e);
  }
};
```

**Improve conversation button accessibility:**
```tsx
<button
  key={conv.recipient}
  onClick={() => onSelectConversation?.(conv.recipient)}
  aria-label={`${conv.name}${conv.unreadCount ? `, ${conv.unreadCount} unread messages` : ''}`}
  aria-current={selectedRecipient === conv.recipient ? 'true' : undefined}
  // ... other props
>
  {/* ... */}
</button>
```

**Announce sending status:**
```tsx
import { useAnnounceLoading } from '../utils/a11yHooks';

useAnnounceLoading(
  isSending,
  'Sending message',
  'Message sent'
);
```

**Add status region for screen readers:**
```tsx
<div role="status" aria-live="polite" className="sr-only">
  {isSending && 'Sending message...'}
</div>
```

---

### 2. ContactsPanel Enhancements

**Add proper ARIA attributes:**
```tsx
<div className="contacts-panel panel" role="region" aria-label="Contacts">
  {/* ... */}
</div>
```

**Announce loading and error states:**
```tsx
import { useAnnounceLoading } from '../utils/a11yHooks';

useAnnounceLoading(
  loading,
  'Loading contacts',
  'Contacts loaded'
);

// Announce errors
useEffect(() => {
  if (error) {
    announceAssertive(`Error: ${error}`);
  }
}, [error]);
```

**Enhance search input:**
```tsx
<label htmlFor="contacts-search" className="sr-only">
  Search contacts
</label>
<input
  id="contacts-search"
  type="text"
  placeholder="Search contacts..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  aria-describedby="contacts-search-help"
/>
<span id="contacts-search-help" className="sr-only">
  Type to filter contacts by name or number
</span>
```

**Announce search results:**
```tsx
import { useAnnounceCount } from '../utils/a11yHooks';

useAnnounceCount(
  filteredContacts.length,
  'contact found',
  'contacts found',
  500
);
```

**Improve contact list accessibility:**
```tsx
<div role="list" aria-label="Contacts">
  {filteredContacts.map((contact) => (
    <button
      key={contact.number}
      role="listitem"
      onClick={() => onSelectContact?.(contact)}
      aria-label={`${getDisplayName(contact)}${contact.number ? `, ${contact.number}` : ''}`}
      aria-selected={selectedContact === contact.number}
      // ... other props
    >
      {/* ... */}
    </button>
  ))}
</div>
```

**Add keyboard navigation:**
```tsx
import { useRovingTabIndex } from '../utils/a11yHooks';

const listRef = useRef<HTMLDivElement>(null);
useRovingTabIndex(listRef, '.contact-item', 'vertical');
```

---

### 3. ThreadsPanel Enhancements

**Add proper ARIA attributes:**
```tsx
<div className="threads-panel panel" role="region" aria-label="Message threads">
  {/* ... */}
</div>
```

**Announce loading states:**
```tsx
import { useAnnounceLoading } from '../utils/a11yHooks';

useAnnounceLoading(
  loading,
  'Loading threads',
  'Threads loaded'
);
```

**Enhance search:**
```tsx
<label htmlFor="threads-search" className="sr-only">
  Search threads
</label>
<input
  id="threads-search"
  type="text"
  placeholder="Search threads..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  aria-describedby="threads-search-results"
/>
<span id="threads-search-results" className="sr-only" role="status" aria-live="polite">
  {filteredThreads.length} {filteredThreads.length === 1 ? 'thread' : 'threads'} found
</span>
```

**Improve thread list:**
```tsx
<div role="list" aria-label="Message threads">
  {filteredThreads.map((thread) => (
    <button
      key={thread.id}
      role="listitem"
      onClick={() => onSelectThread?.(thread)}
      aria-label={`${thread.name}${thread.unreadCount ? `, ${thread.unreadCount} unread` : ''}${thread.lastMessage ? `, last message: ${thread.lastMessage}` : ''}`}
      aria-selected={selectedThread === thread.id}
      aria-describedby={`thread-time-${thread.id}`}
      // ... other props
    >
      <div>{thread.name}</div>
      {thread.unreadCount > 0 && (
        <span aria-label={`${thread.unreadCount} unread messages`}>
          {thread.unreadCount}
        </span>
      )}
      {thread.lastMessage && (
        <div className="sr-only">{thread.lastMessage}</div>
      )}
      <time id={`thread-time-${thread.id}`}>
        {formatTime(thread.timestamp)}
      </time>
    </button>
  ))}
</div>
```

**Add keyboard navigation:**
```tsx
import { useRovingTabIndex } from '../utils/a11yHooks';

const listRef = useRef<HTMLDivElement>(null);
useRovingTabIndex(listRef, '.thread-item', 'vertical');
```

**Announce unread count changes:**
```tsx
import { announce, announcements } from '../utils/announcer';

useEffect(() => {
  const totalUnread = threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0);
  if (totalUnread > 0) {
    announce(`${totalUnread} total unread messages`);
  }
}, [threads]);
```

---

## Common Patterns

### 1. Loading States

```tsx
import { useAnnounceLoading } from '../utils/a11yHooks';

function MyPanel() {
  const [loading, setLoading] = useState(false);

  useAnnounceLoading(loading, 'Loading data', 'Data loaded');

  return (
    <div>
      {loading && (
        <div role="status" aria-live="polite" className="sr-only">
          Loading...
        </div>
      )}
      {/* ... */}
    </div>
  );
}
```

### 2. Search Results

```tsx
import { useAnnounceCount } from '../utils/a11yHooks';

function SearchablePanel({ items, query }) {
  const filteredItems = items.filter(/* ... */);
  
  useAnnounceCount(
    filteredItems.length,
    'result',
    'results',
    500 // Debounce while typing
  );

  return (
    <div>
      <input 
        type="text" 
        aria-label="Search"
        aria-describedby="search-results-status"
      />
      <div id="search-results-status" role="status" aria-live="polite" className="sr-only">
        {filteredItems.length} results found
      </div>
      {/* ... */}
    </div>
  );
}
```

### 3. List Navigation

```tsx
import { useRovingTabIndex } from '../utils/a11yHooks';

function ListPanel() {
  const listRef = useRef<HTMLDivElement>(null);
  
  useRovingTabIndex(listRef, '.list-item', 'vertical');

  return (
    <div ref={listRef} role="list">
      {items.map(item => (
        <div className="list-item" role="listitem" tabIndex={-1}>
          {item.name}
        </div>
      ))}
    </div>
  );
}
```

### 4. Status Announcements

```tsx
import { announce, announceAssertive } from '../utils/announcer';

// Success (polite)
announce('Contact saved successfully');

// Error (assertive - interrupts)
announceAssertive('Failed to send message');

// Using predefined templates
import { announcements } from '../utils/announcer';

announce(announcements.saved('Contact'));
announceAssertive(announcements.error('Network connection failed'));
```

---

## Implementation Checklist

For each panel, ensure:

- [ ] **Landmarks**: Proper `role` attributes (main, region, navigation)
- [ ] **Labels**: All interactive elements have accessible labels
- [ ] **Live Regions**: Status updates announced to screen readers
- [ ] **Keyboard Navigation**: Full keyboard support with logical tab order
- [ ] **Focus Management**: Focus moves appropriately on interactions
- [ ] **Loading States**: Loading and error states are announced
- [ ] **Search**: Search inputs have labels and results are announced
- [ ] **Lists**: Lists use proper ARIA roles and selected states
- [ ] **Counts**: Counts (unread, results, etc.) are announced
- [ ] **Errors**: Error messages are announced assertively

---

## Testing

Test each enhancement with:

1. **Keyboard only**: Tab through all interactive elements
2. **Screen reader**: Use NVDA (Windows) or VoiceOver (macOS)
3. **High contrast mode**: Ensure focus indicators are visible
4. **Reduced motion**: Animations respect user preferences

### Example Test Flow

**ContactsPanel:**
1. Tab to search input - should announce "Search contacts"
2. Type in search - should announce "X contacts found" after delay
3. Tab to first contact - should announce contact name and number
4. Arrow down - should move to next contact and announce it
5. Press Enter - should select contact and announce selection

---

## Resources

- [Main Accessibility Documentation](./ACCESSIBILITY.md)
- [Accessibility Hooks](../src/utils/a11yHooks.ts)
- [Live Announcer Utility](../src/utils/announcer.ts)
- [Keyboard Utilities](../src/utils/keyboard.ts)

---

**Last Updated:** December 2025

