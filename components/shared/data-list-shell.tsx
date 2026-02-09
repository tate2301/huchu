import type { ReactNode } from "react";

import { StatusState } from "@/components/shared/status-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-4", contentClassName)}>
        {filters ? <div>{filters}</div> : null}
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
      </CardContent>
    </Card>
  );
}
