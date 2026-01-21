import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Toast } from './Toast';

describe('Toast', () => {
  it('renders with message', () => {
    const handleDismiss = vi.fn();
    render(
      <Toast
        id="test-1"
        message="Test message"
        onDismiss={handleDismiss}
      />
    );
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('renders with different types', () => {
    const handleDismiss = vi.fn();
    const { container, rerender } = render(
      <Toast
        id="test-1"
        message="Success"
        type="success"
        onDismiss={handleDismiss}
      />
    );
    expect(container.querySelector('.sx-toast')).toHaveClass('sx-toast--success');

    rerender(
      <Toast
        id="test-1"
        message="Error"
        type="error"
        onDismiss={handleDismiss}
      />
    );
    expect(container.querySelector('.sx-toast')).toHaveClass('sx-toast--error');
  });

  it('calls onDismiss when close button is clicked', () => {
    const handleDismiss = vi.fn();
    render(
      <Toast
        id="test-1"
        message="Test"
        onDismiss={handleDismiss}
      />
    );
    const closeButton = screen.getByLabelText('Dismiss');
    closeButton.click();
    expect(handleDismiss).toHaveBeenCalledWith('test-1');
  });

  it('auto-dismisses after duration', async () => {
    const handleDismiss = vi.fn();
    render(
      <Toast
        id="test-1"
        message="Test"
        duration={100}
        onDismiss={handleDismiss}
      />
    );
    await waitFor(() => {
      expect(handleDismiss).toHaveBeenCalledWith('test-1');
    }, { timeout: 200 });
  });

  it('has accessibility attributes', () => {
    const handleDismiss = vi.fn();
    const { container } = render(
      <Toast
        id="test-1"
        message="Test"
        onDismiss={handleDismiss}
      />
    );
    const toast = container.querySelector('.sx-toast');
    expect(toast).toHaveAttribute('role', 'alert');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(toast).toHaveAttribute('aria-atomic', 'true');
  });
});
