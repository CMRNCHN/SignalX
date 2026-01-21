import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies variant classes', () => {
    const { container, rerender } = render(<Card variant="default">Default</Card>);
    expect(container.firstChild).toHaveClass('sx-card--default');

    rerender(<Card variant="elevated">Elevated</Card>);
    expect(container.firstChild).toHaveClass('sx-card--elevated');
  });

  it('applies padding classes', () => {
    const { container, rerender } = render(<Card padding="sm">Small</Card>);
    expect(container.firstChild).toHaveClass('sx-card--padding-sm');

    rerender(<Card padding="lg">Large</Card>);
    expect(container.firstChild).toHaveClass('sx-card--padding-lg');
  });

  it('applies interactive class when interactive', () => {
    const { container } = render(<Card interactive>Interactive</Card>);
    expect(container.firstChild).toHaveClass('sx-card--interactive');
  });

  it('applies hoverable class when hoverable', () => {
    const { container } = render(<Card hoverable>Hoverable</Card>);
    expect(container.firstChild).toHaveClass('sx-card--hoverable');
  });
});
