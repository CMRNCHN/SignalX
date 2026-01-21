import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders with default size and variant', () => {
    const { container } = render(<Spinner />);
    const spinner = container.querySelector('.sx-spinner');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('sx-spinner--md');
    expect(spinner).toHaveClass('sx-spinner--primary');
  });

  it('renders with different sizes', () => {
    const { container, rerender } = render(<Spinner size="sm" />);
    expect(container.querySelector('.sx-spinner')).toHaveClass('sx-spinner--sm');

    rerender(<Spinner size="lg" />);
    expect(container.querySelector('.sx-spinner')).toHaveClass('sx-spinner--lg');
  });

  it('renders with different variants', () => {
    const { container, rerender } = render(<Spinner variant="secondary" />);
    expect(container.querySelector('.sx-spinner')).toHaveClass('sx-spinner--secondary');

    rerender(<Spinner variant="primary" />);
    expect(container.querySelector('.sx-spinner')).toHaveClass('sx-spinner--primary');
  });

  it('has accessibility attributes', () => {
    const { container } = render(<Spinner />);
    const spinner = container.querySelector('.sx-spinner');
    expect(spinner).toHaveAttribute('role', 'status');
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
  });
});
