import * as React from "react";

import { cn } from "@/lib/utils";
import {
  getUiStatusPresentation,
  type CanonicalUiStatus,
} from "@/lib/ui/status-map";

function tokenVar(token: string): string {
  return `var(--${token})`;
}

export interface StatusChipProps {
  status: string | CanonicalUiStatus | null | undefined;
  label?: string;
  showDot?: boolean;
  className?: string;
}

export function StatusChip({
  status,
  label,
  showDot = true,
  className,
}: StatusChipProps) {
  const presentation = getUiStatusPresentation(status);

  return (
    <span
      data-status={presentation.status}
      data-tone={presentation.tone}
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.01em]",
        className
      )}
      style={{
        color: tokenVar(presentation.tokens.text),
        backgroundColor: tokenVar(presentation.tokens.bg),
        borderColor: tokenVar(presentation.tokens.border),
      }}
    >
      {showDot ? (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: tokenVar(presentation.tokens.border) }}
          aria-hidden="true"
        />
      ) : null}
      <span>{label ?? presentation.label}</span>
    </span>
  );
}

export interface StatusDotProps {
  status: StatusChipProps["status"];
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  const presentation = getUiStatusPresentation(status);

  return (
    <span
      data-status={presentation.status}
      data-tone={presentation.tone}
      className={cn("inline-block h-2.5 w-2.5 rounded-full", className)}
      style={{ backgroundColor: tokenVar(presentation.tokens.border) }}
      aria-label={presentation.label}
    />
  );
}
