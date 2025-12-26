import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { Keys, handleArrowNavigation } from '../utils/keyboard';

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

interface AccessibleTabsProps {
  tabs: Tab[];
  defaultActiveTab?: string;
  onChange?: (tabId: string) => void;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

const AccessibleTabs: React.FC<AccessibleTabsProps> = ({
  tabs,
  defaultActiveTab,
  onChange,
  className = '',
  orientation = 'horizontal',
}) => {
  const [activeTab, setActiveTab] = useState(defaultActiveTab || tabs[0]?.id);
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (defaultActiveTab) {
      setActiveTab(defaultActiveTab);
    }
  }, [defaultActiveTab]);

  const handleTabClick = (tabId: string) => {
    if (tabs.find(t => t.id === tabId)?.disabled) return;
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const { key } = event;

    // Handle arrow key navigation
    if (
      (orientation === 'horizontal' &&
        (key === Keys.ARROW_LEFT || key === Keys.ARROW_RIGHT)) ||
      (orientation === 'vertical' &&
        (key === Keys.ARROW_UP || key === Keys.ARROW_DOWN)) ||
      key === Keys.HOME ||
      key === Keys.END
    ) {
      event.preventDefault();

      if (!tabListRef.current) return;

      const enabledTabs = tabs.filter(t => !t.disabled);
      const currentIndex = enabledTabs.findIndex(t => t.id === activeTab);
      let nextIndex = currentIndex;

      if (orientation === 'horizontal') {
        if (key === Keys.ARROW_LEFT) {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : enabledTabs.length - 1;
        } else if (key === Keys.ARROW_RIGHT) {
          nextIndex = currentIndex < enabledTabs.length - 1 ? currentIndex + 1 : 0;
        }
      } else {
        if (key === Keys.ARROW_UP) {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : enabledTabs.length - 1;
        } else if (key === Keys.ARROW_DOWN) {
          nextIndex = currentIndex < enabledTabs.length - 1 ? currentIndex + 1 : 0;
        }
      }

      if (key === Keys.HOME) {
        nextIndex = 0;
      } else if (key === Keys.END) {
        nextIndex = enabledTabs.length - 1;
      }

      const nextTab = enabledTabs[nextIndex];
      if (nextTab) {
        handleTabClick(nextTab.id);
        tabRefs.current.get(nextTab.id)?.focus();
      }
    }
  };

  const activeTabData = tabs.find(t => t.id === activeTab);

  return (
    <div className={`accessible-tabs ${className}`}>
      {/* Tab List */}
      <div
        ref={tabListRef}
        role="tablist"
        aria-orientation={orientation}
        className="tab-list"
        style={{
          display: 'flex',
          flexDirection: orientation === 'horizontal' ? 'row' : 'column',
          borderBottom: orientation === 'horizontal' ? '1px solid #2A2D31' : 'none',
          borderRight: orientation === 'vertical' ? '1px solid #2A2D31' : 'none',
          gap: '4px',
          padding: orientation === 'horizontal' ? '0 0 0 16px' : '16px 0 0 0',
        }}
        onKeyDown={handleKeyDown}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            ref={el => {
              if (el) tabRefs.current.set(tab.id, el);
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => handleTabClick(tab.id)}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''} ${
              tab.disabled ? 'disabled' : ''
            }`}
            style={{
              background: 'none',
              border: 'none',
              padding: orientation === 'horizontal' ? '12px 16px' : '8px 16px',
              color: activeTab === tab.id ? '#3b82f6' : '#9CA3AF',
              cursor: tab.disabled ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              fontWeight: activeTab === tab.id ? 600 : 400,
              position: 'relative',
              transition: 'color 0.2s',
              opacity: tab.disabled ? 0.5 : 1,
              borderBottom:
                orientation === 'horizontal' && activeTab === tab.id
                  ? '2px solid #3b82f6'
                  : 'none',
              borderRight:
                orientation === 'vertical' && activeTab === tab.id
                  ? '2px solid #3b82f6'
                  : 'none',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              if (!tab.disabled) {
                e.currentTarget.style.color = '#3b82f6';
              }
            }}
            onMouseLeave={e => {
              if (activeTab !== tab.id && !tab.disabled) {
                e.currentTarget.style.color = '#9CA3AF';
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panel */}
      {activeTabData && (
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className="tab-panel"
          style={{
            padding: '24px 16px',
            outline: 'none',
          }}
        >
          {activeTabData.content}
        </div>
      )}

      <style>{`
        .tab-button:focus {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }

        .tab-button:focus:not(:focus-visible) {
          outline: none;
        }

        .tab-panel:focus {
          outline: 2px solid #3b82f6;
          outline-offset: -2px;
        }

        .tab-panel:focus:not(:focus-visible) {
          outline: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .tab-button {
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default AccessibleTabs;

