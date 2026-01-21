import React from 'react';
import './Badge.css';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  dot = false,
  className = '',
  children,
  ...props
}) => {
  const baseClass = 'sx-badge';
  const variantClass = `sx-badge--${variant}`;
  const sizeClass = `sx-badge--${size}`;
  const dotClass = dot ? 'sx-badge--dot' : '';

  const classes = [
    baseClass,
    variantClass,
    sizeClass,
    dotClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...props}>
      {!dot && children}
    </span>
  );
};

export default Badge;
