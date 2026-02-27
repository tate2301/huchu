import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Detail page shell with desktop right rail.
 * Main content stays fluid while the rail remains sticky.
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
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
  return <div className={cn("min-w-0 space-y-6", className)}>{children}</div>;
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
        "hidden flex-col gap-6 lg:flex",
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
  return <div className={cn("flex flex-col gap-1", className)}>{children}</div>;
}

interface DetailTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailTitle({ children, className }: DetailTitleProps) {
  return <h1 className={cn("text-page-title text-foreground", className)}>{children}</h1>;
}

interface DetailMetaProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailMeta({ children, className }: DetailMetaProps) {
  return (
    <div className={cn("flex items-center gap-3 text-sm text-muted-foreground", className)}>
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
        "rounded-lg border border-[var(--edge-subtle)] bg-card p-6 text-card-foreground shadow-[var(--card-shadow-rest)]",
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
        "mb-4 flex items-center justify-between border-b border-[var(--card-divider)] pb-3",
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

/** CTA section for the right rail. */

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
        "space-y-4 rounded-lg border border-[var(--edge-subtle)] bg-card p-6 text-card-foreground shadow-[var(--card-shadow-rest)]",
        className
      )}
    >
      <div>
        <h3 className="mb-1 text-section-title text-foreground">{title}</h3>
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
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
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

/** Label/value row for right-rail detail blocks. */

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
      <dt className="min-w-[100px] text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
