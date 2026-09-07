"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "../lib/utils";

/**
 * Popover — the design system's surface on Radix's engine.
 *
 * Radix owns the anchoring, collision detection, portalling and dismiss
 * behaviour that the DS popover has no equivalent for, so the engine stays and
 * only the styling moves: `PopoverContent` renders `.popover`, which supplies
 * the surface, border, radius, shadow, type and 16px padding.
 *
 * Two local utilities survive on purpose:
 *
 *   - The popover rung of the app's overlay scale. `.popover` sets no
 *     stacking context of its own, and a popover opened from inside a sheet or
 *     a dialog has to paint above it — see the scale in `globals.css`.
 *   - `max-w-none`. `.popover` caps itself at 320px, but five call sites are
 *     wider than that — four pass `w-[var(--radix-popover-trigger-width)]` to
 *     match a full-width trigger and one asks for `w-[min(23rem,…)]`. Those set
 *     `width`, not `max-width`, so the DS cap would silently clamp them. The
 *     cap is lifted here; a caller that wants it back can pass `max-w-xs`.
 *
 * `w-72` stays as the default width for the callers that pass none; because
 * `cn()` is tailwind-merge, any `w-*` or `p-*` in the caller's `className`
 * still wins over both it and `.popover`. `align="start"` and `sideOffset={6}`
 * defaults are unchanged, as is `PopoverAnchor`.
 *
 * New code should import `Popover` from `@corelithzw/react`.
 */
function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "popover z-[var(--z-overlay)] w-72 max-w-none outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
