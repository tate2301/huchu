"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { CheckIcon, CircleIcon } from "../lib/icons"

import { cn } from "../lib/utils"

/**
 * DropdownMenu — the design system's menu on Radix's engine.
 *
 * Radix owns the portal, positioning, collision detection, roving focus and
 * typeahead that the DS menu has none of, so the engine stays and only the
 * styling moves. `Content`/`SubContent` render `.menu`; items render
 * `.menu-item`; `Label` `.menu-label`; `Separator` `.menu-divider`; `Shortcut`
 * `.shortcut` (which is only styled as `.menu .menu-item .shortcut`, so it has
 * to stay inside an item); `Group` `.menu-group`; `SubTrigger` adds `.has-sub`
 * for the DS's caret.
 *
 * One deliberate deviation: `.menu .menu-item` is a three-column grid
 * (`16px 1fr auto`) that assumes every item leads with an icon. The 27 files
 * importing this pass anything from a bare label, to icon + label, to a single
 * `asChild` `<Link>`, so a bare label would land in the 16px column and be
 * crushed. The item is therefore forced back to `display: flex` with a local
 * utility; the DS rule's gap, padding, radius, type, colours, hover, focus,
 * disabled and `.danger` treatment all still apply, and the caret is pushed
 * right with `after:ml-auto` instead of the grid's `justify-self`.
 *
 * Checkbox and radio items now render the `.indicator` span the DS styles for
 * `[role="menuitemcheckbox"]`/`[role="menuitemradio"]` — Radix sets those roles
 * and `aria-checked` itself, and the DS hides the indicator when unchecked, so
 * the icon renders unconditionally. Previously these items reserved space for a
 * mark but drew nothing.
 *
 * New code should import `Menu` from `@corelithzw/react`.
 */
const DropdownMenu = DropdownMenuPrimitive.Root

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuSub = DropdownMenuPrimitive.Sub

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

/**
 * Shared by every row: the DS item, unpicked from its grid. See the note above.
 *
 * The icon rules are here rather than at each call site because they were at
 * each call site, and drifted: `h-4 w-4` in one menu, `size-4` in another,
 * inherited black in a third and muted grey in a fourth, with the gap between
 * mark and label set independently every time. A menu is a column of rows that
 * have to scan as one thing. Any icon a caller passes is now sized, spaced and
 * muted the same, and a toned item tints its own mark to match its label —
 * which is what makes a destructive row read as destructive at a glance rather
 * than after reading the verb.
 */
const MENU_ITEM_BASE =
  "menu-item flex w-full min-w-0 select-none items-center gap-2 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-[var(--text-subtle)]"

/** What a row means, drawn on the label and its mark together. */
const MENU_ITEM_TONE = {
  default: "",
  /** Removes something, or cannot be undone. */
  destructive: "danger [&_svg]:text-[var(--status-error-text)]",
  /** Completes something — settling an invoice, accepting a quote. */
  positive: "text-[var(--status-success-text)] [&_svg]:text-[var(--status-success-text)]",
  /** The one thing this menu is mostly opened to do. */
  primary: "[&_svg]:text-[var(--action-primary-bg)]",
} as const

const DropdownMenuGroup = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Group>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Group
    ref={ref}
    data-slot="dropdown-menu-group"
    className={cn("menu-group", className)}
    {...props}
  />
))
DropdownMenuGroup.displayName = DropdownMenuPrimitive.Group.displayName

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(({ className, inset, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    data-slot="dropdown-menu-sub-trigger"
    className={cn(
      MENU_ITEM_BASE,
      "has-sub after:ml-auto data-[state=open]:bg-[var(--surface-muted)]",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
))
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    data-slot="dropdown-menu-sub-content"
    className={cn(
      "menu z-[var(--z-overlay)] data-[state=open]:animate-in data-[state=closed]:animate-out",
      className,
    )}
    {...props}
  />
))
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      data-slot="dropdown-menu-content"
      sideOffset={sideOffset}
      className={cn(
        "menu z-[var(--z-overlay)] data-[state=open]:animate-in data-[state=closed]:animate-out",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

type DropdownMenuItemProps = React.ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Item
> & {
  inset?: boolean
  /** Additive; `destructive` maps onto the DS's `.danger` item treatment. */
  variant?: keyof typeof MENU_ITEM_TONE
}

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  DropdownMenuItemProps
>(({ className, inset, variant = "default", ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    data-slot="dropdown-menu-item"
    data-variant={variant}
    className={cn(
      MENU_ITEM_BASE,
      MENU_ITEM_TONE[variant],
      inset && "pl-8",
      className,
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    data-slot="dropdown-menu-checkbox-item"
    className={cn(MENU_ITEM_BASE, className)}
    checked={checked}
    {...props}
  >
    {/* `.menu .menu-item[aria-checked=false] .indicator` hides this; Radix sets
        `aria-checked` from `checked`. */}
    <span className="indicator" aria-hidden="true">
      <CheckIcon className="h-4 w-4" />
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    data-slot="dropdown-menu-radio-item"
    className={cn(MENU_ITEM_BASE, className)}
    {...props}
  >
    <span className="indicator" aria-hidden="true">
      <CircleIcon className="h-2 w-2 fill-current" />
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, inset, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    data-slot="dropdown-menu-label"
    className={cn("menu-label", inset && "pl-8", className)}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    data-slot="dropdown-menu-separator"
    className={cn("menu-divider", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("shortcut ml-auto", className)}
      {...props}
    />
  )
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}
