import type { FormEvent, ReactNode } from "react";

import { PrimaryActionBar } from "@/components/shared/primary-action-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FormShellProps = {
  title?: string;
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
  /**
   * "page" wraps the form in a Card (default for full pages).
   * "bare" renders without the Card wrapper — use inside Sheet/Dialog so
   * the form doesn't look like a card-in-modal.
   */
  variant?: "page" | "bare";
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
  variant = "page",
}: FormShellProps) {
  const errorBlock = errors?.length ? (
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
  ) : null;

  if (variant === "bare") {
    return (
      <form
        className={cn("space-y-6", formClassName)}
        onSubmit={onSubmit}
        noValidate
      >
        {title || description ? (
          <header className="space-y-1">
            {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </header>
        ) : null}
        <div className={cn("min-w-0 space-y-4", mainClassName)}>
          {errorBlock}
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
    );
  }

  return (
    <Card className={className}>
      {title ? (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className={contentClassName}>
        <form
          className={cn("space-y-6", formClassName)}
          onSubmit={onSubmit}
          noValidate
        >
          <div className={cn("min-w-0 space-y-4", mainClassName)}>
            {errorBlock}
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
