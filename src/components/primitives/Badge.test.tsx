import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders with text', () => {
    render(<Badge>5</Badge>);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('applies variant classes', () => {
    const { container, rerender } = render(<Badge variant="primary">Primary</Badge>);
    expect(container.firstChild).toHaveClass('sx-badge--primary');

    rerender(<Badge variant="error">Error</Badge>);
    expect(container.firstChild).toHaveClass('sx-badge--error');
  });

  it('applies size classes', () => {
    const { container, rerender } = render(<Badge size="sm">Small</Badge>);
    expect(container.firstChild).toHaveClass('sx-badge--sm');

    rerender(<Badge size="lg">Large</Badge>);
    expect(container.firstChild).toHaveClass('sx-badge--lg');
  });

  it('renders as dot when dot prop is true', () => {
    const { container } = render(<Badge dot />);
    expect(container.firstChild).toHaveClass('sx-badge--dot');
    expect(container.firstChild).toBeEmptyDOMElement();
  });
});
