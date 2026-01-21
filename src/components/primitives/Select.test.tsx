import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

const options = [
  { value: '1', label: 'Option 1' },
  { value: '2', label: 'Option 2' },
  { value: '3', label: 'Option 3' },
];

describe('Select', () => {
  it('renders with label', () => {
    render(<Select label="Choose" options={options} id="select" />);
    expect(screen.getByLabelText('Choose')).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<Select label="Choose" error="Required" options={options} id="select" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows helper text', () => {
    render(<Select label="Choose" helperText="Select an option" options={options} id="select" />);
    expect(screen.getByText('Select an option')).toBeInTheDocument();
  });

  it('handles selection', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    
    render(<Select options={options} onChange={handleChange} id="select" />);
    const select = screen.getByRole('combobox');
    
    await user.selectOptions(select, '2');
    expect(handleChange).toHaveBeenCalled();
  });

  it('applies size classes', () => {
    const { container, rerender } = render(<Select size="sm" options={options} id="select" />);
    expect(container.querySelector('.sx-select')).toHaveClass('sx-select--sm');

    rerender(<Select size="lg" options={options} id="select" />);
    expect(container.querySelector('.sx-select')).toHaveClass('sx-select--lg');
  });
});
