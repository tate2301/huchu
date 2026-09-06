"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FrappeChartShellProps = {
  children: ReactNode;
  className?: string;
  chartClassName?: string;
};

export function FrappeChartShell({
  children,
  className,
  chartClassName,
}: FrappeChartShellProps) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-3 shadow-[var(--elevation-1)]",
        className,
      )}
    >
      <div className={cn("h-[320px] w-full min-h-[320px] min-w-0", chartClassName)}>
        {children}
      </div>
    </div>
  );
}
