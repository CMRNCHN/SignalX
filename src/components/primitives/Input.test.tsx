import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('renders with label', () => {
    render(<Input label="Email" id="email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<Input label="Email" error="Invalid email" id="email" />);
    expect(screen.getByText('Invalid email')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows helper text', () => {
    render(<Input label="Email" helperText="Enter your email address" id="email" />);
    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
  });

  it('renders with left icon', () => {
    const icon = <span data-testid="left-icon">🔍</span>;
    render(<Input leftIcon={icon} id="search" />);
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
  });

  it('applies size classes', () => {
    const { container, rerender } = render(<Input size="sm" id="input" />);
    expect(container.querySelector('.sx-input')).toHaveClass('sx-input--sm');

    rerender(<Input size="lg" id="input" />);
    expect(container.querySelector('.sx-input')).toHaveClass('sx-input--lg');
  });
});
