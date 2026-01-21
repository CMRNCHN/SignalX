# SignalX Component Library

This directory contains documentation for the SignalX component library.

## Component Architecture

The SignalX component library is organized into three main categories:

### 1. Primitives (`src/components/primitives/`)

Low-level, reusable UI components that form the foundation of the design system.

- **Button** - Interactive button component with multiple variants and sizes
- **Input** - Form input component with validation and icon support

These components are:
- Highly reusable
- Style-agnostic (use design tokens)
- Accessible by default
- Well-tested

### 2. Layout (`src/components/layout/`)

Components for structuring page layout and content organization.

- **Container** - Responsive container with size constraints and padding options

### 3. Feedback (`src/components/feedback/`)

Components for user feedback, error handling, and status communication.

- **ErrorBoundary** - Comprehensive error boundary with multiple levels (page, section, component)

## Design System

All components use the centralized design tokens defined in `src/styles/tokens.css`. These tokens provide:

- Consistent colors, spacing, typography
- Support for density variants (compact, normal, spacious)
- High contrast mode support
- Motion preference respect

## Usage Examples

### Button

```tsx
import { Button } from './components/primitives';

// Primary button
<Button variant="primary" size="md">Save</Button>

// Button with icon
<Button variant="secondary" icon={<Icon />} iconPosition="left">
  Export
</Button>

// Loading state
<Button variant="primary" loading>Processing...</Button>
```

### Input

```tsx
import { Input } from './components/primitives';

// Basic input
<Input label="Email" type="email" />

// Input with validation
<Input
  label="Password"
  type="password"
  error="Password must be at least 8 characters"
/>

// Input with icons
<Input
  label="Search"
  leftIcon={<SearchIcon />}
  rightIcon={<ClearIcon />}
/>
```

### ErrorBoundary

```tsx
import { ErrorBoundary } from './components/feedback';

// Page-level error boundary
<ErrorBoundary level="page" onError={handleError}>
  <App />
</ErrorBoundary>

// Section-level error boundary
<ErrorBoundary level="section">
  <ComplexComponent />
</ErrorBoundary>
```

## Component Guidelines

When creating new components:

1. **Use design tokens** - Never hardcode colors, spacing, or typography
2. **Follow naming conventions** - Use `sx-` prefix for CSS classes
3. **Ensure accessibility** - Include ARIA attributes, keyboard support
4. **Write tests** - Include unit and integration tests
5. **Document props** - Use TypeScript interfaces and JSDoc comments
6. **Export from index** - Add to appropriate `index.ts` file

## File Structure

```
src/components/
├── primitives/
│   ├── Button.tsx
│   ├── Button.css
│   ├── Input.tsx
│   ├── Input.css
│   └── index.ts
├── layout/
│   ├── Container.tsx
│   ├── Container.css
│   └── index.ts
├── feedback/
│   ├── ErrorBoundary.tsx
│   ├── ErrorBoundary.css
│   └── index.ts
└── [existing components...]
```

## Migration Guide

To migrate existing components to use the new primitives:

1. Replace custom button implementations with `<Button>`
2. Replace custom input implementations with `<Input>`
3. Wrap error-prone sections with `<ErrorBoundary>`
4. Update imports to use the new component structure

## Next Steps

- [ ] Add Card component
- [ ] Add Modal component (enhance existing)
- [ ] Add Select/Dropdown component
- [ ] Add Checkbox and Radio components
- [ ] Add Tooltip component (enhance existing)
- [ ] Add Badge component
- [ ] Add Skeleton loading components
