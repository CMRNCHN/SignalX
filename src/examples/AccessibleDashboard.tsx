/**
 * Comprehensive Integration Example
 * Demonstrates how to use all accessibility features together in a real application
 */

import React, { useState } from 'react';
import {
  // Components
  SkipLink,
  AccessibleModal,
  AccessibleTabs,
  Toast,
  FormField,
  TextInput,
  TextArea,
  Checkbox,
  Select,
  AccessibleMenu,
  Tooltip,
  Accordion,
  
  // Hooks
  useAnnounceLoading,
  useAnnounceCount,
  useKeyboardShortcut,
  useEscapeKey,
  
  // Utilities
  announce,
  announcements,
  registerDefaultShortcuts,
  enableA11yChecking,
  
  // Types
  Tab,
  MenuItem,
  AccordionItem,
} from '../utils/a11y';

/**
 * Example Dashboard Component with Full Accessibility
 */
export const AccessibleDashboard: React.FC = () => {
  // State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
    category: '',
    notifications: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Announce loading states
  useAnnounceLoading(isLoading, 'Loading data', 'Data loaded successfully');

  // Announce search results count
  useAnnounceCount(searchResults.length, 'result found', 'results found');

  // Keyboard shortcuts
  useKeyboardShortcut({
    id: 'open-settings',
    key: ',',
    meta: true,
    description: 'Open settings',
    handler: () => setIsSettingsOpen(true),
    category: 'Navigation',
  });

  useKeyboardShortcut({
    id: 'open-help',
    key: '?',
    shift: true,
    description: 'Open help',
    handler: () => setIsHelpOpen(true),
    category: 'Navigation',
  });

  // Close modals with Escape
  useEscapeKey(() => {
    if (isSettingsOpen) setIsSettingsOpen(false);
    if (isHelpOpen) setIsHelpOpen(false);
  }, isSettingsOpen || isHelpOpen);

  // Menu items
  const menuItems: MenuItem[] = [
    {
      id: 'profile',
      label: 'Profile',
      icon: '👤',
      onClick: () => {
        announce('Opening profile');
        console.log('Profile clicked');
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
      shortcut: '⌘,',
      onClick: () => setIsSettingsOpen(true),
    },
    { id: 'sep1', label: '', separator: true },
    {
      id: 'help',
      label: 'Help',
      icon: '❓',
      shortcut: '⇧?',
      onClick: () => setIsHelpOpen(true),
    },
    {
      id: 'logout',
      label: 'Logout',
      icon: '🚪',
      onClick: () => {
        announce('Logging out');
        console.log('Logout clicked');
      },
    },
  ];

  // Tabs
  const tabs: Tab[] = [
    {
      id: 'overview',
      label: 'Overview',
      content: (
        <div style={{ padding: '20px' }}>
          <h3>Dashboard Overview</h3>
          <p>Welcome to your accessible dashboard. All features are keyboard-accessible and screen-reader friendly.</p>
          
          <button
            onClick={() => {
              setIsLoading(true);
              setTimeout(() => {
                setIsLoading(false);
                setToast({ message: 'Data refreshed successfully', type: 'success' });
                announce(announcements.success('Data refreshed'));
              }, 2000);
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginTop: '16px',
            }}
          >
            {isLoading ? 'Loading...' : 'Refresh Data'}
          </button>
        </div>
      ),
    },
    {
      id: 'contact',
      label: 'Contact',
      content: (
        <div style={{ padding: '20px', maxWidth: '500px' }}>
          <h3>Contact Us</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const errors: Record<string, string> = {};
              
              if (!formData.name) errors.name = 'Name is required';
              if (!formData.email) errors.email = 'Email is required';
              if (!formData.message) errors.message = 'Message is required';
              
              setFormErrors(errors);
              
              if (Object.keys(errors).length === 0) {
                setToast({ message: 'Message sent successfully!', type: 'success' });
                announce(announcements.success('Message sent'));
                setFormData({ name: '', email: '', message: '', category: '', notifications: true });
              } else {
                setToast({ message: 'Please fix the errors in the form', type: 'error' });
                announce(`Form has ${Object.keys(errors).length} errors`);
              }
            }}
          >
            <FormField label="Name" error={formErrors.name} required>
              <TextInput
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={!!formErrors.name}
                placeholder="Your name"
              />
            </FormField>

            <FormField label="Email" error={formErrors.email} required>
              <TextInput
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                error={!!formErrors.email}
                placeholder="your@email.com"
              />
            </FormField>

            <FormField label="Category">
              <Select
                options={[
                  { value: 'general', label: 'General Inquiry' },
                  { value: 'support', label: 'Support' },
                  { value: 'feedback', label: 'Feedback' },
                  { value: 'bug', label: 'Bug Report' },
                ]}
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Select a category"
              />
            </FormField>

            <FormField label="Message" error={formErrors.message} required>
              <TextArea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                error={!!formErrors.message}
                placeholder="Your message..."
              />
            </FormField>

            <Checkbox
              label="Send me email notifications"
              checked={formData.notifications}
              onChange={(e) => setFormData({ ...formData, notifications: e.target.checked })}
            />

            <button
              type="submit"
              style={{
                marginTop: '16px',
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Send Message
            </button>
          </form>
        </div>
      ),
    },
    {
      id: 'faq',
      label: 'FAQ',
      content: (
        <div style={{ padding: '20px' }}>
          <h3>Frequently Asked Questions</h3>
          <Accordion
            items={faqItems}
            allowMultiple={false}
          />
        </div>
      ),
    },
  ];

  // FAQ accordion items
  const faqItems: AccordionItem[] = [
    {
      id: 'q1',
      title: 'How do I navigate with keyboard?',
      content: (
        <div>
          <p>Use these keyboard shortcuts:</p>
          <ul>
            <li><kbd>Tab</kbd> - Move to next element</li>
            <li><kbd>Shift+Tab</kbd> - Move to previous element</li>
            <li><kbd>Enter/Space</kbd> - Activate button</li>
            <li><kbd>Arrow Keys</kbd> - Navigate tabs and menus</li>
            <li><kbd>Escape</kbd> - Close modals</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'q2',
      title: 'Is this accessible to screen readers?',
      content: (
        <p>
          Yes! This dashboard uses proper ARIA attributes, semantic HTML, and live region
          announcements to ensure full screen reader compatibility.
        </p>
      ),
    },
    {
      id: 'q3',
      title: 'Can I customize keyboard shortcuts?',
      content: (
        <p>
          Press <kbd>Shift+?</kbd> to view all available keyboard shortcuts. Customization
          features are coming soon!
        </p>
      ),
    },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#111827', color: '#E0E0E0' }}>
      {/* Skip Links */}
      <SkipLink href="#main-content">Skip to main content</SkipLink>
      <SkipLink href="#navigation">Skip to navigation</SkipLink>

      {/* Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #374151',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Accessible Dashboard</h1>

        <nav id="navigation">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Tooltip content="Search (⌘K)">
              <button
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#374151',
                  color: '#E0E0E0',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                aria-label="Search"
              >
                🔍
              </button>
            </Tooltip>

            <Tooltip content="Notifications">
              <button
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#374151',
                  color: '#E0E0E0',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                aria-label="Notifications"
              >
                🔔
              </button>
            </Tooltip>

            <AccessibleMenu
              trigger={
                <button
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#374151',
                    color: '#E0E0E0',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                  aria-label="User menu"
                >
                  👤 Menu
                </button>
              }
              items={menuItems}
              align="right"
            />
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main id="main-content" style={{ padding: '24px' }}>
        <AccessibleTabs tabs={tabs} defaultActiveTab="overview" />
      </main>

      {/* Settings Modal */}
      <AccessibleModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Settings"
        size="large"
      >
        <p>Settings panel coming soon!</p>
        <p>This modal demonstrates:</p>
        <ul>
          <li>Focus trap (try pressing Tab)</li>
          <li>Escape key to close</li>
          <li>Click outside to close</li>
          <li>Proper ARIA attributes</li>
        </ul>
      </AccessibleModal>

      {/* Help Modal */}
      <AccessibleModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        title="Help & Keyboard Shortcuts"
        size="medium"
      >
        <h3>Keyboard Shortcuts</h3>
        <table style={{ width: '100%', marginTop: '16px' }}>
          <tbody>
            <tr>
              <td>Open Settings</td>
              <td style={{ textAlign: 'right' }}><kbd>⌘,</kbd></td>
            </tr>
            <tr>
              <td>Open Help</td>
              <td style={{ textAlign: 'right' }}><kbd>⇧?</kbd></td>
            </tr>
            <tr>
              <td>Close Modal</td>
              <td style={{ textAlign: 'right' }}><kbd>Esc</kbd></td>
            </tr>
          </tbody>
        </table>
      </AccessibleModal>

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={3000}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

// Enable accessibility checking in development
if (process.env.NODE_ENV === 'development') {
  enableA11yChecking();
}

export default AccessibleDashboard;

