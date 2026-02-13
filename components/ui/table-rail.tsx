import * as React from "react";

import { cn } from "@/lib/utils";

type TableRailProps = React.ComponentProps<"div"> & {
  maxHeight?: string;
};

export function TableRail({
  className,
  maxHeight,
  style,
  children,
  ...props
}: TableRailProps) {
  return (
    <div
      className={cn("table-rail", className)}
      style={maxHeight ? { ...style, maxHeight } : style}
      {...props}
    >
      {children}
    </div>
  );
}

