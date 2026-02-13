"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type NumericCellProps = {
  children: React.ReactNode;
  className?: string;
};

export function NumericCell({ children, className }: NumericCellProps) {
  return <span className={cn("font-mono", className)}>{children}</span>;
}
