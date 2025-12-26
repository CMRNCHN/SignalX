# Accessibility ESLint Configuration

This ESLint configuration enforces accessibility best practices in your React code.

## Installation

```bash
npm install --save-dev eslint-plugin-jsx-a11y
```

## Configuration

Add to your `.eslintrc.js`:

```javascript
module.exports = {
  extends: [
    // ... your other extends
    'plugin:jsx-a11y/recommended',
  ],
  plugins: [
    // ... your other plugins
    'jsx-a11y',
  ],
  rules: {
    // Enforce alt text on images
    'jsx-a11y/alt-text': 'error',
    
    // Enforce aria-props are valid
    'jsx-a11y/aria-props': 'error',
    
    // Enforce aria-proptypes are valid
    'jsx-a11y/aria-proptypes': 'error',
    
    // Enforce aria-role is valid
    'jsx-a11y/aria-role': 'error',
    
    // Enforce aria-unsupported-elements
    'jsx-a11y/aria-unsupported-elements': 'error',
    
    // Enforce autocomplete attribute is used correctly
    'jsx-a11y/autocomplete-valid': 'error',
    
    // Enforce click events have key events
    'jsx-a11y/click-events-have-key-events': 'error',
    
    // Enforce heading elements have content
    'jsx-a11y/heading-has-content': 'error',
    
    // Enforce html element has lang attribute
    'jsx-a11y/html-has-lang': 'error',
    
    // Enforce iframe elements have title
    'jsx-a11y/iframe-has-title': 'error',
    
    // Enforce img elements have alt prop
    'jsx-a11y/img-redundant-alt': 'error',
    
    // Enforce that elements with interactive handlers have role
    'jsx-a11y/interactive-supports-focus': 'error',
    
    // Enforce label has associated control
    'jsx-a11y/label-has-associated-control': ['error', {
      labelComponents: ['Label'],
      labelAttributes: ['label'],
      controlComponents: ['Input', 'Select', 'TextArea'],
      depth: 3,
    }],
    
    // Enforce lang attribute has valid value
    'jsx-a11y/lang': 'error',
    
    // Enforce media elements have captions
    'jsx-a11y/media-has-caption': 'warn',
    
    // Enforce mouse events have key events
    'jsx-a11y/mouse-events-have-key-events': 'error',
    
    // Enforce no access key attribute
    'jsx-a11y/no-access-key': 'error',
    
    // Enforce no autofocus
    'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
    
    // Enforce no distracting elements
    'jsx-a11y/no-distracting-elements': 'error',
    
    // Enforce no interactive element to noninteractive role
    'jsx-a11y/no-interactive-element-to-noninteractive-role': 'error',
    
    // Enforce no noninteractive element interactions
    'jsx-a11y/no-noninteractive-element-interactions': ['error', {
      handlers: [
        'onClick',
        'onMouseDown',
        'onMouseUp',
        'onKeyPress',
        'onKeyDown',
        'onKeyUp',
      ],
    }],
    
    // Enforce no noninteractive element to interactive role
    'jsx-a11y/no-noninteractive-element-to-interactive-role': 'error',
    
    // Enforce no noninteractive tabindex
    'jsx-a11y/no-noninteractive-tabindex': 'error',
    
    // Enforce no redundant roles
    'jsx-a11y/no-redundant-roles': 'error',
    
    // Enforce no static element interactions
    'jsx-a11y/no-static-element-interactions': ['error', {
      handlers: [
        'onClick',
        'onMouseDown',
        'onMouseUp',
        'onKeyPress',
        'onKeyDown',
        'onKeyUp',
      ],
    }],
    
    // Enforce role attribute has valid value
    'jsx-a11y/role-has-required-aria-props': 'error',
    
    // Enforce role supports aria props
    'jsx-a11y/role-supports-aria-props': 'error',
    
    // Enforce scope attribute is only used on th elements
    'jsx-a11y/scope': 'error',
    
    // Enforce tabindex value is not greater than zero
    'jsx-a11y/tabindex-no-positive': 'error',
  },
};
```

## Custom Rules for SignalX

Add these additional rules specific to our accessibility framework:

```javascript
{
  rules: {
    // Enforce using our accessible components
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['react-modal', 'react-tabs', 'react-tooltip'],
        message: 'Use our accessible components from utils/a11y instead',
      }],
    }],
    
    // Warn about direct DOM manipulation that might affect accessibility
    'no-restricted-properties': ['warn', {
      object: 'document',
      property: 'getElementById',
      message: 'Prefer React refs for DOM access',
    }],
  },
}
```

## VS Code Integration

Add to `.vscode/settings.json`:

```json
{
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.options": {
    "extensions": [".js", ".jsx", ".ts", ".tsx"]
  }
}
```

## Pre-commit Hook

Add to your pre-commit hook to enforce accessibility:

```bash
#!/bin/sh
# .git/hooks/pre-commit

# Run ESLint on staged files
npx lint-staged
```

`package.json`:
```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": [
      "eslint --fix",
      "git add"
    ]
  }
}
```

## CI/CD Integration

Add to your CI workflow:

```yaml
# .github/workflows/accessibility.yml
name: Accessibility Checks

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run lint
      - run: npm run test:a11y
```

## Common Fixes

### 1. Missing alt text
```tsx
// ❌ Bad
<img src="avatar.jpg" />

// ✅ Good
<img src="avatar.jpg" alt="User avatar" />

// ✅ Good (decorative)
<img src="decoration.svg" alt="" role="presentation" />
```

### 2. Click without keyboard handler
```tsx
// ❌ Bad
<div onClick={handleClick}>Click me</div>

// ✅ Good
<button onClick={handleClick}>Click me</button>

// ✅ Good (if div is necessary)
<div 
  role="button" 
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
>
  Click me
</div>
```

### 3. Missing label
```tsx
// ❌ Bad
<input type="text" placeholder="Name" />

// ✅ Good
<label htmlFor="name">Name</label>
<input id="name" type="text" />

// ✅ Good (using aria-label)
<input type="text" aria-label="Name" />
```

### 4. Positive tabindex
```tsx
// ❌ Bad
<button tabIndex={1}>Click me</button>

// ✅ Good
<button>Click me</button>

// ✅ Good (explicitly focusable)
<button tabIndex={0}>Click me</button>

// ✅ Good (explicitly not focusable)
<button tabIndex={-1}>Click me</button>
```

## Disabling Rules

Only disable rules when absolutely necessary and with explanation:

```tsx
{/* eslint-disable-next-line jsx-a11y/no-autofocus */}
<input autoFocus /> {/* Intentional autofocus for modal input */}
```

## Resources

- [eslint-plugin-jsx-a11y Rules](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Practices](https://www.w3.org/WAI/ARIA/apg/)


