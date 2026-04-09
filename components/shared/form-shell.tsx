import type { FormEvent, ReactNode } from "react";

import { PrimaryActionBar } from "@/components/shared/primary-action-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  actionPanelClassName,
}: FormShellProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className={contentClassName}>
        <form className={cn("space-y-6", formClassName)} onSubmit={onSubmit} noValidate>
          <div className={cn("min-w-0 space-y-4", mainClassName)}>
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
          <PrimaryActionBar
            hint={requiredHint}
            className={cn(
              "border-[var(--border)] bg-[var(--surface-muted)]/60",
              actionPanelClassName,
            )}
          >
            {actions}
          </PrimaryActionBar>
        </form>
      </CardContent>
    </Card>
  );
}
