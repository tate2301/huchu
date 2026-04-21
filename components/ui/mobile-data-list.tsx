"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "@/lib/icons";

import { cn } from "@/lib/utils";

/**
 * MobileDataList - Container for mobile-friendly data card lists.
 *
 * Designed as a mobile alternative to tables. Each item is a full-width
 * row with proper touch targets (min 48px height) that feels native
 * on mobile (like iOS Settings or Attio mobile views).
 */
function MobileDataList({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="mobile-data-list"
      className={cn(
        "flex w-full flex-col divide-y divide-[var(--edge-subtle)] border-y border-[var(--edge-subtle)] bg-[var(--surface-base)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Props for a single item in the mobile data list.
 */
export interface MobileDataListItemProps
  extends Omit<React.ComponentProps<"div">, "onClick"> {
  /** Primary text - bold, main identifier */
  title: React.ReactNode;
  /** Secondary text - muted, additional context */
  subtitle?: React.ReactNode;
  /** Right-aligned text, e.g. amount, date */
  meta?: React.ReactNode;
  /** Optional status badge rendered at the right */
  badge?: React.ReactNode;
  /** Leading visual element - avatar or icon */
  avatar?: React.ReactNode;
  /** Icon element shown when no avatar */
  icon?: React.ReactNode;
  /** Click handler - when provided, shows a chevron */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  /** URL for link behavior - when provided, wraps in Next.js Link */
  href?: string;
  /** Accessible label for the item */
  ariaLabel?: string;
  /** Whether the item is in a disabled state */
  disabled?: boolean;
}

/**
 * Individual data list item.
 *
 * Features:
 * - Minimum 48px height for touch targets
 * - Leading avatar or icon
 * - Title + subtitle layout
 * - Right-aligned meta text and/or badge
 * - Chevron when clickable or a link
 * - Subtle hover and active states
 * - Full width with bottom border via parent divide-y
 */
function MobileDataListItem({
  className,
  title,
  subtitle,
  meta,
  badge,
  avatar,
  icon,
  onClick,
  href,
  ariaLabel,
  disabled = false,
  children,
  ...props
}: MobileDataListItemProps) {
  const isInteractive = !!onClick || !!href;

  const content = (
    <div
      data-slot="mobile-data-list-item"
      data-interactive={isInteractive ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      className={cn(
        // Base layout
        "group flex min-h-[48px] items-center gap-3 px-4 py-3 transition-[background-color] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)]",
        // Background
        "bg-[var(--surface-base)]",
        // Interactive states
        isInteractive &&
          !disabled &&
          "cursor-pointer hover:bg-[var(--surface-muted)] active:bg-[var(--surface-subtle)]",
        // Disabled state
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      onClick={disabled ? undefined : onClick}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive && !disabled ? 0 : undefined}
      aria-label={ariaLabel}
      onKeyDown={
        isInteractive && !disabled
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
              }
            }
          : undefined
      }
      {...props}
    >
      {/* Leading visual: avatar takes precedence over icon */}
      {(avatar || icon) && (
        <span
          data-slot="mobile-data-list-leading"
          className="flex shrink-0 items-center justify-center"
        >
          {avatar || (
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] text-[var(--text-muted)]">
              {icon}
            </span>
          )}
        </span>
      )}

      {/* Main content: title + subtitle */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          data-slot="mobile-data-list-title"
          className="truncate text-sm font-semibold text-[var(--text-strong)]"
        >
          {title}
        </span>
        {subtitle && (
          <span
            data-slot="mobile-data-list-subtitle"
            className="truncate text-xs text-[var(--text-muted)]"
          >
            {subtitle}
          </span>
        )}
      </span>

      {/* Right side: meta text, badge, chevron */}
      <span className="flex shrink-0 items-center gap-2">
        {meta && (
          <span
            data-slot="mobile-data-list-meta"
            className="text-right text-sm font-medium text-[var(--text-body)]"
          >
            {meta}
          </span>
        )}
        {badge}
        {isInteractive && (
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-subtle)] transition-transform duration-[var(--motion-duration-fast)] group-hover:translate-x-0.5" />
        )}
      </span>
    </div>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className="block no-underline" passHref legacyBehavior>
        {content}
      </Link>
    );
  }

  return content;
}

/**
 * A section header for grouping items in the mobile data list.
 */
function MobileDataListSection({
  className,
  title,
  children,
  ...props
}: React.ComponentProps<"div"> & { title?: React.ReactNode }) {
  return (
    <div
      data-slot="mobile-data-list-section"
      className={cn("flex flex-col", className)}
      {...props}
    >
      {title && (
        <div
          data-slot="mobile-data-list-section-title"
          className="px-4 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]"
        >
          {title}
        </div>
      )}
      <div className="flex flex-col divide-y divide-[var(--edge-subtle)] border-y border-[var(--edge-subtle)] bg-[var(--surface-base)]">
        {children}
      </div>
    </div>
  );
}

export {
  MobileDataList,
  MobileDataListItem,
  MobileDataListSection,
};
