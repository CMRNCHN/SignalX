import React from 'react';
import './Input.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  size = 'md',
  fullWidth = false,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  const baseClass = 'sx-input';
  const sizeClass = `sx-input--${size}`;
  const errorClass = error ? 'sx-input--error' : '';
  const fullWidthClass = fullWidth ? 'sx-input--full-width' : '';
  const hasLeftIconClass = leftIcon ? 'sx-input--has-left-icon' : '';
  const hasRightIconClass = rightIcon ? 'sx-input--has-right-icon' : '';

  const inputClasses = [
    baseClass,
    sizeClass,
    errorClass,
    fullWidthClass,
    hasLeftIconClass,
    hasRightIconClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`sx-input-wrapper ${fullWidth ? 'sx-input-wrapper--full-width' : ''}`}>
      {label && (
        <label htmlFor={inputId} className="sx-input-label">
          {label}
        </label>
      )}
      <div className="sx-input-container">
        {leftIcon && (
          <span className="sx-input-icon sx-input-icon--left" aria-hidden="true">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          className={inputClasses}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        {rightIcon && (
          <span className="sx-input-icon sx-input-icon--right" aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </div>
      {error && (
        <div id={errorId} className="sx-input-error" role="alert">
          {error}
        </div>
      )}
      {helperText && !error && (
        <div id={helperId} className="sx-input-helper">
          {helperText}
        </div>
      )}
    </div>
  );
};

export default Input;
