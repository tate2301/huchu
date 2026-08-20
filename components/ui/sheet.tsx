"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "@/lib/icons"
import { type SheetTabletBehavior, type ResponsiveSurfaceSize } from "@/lib/ui/responsive-surface"

import { cn } from "@/lib/utils"

/**
 * Sheet — the design system's drawer chrome on Radix's engine.
 *
 * Radix owns the portal, focus trap, scroll lock and the open/close state the DS
 * drawer has no equivalent for, so the engine stays and only the styling moves:
 * the overlay renders `.modal-scrim`, the content `.drawer` plus a
 * `drawer-left|right|top|bottom` side class and a `size-*` class (which drives
 * `--drawer-size`), the header `.drawer-h` — which is what scopes `.ti` on the
 * title and `.sub` on the description — the footer `.drawer-foot`.
 *
 * Deviations, all forced by the existing call sites:
 *
 *   - `.drawer-body` is not applied. There is no body slot on this compound
 *     API; 45 files drop loose JSX straight into `SheetContent`, and 37 of them
 *     pass their own `p-6` on it. The content keeps scrolling as a whole.
 *   - For the same reason `.drawer-h`/`.drawer-foot` would double-pad against
 *     the caller's padding (and the footer's rule and muted band would float
 *     inset from the drawer edges), so those are neutralised by local
 *     utilities. What the classes still contribute is the descendant scope
 *     `.ti`/`.sub` need.
 *   - The close button keeps local utilities. The DS styles it as `.drawer-h .x`,
 *     i.e. inside the header — but `SheetContent` renders it, one file uses
 *     `SheetContent` with no `SheetHeader` at all, and moving it would silently
 *     drop the close affordance there. Its utilities mirror `.drawer-h .x`.
 *
 * `side`, `size`, `tabletBehavior` and `inset` all still work; every export and
 * `data-slot` is unchanged. New code should import `Drawer` from
 * `@corelithzw/react`.
 */
const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // `fixed inset-0` restates what `.modal-scrim` already does, so the
      // overlay does not depend on which of the package's two `.modal-scrim`
      // rules lands last. The z-index comes from the app's one overlay scale
      // (see `globals.css`) rather than the DS's own 1100.
      "modal-scrim fixed inset-0 z-[var(--z-overlay)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-150 data-[state=open]:duration-200",
      className
    )}
    {...props}
  />
))
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

/**
 * `.drawer.size-*` only sets `--drawer-size`, which `.drawer` reads for its
 * width (or, on the top/bottom sides, its height) — so these belong on the
 * content element alongside the side class. The five names line up with the
 * local `size` values.
 */
const SHEET_SURFACE_SIZE: Record<ResponsiveSurfaceSize, string> = {
  sm: "drawer-size-sm",
  md: "drawer-size-md",
  lg: "drawer-size-lg",
  xl: "drawer-size-xl",
  full: "drawer-size-full",
}

const sheetVariants = cva(
  "drawer fixed z-[var(--z-overlay)] max-h-[100dvh] overflow-y-auto overscroll-contain transition ease-[var(--motion-ease-standard)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=open]:duration-200",
  {
    variants: {
      side: {
        top: "drawer-top inset-x-0 top-0 max-h-[92dvh] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "drawer-bottom inset-x-0 bottom-0 max-h-[92dvh] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "drawer-left inset-y-0 left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        right:
          "drawer-right inset-y-0 right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
      },
      size: SHEET_SURFACE_SIZE,
      tabletBehavior: {
        adaptive: "md:max-lg:rounded-2xl md:max-lg:shadow-[var(--elevation-4)]",
        side: "md:max-lg:rounded-2xl md:max-lg:shadow-[var(--elevation-4)]",
        bottom:
          "md:max-lg:!inset-x-2 md:max-lg:!top-auto md:max-lg:!bottom-2 md:max-lg:!h-auto md:max-lg:!w-auto md:max-lg:!max-h-[86dvh] md:max-lg:rounded-2xl md:max-lg:data-[state=closed]:slide-out-to-bottom md:max-lg:data-[state=open]:slide-in-from-bottom",
        fullscreen: "md:max-lg:!inset-0 md:max-lg:!h-dvh md:max-lg:!w-screen md:max-lg:!max-h-dvh md:max-lg:!rounded-none",
      },
      inset: {
        true: "p-5 sm:p-6",
        false: "p-0",
      },
    },
    defaultVariants: {
      side: "right",
      size: "md",
      tabletBehavior: "adaptive",
      inset: false,
    },
  }
)

type SheetContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> &
  VariantProps<typeof sheetVariants> & {
    size?: ResponsiveSurfaceSize
    tabletBehavior?: SheetTabletBehavior
    inset?: boolean
  }

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = "right", size = "md", tabletBehavior = "adaptive", inset = false, className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      data-slot="sheet-content"
      className={cn(sheetVariants({ side, size, tabletBehavior, inset }), className)}
      {...props}
    >
      {children}
      <SheetClose className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-soft)] disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetClose>
    </DialogPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = DialogPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="sheet-header"
    className={cn("drawer-h flex min-w-0 flex-col gap-1.5 border-0 p-0 text-left", className)}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="sheet-footer"
    className={cn(
      "drawer-foot flex-col-reverse border-0 bg-transparent p-0 pt-3 sm:flex-row",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="sheet-title"
    className={cn("ti text-wrap-balance", className)}
    {...props}
  />
))
SheetTitle.displayName = DialogPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  // `sr-only` is the long-standing default — most call sites pass a description
  // only to satisfy the dialog's accessible-description requirement.
  <DialogPrimitive.Description
    ref={ref}
    data-slot="sheet-description"
    className={cn("sub sr-only", className)}
    {...props}
  />
))
SheetDescription.displayName = DialogPrimitive.Description.displayName

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
