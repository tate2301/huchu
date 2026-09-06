"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "@/lib/icons";

import { cn } from "@/lib/utils";

/**
 * Select — the design system's chrome on Radix's compound API.
 *
 * The DS ships a single-component `Select` that takes an `options` array and a
 * single `value`, with a flip-only positioner. 128 files here compose
 * `<Select><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>…`, use
 * grouping, labels, separators, custom item content and Radix's collision
 * handling. None of that survives a props-only widget, so Radix stays and only
 * the styling moves:
 *
 *   - `SelectTrigger` renders the DS input surface (`.input`) — same height,
 *     border, radius, hover and focus ring as every other field on the page.
 *   - `SelectContent` renders the DS menu surface (`.menu`); items, labels and
 *     separators render `.menu-item` / `.menu-label` / `.menu-divider`, which
 *     are scoped as descendants of `.menu`.
 *
 * Two things are deliberately kept over the DS defaults:
 *
 *   - `.menu .menu-item` is `display: grid` with a fixed 16px first column,
 *     which would crush Radix's `ItemText`. The layout is forced back to flex
 *     with utilities; utilities outrank the `corelith` layer (see the layer
 *     order at the top of `app/globals.css`), so no `!important` is needed.
 *   - The caller's `className` is always last in `cn()`. ~30 call sites pass
 *     `size="sm"` alongside `className="h-8 …"` and those have to keep winning.
 *
 * `data-slot` values are load-bearing: `app/themes/admin.css` targets
 * `[data-slot="select-content"]`.
 *
 * New code should import `Select` from `@corelithzw/react` when a plain
 * options-array picker is all that is needed.
 */
function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        // DS field surface: height, padding, radius, border, hover + focus ring.
        "input",
        // A <button> is not an <input>, so the box model has to be restated.
        "flex w-full min-w-0 items-center justify-between gap-2 whitespace-nowrap",
        "data-[size=sm]:h-8",
        // `.input::placeholder` cannot reach a button's placeholder state.
        "data-[placeholder]:text-[var(--text-subtle)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-[var(--text-muted)]",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-3 text-[var(--text-muted)]" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          // DS popover surface: background, border, radius, shadow, padding.
          "menu",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-[var(--z-overlay)] max-h-(--radix-select-content-available-height) origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            // `.menu` already supplies the 6px gutter.
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("menu-label", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        // DS row: radius, type ramp, colour, hover background.
        "menu-item",
        // `.menu .menu-item` is a 3-column grid; Radix renders one in-flow
        // child (the item text) plus an absolutely positioned indicator, so the
        // grid has to be flattened back to flex or the label gets 16px of room.
        "relative flex min-h-10 w-full items-center gap-2 py-2 pr-8 pl-2.5 outline-none select-none",
        "focus:bg-[var(--surface-muted)] focus:text-[var(--text-strong)]",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-[var(--text-muted)]",
        "*:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
      // Radix throws on an empty `value`. Several call sites render items from
      // data that has not loaded yet, so an id-derived placeholder stands in.
      value={props.value ? props.value : `fallback-${props.id}`}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("menu-divider pointer-events-none", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1 text-[var(--text-muted)]",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1 text-[var(--text-muted)]",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
