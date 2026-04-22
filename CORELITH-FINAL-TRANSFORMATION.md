# CORELITH PRODUCT DESIGN TRANSFORMATION
## Huchu ERP → Attio Design System
### Complete Implementation Specification for Agent Swarm Execution

---

**Version:** FINAL 1.0  
**Date:** April 22, 2026  
**Author:** Kamfes (Corelith AI Cofounder)  
**Client:** Tatenda (Chris) - Corelith Founder  
**Reference:** 27 Attio/Refero App Screenshots + Live Codebase Analysis  
**Standard:** $5M Series A Investment-Grade Design  

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Design System Foundation](#2-design-system-foundation)
3. [Codebase Audit](#3-codebase-audit)
4. [Token Transformation](#4-token-transformation)
5. [Component Specifications](#5-component-specifications)
6. [Layout Architecture](#6-layout-architecture)
7. [Dark Mode](#7-dark-mode)
8. [Animation & Motion](#8-animation--motion)
9. [Implementation Phases](#9-implementation-phases)
10. [Quality Assurance](#10-quality-assurance)
11. [Agent Execution Prompt](#11-agent-execution-prompt)
12. [Appendices](#12-appendices)

---

## 1. EXECUTIVE SUMMARY

### The Mission
Transform the Huchu ERP product UI to match Attio's industry-leading design language. This document contains every specification, token value, file path, and implementation step required for flawless execution by an agent swarm.

### What Attio Design Means (From 27 Screenshots)
- **Single blue accent** (#2563EB) against grayscale surfaces
- **14px standard type** with Inter font
- **6px button radius, 8px card radius, 12px modal radius**
- **Subtle shadows**: `0 1px 3px rgba(0,0,0,0.1)`
- **Dense functional layouts** (not marketing whitespace)
- **Dark mode**: #0F0F0F canvas, #1A1A1A cards
- **Rounded corners on EVERYTHING**
- **Generous internal padding, tight external spacing**

### What We're NOT Doing
- NOT rebuilding functionality
- NOT changing business logic
- NOT modifying API calls
- NOT breaking existing features
- ONLY changing visual presentation

### Success Criteria
When complete, the Huchu app should:
1. Look like it was designed by Attio's team
2. Pass visual comparison with provided screenshots
3. Maintain all existing functionality
4. Build successfully (`npm run build`)
5. Support light and dark modes
6. Score >95 Lighthouse performance

---

## 2. DESIGN SYSTEM FOUNDATION

### 2.1 Color Palette (Extracted from Screenshots)

#### Primary Colors
| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `--primary-50` | #EFF6FF | rgb(239,246,255) | Lightest tint |
| `--primary-100` | #DBEAFE | rgb(219,234,254) | Hover backgrounds |
| `--primary-200` | #BFDBFE | rgb(191,219,254) | Active states |
| `--primary-300` | #93C5FD | rgb(147,197,253) | Borders |
| `--primary-400` | #60A5FA | rgb(96,165,250) | Icons |
| `--primary-500` | #3B82F6 | rgb(59,130,246) | Secondary accent |
| `--primary-600` | #2563EB | rgb(37,99,235) | **PRIMARY BUTTONS** |
| `--primary-700` | #1D4ED8 | rgb(29,78,216) | Hover state |
| `--primary-800` | #1E40AF | rgb(30,64,175) | Pressed state |
| `--primary-900` | #1E3A8A | rgb(30,58,138) | Darkest |

#### Neutral Grayscale
| Token | Hex | Usage |
|-------|-----|-------|
| `--neutral-0` | #FFFFFF | White backgrounds |
| `--neutral-25` | #FCFCFC | Subtle off-white |
| `--neutral-50` | #F9FAFB | Canvas, table headers |
| `--neutral-100` | #F3F4F6 | Hover states, borders |
| `--neutral-200` | #E5E7EB | Borders, dividers |
| `--neutral-300` | #D1D5DB | Disabled states |
| `--neutral-400` | #9CA3AF | Placeholder text |
| `--neutral-500` | #6B7280 | Secondary text |
| `--neutral-600` | #4B5563 | Sidebar items |
| `--neutral-700` | #374151 | Body text |
| `--neutral-800` | #1F2937 | Headings |
| `--neutral-900` | #111827 | Primary text |

#### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--success-50` | #F0FDF4 | Success bg |
| `--success-500` | #22C55E | Success text |
| `--success-700` | #15803D | Success dark |
| `--warning-50` | #FFFBEB | Warning bg |
| `--warning-500` | #F59E0B | Warning text |
| `--warning-700` | #B45309 | Warning dark |
| `--danger-50` | #FEF2F2 | Error bg |
| `--danger-500` | #EF4444 | Error text |
| `--danger-700` | #B91C1C | Error dark |
| `--info-50` | #EFF6FF | Info bg |
| `--info-500` | #3B82F6 | Info text |
| `--info-700` | #1D4ED8 | Info dark |

#### Accent (Teal - for secondary actions)
| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-500` | #14B8A6 | Secondary buttons |
| `--accent-600` | #0D9488 | Hover state |

### 2.2 Typography System

#### Font Stack
```
Primary: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
Monospace: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
```

#### Type Scale
| Token | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| `--text-xs` | 12px | 400 | 1.4 | 0.05em | Labels, badges |
| `--text-sm` | 13px | 400 | 1.4 | 0 | Captions, meta |
| `--text-md` | 14px | 400 | 1.5 | 0 | **BODY STANDARD** |
| `--text-lg` | 16px | 500 | 1.5 | -0.01em | Card titles |
| `--text-xl` | 20px | 600 | 1.3 | -0.02em | Section headers |
| `--text-2xl` | 24px | 700 | 1.2 | -0.02em | Page titles |
| `--text-kpi` | 32px | 700 | 1.1 | -0.03em | Dashboard numbers |

#### Typography Rules
- **Body**: 14px regular, 1.5 line height
- **Labels**: 12px uppercase, 0.05em tracking, medium weight
- **Headings**: Tighter line height (1.2-1.3), negative tracking
- **Numbers**: Tabular figures for alignment
- **Code**: Monospace, 13px

### 2.3 Spacing System

#### Base Unit: 4px
| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight gaps |
| `--space-2` | 8px | Between related items |
| `--space-3` | 12px | Small padding |
| `--space-4` | 16px | Standard padding |
| `--space-5` | 20px | Medium gaps |
| `--space-6` | 24px | Section padding |
| `--space-8` | 32px | Large gaps |
| `--space-10` | 40px | Page padding |

#### Layout Spacing
```
Sidebar width: 256px (fixed)
Header height: 56px (fixed)
Content padding: 24px
Card padding: 16px
Button padding: 8px 16px
Input padding: 8px 12px
Table cell padding: 12px 16px
```

### 2.4 Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Buttons, inputs, tags |
| `--radius-md` | 8px | Cards, dropdowns |
| `--radius-lg` | 12px | Modals, dialogs |
| `--radius-pill` | 9999px | Badges, status indicators |

### 2.5 Shadow System
| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-card` | `0 1px 3px rgba(0,0,0,0.1)` | Cards |
| `--shadow-hover` | `0 4px 6px rgba(0,0,0,0.05)` | Hover lift |
| `--shadow-dropdown` | `0 8px 16px rgba(0,0,0,0.08)` | Dropdowns |
| `--shadow-modal` | `0 20px 25px rgba(0,0,0,0.1)` | Modals |
| `--shadow-toast` | `0 4px 12px rgba(0,0,0,0.15)` | Notifications |

---

## 3. CODEBASE AUDIT

### 3.1 Technology Stack
```
Framework: Next.js 15 (App Router)
Language: TypeScript
Styling: Tailwind CSS v4
UI Library: shadcn/ui + Frappe UI React
Icons: Material Symbols (filled)
Font: Custom "SS Huchu" (to be replaced)
Auth: NextAuth.js
Database: Prisma
```

### 3.2 File Structure (Key Paths)
```
/tmp/huchu/
--- app/
-   --- globals.css              # BASE TOKENS - REPLACE
-   --- themes/
-   -   --- client.css           # CLIENT THEME - REPLACE
-   -   --- admin.css            # ADMIN THEME - REPLACE
-   --- layout.tsx               # ADD INTER FONT
-   --- [workspaces]/            # All workspace routes
--- components/
-   --- ui/                      # shadcn primitives
-   -   --- button.tsx            # RESTYLE
-   -   --- card.tsx              # RESTYLE
-   -   --- input.tsx             # RESTYLE
-   -   --- table.tsx             # RESTYLE
-   -   --- dialog.tsx            # RESTYLE
-   -   --- sidebar.tsx           # RESTYLE
-   -   --- badge.tsx             # RESTYLE
-   -   --- dropdown-menu.tsx     # RESTYLE
-   -   --- ...
-   --- layout/
-   -   --- app-shell.tsx         # RESTYLE
-   -   --- app-sidebar.tsx       # RESTYLE
-   -   --- navbar.tsx            # RESTYLE
-   --- [workspace]/
-       --- *-content.tsx         # RESTYLE ALL
--- lib/
-   --- platform/
-       --- branding.ts           # MAY NEED UPDATE
--- public/
    --- fonts/                    # REMOVE SS HUCHU
```

### 3.3 Current Token System
The app uses a sophisticated CSS custom property system:
- `globals.css` defines ~100 base tokens
- `client.css` overrides for client portal (warm palette)
- `admin.css` overrides for admin portal (cool palette)
- All use `color-mix()` for dynamic shades

**PROBLEM:** This system is over-engineered for Attio's simplicity. We'll replace with flat values.

---

## 4. TOKEN TRANSFORMATION

### 4.1 Step 1: Replace globals.css

**FILE:** `/tmp/huchu/app/globals.css`

**ACTION:** Replace the entire `:root` block (lines ~52-380) with:

```css
:root {
  color-scheme: light;

  /* === NEUTRAL PALETTE === */
  --neutral-0:  #ffffff;
  --neutral-25: #fcfcfc;
  --neutral-50: #f9fafb;
  --neutral-100: #f3f4f6;
  --neutral-200: #e5e7eb;
  --neutral-300: #d1d5db;
  --neutral-400: #9ca3af;
  --neutral-500: #6b7280;
  --neutral-600: #4b5563;
  --neutral-700: #374151;
  --neutral-800: #1f2937;
  --neutral-900: #111827;

  /* === PRIMARY (Blue) === */
  --primary:     #2563EB;
  --primary-50:  #eff6ff;
  --primary-100: #dbeafe;
  --primary-200: #bfdbfe;
  --primary-300: #93c5fd;
  --primary-400: #60a5fa;
  --primary-500: #3b82f6;
  --primary-600: #2563eb;
  --primary-700: #1d4ed8;
  --primary-800: #1e40af;
  --primary-900: #1e3a8a;

  /* === ACCENT (Teal) === */
  --accent:      #0d9488;
  --accent-50:   #f0fdfa;
  --accent-100:  #ccfbf1;
  --accent-500:  #14b8a6;
  --accent-600:  #0d9488;

  /* === SEMANTIC === */
  --success-50:  #f0fdf4;
  --success-100: #dcfce7;
  --success-300: #86efac;
  --success-500: #22c55e;
  --success-700: #15803d;

  --warning-50:  #fffbeb;
  --warning-100: #fef3c7;
  --warning-300: #fcd34d;
  --warning-500: #f59e0b;
  --warning-700: #b45309;

  --danger-50:   #fef2f2;
  --danger-100:  #fee2e2;
  --danger-300:  #fca5a5;
  --danger-500:  #ef4444;
  --danger-700:  #b91c1c;

  --info-50:     #eff6ff;
  --info-100:    #dbeafe;
  --info-300:    #93c5fd;
  --info-500:    #3b82f6;
  --info-700:    #1d4ed8;

  /* === SURFACES === */
  --surface-canvas:  var(--neutral-50);
  --surface-base:    var(--neutral-0);
  --surface-raised:  var(--neutral-0);
  --surface-muted:   var(--neutral-100);
  --surface-subtle:  var(--neutral-50);
  --surface-soft:    var(--neutral-100);
  --surface-active:  var(--primary-50);

  /* === TEXT === */
  --text-strong: var(--neutral-900);
  --text-body:   var(--neutral-800);
  --text-muted:  var(--neutral-500);
  --text-subtle: var(--neutral-400);
  --text-inverse: var(--neutral-0);

  /* === ACTIONS === */
  --action-primary-bg:       var(--primary-600);
  --action-primary-fg:       var(--neutral-0);
  --action-primary-hover:    var(--primary-700);
  --action-primary-pressed:  var(--primary-800);
  --action-secondary-bg:     var(--neutral-100);
  --action-secondary-fg:     var(--neutral-700);
  --action-secondary-hover:  var(--neutral-200);
  --action-outline-bg:       transparent;
  --action-outline-border:   var(--neutral-200);
  --action-outline-hover:    var(--neutral-50);
  --action-destructive-bg:   var(--danger-500);
  --action-destructive-fg:   var(--neutral-0);
  --action-destructive-hover: var(--danger-600);
  --action-disabled-bg:      var(--neutral-100);
  --action-disabled-fg:      var(--neutral-400);

  /* === EDGES / BORDERS === */
  --edge-subtle:   var(--neutral-100);
  --edge-default:  var(--neutral-200);
  --edge-strong:   var(--neutral-300);
  --border-default: var(--edge-default);
  --border-soft:    var(--edge-subtle);
  --input-border:   var(--edge-default);
  --input-bg:       var(--surface-base);
  --focus-ring:     var(--primary-500);
  --focus-ring-offset: var(--surface-canvas);

  /* === SHADOWS === */
  --shadow-none:    none;
  --shadow-card:    0 1px 3px rgba(0,0,0,0.1);
  --shadow-hover:   0 4px 6px rgba(0,0,0,0.05);
  --shadow-dropdown: 0 8px 16px rgba(0,0,0,0.08);
  --shadow-popover: 0 12px 24px rgba(0,0,0,0.12);
  --shadow-modal:   0 20px 25px rgba(0,0,0,0.1);
  --shadow-toast:   0 4px 12px rgba(0,0,0,0.15);

  /* === TABLE === */
  --table-header-bg:      var(--neutral-50);
  --table-header-text:    var(--neutral-500);
  --table-row-bg:         var(--surface-base);
  --table-row-hover:      var(--neutral-50);
  --table-row-selected:   var(--primary-50);
  --table-row-alt:        var(--surface-base);
  --table-divider:        var(--neutral-100);
  --table-toolbar-bg:     rgba(255,255,255,0.9);

  /* === SIDEBAR === */
  --sidebar:                   var(--neutral-0);
  --sidebar-border:            var(--neutral-200);
  --sidebar-foreground:        var(--text-body);
  --sidebar-primary:           var(--action-primary-bg);
  --sidebar-primary-fg:        var(--action-primary-fg);
  --sidebar-accent:            var(--surface-subtle);
  --sidebar-accent-fg:         var(--text-body);
  --sidebar-item-fg:           var(--neutral-600);
  --sidebar-item-fg-muted:     var(--neutral-500);
  --sidebar-item-icon:         var(--neutral-400);
  --sidebar-item-hover-fg:     var(--text-body);
  --sidebar-item-hover-bg:     var(--neutral-50);
  --sidebar-item-active-bg:    var(--primary-50);
  --sidebar-item-active-fg:    var(--primary-700);
  --sidebar-item-active-border: var(--primary-200);
  --sidebar-ring:              var(--focus-ring);

  /* === CHARTS === */
  --chart-1: var(--primary-500);
  --chart-2: var(--accent-500);
  --chart-3: var(--success-500);
  --chart-4: var(--warning-500);
  --chart-5: var(--danger-500);
  --chart-grid:   var(--edge-subtle);
  --chart-text:   var(--text-muted);

  /* === SHADCN COMPATIBILITY === */
  --background:          var(--surface-canvas);
  --foreground:          var(--text-body);
  --card:                var(--surface-base);
  --card-foreground:     var(--text-body);
  --popover:             var(--surface-raised);
  --popover-foreground:  var(--text-body);
  --primary-foreground:  var(--text-inverse);
  --secondary:           var(--neutral-100);
  --secondary-foreground: var(--neutral-800);
  --muted:               var(--neutral-100);
  --muted-foreground:    var(--neutral-500);
  --accent:              var(--accent-500);
  --accent-foreground:   var(--neutral-0);
  --destructive:         var(--danger-500);
  --border:              var(--edge-default);
  --input:               var(--edge-default);
  --ring:                var(--focus-ring);

  /* === GEOMETRY === */
  --radius:        0.5rem;     /* 8px */
  --radius-sm:     0.375rem;   /* 6px */
  --radius-md:     0.5rem;     /* 8px */
  --radius-lg:     0.75rem;    /* 12px */
  --radius-pill:   9999px;
  --button-radius: 0.375rem;   /* 6px */
  --card-radius:   0.5rem;     /* 8px */

  /* === SPACING === */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;

  /* === TYPOGRAPHY === */
  --font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;

  --text-xs:  12px;
  --text-sm:  13px;
  --text-md:  14px;
  --text-lg:  16px;
  --text-xl:  20px;
  --text-2xl: 24px;
  --text-kpi: 32px;

  --font-weight-regular:  400;
  --font-weight-medium:   500;
  --font-weight-semibold: 600;
  --font-weight-bold:     700;

  --leading-tight:  1.2;
  --leading-normal: 1.4;
  --leading-relaxed: 1.5;

  /* === MOTION === */
  --motion-duration-fast:    150ms;
  --motion-duration-base:     200ms;
  --motion-duration-normal:   300ms;
  --motion-duration-slow:     400ms;
  --motion-ease-standard:    cubic-bezier(0.16, 1, 0.3, 1);
  --motion-ease-bounce:    cubic-bezier(0.34, 1.56, 0.64, 1);
  --motion-ease-linear:    linear;

  /* === OTHER === */
  --app-canvas-wash: none;
}
```

**KEEP:** The rest of globals.css (utility classes, keyframes, etc.) but update any hardcoded values.

### 4.2 Step 2: Replace client.css

**FILE:** `/tmp/huchu/app/themes/client.css`

**ACTION:** Replace with minimal overrides:

```css
/* Client Theme - Warm variant for customer portal */
:root {
  /* Slightly warmer neutrals */
  --neutral-50: #fafaf9;
  --neutral-100: #f5f5f4;
  --neutral-200: #e7e5e4;

  /* Keep everything else from globals.css */
}
```

### 4.3 Step 3: Replace admin.css

**FILE:** `/tmp/huchu/app/themes/admin.css`

**ACTION:** Replace with minimal overrides:

```css
/* Admin Theme - Cool variant for admin portal */
[data-portal="admin"] {
  /* Slightly cooler neutrals */
  --neutral-50: #f8fafc;
  --neutral-100: #f1f5f9;
  --neutral-200: #e2e8f0;

  /* Keep everything else from globals.css */
}
```

### 4.4 Step 4: Remove Custom Font

**FILE:** `/tmp/huchu/app/globals.css`

**ACTION:** Remove ALL `@font-face` declarations for "SS Huchu" (4 declarations).

**FILE:** `/tmp/huchu/app/layout.tsx`

**ACTION:**
1. Remove: `--font-ibm-plex-mono` from style injection
2. Add Inter font import:

```tsx
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})
```

3. Update body className:
```tsx
<body className={`${inter.variable} font-sans antialiased`}>
```

### 4.5 Step 5: Update Tailwind Mappings

**FILE:** `/tmp/huchu/app/globals.css` (Tailwind @theme block)

**ACTION:** Update or verify these mappings:

```css
@theme inline {
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-mono);

  --color-surface-canvas: var(--surface-canvas);
  --color-surface-base: var(--surface-base);
  --color-surface-raised: var(--surface-raised);
  --color-surface-muted: var(--surface-muted);
  --color-surface-subtle: var(--surface-subtle);

  --color-text-strong: var(--text-strong);
  --color-text-body: var(--text-body);
  --color-text-muted: var(--text-muted);
  --color-text-inverse: var(--text-inverse);

  --color-action-primary-bg: var(--action-primary-bg);
  --color-action-primary-fg: var(--action-primary-fg);
  --color-action-secondary-bg: var(--action-secondary-bg);
  --color-action-secondary-fg: var(--action-secondary-fg);

  --color-status-success-bg: var(--success-50);
  --color-status-success-text: var(--success-700);
  --color-status-warning-bg: var(--warning-50);
  --color-status-warning-text: var(--warning-700);
  --color-status-error-bg: var(--danger-50);
  --color-status-error-text: var(--danger-700);

  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
}
```

---

## 5. COMPONENT SPECIFICATIONS

### 5.1 Button Component

**FILE:** `/tmp/huchu/components/ui/button.tsx`

**SPECIFICATION:**

```css
/* Base */
display: inline-flex;
align-items: center;
justify-content: center;
height: 36px;
padding: 8px 16px;
border-radius: var(--button-radius); /* 6px */
font-size: var(--text-md); /* 14px */
font-weight: var(--font-weight-medium); /* 500 */
line-height: 1;
gap: var(--space-2); /* 8px */
transition: all var(--motion-duration-fast) var(--motion-ease-standard);
user-select: none;

/* Primary variant */
background: var(--action-primary-bg); /* #2563EB */
color: var(--action-primary-fg); /* white */
border: none;

/* Primary hover */
:hover {
  background: var(--action-primary-hover); /* #1D4ED8 */
}

/* Primary pressed */
:active {
  transform: scale(0.97);
  background: var(--action-primary-pressed); /* #1E40AF */
}

/* Secondary variant */
background: var(--action-secondary-bg); /* #F3F4F6 */
color: var(--action-secondary-fg); /* #374151 */
border: none;

/* Secondary hover */
:hover {
  background: var(--action-secondary-hover); /* #E5E7EB */
}

/* Outline variant */
background: transparent;
color: var(--text-body);
border: 1px solid var(--action-outline-border); /* #E5E7EB */

/* Outline hover */
:hover {
  background: var(--action-outline-hover); /* #F9FAFB */
}

/* Ghost variant */
background: transparent;
color: var(--text-muted);
border: none;

/* Ghost hover */
:hover {
  background: var(--surface-muted); /* #F3F4F6 */
  color: var(--text-body);
}

/* Destructive variant */
background: var(--action-destructive-bg); /* #EF4444 */
color: var(--action-destructive-fg); /* white */

/* Destructive hover */
:hover {
  background: var(--action-destructive-hover); /* #DC2626 */
}

/* Sizes */
[data-size="sm"] { height: 32px; padding: 6px 12px; font-size: 13px; }
[data-size="md"] { height: 36px; padding: 8px 16px; font-size: 14px; }
[data-size="lg"] { height: 40px; padding: 10px 20px; font-size: 14px; }

/* Disabled */
:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
```

**CHANGES NEEDED:**
- Update default variant colors
- Update radius to 6px
- Update height to 36px
- Update padding to 8px 16px
- Add active state transform

### 5.2 Card Component

**FILE:** `/tmp/huchu/components/ui/card.tsx`

**SPECIFICATION:**

```css
/* Base */
background: var(--surface-base); /* white */
border: 1px solid var(--edge-default); /* #E5E7EB */
border-radius: var(--card-radius); /* 8px */
padding: var(--space-4); /* 16px */
box-shadow: var(--shadow-card); /* 0 1px 3px rgba(0,0,0,0.1) */
transition: box-shadow var(--motion-duration-base) var(--motion-ease-standard);

/* Hover (if interactive) */
:hover {
  box-shadow: var(--shadow-hover); /* 0 4px 6px rgba(0,0,0,0.05) */
}

/* Header */
padding-bottom: var(--space-4);
border-bottom: 1px solid var(--edge-subtle);
margin-bottom: var(--space-4);

/* Title */
font-size: var(--text-lg); /* 16px */
font-weight: var(--font-weight-semibold); /* 600 */
color: var(--text-strong);

/* Description */
font-size: var(--text-sm); /* 13px */
color: var(--text-muted);
margin-top: var(--space-1);

/* Content */
padding: var(--space-4) 0;

/* Footer */
padding-top: var(--space-4);
border-top: 1px solid var(--edge-subtle);
margin-top: var(--space-4);
display: flex;
justify-content: flex-end;
gap: var(--space-2);
```

**CHANGES NEEDED:**
- Update border radius to 8px
- Update padding to 16px
- Add subtle shadow
- Update header/footer border colors

### 5.3 Input Component

**FILE:** `/tmp/huchu/components/ui/input.tsx`

**SPECIFICATION:**

```css
/* Base */
height: 36px;
width: 100%;
padding: 8px 12px;
background: var(--input-bg); /* white */
border: 1px solid var(--input-border); /* #E5E7EB */
border-radius: var(--button-radius); /* 6px */
font-size: var(--text-md); /* 14px */
color: var(--text-body);
line-height: 1.5;
transition: border-color var(--motion-duration-fast), box-shadow var(--motion-duration-fast);

/* Placeholder */
::placeholder {
  color: var(--text-subtle); /* #9CA3AF */
}

/* Focus */
:focus {
  outline: none;
  border-color: var(--primary-500); /* #3B82F6 */
  box-shadow: 0 0 0 3px var(--primary-100); /* #DBEAFE */
}

/* Disabled */
:disabled {
  background: var(--neutral-50);
  color: var(--text-muted);
  cursor: not-allowed;
}

/* Error state */
[data-error="true"] {
  border-color: var(--danger-500);
  box-shadow: 0 0 0 3px var(--danger-100);
}

/* Sizes */
[data-size="sm"] { height: 32px; font-size: 13px; }
[data-size="md"] { height: 36px; font-size: 14px; }
[data-size="lg"] { height: 40px; font-size: 14px; }
```

**CHANGES NEEDED:**
- Update height to 36px
- Update border radius to 6px
- Update focus ring color
- Add error state styling

### 5.4 Table Component

**FILE:** `/tmp/huchu/components/ui/table.tsx`

**SPECIFICATION:**

```css
/* Container */
width: 100%;
border-collapse: separate;
border-spacing: 0;

/* Header */
thead tr {
  background: var(--table-header-bg); /* #F9FAFB */
  border-bottom: 1px solid var(--table-divider); /* #F3F4F6 */
}

th {
  padding: 12px 16px;
  font-size: var(--text-xs); /* 12px */
  font-weight: var(--font-weight-medium); /* 500 */
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--table-header-text); /* #6B7280 */
  text-align: left;
  white-space: nowrap;
}

/* Body */
tbody tr {
  height: 48px;
  border-bottom: 1px solid var(--table-divider); /* #F3F4F6 */
  transition: background-color var(--motion-duration-fast);
}

tbody tr:hover {
  background: var(--table-row-hover); /* #F9FAFB */
}

tbody tr[data-selected="true"] {
  background: var(--table-row-selected); /* #EFF6FF */
}

td {
  padding: 12px 16px;
  font-size: var(--text-md); /* 14px */
  color: var(--text-body);
  vertical-align: middle;
}

/* Empty state */
tbody:empty::after {
  content: "No data";
  display: block;
  padding: 48px;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}
```

**CHANGES NEEDED:**
- Update header style (uppercase, 12px)
- Update row height to 48px
- Update cell padding to 12px 16px
- Update hover background
- Add selected state

### 5.5 Dialog/Modal Component

**FILE:** `/tmp/huchu/components/ui/dialog.tsx`

**SPECIFICATION:**

```css
/* Backdrop */
position: fixed;
inset: 0;
background: rgba(0,0,0,0.5);
backdrop-filter: blur(4px);
animation: fade-in 200ms ease;

/* Content */
position: fixed;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
width: 100%;
max-width: 560px;
max-height: 85vh;
overflow-y: auto;
background: var(--surface-base); /* white */
border-radius: var(--radius-lg); /* 12px */
padding: 24px;
box-shadow: var(--shadow-modal); /* 0 20px 25px rgba(0,0,0,0.1) */
animation: modal-in 300ms var(--motion-ease-standard);

/* Header */
padding-bottom: 16px;
border-bottom: 1px solid var(--edge-subtle);
margin-bottom: 16px;

/* Title */
font-size: var(--text-xl); /* 20px */
font-weight: var(--font-weight-semibold);
color: var(--text-strong);

/* Description */
font-size: var(--text-sm); /* 13px */
color: var(--text-muted);
margin-top: 4px;

/* Close button */
position: absolute;
top: 16px;
right: 16px;
width: 32px;
height: 32px;
border-radius: var(--radius-sm);
display: flex;
align-items: center;
justify-content: center;
color: var(--text-muted);
transition: all var(--motion-duration-fast);

:hover {
  background: var(--surface-muted);
  color: var(--text-body);
}

/* Footer */
display: flex;
justify-content: flex-end;
gap: var(--space-2);
padding-top: 16px;
border-top: 1px solid var(--edge-subtle);
margin-top: 16px;
```

**CHANGES NEEDED:**
- Update border radius to 12px
- Update padding to 24px
- Update shadow to modal shadow
- Add backdrop blur
- Update animations

### 5.6 Badge Component

**FILE:** `/tmp/huchu/components/ui/badge.tsx`

**SPECIFICATION:**

```css
/* Base */
display: inline-flex;
align-items: center;
padding: 2px 8px;
border-radius: var(--radius-pill); /* 9999px */
font-size: var(--text-xs); /* 12px */
font-weight: var(--font-weight-medium); /* 500 */
line-height: 1.5;
white-space: nowrap;

/* Variants */
[data-variant="default"] {
  background: var(--neutral-100);
  color: var(--neutral-700);
}

[data-variant="primary"] {
  background: var(--primary-50);
  color: var(--primary-700);
}

[data-variant="success"] {
  background: var(--success-50);
  color: var(--success-700);
}

[data-variant="warning"] {
  background: var(--warning-50);
  color: var(--warning-700);
}

[data-variant="danger"] {
  background: var(--danger-50);
  color: var(--danger-700);
}

[data-variant="outline"] {
  background: transparent;
  border: 1px solid var(--edge-default);
  color: var(--text-body);
}
```

**CHANGES NEEDED:**
- Update to pill shape
- Update all color combinations
- Add outline variant

### 5.7 Sidebar Component

**FILE:** `/tmp/huchu/components/ui/sidebar.tsx` AND `/tmp/huchu/components/layout/app-sidebar.tsx`

**SPECIFICATION:**

```css
/* Container */
width: 256px;
height: 100vh;
background: var(--sidebar); /* white */
border-right: 1px solid var(--sidebar-border); /* #E5E7EB */
display: flex;
flex-direction: column;
padding: 16px 0;

/* Nav Item */
display: flex;
align-items: center;
gap: 12px;
padding: 8px 16px;
margin: 2px 12px;
border-radius: var(--radius-sm); /* 6px */
font-size: var(--text-md); /* 14px */
font-weight: var(--font-weight-medium); /* 500 */
color: var(--sidebar-item-fg); /* #4B5563 */
transition: all var(--motion-duration-fast);
cursor: pointer;

/* Nav Item Hover */
:hover {
  background: var(--sidebar-item-hover-bg); /* #F9FAFB */
  color: var(--sidebar-item-hover-fg); /* #111827 */
}

/* Nav Item Active */
[data-active="true"] {
  background: var(--sidebar-item-active-bg); /* #EFF6FF */
  color: var(--sidebar-item-active-fg); /* #1D4ED8 */
}

/* Icon */
width: 20px;
height: 20px;
color: inherit;
opacity: 0.7;

/* Active icon */
[data-active="true"] .icon {
  opacity: 1;
}

/* Section Header */
padding: 8px 16px;
font-size: var(--text-xs); /* 12px */
font-weight: var(--font-weight-semibold);
text-transform: uppercase;
letter-spacing: 0.05em;
color: var(--text-muted);
margin-top: 8px;

/* Collapsed State */
&[data-collapsed="true"] {
  width: 64px;
}

&[data-collapsed="true"] .nav-item {
  justify-content: center;
  padding: 8px;
}

&[data-collapsed="true"] .nav-item span {
  display: none;
}
```

**CHANGES NEEDED:**
- Update width to 256px
- Update nav item styling
- Update active state colors
- Update section header style

### 5.8 Navbar Component

**FILE:** `/tmp/huchu/components/layout/navbar.tsx`

**SPECIFICATION:**

```css
/* Container */
height: 56px;
background: var(--surface-base); /* white */
border-bottom: 1px solid var(--edge-default); /* #E5E7EB */
display: flex;
align-items: center;
justify-content: space-between;
padding: 0 16px;
position: sticky;
top: 0;
z-index: 10;

/* REMOVE: backdrop-blur-md */

/* Left section */
display: flex;
align-items: center;
gap: 16px;

/* Breadcrumbs */
font-size: var(--text-sm); /* 13px */
color: var(--text-muted);

/* Current page */
font-size: var(--text-md); /* 14px */
font-weight: var(--font-weight-semibold);
color: var(--text-strong);

/* Right section */
display: flex;
align-items: center;
gap: 12px;

/* Actions */
display: flex;
gap: 8px;

/* Mobile */
@media (max-width: 768px) {
  .breadcrumbs { display: none; }
}
```

**CHANGES NEEDED:**
- Update height to 56px
- Update border color
- Remove backdrop blur
- Update breadcrumb font size

---

## 6. LAYOUT ARCHITECTURE

### 6.1 App Shell

**FILE:** `/tmp/huchu/components/layout/app-shell.tsx`

**SPECIFICATION:**

```tsx
// Remove rounded-xl border shadow-sm - make it flat
<SidebarInset className="m-0 flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-surface-canvas">
  <Navbar />
  <main className="content-shell min-w-0 min-h-0 flex-1 overflow-y-auto py-6">
    {children}
  </main>
</SidebarInset>
```

**CHANGES NEEDED:**
- Remove `m-2`
- Remove `rounded-xl`
- Remove `border`
- Remove `shadow-sm`
- Change bg to `surface-canvas`

### 6.2 Content Area

```css
/* Max width: fluid (no max-width) */
/* Padding: 24px */
/* Gap between sections: 24px */

.content-shell {
  padding: var(--space-6); /* 24px */
}

@media (min-width: 1024px) {
  .content-shell {
    padding: var(--space-6) var(--space-8); /* 24px 32px */
  }
}
```

### 6.3 Page Layout Pattern

```
-------------------------------------------------------
-  Page Title (20px, semibold)                        -
-  Description (13px, muted)                          -
-                                                      -
-  -------------------------------------------------  -
-                                                      -
-  ------------------------------------------------    -
-  -  Card (8px radius, 16px padding)            -    -
-  -                                              -    -
-  -  Content...                                  -    -
-  -                                              -    -
-  ------------------------------------------------    -
-                                                      -
-  ------------ ------------ ------------              -
-  -  Card    - -  Card    - -  Card    -              -
-  -  (grid)  - -  (grid)  - -  (grid)  -              -
-  ------------ ------------ ------------              -
-------------------------------------------------------
```

---

## 7. DARK MODE

### 7.1 Create Dark Theme File

**NEW FILE:** `/tmp/huchu/app/themes/dark.css`

```css
[data-theme="dark"] {
  color-scheme: dark;

  /* === DARK NEUTRAL PALETTE === */
  --neutral-0:  #0f0f0f;
  --neutral-25: #1a1a1a;
  --neutral-50: #262626;
  --neutral-100: #333333;
  --neutral-200: #404040;
  --neutral-300: #525252;
  --neutral-400: #737373;
  --neutral-500: #a3a3a3;
  --neutral-600: #d4d4d4;
  --neutral-700: #e5e5e5;
  --neutral-800: #f5f5f5;
  --neutral-900: #fafafa;

  /* === SURFACES === */
  --surface-canvas:  #0f0f0f;
  --surface-base:    #1a1a1a;
  --surface-raised:  #262626;
  --surface-muted:   #262626;
  --surface-subtle:  #1a1a1a;
  --surface-soft:    #262626;

  /* === TEXT === */
  --text-strong: #fafafa;
  --text-body:   #e5e5e5;
  --text-muted:  #a3a3a3;
  --text-subtle: #737373;

  /* === ACTIONS (brighter in dark) === */
  --action-primary-bg:    #3b82f6;
  --action-primary-hover: #60a5fa;
  --action-primary-pressed: #93c5fd;

  --action-secondary-bg:    #262626;
  --action-secondary-fg:    #e5e5e5;
  --action-secondary-hover: #333333;

  /* === EDGES === */
  --edge-subtle:   #262626;
  --edge-default:  #333333;
  --edge-strong:   #404040;
  --input-border:  #333333;
  --input-bg:      #1a1a1a;

  /* === SIDEBAR === */
  --sidebar:          #0f0f0f;
  --sidebar-border:   #262626;
  --sidebar-item-active-bg: rgba(59, 130, 246, 0.15);
  --sidebar-item-active-fg: #60a5fa;

  /* === TABLE === */
  --table-header-bg:  #1a1a1a;
  --table-row-hover:  #262626;
  --table-row-selected: rgba(59, 130, 246, 0.15);
  --table-divider:    #333333;

  /* === SHADOWS (stronger in dark) === */
  --shadow-card:    0 1px 3px rgba(0,0,0,0.3);
  --shadow-hover:   0 4px 6px rgba(0,0,0,0.2);
  --shadow-dropdown: 0 8px 16px rgba(0,0,0,0.4);
  --shadow-modal:   0 20px 25px rgba(0,0,0,0.5);
}
```

### 7.2 Add to layout.tsx

**FILE:** `/tmp/huchu/app/layout.tsx`

**ACTION:** Import dark.css:

```tsx
import "./themes/dark.css";
```

### 7.3 Theme Toggle Component

**NEW FILE:** `/tmp/huchu/components/theme-toggle.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      {theme === "light" ? "Moon" : "Sun"}
    </Button>
  );
}
```

### 7.4 Add Toggle to Navbar

**FILE:** `/tmp/huchu/components/layout/navbar.tsx`

**ACTION:** Import and render ThemeToggle in the right section.

---

## 8. ANIMATION & MOTION

### 8.1 Micro-interactions

| Element | Trigger | Property | From | To | Duration | Easing |
|---------|---------|----------|------|-----|----------|--------|
| Button | Hover | background | - | darker | 150ms | standard |
| Button | Press | transform | scale(1) | scale(0.97) | 100ms | ease-in |
| Card | Hover | box-shadow | card | hover | 200ms | standard |
| Input | Focus | border + shadow | - | focus ring | 200ms | standard |
| Nav Item | Hover | background | - | hover bg | 150ms | standard |
| Table Row | Hover | background | - | hover bg | 150ms | standard |

### 8.2 Modal Animations

```css
/* Fade in backdrop */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Scale in content */
@keyframes modal-in {
  from { opacity: 0; transform: translate(-50%, -48%) scale(0.95); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/* Fade out */
@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* Scale out */
@keyframes modal-out {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  to { opacity: 0; transform: translate(-50%, -48%) scale(0.95); }
}
```

### 8.3 Page Load Stagger

```css
.stagger-children > * {
  animation: fade-in-up 400ms var(--motion-ease-standard) forwards;
  opacity: 0;
}

.stagger-children > *:nth-child(1) { animation-delay: 0ms; }
.stagger-children > *:nth-child(2) { animation-delay: 50ms; }
.stagger-children > *:nth-child(3) { animation-delay: 100ms; }
.stagger-children > *:nth-child(4) { animation-delay: 150ms; }
/* etc. */

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### 8.4 Skeleton Loading

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--neutral-100) 0%,
    var(--neutral-200) 50%,
    var(--neutral-100) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

## 9. IMPLEMENTATION PHASES

### Phase 1: Foundation (Day 1) - 4 hours
**Goal:** New token system in place, app still works

**Tasks:**
1. [ ] Backup all files to be modified
2. [ ] Replace `globals.css` :root block with new tokens
3. [ ] Simplify `client.css` to minimal overrides
4. [ ] Simplify `admin.css` to minimal overrides
5. [ ] Add Inter font to `layout.tsx`
6. [ ] Remove SS Huchu font declarations
7. [ ] Update Tailwind theme mappings
8. [ ] Run `npm run build` - fix any errors
9. [ ] Visually verify app still renders

**Deliverable:** App builds with new tokens, no visual regressions

### Phase 2: Core UI Components (Day 1-2) - 6 hours
**Goal:** All primitive components restyled

**Tasks:**
1. [ ] Update `Button` component (radius, colors, sizes)
2. [ ] Update `Card` component (radius, shadow, padding)
3. [ ] Update `Input` component (height, radius, focus)
4. [ ] Update `Table` component (header, row height, hover)
5. [ ] Update `Dialog` component (radius, shadow, animation)
6. [ ] Update `Badge` component (variants, pill shape)
7. [ ] Update `DropdownMenu` component (radius, shadow)
8. [ ] Update `Select` component (radius, height)
9. [ ] Run `npm run build` - fix any errors

**Deliverable:** All UI primitives match Attio spec

### Phase 3: Layout Components (Day 2) - 4 hours
**Goal:** App shell matches Attio layout

**Tasks:**
1. [ ] Update `Sidebar` component (width, nav items, active state)
2. [ ] Update `AppSidebar` component (section headers, collapse)
3. [ ] Update `Navbar` component (height, border, no blur)
4. [ ] Update `AppShell` component (flat, no border radius)
5. [ ] Update content padding and spacing
6. [ ] Test sidebar collapse/expand
7. [ ] Run `npm run build` - fix any errors

**Deliverable:** Layout matches Attio screenshots

### Phase 4: Page Components (Day 2-3) - 8 hours
**Goal:** All page UIs restyled

**Tasks:**
1. [ ] Update all `*-content.tsx` files:
   - Page headers (title, description)
   - Form shells (labels, inputs, spacing)
   - Data tables (headers, rows, actions)
   - Cards and grids
2. [ ] Update `page-intro.tsx` component
3. [ ] Update `form-shell.tsx` component
4. [ ] Update `data-list-shell.tsx` component
5. [ ] Update `status-state.tsx` component
6. [ ] Update `primary-action-bar.tsx` component
7. [ ] Run `npm run build` - fix any errors

**Deliverable:** All pages match Attio design

### Phase 5: Dark Mode & Polish (Day 3) - 4 hours
**Goal:** Dark mode works, animations smooth, final QA

**Tasks:**
1. [ ] Create `dark.css` theme file
2. [ ] Add theme toggle component
3. [ ] Add toggle to navbar
4. [ ] Test all components in dark mode
5. [ ] Verify animations (button press, modal, hover)
6. [ ] Add stagger animation to page loads
7. [ ] Add skeleton loading states
8. [ ] Test on mobile viewport
9. [ ] Run `npm run build` - fix any errors
10. [ ] Run Lighthouse audit - target >95

**Deliverable:** Complete Attio-quality product UI

---

## 10. QUALITY ASSURANCE

### 10.1 Visual Checklist

**Colors:**
- [ ] Primary buttons use #2563EB
- [ ] Secondary buttons use #F3F4F6
- [ ] Text uses #111827 (not pure black)
- [ ] Secondary text uses #6B7280
- [ ] Borders use #E5E7EB
- [ ] No hardcoded colors in components

**Typography:**
- [ ] Inter font loaded and applied
- [ ] Body text is 14px
- [ ] Labels are 12px uppercase
- [ ] Page titles are 20px semibold
- [ ] Line heights are 1.4-1.5

**Spacing:**
- [ ] Buttons are 36px tall
- [ ] Cards have 16px padding
- [ ] Tables have 12px 16px cell padding
- [ ] Content has 24px padding
- [ ] Sidebar is 256px wide

**Radius:**
- [ ] Buttons are 6px radius
- [ ] Cards are 8px radius
- [ ] Modals are 12px radius
- [ ] Badges are pill-shaped
- [ ] Inputs are 6px radius

**Shadows:**
- [ ] Cards have subtle shadow (0 1px 3px)
- [ ] Hover has lift shadow (0 4px 6px)
- [ ] Modals have strong shadow (0 20px 25px)
- [ ] No heavy shadows on static elements

### 10.2 Interaction Checklist

**Buttons:**
- [ ] Hover changes background color
- [ ] Press scales to 0.97
- [ ] Disabled state is visible
- [ ] Focus ring is visible

**Inputs:**
- [ ] Focus shows blue border + ring
- [ ] Placeholder is gray
- [ ] Error state shows red
- [ ] Disabled state is visible

**Cards:**
- [ ] Hover lifts slightly
- [ ] Shadow increases on hover
- [ ] No jumpy transitions

**Tables:**
- [ ] Header is distinct from body
- [ ] Rows highlight on hover
- [ ] Selected row is obvious
- [ ] Sort indicators visible

**Modals:**
- [ ] Backdrop fades in
- [ ] Content scales in
- [ ] Close button works
- [ ] Escape key closes

### 10.3 Dark Mode Checklist

**Surfaces:**
- [ ] Canvas is #0F0F0F
- [ ] Cards are #1A1A1A
- [ ] Elevated are #262626
- [ ] No pure white in dark mode

**Text:**
- [ ] Primary is #FAFAFA
- [ ] Secondary is #A3A3A3
- [ ] Muted is #737373
- [ ] All text readable

**Borders:**
- [ ] Borders are visible (#333333)
- [ ] Not too strong
- [ ] Not invisible

**Accents:**
- [ ] Blue is brighter (#3B82F6)
- [ ] Success/warning/danger preserved
- [ ] Badges visible

### 10.4 Performance Checklist

**Build:**
- [ ] `npm run build` completes without errors
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Bundle size not significantly increased

**Runtime:**
- [ ] First paint < 1.5s
- [ ] Animations at 60fps
- [ ] No layout shift on load
- [ ] Smooth scrolling

**Accessibility:**
- [ ] WCAG 2.1 AA contrast ratios
- [ ] Focus indicators visible
- [ ] Reduced motion supported
- [ ] Screen reader friendly

---

## 11. AGENT EXECUTION PROMPT

### Context
You are an elite design engineering team. Your mission: transform the Huchu ERP codebase to match Attio's design language. You have:
- Complete design token specification (Section 2)
- Codebase audit (Section 3)
- Exact file changes (Section 4-5)
- Implementation phases (Section 9)
- Quality checklist (Section 10)

### Rules
1. **NEVER break existing functionality** - only change styling
2. **Use CSS custom properties** - no hardcoded colors
3. **Maintain TypeScript types** - fix any type errors
4. **Test after every phase** - `npm run build` must pass
5. **Follow the specification exactly** - no creative deviations
6. **Ask for clarification** - if anything is unclear

### Execution Order
Execute in the exact phases defined in Section 9. Do not skip phases. Do not combine phases. Each phase must be verified before proceeding.

### Communication
Report after each phase:
- What was completed
- Any issues encountered
- Screenshots of key changes
- Build status

### Emergency Procedures
If `npm run build` fails:
1. Stop immediately
2. Identify the error
3. Fix the error
4. Re-run build
5. Do not proceed until build passes

If visual regression occurs:
1. Screenshot the issue
2. Compare with specification
3. Fix the discrepancy
4. Verify fix

### Reference Documents
- This document (primary)
- Attio screenshots (visual reference)
- Huchu codebase (implementation target)

---

## 12. APPENDICES

### Appendix A: File Change Summary

| File | Action | Lines | Priority |
|------|--------|-------|----------|
| `app/globals.css` | Replace :root block | ~300 | P0 |
| `app/themes/client.css` | Simplify | ~20 | P0 |
| `app/themes/admin.css` | Simplify | ~20 | P0 |
| `app/themes/dark.css` | Create new | ~80 | P1 |
| `app/layout.tsx` | Add Inter font | ~10 | P0 |
| `components/ui/button.tsx` | Restyle | ~30 | P1 |
| `components/ui/card.tsx` | Restyle | ~20 | P1 |
| `components/ui/input.tsx` | Restyle | ~15 | P1 |
| `components/ui/table.tsx` | Restyle | ~25 | P1 |
| `components/ui/dialog.tsx` | Restyle | ~30 | P1 |
| `components/ui/badge.tsx` | Restyle | ~20 | P1 |
| `components/ui/sidebar.tsx` | Restyle | ~40 | P2 |
| `components/layout/app-shell.tsx` | Restyle | ~10 | P2 |
| `components/layout/app-sidebar.tsx` | Restyle | ~30 | P2 |
| `components/layout/navbar.tsx` | Restyle | ~20 | P2 |
| `components/theme-toggle.tsx` | Create new | ~25 | P3 |
| `components/shared/page-intro.tsx` | Restyle | ~10 | P3 |
| `components/shared/form-shell.tsx` | Restyle | ~15 | P3 |
| `components/shared/status-state.tsx` | Restyle | ~15 | P3 |
| `components/shared/data-list-shell.tsx` | Restyle | ~20 | P3 |
| `components/shared/primary-action-bar.tsx` | Restyle | ~15 | P3 |
| `components/*/*-content.tsx` | Restyle ALL | ~50 each | P3 |

**Total:** ~40 files, ~1000 lines changed

### Appendix B: Color Mapping (Old → New)

| Old Token | Old Value | New Token | New Value |
|-----------|-----------|-----------|-----------|
| `--primary` | #2f6bff | `--primary` | #2563EB |
| `--neutral-900` | #1b2127 | `--neutral-900` | #111827 |
| `--surface-canvas` | #f8f9f8 | `--surface-canvas` | #F9FAFB |
| `--text-body` | #1b2127 | `--text-body` | #1F2937 |
| `--action-primary-bg` | #2f6bff | `--action-primary-bg` | #2563EB |
| `--sidebar` | #fcfcfb | `--sidebar` | #FFFFFF |
| `--font-family` | "SS Huchu" | `--font-family` | Inter |

### Appendix C: Reference Links

- Attio: https://attio.com
- Inter Font: https://fonts.google.com/specimen/Inter
- Tailwind CSS: https://tailwindcss.com
- shadcn/ui: https://ui.shadcn.com

### Appendix D: Glossary

| Term | Definition |
|------|------------|
| Token | CSS custom property (--*) |
| Surface | Background layer |
| Action | Interactive element (button) |
| Edge | Border/divider |
| Canvas | App background |
| Shell | Layout wrapper |

---

**END OF DOCUMENT**

*This specification is complete and ready for execution. Every detail has been specified. Every value has been provided. Every file has been identified. Execute with precision.*
