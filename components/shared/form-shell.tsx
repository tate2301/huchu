import type { FormEvent, ReactNode } from "react";

import { PrimaryActionBar } from "@/components/shared/primary-action-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FormShellProps = {
  title: string;
  description?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  actions: ReactNode;
  requiredHint?: string;
  errors?: string[];
  errorTitle?: string;
  className?: string;
  formClassName?: string;
  contentClassName?: string;
  mainClassName?: string;
  rightRailClassName?: string;
  rightRailMeta?: ReactNode;
  rightRailStatus?: ReactNode;
  rightRailAttachments?: ReactNode;
  actionPanelClassName?: string;
};

export function FormShell({
  title,
  description,
  onSubmit,
  children,
  actions,
  requiredHint = "Fields marked with * are required.",
  errors,
  errorTitle = "Please fix the following before submitting",
  className,
  formClassName,
  contentClassName,
  mainClassName,
  rightRailClassName,
  rightRailMeta,
  rightRailStatus,
  rightRailAttachments,
  actionPanelClassName,
}: FormShellProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={contentClassName}>
        <form
          className={cn(
            "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6",
          )}
          onSubmit={onSubmit}
          noValidate
        >
          <div className={cn("min-w-0 space-y-4", formClassName, mainClassName)}>
            {errors?.length ? (
              <Alert variant="destructive">
                <AlertTitle>{errorTitle}</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc space-y-1 pl-5">
                    {errors.map((error, index) => (
                      <li key={`${error}-${index}`}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
            {children}
          </div>

          <aside
            className={cn(
              "space-y-4 lg:sticky lg:top-[calc(3.5rem+1.5rem)] lg:self-start",
              rightRailClassName,
            )}
          >
            <PrimaryActionBar
              hint={requiredHint}
              className={cn(
                "lg:sticky lg:top-0 lg:rounded-lg lg:border lg:border-[var(--edge-subtle)] lg:bg-card lg:px-4 lg:py-4",
                actionPanelClassName,
              )}
            >
              {actions}
            </PrimaryActionBar>
            {rightRailMeta}
            {rightRailStatus}
            {rightRailAttachments}
          </aside>
        </form>
      </CardContent>
    </Card>
  );
}
