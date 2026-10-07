import * as React from "react";

import { cn } from "@/lib/utils";

/** TextArea — padding 8 10, 14/1.45, `rows` × 22px tall at least, resizes vertically. */
export function TextArea({ rows = 3, className, style, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn("cx-textarea", className)}
      style={{ minHeight: rows * 22 + 18, ...style }}
      {...props}
    />
  );
}
