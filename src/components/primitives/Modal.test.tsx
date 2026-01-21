import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders when open is true', () => {
    render(
      <Modal open={true} onClose={() => {}}>
        Modal Content
      </Modal>
    );
    expect(screen.getByText('Modal Content')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(
      <Modal open={false} onClose={() => {}}>
        Modal Content
      </Modal>
    );
    expect(screen.queryByText('Modal Content')).not.toBeInTheDocument();
  });

  it('displays title when provided', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test Modal">
        Content
      </Modal>
    );
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <Modal open={true} onClose={handleClose} title="Test Modal">
        Content
      </Modal>
    );
    const closeButton = screen.getByLabelText('Close modal');
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay is clicked and closeOnOverlayClick is true', () => {
    const handleClose = vi.fn();
    render(
      <Modal open={true} onClose={handleClose} closeOnOverlayClick={true}>
        Content
      </Modal>
    );
    const overlay = screen.getByRole('dialog');
    fireEvent.click(overlay);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('applies size classes', () => {
    const { container, rerender } = render(
      <Modal open={true} onClose={() => {}} size="sm">
        Content
      </Modal>
    );
    expect(container.querySelector('.sx-modal')).toHaveClass('sx-modal--sm');

    rerender(
      <Modal open={true} onClose={() => {}} size="lg">
        Content
      </Modal>
    );
    expect(container.querySelector('.sx-modal')).toHaveClass('sx-modal--lg');
  });
});
