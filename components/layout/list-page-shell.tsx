import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * List Page Shell
 * Extracted from design spec - Layout pattern for list/table views
 *
 * Structure:
 * 1. Page title left + primary action right
 * 2. Tabs/segmented filters under title (counts in small pills)
 * 3. Toolbar row: filter dropdown, search, group-by, export
 * 4. Table/content
 */

interface ListPageShellProps {
  children: React.ReactNode;
  className?: string;
}

export function ListPageShell({ children, className }: ListPageShellProps) {
  return (
    <div className={cn("flex flex-col gap-6 py-6", className)}>{children}</div>
  );
}

interface ListPageHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function ListPageHeader({ children, className }: ListPageHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 content-shell",
        className
      )}
    >
      {children}
    </div>
  );
}

interface ListPageTitleProps {
  children: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}

export function ListPageTitle({
  children,
  description,
  className,
}: ListPageTitleProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <h1 className="text-page-title text-foreground">{children}</h1>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

interface ListPageActionsProps {
  children: React.ReactNode;
  className?: string;
}

export function ListPageActions({
  children,
  className,
}: ListPageActionsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>{children}</div>
  );
}

interface ListPageTabsProps {
  children: React.ReactNode;
  className?: string;
}

export function ListPageTabs({ children, className }: ListPageTabsProps) {
  return (
    <div
      className={cn(
        "border-b border-border content-shell -mb-6 pb-0",
        className
      )}
    >
      {children}
    </div>
  );
}

interface ListPageToolbarProps {
  children: React.ReactNode;
  className?: string;
}

export function ListPageToolbar({
  children,
  className,
}: ListPageToolbarProps) {
  return (
    <div
      className={cn(
        "sticky z-[15] flex min-h-[3rem] items-center justify-between gap-2 border-y border-[var(--table-toolbar-border)] bg-[var(--table-toolbar-bg)] py-2.5 supports-[backdrop-filter]:backdrop-blur-sm content-shell top-[calc(var(--app-header-height,3.5rem)+0.25rem)]",
        className
      )}
    >
      {children}
    </div>
  );
}

interface ListPageContentProps {
  children: React.ReactNode;
  className?: string;
}

export function ListPageContent({
  children,
  className,
}: ListPageContentProps) {
  return <div className={cn("", className)}>{children}</div>;
}

/**
 * Bulk Action Bar
 * Sticky bottom bar that shows when items are selected
 *
 * Features:
 * - Shows selection count
 * - Provides bulk actions
 * - Soft border + surface background
 * - Pill-ish radius
 * - Allows "Clear selection"
 */

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  children: React.ReactNode;
  className?: string;
}

export function BulkActionBar({
  selectedCount,
  onClearSelection,
  children,
  className,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-4 px-6 py-3",
        "rounded-full border border-[var(--edge-subtle)] bg-[var(--surface-base)]",
        "shadow-[var(--elevation-3)]",
        className
      )}
    >
      <span className="text-sm font-medium text-foreground">
        {selectedCount} selected
      </span>
      <div className="w-px h-5 bg-border" />
      {children}
      <button
        onClick={onClearSelection}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
