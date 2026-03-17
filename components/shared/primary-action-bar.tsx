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
        "sticky bottom-3 z-20 rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--elevation-3)] supports-[backdrop-filter]:backdrop-blur sm:static sm:px-4 sm:py-4 sm:shadow-none sm:backdrop-blur-none",
        className
      )}
    >
      {hint ? <p className="mb-2 text-field-help text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-wrap items-center gap-2.5">{children}</div>
    </div>
  );
}
