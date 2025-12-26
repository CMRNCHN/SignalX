import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkipLink from './SkipLink';

describe('SkipLink', () => {
  it('renders with correct text', () => {
    render(<SkipLink href="#main">Skip to main content</SkipLink>);
    expect(screen.getByText('Skip to main content')).toBeInTheDocument();
  });

  it('has correct href attribute', () => {
    render(<SkipLink href="#main">Skip to main</SkipLink>);
    const link = screen.getByText('Skip to main') as HTMLAnchorElement;
    expect(link.href).toContain('#main');
  });

  it('applies custom className', () => {
    render(
      <SkipLink href="#main" className="custom-class">
        Skip to main
      </SkipLink>
    );
    const link = screen.getByText('Skip to main');
    expect(link.className).toContain('custom-class');
  });

  it('is initially positioned off-screen', () => {
    render(<SkipLink href="#main">Skip to main</SkipLink>);
    const link = screen.getByText('Skip to main') as HTMLElement;
    expect(link.style.top).toBe('-40px');
  });

  it('moves into view on focus', async () => {
    const user = userEvent.setup();
    render(<SkipLink href="#main">Skip to main</SkipLink>);
    const link = screen.getByText('Skip to main') as HTMLElement;
    
    await user.tab();
    expect(link.style.top).toBe('6px');
  });

  it('moves off-screen on blur', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <SkipLink href="#main">Skip to main</SkipLink>
        <button>Next element</button>
      </div>
    );
    const link = screen.getByText('Skip to main') as HTMLElement;
    
    await user.tab(); // Focus skip link
    expect(link.style.top).toBe('6px');
    
    await user.tab(); // Focus next element (blur skip link)
    expect(link.style.top).toBe('-40px');
  });

  it('is keyboard accessible', async () => {
    const user = userEvent.setup();
    render(<SkipLink href="#main">Skip to main</SkipLink>);
    const link = screen.getByText('Skip to main');
    
    await user.tab();
    expect(link).toHaveFocus();
  });

  it('has correct styling for accessibility', () => {
    render(<SkipLink href="#main">Skip to main</SkipLink>);
    const link = screen.getByText('Skip to main') as HTMLElement;
    
    expect(link.style.position).toBe('absolute');
    expect(link.style.zIndex).toBe('1000');
    expect(link.style.background).toBe('#000');
    expect(link.style.color).toBe('#fff');
  });
});

