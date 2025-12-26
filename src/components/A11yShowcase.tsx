import React, { useState } from 'react';
import SkipLink from './SkipLink';
import AccessibleModal from './AccessibleModal';
import AccessibleTabs, { Tab } from './AccessibleTabs';
import Toast from './Toast';
import ErrorBoundary from './ErrorBoundary';
import { announce, announcements } from '../utils/announcer';

/**
 * A11yShowcase - Demonstrates all accessibility components and features
 * This is a living documentation and testing ground for accessibility features
 */
const A11yShowcase: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(
    null
  );
  const [hasError, setHasError] = useState(false);

  // Tab content for the Tabs component
  const tabs: Tab[] = [
    {
      id: 'components',
      label: 'Components',
      content: (
        <div style={{ padding: '20px' }}>
          <h3>Accessibility Components</h3>
          <p>All components follow WCAG 2.1 AA standards and include:</p>
          <ul>
            <li>Proper ARIA attributes</li>
            <li>Keyboard navigation support</li>
            <li>Focus management</li>
            <li>Screen reader announcements</li>
          </ul>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setModalOpen(true)}
              style={{
                padding: '12px 24px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Open Modal
            </button>

            <button
              onClick={() =>
                setToast({ message: 'Operation completed successfully!', type: 'success' })
              }
              style={{
                padding: '12px 24px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Show Success Toast
            </button>

            <button
              onClick={() => setToast({ message: 'Something went wrong', type: 'error' })}
              style={{
                padding: '12px 24px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Show Error Toast
            </button>

            <button
              onClick={() => announce(announcements.saved('Contact'))}
              style={{
                padding: '12px 24px',
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Announce to Screen Reader
            </button>

            <button
              onClick={() => setHasError(true)}
              style={{
                padding: '12px 24px',
                backgroundColor: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Trigger Error Boundary
            </button>
          </div>

          {hasError && <ThrowError />}
        </div>
      ),
    },
    {
      id: 'keyboard',
      label: 'Keyboard Navigation',
      content: (
        <div style={{ padding: '20px' }}>
          <h3>Keyboard Shortcuts</h3>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginTop: '16px',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#1f2937', textAlign: 'left' }}>
                <th style={{ padding: '12px', color: '#e5e7eb' }}>Key</th>
                <th style={{ padding: '12px', color: '#e5e7eb' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <td style={{ padding: '12px', fontFamily: 'monospace' }}>Tab</td>
                <td style={{ padding: '12px' }}>Move to next focusable element</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <td style={{ padding: '12px', fontFamily: 'monospace' }}>Shift + Tab</td>
                <td style={{ padding: '12px' }}>Move to previous focusable element</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <td style={{ padding: '12px', fontFamily: 'monospace' }}>Enter / Space</td>
                <td style={{ padding: '12px' }}>Activate button or link</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <td style={{ padding: '12px', fontFamily: 'monospace' }}>Escape</td>
                <td style={{ padding: '12px' }}>Close modal or dialog</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <td style={{ padding: '12px', fontFamily: 'monospace' }}>Arrow Keys</td>
                <td style={{ padding: '12px' }}>Navigate tabs, lists, and menus</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <td style={{ padding: '12px', fontFamily: 'monospace' }}>Home / End</td>
                <td style={{ padding: '12px' }}>Jump to first/last item in list</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#1f2937', borderRadius: '8px' }}>
            <p style={{ margin: 0, color: '#9ca3af' }}>
              💡 <strong>Tip:</strong> Try navigating this showcase using only your keyboard!
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'testing',
      label: 'Testing',
      content: (
        <div style={{ padding: '20px' }}>
          <h3>Accessibility Testing</h3>
          
          <div style={{ marginBottom: '24px' }}>
            <h4>Automated Testing</h4>
            <p>All components include comprehensive test coverage:</p>
            <ul>
              <li>Component behavior tests</li>
              <li>Keyboard navigation tests</li>
              <li>ARIA attribute validation</li>
              <li>Focus management tests</li>
            </ul>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <h4>Manual Testing</h4>
            <p>Test with these tools:</p>
            <ul>
              <li><strong>Keyboard:</strong> Navigate without a mouse</li>
              <li><strong>Screen Readers:</strong> NVDA (Windows) or VoiceOver (macOS)</li>
              <li><strong>Browser DevTools:</strong> Accessibility inspector</li>
              <li><strong>axe DevTools:</strong> Automated accessibility scanning</li>
              <li><strong>WAVE:</strong> Web accessibility evaluation tool</li>
            </ul>
          </div>

          <div style={{ padding: '16px', backgroundColor: '#1f2937', borderRadius: '8px' }}>
            <h4 style={{ marginTop: 0 }}>Testing Checklist</h4>
            <ul style={{ marginBottom: 0 }}>
              <li>✅ Keyboard navigation works</li>
              <li>✅ Focus is always visible</li>
              <li>✅ Screen readers announce content</li>
              <li>✅ Color contrast meets WCAG AA</li>
              <li>✅ Motion respects user preferences</li>
              <li>✅ Forms have proper labels and errors</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'resources',
      label: 'Resources',
      content: (
        <div style={{ padding: '20px' }}>
          <h3>Documentation & Resources</h3>
          
          <div style={{ marginBottom: '24px' }}>
            <h4>Internal Documentation</h4>
            <ul>
              <li><a href="/ACCESSIBILITY.md" style={{ color: '#3b82f6' }}>Complete Accessibility Guide</a></li>
              <li><a href="/PANEL_ACCESSIBILITY.md" style={{ color: '#3b82f6' }}>Panel Enhancement Guide</a></li>
              <li><a href="/ACCESSIBILITY_QUICKSTART.md" style={{ color: '#3b82f6' }}>Quick Start Guide</a></li>
              <li><a href="/ACCESSIBILITY_SUMMARY.md" style={{ color: '#3b82f6' }}>Implementation Summary</a></li>
            </ul>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <h4>External Standards</h4>
            <ul>
              <li><a href="https://www.w3.org/WAI/WCAG21/quickref/" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>WCAG 2.1 Quick Reference</a></li>
              <li><a href="https://www.w3.org/WAI/ARIA/apg/" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>WAI-ARIA Authoring Practices</a></li>
              <li><a href="https://developer.mozilla.org/en-US/docs/Web/Accessibility" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>MDN Accessibility</a></li>
            </ul>
          </div>

          <div style={{ padding: '16px', backgroundColor: '#1f2937', borderRadius: '8px' }}>
            <h4 style={{ marginTop: 0 }}>Components Available</h4>
            <ul style={{ marginBottom: 0 }}>
              <li>SkipLink</li>
              <li>AccessibleModal</li>
              <li>AccessibleTabs</li>
              <li>Toast</li>
              <li>ErrorBoundary</li>
            </ul>
          </div>
        </div>
      ),
    },
  ];

  return (
    <ErrorBoundary>
      <div style={{ minHeight: '100vh', backgroundColor: '#111827', color: '#e5e7eb', padding: '20px' }}>
        {/* Skip Links */}
        <SkipLink href="#main-content">Skip to main content</SkipLink>
        <SkipLink href="#navigation">Skip to navigation</SkipLink>

        {/* Header */}
        <header style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>
            Accessibility Showcase
          </h1>
          <p style={{ fontSize: '1.125rem', color: '#9ca3af' }}>
            Interactive demonstration of SignalX accessibility features
          </p>
        </header>

        {/* Navigation */}
        <nav id="navigation" style={{ marginBottom: '32px' }}>
          <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
            Use Tab to navigate, Arrow keys to switch tabs, and Escape to close modals.
          </p>
        </nav>

        {/* Main Content */}
        <main id="main-content">
          <AccessibleTabs tabs={tabs} defaultActiveTab="components" />
        </main>

        {/* Modal Example */}
        <AccessibleModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Accessible Modal Example"
          size="medium"
        >
          <p>This modal demonstrates:</p>
          <ul>
            <li>Focus trap (Tab key cycles through focusable elements)</li>
            <li>Escape key closes the modal</li>
            <li>Click backdrop to close</li>
            <li>Focus returns to trigger button on close</li>
            <li>Prevents body scroll while open</li>
            <li>Proper ARIA attributes for screen readers</li>
          </ul>

          <div style={{ marginTop: '24px' }}>
            <input
              type="text"
              placeholder="Try tabbing through elements"
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '12px',
                borderRadius: '4px',
                border: '1px solid #374151',
                backgroundColor: '#111827',
                color: '#e5e7eb',
              }}
            />
            <button
              onClick={() => {
                announce(announcements.success('Button clicked in modal'));
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginRight: '8px',
              }}
            >
              Announce Click
            </button>
            <button
              onClick={() => setModalOpen(false)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Close Modal
            </button>
          </div>
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
    </ErrorBoundary>
  );
};

// Component that throws an error for ErrorBoundary demo
const ThrowError: React.FC = () => {
  throw new Error('This is a demo error to showcase the ErrorBoundary component');
};

export default A11yShowcase;

