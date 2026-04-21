"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "@/lib/icons";
import {
  SHEET_SIZE_CLASSNAMES,
  type SheetTabletBehavior,
  type ResponsiveSurfaceSize,
} from "@/lib/ui/responsive-surface";

import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[var(--surface-overlay)] backdrop-blur-[6px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-150 data-[state=open]:duration-200",
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Attio-inspired sheet variants.
 *
 * - Side sheets: 18px rounded corners (more refined)
 * - Softer shadows
 * - Bottom sheet on mobile by default for better mobile UX
 * - Touch-friendly close button (min 44px)
 * - Smooth 200ms slide animations
 */
const sheetVariants = cva(
  "fixed z-50 max-h-[100dvh] overflow-y-auto overscroll-contain border-[var(--border-default)] bg-popover text-foreground focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=open]:duration-200",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 max-h-[92dvh] border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 max-h-[92dvh] border-t rounded-t-[18px] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left:
          "inset-y-0 left-0 h-dvh w-[var(--sheet-size-mobile)] sm:w-[var(--sheet-size-sm)] md:w-[var(--sheet-size-md)] lg:w-[var(--sheet-size-lg)] border-r rounded-r-[18px] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        right:
          "inset-y-0 right-0 h-dvh w-[var(--sheet-size-mobile)] sm:w-[var(--sheet-size-sm)] md:w-[var(--sheet-size-md)] lg:w-[var(--sheet-size-lg)] border-l rounded-l-[18px] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
      },
      size: SHEET_SIZE_CLASSNAMES,
      tabletBehavior: {
        adaptive:
          "md:max-lg:rounded-[18px] md:max-lg:shadow-[var(--elevation-4)]",
        side: "md:max-lg:rounded-[18px] md:max-lg:shadow-[var(--elevation-4)]",
        bottom:
          "md:max-lg:!inset-x-2 md:max-lg:!top-auto md:max-lg:!bottom-2 md:max-lg:!h-auto md:max-lg:!w-auto md:max-lg:!max-h-[86dvh] md:max-lg:rounded-[18px] md:max-lg:data-[state=closed]:slide-out-to-bottom md:max-lg:data-[state=open]:slide-in-from-bottom",
        fullscreen:
          "md:max-lg:!inset-0 md:max-lg:!h-dvh md:max-lg:!w-screen md:max-lg:!max-h-dvh md:max-lg:!rounded-none",
      },
      inset: {
        true: "p-4 sm:p-6",
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
);

type SheetContentProps =
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> &
    VariantProps<typeof sheetVariants> & {
      size?: ResponsiveSurfaceSize;
      tabletBehavior?: SheetTabletBehavior;
      inset?: boolean;
      /** When true, shows the close button (default: true) */
      showCloseButton?: boolean;
    };

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(
  (
    {
      side = "right",
      size = "md",
      tabletBehavior = "adaptive",
      inset = false,
      showCloseButton = true,
      className,
      children,
      ...props
    },
    ref
  ) => (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          sheetVariants({ side, size, tabletBehavior, inset }),
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetClose className="absolute right-2 top-2 sm:right-3 sm:top-3 inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-[var(--button-radius)] border border-[var(--border-default)] bg-[var(--surface-subtle)] text-muted-foreground shadow-[var(--surface-frame-shadow)] transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-out hover:bg-[var(--surface-soft)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-0 disabled:pointer-events-none touch-manipulation">
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="sr-only">Close</span>
          </SheetClose>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  )
);
SheetContent.displayName = DialogPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="sheet-header"
    className={cn(
      "flex min-w-0 flex-col gap-1.5 text-left",
      className
    )}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="sheet-footer"
    className={cn(
      "flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end sm:space-x-0",
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="sheet-title"
    className={cn(
      "text-lg font-semibold tracking-[-0.02em] text-foreground text-wrap-balance",
      className
    )}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="sheet-description"
    className={cn("text-sm text-[var(--text-muted)]", className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
