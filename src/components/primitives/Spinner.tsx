import React from 'react';
import './Spinner.css';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary';
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  variant = 'primary',
  className = '',
  ...props
}) => {
  const baseClass = 'sx-spinner';
  const sizeClass = `sx-spinner--${size}`;
  const variantClass = `sx-spinner--${variant}`;

  const classes = [
    baseClass,
    sizeClass,
    variantClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role="status" aria-label="Loading" {...props}>
      <svg
        className="sx-spinner__svg"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          className="sx-spinner__circle"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="32"
          strokeDashoffset="24"
        />
      </svg>
      <span className="sx-spinner__sr-only">Loading...</span>
    </div>
  );
};

export default Spinner;
