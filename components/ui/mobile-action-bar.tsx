"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ── Mobile Action Bar (fixed bottom bar for mobile) ─────────────────────── */

interface MobileActionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "floating" | "sheet";
  safeArea?: boolean;
}

const MobileActionBar = React.forwardRef<
  HTMLDivElement,
  MobileActionBarProps
>(({ className, variant = "default", safeArea = true, ...props }, ref) => {
  const variantClasses = {
    default:
      "fixed inset-x-0 bottom-0 z-50 border-t border-[var(--edge-default)] bg-[var(--surface-base)]/95 backdrop-blur-md",
    floating:
      "fixed inset-x-4 bottom-4 z-50 rounded-[var(--card-radius)] border border-[var(--edge-default)] bg-[var(--surface-base)]/95 backdrop-blur-md shadow-[var(--elevation-3)]",
    sheet:
      "sticky bottom-0 z-10 border-t border-[var(--edge-default)] bg-[var(--surface-base)]",
  };

  return (
    <div
      ref={ref}
      data-slot="mobile-action-bar"
      data-variant={variant}
      className={cn(
        variantClasses[variant],
        safeArea && "pb-[env(safe-area-inset-bottom,0px)]",
        className
      )}
      {...props}
    />
  );
});
MobileActionBar.displayName = "MobileActionBar";

/* ── Mobile Action Bar Content ───────────────────────────────────────────── */

const MobileActionBarContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="mobile-action-bar-content"
    className={cn(
      "flex items-center gap-3 px-[var(--content-gutter-x)] py-3",
      className
    )}
    {...props}
  />
));
MobileActionBarContent.displayName = "MobileActionBarContent";

/* ── Mobile Action Bar Primary ───────────────────────────────────────────── */

const MobileActionBarPrimary = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="mobile-action-bar-primary"
    className={cn("flex-1", className)}
    {...props}
  />
));
MobileActionBarPrimary.displayName = "MobileActionBarPrimary";

/* ── Mobile Action Bar Secondary ─────────────────────────────────────────── */

const MobileActionBarSecondary = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="mobile-action-bar-secondary"
    className={cn("shrink-0", className)}
    {...props}
  />
));
MobileActionBarSecondary.displayName = "MobileActionBarSecondary";

/* ── Floating Action Button ──────────────────────────────────────────────── */

interface FloatingActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  label?: string;
  position?: "bottom-right" | "bottom-center" | "bottom-left";
  offset?: number;
}

const FloatingActionButton = React.forwardRef<
  HTMLButtonElement,
  FloatingActionButtonProps
>(
  (
    {
      className,
      icon,
      label,
      position = "bottom-right",
      offset = 24,
      ...props
    },
    ref
  ) => {
    const positionClasses = {
      "bottom-right": "right-[var(--content-gutter-x)]",
      "bottom-center": "left-1/2 -translate-x-1/2",
      "bottom-left": "left-[var(--content-gutter-x)]",
    };

    return (
      <button
        ref={ref}
        data-slot="fab"
        data-position={position}
        className={cn(
          "fixed z-50 inline-flex h-14 items-center gap-2 rounded-full bg-[var(--action-primary-bg)] px-4 text-[var(--action-primary-fg)] shadow-[0_4px_14px_rgba(47,107,255,0.35)] transition-all duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]",
          "hover:shadow-[0_6px_20px_rgba(47,107,255,0.45)] hover:-translate-y-0.5",
          "active:scale-[0.97] active:shadow-[0_2px_8px_rgba(47,107,255,0.3)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2",
          positionClasses[position],
          className
        )}
        style={{
          bottom: `calc(${offset}px + env(safe-area-inset-bottom, 0px))`,
        }}
        {...props}
      >
        {icon && <span className="flex h-5 w-5 items-center justify-center">{icon}</span>}
        {label && <span className="text-sm font-semibold">{label}</span>}
      </button>
    );
  }
);
FloatingActionButton.displayName = "FloatingActionButton";

/* ── Exports ─────────────────────────────────────────────────────────────── */

export {
  MobileActionBar,
  MobileActionBarContent,
  MobileActionBarPrimary,
  MobileActionBarSecondary,
  FloatingActionButton,
};

export type {
  MobileActionBarProps,
  FloatingActionButtonProps,
};
