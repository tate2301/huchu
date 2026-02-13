import * as React from "react";

import { cn } from "@/lib/utils";

type NumericCellProps = {
  className?: string;
  align?: "left" | "right";
  children: React.ReactNode;
};

export function NumericCell({
  className,
  align = "right",
  children,
}: NumericCellProps) {
  return (
    <span
      className={cn(
        "inline-block font-mono tabular-nums",
        align === "right" ? "w-full text-right" : "text-left",
        className,
      )}
    >
      {children}
    </span>
  );
}
