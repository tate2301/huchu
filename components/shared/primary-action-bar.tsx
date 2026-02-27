import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PrimaryActionBarProps = {
  children: ReactNode;
  hint?: string;
  className?: string;
};

export function PrimaryActionBar({ children, hint, className }: PrimaryActionBarProps) {
  return (
    <div
      className={cn(
        "sticky bottom-3 z-20 mx-3 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-overlay)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[var(--elevation-3)] supports-[backdrop-filter]:backdrop-blur sm:static sm:mx-0 sm:rounded-lg sm:bg-[var(--surface-base)] sm:px-3 sm:py-3 sm:shadow-none sm:backdrop-blur-none",
        className
      )}
    >
      {hint ? <p className="mb-2 text-field-help text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-wrap items-center gap-2.5">{children}</div>
    </div>
  );
}
