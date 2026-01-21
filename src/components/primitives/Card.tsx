import React from 'react';
import './Card.css';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = 'md',
  interactive = false,
  hoverable = false,
  className = '',
  children,
  ...props
}) => {
  const baseClass = 'sx-card';
  const variantClass = `sx-card--${variant}`;
  const paddingClass = `sx-card--padding-${padding}`;
  const interactiveClass = interactive ? 'sx-card--interactive' : '';
  const hoverableClass = hoverable ? 'sx-card--hoverable' : '';

  const classes = [
    baseClass,
    variantClass,
    paddingClass,
    interactiveClass,
    hoverableClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};

export default Card;
