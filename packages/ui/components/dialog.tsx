"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cva } from "class-variance-authority"
import { X } from "../lib/icons"
import {
  DIALOG_INSET_VIEWPORT_CLASSNAMES,
  DIALOG_TABLET_CONTENT_CLASSNAMES,
  DIALOG_TABLET_VIEWPORT_CLASSNAMES,
  type DialogTabletBehavior,
  type ResponsiveSurfaceSize,
} from "../lib/ui/responsive-surface"

import { cn } from "../lib/utils"

/**
 * Dialog — the design system's chrome on Base UI's engine.
 *
 * The DS ships its own modal, but it has no focus trap, no scroll lock and no
 * portal/viewport machinery. Base UI provides all three, so the engine stays and
 * only the styling moves: the backdrop renders `.modal-scrim`, the popup renders
 * `.modal-card` plus a `size-*` class (which drives `--modal-max-w`), the header
 * renders `.modal-h` so `.t`/`.s` bind to the title and description, the footer
 * renders `.modal-f`, and the built-in close button renders `.x`.
 *
 * Two deliberate deviations:
 *
 *   - `.modal-b` is not applied. The DS modal is a three-region flex column
 *     (head / scrolling body / foot) but this compound API has no body slot —
 *     73 call sites drop loose JSX straight into `DialogContent` — so the card
 *     keeps scrolling as a whole, as it does today.
 *   - Because the body is unwrapped, the card still owns the content padding via
 *     `inset`. `.modal-h`/`.modal-f` would double-pad against it, so their own
 *     padding (and the footer's rule and muted band, which would float inset
 *     from the card edges) is neutralised by local utilities. What they still
 *     contribute is the descendant scope `.t`/`.s` needs and `flex: none`.
 *
 * The `size`, `tabletBehavior` and `inset` props, every export and every
 * `data-slot` are unchanged. New code should import `Modal` from
 * `@corelithzw/react`.
 */
const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

/**
 * The DS's own max-width scale, keyed by the local `size` values — they happen
 * to be the same five names. `.modal-card.size-*` only sets `--modal-max-w`,
 * which `.modal-card` reads, so these must sit on the popup itself.
 */
const DIALOG_SURFACE_SIZE: Record<ResponsiveSurfaceSize, string> = {
  sm: "modal-sm",
  md: "modal-md",
  lg: "modal-lg",
  xl: "modal-xl",
  full: "modal-full",
}

const dialogContentVariants = cva(
  "modal-card relative gap-4 overflow-y-auto overscroll-contain transition ease-[var(--motion-ease-default)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.985] motion-safe:duration-200 focus:outline-none max-h-[100dvh] sm:max-h-[calc(100dvh-3rem)]",
  {
    variants: {
      size: DIALOG_SURFACE_SIZE,
      tabletBehavior: DIALOG_TABLET_CONTENT_CLASSNAMES,
      inset: {
        true: "p-5 sm:p-6",
        false: "p-0",
      },
    },
    defaultVariants: {
      size: "md",
      tabletBehavior: "adaptive",
      inset: true,
    },
  }
)

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> & {
  size?: ResponsiveSurfaceSize
  tabletBehavior?: DialogTabletBehavior
  inset?: boolean
  /**
   * Off for a surface that draws its own close.
   *
   * The built-in one is absolutely positioned at the popup's top-right corner
   * and knows nothing about what the caller put there. The employee wizard has
   * a close in its own header bar, so both rendered — two X glyphs overlapping
   * in one 32px circle, which is what a phone screenshot of the wizard showed.
   */
  showClose?: boolean
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  DialogContentProps
>(({ className, children, size = "md", tabletBehavior = "adaptive", inset = true, showClose = true, ...props }, ref) => (
  <DialogPortal>
    {/* `fixed inset-0` restates what `.modal-scrim` already does, so the
        backdrop does not depend on which of the package's two `.modal-scrim`
        rules lands last. The z-index comes from the app's one overlay scale
        (see `globals.css`) rather than the DS's own 1100. */}
    <DialogPrimitive.Backdrop className="modal-scrim fixed inset-0 z-[var(--z-overlay)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" />
    <DialogPrimitive.Viewport
      className={cn(
        "fixed inset-0 z-[var(--z-overlay)] flex justify-center overflow-y-auto overscroll-contain",
        DIALOG_TABLET_VIEWPORT_CLASSNAMES[tabletBehavior],
        DIALOG_INSET_VIEWPORT_CLASSNAMES[inset ? "true" : "false"]
      )}
    >
      <DialogPrimitive.Popup
        ref={ref}
        data-slot="dialog-content"
        className={cn(
          dialogContentVariants({ size, tabletBehavior, inset }),
          className
        )}
        {...props}
      >
        {children}
        {/* `.modal-card .x` styles this; it only binds because the button is
            inside the popup. Placement stays absolute — the DS puts its close
            in the header, which this compound API cannot guarantee exists. */}
        {showClose ? (
          <DialogClose
            data-slot="dialog-close"
            className="x absolute right-3 top-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-soft)] disabled:pointer-events-none"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Viewport>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Popup.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn("modal-h flex min-w-0 flex-col p-0 text-left", className)}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn(
      "modal-f flex-col-reverse border-0 bg-transparent p-0 pt-3 sm:flex-row",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="dialog-title"
    className={cn("t text-wrap-balance", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  // `sr-only` is the long-standing default here — most call sites pass a
  // description purely to satisfy the dialog's accessible name requirement.
  <DialogPrimitive.Description
    ref={ref}
    data-slot="dialog-description"
    className={cn("s sr-only", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
