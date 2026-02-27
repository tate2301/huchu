import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Detail Page with Right Panel
 * Extracted from design spec - Two-column layout for detail views
 *
 * Structure:
 * - Main content: 680-760px fluid
 * - Right panel: 320-360px, sticky
 * - Right panel sections: Details → CTA block → Evidence → Integrations
 *
 * Usage pattern: Object detail + actions + context
 */

interface DetailPageShellProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailPageShell({
  children,
  className,
}: DetailPageShellProps) {
  return (
    <div className={cn("content-shell py-6", className)}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {children}
      </div>
    </div>
  );
}

interface DetailMainContentProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailMainContent({
  children,
  className,
}: DetailMainContentProps) {
  return (
    <div className={cn("flex flex-col gap-6 min-w-0", className)}>
      {children}
    </div>
  );
}

interface DetailRightPanelProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailRightPanel({
  children,
  className,
}: DetailRightPanelProps) {
  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col gap-6",
        "lg:sticky lg:top-[calc(3.5rem+1.5rem)] lg:self-start",
        "lg:max-h-[calc(100vh-3.5rem-3rem)]",
        "overflow-y-auto",
        className
      )}
    >
      {children}
    </aside>
  );
}

interface DetailHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailHeader({ children, className }: DetailHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>{children}</div>
  );
}

interface DetailTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailTitle({ children, className }: DetailTitleProps) {
  return (
    <h1 className={cn("text-page-title text-foreground", className)}>
      {children}
    </h1>
  );
}

interface DetailMetaProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailMeta({ children, className }: DetailMetaProps) {
  return (
    <div className={cn("flex items-center gap-3 text-sm text-muted", className)}>
      {children}
    </div>
  );
}

interface DetailSectionProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailSection({ children, className }: DetailSectionProps) {
  return (
    <section
      className={cn(
        "bg-surface-base rounded-lg border border-border p-6",
        className
      )}
    >
      {children}
    </section>
  );
}

interface DetailSectionHeaderProps {
  title: string;
  action?: React.ReactNode;
  className?: string;
}

export function DetailSectionHeader({
  title,
  action,
  className,
}: DetailSectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between mb-4 pb-3 border-b border-card-divider",
        className
      )}
    >
      <h2 className="text-section-title text-foreground">{title}</h2>
      {action}
    </div>
  );
}

interface DetailSectionContentProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailSectionContent({
  children,
  className,
}: DetailSectionContentProps) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}

/**
 * Right Panel CTA Block
 * Call-to-action section in the right panel
 * Shows requirements, progress, and primary action
 */

interface DetailCTABlockProps {
  title: string;
  description?: string;
  progress?: {
    current: number;
    total: number;
    label: string;
  };
  action: React.ReactNode;
  requirements?: React.ReactNode;
  className?: string;
}

export function DetailCTABlock({
  title,
  description,
  progress,
  action,
  requirements,
  className,
}: DetailCTABlockProps) {
  return (
    <div
      className={cn(
        "bg-surface-base rounded-lg border border-border p-6 space-y-4",
        className
      )}
    >
      <div>
        <h3 className="text-section-title text-foreground mb-1">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{progress.label}</span>
            <span className="font-medium text-foreground">
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {requirements}

      {action}
    </div>
  );
}

/**
 * Detail Field Row
 * Label + value row for the right panel details section
 */

interface DetailFieldRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function DetailFieldRow({
  label,
  value,
  className,
}: DetailFieldRowProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <dt className="text-sm text-muted-foreground min-w-[100px]">{label}</dt>
      <dd className="text-sm text-foreground font-medium text-right">{value}</dd>
    </div>
  );
}
