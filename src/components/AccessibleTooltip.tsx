import React, { useState, useRef, useId } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
}

/**
 * Accessible tooltip component
 * Uses aria-describedby for screen reader support
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 300,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const tooltipId = useId();

  const showTooltip = () => {
    setIsHovered(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    setIsHovered(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  // Position styles
  const getPositionStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      zIndex: 10000,
      backgroundColor: '#1A1C1F',
      color: '#E0E0E0',
      padding: '6px 10px',
      borderRadius: '6px',
      fontSize: '0.75rem',
      whiteSpace: 'nowrap',
      border: '1px solid #374151',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      pointerEvents: 'none',
    };

    switch (position) {
      case 'top':
        return {
          ...base,
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '8px',
        };
      case 'bottom':
        return {
          ...base,
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: '8px',
        };
      case 'left':
        return {
          ...base,
          right: '100%',
          top: '50%',
          transform: 'translateY(-50%)',
          marginRight: '8px',
        };
      case 'right':
        return {
          ...base,
          left: '100%',
          top: '50%',
          transform: 'translateY(-50%)',
          marginLeft: '8px',
        };
    }
  };

  // Clone child and add event handlers + aria
  const child = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      showTooltip();
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hideTooltip();
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      showTooltip();
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hideTooltip();
      children.props.onBlur?.(e);
    },
    'aria-describedby': tooltipId,
  });

  return (
    <div className={`tooltip-container ${className}`} style={{ position: 'relative', display: 'inline-block' }}>
      {child}
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          style={getPositionStyles()}
        >
          {content}
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              width: 0,
              height: 0,
              borderStyle: 'solid',
              ...(position === 'top' && {
                bottom: '-5px',
                left: '50%',
                transform: 'translateX(-50%)',
                borderWidth: '5px 5px 0 5px',
                borderColor: '#1A1C1F transparent transparent transparent',
              }),
              ...(position === 'bottom' && {
                top: '-5px',
                left: '50%',
                transform: 'translateX(-50%)',
                borderWidth: '0 5px 5px 5px',
                borderColor: 'transparent transparent #1A1C1F transparent',
              }),
              ...(position === 'left' && {
                right: '-5px',
                top: '50%',
                transform: 'translateY(-50%)',
                borderWidth: '5px 0 5px 5px',
                borderColor: 'transparent transparent transparent #1A1C1F',
              }),
              ...(position === 'right' && {
                left: '-5px',
                top: '50%',
                transform: 'translateY(-50%)',
                borderWidth: '5px 5px 5px 0',
                borderColor: 'transparent #1A1C1F transparent transparent',
              }),
            }}
          />
        </div>
      )}
    </div>
  );
};

// Example usage
export const TooltipExample: React.FC = () => {
  return (
    <div style={{ padding: '100px', display: 'flex', gap: '20px', justifyContent: 'center' }}>
      <Tooltip content="This is a top tooltip" position="top">
        <button
          style={{
            padding: '8px 16px',
            backgroundColor: '#374151',
            color: '#E0E0E0',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Top
        </button>
      </Tooltip>

      <Tooltip content="This is a bottom tooltip" position="bottom">
        <button
          style={{
            padding: '8px 16px',
            backgroundColor: '#374151',
            color: '#E0E0E0',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Bottom
        </button>
      </Tooltip>

      <Tooltip content="This is a left tooltip" position="left">
        <button
          style={{
            padding: '8px 16px',
            backgroundColor: '#374151',
            color: '#E0E0E0',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Left
        </button>
      </Tooltip>

      <Tooltip content="This is a right tooltip" position="right">
        <button
          style={{
            padding: '8px 16px',
            backgroundColor: '#374151',
            color: '#E0E0E0',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Right
        </button>
      </Tooltip>
    </div>
  );
};

