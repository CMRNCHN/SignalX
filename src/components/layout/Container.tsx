import React from 'react';
import './Container.css';

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  padding?: boolean;
  center?: boolean;
}

export const Container: React.FC<ContainerProps> = ({
  size = 'lg',
  padding = true,
  center = false,
  className = '',
  children,
  ...props
}) => {
  const baseClass = 'sx-container';
  const sizeClass = `sx-container--${size}`;
  const paddingClass = padding ? 'sx-container--padding' : '';
  const centerClass = center ? 'sx-container--center' : '';

  const classes = [
    baseClass,
    sizeClass,
    paddingClass,
    centerClass,
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

export default Container;
