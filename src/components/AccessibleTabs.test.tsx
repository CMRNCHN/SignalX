import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccessibleTabs, { Tab } from './AccessibleTabs';

const mockTabs: Tab[] = [
  { id: 'tab1', label: 'Tab 1', content: <div>Content 1</div> },
  { id: 'tab2', label: 'Tab 2', content: <div>Content 2</div> },
  { id: 'tab3', label: 'Tab 3', content: <div>Content 3</div> },
];

describe('AccessibleTabs', () => {
  it('renders all tabs', () => {
    render(<AccessibleTabs tabs={mockTabs} />);
    expect(screen.getByText('Tab 1')).toBeInTheDocument();
    expect(screen.getByText('Tab 2')).toBeInTheDocument();
    expect(screen.getByText('Tab 3')).toBeInTheDocument();
  });

  it('renders first tab as active by default', () => {
    render(<AccessibleTabs tabs={mockTabs} />);
    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    expect(tab1).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Content 1')).toBeInTheDocument();
  });

  it('renders specified default active tab', () => {
    render(<AccessibleTabs tabs={mockTabs} defaultActiveTab="tab2" />);
    const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
    expect(tab2).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });

  it('switches tabs on click', async () => {
    const user = userEvent.setup();
    render(<AccessibleTabs tabs={mockTabs} />);

    const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
    await user.click(tab2);

    expect(tab2).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });

  it('calls onChange when tab changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AccessibleTabs tabs={mockTabs} onChange={onChange} />);

    const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
    await user.click(tab2);

    expect(onChange).toHaveBeenCalledWith('tab2');
  });

  it('has correct ARIA attributes', () => {
    render(<AccessibleTabs tabs={mockTabs} />);

    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    expect(tab1).toHaveAttribute('id', 'tab-tab1');
    expect(tab1).toHaveAttribute('aria-controls', 'tabpanel-tab1');

    const tabpanel = screen.getByRole('tabpanel');
    expect(tabpanel).toHaveAttribute('id', 'tabpanel-tab1');
    expect(tabpanel).toHaveAttribute('aria-labelledby', 'tab-tab1');
  });

  it('handles keyboard navigation with arrow right', async () => {
    const user = userEvent.setup();
    render(<AccessibleTabs tabs={mockTabs} />);

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    tab1.focus();

    await user.keyboard('{ArrowRight}');

    const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
    expect(tab2).toHaveFocus();
    expect(tab2).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });

  it('handles keyboard navigation with arrow left', async () => {
    const user = userEvent.setup();
    render(<AccessibleTabs tabs={mockTabs} defaultActiveTab="tab2" />);

    const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
    tab2.focus();

    await user.keyboard('{ArrowLeft}');

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    expect(tab1).toHaveFocus();
    expect(tab1).toHaveAttribute('aria-selected', 'true');
  });

  it('wraps around when navigating past last tab', async () => {
    const user = userEvent.setup();
    render(<AccessibleTabs tabs={mockTabs} defaultActiveTab="tab3" />);

    const tab3 = screen.getByRole('tab', { name: 'Tab 3' });
    tab3.focus();

    await user.keyboard('{ArrowRight}');

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    expect(tab1).toHaveFocus();
    expect(tab1).toHaveAttribute('aria-selected', 'true');
  });

  it('wraps around when navigating before first tab', async () => {
    const user = userEvent.setup();
    render(<AccessibleTabs tabs={mockTabs} />);

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    tab1.focus();

    await user.keyboard('{ArrowLeft}');

    const tab3 = screen.getByRole('tab', { name: 'Tab 3' });
    expect(tab3).toHaveFocus();
    expect(tab3).toHaveAttribute('aria-selected', 'true');
  });

  it('handles Home key', async () => {
    const user = userEvent.setup();
    render(<AccessibleTabs tabs={mockTabs} defaultActiveTab="tab3" />);

    const tab3 = screen.getByRole('tab', { name: 'Tab 3' });
    tab3.focus();

    await user.keyboard('{Home}');

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    expect(tab1).toHaveFocus();
    expect(tab1).toHaveAttribute('aria-selected', 'true');
  });

  it('handles End key', async () => {
    const user = userEvent.setup();
    render(<AccessibleTabs tabs={mockTabs} />);

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    tab1.focus();

    await user.keyboard('{End}');

    const tab3 = screen.getByRole('tab', { name: 'Tab 3' });
    expect(tab3).toHaveFocus();
    expect(tab3).toHaveAttribute('aria-selected', 'true');
  });

  it('handles disabled tabs', async () => {
    const user = userEvent.setup();
    const tabsWithDisabled: Tab[] = [
      { id: 'tab1', label: 'Tab 1', content: <div>Content 1</div> },
      { id: 'tab2', label: 'Tab 2', content: <div>Content 2</div>, disabled: true },
      { id: 'tab3', label: 'Tab 3', content: <div>Content 3</div> },
    ];

    render(<AccessibleTabs tabs={tabsWithDisabled} />);

    const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
    expect(tab2).toBeDisabled();

    await user.click(tab2);
    expect(tab2).toHaveAttribute('aria-selected', 'false');
  });

  it('skips disabled tabs in keyboard navigation', async () => {
    const user = userEvent.setup();
    const tabsWithDisabled: Tab[] = [
      { id: 'tab1', label: 'Tab 1', content: <div>Content 1</div> },
      { id: 'tab2', label: 'Tab 2', content: <div>Content 2</div>, disabled: true },
      { id: 'tab3', label: 'Tab 3', content: <div>Content 3</div> },
    ];

    render(<AccessibleTabs tabs={tabsWithDisabled} />);

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    tab1.focus();

    await user.keyboard('{ArrowRight}');

    const tab3 = screen.getByRole('tab', { name: 'Tab 3' });
    expect(tab3).toHaveFocus();
  });

  it('supports vertical orientation', () => {
    render(<AccessibleTabs tabs={mockTabs} orientation="vertical" />);

    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('handles arrow up/down in vertical orientation', async () => {
    const user = userEvent.setup();
    render(<AccessibleTabs tabs={mockTabs} orientation="vertical" />);

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    tab1.focus();

    await user.keyboard('{ArrowDown}');

    const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
    expect(tab2).toHaveFocus();
    expect(tab2).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowUp}');

    expect(tab1).toHaveFocus();
    expect(tab1).toHaveAttribute('aria-selected', 'true');
  });

  it('applies custom className', () => {
    const { container } = render(
      <AccessibleTabs tabs={mockTabs} className="custom-tabs" />
    );
    expect(container.querySelector('.custom-tabs')).toBeInTheDocument();
  });

  it('only active tab has tabIndex 0', () => {
    render(<AccessibleTabs tabs={mockTabs} />);

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
    const tab3 = screen.getByRole('tab', { name: 'Tab 3' });

    expect(tab1).toHaveAttribute('tabindex', '0');
    expect(tab2).toHaveAttribute('tabindex', '-1');
    expect(tab3).toHaveAttribute('tabindex', '-1');
  });
});

