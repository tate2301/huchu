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
}: FormShellProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={contentClassName}>
        <form className={cn("space-y-4", formClassName)} onSubmit={onSubmit} noValidate>
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
          <PrimaryActionBar hint={requiredHint}>{actions}</PrimaryActionBar>
        </form>
      </CardContent>
    </Card>
  );
}
