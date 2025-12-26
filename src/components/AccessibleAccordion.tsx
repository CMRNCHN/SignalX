import React, { useState, useId } from 'react';
import { Keys } from '../utils/keyboard';
import { announce } from '../utils/announcer';
import { prefersReducedMotion } from '../utils/accessibility';

export interface AccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
  disabled?: boolean;
}

interface AccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
  defaultOpenItems?: string[];
  className?: string;
}

/**
 * Accessible accordion component
 * Follows WAI-ARIA Accordion Pattern
 */
export const Accordion: React.FC<AccordionProps> = ({
  items,
  allowMultiple = false,
  defaultOpenItems = [],
  className = '',
}) => {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set(defaultOpenItems));

  const toggleItem = (itemId: string, itemTitle: string) => {
    const newOpenItems = new Set(openItems);
    const isOpen = newOpenItems.has(itemId);

    if (allowMultiple) {
      if (isOpen) {
        newOpenItems.delete(itemId);
        announce(`${itemTitle} collapsed`);
      } else {
        newOpenItems.add(itemId);
        announce(`${itemTitle} expanded`);
      }
    } else {
      // Single mode: close all others
      if (isOpen) {
        newOpenItems.clear();
        announce(`${itemTitle} collapsed`);
      } else {
        newOpenItems.clear();
        newOpenItems.add(itemId);
        announce(`${itemTitle} expanded`);
      }
    }

    setOpenItems(newOpenItems);
  };

  const handleKeyDown = (e: React.KeyboardEvent, itemId: string, itemTitle: string, index: number) => {
    const button = e.currentTarget;
    const allButtons = Array.from(
      button.parentElement?.parentElement?.querySelectorAll('[role="button"]') || []
    );
    const currentIndex = allButtons.indexOf(button);

    if (e.key === Keys.ARROW_DOWN) {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % allButtons.length;
      (allButtons[nextIndex] as HTMLElement).focus();
    } else if (e.key === Keys.ARROW_UP) {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + allButtons.length) % allButtons.length;
      (allButtons[prevIndex] as HTMLElement).focus();
    } else if (e.key === Keys.HOME) {
      e.preventDefault();
      (allButtons[0] as HTMLElement).focus();
    } else if (e.key === Keys.END) {
      e.preventDefault();
      (allButtons[allButtons.length - 1] as HTMLElement).focus();
    } else if (e.key === Keys.ENTER || e.key === Keys.SPACE) {
      e.preventDefault();
      toggleItem(itemId, itemTitle);
    }
  };

  const reducedMotion = prefersReducedMotion();

  return (
    <div className={`accordion ${className}`}>
      {items.map((item, index) => {
        const isOpen = openItems.has(item.id);
        const headerId = `accordion-header-${item.id}`;
        const panelId = `accordion-panel-${item.id}`;

        return (
          <div
            key={item.id}
            style={{
              borderBottom: '1px solid #374151',
            }}
          >
            {/* Header/Button */}
            <h3 style={{ margin: 0 }}>
              <button
                id={headerId}
                role="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-disabled={item.disabled}
                disabled={item.disabled}
                onClick={() => !item.disabled && toggleItem(item.id, item.title)}
                onKeyDown={(e) => !item.disabled && handleKeyDown(e, item.id, item.title, index)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: item.disabled ? '#6B7280' : '#E0E0E0',
                  fontSize: '1rem',
                  fontWeight: 600,
                  textAlign: 'left',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  transition: reducedMotion ? 'none' : 'background-color 0.2s',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!item.disabled) {
                    e.currentTarget.style.backgroundColor = '#1f2937';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline = '2px solid #3b82f6';
                  e.currentTarget.style.outlineOffset = '-2px';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = 'none';
                }}
              >
                <span>{item.title}</span>
                <span
                  style={{
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: reducedMotion ? 'none' : 'transform 0.2s',
                    fontSize: '1.25rem',
                  }}
                >
                  ▼
                </span>
              </button>
            </h3>

            {/* Panel */}
            {isOpen && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                style={{
                  padding: '16px',
                  color: '#E0E0E0',
                  backgroundColor: '#0f1116',
                  animation: reducedMotion ? 'none' : 'slideDown 0.2s ease-out',
                }}
              >
                {item.content}
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
};

// Example usage
export const AccordionExample: React.FC = () => {
  const accordionItems: AccordionItem[] = [
    {
      id: 'item1',
      title: 'What is SignalX?',
      content: (
        <p>
          SignalX is a modern messaging and business assistant built with Tauri and React. It provides
          a secure, private communication platform with AI-powered features.
        </p>
      ),
    },
    {
      id: 'item2',
      title: 'How do I get started?',
      content: (
        <div>
          <p>Getting started is easy:</p>
          <ol>
            <li>Install SignalX on your device</li>
            <li>Link your Signal account</li>
            <li>Start messaging with enhanced features</li>
          </ol>
        </div>
      ),
    },
    {
      id: 'item3',
      title: 'Is it secure?',
      content: (
        <p>
          Yes! SignalX uses the Signal Protocol for end-to-end encryption. All messages are encrypted
          on your device before being sent, and only the recipient can decrypt them.
        </p>
      ),
    },
    {
      id: 'item4',
      title: 'Premium Features',
      content: (
        <p>
          Premium features coming soon! Stay tuned for AI-powered message drafting, advanced search,
          and business tools.
        </p>
      ),
      disabled: true,
    },
  ];

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '24px', color: '#E0E0E0' }}>Frequently Asked Questions</h2>
      <Accordion items={accordionItems} allowMultiple={false} defaultOpenItems={['item1']} />
    </div>
  );
};

