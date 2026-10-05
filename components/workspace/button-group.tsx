import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * ButtonGroup — `cx-group`: joined buttons, only the ends rounded, borders
 * overlapping by 1px. Record actions, bulk actions, Sort/Group/Columns and the
 * pager use it. Give it an `aria-label` that says what the buttons are for.
 */
export function ButtonGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="group" className={cn("cx-group", className)} {...props} />;
}
