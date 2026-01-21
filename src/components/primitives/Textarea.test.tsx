import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('renders with label', () => {
    render(<Textarea label="Description" id="desc" />);
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<Textarea label="Description" error="Required" id="desc" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows helper text', () => {
    render(<Textarea label="Description" helperText="Enter a description" id="desc" />);
    expect(screen.getByText('Enter a description')).toBeInTheDocument();
  });

  it('applies size classes', () => {
    const { container, rerender } = render(<Textarea size="sm" id="desc" />);
    expect(container.querySelector('.sx-textarea')).toHaveClass('sx-textarea--sm');

    rerender(<Textarea size="lg" id="desc" />);
    expect(container.querySelector('.sx-textarea')).toHaveClass('sx-textarea--lg');
  });

  it('applies resize classes', () => {
    const { container, rerender } = render(<Textarea resize="none" id="desc" />);
    expect(container.querySelector('.sx-textarea')).toHaveClass('sx-textarea--resize-none');

    rerender(<Textarea resize="both" id="desc" />);
    expect(container.querySelector('.sx-textarea')).toHaveClass('sx-textarea--resize-both');
  });
});
