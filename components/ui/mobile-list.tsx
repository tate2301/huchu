"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/ui/status-dot";
import { ChevronRight } from "@/lib/icons";

/* ── Mobile List Root ────────────────────────────────────────────────────── */

const MobileList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="mobile-list"
    className={cn(
      "flex flex-col divide-y divide-[var(--mobile-list-divider-color)] overflow-hidden rounded-[var(--card-radius)] border border-[var(--border-default)] bg-[var(--surface-base)] shadow-[var(--card-shadow-rest)]",
      className
    )}
    {...props}
  />
));
MobileList.displayName = "MobileList";

/* ── Mobile List Item ────────────────────────────────────────────────────── */

const mobileListItemVariants = cva(
  "group/mobile-list-item flex items-center gap-3 transition-colors duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)]",
  {
    variants: {
      variant: {
        default:
          "min-h-[var(--mobile-list-item-height)] px-[var(--content-gutter-x)] py-3 active:bg-[var(--surface-muted)]",
        compact:
          "min-h-[52px] px-[var(--content-gutter-x)] py-2.5 active:bg-[var(--surface-muted)]",
        touchable:
          "min-h-[var(--touch-target-generous)] px-[var(--content-gutter-x)] py-3 active:bg-[var(--surface-muted)] cursor-pointer",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

type MobileListItemProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof mobileListItemVariants> & {
    asChild?: boolean;
    href?: string;
  };

const MobileListItem = React.forwardRef<HTMLDivElement, MobileListItemProps>(
  ({ className, variant, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        data-slot="mobile-list-item"
        className={cn(mobileListItemVariants({ variant, className }))}
        {...props}
      />
    );
  }
);
MobileListItem.displayName = "MobileListItem";

/* ── Mobile List Icon / Avatar ───────────────────────────────────────────── */

const mobileListIconVariants = cva(
  "flex shrink-0 items-center justify-center overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "h-[var(--mobile-list-icon-size)] w-[var(--mobile-list-icon-size)] rounded-[var(--mobile-list-icon-radius)] border border-[var(--edge-default)] bg-[var(--surface-soft)] text-[var(--text-strong)] shadow-[var(--surface-frame-shadow)]",
        brand:
          "h-[var(--mobile-list-icon-size)] w-[var(--mobile-list-icon-size)] rounded-[var(--mobile-list-icon-radius)] border border-[var(--primary-300)] bg-[var(--primary-50)] text-[var(--primary-700)] shadow-[var(--surface-frame-shadow)]",
        ghost:
          "h-9 w-9 rounded-[var(--button-radius)] bg-transparent text-[var(--text-muted)]",
        image:
          "h-[var(--mobile-list-icon-size)] w-[var(--mobile-list-icon-size)] rounded-[var(--mobile-list-icon-radius)] border border-[var(--edge-default)] shadow-[var(--surface-frame-shadow)] [&_img]:h-full [&_img]:w-full [&_img]:object-cover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

type MobileListIconProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof mobileListIconVariants>;

const MobileListIcon = React.forwardRef<HTMLDivElement, MobileListIconProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="mobile-list-icon"
      className={cn(mobileListIconVariants({ variant, className }))}
      {...props}
    />
  )
);
MobileListIcon.displayName = "MobileListIcon";

/* ── Mobile List Content ─────────────────────────────────────────────────── */

const MobileListContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="mobile-list-content"
    className={cn(
      "flex min-w-0 flex-1 flex-col gap-0.5",
      className
    )}
    {...props}
  />
));
MobileListContent.displayName = "MobileListContent";

/* ── Mobile List Title ───────────────────────────────────────────────────── */

const MobileListTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="mobile-list-title"
    className={cn(
      "truncate text-[14px] font-medium leading-snug text-[var(--text-body)]",
      className
    )}
    {...props}
  />
));
MobileListTitle.displayName = "MobileListTitle";

/* ── Mobile List Subtitle ────────────────────────────────────────────────── */

const MobileListSubtitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="mobile-list-subtitle"
    className={cn(
      "truncate text-[13px] leading-snug text-[var(--text-muted)]",
      className
    )}
    {...props}
  />
));
MobileListSubtitle.displayName = "MobileListSubtitle";

/* ── Mobile List Meta ────────────────────────────────────────────────────── */

const MobileListMeta = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="mobile-list-meta"
    className={cn(
      "flex shrink-0 flex-col items-end gap-1 text-right",
      className
    )}
    {...props}
  />
));
MobileListMeta.displayName = "MobileListMeta";

/* ── Mobile List Meta Text ───────────────────────────────────────────────── */

const MobileListMetaText = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="mobile-list-meta-text"
    className={cn(
      "text-[12px] tabular-nums text-[var(--text-subtle)]",
      className
    )}
    {...props}
  />
));
MobileListMetaText.displayName = "MobileListMetaText";

/* ── Mobile List Chevron ─────────────────────────────────────────────────── */

const MobileListChevron = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="mobile-list-chevron"
    className={cn("inline-flex shrink-0", className)}
    {...props}
  >
    <ChevronRight className="h-4 w-4 text-[var(--text-subtle)]" />
  </span>
));
MobileListChevron.displayName = "MobileListChevron";

/* ── Mobile List Badge ───────────────────────────────────────────────────── */

const MobileListBadge = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="mobile-list-badge"
    className={cn("shrink-0", className)}
    {...props}
  />
));
MobileListBadge.displayName = "MobileListBadge";

/* ── Mobile List Status ──────────────────────────────────────────────────── */

type MobileListStatusProps = {
  status: string;
  label?: string;
  className?: string;
};

function MobileListStatus({ status, label, className }: MobileListStatusProps) {
  return (
    <div data-slot="mobile-list-status" className={cn("shrink-0", className)}>
      <StatusDot status={status} label={label} />
    </div>
  );
}

/* ── Mobile List Empty ───────────────────────────────────────────────────── */

const MobileListEmpty = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { icon?: React.ReactNode }
>(({ className, icon, children, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="mobile-list-empty"
    className={cn(
      "flex min-h-[200px] flex-col items-center justify-center gap-3 px-[var(--content-gutter-x)] py-8 text-center",
      className
    )}
    {...props}
  >
    {icon && (
      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--mobile-list-icon-radius)] border border-[var(--edge-default)] bg-[var(--surface-soft)] text-[var(--text-muted)] shadow-[var(--surface-frame-shadow)]">
        {icon}
      </div>
    )}
    <p className="text-sm text-[var(--text-muted)]">{children}</p>
  </div>
));
MobileListEmpty.displayName = "MobileListEmpty";

/* ── Mobile List Section Header ──────────────────────────────────────────── */

const MobileListSectionHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="mobile-list-section-header"
    className={cn(
      "flex min-h-8 items-center bg-[var(--surface-soft)] px-[var(--content-gutter-x)] py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]",
      className
    )}
    {...props}
  />
));
MobileListSectionHeader.displayName = "MobileListSectionHeader";

/* ── Exports ─────────────────────────────────────────────────────────────── */

export {
  MobileList,
  MobileListItem,
  MobileListIcon,
  MobileListContent,
  MobileListTitle,
  MobileListSubtitle,
  MobileListMeta,
  MobileListMetaText,
  MobileListChevron,
  MobileListBadge,
  MobileListStatus,
  MobileListEmpty,
  MobileListSectionHeader,
};
