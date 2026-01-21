import React from 'react';
import './Textarea.css';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  helperText,
  size = 'md',
  fullWidth = false,
  resize = 'vertical',
  className = '',
  id,
  ...props
}) => {
  const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
  const errorId = error ? `${textareaId}-error` : undefined;
  const helperId = helperText ? `${textareaId}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  const baseClass = 'sx-textarea';
  const sizeClass = `sx-textarea--${size}`;
  const errorClass = error ? 'sx-textarea--error' : '';
  const fullWidthClass = fullWidth ? 'sx-textarea--full-width' : '';
  const resizeClass = `sx-textarea--resize-${resize}`;

  const textareaClasses = [
    baseClass,
    sizeClass,
    errorClass,
    fullWidthClass,
    resizeClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`sx-textarea-wrapper ${fullWidth ? 'sx-textarea-wrapper--full-width' : ''}`}>
      {label && (
        <label htmlFor={textareaId} className="sx-textarea-label">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={textareaClasses}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {error && (
        <div id={errorId} className="sx-textarea-error" role="alert">
          {error}
        </div>
      )}
      {helperText && !error && (
        <div id={helperId} className="sx-textarea-helper">
          {helperText}
        </div>
      )}
    </div>
  );
};

export default Textarea;
