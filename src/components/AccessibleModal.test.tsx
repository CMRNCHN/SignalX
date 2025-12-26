import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccessibleModal from './AccessibleModal';

describe('AccessibleModal', () => {
  beforeEach(() => {
    // Reset body overflow
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <AccessibleModal isOpen={false} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </AccessibleModal>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when isOpen is true', () => {
    render(
      <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </AccessibleModal>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('has correct ARIA attributes', () => {
    render(
      <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </AccessibleModal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
  });

  it('prevents body scroll when open', () => {
    render(
      <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </AccessibleModal>
    );
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll when closed', () => {
    const { rerender } = render(
      <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </AccessibleModal>
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <AccessibleModal isOpen={false} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </AccessibleModal>
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <AccessibleModal isOpen={true} onClose={onClose} title="Test Modal">
        <p>Modal content</p>
      </AccessibleModal>
    );

    const closeButton = screen.getByLabelText('Close');
    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <AccessibleModal isOpen={true} onClose={onClose} title="Test Modal">
        <p>Modal content</p>
      </AccessibleModal>
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking backdrop', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <AccessibleModal isOpen={true} onClose={onClose} title="Test Modal">
        <p>Modal content</p>
      </AccessibleModal>
    );

    const overlay = screen.getByRole('presentation');
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking modal content', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <AccessibleModal isOpen={true} onClose={onClose} title="Test Modal">
        <p>Modal content</p>
      </AccessibleModal>
    );

    const content = screen.getByText('Modal content');
    await user.click(content);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('traps focus within modal', async () => {
    const user = userEvent.setup();
    render(
      <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal">
        <button>Button 1</button>
        <button>Button 2</button>
      </AccessibleModal>
    );

    await waitFor(() => {
      const closeButton = screen.getByLabelText('Close');
      expect(closeButton).toHaveFocus();
    });

    const button1 = screen.getByText('Button 1');
    const button2 = screen.getByText('Button 2');
    const closeButton = screen.getByLabelText('Close');

    // Tab through elements
    await user.tab();
    expect(button1).toHaveFocus();

    await user.tab();
    expect(button2).toHaveFocus();

    // Tab should cycle back to close button
    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it('applies correct size styles', () => {
    const { rerender } = render(
      <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal" size="small">
        <p>Content</p>
      </AccessibleModal>
    );
    let dialog = screen.getByRole('dialog');
    expect(dialog.style.maxWidth).toBe('400px');

    rerender(
      <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal" size="medium">
        <p>Content</p>
      </AccessibleModal>
    );
    dialog = screen.getByRole('dialog');
    expect(dialog.style.maxWidth).toBe('600px');

    rerender(
      <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal" size="large">
        <p>Content</p>
      </AccessibleModal>
    );
    dialog = screen.getByRole('dialog');
    expect(dialog.style.maxWidth).toBe('900px');
  });

  it('applies custom className', () => {
    render(
      <AccessibleModal
        isOpen={true}
        onClose={() => {}}
        title="Test Modal"
        className="custom-modal"
      >
        <p>Content</p>
      </AccessibleModal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('custom-modal');
  });

  it('restores focus to previously focused element when closed', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <div>
        <button>Previous Button</button>
        <AccessibleModal isOpen={false} onClose={() => {}} title="Test Modal">
          <p>Content</p>
        </AccessibleModal>
      </div>
    );

    const previousButton = screen.getByText('Previous Button');
    previousButton.focus();
    expect(previousButton).toHaveFocus();

    // Open modal
    rerender(
      <div>
        <button>Previous Button</button>
        <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal">
          <p>Content</p>
        </AccessibleModal>
      </div>
    );

    // Wait for focus to move to modal
    await waitFor(() => {
      expect(previousButton).not.toHaveFocus();
    });

    // Close modal
    rerender(
      <div>
        <button>Previous Button</button>
        <AccessibleModal isOpen={false} onClose={() => {}} title="Test Modal">
          <p>Content</p>
        </AccessibleModal>
      </div>
    );

    // Focus should be restored to previous button
    await waitFor(() => {
      expect(previousButton).toHaveFocus();
    });
  });
});

