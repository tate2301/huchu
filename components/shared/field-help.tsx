import { cn } from "@/lib/utils";

type FieldHelpProps = {
  id?: string;
  hint?: string;
  error?: string;
  success?: string;
  className?: string;
};

export function FieldHelp({ id, hint, error, success, className }: FieldHelpProps) {
  if (!hint && !error && !success) {
    return null;
  }

  if (error) {
    return (
      <p id={id} className={cn("text-field-help text-[var(--status-error-text)]", className)} role="alert">
        {error}
      </p>
    );
  }

  if (success) {
    return (
      <p id={id} className={cn("text-field-help text-[var(--status-success-text)]", className)}>
        {success}
      </p>
    );
  }

  return <p id={id} className={cn("text-field-help text-muted-foreground", className)}>{hint}</p>;
}
