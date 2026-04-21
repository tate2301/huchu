# Design Migration Spec

## Attio Design Principles (from strategybreakdowns.com)
1. **Progressive disclosure** - Only show what's needed at the moment. Depth reveals itself as users explore.
2. **Systems thinking** - Unified interaction patterns. Same cursor/menu patterns everywhere.
3. **Flow state** - Creative flow, building feels like playing a puzzle game.
4. **Remove cognitive overload** - Strip unnecessary text, explanations, subtitles.
5. **Mobile-first** - Everything must work flawlessly on iPhone (390px viewport).

---

## Workstream 1: Scrap Metal — MobileList Migration + Text Stripping

### 1.1 Settlements Page (`app/scrap-metal/settlements/page.tsx`)
**Current**: Custom `<article>` elements for balance cards with inline mobile view.
**Target**: Use `MobileList` component family for the balance list view.

Replace the balances rendering (lines ~583-672) with:
```tsx
<MobileList>
  {balances.map((balance) => (
    <MobileListItem key={balance.id} onClick={() => setSelectedBalance(balance)}>
      <MobileListIcon variant="brand">{balance.employee.name[0]}</MobileListIcon>
      <MobileListContent>
        <MobileListTitle>{balance.employee.name}</MobileListTitle>
        <MobileListSubtitle>{balance.employee.employeeId}</MobileListSubtitle>
      </MobileListContent>
      <MobileListMeta>
        <MobileListMetaText className={balance.balance > 0 ? "text-warning" : "text-info"}>
          {formatMoney(Math.abs(balance.balance))}
        </MobileListMetaText>
      </MobileListMeta>
      <MobileListChevron />
    </MobileListItem>
  ))}
</MobileList>
```

**Keep the existing desktop DataTable** - only replace the mobile card view.

### 1.2 Text Stripping Across Scrap Pages
Remove these patterns across all scrap-metal pages:
- `<p className="text-[11px] text-muted-foreground">...</p>` explanatory subtitles
- `<FieldHelp>` components (hint text under inputs)
- `description` props in `StatusState` where redundant
- Alert/Description text that restates the obvious
- Extra labels like "Batch value and average payout by due date" - keep only the chart title

Pages to clean:
- `app/scrap-metal/settlements/page.tsx`
- `app/scrap-metal/batches/page.tsx`
- `app/scrap-metal/tickets/page.tsx`
- `app/scrap-metal/page.tsx` (daily snapshot)

### 1.3 Batch History Dialog
In the settlements page history dialog (lines 880-1050), the balance history entries are already card-based. Keep them but remove redundant explanatory `<h3>` subtitles like "Balance history", "Delivered scrap", "Settlement batches" if the context is obvious.

---

## Workstream 2: POS — Full Mobile Compatibility for iPhone

### 2.1 Problem
Current POS layout uses `xl:grid-cols-[1.15fr_0.85fr_0.8fr]` which stacks to single column below 1280px. On iPhone (390px):
- Catalog grid is visible but cart is way below
- Payment section is at the very bottom
- Keypad takes too much horizontal space
- Tender buttons are too small for thumbs
- The search bar is fine

### 2.2 Mobile Layout Strategy (< 768px)
**Primary view**: Catalog with floating cart button
**Cart + Payment**: Bottom sheet that slides up

```tsx
// Mobile layout structure:
<div className="flex h-full flex-col md:hidden">
  {/* Search bar (sticky top) */}
  {/* Catalog grid */}
  {/* Floating cart FAB */}
  {/* Bottom Sheet for Cart + Payment */}
</div>

// Desktop layout (keep existing):
<div className="hidden md:grid ...">
  {/* Existing 3-column layout */}
</div>
```

### 2.3 Mobile Cart Bottom Sheet
- Swipe up from bottom or tap FAB
- Shows cart items (condensed)
- Payment tender grid (2x3 larger buttons)
- Charge button (full width, prominent)
- Total amount large and visible

### 2.4 Mobile Catalog Grid
- 2-column grid on mobile (not single)
- Larger touch targets (min 80px height)
- Simplified item card (name + price only, stock badge smaller)

### 2.5 Tender Buttons
- On mobile: 2-column grid with larger buttons
- Minimum 56px height
- Color-coded but simplified (no complex shadow)

### 2.6 Keypad on Mobile
- Show keypad in bottom sheet alongside payment
- Full-width number buttons (60px min)
- Preset amounts as chips above keypad

### 2.7 Top Bar on Mobile
- Keep search (full width)
- Hide shift badge text, show only dot indicator
- Hide Hold/Recall buttons (move to bottom sheet menu)
- Hide shortcut hints completely

---

## Workstream 3: Retail — Consolidation + Simplification + Sidebar Fix

### 3.1 Retail Overview (`app/retail/page.tsx`) — Navbar Button Bloat
**Current**: 8 buttons in actions bar
**Target**: Maximum 3 buttons + overflow menu

```tsx
actions={
  <div className="flex flex-wrap gap-2">
    <Button asChild size="sm">
      <Link href="/portal/pos"><Payments className="h-4 w-4" />Open POS</Link>
    </Button>
    <Button asChild size="sm" variant="outline">
      <Link href="/retail/sell"><ClipboardList className="h-4 w-4" />Sell</Link>
    </Button>
    {/* More actions in a split button / dropdown */}
    <SplitButton size="sm" variant="outline" menuContent={...}>
      More
    </SplitButton>
  </div>
}
```

Move to dropdown: Insights, Accounting, Stock, Buy, Customers, Setup

### 3.2 Text Stripping — Retail Overview
Remove these:
- `SectionCard` subtitle: "Date range Last 12 months · Compare Previous period" → keep only the section title
- `KpiCard` detail text is fine (margin % is data, not explanation)
- "Priorities" section subtitle "Owner-level operating focus" → remove
- "Cash and demand mix" subtitle "Where money is coming from" → remove
- "Opportunities" section - keep the data, remove the "Profit model source" card (it's metadata, not actionable)
- Remove the low-stock explanatory text: "{count} low-stock items out of {total} active SKUs"

### 3.3 Reports Consolidation (`app/retail/reports/page.tsx`)
**Current**: Reports at `/retail/reports`, insights redirects there. But buttons link to Sales Queue, Receipts, Shifts separately.
**Target**: Make `/retail/reports` the single source for all retail reporting.

- Keep the trend chart + tender mix at top
- Add quick-link cards to sub-reports: Sales Queue, Receipts, Shifts
- Remove the redundant "Retail performance" subtitle
- Remove the "Trend, tender mix, and stock pressure" subtitle
- Remove "Contribution" subtitle "Top items and stock exceptions"

### 3.4 Accounting Sidebar Fix (`lib/workspaces.ts`)
**Current**: Line 231-233 includes `/retail/accounting` as a top-level retail module item
**Target**: Remove it. It's already in the "Controls & Growth" section.

```ts
// REMOVE this block:
if (has("/retail/accounting")) {
  items.push({ href: "/retail/accounting", label: "Accounting", icon: Scale });
}
```

The accounting page will still be accessible via `/retail/accounting` → `/accounting` redirect, and via the "Controls & Growth" sidebar section.

### 3.5 Retail Reports Page — MobileDataList for Tables
Use `MobileList` for the data tables on mobile in the reports page.

---

## Component Reference

### MobileList (from `components/ui/mobile-list.tsx`)
Components available:
- `MobileList` - container with border/divider styling
- `MobileListItem` - individual row, variants: default, compact, touchable
- `MobileListIcon` - avatar/icon area, variants: default, brand, ghost, image
- `MobileListContent` - text content wrapper
- `MobileListTitle` - primary text
- `MobileListSubtitle` - secondary text
- `MobileListMeta` - right-aligned content wrapper
- `MobileListMetaText` - right-aligned text
- `MobileListChevron` - arrow indicator
- `MobileListBadge` - badge wrapper
- `MobileListStatus` - status dot
- `MobileListEmpty` - empty state
- `MobileListSectionHeader` - section divider

### Design Tokens (CSS variables)
Use these for colors:
- `--surface-base`, `--surface-muted`, `--surface-subtle`
- `--text-strong`, `--text-body`, `--text-muted`, `--text-subtle`
- `--edge-subtle`, `--edge-default`, `--edge-strong`
- `--action-primary-bg`, `--action-primary-fg`
- `--status-success-border`, `--status-warning-border`, `--status-info-border`
- `--border-default`
- `--card-radius`, `--card-shadow-rest`
- `--mobile-list-*` tokens
- `--motion-duration-fast`, `--motion-ease-default`

---

## Verification Checklist
- [ ] All pages compile without TypeScript errors
- [ ] No `FieldHelp` imports left on cleaned pages
- [ ] `MobileList` components render correctly on mobile
- [ ] POS works on 390px viewport (iPhone)
- [ ] Retail overview has max 3 primary action buttons
- [ ] Accounting does not appear as top-level retail sidebar item
- [ ] No unnecessary explanatory text left on cleaned pages
