# Component Migration Guide

This guide helps migrate existing components to use the new UI primitives from the design system.

## Overview

The SignalX design system provides reusable UI primitives that ensure consistency, accessibility, and maintainability. This guide shows how to migrate from custom-styled components to the new primitives.

## Primitives Available

- **Button** - Replaces custom `<button>` elements
- **Input** - Replaces custom `<input>` elements
- **Textarea** - Replaces custom `<textarea>` elements
- **Select** - Replaces custom `<select>` elements
- **Card** - Replaces custom card/container divs
- **Badge** - Replaces custom badge/notification spans

## Migration Patterns

### Button Migration

**Before:**
```tsx
<button
  onClick={handleClick}
  style={{
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #374151",
    background: "#111827",
    color: "#e5e7eb",
    cursor: "pointer",
    fontSize: 12,
  }}
>
  Click me
</button>
```

**After:**
```tsx
import { Button } from "./primitives";

<Button variant="secondary" size="sm" onClick={handleClick}>
  Click me
</Button>
```

**Variants:**
- `primary` - Main action button (default)
- `secondary` - Secondary action
- `tertiary` - Tertiary action
- `danger` - Destructive action
- `ghost` - Minimal styling

**Sizes:**
- `sm` - Small
- `md` - Medium (default)
- `lg` - Large

### Input Migration

**Before:**
```tsx
<input
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="Enter text..."
  style={{
    padding: 10,
    borderRadius: 10,
    border: "1px solid #374151",
    background: "#111827",
    color: "#e5e7eb",
  }}
/>
```

**After:**
```tsx
import { Input } from "./primitives";

<Input
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="Enter text..."
  fullWidth
/>
```

**Features:**
- Automatic label/error/helper text support
- Built-in accessibility (ARIA attributes)
- Consistent styling via design tokens
- Size variants: `sm`, `md`, `lg`

### Select Migration

**Before:**
```tsx
<select
  value={selected}
  onChange={(e) => setSelected(e.target.value)}
  style={{
    padding: "6px 8px",
    backgroundColor: "#272c33",
    border: "1px solid #3a4149",
    borderRadius: "6px",
    color: "#cbd2d9",
  }}
>
  <option value="1">Option 1</option>
  <option value="2">Option 2</option>
</select>
```

**After:**
```tsx
import { Select } from "./primitives";

<Select
  value={selected}
  onChange={(e) => setSelected(e.target.value)}
  options={[
    { value: "1", label: "Option 1" },
    { value: "2", label: "Option 2" },
  ]}
  size="sm"
  fullWidth
/>
```

### Badge Migration

**Before:**
```tsx
<span
  style={{
    backgroundColor: "#FFB1A8",
    color: "#1A1C1F",
    borderRadius: "10px",
    padding: "2px 6px",
    fontSize: "0.7rem",
    fontWeight: 600,
  }}
>
  {count}
</span>
```

**After:**
```tsx
import { Badge } from "./primitives";

<Badge variant="error" size="sm">
  {count}
</Badge>
```

**Variants:**
- `default` - Neutral
- `primary` - Primary accent
- `success` - Success state
- `warning` - Warning state
- `error` - Error state
- `info` - Informational

### Card Migration

**Before:**
```tsx
<div
  style={{
    backgroundColor: "#272c33",
    border: "1px solid #3a4149",
    borderRadius: "10px",
    padding: "16px",
  }}
>
  Content
</div>
```

**After:**
```tsx
import { Card } from "./primitives";

<Card variant="elevated" padding="md">
  Content
</Card>
```

## Design Tokens

All primitives use CSS variables from `src/styles/tokens.css`. When migrating, replace hardcoded values with tokens:

**Color Tokens:**
- `var(--color-primary)` - Primary accent
- `var(--color-text-primary)` - Main text
- `var(--color-text-secondary)` - Secondary text
- `var(--color-background-dark)` - Background
- `var(--color-surface)` - Surface/elevated background
- `var(--color-border-primary)` - Borders

**Spacing Tokens:**
- `var(--spacing-xs)` - 4px
- `var(--spacing-sm)` - 8px
- `var(--spacing-md)` - 12px
- `var(--spacing-lg)` - 16px
- `var(--spacing-xl)` - 24px

**Typography Tokens:**
- `var(--font-size-sm)` - 13px
- `var(--font-size-base)` - 14px
- `var(--font-size-lg)` - 16px
- `var(--font-family-base)` - Inter

## Accessibility

All primitives include:
- Proper ARIA attributes
- Keyboard navigation support
- Focus management
- Screen reader support

When migrating, ensure:
1. Labels are properly associated
2. Error messages use `role="alert"`
3. Disabled states are properly indicated
4. Focus states are visible

## Examples

See the following files for complete migration examples:
- `src/components/Sidebar.tsx` - Button and Select usage
- `src/components/NewMessageModal.tsx` - Input and Button usage
- `src/components/ThreadsPanel.tsx` - Input, Button, and Badge usage
- `src/components/ChatPanel.tsx` - Complete primitive integration

## Benefits

Migrating to primitives provides:
- ✅ Consistent design across the app
- ✅ Built-in accessibility
- ✅ Easier maintenance
- ✅ Better performance (shared styles)
- ✅ Type safety (TypeScript)
- ✅ Design system compliance

## Questions?

For more information, see:
- `docs/components/README.md` - Component documentation
- `src/components/primitives/` - Source code
- `src/styles/tokens.css` - Design tokens
