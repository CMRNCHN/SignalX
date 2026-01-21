import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    
    render(<Button onClick={handleClick}>Click me</Button>);
    await user.click(screen.getByText('Click me'));
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByText('Disabled')).toBeDisabled();
  });

  it('shows loading state', () => {
    render(<Button loading>Loading</Button>);
    const button = screen.getByText('Loading');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });

  it('applies variant classes', () => {
    const { container, rerender } = render(<Button variant="primary">Primary</Button>);
    expect(container.firstChild).toHaveClass('sx-button--primary');

    rerender(<Button variant="secondary">Secondary</Button>);
    expect(container.firstChild).toHaveClass('sx-button--secondary');
  });

  it('applies size classes', () => {
    const { container, rerender } = render(<Button size="sm">Small</Button>);
    expect(container.firstChild).toHaveClass('sx-button--sm');

    rerender(<Button size="lg">Large</Button>);
    expect(container.firstChild).toHaveClass('sx-button--lg');
  });

  it('renders with icon', () => {
    const icon = <span data-testid="icon">⚙️</span>;
    render(<Button icon={icon}>Settings</Button>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});
