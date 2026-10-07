# Setup & integration

All facts below were verified against the installed package and this repo, not read off the website.

## Installed state

`@corelithzw/react@0.3.0` is in `package.json` dependencies. Nothing else is needed — do not copy
`tokens.css` / `components.css` / `icons.js` off the website.

| Fact | Value |
|---|---|
| Peer deps | `react ^18 \|\| ^19`, `react-dom ^18 \|\| ^19` — repo has React 19.2.3 ✓ |
| Runtime deps | none |
| Entry | ESM `dist/index.js`, CJS `dist/index.cjs`, types `dist/index.d.ts` |
| Stylesheet | `@corelithzw/react/styles.css` — **the only import you need** |
| Typecheck | Verified clean under this repo's TS 5.9 + React 19 + `moduleResolution: bundler` |

### `styles.css` is self-sufficient — verified

- It is a **superset** of the website's `components.css`: 635 class names vs the site's 586, with **zero**
  classes present on the site but missing from the package. Same for tokens (identical, plus 5 internal ones).
- `dist/react.css` also exists but is a **redundant subset** — its runtime overlay rules
  (`.x-modal-overlay`, `.toast-stack`, `.lightbox-backdrop`, `.file-upload`, `.mobile-shell`,
  `.date-picker-popover`, …) are already appended, minified, to `styles.css`. It is not in the package
  `exports` map. **Do not import it.**
- `styles.css` line 14 pulls Atkinson Hyperlegible Next + Mono from Google Fonts via `@import url(...)`.
  Offline/CSP-restricted builds fall back to `-apple-system` and lose the intended metrics.

## Two blocking gotchas

### 1. No `"use client"` — you must add it

The dist bundle contains **zero** `"use client"` directives but uses `useState`, `useEffect`, and `document`.
Importing any DS component into a Next.js Server Component throws.

Every file importing from `@corelithzw/react` needs `"use client"` at the top. If a Server Component needs
DS markup, wrap it in a thin client child rather than adding `"use client"` up the tree.

```tsx
"use client";
import { Button, DataTable } from "@corelithzw/react";
```

### 2. Token name collisions with `app/globals.css` — RESOLVED

**Status: done.** `styles.css` is imported globally and the collisions below have been reconciled. Kept as
the record of what changed and why.

The package is now imported from `app/globals.css` into a dedicated cascade layer:

```css
@layer theme, base, corelith, app, components, utilities;

@import "tailwindcss";
@import "@corelithzw/react/styles.css" layer(corelith);
```

That single line does the collision resolution. `corelith` sits **above** Tailwind's `theme` layer, so for
every same-named token the package's value wins automatically — `--radius-*`, `--font-sans`, `--font-mono`,
`--ease-*` and the rest resolve to design-system values with no mapping to maintain. It sits **below**
`utilities`, so a Tailwind class on a design-system component still overrides that component's CSS.

`app/globals.css` no longer declares a single token literal. Every legacy name the app still reads is
re-derived from a package token in `app/themes/corelith-bridge.css`.

How each collision landed:

| Token | Was | Now | Note |
|---|---|---|---|
| `--space-8` / `--space-10` | 32 / 40px | DS scale (40 / 64px) | Use sites renamed → `--space-7` / `--space-8`; same rendered px |
| `--button-radius` | 11px | 8px (package) | Buttons are squarer |
| `--radius-sm … 2xl` | `calc()` off `--radius` | 6 / 8 / 10 / 14 / 18px (package) | `--radius-3xl` / `4xl` extend the package's ladder |
| `--radius` | `0.625rem` | `var(--radius-md)` = 8px | The package ships its own `--radius` |
| `--button-height` / `--input-height` | `2.25rem` | `var(--h-control-md)` = 36px | Same size |
| `--font-sans` | "SS Huchu" | Atkinson Hyperlegible Next | Decided — see below |
| `--shadow-popover` | `0 8px 24px …` | `0 12px 32px -8px …` | Deeper popovers |
| `--text-xl` / `--text-2xl` | 20 / 28px | 22 / 32px | Aligned to the DS page-title and display-sm rungs |
| shadcn set | repo aliases | **package tokens** | See below |

**The spacing scale.** The repo indexed roughly by 4×n, the DS indexes by step. They agree through
`--space-6` and diverged after:

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| repo (old) | 4 | 8 | 12 | 16 | 20 | 24 | — | **32** | — | **40** | — | — | — |
| DS | 4 | 8 | 12 | 16 | 20 | 24 | 32 | **40** | 48 | **64** | 80 | 96 | 128 |

The DS scale is now the only one. The two use sites of the old rungs (`app/home/marketing.module.css`) were
renamed `--space-8` → `--space-7` and `--space-10` → `--space-8`, so they render identically.

**The package already ships a shadcn bridge.** `styles.css` declares `--background --foreground --card
--popover --primary --secondary --muted --accent --destructive --input --ring --radius` and their
`-foreground` pairs, mapped onto its own tokens. `corelith-bridge.css` deliberately does **not** redeclare
any of them. Note `--accent` is `--brand-soft` there (shadcn's subtle hover surface); the app's chart accent
is a separate `--accent-50 … --accent-900` ramp with no bare `--accent` rung so the two cannot collide.

**Watch the shadowed Tailwind namespaces.** `--text-xs … --text-2xl` and `--leading-tight/normal/relaxed`
are Tailwind font-size and line-height theme keys. The bridge declares them in an unlayered `:root`, so they
override Tailwind's defaults for every `text-sm` / `leading-normal` class in the app. That is intentional and
long-standing — but it means changing one of those values in the bridge resizes text app-wide.

### 3. Tenant branding no longer reaches the interface

`<body>` carries no inline branding variables. A tenant's colours and typeface paint documents and the logo
tile only; the interface is painted by the product theme (`app/themes/roles.css`) and the fixed type pair
(98-decisions, foundations questions 3 and 4; 00-foundations 5.1.5). An inline style on `<body>` would outrank
every theme block, which is why nothing is written there.

### Themes and dark mode

`<html data-theme>` picks one of three role blocks in `app/themes/roles.css`: `corelith` for every product but
retail, `tender` for retail and `tender-dark` when a retail person chooses Dark (or "Match the device" on a dark
device) on `/preferences/appearance`. The head script in `app/layout.tsx` applies the choice before the first
paint. A final `:root[data-theme]` block points the package's tokens — surfaces, text, borders, the brand and
gray ramps, the status tones — at the roles, so every screen follows the product. There is no
`body.is-dark` and no `prefers-color-scheme` block.

### Typeface — decided

**Atkinson Hyperlegible Next** for every word and **IBM Plex Mono** for figures, references and times.
`app/globals.css` imports both from Google Fonts at the top of the file (an `@import` inside
`@layer corelith` would be dropped); `roles.css` sets `--font-mono`. If a CSP or an offline build blocks Google
Fonts the stack falls back to the system face; the fix is to self-host the two families, not to remove the
import.

The `.woff2` files remain in `public/` and are now unreferenced.

## Remaining adoption work

Tokens and styling are done. What is left is component-by-component API migration:

1. Migrate call sites off `components/ui/*` onto the package's exports, and delete the local component only
   once its replacement is proven everywhere. See `07-repo-migration.md`.
2. Drop superseded dependencies (`@radix-ui/*`, `@base-ui/react`, `@rtcamp/frappe-ui-react`) from
   `package.json` only once nothing imports them.

Note that `07-repo-migration.md` documents an API that is **newer than the installed 0.3.4** in places — it
lists `NavGroup`/`NavItem`, compound `Card.Header`/`Card.Body`, and a controlled `DataTable` with
`DataTableSortState`, none of which 0.3.4 exports. Check `dist/index.d.ts` before trusting a component name.

## Verified environment notes

- Breakpoints in `styles.css` are `max-width`-first: 320, 380, 460, 480, 520, 560, 600, **720**, 760, 900,
  1100, 1200px. 720px is the dominant phone/desktop split; 900/1100/1200 handle shell collapse.
  These are **not** Tailwind's defaults — don't mix the two on one component.
- The repo already carries `@base-ui/react`, six `@radix-ui/*` packages, `@rtcamp/frappe-ui-react`,
  `@tanstack/react-table`, and `@visx/*`. The DS overlaps all of them. Migrating a component means
  **removing** the old dependency's usage, not layering DS on top.
- The DS's own charts (`Chart.Line|Bar|Donut|Sparkline`) are deliberately minimal SVG. The repo's `@visx/*`
  charts are more capable. Do not downgrade a working visx chart to `Chart.*` without checking the
  20 chart recipes in `06-reference-urls.md` for whether the needed form exists at all.
