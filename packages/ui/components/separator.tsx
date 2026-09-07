"use client";

import { Separator as DsSeparator, type SeparatorProps } from "@corelithzw/react";

/**
 * Separator — the design system's, re-exported under this repo's name.
 *
 * The DS primitive is a drop-in for the Radix one this used to wrap: same
 * `orientation` / `decorative` props, same `data-orientation` attribute (which
 * `button-group.tsx` styles off), and it keeps `data-slot="separator"`.
 *
 * The exported type is deliberately left as the DS's own `SeparatorProps`
 * rather than being narrowed: `button-group.tsx` and `item.tsx` both declare
 * their props as `React.ComponentProps<typeof Separator>`, so anything dropped
 * here would silently disappear from those two APIs as well.
 *
 * The local copy hard-coded `h-px w-full` / `h-full w-px` plus
 * `bg-[var(--border-default)]`; the DS gets the same result from the shipped
 * `.hr` and `.separator-vertical` classes, so those utilities are gone.
 */
export { DsSeparator as Separator };
export type { SeparatorProps };
