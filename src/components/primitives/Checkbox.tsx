import React from 'react';
import './Checkbox.css';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  label,
  error,
  helperText,
  size = 'md',
  fullWidth = false,
  className = '',
  id,
  children,
  ...props
}) => {
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;
  const errorId = error ? `${checkboxId}-error` : undefined;
  const helperId = helperText ? `${checkboxId}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  const baseClass = 'sx-checkbox';
  const sizeClass = `sx-checkbox--${size}`;
  const errorClass = error ? 'sx-checkbox--error' : '';
  const fullWidthClass = fullWidth ? 'sx-checkbox--full-width' : '';

  const checkboxClasses = [
    baseClass,
    sizeClass,
    errorClass,
    fullWidthClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const labelText = label || children;

  return (
    <div className={`sx-checkbox-wrapper ${fullWidth ? 'sx-checkbox-wrapper--full-width' : ''}`}>
      <label htmlFor={checkboxId} className={checkboxClasses}>
        <input
          id={checkboxId}
          type="checkbox"
          className="sx-checkbox__input"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        <span className="sx-checkbox__checkmark" aria-hidden="true">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 3L4.5 8.5L2 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {labelText && <span className="sx-checkbox__label">{labelText}</span>}
      </label>
      {error && (
        <div id={errorId} className="sx-checkbox-error" role="alert">
          {error}
        </div>
      )}
      {helperText && !error && (
        <div id={helperId} className="sx-checkbox-helper">
          {helperText}
        </div>
      )}
    </div>
  );
};

export default Checkbox;
