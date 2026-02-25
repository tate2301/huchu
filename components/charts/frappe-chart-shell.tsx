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
    <div className={cn("w-full rounded-md border border-border/60 bg-card/70 p-2", className)}>
      <div className={cn("h-[320px] w-full min-w-0", chartClassName)}>
        {children}
      </div>
    </div>
  );
}

