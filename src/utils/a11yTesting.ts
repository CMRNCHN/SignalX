/**
 * Accessibility Testing Utilities
 * Helper functions for testing accessibility in development
 */

export interface A11yIssue {
  severity: 'error' | 'warning' | 'info';
  element: HTMLElement;
  message: string;
  suggestion?: string;
}

/**
 * Check for common accessibility issues in the DOM
 */
export const checkA11y = (container: HTMLElement = document.body): A11yIssue[] => {
  const issues: A11yIssue[] = [];

  // Check images for alt text
  const images = container.querySelectorAll('img');
  images.forEach(img => {
    if (!img.hasAttribute('alt')) {
      issues.push({
        severity: 'error',
        element: img,
        message: 'Image missing alt attribute',
        suggestion:
          'Add alt="" for decorative images or descriptive alt text for meaningful images',
      });
    }
  });

  // Check buttons for accessible names
  const buttons = container.querySelectorAll('button');
  buttons.forEach(button => {
    const hasText = button.textContent?.trim();
    const hasAriaLabel = button.hasAttribute('aria-label');
    const hasAriaLabelledby = button.hasAttribute('aria-labelledby');
    const hasTitle = button.hasAttribute('title');

    if (!hasText && !hasAriaLabel && !hasAriaLabelledby && !hasTitle) {
      issues.push({
        severity: 'error',
        element: button,
        message: 'Button has no accessible name',
        suggestion: 'Add text content, aria-label, or aria-labelledby attribute',
      });
    }
  });

  // Check form inputs for labels
  const inputs = container.querySelectorAll('input, textarea, select');
  inputs.forEach(input => {
    if (input.getAttribute('type') === 'hidden') return;

    const id = input.getAttribute('id');
    const hasAriaLabel = input.hasAttribute('aria-label');
    const hasAriaLabelledby = input.hasAttribute('aria-labelledby');
    const hasLabel = id && container.querySelector(`label[for="${id}"]`);

    if (!hasAriaLabel && !hasAriaLabelledby && !hasLabel) {
      issues.push({
        severity: 'error',
        element: input as HTMLElement,
        message: 'Form control missing label',
        suggestion: 'Associate with a <label> element or add aria-label attribute',
      });
    }
  });

  // Check links for text
  const links = container.querySelectorAll('a');
  links.forEach(link => {
    const hasText = link.textContent?.trim();
    const hasAriaLabel = link.hasAttribute('aria-label');
    const hasAriaLabelledby = link.hasAttribute('aria-labelledby');

    if (!hasText && !hasAriaLabel && !hasAriaLabelledby) {
      issues.push({
        severity: 'error',
        element: link,
        message: 'Link has no accessible name',
        suggestion: 'Add text content, aria-label, or aria-labelledby attribute',
      });
    }

    if (
      hasText &&
      (hasText.toLowerCase() === 'click here' || hasText.toLowerCase() === 'read more')
    ) {
      issues.push({
        severity: 'warning',
        element: link,
        message: 'Link text is not descriptive',
        suggestion: 'Use descriptive link text that makes sense out of context',
      });
    }
  });

  // Check for duplicate IDs
  const ids = new Map<string, HTMLElement[]>();
  container.querySelectorAll('[id]').forEach(element => {
    const id = element.getAttribute('id');
    if (id) {
      if (!ids.has(id)) {
        ids.set(id, []);
      }
      ids.get(id)!.push(element as HTMLElement);
    }
  });

  ids.forEach((elements, id) => {
    if (elements.length > 1) {
      elements.forEach(element => {
        issues.push({
          severity: 'error',
          element,
          message: `Duplicate ID: "${id}"`,
          suggestion: 'IDs must be unique within the document',
        });
      });
    }
  });

  // Check for missing landmarks
  const hasMain = container.querySelector('main, [role="main"]');
  if (!hasMain && container === document.body) {
    issues.push({
      severity: 'warning',
      element: container,
      message: 'Page missing main landmark',
      suggestion: 'Add a <main> element or role="main"',
    });
  }

  // Check tab order
  const focusableElements = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );

  focusableElements.forEach(element => {
    const tabIndex = element.getAttribute('tabindex');
    if (tabIndex && parseInt(tabIndex) > 0) {
      issues.push({
        severity: 'warning',
        element,
        message: 'Positive tabindex found',
        suggestion: 'Avoid positive tabindex values; arrange elements in DOM order instead',
      });
    }
  });

  return issues;
};

/**
 * Log accessibility issues to console
 */
export const logA11yIssues = (container?: HTMLElement): void => {
  const issues = checkA11y(container);

  if (issues.length === 0) {
    console.log('%c✓ No accessibility issues found!', 'color: #10b981; font-weight: bold');
    return;
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const info = issues.filter(i => i.severity === 'info');

  console.group(
    `%c⚠️ Found ${issues.length} accessibility issues`,
    'font-weight: bold; font-size: 14px'
  );

  if (errors.length > 0) {
    console.group(`%c❌ ${errors.length} Errors`, 'color: #ef4444; font-weight: bold');
    errors.forEach(issue => {
      console.group(issue.message);
      console.log('Element:', issue.element);
      if (issue.suggestion) {
        console.log('%cSuggestion:', 'font-weight: bold', issue.suggestion);
      }
      console.groupEnd();
    });
    console.groupEnd();
  }

  if (warnings.length > 0) {
    console.group(`%c⚠️ ${warnings.length} Warnings`, 'color: #f59e0b; font-weight: bold');
    warnings.forEach(issue => {
      console.group(issue.message);
      console.log('Element:', issue.element);
      if (issue.suggestion) {
        console.log('%cSuggestion:', 'font-weight: bold', issue.suggestion);
      }
      console.groupEnd();
    });
    console.groupEnd();
  }

  if (info.length > 0) {
    console.group(`%cℹ️ ${info.length} Info`, 'color: #3b82f6; font-weight: bold');
    info.forEach(issue => {
      console.group(issue.message);
      console.log('Element:', issue.element);
      if (issue.suggestion) {
        console.log('%cSuggestion:', 'font-weight: bold', issue.suggestion);
      }
      console.groupEnd();
    });
    console.groupEnd();
  }

  console.groupEnd();
};

/**
 * Test keyboard navigation
 */
export const testKeyboardNav = (): void => {
  const focusableElements = Array.from(
    document.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );

  console.group('%c⌨️ Keyboard Navigation Test', 'font-weight: bold; font-size: 14px');
  console.log(`Found ${focusableElements.length} focusable elements`);

  const issues: string[] = [];

  focusableElements.forEach((element, index) => {
    // Check if element is visible
    const style = window.getComputedStyle(element);
    const isVisible =
      style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;

    if (!isVisible && element.tabIndex >= 0) {
      issues.push(`Element ${index + 1} is focusable but not visible: ${element.tagName}`);
    }

    // Check for focus styles
    const focusStyle = window.getComputedStyle(element, ':focus');
    const hasFocusOutline = focusStyle.outline !== 'none' && focusStyle.outline !== '';

    if (!hasFocusOutline && !element.classList.contains('focus-visible')) {
      issues.push(`Element ${index + 1} may lack visible focus indicator: ${element.tagName}`);
    }
  });

  if (issues.length === 0) {
    console.log('%c✓ No keyboard navigation issues found!', 'color: #10b981; font-weight: bold');
  } else {
    console.group(`%c⚠️ Found ${issues.length} issues`, 'color: #f59e0b; font-weight: bold');
    issues.forEach(issue => console.log(issue));
    console.groupEnd();
  }

  console.log('\n%cTest keyboard navigation manually:', 'font-weight: bold');
  console.log('1. Press Tab to move through interactive elements');
  console.log('2. Press Shift+Tab to move backwards');
  console.log('3. Verify focus indicator is visible');
  console.log('4. Verify tab order follows visual order');
  console.groupEnd();
};

/**
 * Check color contrast (simplified check)
 */
export const checkContrast = (container: HTMLElement = document.body): void => {
  console.group('%c🎨 Color Contrast Check', 'font-weight: bold; font-size: 14px');
  console.log('Note: Use automated tools like axe DevTools for accurate contrast checking');
  console.log('WCAG AA requires:');
  console.log('- 4.5:1 for normal text');
  console.log('- 3:1 for large text (18pt+ or 14pt+ bold)');
  console.log('- 3:1 for UI components and graphics');
  console.groupEnd();
};

/**
 * Development-only accessibility checker that runs on mount
 */
export const enableA11yChecking = (): void => {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  console.log(
    '%c🔍 Accessibility Checker Enabled',
    'color: #3b82f6; font-weight: bold; font-size: 16px'
  );
  console.log('Run these commands in console:');
  console.log('  window.checkA11y() - Check for accessibility issues');
  console.log('  window.testKeyboardNav() - Test keyboard navigation');
  console.log('  window.checkContrast() - View contrast requirements');

  // Add global helpers
  (window as any).checkA11y = () => logA11yIssues();
  (window as any).testKeyboardNav = testKeyboardNav;
  (window as any).checkContrast = checkContrast;

  // Run initial check
  setTimeout(() => {
    console.log('\n%cInitial accessibility check:', 'font-weight: bold');
    logA11yIssues();
  }, 1000);
};

/**
 * Generate accessibility report
 */
export const generateA11yReport = (container?: HTMLElement): string => {
  const issues = checkA11y(container);
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  let report = '# Accessibility Report\n\n';
  report += `Generated: ${new Date().toLocaleString()}\n\n`;
  report += `## Summary\n\n`;
  report += `- Total Issues: ${issues.length}\n`;
  report += `- Errors: ${errors.length}\n`;
  report += `- Warnings: ${warnings.length}\n\n`;

  if (errors.length > 0) {
    report += `## Errors (${errors.length})\n\n`;
    errors.forEach((issue, index) => {
      report += `${index + 1}. **${issue.message}**\n`;
      report += `   - Element: \`${issue.element.tagName}\`\n`;
      if (issue.suggestion) {
        report += `   - Suggestion: ${issue.suggestion}\n`;
      }
      report += '\n';
    });
  }

  if (warnings.length > 0) {
    report += `## Warnings (${warnings.length})\n\n`;
    warnings.forEach((issue, index) => {
      report += `${index + 1}. **${issue.message}**\n`;
      report += `   - Element: \`${issue.element.tagName}\`\n`;
      if (issue.suggestion) {
        report += `   - Suggestion: ${issue.suggestion}\n`;
      }
      report += '\n';
    });
  }

  return report;
};
