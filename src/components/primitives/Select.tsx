import React from 'react';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  helperText,
  options,
  placeholder,
  size = 'md',
  fullWidth = false,
  className = '',
  id,
  ...props
}) => {
  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;
  const errorId = error ? `${selectId}-error` : undefined;
  const helperId = helperText ? `${selectId}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  const baseClass = 'sx-select';
  const sizeClass = `sx-select--${size}`;
  const errorClass = error ? 'sx-select--error' : '';
  const fullWidthClass = fullWidth ? 'sx-select--full-width' : '';

  const selectClasses = [
    baseClass,
    sizeClass,
    errorClass,
    fullWidthClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`sx-select-wrapper ${fullWidth ? 'sx-select-wrapper--full-width' : ''}`}>
      {label && (
        <label htmlFor={selectId} className="sx-select-label">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={selectClasses}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map(option => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <div id={errorId} className="sx-select-error" role="alert">
          {error}
        </div>
      )}
      {helperText && !error && (
        <div id={helperId} className="sx-select-helper">
          {helperText}
        </div>
      )}
    </div>
  );
};

export default Select;
