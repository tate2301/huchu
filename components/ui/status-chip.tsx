"use client";

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
        "inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-[var(--color-ink)]",
        className,
      )}
    >
      {showDot ? (
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: tokenVar(presentation.tokens.border) }}
          aria-hidden="true"
        />
      ) : null}
      <span className="truncate">{label ?? presentation.label}</span>
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
