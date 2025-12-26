import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toast from './Toast';

describe('Toast', () => {
  const defaultProps = {
    message: 'Test message',
    type: 'info' as const,
    duration: 3000,
    onClose: vi.fn(),
  };

  it('renders with message', () => {
    render(<Toast {...defaultProps} />);
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('renders with different types', () => {
    const { rerender } = render(<Toast {...defaultProps} type="success" />);
    expect(screen.getByText('Test message')).toBeInTheDocument();

    rerender(<Toast {...defaultProps} type="error" />);
    expect(screen.getByText('Test message')).toBeInTheDocument();

    rerender(<Toast {...defaultProps} type="info" />);
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<Toast {...defaultProps} />);

    const closeButton = screen.getByRole('button', { name: /×/i });
    await user.click(closeButton);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-closes after duration', async () => {
    vi.useFakeTimers();
    render(<Toast {...defaultProps} duration={1000} />);

    expect(screen.getByText('Test message')).toBeInTheDocument();

    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    vi.useRealTimers();
  });

  it('has correct accessibility attributes', () => {
    render(<Toast {...defaultProps} />);
    const toast = screen.getByText('Test message').closest('div');
    expect(toast).toHaveAttribute('role', 'alert');
    expect(toast).toHaveAttribute('aria-live', 'polite');
  });
});



