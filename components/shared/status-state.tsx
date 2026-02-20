import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, SearchX } from "@/lib/icons";

import { cn } from "@/lib/utils";

type StatusStateVariant = "loading" | "empty" | "error" | "success";

type StatusStateProps = {
  variant: StatusStateVariant;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

const defaults: Record<StatusStateVariant, { title: string; description: string }> = {
  loading: {
    title: "Loading data",
    description: "Please wait while we fetch the latest information.",
  },
  empty: {
    title: "No records found",
    description: "No matching data yet. Start by creating your first record.",
  },
  error: {
    title: "Something went wrong",
    description: "We could not complete this request. Please try again.",
  },
  success: {
    title: "Done",
    description: "Your request completed successfully.",
  },
};

const variantClass: Record<StatusStateVariant, string> = {
  loading: "border-border bg-card",
  empty: "border-border bg-card",
  error: "border-[var(--status-error-border)] bg-[var(--status-error-bg)]",
  success: "border-[var(--status-success-border)] bg-[var(--status-success-bg)]",
};

export function StatusState({
  variant,
  title,
  description,
  action,
  className,
}: StatusStateProps) {
  const fallback = defaults[variant];
  const heading = title ?? fallback.title;
  const body = description ?? fallback.description;

  return (
    <section
      className={cn(
        "flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border p-5 text-center shadow-[var(--surface-frame-shadow)]",
        variantClass[variant],
        className
      )}
      role="status"
      aria-live="polite"
    >
      <StatusIcon variant={variant} />
      <div className="space-y-1">
        <h2 className="text-section-title text-foreground">{heading}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </section>
  );
}

function StatusIcon({ variant }: { variant: StatusStateVariant }) {
  if (variant === "loading") {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />;
  }
  if (variant === "empty") {
    return <SearchX className="h-5 w-5 text-muted-foreground" aria-hidden="true" />;
  }
  if (variant === "error") {
    return <AlertTriangle className="h-5 w-5 text-[var(--status-error-text)]" aria-hidden="true" />;
  }
  return <CheckCircle2 className="h-5 w-5 text-[var(--status-success-text)]" aria-hidden="true" />;
}
