"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react-dialog";
import { cva } from "class-variance-authority";
import { X } from "@/lib/icons";
import {
  DIALOG_INSET_VIEWPORT_CLASSNAMES,
  DIALOG_SIZE_CLASSNAMES,
  DIALOG_TABLET_CONTENT_CLASSNAMES,
  DIALOG_TABLET_VIEWPORT_CLASSNAMES,
  type DialogTabletBehavior,
  type ResponsiveSurfaceSize,
} from "@/lib/ui/responsive-surface";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

/**
 * Attio-inspired dialog content with mobile-first design.
 *
 * - 14px rounded corners (slightly more refined)
 * - Full-screen on small screens (<640px) for better mobile UX
 * - Softer backdrop blur
 * - Reduced padding on mobile (p-4) vs desktop (p-6)
 * - Touch-friendly close button (min 44px)
 * - Smooth 200ms animations
 */
const dialogContentVariants = cva(
  "relative grid w-full gap-4 overflow-y-auto overscroll-contain border-0 sm:border border-[var(--border-default)] bg-popover text-foreground shadow-[var(--shadow-popover)] transition ease-[var(--motion-ease-default)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.985] motion-safe:duration-200 focus:outline-none",
  {
    variants: {
      size: DIALOG_SIZE_CLASSNAMES,
      tabletBehavior: DIALOG_TABLET_CONTENT_CLASSNAMES,
      inset: {
        true: "p-4 sm:p-6",
        false: "p-0",
      },
    },
    defaultVariants: {
      size: "md",
      tabletBehavior: "adaptive",
      inset: true,
    },
  }
);

/**
 * Mobile dialog override classes.
 * Applied when the dialog should be full-screen on small devices.
 */
const mobileFullScreenClasses =
  "rounded-t-[14px] sm:rounded-[14px] max-h-[92dvh] sm:max-h-[calc(100dvh-3rem)]";

type DialogContentProps =
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> & {
    size?: ResponsiveSurfaceSize;
    tabletBehavior?: DialogTabletBehavior;
    inset?: boolean;
    /** When true, shows the close button (default: true) */
    showCloseButton?: boolean;
  };

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      size = "md",
      tabletBehavior = "adaptive",
      inset = true,
      showCloseButton = true,
      ...props
    },
    ref
  ) => (
    <DialogPortal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[var(--surface-overlay)] backdrop-blur-[6px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" />
      <DialogPrimitive.Viewport
        className={cn(
          "fixed inset-0 z-50 flex justify-center overflow-y-auto overscroll-contain",
          DIALOG_TABLET_VIEWPORT_CLASSNAMES[tabletBehavior],
          DIALOG_INSET_VIEWPORT_CLASSNAMES[inset ? "true" : "false"]
        )}
      >
        <DialogPrimitive.Popup
          ref={ref}
          data-slot="dialog-content"
          className={cn(
            dialogContentVariants({ size, tabletBehavior, inset }),
            mobileFullScreenClasses,
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogClose className="absolute right-2 top-2 sm:right-3 sm:top-3 inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-[var(--button-radius)] bg-[var(--surface-subtle)] text-muted-foreground transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-out hover:bg-[var(--surface-soft)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0 disabled:pointer-events-none touch-manipulation">
              <X className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPortal>
  )
);
DialogContent.displayName = DialogPrimitive.Popup.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn(
      "flex min-w-0 flex-col gap-1.5 text-left",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn(
      "flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end sm:space-x-0",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="dialog-title"
    className={cn(
      "text-lg font-semibold tracking-[-0.02em] text-foreground text-wrap-balance",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="dialog-description"
    className={cn("text-sm text-[var(--text-muted)]", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
