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
  "relative grid w-full gap-4 overflow-y-auto overscroll-contain rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-strong)] shadow-[var(--shadow-popover)] transition ease-[var(--motion-ease-default)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.985] motion-safe:duration-200 focus:outline-none [--dialog-max-w-sm:34rem] [--dialog-max-w-md:40rem] [--dialog-max-w-lg:44rem] max-w-full sm:max-w-[var(--dialog-max-w-sm)] md:max-w-[var(--dialog-max-w-md)] lg:max-w-[var(--dialog-max-w-lg)] max-h-[100dvh] sm:max-h-[calc(100dvh-3rem)]",
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
    <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[var(--surface-overlay)] backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" />
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
        <DialogClose className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-alt)] text-[var(--text-muted)] transition-all duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]/30 focus:ring-offset-0 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Viewport>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Popup.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex min-w-0 flex-col gap-1.5 text-left", className)} {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end sm:space-x-0", className)} {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-[var(--text-strong)] text-wrap-balance", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("sr-only", className)}
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
