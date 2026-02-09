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
        "sticky bottom-0 z-20 -mx-4 border-t bg-[var(--surface-overlay)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none",
        className
      )}
    >
      {hint ? <p className="mb-2 text-field-help text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
