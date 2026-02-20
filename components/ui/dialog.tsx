"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cva } from "class-variance-authority"
import { X } from "@/lib/icons"
import {
  DIALOG_INSET_VIEWPORT_CLASSNAMES,
  DIALOG_SIZE_CLASSNAMES,
  DIALOG_TABLET_CONTENT_CLASSNAMES,
  DIALOG_TABLET_VIEWPORT_CLASSNAMES,
  type DialogTabletBehavior,
  type ResponsiveSurfaceSize,
} from "@/lib/ui/responsive-surface"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const dialogContentVariants = cva(
  "relative grid w-full gap-4 overflow-y-auto overscroll-contain rounded-2xl border-0 bg-popover shadow-[var(--elevation-4)] transition ease-[var(--motion-ease-standard)] focus:outline-none [--dialog-max-w-sm:34rem] [--dialog-max-w-md:40rem] [--dialog-max-w-lg:44rem] max-w-full sm:max-w-[var(--dialog-max-w-sm)] md:max-w-[var(--dialog-max-w-md)] lg:max-w-[var(--dialog-max-w-lg)] max-h-[100dvh] sm:max-h-[calc(100dvh-3rem)]",
  {
    variants: {
      size: DIALOG_SIZE_CLASSNAMES,
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
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  DialogContentProps
>(({ className, children, size = "md", tabletBehavior = "adaptive", inset = true, ...props }, ref) => (
  <DialogPortal>
    <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[var(--surface-overlay)] backdrop-blur-md" />
    <DialogPrimitive.Viewport
      className={cn(
        "fixed inset-0 z-50 flex justify-center overflow-y-auto overscroll-contain",
        DIALOG_TABLET_VIEWPORT_CLASSNAMES[tabletBehavior],
        DIALOG_INSET_VIEWPORT_CLASSNAMES[inset ? "true" : "false"]
      )}
    >
      <DialogPrimitive.Popup
        ref={ref}
        className={cn(
          dialogContentVariants({ size, tabletBehavior, inset }),
          className
        )}
        {...props}
      >
        {children}
        <DialogClose className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-muted-foreground opacity-90 shadow-[var(--edge-outline-sharp)] transition-[background-color,color] hover:bg-[var(--surface-soft)] hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Viewport>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Popup.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-0", className)} {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-[1.05rem] font-semibold text-foreground", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  void className
  void props
  void ref
  return null
})
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
