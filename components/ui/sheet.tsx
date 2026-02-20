"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "@/lib/icons"
import { SHEET_SIZE_CLASSNAMES, type SheetTabletBehavior, type ResponsiveSurfaceSize } from "@/lib/ui/responsive-surface"

import { cn } from "@/lib/utils"

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
      "fixed inset-0 z-50 bg-[var(--surface-overlay)] backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 max-h-[100dvh] overflow-y-auto overscroll-contain border-0 bg-popover shadow-[var(--elevation-4)] transition ease-[var(--motion-ease-standard)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 max-h-[92dvh] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 max-h-[92dvh] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left:
          "inset-y-0 left-0 h-dvh w-[var(--sheet-size-mobile)] sm:w-[var(--sheet-size-sm)] md:w-[var(--sheet-size-md)] lg:w-[var(--sheet-size-lg)] rounded-r-2xl data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        right:
          "inset-y-0 right-0 h-dvh w-[var(--sheet-size-mobile)] sm:w-[var(--sheet-size-sm)] md:w-[var(--sheet-size-md)] lg:w-[var(--sheet-size-lg)] rounded-l-2xl data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
      },
      size: SHEET_SIZE_CLASSNAMES,
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
      className={cn(sheetVariants({ side, size, tabletBehavior, inset }), className)}
      {...props}
    >
      {children}
      <SheetClose className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-muted-foreground shadow-[var(--edge-outline-sharp)] transition-[background-color,color] hover:bg-[var(--surface-soft)] hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetClose>
    </DialogPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = DialogPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-0", className)} {...props} />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = DialogPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
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
