import type { ReactNode } from "react";

import { StatusState } from "@/components/shared/status-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DataListShellProps = {
  title: string;
  description?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  hasData: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function DataListShell({
  title,
  description,
  filters,
  actions,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  hasData,
  emptyTitle = "No records found",
  emptyDescription = "No records match your current filters.",
  emptyAction,
  children,
  className,
  contentClassName,
}: DataListShellProps) {
  return (
    <section className={cn("space-y-4", className)}>
      <header className="section-shell flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </header>
      <div className={cn("space-y-4", contentClassName)}>
        {filters ? <div className="section-shell">{filters}</div> : null}
        {isError ? (
          <StatusState
            variant="error"
            title="Unable to load records"
            description={errorMessage}
            action={
              onRetry ? (
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  Retry
                </Button>
              ) : null
            }
          />
        ) : isLoading ? (
          <StatusState variant="loading" />
        ) : !hasData ? (
          <StatusState
            variant="empty"
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        ) : (
          children
        )}
      </div>
    </section>
  );
}
