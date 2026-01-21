import { render, screen, fireEvent } from '@testing-library/react';
import { Checkbox } from './Checkbox';
import { describe, it, expect, vi } from 'vitest';

describe('Checkbox', () => {
  it('renders with label', () => {
    render(<Checkbox label="Test checkbox" />);
    expect(screen.getByLabelText('Test checkbox')).toBeInTheDocument();
    expect(screen.getByText('Test checkbox')).toBeInTheDocument();
  });

  it('renders with children as label', () => {
    render(<Checkbox>Child label</Checkbox>);
    expect(screen.getByLabelText('Child label')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleChange = vi.fn();
    render(<Checkbox label="Test" onChange={handleChange} />);
    
    const checkbox = screen.getByLabelText('Test');
    fireEvent.click(checkbox);
    
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('is checked when checked prop is true', () => {
    render(<Checkbox label="Test" checked />);
    const checkbox = screen.getByLabelText('Test') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Checkbox label="Test" disabled />);
    const checkbox = screen.getByLabelText('Test');
    expect(checkbox).toBeDisabled();
  });

  it('shows error message', () => {
    render(<Checkbox label="Test" error="This is an error" />);
    expect(screen.getByText('This is an error')).toBeInTheDocument();
    expect(screen.getByText('This is an error')).toHaveAttribute('role', 'alert');
  });

  it('shows helper text', () => {
    render(<Checkbox label="Test" helperText="This is helpful" />);
    expect(screen.getByText('This is helpful')).toBeInTheDocument();
  });

  it('does not show helper text when error is present', () => {
    render(<Checkbox label="Test" error="Error" helperText="Helper" />);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.queryByText('Helper')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Checkbox label="Test" className="custom-checkbox" />);
    expect(screen.getByLabelText('Test').closest('.sx-checkbox')).toHaveClass('custom-checkbox');
  });

  it('applies size classes', () => {
    const { rerender } = render(<Checkbox label="Test" size="sm" />);
    expect(screen.getByLabelText('Test').closest('.sx-checkbox')).toHaveClass('sx-checkbox--sm');

    rerender(<Checkbox label="Test" size="lg" />);
    expect(screen.getByLabelText('Test').closest('.sx-checkbox')).toHaveClass('sx-checkbox--lg');
  });

  it('applies fullWidth class', () => {
    render(<Checkbox label="Test" fullWidth />);
    expect(screen.getByLabelText('Test').closest('.sx-checkbox-wrapper')).toHaveClass('sx-checkbox-wrapper--full-width');
  });
});
