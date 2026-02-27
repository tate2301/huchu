import * as React from "react";

import { cn } from "@/lib/utils";
import {
  getUiStatusPresentation,
  type CanonicalUiStatus,
} from "@/lib/ui/status-map";

function tokenVar(token: string): string {
  return `var(--${token})`;
}

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: string | CanonicalUiStatus | null | undefined;
  label?: string;
  hideLabel?: boolean;
  dotClassName?: string;
}

function StatusDot({
  status,
  label,
  hideLabel = false,
  className,
  dotClassName,
  style,
  "aria-label": ariaLabel,
  ...props
}: StatusDotProps) {
  const presentation = getUiStatusPresentation(status);
  const resolvedLabel = label ?? presentation.label;

  return (
    <span
      data-slot="status-dot"
      data-status={presentation.status}
      data-tone={presentation.tone}
      aria-label={hideLabel ? (ariaLabel ?? resolvedLabel) : ariaLabel}
      className={cn("inline-flex items-center gap-1.5 text-sm font-medium", className)}
      style={{
        color: tokenVar(presentation.tokens.text),
        ...style,
      }}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", dotClassName)}
        style={{
          backgroundColor: tokenVar(presentation.tokens.border),
        }}
      />
      {!hideLabel ? <span>{resolvedLabel}</span> : null}
    </span>
  );
}

export { StatusDot };
