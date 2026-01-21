import React from 'react';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  iconPosition = 'left',
  children,
  disabled,
  className = '',
  ...props
}) => {
  const baseClass = 'sx-button';
  const variantClass = `sx-button--${variant}`;
  const sizeClass = `sx-button--${size}`;
  const widthClass = fullWidth ? 'sx-button--full-width' : '';
  const loadingClass = loading ? 'sx-button--loading' : '';
  const iconOnlyClass = !children && icon ? 'sx-button--icon-only' : '';

  const classes = [
    baseClass,
    variantClass,
    sizeClass,
    widthClass,
    loadingClass,
    iconOnlyClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const iconElement = icon && (
    <span className={`sx-button__icon sx-button__icon--${iconPosition}`}>
      {icon}
    </span>
  );

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <span className="sx-button__spinner" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="8"
              cy="8"
              r="7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="32"
              strokeDashoffset="24"
            />
          </svg>
        </span>
      )}
      {!loading && iconPosition === 'left' && iconElement}
      {children && <span className="sx-button__content">{children}</span>}
      {!loading && iconPosition === 'right' && iconElement}
    </button>
  );
};

export default Button;
