# Warm Paper Design System

## Overview

This design system has been extracted from design specifications to create a cohesive, warm, and professional aesthetic for the platform. The system emphasizes:

- **Warm paper canvas** with subtle, natural backgrounds
- **Light borders** with minimal shadows for a clean, uncluttered look
- **Big, confident typography** for page titles with subtle, quiet UI elements
- **8px grid system** with generous whitespace
- **Status communication** through colored dots and labels (not loud badges)

## Design Tokens

### Color System

#### Surface Colors
- `--surface-canvas`: #FCFCF4 (warm paper background)
- `--surface-base`: #FFFFFF (card and panel surfaces)
- `--surface-muted`: #F7F7F2 (muted background areas)
- `--border`: #E6E6E0 (light, subtle borders)

#### Text Colors
- `--text-strong`: #111111 (headings, strong emphasis)
- `--text-body`: #111111 (body text)
- `--text-muted`: #6B6B6B (secondary text)
- `--text-subtle`: #9A9A93 (tertiary text)

#### Action Colors
- `--action-primary-bg`: #4C64D4 (primary actions)
- `--action-secondary-bg`: #EEF0FF (secondary actions)
- `--action-destructive-bg`: #EC442C (destructive actions)

#### Status Colors
- **Success/Passing**: #2CA47C
- **Error/Failing**: #EC442C
- **Warning/Need Changes**: #F46414
- **Info/In Review**: #4C64D4
- **Progress**: #FCB414
- **Pending**: #9A9A93
- **Inactive**: #9A9A93

### Typography

**Font Family**: Inter (with SS Huchu and system fallbacks)

**Type Scale**:
- Display: 32px/700 (not commonly used)
- Page Title: 32px/700 (main page headings)
- Section Title: 20px/700 (section headings)
- Body: 14px/400 (default text)
- Field Label: 13px/600 (form labels)
- Table Header: 12px/600 uppercase (table column headers)
- Table Cell: 14px/500 (table content)
- Caption: 12px/500 (small text)

### Spacing (8px Grid)

- 4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px
- Content gutter: 24px (1.5rem)
- Section gutter: 24px (1.5rem)
- Table gutter: 12px (0.75rem)

### Border Radius

- Small: 6px
- Medium: 8px (default for inputs, buttons)
- Large: 12px (cards, popovers)
- Extra Large: 16px
- Pill: 9999px (for fully rounded elements)

### Shadows

**Minimal Approach** - Only use shadows for floating elements:
- Popover: `0 12px 24px -12px rgba(17, 17, 17, 0.18), 0 2px 6px rgba(17, 17, 17, 0.06)`
- Cards: Light 1px border (no heavy shadow)
- Buttons: Subtle inset border on rest, minimal lift on hover

## Core Components

### Button

**Sizes**:
- Default: 36px (h-9)
- Small: 32px (h-8)
- Large: 40px (h-10)

**Variants**:
- `default`: Primary filled button with primary color
- `secondary`: Light background with primary text
- `outline`: White background with border
- `ghost`: Transparent with subtle hover
- `destructive`: Red for dangerous actions
- `link`: Text-only with underline on hover

### Input

**Specifications**:
- Height: 36px (h-9)
- Border radius: 8px (rounded-md)
- 1px light border
- Focus: 2px ring at 35% opacity

### Card

**Specifications**:
- Border radius: 12px (rounded-lg)
- 1px light border
- No heavy shadow
- Padding: 16-24px

### Status Chip

**Design**:
- 8px colored dot + text label
- Font weight: 500
- Transparent background
- Status-based color mapping

Usage:
```tsx
<StatusChip status="passing" />
<StatusChip status="failing" label="Custom label" />
<StatusDot status="in-progress" />
```

### Popover/Menu

**Specifications**:
- Border radius: 12px
- Roomy padding: 12px
- Shadow: popover shadow
- Row height: ~40px

## Layout Patterns

### List Page Shell

Structure:
1. Page title (left) + primary action (right)
2. Tabs/segmented filters with count pills
3. Toolbar row: filter dropdown, search, group-by, export
4. Table/content

Usage:
```tsx
<ListPageShell>
  <ListPageHeader>
    <ListPageTitle>My List</ListPageTitle>
    <ListPageActions>
      <Button>Add Item</Button>
    </ListPageActions>
  </ListPageHeader>
  <ListPageTabs>{/* Tabs */}</ListPageTabs>
  <ListPageToolbar>{/* Filters */}</ListPageToolbar>
  <ListPageContent>{/* Table */}</ListPageContent>
</ListPageShell>
```

### Detail Page with Right Panel

Two-column layout:
- Main content: 680-760px fluid
- Right panel: 320-360px, sticky
- Right panel sections: Details → CTA → Evidence → Integrations

Usage:
```tsx
<DetailPageShell>
  <DetailMainContent>
    <DetailHeader>
      <DetailTitle>Item Name</DetailTitle>
      <DetailMeta>Metadata</DetailMeta>
    </DetailHeader>
    <DetailSection>Content</DetailSection>
  </DetailMainContent>
  <DetailRightPanel>
    <DetailCTABlock
      title="Submit for Review"
      progress={{ current: 2, total: 3, label: "Checks passing" }}
      action={<Button>Submit</Button>}
    />
    <DetailSection>Additional Info</DetailSection>
  </DetailRightPanel>
</DetailPageShell>
```

### Bulk Action Bar

Sticky bottom bar that appears when items are selected:
- Shows selection count
- Provides bulk actions
- Pill-shaped with soft shadow
- "Clear selection" option

## Chart Design System

### Global Chart Rules

- **Always in bordered cards**: 1px border, no heavy shadow
- **Gridlines**: Dashed (4px dash, 6px gap), very light
- **Axis labels**: 11-12px, muted color
- **No thick strokes**: Keep visual weight minimal
- **Bar radius**: 4px on top corners

### Chart Theme

```typescript
import { chartTheme, rechartsDefaults } from '@/lib/charts/theme';

// Use in Recharts components
<CartesianGrid {...rechartsDefaults.cartesianGrid} />
<XAxis {...rechartsDefaults.xAxis} />
<YAxis {...rechartsDefaults.yAxis} />
<Tooltip {...rechartsDefaults.tooltip} />
```

### Status-Based Colors

Charts use semantic color mapping:
- Passing: #2CA47C (green)
- Failing: #EC442C (red)
- Need Changes: #F46414 (orange)
- In Review: #4C64D4 (blue)
- In Progress: #FCB414 (yellow)
- Pending: #9A9A93 (gray)
- Inactive: #9A9A93 (gray) - use with hatch pattern

### Ignored Status Pattern

For "ignored" data in charts, use a hatch pattern with the inactive color:
```typescript
import { getIgnoredPattern } from '@/lib/charts/theme';
```

## App Shell Structure

### Sidebar

- Width: 256px (16rem)
- Background: Warm paper canvas
- Active item: Light highlight + thin left accent bar (primary color)
- Section headings: Uppercase 11-12px, muted

### Top Bar (Navbar)

- Height: 56px (14 * 0.25rem)
- Left: Sidebar trigger + breadcrumbs
- Center: Optional search
- Right: Notifications + page actions

### Content Padding

- Outer padding: 24px
- Section spacing: 24px vertical gaps

## UX Patterns

### 1. List → Detail Navigation

Clicking a row opens detail view while preserving context:
- Use right-side detail panel (fast)
- Or detail page with breadcrumbs + return state

### 2. Bulk Actions

- Selection checkboxes on hover or always visible
- Sticky bottom bar shows count and actions
- "Clear selection" always available
- Never blocks scrolling content

### 3. Progressive Disclosure

- CTA disabled until requirements met
- Show why it's disabled (missing evidence, checks failing)
- Surface progress ("2 out of 3 checks passing")

### 4. Status Language Consistency

Use canonical status names everywhere:
- Filters, legends, charts, tables, exports
- Passing, Failing, Need Changes, In Review, In Progress, Pending, Inactive

## Migration Guide

### Updating Existing Components

1. **Colors**: Replace hard-coded colors with CSS variables
   ```css
   /* Before */
   background: #2f5cf3;

   /* After */
   background: var(--action-primary-bg);
   ```

2. **Typography**: Use utility classes
   ```tsx
   /* Before */
   <h1 className="text-2xl font-bold">

   /* After */
   <h1 className="text-page-title">
   ```

3. **Spacing**: Follow 8px grid
   ```tsx
   /* Before */
   <div className="px-6 py-5">

   /* After */
   <div className="px-6 py-6">
   ```

4. **Borders**: Use design tokens
   ```tsx
   /* Before */
   <div className="border border-gray-200 rounded-xl">

   /* After */
   <div className="border border-border rounded-lg">
   ```

## Files Modified

- `app/globals.css` - Design tokens and utility classes
- `components/ui/button.tsx` - Updated sizes and rounded corners
- `components/ui/input.tsx` - Updated height and radius
- `components/ui/card.tsx` - Updated radius
- `components/ui/popover.tsx` - Updated shadow and padding
- `components/ui/status-chip.tsx` - New component
- `components/ui/sidebar.tsx` - Updated width
- `components/layout/navbar.tsx` - Updated height
- `components/layout/list-page-shell.tsx` - New layout pattern
- `components/layout/detail-page-shell.tsx` - New layout pattern
- `components/charts/tradingview-chart-card.tsx` - Updated chart styling
- `lib/charts/theme.ts` - New chart theme configuration

## Testing Checklist

- [ ] Verify warm paper background renders correctly
- [ ] Check button heights and border radius
- [ ] Validate input field styling
- [ ] Test card border and shadow
- [ ] Confirm popover shadows and padding
- [ ] Check navbar height (56px)
- [ ] Verify sidebar width (256px)
- [ ] Test chart gridlines are dashed
- [ ] Validate status chip appearance
- [ ] Test list page shell layout
- [ ] Verify detail page with right panel
- [ ] Check responsive behavior on mobile
